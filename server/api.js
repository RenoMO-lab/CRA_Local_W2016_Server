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

const buildRequestLink = (baseUrl, requestId) => {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/requests/${encodeURIComponent(requestId)}`;
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

const renderStatusEmailHtml = ({ request, newStatus, actorName, comment, link }) => {
  const safeComment = String(comment ?? "").trim();
  const client = String(request?.clientName ?? "").trim();
  const rid = String(request?.id ?? "").trim();
  const actor = String(actorName ?? "").trim();
  const status = String(newStatus ?? "").trim();
  const linkHtml = link ? `<p><a href="${link}">Open request</a></p>` : "";
  const commentHtml = safeComment ? `<p><b>Comment:</b><br/>${safeComment.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</p>` : "";

  return `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4;">
      <p><b>Request</b>: ${rid}${client ? ` (${client})` : ""}</p>
      <p><b>New status</b>: ${status}</p>
      ${actor ? `<p><b>Changed by</b>: ${actor}</p>` : ""}
      ${commentHtml}
      ${linkHtml}
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

  router.put(
    "/admin/m365",
    asyncHandler(async (req, res) => {
      const body = safeJson(req.body) ?? {};
      const pool = await getPool();
      await updateM365Settings(pool, body);
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
              const html = renderStatusEmailHtml({
                request: requestData,
                newStatus: createdStatus,
                actorName: body.createdByName ?? "",
                comment: "",
                link,
              });
              await pool
                .request()
                .input("event_type", sql.NVarChar(64), "request_created")
                .input("request_id", sql.NVarChar(64), id)
                .input("to_emails", sql.NVarChar(sql.MAX), to.join(", "))
                .input("subject", sql.NVarChar(255), subject)
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
              const html = renderStatusEmailHtml({
                request: updated,
                newStatus,
                actorName: body.userName ?? "",
                comment: body.comment,
                link,
              });
              await pool
                .request()
                .input("event_type", sql.NVarChar(64), "request_status_changed")
                .input("request_id", sql.NVarChar(64), requestId)
                .input("to_emails", sql.NVarChar(sql.MAX), to.join(", "))
                .input("subject", sql.NVarChar(255), subject)
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
