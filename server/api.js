import express from "express";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getPool, sql } from "./db.js";
import {
  clearM365Tokens,
  getLatestDeviceCodeSession,
  getM365Settings,
  getM365TokenState,
  getValidAccessToken,
  parseEmailList,
  pollDeviceCodeToken,
  sendMail,
  startDeviceCodeFlow,
  storeDeviceCodeSession,
  storeTokenResponse,
  updateM365Settings,
} from "./m365.js";

const ADMIN_LIST_CATEGORIES = new Set([
  "applicationVehicles",
  "countries",
  "brakeTypes",
  "brakeSizes",
  "brakePowerTypes",
  "brakeCertificates",
  "mainBodySectionTypes",
  "clientSealingRequests",
  "cupLogoOptions",
  "suspensions",
  "repeatabilityTypes",
  "expectedDeliveryOptions",
  "workingConditions",
  "usageTypes",
  "environments",
  "axleLocations",
  "articulationTypes",
  "configurationTypes",
]);

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const safeJson = (value) => {
  if (!value || typeof value !== "object") return null;
  return value;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const humanizeStatus = (status) =>
  String(status ?? "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const buildRequestLink = (baseUrl, requestId) => {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/requests/${encodeURIComponent(requestId)}`;
};

const buildDashboardLink = (baseUrl) => {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/dashboard`;
};

const buildPublicAssetLink = (baseUrl, assetPath) => {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const pathPart = String(assetPath ?? "").trim().replace(/^\/+/, "");
  if (!base || !pathPart) return "";
  return `${base}/${pathPart}`;
};

const resolveRecipientsForStatus = (settings, status) => {
  const sales = parseEmailList(settings.recipientsSales);
  const design = parseEmailList(settings.recipientsDesign);
  const costing = parseEmailList(settings.recipientsCosting);
  const admin = parseEmailList(settings.recipientsAdmin);

  if (settings.testMode) {
    // If test recipient is not provided, default to sender mailbox to prevent silent "no recipient" situations.
    return parseEmailList(settings.testEmail || settings.senderUpn);
  }

  const flowMap = settings.flowMap && typeof settings.flowMap === "object" ? settings.flowMap : null;
  const entry = flowMap ? flowMap[String(status ?? "")] : null;
  if (entry && typeof entry === "object") {
    const recipients = new Set();
    if (entry.sales) sales.forEach((v) => recipients.add(v));
    if (entry.design) design.forEach((v) => recipients.add(v));
    if (entry.costing) costing.forEach((v) => recipients.add(v));
    if (entry.admin) admin.forEach((v) => recipients.add(v));
    return Array.from(recipients);
  }

  switch (String(status ?? "")) {
    case "submitted":
    case "under_review":
      return [...design, ...admin];
    case "clarification_needed":
      return [...sales, ...admin];
    case "feasibility_confirmed":
    case "design_result":
      return [...costing, ...sales, ...admin];
    case "in_costing":
      return [...costing, ...admin];
    case "costing_complete":
      return [...sales, ...admin];
    case "sales_followup":
    case "gm_approval_pending":
    case "gm_approved":
    case "gm_rejected":
      return [...sales, ...admin];
    case "closed":
      return [...sales];
    default:
      return [...admin];
  }
};

const statusBadgeStyles = (status) => {
  const s = String(status ?? "");
  if (["clarification_needed", "gm_rejected"].includes(s)) {
    return { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" };
  }
  if (["gm_approved", "costing_complete", "feasibility_confirmed", "closed"].includes(s)) {
    return { bg: "#DCFCE7", text: "#166534", border: "#86EFAC" };
  }
  if (["submitted", "under_review", "in_costing", "gm_approval_pending", "sales_followup"].includes(s)) {
    return { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" };
  }
  return { bg: "#E5E7EB", text: "#374151", border: "#D1D5DB" };
};

const DEFAULT_EMAIL_TEMPLATES = {
  request_created: {
    subject: "[CRA] Request {{requestId}} submitted",
    title: "New Request Submitted",
    intro: "A new CRA request has been submitted.",
    primaryButtonText: "Open request",
    secondaryButtonText: "Open dashboard",
    footerText: "You received this email because you are subscribed to CRA request notifications.",
  },
  request_status_changed: {
    subject: "[CRA] Request {{requestId}} status changed to {{status}}",
    title: "Request Update",
    intro: "A CRA request status has been updated.",
    primaryButtonText: "Open request",
    secondaryButtonText: "Open dashboard",
    footerText: "You received this email because you are subscribed to CRA request notifications.",
  },
};

const getTemplateForEvent = (settings, eventType) => {
  const raw = settings?.templates && typeof settings.templates === "object" ? settings.templates : null;
  const merged = {
    ...(DEFAULT_EMAIL_TEMPLATES[eventType] ?? DEFAULT_EMAIL_TEMPLATES.request_status_changed),
    ...(raw?.[eventType] ?? {}),
  };
  return merged;
};

const applyTemplateVars = (template, vars) => {
  let out = String(template ?? "");
  for (const [k, v] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{{${k}}}`, String(v ?? ""));
  }
  return out;
};

const formatIsoUtc = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
};

const renderStatusEmailHtml = ({ request, newStatus, actorName, comment, link, dashboardLink, logoUrl, template, introOverride }) => {
  const safeComment = String(comment ?? "").trim();
  const client = String(request?.clientName ?? "").trim();
  const contact = String(request?.clientContact ?? "").trim();
  const country = String(request?.country ?? "").trim();
  const appVehicle = String(request?.applicationVehicle ?? "").trim();
  const expectedQty = request?.expectedQty ?? null;
  const expectedDeliveryDate = String(request?.clientExpectedDeliveryDate ?? "").trim();

  const rid = String(request?.id ?? "").trim();
  const actor = String(actorName ?? "").trim();
  const status = String(newStatus ?? "").trim();
  const statusLabel = humanizeStatus(status) || status || "Updated";
  const updatedAt = formatIsoUtc(request?.updatedAt ?? request?.createdAt);
  const titleText = String(template?.title ?? "Request Update").trim() || "Request Update";
  const introText = String(introOverride ?? template?.intro ?? "").trim();
  const primaryText = String(template?.primaryButtonText ?? "Open request").trim() || "Open request";
  const secondaryText = String(template?.secondaryButtonText ?? "Open dashboard").trim() || "Open dashboard";
  const footerText = String(template?.footerText ?? "").trim();

  const badge = statusBadgeStyles(status);
  const openRequestHref = link ? escapeHtml(link) : "";
  const openDashboardHref = dashboardLink ? escapeHtml(dashboardLink) : "";
  const logoImg = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="120" alt="MONROC" style="display:block; border:0; outline:none; text-decoration:none; height:auto;" />`
    : `<div style="font-weight:800; letter-spacing:0.5px; color:#111827;">MONROC</div>`;

  const commentHtml = safeComment
    ? `
      <tr>
        <td style="padding:16px 24px 0 24px;">
          <div style="font-size:12px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">Comment</div>
          <div style="margin-top:6px; font-size:14px; color:#111827; white-space:pre-wrap;">${escapeHtml(safeComment)}</div>
        </td>
      </tr>
    `.trim()
    : "";

  const kvRow = (label, value) => {
    const v = String(value ?? "").trim();
    if (!v) return "";
    return `
      <tr>
        <td style="padding:6px 0; font-size:12px; color:#6B7280; width:160px; vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:6px 0; font-size:14px; color:#111827; vertical-align:top;">${escapeHtml(v)}</td>
      </tr>
    `.trim();
  };

  const qtyText = typeof expectedQty === "number" ? String(expectedQty) : "";

  return `
  <div style="margin:0; padding:0; background:#F6F8FB;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F6F8FB; width:100%;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px; max-width:640px;">
            <tr>
              <td style="padding:0 0 12px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="left" style="vertical-align:middle;">${logoImg}</td>
                    <td align="right" style="vertical-align:middle;">
                      <div style="font-family: Arial, sans-serif; font-size:12px; color:#6B7280;">CRA Notification</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; overflow:hidden; font-family: Arial, sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:20px 24px 10px 24px;">
                      <div style="font-size:18px; font-weight:700; color:#111827;">${escapeHtml(titleText)}</div>
                      ${introText ? `<div style="margin-top:6px; font-size:13px; color:#374151;">${escapeHtml(introText)}</div>` : ""}
                      <div style="margin-top:6px;">
                        <span style="display:inline-block; padding:6px 10px; border-radius:999px; background:${badge.bg}; color:${badge.text}; border:1px solid ${badge.border}; font-size:12px; font-weight:700;">
                          ${escapeHtml(statusLabel)}
                        </span>
                        ${updatedAt ? `<span style="margin-left:10px; font-size:12px; color:#6B7280;">${escapeHtml(updatedAt)}</span>` : ""}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:0 24px 6px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #E5E7EB;">
                        <tr><td style="height:10px; line-height:10px;">&nbsp;</td></tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:0 24px 0 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${kvRow("Request ID", rid)}
                        ${kvRow("Client", client)}
                        ${kvRow("Contact", contact)}
                        ${kvRow("Country", country)}
                        ${kvRow("Application Vehicle", appVehicle)}
                        ${kvRow("Expected Qty", qtyText)}
                        ${kvRow("Expected Delivery Date", expectedDeliveryDate)}
                        ${actor ? kvRow("Changed by", actor) : ""}
                      </table>
                    </td>
                  </tr>

                  ${commentHtml}

                  <tr>
                    <td style="padding:20px 24px 24px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding-right:10px;">
                            <a href="${openRequestHref}" style="display:inline-block; background:#D71920; color:#FFFFFF; text-decoration:none; padding:12px 16px; border-radius:8px; font-weight:700; font-size:14px;">
                              ${escapeHtml(primaryText)}
                            </a>
                          </td>
                          <td>
                            <a href="${openDashboardHref}" style="display:inline-block; background:#FFFFFF; color:#111827; text-decoration:none; padding:12px 16px; border-radius:8px; border:1px solid #E5E7EB; font-weight:700; font-size:14px;">
                              ${escapeHtml(secondaryText)}
                            </a>
                          </td>
                        </tr>
                      </table>

                      ${openRequestHref ? `<div style="margin-top:14px; font-size:12px; color:#6B7280;">If the button doesn't work, use this link: <span style="word-break:break-all;">${openRequestHref}</span></div>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 6px 0 6px; text-align:center; font-family: Arial, sans-serif; font-size:11px; color:#6B7280;">
                ${escapeHtml(footerText || "You received this email because you are subscribed to CRA request notifications.")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `.trim();
};

const normalizeProduct = (product) => ({
  ...product,
  axleLocation: product?.axleLocation ?? "",
  axleLocationOther: product?.axleLocationOther ?? "",
  articulationType: product?.articulationType ?? "",
  articulationTypeOther: product?.articulationTypeOther ?? "",
  configurationType: product?.configurationType ?? "",
  configurationTypeOther: product?.configurationTypeOther ?? "",
  quantity: typeof product?.quantity === "number" ? product.quantity : null,
  loadsKg: product?.loadsKg ?? null,
  speedsKmh: product?.speedsKmh ?? null,
  tyreSize: product?.tyreSize ?? "",
  trackMm: product?.trackMm ?? null,
  studsPcdMode: product?.studsPcdMode ?? "standard",
  studsPcdStandardSelections: Array.isArray(product?.studsPcdStandardSelections)
    ? product.studsPcdStandardSelections
    : [],
  studsPcdSpecialText: product?.studsPcdSpecialText ?? "",
  wheelBase: product?.wheelBase ?? "",
  finish: product?.finish ?? "Black Primer default",
  brakeType: product?.brakeType ?? null,
  brakeSize: product?.brakeSize ?? "",
  brakePowerType: product?.brakePowerType ?? "",
  brakeCertificate: product?.brakeCertificate ?? "",
  mainBodySectionType: product?.mainBodySectionType ?? "",
  clientSealingRequest: product?.clientSealingRequest ?? "",
  cupLogo: product?.cupLogo ?? "",
  suspension: product?.suspension ?? "",
  productComments: typeof product?.productComments === "string" ? product.productComments : product?.otherRequirements ?? "",
  attachments: Array.isArray(product?.attachments) ? product.attachments : [],
});

const buildLegacyProduct = (data, attachments) =>
  normalizeProduct({
    axleLocation: data?.axleLocation,
    axleLocationOther: data?.axleLocationOther,
    articulationType: data?.articulationType,
    articulationTypeOther: data?.articulationTypeOther,
    configurationType: data?.configurationType,
    configurationTypeOther: data?.configurationTypeOther,
    quantity: typeof data?.expectedQty === "number" ? data.expectedQty : null,
    loadsKg: data?.loadsKg,
    speedsKmh: data?.speedsKmh,
    tyreSize: data?.tyreSize,
    trackMm: data?.trackMm,
    studsPcdMode: data?.studsPcdMode,
    studsPcdStandardSelections: data?.studsPcdStandardSelections,
    studsPcdSpecialText: data?.studsPcdSpecialText,
    wheelBase: data?.wheelBase,
    finish: data?.finish,
    brakeType: data?.brakeType,
    brakeSize: data?.brakeSize,
    brakePowerType: data?.brakePowerType,
    brakeCertificate: data?.brakeCertificate,
    mainBodySectionType: data?.mainBodySectionType,
    clientSealingRequest: data?.clientSealingRequest,
    cupLogo: data?.cupLogo,
    suspension: data?.suspension,
    productComments: data?.productComments ?? data?.otherRequirements,
    attachments,
  });

const LEGACY_PRODUCT_FIELDS = new Set([
  "axleLocation",
  "axleLocationOther",
  "articulationType",
  "articulationTypeOther",
  "configurationType",
  "configurationTypeOther",
  "quantity",
  "loadsKg",
  "speedsKmh",
  "tyreSize",
  "trackMm",
  "studsPcdMode",
  "studsPcdStandardSelections",
  "studsPcdSpecialText",
  "wheelBase",
  "finish",
  "brakeType",
  "brakeSize",
  "brakePowerType",
  "brakeCertificate",
  "mainBodySectionType",
  "clientSealingRequest",
  "cupLogo",
  "suspension",
  "otherRequirements",
  "productComments",
  "attachments",
]);

const hasLegacyProductUpdates = (payload) => {
  if (!payload || typeof payload !== "object") return false;
  return Object.keys(payload).some((key) => LEGACY_PRODUCT_FIELDS.has(key));
};

const syncLegacyFromProduct = (target, product) => ({
  ...target,
  axleLocation: product?.axleLocation,
  axleLocationOther: product?.axleLocationOther,
  articulationType: product?.articulationType,
  articulationTypeOther: product?.articulationTypeOther,
  configurationType: product?.configurationType,
  configurationTypeOther: product?.configurationTypeOther,
  expectedQty: typeof product?.quantity === "number" ? product.quantity : target?.expectedQty ?? null,
  loadsKg: product?.loadsKg ?? null,
  speedsKmh: product?.speedsKmh ?? null,
  tyreSize: product?.tyreSize ?? "",
  trackMm: product?.trackMm ?? null,
  studsPcdMode: product?.studsPcdMode ?? "standard",
  studsPcdStandardSelections: Array.isArray(product?.studsPcdStandardSelections)
    ? product.studsPcdStandardSelections
    : [],
  studsPcdSpecialText: product?.studsPcdSpecialText ?? "",
  wheelBase: product?.wheelBase ?? "",
  finish: product?.finish ?? "Black Primer default",
  brakeType: product?.brakeType ?? null,
  brakeSize: product?.brakeSize ?? "",
  brakePowerType: product?.brakePowerType ?? "",
  brakeCertificate: product?.brakeCertificate ?? "",
  mainBodySectionType: product?.mainBodySectionType ?? "",
  clientSealingRequest: product?.clientSealingRequest ?? "",
  cupLogo: product?.cupLogo ?? "",
  suspension: product?.suspension ?? "",
  otherRequirements: typeof product?.productComments === "string" ? product.productComments : target?.otherRequirements,
  attachments: Array.isArray(product?.attachments) ? product.attachments : [],
});

const normalizeRequestData = (data, nowIso) => {
  const history = Array.isArray(data.history) ? data.history : [];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  const designResultAttachments = Array.isArray(data.designResultAttachments)
    ? data.designResultAttachments
    : [];
  const costingAttachments = Array.isArray(data.costingAttachments)
    ? data.costingAttachments
    : [];
  const salesAttachments = Array.isArray(data.salesAttachments)
    ? data.salesAttachments
    : [];
  const productsPayload = Array.isArray(data.products) ? data.products : [];
  const products = productsPayload.length
    ? productsPayload.map(normalizeProduct)
    : [buildLegacyProduct(data, attachments)];

  return {
    ...data,
    history,
    attachments,
    designResultComments: typeof data.designResultComments === "string" ? data.designResultComments : "",
    designResultAttachments,
    city: typeof data.city === "string" ? data.city : "",
    incoterm: typeof data.incoterm === "string" ? data.incoterm : "",
    incotermOther: typeof data.incotermOther === "string" ? data.incotermOther : "",
    sellingCurrency: typeof data.sellingCurrency === "string" ? data.sellingCurrency : "EUR",
    vatMode: data.vatMode === "with" ? "with" : "without",
    vatRate: typeof data.vatRate === "number" ? data.vatRate : null,
    deliveryLeadtime: typeof data.deliveryLeadtime === "string" ? data.deliveryLeadtime : "",
    costingAttachments,
    salesFinalPrice: typeof data.salesFinalPrice === "number" ? data.salesFinalPrice : null,
    salesCurrency: typeof data.salesCurrency === "string" ? data.salesCurrency : "EUR",
    salesIncoterm: typeof data.salesIncoterm === "string" ? data.salesIncoterm : "",
    salesIncotermOther: typeof data.salesIncotermOther === "string" ? data.salesIncotermOther : "",
    salesVatMode: data.salesVatMode === "with" ? "with" : "without",
    salesVatRate: typeof data.salesVatRate === "number" ? data.salesVatRate : null,
    salesFeedbackComment: typeof data.salesFeedbackComment === "string" ? data.salesFeedbackComment : "",
    salesAttachments,
    products,
    clientExpectedDeliveryDate: typeof data.clientExpectedDeliveryDate === "string" ? data.clientExpectedDeliveryDate : "",
    createdAt: data.createdAt ?? nowIso,
    updatedAt: data.updatedAt ?? nowIso,
  };
};

const safeParseRequest = (value, context) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("Failed to parse request data", context ?? "", error);
    return null;
  }
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getClientKey = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return `ip:${forwarded.split(",")[0].trim()}`;
  }
  const ip = req.socket.remoteAddress ?? "unknown";
  return `ip:${ip}`;
};

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_LOG_LINES = 200;
const MAX_LOG_LINES = 1000;
const LOG_PATH = path.join(REPO_ROOT, "deploy", "logs", "auto-deploy.log");

const clampLineCount = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_LOG_LINES;
  }
  return Math.min(Math.max(parsed, 50), MAX_LOG_LINES);
};

const readLogTail = async (filePath, maxLines) => {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const { size } = await handle.stat();
      if (!size) {
        return "";
      }
      const bytesToRead = Math.min(size, 256 * 1024);
      const buffer = Buffer.alloc(bytesToRead);
      await handle.read(buffer, 0, bytesToRead, size - bytesToRead);
      const text = buffer.toString("utf8");
      const lines = text.split(/\r?\n/);
      return lines.slice(-maxLines).join("\n").trimEnd();
    } finally {
      await handle.close();
    }
  } catch (error) {
    return null;
  }
};

const getGitInfo = async () => {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      REPO_ROOT,
      "log",
      "-1",
      "--pretty=format:%H%n%s%n%an%n%ad",
      "--date=iso-strict",
    ]);
    const [hash, message, author, date] = stdout.trim().split("\n");
    return { hash, message, author, date };
  } catch (error) {
    return null;
  }
};

const checkRateLimit = async (pool, req) => {
  const windowMs = 60_000;
  const limit = 60;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const key = `${getClientKey(req)}:${windowStartMs}`;

  // Atomic upsert to avoid race conditions (duplicate key errors) under concurrent requests.
  const result = await pool
    .request()
    .input("key", sql.NVarChar(200), key)
    .input("window_start", sql.DateTime2, windowStart)
    .query(`
      MERGE rate_limits WITH (HOLDLOCK) AS target
      USING (SELECT @key AS [key], @window_start AS window_start) AS source
        ON target.[key] = source.[key]
      WHEN MATCHED THEN
        UPDATE SET [count] = target.[count] + 1
      WHEN NOT MATCHED THEN
        INSERT ([key], window_start, [count])
        VALUES (source.[key], source.window_start, 1)
      OUTPUT inserted.[count] AS [count];
    `);

  const newCount = Number(result.recordset?.[0]?.count ?? 0);
  if (newCount > limit) {
    return windowStartMs + windowMs;
  }
  return null;
};

const generateRequestId = async (pool) => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStamp = `${year}${month}${day}`;
  const counterName = `request_${dateStamp}`;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("name", sql.NVarChar(64), counterName)
      .query(
        "IF NOT EXISTS (SELECT 1 FROM counters WHERE name = @name) INSERT INTO counters (name, value) VALUES (@name, 0);"
      );

    const result = await new sql.Request(transaction)
      .input("name", sql.NVarChar(64), counterName)
      .query("UPDATE counters SET value = value + 1 OUTPUT inserted.value WHERE name = @name;");

    await transaction.commit();

    const value = result.recordset[0]?.value;
    if (!value) {
      throw new Error("Failed to generate request id");
    }
    return `CRA${dateStamp}${String(value).padStart(2, "0")}`;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getRequestById = async (pool, id) => {
  const row = await pool
    .request()
    .input("id", sql.NVarChar(64), id)
    .query("SELECT id, data FROM requests WHERE id = @id");

  const data = row.recordset[0]?.data;
  const rowId = row.recordset[0]?.id ?? id;
  return safeParseRequest(data, { id: rowId });
};

const requestSummarySelect =
  "SELECT id, status, created_at, updated_at, JSON_VALUE(data, '$.clientName') as clientName, " +
  "JSON_VALUE(data, '$.applicationVehicle') as applicationVehicle, " +
  "JSON_VALUE(data, '$.country') as country, " +
  "JSON_VALUE(data, '$.createdBy') as createdBy, " +
  "JSON_VALUE(data, '$.createdByName') as createdByName " +
  "FROM requests ORDER BY updated_at DESC";

const fetchAdminLists = async (pool) => {
  const { recordset } = await pool
    .request()
    .query("SELECT id, category, value FROM admin_list_items ORDER BY category, sort_order, value");

  const lists = {};
  for (const category of ADMIN_LIST_CATEGORIES) {
    lists[category] = [];
  }

  for (const row of recordset) {
    if (!lists[row.category]) {
      lists[row.category] = [];
    }
    lists[row.category].push({ id: row.id, value: row.value });
  }

  return lists;
};

export const apiRouter = (() => {
  const router = express.Router();

  router.use(
    asyncHandler(async (req, res, next) => {
      const pool = await getPool();
      const retryAt = await checkRateLimit(pool, req);
      if (retryAt) {
        res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((retryAt - Date.now()) / 1000),
        });
        return;
      }
      next();
    })
  );

  router.get(
    "/admin/lists",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const lists = await fetchAdminLists(pool);
      res.json(lists);
    })
  );

  router.get(
    "/admin/lists/:category",
    asyncHandler(async (req, res) => {
      const { category } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const pool = await getPool();
      const { recordset } = await pool
        .request()
        .input("category", sql.NVarChar(64), category)
        .query(
          "SELECT id, value FROM admin_list_items WHERE category = @category ORDER BY sort_order, value"
        );

      res.json(recordset.map((row) => ({ id: row.id, value: row.value })));
    })
  );

  router.get(
    "/admin/deploy-info",
    asyncHandler(async (req, res) => {
      const lines = clampLineCount(req.query.lines);
      const [gitInfo, logContent] = await Promise.all([
        getGitInfo(),
        readLogTail(LOG_PATH, lines),
      ]);

      res.json({
        git: gitInfo ?? { hash: "", message: "", author: "", date: "" },
        log: {
          lines,
          content: logContent ?? "",
          available: logContent !== null,
        },
      });
    })
  );

  router.get(
    "/admin/m365",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const [settings, tokenState, latestDc] = await Promise.all([
        getM365Settings(pool),
        getM365TokenState(pool),
        getLatestDeviceCodeSession(pool),
      ]);
        res.json({
          settings,
          connection: {
            hasRefreshToken: tokenState.hasRefreshToken,
            expiresAt: tokenState.expiresAt,
          },
        deviceCode: latestDc
          ? {
              userCode: latestDc.userCode,
              verificationUri: latestDc.verificationUri,
              verificationUriComplete: latestDc.verificationUriComplete,
              message: latestDc.message,
              expiresAt: latestDc.expiresAt,
              status: latestDc.status,
              createdAt: latestDc.createdAt,
            }
          : null,
      });
    })
  );

  router.post(
    "/admin/m365/preview",
    asyncHandler(async (req, res) => {
      const body = safeJson(req.body) ?? {};
      const eventType = String(body.eventType ?? "request_status_changed").trim();
      const status = String(body.status ?? "submitted").trim();
      const requestId = String(body.requestId ?? "").trim();

      const pool = await getPool();
      const settings = await getM365Settings(pool);

      let request = null;
      if (requestId) {
        request = await getRequestById(pool, requestId);
      }
      if (!request) {
        const nowIso = new Date().toISOString();
        request = normalizeRequestData(
          {
            id: requestId || "CRA00000000",
            status,
            clientName: "Example Client",
            clientContact: "John Doe",
            country: "Example Country",
            applicationVehicle: "Example Vehicle",
            expectedQty: 100,
            clientExpectedDeliveryDate: "2026-03-01",
            createdAt: nowIso,
            updatedAt: nowIso,
            history: [],
          },
          nowIso
        );
      }

      const template = getTemplateForEvent(settings, eventType);
      const vars = {
        requestId: request.id,
        status,
      };
      const subject = applyTemplateVars(template.subject, vars);

      const link = buildRequestLink(settings.appBaseUrl, request.id);
      const html = renderStatusEmailHtml({
        request,
        newStatus: status,
        actorName: "System",
        comment: "Example comment (optional).",
        link,
        dashboardLink: buildDashboardLink(settings.appBaseUrl),
        logoUrl: buildPublicAssetLink(settings.appBaseUrl, "monroc-logo.png"),
        template,
      });

      res.json({ subject, html });
    })
  );

  router.put(
    "/admin/m365",
    asyncHandler(async (req, res) => {
      const body = safeJson(req.body) ?? {};
      const pool = await getPool();
      try {
        await updateM365Settings(pool, body);
      } catch (error) {
        console.error("Failed to update M365 settings:", error);
        res.status(500).json({ error: String(error?.message ?? error) });
        return;
      }
      const settings = await getM365Settings(pool);
      res.json({ settings });
    })
  );

  router.post(
    "/admin/m365/device-code",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const settings = await getM365Settings(pool);
      if (!settings.clientId) {
        res.status(400).json({ error: "Missing clientId" });
        return;
      }
      if (!settings.tenantId) {
        res.status(400).json({ error: "Missing tenantId" });
        return;
      }

      const scope = "offline_access Mail.Send";
      const dc = await startDeviceCodeFlow({
        tenantId: settings.tenantId,
        clientId: settings.clientId,
        scope,
      });
      await storeDeviceCodeSession(pool, dc);
      res.json({
        userCode: dc.user_code,
        verificationUri: dc.verification_uri,
        verificationUriComplete: dc.verification_uri_complete,
        message: dc.message,
        intervalSeconds: dc.interval,
        expiresIn: dc.expires_in,
      });
    })
  );

  router.post(
    "/admin/m365/poll",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const settings = await getM365Settings(pool);
      if (!settings.clientId || !settings.tenantId) {
        res.status(400).json({ error: "Missing clientId/tenantId" });
        return;
      }

      const latest = await getLatestDeviceCodeSession(pool);
      if (!latest) {
        res.status(400).json({ error: "No device code session" });
        return;
      }

      const result = await pollDeviceCodeToken({
        tenantId: settings.tenantId,
        clientId: settings.clientId,
        deviceCode: latest.deviceCode,
      });

      if (result.ok) {
        await storeTokenResponse(pool, result.json);
        res.json({ status: "connected" });
        return;
      }

      const err = result.json?.error;
      if (err === "authorization_pending") {
        res.json({ status: "pending" });
        return;
      }
      if (err === "slow_down") {
        res.json({ status: "slow_down" });
        return;
      }
      if (err === "expired_token") {
        res.json({ status: "expired" });
        return;
      }

      res.status(400).json({ status: "error", error: result.json });
    })
  );

  router.post(
    "/admin/m365/disconnect",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      await clearM365Tokens(pool);
      res.json({ ok: true });
    })
  );

  router.post(
    "/admin/m365/test-email",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const settings = await getM365Settings(pool);
      const body = safeJson(req.body) ?? {};
      const to = parseEmailList(body.toEmail);
      if (!to.length) {
        res.status(400).json({ error: "Missing toEmail" });
        return;
      }
      const accessToken = await getValidAccessToken(pool);
      const subject = `[CRA] Test email`;
      const html = `<div style="font-family: Arial, sans-serif; font-size: 14px;"><p>Test email from CRA app.</p></div>`;
      await sendMail({ accessToken, subject, bodyHtml: html, toEmails: to });
      res.json({ ok: true });
    })
  );

  router.post(
    "/admin/lists/:category",
    asyncHandler(async (req, res) => {
      const { category } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const value = String(req.body?.value ?? "").trim();
      if (!value) {
        res.status(400).json({ error: "Missing value" });
        return;
      }

      const pool = await getPool();
      const sortRow = await pool
        .request()
        .input("category", sql.NVarChar(64), category)
        .query("SELECT ISNULL(MAX(sort_order), 0) + 1 as next FROM admin_list_items WHERE category = @category");
      const sortOrder = sortRow.recordset[0]?.next ?? 1;

      const id = randomUUID();
      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("category", sql.NVarChar(64), category)
        .input("value", sql.NVarChar(255), value)
        .input("sort_order", sql.Int, sortOrder)
        .query(
          "INSERT INTO admin_list_items (id, category, value, sort_order) VALUES (@id, @category, @value, @sort_order)"
        );

      res.status(201).json({ id, value });
    })
  );

  // Update the ordering for a list category (global, persisted).
  // Accepts { orderedIds: string[] } and normalizes against current DB state.
  // Route must be defined before "/admin/lists/:category/:itemId" to avoid collisions.
  router.put(
    "/admin/lists/:category/reorder",
    asyncHandler(async (req, res) => {
      const { category } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const rawIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
      const orderedIds = [];
      const seen = new Set();
      for (const v of rawIds) {
        const id = String(v ?? "").trim();
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        orderedIds.push(id);
      }

      if (!orderedIds.length) {
        res.status(400).json({ error: "Missing orderedIds" });
        return;
      }

      const pool = await getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const existing = await new sql.Request(transaction)
          .input("category", sql.NVarChar(64), category)
          .query(
            "SELECT id FROM admin_list_items WHERE category = @category ORDER BY sort_order, value"
          );

        const existingIds = existing.recordset.map((r) => r.id);
        const existingSet = new Set(existingIds);

        // Keep only ids that currently exist for the category, then append any ids
        // not provided by the client (e.g. if another admin added items concurrently).
        const finalIds = [];
        const finalSet = new Set();
        for (const id of orderedIds) {
          if (!existingSet.has(id)) continue;
          finalIds.push(id);
          finalSet.add(id);
        }
        for (const id of existingIds) {
          if (finalSet.has(id)) continue;
          finalIds.push(id);
          finalSet.add(id);
        }

        for (let i = 0; i < finalIds.length; i++) {
          await new sql.Request(transaction)
            .input("id", sql.NVarChar(64), finalIds[i])
            .input("category", sql.NVarChar(64), category)
            .input("sort_order", sql.Int, i + 1)
            .query(
              "UPDATE admin_list_items SET sort_order = @sort_order WHERE id = @id AND category = @category"
            );
        }

        await transaction.commit();
        res.json({ ok: true });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    })
  );

  router.put(
    "/admin/lists/:category/:itemId",
    asyncHandler(async (req, res) => {
      const { category, itemId } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const value = String(req.body?.value ?? "").trim();
      if (!value) {
        res.status(400).json({ error: "Missing value" });
        return;
      }

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .input("category", sql.NVarChar(64), category)
        .input("value", sql.NVarChar(255), value)
        .query("UPDATE admin_list_items SET value = @value WHERE id = @id AND category = @category");

      res.json({ id: itemId, value });
    })
  );

  router.delete(
    "/admin/lists/:category/:itemId",
    asyncHandler(async (req, res) => {
      const { category, itemId } = req.params;
      if (!ADMIN_LIST_CATEGORIES.has(category)) {
        res.status(404).json({ error: "Unknown list category" });
        return;
      }

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .input("category", sql.NVarChar(64), category)
        .query("DELETE FROM admin_list_items WHERE id = @id AND category = @category");

      res.status(204).send();
    })
  );

  router.get(
    "/feedback",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool.request().query(
        "SELECT id, type, title, description, steps, severity, page_path, user_name, user_email, user_role, created_at FROM feedback ORDER BY created_at DESC"
      );

      const data = recordset.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        steps: row.steps ?? "",
        severity: row.severity ?? "",
        pagePath: row.page_path ?? "",
        userName: row.user_name ?? "",
        userEmail: row.user_email ?? "",
        userRole: row.user_role ?? "",
        createdAt: row.created_at,
      }));

      res.json(data);
    })
  );

  router.post(
    "/feedback",
    asyncHandler(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const type = String(body.type ?? "").trim();
      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();
      const steps = String(body.steps ?? "").trim();
      const severity = String(body.severity ?? "").trim();
      const pagePath = String(body.pagePath ?? "").trim();
      const userName = String(body.userName ?? "").trim();
      const userEmail = String(body.userEmail ?? "").trim();
      const userRole = String(body.userRole ?? "").trim();

      if (!type || !title || !description) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const id = randomUUID();
      const nowIso = new Date().toISOString();

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("type", sql.NVarChar(50), type)
        .input("title", sql.NVarChar(255), title)
        .input("description", sql.NVarChar(sql.MAX), description)
        .input("steps", sql.NVarChar(sql.MAX), steps || null)
        .input("severity", sql.NVarChar(50), severity || null)
        .input("page_path", sql.NVarChar(255), pagePath || null)
        .input("user_name", sql.NVarChar(255), userName || null)
        .input("user_email", sql.NVarChar(255), userEmail || null)
        .input("user_role", sql.NVarChar(255), userRole || null)
        .input("created_at", sql.DateTime2, new Date(nowIso))
        .query(
          "INSERT INTO feedback (id, type, title, description, steps, severity, page_path, user_name, user_email, user_role, created_at) VALUES (@id, @type, @title, @description, @steps, @severity, @page_path, @user_name, @user_email, @user_role, @created_at)"
        );

      res.status(201).json({
        id,
        type,
        title,
        description,
        steps,
        severity,
        pagePath,
        userName,
        userEmail,
        userRole,
        createdAt: nowIso,
      });
    })
  );

  router.get(
    "/price-list",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool.request().query(
        "SELECT id, configuration_type, articulation_type, brake_type, brake_size, studs_pcd_standards, created_at, updated_at FROM reference_products ORDER BY updated_at DESC"
      );

      const data = recordset.map((row) => ({
        id: row.id,
        configurationType: row.configuration_type ?? "",
        articulationType: row.articulation_type ?? "",
        brakeType: row.brake_type ?? "",
        brakeSize: row.brake_size ?? "",
        studsPcdStandards: parseJsonArray(row.studs_pcd_standards),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(data);
    })
  );

  router.post(
    "/price-list",
    asyncHandler(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const nowIso = new Date().toISOString();
      const id = randomUUID();
      const studs = Array.isArray(body.studsPcdStandards) ? body.studsPcdStandards : [];

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("configuration_type", sql.NVarChar(255), body.configurationType ?? "")
        .input("articulation_type", sql.NVarChar(255), body.articulationType ?? "")
        .input("brake_type", sql.NVarChar(255), body.brakeType ?? "")
        .input("brake_size", sql.NVarChar(255), body.brakeSize ?? "")
        .input("studs_pcd_standards", sql.NVarChar(sql.MAX), JSON.stringify(studs))
        .input("created_at", sql.DateTime2, new Date(nowIso))
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query(
          "INSERT INTO reference_products (id, configuration_type, articulation_type, brake_type, brake_size, studs_pcd_standards, created_at, updated_at) VALUES (@id, @configuration_type, @articulation_type, @brake_type, @brake_size, @studs_pcd_standards, @created_at, @updated_at)"
        );

      res.status(201).json({
        id,
        configurationType: body.configurationType ?? "",
        articulationType: body.articulationType ?? "",
        brakeType: body.brakeType ?? "",
        brakeSize: body.brakeSize ?? "",
        studsPcdStandards: studs,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    })
  );

  router.put(
    "/price-list/:itemId",
    asyncHandler(async (req, res) => {
      const { itemId } = req.params;
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const nowIso = new Date().toISOString();
      const studs = Array.isArray(body.studsPcdStandards) ? body.studsPcdStandards : [];

      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .input("configuration_type", sql.NVarChar(255), body.configurationType ?? "")
        .input("articulation_type", sql.NVarChar(255), body.articulationType ?? "")
        .input("brake_type", sql.NVarChar(255), body.brakeType ?? "")
        .input("brake_size", sql.NVarChar(255), body.brakeSize ?? "")
        .input("studs_pcd_standards", sql.NVarChar(sql.MAX), JSON.stringify(studs))
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query(
          "UPDATE reference_products SET configuration_type = @configuration_type, articulation_type = @articulation_type, brake_type = @brake_type, brake_size = @brake_size, studs_pcd_standards = @studs_pcd_standards, updated_at = @updated_at WHERE id = @id"
        );

      res.json({
        id: itemId,
        configurationType: body.configurationType ?? "",
        articulationType: body.articulationType ?? "",
        brakeType: body.brakeType ?? "",
        brakeSize: body.brakeSize ?? "",
        studsPcdStandards: studs,
        updatedAt: nowIso,
      });
    })
  );

  router.delete(
    "/price-list/:itemId",
    asyncHandler(async (req, res) => {
      const { itemId } = req.params;
      const pool = await getPool();
      await pool
        .request()
        .input("id", sql.NVarChar(64), itemId)
        .query("DELETE FROM reference_products WHERE id = @id");

      res.status(204).send();
    })
  );

  router.get(
    "/requests",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool
        .request()
        .query("SELECT id, data FROM requests ORDER BY updated_at DESC");

      const parsed = recordset
        .map((row) => safeParseRequest(row.data, { id: row.id }))
        .filter(Boolean);
      res.json(parsed);
    })
  );

  // Lightweight list endpoint for dashboards: avoids shipping attachments/base64 blobs.
  router.get(
    "/requests/summary",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { recordset } = await pool.request().query(requestSummarySelect);
      res.json(
        recordset.map((row) => ({
          id: row.id,
          status: row.status,
          clientName: row.clientName ?? "",
          applicationVehicle: row.applicationVehicle ?? "",
          country: row.country ?? "",
          createdBy: row.createdBy ?? "",
          createdByName: row.createdByName ?? "",
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }))
      );
    })
  );

  router.post(
    "/requests",
    asyncHandler(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const pool = await getPool();
      const nowIso = new Date().toISOString();
      const id = await generateRequestId(pool);
      const status = body.status ?? "draft";

      const initialHistory = [
        {
          id: `h-${Date.now()}`,
          status,
          timestamp: nowIso,
          userId: body.createdBy ?? "",
          userName: body.createdByName ?? "",
        },
      ];

      const requestData = normalizeRequestData(
        {
          ...body,
          id,
          status,
          createdAt: nowIso,
          updatedAt: nowIso,
          history: body.history?.length ? body.history : initialHistory,
        },
        nowIso
      );

      await pool
        .request()
        .input("id", sql.NVarChar(64), id)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(requestData))
        .input("status", sql.NVarChar(50), status)
        .input("created_at", sql.DateTime2, new Date(nowIso))
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query(
          "INSERT INTO requests (id, data, status, created_at, updated_at) VALUES (@id, @data, @status, @created_at, @updated_at)"
        );

      // Best-effort email notification enqueue for non-draft creates (ex: create+submit from the UI).
      try {
        const createdStatus = String(status ?? "");
        if (createdStatus && createdStatus !== "draft") {
          const [settings, tokenState] = await Promise.all([
            getM365Settings(pool),
            getM365TokenState(pool),
          ]);
          if (settings.enabled && tokenState.hasRefreshToken) {
            const to = resolveRecipientsForStatus(settings, createdStatus);
            if (to.length) {
              const subject = `[CRA] Request ${id} status changed to ${createdStatus}`;
              const link = buildRequestLink(settings.appBaseUrl, id);
              const template = getTemplateForEvent(settings, "request_created");
              const subjectTpl = applyTemplateVars(template.subject, {
                requestId: id,
                status: createdStatus,
              });
              const html = renderStatusEmailHtml({
                request: requestData,
                newStatus: createdStatus,
                actorName: body.createdByName ?? "",
                comment: "",
                link,
                dashboardLink: buildDashboardLink(settings.appBaseUrl),
                logoUrl: buildPublicAssetLink(settings.appBaseUrl, "monroc-logo.png"),
                template,
                introOverride: template.intro,
              });
              await pool
                .request()
                .input("event_type", sql.NVarChar(64), "request_created")
                .input("request_id", sql.NVarChar(64), id)
                .input("to_emails", sql.NVarChar(sql.MAX), to.join(", "))
                .input("subject", sql.NVarChar(255), subjectTpl || subject)
                .input("body_html", sql.NVarChar(sql.MAX), html)
                .query(
                  "INSERT INTO notification_outbox (event_type, request_id, to_emails, subject, body_html) VALUES (@event_type, @request_id, @to_emails, @subject, @body_html)"
                );
            }
          }
        }
      } catch (e) {
        console.error("Failed to enqueue create email:", e);
      }

      res.status(201).json(requestData);
    })
  );

  router.post(
    "/requests/:requestId/status",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const body = req.body;
      if (!body?.status) {
        res.status(400).json({ error: "Missing status" });
        return;
      }

      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      const previousStatus = String(existing.status ?? "");
      const nowIso = new Date().toISOString();
      const historyEntry = {
        id: `h-${Date.now()}`,
        status: body.status,
        timestamp: nowIso,
        userId: body.userId ?? "",
        userName: body.userName ?? "",
        comment: body.comment,
      };

      const updated = normalizeRequestData(
        {
          ...existing,
          status: body.status,
          updatedAt: nowIso,
          history: [...(existing.history ?? []), historyEntry],
        },
        nowIso
      );

      await pool
        .request()
        .input("id", sql.NVarChar(64), requestId)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(updated))
        .input("status", sql.NVarChar(50), updated.status)
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query("UPDATE requests SET data = @data, status = @status, updated_at = @updated_at WHERE id = @id");

      // Best-effort email notification enqueue (do not block status updates if email config is missing).
      try {
        const newStatus = String(updated.status ?? "");
        if (newStatus && newStatus !== previousStatus) {
          const [settings, tokenState] = await Promise.all([
            getM365Settings(pool),
            getM365TokenState(pool),
          ]);
          if (settings.enabled && tokenState.hasRefreshToken) {
            const to = resolveRecipientsForStatus(settings, newStatus);
            if (to.length) {
              const subject = `[CRA] Request ${requestId} status changed to ${newStatus}`;
              const link = buildRequestLink(settings.appBaseUrl, requestId);
              const template = getTemplateForEvent(settings, "request_status_changed");
              const subjectTpl = applyTemplateVars(template.subject, {
                requestId,
                status: newStatus,
              });
              const html = renderStatusEmailHtml({
                request: updated,
                newStatus,
                actorName: body.userName ?? "",
                comment: body.comment,
                link,
                dashboardLink: buildDashboardLink(settings.appBaseUrl),
                logoUrl: buildPublicAssetLink(settings.appBaseUrl, "monroc-logo.png"),
                template,
                introOverride: template.intro,
              });
              await pool
                .request()
                .input("event_type", sql.NVarChar(64), "request_status_changed")
                .input("request_id", sql.NVarChar(64), requestId)
                .input("to_emails", sql.NVarChar(sql.MAX), to.join(", "))
                .input("subject", sql.NVarChar(255), subjectTpl || subject)
                .input("body_html", sql.NVarChar(sql.MAX), html)
                .query(
                  "INSERT INTO notification_outbox (event_type, request_id, to_emails, subject, body_html) VALUES (@event_type, @request_id, @to_emails, @subject, @body_html)"
                );
            }
          }
        }
      } catch (e) {
        console.error("Failed to enqueue status change email:", e);
      }

      res.json(updated);
    })
  );

  router.get(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }
      res.json(existing);
    })
  );

  router.put(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const body = req.body;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      const nowIso = new Date().toISOString();
      const historyEvent = body.historyEvent;
      const editedBy = body.editedBy;
      const editedByName = body.editedByName;
      const merged = {
        ...existing,
        ...body,
        updatedAt: nowIso,
      };
      delete merged.historyEvent;
      delete merged.editedBy;
      delete merged.editedByName;

      if (!Array.isArray(body.products) && hasLegacyProductUpdates(body)) {
        const existingProducts = Array.isArray(existing.products) ? existing.products : [];
        const legacyProduct = buildLegacyProduct(merged, Array.isArray(merged.attachments) ? merged.attachments : []);
        if (existingProducts.length) {
          merged.products = [legacyProduct, ...existingProducts.slice(1)];
        } else {
          merged.products = [legacyProduct];
        }
      }

      const baseHistory = Array.isArray(merged.history)
        ? [...merged.history]
        : Array.isArray(existing.history)
          ? [...existing.history]
          : [];

      if (historyEvent === "edited") {
        baseHistory.push({
          id: `h-${Date.now()}`,
          status: "edited",
          timestamp: nowIso,
          userId: editedBy ?? "",
          userName: editedByName ?? "",
        });
      }

      const updated = normalizeRequestData(
        {
          ...merged,
          history: baseHistory,
        },
        nowIso
      );

      if (Array.isArray(updated.products) && updated.products.length) {
        Object.assign(updated, syncLegacyFromProduct(updated, updated.products[0]));
      }

      await pool
        .request()
        .input("id", sql.NVarChar(64), requestId)
        .input("data", sql.NVarChar(sql.MAX), JSON.stringify(updated))
        .input("status", sql.NVarChar(50), updated.status ?? existing.status)
        .input("updated_at", sql.DateTime2, new Date(nowIso))
        .query("UPDATE requests SET data = @data, status = @status, updated_at = @updated_at WHERE id = @id");

      res.json(updated);
    })
  );

  router.delete(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const pool = await getPool();
      await pool.request().input("id", sql.NVarChar(64), requestId).query("DELETE FROM requests WHERE id = @id");
      res.status(204).send();
    })
  );

  return router;
})();
