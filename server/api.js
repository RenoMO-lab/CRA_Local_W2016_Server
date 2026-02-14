import express from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Busboy from "busboy";
import { getPool, withTransaction } from "./db.js";
import {
  clearSessionCookie,
  createUserSession,
  ensureBootstrapAuthData,
  findUserForLogin,
  getAuthFromSessionToken,
  makePasswordHash,
  mapUserRow,
  readSessionTokenFromRequest,
  revokeSessionById,
  setSessionCookie,
  validateUserPayload,
  verifyUserPassword,
} from "./auth.js";
import {
  claimDeviceCodeSessionForRedeem,
  clearM365Tokens,
  forceRefreshAccessToken,
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
  updateDeviceCodeSessionStatus,
  updateM365Settings,
} from "./m365.js";
import { getDbMonitorState, refreshDbMonitorSnapshot } from "./dbMonitor.js";
import {
  createDbBackup as createManagedDbBackup,
  getDbBackupConfig,
  listDbBackupsWithStatus,
  restoreDbBackup as restoreManagedDbBackup,
  updateDbBackupConfig,
  setupDbBackupCredentials,
} from "./dbBackup.js";

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

const getRequestIp = (req) => {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return String(req?.socket?.remoteAddress ?? "").trim() || null;
};

const getRequestUserAgent = (req) => {
  const ua = req?.headers?.["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 512) : null;
};

const writeAuditLogBestEffort = async (db, req, entry) => {
  try {
    const actor = entry?.actor ?? req?.authUser ?? null;
    const actorUserId = actor?.id ? String(actor.id) : null;
    const actorEmail = entry?.actorEmail ?? (actor?.email ? String(actor.email) : null);
    const actorRole = entry?.actorRole ?? (actor?.role ? String(actor.role) : null);

    const action = String(entry?.action ?? "").trim();
    if (!action) return;

    const targetType = entry?.targetType ? String(entry.targetType).trim() : null;
    const targetId = entry?.targetId ? String(entry.targetId).trim() : null;
    const result = entry?.result === "error" ? "error" : "ok";
    const errorMessage = entry?.errorMessage ? String(entry.errorMessage).slice(0, 1000) : null;

    const ip = entry?.ip ?? getRequestIp(req);
    const userAgent = entry?.userAgent ?? getRequestUserAgent(req);
    const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : null;

    await db.query(
      `INSERT INTO audit_log
        (id, actor_user_id, actor_email, actor_role, action, target_type, target_id, ip, user_agent, result, error_message, metadata)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        randomUUID(),
        actorUserId,
        actorEmail,
        actorRole,
        action,
        targetType,
        targetId,
        ip,
        userAgent,
        result,
        errorMessage,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (e) {
    // Never block the request for audit log failures.
    console.error("audit_log insert failed:", e?.message ?? e);
  }
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
  // Outlook dark mode can heavily transform background/text colors.
  // Using a single accent color (instead of a pill) is much more stable.
  const s = String(status ?? "");
  if (["clarification_needed", "gm_rejected"].includes(s)) {
    return { accent: "#DC2626" }; // red
  }
  if (["gm_approved", "costing_complete", "feasibility_confirmed", "closed"].includes(s)) {
    return { accent: "#16A34A" }; // green
  }
  if (["submitted", "under_review", "in_costing", "gm_approval_pending", "sales_followup"].includes(s)) {
    return { accent: "#2563EB" }; // blue
  }
  return { accent: "#64748B" }; // slate
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

const renderStatusEmailHtml = ({ request, newStatus, actorName, comment, link, dashboardLink, logoUrl, logoCid, template, introOverride }) => {
  const safeComment = String(comment ?? "").trim();
  const client = String(request?.clientName ?? "").trim();
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
  const footerText = String(template?.footerText ?? "").trim();

  const badge = statusBadgeStyles(status);
  const openRequestHref = link ? escapeHtml(link) : "";
  const safeLogoCid = String(logoCid ?? "").trim();
  const logoImg = safeLogoCid
    ? `<img src="cid:${escapeHtml(safeLogoCid)}" width="120" alt="MONROC" style="display:block; border:0; outline:none; text-decoration:none; height:auto;" />`
    : logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" width="120" alt="MONROC" style="display:block; border:0; outline:none; text-decoration:none; height:auto;" />`
      : `<div style="font-weight:800; letter-spacing:0.5px; color:#111827;">MONROC</div>`;

  const renderPrimaryButton = ({ href, text, widthPx = 420 }) => {
    const safeHref = String(href ?? "");
    const safeText = escapeHtml(text);
    const width = Number.isFinite(widthPx) ? Math.max(280, Math.min(520, Math.floor(widthPx))) : 420;

    if (!safeHref) return "";

    return `
      <center>
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="${width}" style="border-collapse:separate; width:${width}px; max-width:${width}px; margin:0 auto; mso-table-lspace:0pt; mso-table-rspace:0pt;">
        <tr>
          <td align="center" valign="middle" bgcolor="#D71920" style="background:#D71920; border-radius:12px; mso-padding-alt:15px 18px;">
            <a href="${safeHref}" style="display:block; font-family:Arial, sans-serif; font-size:15px; font-weight:800; color:#FFFFFF; text-decoration:none; padding:15px 18px; line-height:20px; -webkit-text-size-adjust:none; border-radius:12px; text-align:center;">
              <span style="color:#FFFFFF; text-decoration:none;">${safeText}</span>
            </a>
          </td>
        </tr>
      </table>
      </center>
    `.trim();
  };

  const kvCell = (label, value) => {
    const v = String(value ?? "").trim();
    if (!v) return null;
    return `
      <td width="50%" valign="top" style="padding:10px 10px 10px 0;">
        <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">${escapeHtml(label)}</div>
        <div style="margin-top:3px; font-size:14px; font-weight:700; color:#111827;">${escapeHtml(v)}</div>
      </td>
    `.trim();
  };

  const qtyText = typeof expectedQty === "number" ? String(expectedQty) : "";

  const primaryBtn = renderPrimaryButton({ href: openRequestHref, text: primaryText, widthPx: 440 });

  const accent = badge.accent;
  const metaParts = [];
  if (rid) metaParts.push(`Request ${escapeHtml(rid)}`);
  if (updatedAt) metaParts.push(escapeHtml(updatedAt));
  if (actor) metaParts.push(`By ${escapeHtml(actor)}`);
  const metaLine = metaParts.join(" | ");

  const facts = [
    kvCell("Client", client),
    kvCell("Country", country),
    kvCell("Application Vehicle", appVehicle),
    kvCell("Expected Qty", qtyText),
    kvCell("Expected Delivery Date", expectedDeliveryDate),
  ].filter(Boolean);

  const factsRows = [];
  for (let i = 0; i < facts.length; i += 2) {
    const left = facts[i] ?? "";
    const right = facts[i + 1] ?? `<td width="50%" style="padding:10px 0;">&nbsp;</td>`;
    factsRows.push(`<tr>${left}${right}</tr>`);
  }

  const commentBlock = safeComment
    ? `
      <tr>
        <td style="padding:14px 0 0 0;">
          <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">Comment</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px; border-collapse:separate;">
            <tr>
              <td width="4" bgcolor="${accent}" style="background:${accent}; border-radius:4px 0 0 4px; font-size:0; line-height:0;">&nbsp;</td>
              <td style="padding:10px 12px; background:#F9FAFB; border:1px solid #E5E7EB; border-left:0; border-radius:0 10px 10px 0; font-size:14px; color:#111827; white-space:pre-wrap; line-height:20px;">${escapeHtml(safeComment)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `.trim()
    : "";

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </head>
    <body style="margin:0; padding:0; background:#F5F7FB; color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F7FB" style="background:#F5F7FB; width:100%;">
      <tr>
        <td align="center" style="padding:30px 12px;">
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
              <td bgcolor="#FFFFFF" style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:16px; overflow:hidden; font-family: Arial, sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:0; background:#FFFFFF;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td height="6" bgcolor="${accent}" style="background:${accent}; font-size:0; line-height:0;">&nbsp;</td>
                        </tr>
                        <tr>
                          <td style="padding:22px 24px 18px 24px;">
                            <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">Status Updated</div>
                            <div style="margin-top:6px; font-size:24px; font-weight:900; color:#111827; letter-spacing:0.2px; line-height:30px;">${escapeHtml(statusLabel)}</div>
                            ${introText ? `<div style="margin-top:10px; font-size:14px; color:#374151; line-height:20px;">${escapeHtml(introText)}</div>` : ""}
                            ${metaLine ? `<div style="margin-top:10px; font-size:12px; color:#6B7280; line-height:18px;">${metaLine}</div>` : ""}
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:0 24px 0 24px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #EEF2F7;">
                              <tr><td style="height:1px; line-height:1px;">&nbsp;</td></tr>
                            </table>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:14px 24px 0 24px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              ${factsRows.join("")}
                            </table>
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              ${commentBlock}
                            </table>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:18px 24px 22px 24px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td align="center">
                                  <div style="text-align:center;">
                                    ${primaryBtn}
                                  </div>
                                </td>
                              </tr>
                            </table>

                            ${openRequestHref ? `<div style="margin-top:14px; font-size:11px; color:#6B7280; line-height:16px;">If the button doesn't work, use this link: <a href="${openRequestHref}" style="color:#2563EB; text-decoration:underline; word-break:break-all;">${openRequestHref}</a></div>` : ""}
                          </td>
                        </tr>
                      </table>
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
    </body>
  </html>
  `.trim();
};

const ACCESS_EMAIL_SUBJECT = "[CRA] Your platform access is ready";
const ACCESS_EMAIL_LOGO_FILE = "monroc-logo.png";
const ACCESS_EMAIL_LOGO_CID = "monroc-logo";
let accessEmailLogoBase64 = null;

const getAccessEmailLogoBase64 = async () => {
  if (accessEmailLogoBase64) return accessEmailLogoBase64;
  try {
    const buf = await fs.readFile(path.join(REPO_ROOT, "public", ACCESS_EMAIL_LOGO_FILE));
    accessEmailLogoBase64 = buf.toString("base64");
    return accessEmailLogoBase64;
  } catch {
    return null;
  }
};

const sha256Hex = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

const normalizeLoginEmail = (value) => String(value ?? "").trim().toLowerCase();

const isValidEmail = (value) => {
  const email = String(value ?? "").trim();
  if (!email) return false;
  // Simple sanity check (not RFC-complete, good enough for business emails).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const generateNumericCode = () => {
  const n = randomBytes(4).readUInt32BE(0) % 1000000;
  return String(n).padStart(6, "0");
};

const generateTemporaryPassword = (length = 12) => {
  const targetLen = Number.isFinite(length) ? Math.max(10, Math.floor(length)) : 12;
  const lowers = "abcdefghijkmnopqrstuvwxyz";
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "@#$%&*-_!";
  const all = `${lowers}${uppers}${digits}${symbols}`;

  const pick = (charset) => charset[randomBytes(1)[0] % charset.length];
  const chars = [pick(lowers), pick(uppers), pick(digits), pick(symbols)];
  while (chars.length < targetLen) {
    chars.push(pick(all));
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const renderAccessProvisionEmailHtml = ({ userName, loginEmail, temporaryPassword, appUrl, senderUpn, logoSrc }) => {
  const name = String(userName ?? "").trim() || "User";
  const login = String(loginEmail ?? "").trim();
  const password = String(temporaryPassword ?? "").trim();
  const link = String(appUrl ?? "").trim();
  const computedLogo = buildPublicAssetLink(link, ACCESS_EMAIL_LOGO_FILE);
  const logo = String(logoSrc ?? "").trim() || computedLogo;
  const sender = String(senderUpn ?? "").trim();
  const nowUtc = formatIsoUtc(new Date().toISOString());

  const safeLink = escapeHtml(link);
  const safeLogoSrc = escapeHtml(logo);
  const safeName = escapeHtml(name);
  const safeLogin = escapeHtml(login);
  const safePassword = escapeHtml(password);
  const safeSender = escapeHtml(sender || "System Administrator");
  const safeNowUtc = escapeHtml(nowUtc);

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </head>
    <body style="margin:0; padding:0; background:#F5F7FB; color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F7FB" style="background:#F5F7FB; width:100%;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px; max-width:640px;">
              <tr>
                <td bgcolor="#FFFFFF" style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:16px; overflow:hidden; font-family: Arial, sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td height="6" bgcolor="#2563EB" style="background:#2563EB; font-size:0; line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:22px 24px 8px 24px;">
                        ${safeLogoSrc ? `<div style="margin:0 0 14px 0;">
                          <img src="${safeLogoSrc}" alt="MONROC" width="180" style="display:block; width:180px; max-width:100%; height:auto;" />
                        </div>` : ""}
                        <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">Access Notification</div>
                        <div style="margin-top:6px; font-size:24px; font-weight:900; color:#111827; line-height:30px;">Your CRA account is ready</div>
                        <div style="margin-top:10px; font-size:14px; color:#374151; line-height:20px;">
                          Dear ${safeName},<br/><br/>
                          Your access to the CRA platform has been configured. Please use the credentials below to sign in.
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 24px 0 24px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                          <tr>
                            <td style="width:170px; padding:10px 0; font-size:12px; color:#6B7280; text-transform:uppercase;">Platform Link</td>
                            <td style="padding:10px 0; font-size:14px; font-weight:700;">
                              <a href="${safeLink}" style="color:#2563EB; text-decoration:underline; word-break:break-all;">${safeLink}</a>
                            </td>
                          </tr>
                          <tr>
                            <td style="width:170px; padding:10px 0; font-size:12px; color:#6B7280; text-transform:uppercase;">Login</td>
                            <td style="padding:10px 0; font-size:14px; font-weight:700; color:#111827;">${safeLogin}</td>
                          </tr>
                          <tr>
                            <td style="width:170px; padding:10px 0; font-size:12px; color:#6B7280; text-transform:uppercase;">Temporary Password</td>
                            <td style="padding:10px 0; font-size:14px; font-weight:700; color:#111827;">${safePassword}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 24px 18px 24px;">
                        <div style="padding:12px 14px; border:1px solid #E5E7EB; background:#F9FAFB; border-radius:10px; font-size:13px; color:#374151; line-height:19px;">
                          For security reasons, please change your password immediately after your first login and do not share your credentials.
                          <br/><br/>
                          In the CRA app, open the menu next to your name and select <b>My account</b> to change your password.
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 24px 22px 24px;">
                        <center>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="420" style="border-collapse:separate; width:420px; max-width:420px; margin:0 auto;">
                            <tr>
                              <td align="center" valign="middle" bgcolor="#D71920" style="background:#D71920; border-radius:12px; mso-padding-alt:15px 18px;">
                                <a href="${safeLink}" style="display:block; font-family:Arial, sans-serif; font-size:15px; font-weight:800; color:#FFFFFF; text-decoration:none; padding:15px 18px; line-height:20px; border-radius:12px; text-align:center;">
                                  <span style="color:#FFFFFF; text-decoration:none;">Open CRA Platform</span>
                                </a>
                              </td>
                            </tr>
                          </table>
                        </center>
                        <div style="margin-top:12px; font-size:11px; color:#6B7280; line-height:16px;">
                          Provisioned by ${safeSender}${safeNowUtc ? ` on ${safeNowUtc}` : ""}.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `.trim();
};

const EMAIL_CHANGE_SUBJECT = "[CRA] Confirm your new login email";

const renderEmailChangeVerificationHtml = ({ userName, newEmail, code, confirmUrl, senderUpn, logoSrc }) => {
  const name = String(userName ?? "").trim() || "User";
  const safeName = escapeHtml(name);
  const safeNewEmail = escapeHtml(String(newEmail ?? "").trim());
  const safeCode = escapeHtml(String(code ?? "").trim());
  const safeConfirmUrl = escapeHtml(String(confirmUrl ?? "").trim());
  const safeSender = escapeHtml(String(senderUpn ?? "").trim() || "System Administrator");
  const safeLogo = escapeHtml(String(logoSrc ?? "").trim());

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </head>
    <body style="margin:0; padding:0; background:#F5F7FB; color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F7FB" style="background:#F5F7FB; width:100%;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px; max-width:640px;">
              <tr>
                <td bgcolor="#FFFFFF" style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:16px; overflow:hidden; font-family: Arial, sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td height="6" bgcolor="#2563EB" style="background:#2563EB; font-size:0; line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:22px 24px 8px 24px;">
                        ${safeLogo ? `<div style="margin:0 0 14px 0;">
                          <img src="${safeLogo}" alt="MONROC" width="180" style="display:block; width:180px; max-width:100%; height:auto;" />
                        </div>` : ""}
                        <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">Security Confirmation</div>
                        <div style="margin-top:6px; font-size:22px; font-weight:900; color:#111827; line-height:28px;">Confirm your new login email</div>
                        <div style="margin-top:10px; font-size:14px; color:#374151; line-height:20px;">
                          Dear ${safeName},<br/><br/>
                          A request was made to change the login email for your CRA account to:
                          <br/><b>${safeNewEmail}</b>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 24px 0 24px;">
                        <div style="padding:12px 14px; border:1px solid #E5E7EB; background:#F9FAFB; border-radius:10px; font-size:13px; color:#374151; line-height:19px;">
                          Your verification code is: <b style="font-size:16px; letter-spacing:0.08em;">${safeCode}</b>
                          <br/><br/>
                          Enter this code in the CRA app under <b>My account</b> to confirm the change.
                        </div>
                      </td>
                    </tr>
                    ${safeConfirmUrl ? `
                    <tr>
                      <td style="padding:16px 24px 22px 24px;">
                        <center>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="420" style="border-collapse:separate; width:420px; max-width:420px; margin:0 auto;">
                            <tr>
                              <td align="center" valign="middle" bgcolor="#D71920" style="background:#D71920; border-radius:12px; mso-padding-alt:15px 18px;">
                                <a href="${safeConfirmUrl}" style="display:block; font-family:Arial, sans-serif; font-size:15px; font-weight:800; color:#FFFFFF; text-decoration:none; padding:15px 18px; line-height:20px; border-radius:12px; text-align:center;">
                                  <span style="color:#FFFFFF; text-decoration:none;">Confirm Email Change</span>
                                </a>
                              </td>
                            </tr>
                          </table>
                        </center>
                        <div style="margin-top:12px; font-size:11px; color:#6B7280; line-height:16px;">
                          If you did not request this change, you can ignore this message. Your email will not be updated.
                        </div>
                        <div style="margin-top:8px; font-size:11px; color:#6B7280; line-height:16px;">
                          Sent by ${safeSender}.
                        </div>
                      </td>
                    </tr>` : `
                    <tr>
                      <td style="padding:14px 24px 22px 24px;">
                        <div style="margin-top:8px; font-size:11px; color:#6B7280; line-height:16px;">
                          If you did not request this change, you can ignore this message. Your email will not be updated.
                        </div>
                        <div style="margin-top:8px; font-size:11px; color:#6B7280; line-height:16px;">
                          Sent by ${safeSender}.
                        </div>
                      </td>
                    </tr>`}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `.trim();
};

const EMAIL_CHANGED_NOTICE_SUBJECT = "[CRA] Your login email was changed";

const renderEmailChangedNoticeHtml = ({ userName, newEmail, senderUpn, logoSrc }) => {
  const name = String(userName ?? "").trim() || "User";
  const safeName = escapeHtml(name);
  const safeNewEmail = escapeHtml(String(newEmail ?? "").trim());
  const safeSender = escapeHtml(String(senderUpn ?? "").trim() || "System Administrator");
  const safeLogo = escapeHtml(String(logoSrc ?? "").trim());

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </head>
    <body style="margin:0; padding:0; background:#F5F7FB; color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F7FB" style="background:#F5F7FB; width:100%;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px; max-width:640px;">
              <tr>
                <td bgcolor="#FFFFFF" style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:16px; overflow:hidden; font-family: Arial, sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td height="6" bgcolor="#2563EB" style="background:#2563EB; font-size:0; line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:22px 24px 18px 24px;">
                        ${safeLogo ? `<div style="margin:0 0 14px 0;">
                          <img src="${safeLogo}" alt="MONROC" width="180" style="display:block; width:180px; max-width:100%; height:auto;" />
                        </div>` : ""}
                        <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em;">Security Notice</div>
                        <div style="margin-top:6px; font-size:22px; font-weight:900; color:#111827; line-height:28px;">Your CRA login email was changed</div>
                        <div style="margin-top:10px; font-size:14px; color:#374151; line-height:20px;">
                          Dear ${safeName},<br/><br/>
                          Your CRA login email is now set to: <b>${safeNewEmail}</b>
                          <br/><br/>
                          If you did not request this change, please contact your administrator immediately.
                        </div>
                        <div style="margin-top:12px; font-size:11px; color:#6B7280; line-height:16px;">
                          Sent by ${safeSender}.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
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

const normalizeSalesPaymentTerms = (termsInput, countInput) => {
  const source = Array.isArray(termsInput) ? termsInput : [];
  const parsedCount = Number.parseInt(String(countInput ?? ""), 10);
  const baseCount = Number.isFinite(parsedCount) ? parsedCount : source.length || 1;
  const salesPaymentTermCount = Math.min(6, Math.max(1, baseCount));
  const salesPaymentTerms = Array.from({ length: salesPaymentTermCount }, (_unused, index) => {
    const raw = source[index] ?? {};
    const percentRaw = raw?.paymentPercent;
    let paymentPercent = null;
    if (typeof percentRaw === "number" && Number.isFinite(percentRaw)) {
      paymentPercent = percentRaw;
    } else if (typeof percentRaw === "string" && percentRaw.trim() !== "") {
      const parsed = Number.parseFloat(percentRaw);
      paymentPercent = Number.isFinite(parsed) ? parsed : null;
    }
    return {
      paymentNumber: index + 1,
      paymentName: typeof raw?.paymentName === "string" ? raw.paymentName : "",
      paymentPercent,
      comments: typeof raw?.comments === "string" ? raw.comments : "",
    };
  });
  return { salesPaymentTermCount, salesPaymentTerms };
};

const parseOptionalFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

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
  const { salesPaymentTermCount, salesPaymentTerms } = normalizeSalesPaymentTerms(
    data.salesPaymentTerms,
    data.salesPaymentTermCount
  );
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
    salesVatRate: parseOptionalFiniteNumber(data.salesVatRate),
    salesMargin: parseOptionalFiniteNumber(data.salesMargin),
    salesWarrantyPeriod:
      typeof data.salesWarrantyPeriod === "string" ? data.salesWarrantyPeriod : "",
    salesExpectedDeliveryDate:
      typeof data.salesExpectedDeliveryDate === "string" ? data.salesExpectedDeliveryDate : "",
    salesPaymentTermCount,
    salesPaymentTerms,
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
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch (error) {
    console.error("Failed to parse request data", context ?? "", error);
    return null;
  }
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const isAttachmentUrl = (url) => typeof url === "string" && url.startsWith("/api/attachments/");

const looksLikeInlineData = (url) => {
  if (typeof url !== "string") return false;
  if (!url) return false;
  if (url.startsWith("data:")) return true;
  // Some older stored attachments used base64 without a prefix.
  if (url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) {
    return false;
  }
  return true;
};

const guessContentTypeFromFilename = (filename) => {
  const name = String(filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
};

const parseDataUrl = (value) => {
  const raw = String(value ?? "");
  if (!raw.startsWith("data:")) return null;
  const idx = raw.indexOf(",");
  if (idx < 0) return null;
  const meta = raw.slice(5, idx); // after "data:"
  const dataPart = raw.slice(idx + 1);
  const isBase64 = meta.includes(";base64");
  const contentType = meta.split(";")[0] || "";
  return {
    contentType: contentType || null,
    isBase64,
    dataPart,
  };
};

const normalizeFilenameForHeader = (filename) =>
  String(filename ?? "file")
    .replaceAll("\r", "")
    .replaceAll("\n", "")
    .replaceAll('"', "'");

const collectAttachmentIds = (request) => {
  const ids = new Set();
  const visitArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const id = String(item?.id ?? "").trim();
      if (id) ids.add(id);
    }
  };

  visitArray(request?.attachments);
  visitArray(request?.designResultAttachments);
  visitArray(request?.costingAttachments);
  visitArray(request?.salesAttachments);

  if (Array.isArray(request?.products)) {
    for (const p of request.products) {
      visitArray(p?.attachments);
    }
  }

  return Array.from(ids);
};

const extractInlineAttachments = (request) => {
  const inserts = [];

  const visitArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const currentUrl = String(item.url ?? "");
      if (!currentUrl) continue;
      if (isAttachmentUrl(currentUrl)) continue;
      if (!looksLikeInlineData(currentUrl)) continue;

      let id = String(item.id ?? "").trim();
      if (!id) {
        id = randomUUID();
        item.id = id;
      }

      let contentType = null;
      let buffer = null;

      if (currentUrl.startsWith("data:")) {
        const parsed = parseDataUrl(currentUrl);
        if (parsed?.isBase64) {
          contentType = parsed.contentType;
          buffer = Buffer.from(parsed.dataPart, "base64");
        } else if (parsed) {
          contentType = parsed.contentType;
          buffer = Buffer.from(decodeURIComponent(parsed.dataPart), "utf8");
        }
      } else {
        // Bare base64 payload (no prefix).
        contentType = guessContentTypeFromFilename(item.filename);
        buffer = Buffer.from(currentUrl, "base64");
      }

      if (!buffer || !buffer.length) continue;
      if (!contentType) contentType = guessContentTypeFromFilename(item.filename);

      const uploadedAt = item.uploadedAt ? new Date(item.uploadedAt) : new Date();
      const uploadedBy = item.uploadedBy ? String(item.uploadedBy) : null;
      const attachmentType = item.type ? String(item.type) : "other";
      const filename = String(item.filename ?? "file");

      inserts.push({
        id,
        attachmentType,
        filename,
        contentType,
        byteSize: buffer.length,
        uploadedAt,
        uploadedBy,
        data: buffer,
      });

      // Replace the inlined data with a stable URL.
      item.url = `/api/attachments/${encodeURIComponent(id)}`;
    }
  };

  visitArray(request?.attachments);
  visitArray(request?.designResultAttachments);
  visitArray(request?.costingAttachments);
  visitArray(request?.salesAttachments);

  if (Array.isArray(request?.products)) {
    for (const p of request.products) {
      visitArray(p?.attachments);
    }
  }

  const keepIds = collectAttachmentIds(request);
  return { inserts, keepIds };
};

const materializeRequestAttachments = async (pool, requestId, request) => {
  const { inserts, keepIds } = extractInlineAttachments(request);

  for (const att of inserts) {
    await pool.query(
      `
      INSERT INTO request_attachments
        (id, request_id, attachment_type, filename, content_type, byte_size, uploaded_at, uploaded_by, data)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        att.id,
        requestId,
        att.attachmentType,
        att.filename,
        att.contentType,
        att.byteSize,
        att.uploadedAt,
        att.uploadedBy,
        att.data,
      ]
    );
  }

  if (!keepIds.length) {
    await pool.query("DELETE FROM request_attachments WHERE request_id=$1", [requestId]);
  } else {
    await pool.query("DELETE FROM request_attachments WHERE request_id=$1 AND NOT (id = ANY($2::text[]))", [
      requestId,
      keepIds,
    ]);
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
const LOG_DIR = path.join(REPO_ROOT, "deploy", "logs");
const DEFAULT_DEPLOY_LOG_PATH = path.join(LOG_DIR, "auto-deploy.log");
const BUILD_INFO_PATH = path.join(REPO_ROOT, "dist", "build-info.json");
const DB_BACKUP_DIR = path.resolve(process.env.DB_BACKUP_DIR || "C:\\CRA_Local_W2016_Main\\backups\\postgres");
const MAX_DB_BACKUP_LIST = 100;
let dbBackupInProgress = false;

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

const readBuildInfo = async () => {
  try {
    const raw = await fs.readFile(BUILD_INFO_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const hash = String(parsed?.hash ?? "").trim();
    const message = String(parsed?.message ?? "").trim();
    const author = String(parsed?.author ?? "").trim();
    const date = String(parsed?.date ?? "").trim();
    const builtAt = String(parsed?.builtAt ?? "").trim();
    if (!hash && !message && !author && !date && !builtAt) return null;
    return { hash, message, author, date, builtAt };
  } catch {
    return null;
  }
};

const listLogFiles = async (dirPath, maxFiles = 25) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const names = entries.filter((e) => e.isFile()).map((e) => e.name);
    const stats = await Promise.all(
      names.map(async (name) => {
        try {
          const fullPath = path.join(dirPath, name);
          const st = await fs.stat(fullPath);
          return { name, fullPath, mtimeMs: st.mtimeMs, sizeBytes: st.size };
        } catch {
          return null;
        }
      })
    );
    return stats
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, maxFiles);
  } catch {
    return [];
  }
};

const resolveDeployLog = async () => {
  const tried = [DEFAULT_DEPLOY_LOG_PATH];
  try {
    const st = await fs.stat(DEFAULT_DEPLOY_LOG_PATH);
    if (st.isFile()) {
      return { selectedPath: DEFAULT_DEPLOY_LOG_PATH, tried, files: [] };
    }
  } catch {
    // fallthrough
  }

  const files = await listLogFiles(LOG_DIR, 10);
  // Only use the explicit deploy log. Other files in deploy/logs (e.g. db-backup.log, manual-start logs)
  // are not a reliable source for "last deployment" and would be confusing to show as deploy history.
  return { selectedPath: null, tried, files };
};

const formatBackupTimestamp = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}${ss}`;
};

const isSafeBackupFileName = (value) =>
  /^[A-Za-z0-9._-]+(?:\.dump|_globals\.sql|_manifest\.json)$/i.test(String(value ?? ""));
const BACKUP_GLOBALS_SUFFIX = "_globals.sql";
const BACKUP_MANIFEST_SUFFIX = "_manifest.json";

const getBackupPrefixFromFileName = (fileName) => {
  const name = String(fileName ?? "").trim();
  if (!name) return null;
  if (name.toLowerCase().endsWith(".dump")) return name.slice(0, -5);
  if (name.toLowerCase().endsWith(BACKUP_GLOBALS_SUFFIX)) return name.slice(0, -BACKUP_GLOBALS_SUFFIX.length);
  if (name.toLowerCase().endsWith(BACKUP_MANIFEST_SUFFIX)) return name.slice(0, -BACKUP_MANIFEST_SUFFIX.length);
  return null;
};

const isManagedBackupArtifact = (fileName) => Boolean(getBackupPrefixFromFileName(fileName));

const resolveBackupFilePath = (fileName) => {
  if (!isSafeBackupFileName(fileName)) return null;
  const resolved = path.resolve(DB_BACKUP_DIR, fileName);
  const base = DB_BACKUP_DIR.toLowerCase();
  const target = resolved.toLowerCase();
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (!target.startsWith(baseWithSep)) return null;
  return resolved;
};

const DB_BACKUP_IMPORTS_DIR = path.join(DB_BACKUP_DIR, "imports");
const isSafeImportId = (value) => /^[0-9a-f-]{36}$/i.test(String(value ?? "").trim());
const isSafeManagedBackupFileName = (value) =>
  /^[A-Za-z0-9._-]+(?:\.dump|_globals\.sql|_manifest\.json)$/i.test(String(value ?? ""));

const resolveImportDir = (importId) => {
  const id = String(importId ?? "").trim();
  if (!isSafeImportId(id)) return null;
  const resolved = path.resolve(DB_BACKUP_IMPORTS_DIR, id);
  const base = DB_BACKUP_IMPORTS_DIR.toLowerCase();
  const target = resolved.toLowerCase();
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (target !== base && !target.startsWith(baseWithSep)) return null;
  return resolved;
};

const readManagedBackupArtifactsInDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!isSafeManagedBackupFileName(name)) continue;
    const lower = name.toLowerCase();
    const kind = lower.endsWith(".dump")
      ? "dump"
      : lower.endsWith(BACKUP_GLOBALS_SUFFIX)
        ? "globals"
        : lower.endsWith(BACKUP_MANIFEST_SUFFIX)
          ? "manifest"
          : null;
    if (!kind) continue;
    const prefix = getBackupPrefixFromFileName(name);
    if (!prefix) continue;
    const filePath = path.join(dirPath, name);
    try {
      const stat = await fs.stat(filePath);
      items.push({
        fileName: name,
        prefix,
        kind,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtime.getTime(),
      });
    } catch {
      // ignore
    }
  }
  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items;
};

const buildBackupSetsFromArtifacts = (artifacts) => {
  const byPrefix = new Map();
  for (const entry of artifacts) {
    const existing = byPrefix.get(entry.prefix) ?? {
      prefix: entry.prefix,
      createdAt: entry.createdAt,
      createdAtMs: entry.mtimeMs,
      totalSizeBytes: 0,
      artifacts: { dump: null, globals: null, manifest: null },
    };

    existing.totalSizeBytes += Number(entry.sizeBytes) || 0;
    if (entry.mtimeMs > existing.createdAtMs) {
      existing.createdAtMs = entry.mtimeMs;
      existing.createdAt = entry.createdAt;
    }
    if (!existing.artifacts[entry.kind]) {
      existing.artifacts[entry.kind] = {
        fileName: entry.fileName,
        sizeBytes: entry.sizeBytes,
        createdAt: entry.createdAt,
      };
    }
    byPrefix.set(entry.prefix, existing);
  }

  return Array.from(byPrefix.values())
    .map((set) => {
      const hasDump = Boolean(set.artifacts.dump);
      const hasGlobals = Boolean(set.artifacts.globals);
      const hasManifest = Boolean(set.artifacts.manifest);
      return {
        prefix: set.prefix,
        createdAt: set.createdAt,
        totalSizeBytes: set.totalSizeBytes,
        artifacts: set.artifacts,
        restoreReady: hasDump && hasGlobals,
        isComplete: hasDump && hasGlobals && hasManifest,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_DB_BACKUP_LIST);
};

const resolvePgDumpPath = async () => {
  const fromBinDir = process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, process.platform === "win32" ? "pg_dump.exe" : "pg_dump")
    : null;

  const candidates = [
    process.env.PG_DUMP_PATH,
    fromBinDir,
    "C:\\CRA_Local_W2016_Main\\tools\\postgresql\\bin\\pg_dump.exe",
    "pg_dump.exe",
    "pg_dump",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate);
    if (path.isAbsolute(value)) {
      try {
        await fs.access(value);
        return value;
      } catch {
        continue;
      }
    }

    try {
      await execFileAsync(value, ["--version"]);
      return value;
    } catch {
      // try next candidate
    }
  }

  return null;
};

const resolvePgDumpAllPath = async () => {
  const fromBinDir = process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, process.platform === "win32" ? "pg_dumpall.exe" : "pg_dumpall")
    : null;

  const candidates = [
    process.env.PG_DUMPALL_PATH,
    fromBinDir,
    "C:\\CRA_Local_W2016_Main\\tools\\postgresql\\bin\\pg_dumpall.exe",
    "pg_dumpall.exe",
    "pg_dumpall",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate);
    if (path.isAbsolute(value)) {
      try {
        await fs.access(value);
        return value;
      } catch {
        continue;
      }
    }

    try {
      await execFileAsync(value, ["--version"]);
      return value;
    } catch {
      // try next candidate
    }
  }

  return null;
};

const readExecutableVersion = async (executablePath) => {
  const bin = String(executablePath ?? "").trim();
  if (!bin) return null;
  try {
    const { stdout, stderr } = await execFileAsync(bin, ["--version"]);
    return String(stdout || stderr || "").trim() || null;
  } catch {
    return null;
  }
};

const getBackupConnectionConfig = () => {
  const fallback = {
    host: process.env.PGHOST || "localhost",
    port: Number.parseInt(process.env.PGPORT || "5432", 10),
    database: process.env.PGDATABASE || "cra_local",
    user: process.env.PGUSER || "",
    password: process.env.PGPASSWORD || "",
  };

  const raw = String(process.env.DATABASE_URL ?? "").trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      return fallback;
    }

    const dbName = String(parsed.pathname || "").replace(/^\/+/, "");
    return {
      host: parsed.hostname || fallback.host,
      port: Number.parseInt(parsed.port || String(fallback.port), 10),
      database: dbName || fallback.database,
      user: decodeURIComponent(parsed.username || fallback.user),
      password: decodeURIComponent(parsed.password || fallback.password),
    };
  } catch {
    return fallback;
  }
};

const getBackupRetentionWindows = (now = new Date()) => {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const week1Start = new Date(todayStart);
  week1Start.setDate(week1Start.getDate() - 7);
  const week1End = new Date(week1Start);
  week1End.setDate(week1End.getDate() + 1);

  return { todayStart, tomorrowStart, yesterdayStart, week1Start, week1End };
};

const getBackupRetentionBucket = (mtimeMs, now = new Date()) => {
  if (!Number.isFinite(mtimeMs)) return null;
  const ts = new Date(mtimeMs);
  if (Number.isNaN(ts.getTime())) return null;

  const { todayStart, tomorrowStart, yesterdayStart, week1Start, week1End } = getBackupRetentionWindows(now);
  if (ts >= todayStart && ts < tomorrowStart) return "day";
  if (ts >= yesterdayStart && ts < todayStart) return "day-1";
  if (ts >= week1Start && ts < week1End) return "week-1";
  return null;
};

const readBackupDirectoryEntries = async () => {
  await fs.mkdir(DB_BACKUP_DIR, { recursive: true });

  const entries = await fs.readdir(DB_BACKUP_DIR, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".dump")) continue;
    if (!isSafeBackupFileName(entry.name)) continue;

    const filePath = path.join(DB_BACKUP_DIR, entry.name);
    try {
      const stat = await fs.stat(filePath);
      const prefix = getBackupPrefixFromFileName(entry.name);
      items.push({
        fileName: entry.name,
        filePath,
        prefix: prefix || "",
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtime.getTime(),
      });
    } catch {
      // Ignore files that disappear during listing.
    }
  }

  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items;
};

const applyDbBackupRetentionPolicy = async () => {
  const now = new Date();
  const entries = await readBackupDirectoryEntries();
  const keepByBucket = new Map();
  const keepPrefixes = new Set();

  for (const entry of entries) {
    const bucket = getBackupRetentionBucket(entry.mtimeMs, now);
    if (!bucket) continue;
    if (keepByBucket.has(bucket)) continue;
    keepByBucket.set(bucket, entry);
    if (entry.prefix) keepPrefixes.add(entry.prefix);
  }

  const deletedFiles = [];
  const allEntries = await fs.readdir(DB_BACKUP_DIR, { withFileTypes: true });
  for (const entry of allEntries) {
    if (!entry.isFile()) continue;
    if (!isManagedBackupArtifact(entry.name)) continue;
    const prefix = getBackupPrefixFromFileName(entry.name);
    if (!prefix) continue;
    if (keepPrefixes.has(prefix)) continue;
    const filePath = path.join(DB_BACKUP_DIR, entry.name);
    try {
      await fs.unlink(filePath);
      deletedFiles.push(entry.name);
    } catch {
      // Ignore files that disappear during cleanup.
    }
  }

  return {
    kept: {
      day: keepByBucket.get("day")?.fileName ?? null,
      "day-1": keepByBucket.get("day-1")?.fileName ?? null,
      "week-1": keepByBucket.get("week-1")?.fileName ?? null,
    },
    deletedCount: deletedFiles.length,
  };
};

const listDbBackups = async () => {
  const entries = await readBackupDirectoryEntries();
  return entries
    .map(({ fileName, sizeBytes, createdAt }) => ({ fileName, sizeBytes, createdAt }))
    .slice(0, MAX_DB_BACKUP_LIST);
};

const createDbBackup = async () => {
  const pgDumpPath = await resolvePgDumpPath();
  if (!pgDumpPath) {
    throw new Error("pg_dump executable not found. Set PG_DUMP_PATH or PG_BIN_DIR.");
  }
  const pgDumpAllPath = await resolvePgDumpAllPath();
  if (!pgDumpAllPath) {
    throw new Error("pg_dumpall executable not found. Set PG_DUMPALL_PATH or PG_BIN_DIR.");
  }

  const config = getBackupConnectionConfig();
  if (!config.user) {
    throw new Error("Missing database user. Set PGUSER or DATABASE_URL.");
  }
  if (!config.database) {
    throw new Error("Missing database name. Set PGDATABASE or DATABASE_URL.");
  }

  await fs.mkdir(DB_BACKUP_DIR, { recursive: true });

  const backupPrefix = `${config.database}_${formatBackupTimestamp()}`;
  const fileName = `${backupPrefix}.dump`;
  const filePath = path.join(DB_BACKUP_DIR, fileName);
  const globalsFileName = `${backupPrefix}${BACKUP_GLOBALS_SUFFIX}`;
  const globalsFilePath = path.join(DB_BACKUP_DIR, globalsFileName);
  const manifestFileName = `${backupPrefix}${BACKUP_MANIFEST_SUFFIX}`;
  const manifestFilePath = path.join(DB_BACKUP_DIR, manifestFileName);

  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    filePath,
    "--host",
    config.host,
    "--port",
    String(config.port),
    "--username",
    config.user,
    config.database,
  ];
  const globalsArgs = [
    "--globals-only",
    "--host",
    config.host,
    "--port",
    String(config.port),
    "--username",
    config.user,
  ];

  const env = { ...process.env };
  if (config.password) {
    env.PGPASSWORD = config.password;
  }

  await execFileAsync(pgDumpPath, args, { env, maxBuffer: 10 * 1024 * 1024 });
  const globalsOutput = await execFileAsync(pgDumpAllPath, globalsArgs, {
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  await fs.writeFile(globalsFilePath, String(globalsOutput.stdout ?? ""), "utf8");

  const [stat, globalsStat] = await Promise.all([fs.stat(filePath), fs.stat(globalsFilePath)]);
  const [pgDumpVersion, pgDumpAllVersion] = await Promise.all([
    readExecutableVersion(pgDumpPath),
    readExecutableVersion(pgDumpAllPath),
  ]);

  const manifest = {
    generatedAt: new Date().toISOString(),
    database: config.database,
    host: config.host,
    port: config.port,
    files: {
      dump: { fileName, sizeBytes: stat.size },
      globals: { fileName: globalsFileName, sizeBytes: globalsStat.size },
    },
    tools: {
      pg_dump: pgDumpVersion,
      pg_dumpall: pgDumpAllVersion,
    },
  };
  await fs.writeFile(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const retention = await applyDbBackupRetentionPolicy();

  return {
    fileName,
    globalsFileName,
    manifestFileName,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
    retention,
  };
};

const getGitInfo = async () => {
  const args = [
    "-C",
    REPO_ROOT,
    "log",
    "-1",
    "--pretty=format:%H%n%s%n%an%n%ad",
    "--date=iso-strict",
  ];

  const candidates = [
    process.env.GIT_EXECUTABLE ? String(process.env.GIT_EXECUTABLE).trim() : null,
    "git",
    // Windows server bundle path: C:\CRA_Local_Main\tools\git\cmd\git.exe (sibling of app)
    path.join(REPO_ROOT, "..", "tools", "git", "cmd", "git.exe"),
    path.join(REPO_ROOT, "..", "tools", "git", "bin", "git.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, args, { timeout: 3000, windowsHide: true });
      const [hash, message, author, date] = stdout.trim().split("\n");
      return { hash, message, author, date };
    } catch {
      // Try the next candidate.
    }
  }

  return readBuildInfo();
};

const checkRateLimit = async (pool, req) => {
  const windowMs = 60_000;
  const limit = 60;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const key = `${getClientKey(req)}:${windowStartMs}`;

  // Atomic upsert to avoid race conditions under concurrent requests.
  const result = await pool.query(
    `
    INSERT INTO rate_limits (key, window_start, count)
    VALUES ($1, $2, 1)
    ON CONFLICT (key)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
    `,
    [key, windowStart]
  );

  const newCount = Number(result.rows?.[0]?.count ?? 0);
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

  return withTransaction(pool, async (client) => {
    await client.query("INSERT INTO counters (name, value) VALUES ($1, 0) ON CONFLICT (name) DO NOTHING", [
      counterName,
    ]);

    const result = await client.query("UPDATE counters SET value = value + 1 WHERE name = $1 RETURNING value", [
      counterName,
    ]);

    const value = result.rows?.[0]?.value;
    if (!value) throw new Error("Failed to generate request id");
    return `CRA${dateStamp}${String(value).padStart(2, "0")}`;
  });
};

const getRequestById = async (pool, id) => {
  const row = await pool.query("SELECT id, data FROM requests WHERE id = $1", [id]);

  const data = row.rows?.[0]?.data;
  const rowId = row.rows?.[0]?.id ?? id;
  return safeParseRequest(data, { id: rowId });
};

const requestSummarySelect =
  'SELECT id, status, created_at, updated_at, ' +
  "data->>'clientName' as \"clientName\", " +
  "data->>'applicationVehicle' as \"applicationVehicle\", " +
  "data->>'country' as \"country\", " +
  "data->>'createdBy' as \"createdBy\", " +
  "data->>'createdByName' as \"createdByName\" " +
  "FROM requests ORDER BY updated_at DESC";

const fetchAdminLists = async (pool) => {
  const { rows } = await pool.query(
    "SELECT id, category, value FROM admin_list_items ORDER BY category, sort_order, value"
  );

  const lists = {};
  for (const category of ADMIN_LIST_CATEGORIES) {
    lists[category] = [];
  }

  for (const row of rows) {
    if (!lists[row.category]) {
      lists[row.category] = [];
    }
    lists[row.category].push({ id: row.id, value: row.value });
  }

  return lists;
};

let rateLimitUnavailable = false;

export const apiRouter = (() => {
  const router = express.Router();

  router.use(
    asyncHandler(async (req, res, next) => {
      const pool = await getPool();
      // Best-effort rate limiting: if the DB role doesn't have access to the
      // `rate_limits` table (or the table is missing), we don't want the whole API
      // to fail. We log once and disable rate limiting for the lifetime of the
      // process.
      let retryAt = null;
      if (!rateLimitUnavailable) {
        try {
          retryAt = await checkRateLimit(pool, req);
        } catch (error) {
          rateLimitUnavailable = true;
          console.error("Rate limit check failed; disabling rate limiting:", error?.message ?? error);
          retryAt = null;
        }
      }
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

  router.use(
    asyncHandler(async (req, res, next) => {
      req.authUser = null;
      req.authSessionId = null;

      const token = readSessionTokenFromRequest(req);
      if (!token) {
        next();
        return;
      }

      const pool = await getPool();
      const auth = await getAuthFromSessionToken(pool, token);
      if (!auth) {
        clearSessionCookie(res);
        next();
        return;
      }

      req.authUser = auth.user;
      req.authSessionId = auth.sessionId;
      next();
    })
  );

  const requireAdmin = (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.authUser.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  };

  const requireAuth = (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  };

  router.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const body = safeJson(req.body) ?? {};
      const email = String(body.email ?? "").trim();
      const password = String(body.password ?? "").trim();
      if (!email || !password) {
        res.status(400).json({ error: "Missing email or password" });
        return;
      }

      const pool = await getPool();
      await ensureBootstrapAuthData(pool);

      const user = await findUserForLogin(pool, email);
      if (!user || !verifyUserPassword(password, user.password_hash)) {
        await writeAuditLogBestEffort(pool, req, {
          action: "auth.login_failed",
          actorEmail: email,
          result: "error",
          errorMessage: "Invalid credentials",
        });
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const session = await createUserSession(pool, user.id);
      setSessionCookie(res, session.token, session.expiresAt);
      await writeAuditLogBestEffort(pool, req, {
        action: "auth.login_success",
        actor: { id: user.id, email: user.email, role: user.role },
        targetType: "session",
        targetId: session.sessionId ?? null,
        metadata: { expiresAt: session.expiresAt },
      });
      res.json({ user: mapUserRow(user) });
    })
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      if (req.authSessionId) {
        await revokeSessionById(pool, req.authSessionId);
      }
      clearSessionCookie(res);
      await writeAuditLogBestEffort(pool, req, {
        action: "auth.logout",
        targetType: "session",
        targetId: req.authSessionId ?? null,
      });
      res.json({ ok: true });
    })
  );

  router.get(
    "/auth/me",
    asyncHandler(async (req, res) => {
      if (!req.authUser) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      res.json({ user: req.authUser });
    })
  );

  // Self-service: allow any authenticated user to change their password.
  router.post(
    "/auth/change-password",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = safeJson(req.body) ?? {};
      const currentPassword = String(body.currentPassword ?? "").trim();
      const newPassword = String(body.newPassword ?? "").trim();
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "Missing currentPassword or newPassword" });
        return;
      }
      if (newPassword.length < 10) {
        res.status(400).json({ error: "New password must be at least 10 characters" });
        return;
      }
      if (currentPassword === newPassword) {
        res.status(400).json({ error: "New password must be different from current password" });
        return;
      }

      const pool = await getPool();
      const userId = String(req.authUser?.id ?? "").trim();
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      await withTransaction(pool, async (client) => {
        const { rows } = await client.query(
          "SELECT password_hash FROM app_users WHERE id = $1 AND is_active = true LIMIT 1",
          [userId]
        );
        const row = rows?.[0] ?? null;
        if (!row) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        if (!verifyUserPassword(currentPassword, row.password_hash)) {
          await writeAuditLogBestEffort(client, req, {
            action: "auth.password_change_failed",
            result: "error",
            errorMessage: "Invalid current password",
          });
          res.status(400).json({ error: "Invalid current password" });
          return;
        }

        await client.query("UPDATE app_users SET password_hash = $1, updated_at = now() WHERE id = $2", [
          makePasswordHash(newPassword),
          userId,
        ]);

        // Revoke other active sessions for this user (keep current session alive).
        if (req.authSessionId) {
          await client.query(
            `UPDATE auth_sessions
                SET revoked_at = now()
              WHERE user_id = $1
                AND revoked_at IS NULL
                AND id <> $2`,
            [userId, req.authSessionId]
          );
        }

        await writeAuditLogBestEffort(client, req, {
          action: "auth.password_changed",
          targetType: "user",
          targetId: userId,
        });
      });

      if (res.headersSent) return;
      res.json({ ok: true });
    })
  );

  router.post(
    "/auth/change-email/request",
    requireAuth,
    asyncHandler(async (req, res) => {
      // Company policy: login emails are managed by Admin and must remain fixed.
      res.status(403).json({ error: "Email change is disabled" });
      return;

      const body = safeJson(req.body) ?? {};
      const newEmailRaw = String(body.newEmail ?? "").trim();
      const newEmail = normalizeLoginEmail(newEmailRaw);
      const currentPassword = String(body.currentPassword ?? "").trim();
      if (!newEmail || !currentPassword) {
        res.status(400).json({ error: "Missing newEmail or currentPassword" });
        return;
      }
      if (!isValidEmail(newEmail)) {
        res.status(400).json({ error: "Invalid email address" });
        return;
      }

      const pool = await getPool();
      const settings = await getM365Settings(pool);
      if (!settings?.senderUpn) {
        res.status(400).json({ error: "Microsoft 365 email is not configured (missing sender)." });
        return;
      }

      const userId = String(req.authUser?.id ?? "").trim();
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const userRes = await pool.query(
        "SELECT id, name, email, password_hash, is_active FROM app_users WHERE id = $1 LIMIT 1",
        [userId]
      );
      const userRow = userRes.rows?.[0] ?? null;
      if (!userRow || userRow.is_active === false) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const currentEmail = normalizeLoginEmail(userRow.email);
      if (newEmail === currentEmail) {
        res.status(400).json({ error: "New email must be different from current email" });
        return;
      }

      if (!verifyUserPassword(currentPassword, userRow.password_hash)) {
        res.status(400).json({ error: "Invalid current password" });
        return;
      }

      // Ensure new email is not used by another active user.
      const conflict = await pool.query(
        "SELECT id FROM app_users WHERE lower(email) = $1 AND is_active = true LIMIT 1",
        [newEmail]
      );
      if (conflict.rows?.[0]?.id) {
        res.status(409).json({ error: "Email already exists" });
        return;
      }

      const token = randomBytes(32).toString("hex");
      const tokenHash = sha256Hex(token);
      const code = generateNumericCode();
      const codeHash = sha256Hex(code);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Best-effort: build confirm URL for the email (if appBaseUrl is configured).
      const baseUrl = String(settings.appBaseUrl ?? "").trim().replace(/\/+$/, "");
      const confirmUrl = baseUrl ? `${baseUrl}/account/verify-email?token=${encodeURIComponent(token)}` : "";

      const logoB64 = await getAccessEmailLogoBase64();
      const attachments = logoB64
        ? [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: ACCESS_EMAIL_LOGO_FILE,
              contentType: "image/png",
              contentBytes: logoB64,
              contentId: ACCESS_EMAIL_LOGO_CID,
              isInline: true,
            },
          ]
        : [];
      const logoSrc = logoB64 ? `cid:${ACCESS_EMAIL_LOGO_CID}` : buildPublicAssetLink(baseUrl, ACCESS_EMAIL_LOGO_FILE);

      const requestId = randomUUID();
      await withTransaction(pool, async (client) => {
        // Invalidate any previous pending requests for this user.
        await client.query(
          "UPDATE auth_email_change_requests SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
          [userId]
        );

        await client.query(
          `INSERT INTO auth_email_change_requests
              (id, user_id, old_email, new_email, token_hash, code_hash, expires_at)
            VALUES
              ($1,$2,$3,$4,$5,$6,$7)`,
          [requestId, userId, currentEmail, newEmail, tokenHash, codeHash, expiresAt.toISOString()]
        );
      });

      const html = renderEmailChangeVerificationHtml({
        userName: userRow.name,
        newEmail,
        code,
        confirmUrl,
        senderUpn: settings.senderUpn,
        logoSrc,
      });

      try {
        const accessToken = await getValidAccessToken(pool);
        await sendMail({
          accessToken,
          subject: EMAIL_CHANGE_SUBJECT,
          bodyHtml: html,
          toEmails: [newEmail],
          attachments,
        });
      } catch (error) {
        try {
          await pool.query("DELETE FROM auth_email_change_requests WHERE id = $1", [requestId]);
        } catch (cleanupError) {
          console.error("Failed to cleanup email-change request after send failure:", cleanupError);
        }
        throw error;
      }

      res.json({ ok: true, expiresAt: expiresAt.toISOString() });
    })
  );

  router.post(
    "/auth/change-email/confirm",
    asyncHandler(async (req, res) => {
      // Company policy: login emails are managed by Admin and must remain fixed.
      res.status(403).json({ error: "Email change is disabled" });
      return;

      const body = safeJson(req.body) ?? {};
      const token = String(body.token ?? "").trim();
      const code = String(body.code ?? "").trim();

      if (!token && !code) {
        res.status(400).json({ error: "Missing token or code" });
        return;
      }

      const pool = await getPool();
      const settings = await getM365Settings(pool);

      const now = new Date();
      const maxAttempts = 5;

      let reqRow = null;
      if (token) {
        const tokenHash = sha256Hex(token);
        const { rows } = await pool.query(
          `SELECT id, user_id, old_email, new_email, expires_at, consumed_at, attempts
             FROM auth_email_change_requests
            WHERE token_hash = $1
            LIMIT 1`,
          [tokenHash]
        );
        reqRow = rows?.[0] ?? null;
      } else {
        // Code confirm requires an authenticated user context to avoid collisions.
        if (!req.authUser?.id) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        const userId = String(req.authUser.id ?? "").trim();
        const { rows } = await pool.query(
          `SELECT id, user_id, old_email, new_email, expires_at, consumed_at, attempts, code_hash
             FROM auth_email_change_requests
            WHERE user_id = $1 AND consumed_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1`,
          [userId]
        );
        reqRow = rows?.[0] ?? null;
        if (reqRow) {
          const codeHash = sha256Hex(code);
          if (codeHash !== String(reqRow.code_hash ?? "")) {
            await pool.query(
              "UPDATE auth_email_change_requests SET attempts = attempts + 1, last_attempt_at = now() WHERE id = $1",
              [reqRow.id]
            );
            res.status(400).json({ error: "Invalid verification code" });
            return;
          }
        }
      }

      if (!reqRow) {
        res.status(404).json({ error: "Verification request not found" });
        return;
      }

      if (reqRow.consumed_at) {
        res.status(400).json({ error: "This verification request is already used." });
        return;
      }

      const expiresAt = reqRow.expires_at ? new Date(reqRow.expires_at) : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
        res.status(400).json({ error: "Verification request expired. Please request a new code." });
        return;
      }

      if ((reqRow.attempts ?? 0) >= maxAttempts) {
        res.status(400).json({ error: "Too many attempts. Please request a new code." });
        return;
      }

      // For token-based confirm, also verify code if provided.
      if (token && code) {
        const codeHash = sha256Hex(code);
        const { rows } = await pool.query(
          "SELECT 1 FROM auth_email_change_requests WHERE id = $1 AND code_hash = $2 LIMIT 1",
          [reqRow.id, codeHash]
        );
        if (!rows.length) {
          await pool.query(
            "UPDATE auth_email_change_requests SET attempts = attempts + 1, last_attempt_at = now() WHERE id = $1",
            [reqRow.id]
          );
          res.status(400).json({ error: "Invalid verification code" });
          return;
        }
      }

      const userId = String(reqRow.user_id ?? "").trim();
      const oldEmail = normalizeLoginEmail(reqRow.old_email);
      const newEmail = normalizeLoginEmail(reqRow.new_email);

      // Apply change.
      let updatedUser = null;
      await withTransaction(pool, async (client) => {
        // Ensure new email still unused.
        const conflict = await client.query(
          "SELECT id FROM app_users WHERE lower(email) = $1 AND is_active = true AND id <> $2 LIMIT 1",
          [newEmail, userId]
        );
        if (conflict.rows?.[0]?.id) {
          res.status(409).json({ error: "Email already exists" });
          return;
        }

        const ures = await client.query(
          `UPDATE app_users
              SET email = $1,
                  updated_at = now()
            WHERE id = $2 AND is_active = true
          RETURNING id, name, email, role, created_at`,
          [newEmail, userId]
        );
        updatedUser = ures.rows?.[0] ?? null;
        if (!updatedUser) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        await client.query("UPDATE auth_email_change_requests SET consumed_at = now() WHERE id = $1", [reqRow.id]);

        // Security: revoke sessions.
        if (req.authSessionId) {
          await client.query(
            `UPDATE auth_sessions
                SET revoked_at = now()
              WHERE user_id = $1
                AND revoked_at IS NULL
                AND id <> $2`,
            [userId, req.authSessionId]
          );
        } else {
          await client.query(
            "UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
            [userId]
          );
        }
      });

      if (res.headersSent) return;

      // Notify old email (best-effort).
      try {
        if (settings?.senderUpn && oldEmail && oldEmail !== newEmail) {
          const logoB64 = await getAccessEmailLogoBase64();
          const attachments = logoB64
            ? [
                {
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: ACCESS_EMAIL_LOGO_FILE,
                  contentType: "image/png",
                  contentBytes: logoB64,
                  contentId: ACCESS_EMAIL_LOGO_CID,
                  isInline: true,
                },
              ]
            : [];
          const logoSrc = logoB64 ? `cid:${ACCESS_EMAIL_LOGO_CID}` : "";
          const html = renderEmailChangedNoticeHtml({
            userName: updatedUser?.name ?? "",
            newEmail,
            senderUpn: settings.senderUpn,
            logoSrc,
          });
          const accessToken = await getValidAccessToken(pool);
          await sendMail({
            accessToken,
            subject: EMAIL_CHANGED_NOTICE_SUBJECT,
            bodyHtml: html,
            toEmails: [oldEmail],
            attachments,
          });
        }
      } catch (e) {
        console.error("Failed to send email-change notification:", e);
      }

      res.json({ ok: true, user: mapUserRow(updatedUser) });
    })
  );

  // Serve uploaded attachments stored in Postgres (request_attachments.data).
  router.get(
    "/attachments/:attachmentId",
    asyncHandler(async (req, res) => {
      const { attachmentId } = req.params;
      const id = String(attachmentId ?? "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing attachment id" });
        return;
      }

      const pool = await getPool();
      const { rows } = await pool.query(
        "SELECT request_id, filename, content_type, data FROM request_attachments WHERE id=$1 LIMIT 1",
        [id]
      );
      const row = rows[0] ?? null;
      if (!row) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }

      await writeAuditLogBestEffort(pool, req, {
        action: "attachment.fetch",
        targetType: "attachment",
        targetId: id,
        metadata: {
          requestId: row.request_id ?? null,
          filename: row.filename ?? null,
        },
      });

      const filename = normalizeFilenameForHeader(row.filename);
      const contentType = String(row.content_type ?? "") || guessContentTypeFromFilename(filename);
      const bytes = row.data;

      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(bytes);
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
      const { rows } = await pool.query(
        "SELECT id, value FROM admin_list_items WHERE category = $1 ORDER BY sort_order, value",
        [category]
      );

      res.json(rows.map((row) => ({ id: row.id, value: row.value })));
    })
  );

  router.get(
    "/admin/users",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      await ensureBootstrapAuthData(pool);

      const { rows } = await pool.query(
        `SELECT id, name, email, role, created_at
           FROM app_users
          WHERE is_active = true
          ORDER BY lower(email)`
      );
      res.json(rows.map((row) => mapUserRow(row)));
    })
  );

  router.post(
    "/admin/users",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const parsed = validateUserPayload({
        name: req.body?.name,
        email: req.body?.email,
        role: req.body?.role,
        password: req.body?.password,
        requirePassword: true,
      });
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const pool = await getPool();
      const id = randomUUID();
      const passwordHash = makePasswordHash(parsed.value.password);
        try {
          const { rows } = await pool.query(
            `INSERT INTO app_users (id, name, email, role, password_hash, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING id, name, email, role, created_at`,
            [id, parsed.value.name, parsed.value.email, parsed.value.role, passwordHash]
          );
          await writeAuditLogBestEffort(pool, req, {
            action: "admin.user_created",
            targetType: "user",
            targetId: id,
            metadata: { email: parsed.value.email, role: parsed.value.role, name: parsed.value.name },
          });
          res.status(201).json(mapUserRow(rows[0]));
        } catch (error) {
          if (String(error?.code ?? "") === "23505") {
            res.status(409).json({ error: "Email already exists" });
            return;
        }
        throw error;
      }
    })
  );

  router.put(
    "/admin/users/:userId",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId ?? "").trim();
      if (!userId) {
        res.status(400).json({ error: "Missing user id" });
        return;
      }

      const parsed = validateUserPayload({
        name: req.body?.name,
        email: req.body?.email,
        role: req.body?.role,
        password: req.body?.newPassword,
        requirePassword: false,
      });
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const newPassword = String(req.body?.newPassword ?? "").trim();
      const pool = await getPool();
      try {
        let updated = null;
        let previousRole = null;
        await withTransaction(pool, async (client) => {
          const targetRes = await client.query(
            "SELECT id, role FROM app_users WHERE id = $1 AND is_active = true",
            [userId]
          );
          const target = targetRes.rows?.[0] ?? null;
          if (!target) {
            res.status(404).json({ error: "User not found" });
            return;
          }
          previousRole = target.role ?? null;

          if (target.role === "admin" && parsed.value.role !== "admin") {
            const countRes = await client.query(
              "SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'admin' AND is_active = true"
            );
            const adminCount = Number.parseInt(countRes.rows?.[0]?.count ?? "0", 10);
            if (adminCount <= 1) {
              res.status(400).json({ error: "Cannot demote the last admin user" });
              return;
            }
          }

          const result = await client.query(
            `UPDATE app_users
                SET name = $1,
                    email = $2,
                    role = $3,
                    password_hash = CASE WHEN $4 = '' THEN password_hash ELSE $5 END,
                    updated_at = now()
              WHERE id = $6
                AND is_active = true
            RETURNING id, name, email, role, created_at`,
            [
              parsed.value.name,
              parsed.value.email,
              parsed.value.role,
              newPassword,
              newPassword ? makePasswordHash(newPassword) : "",
              userId,
            ]
          );
          updated = result.rows?.[0] ?? null;
        });

        if (res.headersSent) return;
        await writeAuditLogBestEffort(pool, req, {
          action: "admin.user_updated",
          targetType: "user",
          targetId: userId,
          metadata: {
            email: parsed.value.email,
            role: parsed.value.role,
            previousRole,
            passwordChanged: Boolean(newPassword),
          },
        });
        res.json(mapUserRow(updated));
      } catch (error) {
        if (String(error?.code ?? "") === "23505") {
          res.status(409).json({ error: "Email already exists" });
          return;
        }
        throw error;
      }
    })
  );

  router.delete(
    "/admin/users/:userId",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId ?? "").trim();
      if (!userId) {
        res.status(400).json({ error: "Missing user id" });
        return;
      }

      if (req.authUser?.id && req.authUser.id === userId) {
        res.status(400).json({ error: "Cannot delete current user" });
        return;
      }

      const pool = await getPool();
      let targetRole = null;
      await withTransaction(pool, async (client) => {
        const countResult = await client.query(
          "SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'admin' AND is_active = true"
        );
        const adminCount = Number.parseInt(countResult.rows?.[0]?.count ?? "0", 10);

        const targetRes = await client.query(
          "SELECT id, role FROM app_users WHERE id = $1 AND is_active = true",
          [userId]
        );
        const target = targetRes.rows?.[0] ?? null;
        if (!target) {
          res.status(404).json({ error: "User not found" });
          return;
        }
        targetRole = target.role ?? null;

        if (target.role === "admin" && adminCount <= 1) {
          res.status(400).json({ error: "Cannot delete the last admin user" });
          return;
        }

        await client.query(
          "UPDATE app_users SET is_active = false, updated_at = now() WHERE id = $1",
          [userId]
        );
        await client.query(
          "UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
          [userId]
        );
      });

      if (res.headersSent) return;
      await writeAuditLogBestEffort(pool, req, {
        action: "admin.user_deactivated",
        targetType: "user",
        targetId: userId,
        metadata: { role: targetRole },
      });
      res.status(204).send();
    })
  );

  router.post(
    "/admin/users/import-legacy",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const rawUsers = Array.isArray(req.body?.users) ? req.body.users : [];
      if (!rawUsers.length) {
        res.status(400).json({ error: "Missing users payload" });
        return;
      }

      const normalized = [];
      const seenEmails = new Set();
      for (const entry of rawUsers) {
        const parsed = validateUserPayload({
          name: entry?.name,
          email: entry?.email,
          role: entry?.role,
          password: entry?.password,
          requirePassword: true,
        });
        if (!parsed.ok) continue;
        if (seenEmails.has(parsed.value.email)) continue;
        seenEmails.add(parsed.value.email);
        normalized.push(parsed.value);
      }

      if (!normalized.length) {
        res.status(400).json({ error: "No valid users to import" });
        return;
      }

      const pool = await getPool();
      let created = 0;
      let updated = 0;

      await withTransaction(pool, async (client) => {
        for (const user of normalized) {
          const existing = await client.query(
            "SELECT id FROM app_users WHERE lower(email) = $1 LIMIT 1",
            [user.email]
          );

          if (existing.rows?.[0]?.id) {
            await client.query(
              `UPDATE app_users
                  SET name = $1,
                      role = $2,
                      password_hash = $3,
                      is_active = true,
                      updated_at = now()
                WHERE id = $4`,
              [user.name, user.role, makePasswordHash(user.password), existing.rows[0].id]
            );
            updated += 1;
          } else {
            await client.query(
              `INSERT INTO app_users (id, name, email, role, password_hash, is_active)
               VALUES ($1, $2, $3, $4, $5, true)`,
              [randomUUID(), user.name, user.email, user.role, makePasswordHash(user.password)]
            );
            created += 1;
          }
        }
      });

      res.json({ created, updated, total: created + updated });
    })
  );

  router.post(
    "/admin/users/:userId/access-email/preview",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId ?? "").trim();
      if (!userId) {
        res.status(400).json({ error: "Missing user id" });
        return;
      }

      const body = safeJson(req.body) ?? {};
      const providedAppUrl = String(body.appUrl ?? "").trim();
      const providedPassword = String(body.temporaryPassword ?? "").trim();

      const pool = await getPool();
      const { rows } = await pool.query(
        "SELECT id, name, email, is_active FROM app_users WHERE id = $1 LIMIT 1",
        [userId]
      );
      const targetUser = rows?.[0] ?? null;
      if (!targetUser || targetUser.is_active === false) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const settings = await getM365Settings(pool);
      const appUrl = providedAppUrl || String(settings.appBaseUrl ?? "").trim();
      if (!appUrl) {
        res.status(400).json({ error: "Missing app URL. Configure Microsoft 365 app base URL or provide appUrl." });
        return;
      }

      const temporaryPassword = providedPassword || generateTemporaryPassword(12);
      const subject = ACCESS_EMAIL_SUBJECT;
      const logoB64 = await getAccessEmailLogoBase64();
      const logoSrc = logoB64
        ? `data:image/png;base64,${logoB64}`
        : buildPublicAssetLink(appUrl, ACCESS_EMAIL_LOGO_FILE);
      const html = renderAccessProvisionEmailHtml({
        userName: targetUser.name,
        loginEmail: targetUser.email,
        temporaryPassword,
        appUrl,
        senderUpn: settings.senderUpn,
        logoSrc,
      });

      res.json({
        toEmail: targetUser.email,
        userName: targetUser.name,
        loginEmail: targetUser.email,
        appUrl,
        temporaryPassword,
        subject,
        html,
      });
    })
  );

  router.post(
    "/admin/users/:userId/access-email/send",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId ?? "").trim();
      if (!userId) {
        res.status(400).json({ error: "Missing user id" });
        return;
      }

      const body = safeJson(req.body) ?? {};
      const providedAppUrl = String(body.appUrl ?? "").trim();
      const providedPassword = String(body.temporaryPassword ?? "").trim();

      const pool = await getPool();
      const { rows } = await pool.query(
        "SELECT id, name, email, is_active, password_hash FROM app_users WHERE id = $1 LIMIT 1",
        [userId]
      );
      const targetUser = rows?.[0] ?? null;
      if (!targetUser || targetUser.is_active === false) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const settings = await getM365Settings(pool);
      const appUrl = providedAppUrl || String(settings.appBaseUrl ?? "").trim();
      if (!appUrl) {
        res.status(400).json({ error: "Missing app URL. Configure Microsoft 365 app base URL or provide appUrl." });
        return;
      }

      const temporaryPassword = providedPassword || generateTemporaryPassword(12);
      const subject = ACCESS_EMAIL_SUBJECT;
      const logoB64 = await getAccessEmailLogoBase64();
      const attachments = logoB64
        ? [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: ACCESS_EMAIL_LOGO_FILE,
              contentType: "image/png",
              contentBytes: logoB64,
              contentId: ACCESS_EMAIL_LOGO_CID,
              isInline: true,
            },
          ]
        : [];
      const logoSrc = logoB64 ? `cid:${ACCESS_EMAIL_LOGO_CID}` : buildPublicAssetLink(appUrl, ACCESS_EMAIL_LOGO_FILE);
      const html = renderAccessProvisionEmailHtml({
        userName: targetUser.name,
        loginEmail: targetUser.email,
        temporaryPassword,
        appUrl,
        senderUpn: settings.senderUpn,
        logoSrc,
      });

      const nextPasswordHash = makePasswordHash(temporaryPassword);
      const previousHash = String(targetUser.password_hash ?? "");
      let passwordUpdated = false;

      try {
        await pool.query(
          `UPDATE app_users
              SET password_hash = $1,
                  updated_at = now()
            WHERE id = $2
              AND is_active = true`,
          [nextPasswordHash, userId]
        );
        passwordUpdated = true;

        const accessToken = await getValidAccessToken(pool);
        await sendMail({
          accessToken,
          subject,
          bodyHtml: html,
          toEmails: [String(targetUser.email)],
          attachments,
        });
      } catch (error) {
        if (passwordUpdated && previousHash) {
          try {
            await pool.query(
              `UPDATE app_users
                  SET password_hash = $1,
                      updated_at = now()
                WHERE id = $2`,
              [previousHash, userId]
            );
          } catch (restoreError) {
            console.error("Failed to restore previous user password hash after email send failure:", restoreError);
          }
        }
        throw error;
      }

      await writeAuditLogBestEffort(pool, req, {
        action: "admin.user_access_email_sent",
        targetType: "user",
        targetId: userId,
        metadata: { toEmail: String(targetUser.email), appUrl },
      });

      res.json({
        ok: true,
        toEmail: targetUser.email,
        appUrl,
        subject,
      });
    })
  );

  router.get(
    "/admin/audit-log",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const pool = await getPool();

      const clampInt = (value, def, min, max) => {
        const parsed = Number.parseInt(String(value ?? ""), 10);
        if (!Number.isFinite(parsed)) return def;
        return Math.min(max, Math.max(min, parsed));
      };

      const page = clampInt(req.query.page, 1, 1, 10_000);
      const pageSize = clampInt(req.query.pageSize, 50, 10, 200);
      const offset = (page - 1) * pageSize;

      const parseDate = (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) return null;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
      };

      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const actorEmail = String(req.query.actorEmail ?? "").trim();
      const actorUserId = String(req.query.actorUserId ?? "").trim();
      const action = String(req.query.action ?? "").trim();
      const targetType = String(req.query.targetType ?? "").trim();
      const targetId = String(req.query.targetId ?? "").trim();
      const result = String(req.query.result ?? "").trim();
      const q = String(req.query.q ?? "").trim();

      const where = [];
      const params = [];
      const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace("$?", `$${params.length}`));
      };

      if (from) add("ts >= $?", from);
      if (to) add("ts <= $?", to);
      if (actorUserId) add("actor_user_id = $?", actorUserId);
      if (actorEmail) add("actor_email ILIKE $?", `%${actorEmail}%`);
      if (action) add("action = $?", action);
      if (targetType) add("target_type = $?", targetType);
      if (targetId) add("target_id ILIKE $?", `%${targetId}%`);
      if (result === "ok" || result === "error") add("result = $?", result);
      if (q) {
        params.push(`%${q}%`);
        const idx = `$${params.length}`;
        where.push(
          `(actor_email ILIKE ${idx} OR action ILIKE ${idx} OR target_id ILIKE ${idx} OR error_message ILIKE ${idx})`
        );
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM audit_log ${whereSql}`, params);
      const total = Number.parseInt(totalRes.rows?.[0]?.count ?? "0", 10) || 0;

      const listParams = [...params, pageSize, offset];
      const listRes = await pool.query(
        `SELECT id, ts, actor_user_id, actor_email, actor_role, action, target_type, target_id, ip, user_agent, result, error_message, metadata
           FROM audit_log
           ${whereSql}
          ORDER BY ts DESC
          LIMIT $${params.length + 1}
         OFFSET $${params.length + 2}`,
        listParams
      );

      res.json({
        page,
        pageSize,
        total,
        rows: listRes.rows.map((r) => ({
          id: r.id,
          ts: r.ts,
          actorUserId: r.actor_user_id,
          actorEmail: r.actor_email,
          actorRole: r.actor_role,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          ip: r.ip,
          userAgent: r.user_agent,
          result: r.result,
          errorMessage: r.error_message,
          metadata: r.metadata ?? null,
        })),
      });
    })
  );

  router.get(
    "/admin/deploy-info",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const lines = clampLineCount(req.query.lines);
      const [gitInfo, buildInfo, logResolve] = await Promise.all([
        getGitInfo(),
        readBuildInfo(),
        resolveDeployLog(),
      ]);

      const logContent = logResolve.selectedPath ? await readLogTail(logResolve.selectedPath, lines) : null;

      res.json({
        git: gitInfo ?? { hash: "", message: "", author: "", date: "" },
        build: buildInfo ?? { builtAt: "" },
        log: {
          lines,
          content: logContent ?? "",
          available: logContent !== null,
          fileName: logResolve.selectedPath ? path.basename(logResolve.selectedPath) : "",
          directory: LOG_DIR,
          tried: logResolve.tried,
          candidates: logResolve.files.map((f) => ({
            name: f.name,
            sizeBytes: f.sizeBytes,
            modifiedAt: new Date(f.mtimeMs).toISOString(),
          })),
        },
      });
    })
  );

  router.get(
    "/admin/db-backups",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const payload = await listDbBackupsWithStatus();
      res.json(payload);
    })
  );

  router.post(
    "/admin/db-backups",
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const payload = await createManagedDbBackup({ mode: "manual", actor: req.authUser || null });
        const status = await listDbBackupsWithStatus();
        res.status(201).json({
          ...status,
          created: payload.created,
        });
      } catch (error) {
        console.error("Failed to create database backup:", error);
        const message = String(error?.message ?? error);
        if (message.includes("in progress")) {
          res.status(409).json({ error: message });
          return;
        }
        res.status(500).json({ error: message });
      }
    })
  );

  router.post(
    "/admin/db-backups/restore",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const fileName = String(req.body?.fileName ?? "").trim();
      const includeGlobals = req.body?.includeGlobals !== false;
      if (!fileName) {
        res.status(400).json({ error: "Missing backup file name." });
        return;
      }

      try {
        const restored = await restoreManagedDbBackup({
          fileName,
          includeGlobals,
          actor: req.authUser || null,
        });
        const status = await listDbBackupsWithStatus();
        res.json({ ok: true, restored, ...status });
      } catch (error) {
        console.error("Failed to restore database backup:", error);
        const message = String(error?.message ?? error);
        if (message.includes("in progress")) {
          res.status(409).json({ error: message });
          return;
        }
        res.status(500).json({ error: message });
      }
    })
  );

  router.get(
    "/admin/db-backup-config",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const config = await getDbBackupConfig();
      res.json(config);
    })
  );

  router.put(
    "/admin/db-backup-config",
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const config = await updateDbBackupConfig({
          enabled: req.body?.enabled,
          scheduleHour: req.body?.scheduleHour,
          scheduleMinute: req.body?.scheduleMinute,
          actor: req.authUser || null,
        });
        res.json(config);
      } catch (error) {
        res.status(400).json({ error: String(error?.message ?? error) });
      }
    })
  );

  router.post(
    "/admin/db-backup-config/setup",
    requireAdmin,
    asyncHandler(async (req, res) => {
      try {
        const config = await setupDbBackupCredentials({
          adminHost: req.body?.adminHost,
          adminPort: req.body?.adminPort,
          adminDatabase: req.body?.adminDatabase,
          adminUser: req.body?.adminUser,
          adminPassword: req.body?.adminPassword,
          backupHost: req.body?.backupHost,
          backupPort: req.body?.backupPort,
          backupDatabase: req.body?.backupDatabase,
          backupUser: req.body?.backupUser,
          backupPassword: req.body?.backupPassword,
          scheduleHour: req.body?.scheduleHour,
          scheduleMinute: req.body?.scheduleMinute,
          enabled: req.body?.enabled,
          actor: req.authUser || null,
        });
        res.json(config);
      } catch (error) {
        console.error("Failed to setup backup credentials:", error);
        res.status(400).json({ error: String(error?.message ?? error) });
      }
    })
  );

  router.get(
    "/admin/db-backups/:fileName/download",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const fileName = String(req.params.fileName ?? "").trim();
      const filePath = resolveBackupFilePath(fileName);
      if (!filePath) {
        res.status(400).json({ error: "Invalid backup file name." });
        return;
      }

      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({ error: "Backup file not found." });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.download(filePath, fileName);
    })
  );

  router.post(
    "/admin/db-backups/import/init",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const importId = randomUUID();
      const importDir = resolveImportDir(importId);
      if (!importDir) {
        res.status(500).json({ error: "Failed to allocate import directory." });
        return;
      }
      await fs.mkdir(importDir, { recursive: true });
      res.status(201).json({ importId, directory: importDir });
    })
  );

  router.post("/admin/db-backups/import/:importId/upload", requireAdmin, (req, res) => {
    const importId = String(req.params.importId ?? "").trim();
    const importDir = resolveImportDir(importId);
    if (!importDir) {
      res.status(400).json({ error: "Invalid import id." });
      return;
    }

    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: 10,
        fileSize: 20 * 1024 * 1024 * 1024, // 20GB per file
      },
    });

    const uploads = [];
    const errors = [];
    const fileWrites = [];
    let fileCount = 0;

    const finalize = async () => {
      if (errors.length) {
        res.status(400).json({ error: errors[0] });
        return;
      }
      if (!fileCount) {
        res.status(400).json({ error: "No files uploaded." });
        return;
      }
      const artifacts = await readManagedBackupArtifactsInDir(importDir);
      const sets = buildBackupSetsFromArtifacts(artifacts);
      res.json({ importId, directory: importDir, uploaded: uploads, sets });
    };

    bb.on("file", (fieldname, file, info) => {
      fileCount += 1;
      const original = String(info?.filename ?? "").trim();
      if (!original || !isSafeManagedBackupFileName(original)) {
        errors.push(`Invalid file name: ${original || "(empty)"}`);
        file.resume();
        return;
      }

      const savePath = path.join(importDir, original);
      let bytes = 0;
      const out = createWriteStream(savePath);
      const writePromise = new Promise((resolve, reject) => {
        out.on("close", resolve);
        out.on("error", reject);
      });
      fileWrites.push(writePromise);
      file.on("data", (d) => {
        bytes += d.length;
      });
      file.on("limit", () => {
        errors.push(`File too large: ${original}`);
        try { out.destroy(); } catch {}
      });
      out.on("error", (err) => {
        errors.push(`Failed to write ${original}: ${String(err?.message ?? err)}`);
        try { file.unpipe(out); } catch {}
        file.resume();
      });
      out.on("close", () => {
        uploads.push({ fileName: original, sizeBytes: bytes });
      });
      file.pipe(out);
    });

    bb.on("error", (err) => {
      errors.push(String(err?.message ?? err));
    });

    bb.on("finish", () => {
      Promise.resolve()
        .then(async () => {
          const results = await Promise.allSettled(fileWrites);
          for (const r of results) {
            if (r.status === "rejected") {
              errors.push(String(r.reason?.message ?? r.reason));
            }
          }
          await finalize();
        })
        .catch((err) => {
          res.status(500).json({ error: String(err?.message ?? err) });
        });
    });

    fs.mkdir(importDir, { recursive: true })
      .then(() => {
        req.pipe(bb);
      })
      .catch((err) => {
        res.status(500).json({ error: String(err?.message ?? err) });
      });
  });

  router.post(
    "/admin/db-backups/import/:importId/validate",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const importId = String(req.params.importId ?? "").trim();
      const importDir = resolveImportDir(importId);
      if (!importDir) {
        res.status(400).json({ error: "Invalid import id." });
        return;
      }
      const artifacts = await readManagedBackupArtifactsInDir(importDir);
      const sets = buildBackupSetsFromArtifacts(artifacts);
      res.json({ importId, directory: importDir, sets });
    })
  );

  router.post(
    "/admin/db-backups/import/:importId/restore",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const importId = String(req.params.importId ?? "").trim();
      const importDir = resolveImportDir(importId);
      if (!importDir) {
        res.status(400).json({ error: "Invalid import id." });
        return;
      }

      const prefix = String(req.body?.prefix ?? "").trim();
      if (!prefix || !/^[A-Za-z0-9._-]+$/.test(prefix)) {
        res.status(400).json({ error: "Invalid prefix." });
        return;
      }
      const dumpName = `${prefix}.dump`;
      const includeGlobals = req.body?.includeGlobals !== false;

      try {
        await fs.access(path.join(importDir, dumpName));
      } catch {
        res.status(404).json({ error: "Dump file not found in import directory." });
        return;
      }

      try {
        const restored = await restoreManagedDbBackup({
          fileName: dumpName,
          includeGlobals,
          actor: req.authUser || null,
          backupDir: importDir,
          mode: "import",
          details: { importId, prefix, fileName: dumpName, includeGlobals },
        });
        const status = await listDbBackupsWithStatus();
        res.json({ ok: true, restored, importId, directory: importDir, ...status });
      } catch (error) {
        console.error("Failed to restore imported database backup:", error);
        const message = String(error?.message ?? error);
        if (message.includes("in progress")) {
          res.status(409).json({ error: message });
          return;
        }
        res.status(500).json({ error: message });
      }
    })
  );

  router.get(
    "/admin/db-monitor",
    asyncHandler(async (req, res) => {
      res.json(getDbMonitorState());
    })
  );

  router.post(
    "/admin/db-monitor/refresh",
    asyncHandler(async (req, res) => {
      const state = await refreshDbMonitorSnapshot();
      res.json(state);
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
      const connected = Boolean(tokenState.hasRefreshToken);
      const isPending =
        latestDc &&
        latestDc.status === "pending" &&
        (!latestDc.expiresAt || new Date(latestDc.expiresAt).getTime() > Date.now());

      res.json({
        settings,
        connection: {
          hasRefreshToken: tokenState.hasRefreshToken,
          expiresAt: tokenState.expiresAt,
        },
        // If we are already connected, hide old device codes from the UI.
        deviceCode: connected
          ? null
          : isPending
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

      const tokenState = await getM365TokenState(pool);
      if (tokenState.hasRefreshToken) {
        // Already connected; never try to redeem an old device code again.
        res.json({ status: "connected" });
        return;
      }

      const latest = await getLatestDeviceCodeSession(pool);
      if (!latest) {
        res.status(400).json({ error: "No device code session. Click \"Start device code\" first." });
        return;
      }
      if (latest.status === "redeeming") {
        // Another poll request is already in-flight; treat it as pending to avoid double-redeem errors.
        res.json({ status: "pending" });
        return;
      }
      if (latest.status !== "pending") {
        res.status(400).json({ error: "This device code session is no longer pending. Click \"Start device code\" to generate a new code." });
        return;
      }
      if (latest.expiresAt && new Date(latest.expiresAt).getTime() <= Date.now()) {
        res.status(400).json({ error: "This device code has expired. Click \"Start device code\" to generate a new code." });
        return;
      }

      // Acquire a DB-level "lock" for this session so only one caller redeems it at a time.
      const claimed = await claimDeviceCodeSessionForRedeem(pool, { id: latest.id });
      if (!claimed) {
        const stateNow = await getM365TokenState(pool);
        res.json({ status: stateNow.hasRefreshToken ? "connected" : "pending" });
        return;
      }

      const result = await pollDeviceCodeToken({
        tenantId: settings.tenantId,
        clientId: settings.clientId,
        deviceCode: latest.deviceCode,
      });

      if (result.ok) {
        await storeTokenResponse(pool, result.json);
        try {
          await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "redeemed" });
        } catch (e) {
          // Non-fatal; just for UI hygiene.
          console.warn("Failed to update device code session status:", e?.message ?? e);
        }
        res.json({ status: "connected" });
        return;
      }

      const err = result.json?.error;
      if (err === "authorization_pending") {
        try {
          await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "pending" });
        } catch {}
        res.json({ status: "pending" });
        return;
      }
      if (err === "slow_down") {
        try {
          await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "pending" });
        } catch {}
        res.json({ status: "slow_down" });
        return;
      }
      if (err === "expired_token") {
        try {
          await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "expired" });
        } catch {}
        res.json({ status: "expired" });
        return;
      }

      const desc = result.json?.error_description || "";
      if (err === "invalid_grant" && desc.toLowerCase().includes("already") && desc.toLowerCase().includes("redeem")) {
        // Often indicates a double-poll (two tabs / rapid clicks). If another request already stored tokens,
        // treat it as connected instead of surfacing a scary error.
        const stateNow = await getM365TokenState(pool);
        if (stateNow.hasRefreshToken) {
          try {
            await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "redeemed" });
          } catch {}
          res.json({ status: "connected" });
          return;
        }
        try {
          await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "redeemed" });
        } catch {}
        res.status(400).json({ status: "error", error: "This device code was already used. Click \"Start device code\" to generate a new code." });
        return;
      }

      // Release the "redeeming" lock on unexpected errors so the user can try again.
      try {
        await updateDeviceCodeSessionStatus(pool, { id: latest.id, status: "pending" });
      } catch {}

      res.status(400).json({
        status: "error",
        error: result.json?.error_description || result.json?.error || "Device code poll failed.",
      });
    })
  );

  router.post(
    "/admin/m365/check",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const state = await getM365TokenState(pool);
      if (!state.hasRefreshToken) {
        res.status(400).json({
          status: "disconnected",
          error: "Microsoft 365 is not connected. Click \"Start device code\" to connect.",
        });
        return;
      }

      try {
        await forceRefreshAccessToken(pool);
      } catch (error) {
        res.status(400).json({
          status: "error",
          error: String(error?.message ?? error),
        });
        return;
      }

      res.json({ status: "connected" });
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
      const sortRow = await pool.query(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM admin_list_items WHERE category = $1",
        [category]
      );
      const sortOrder = sortRow.rows?.[0]?.next ?? 1;

      const id = randomUUID();
      await pool.query(
        "INSERT INTO admin_list_items (id, category, value, sort_order) VALUES ($1, $2, $3, $4)",
        [id, category, value, sortOrder]
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
      await withTransaction(pool, async (client) => {
        const existing = await client.query(
          "SELECT id FROM admin_list_items WHERE category = $1 ORDER BY sort_order, value",
          [category]
        );

        const existingIds = (existing.rows ?? []).map((r) => r.id);
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
          await client.query(
            "UPDATE admin_list_items SET sort_order = $1 WHERE id = $2 AND category = $3",
            [i + 1, finalIds[i], category]
          );
        }
      });
      res.json({ ok: true });
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
      await pool.query("UPDATE admin_list_items SET value = $1 WHERE id = $2 AND category = $3", [
        value,
        itemId,
        category,
      ]);

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
      await pool.query("DELETE FROM admin_list_items WHERE id = $1 AND category = $2", [itemId, category]);

      res.status(204).send();
    })
  );

  router.get(
    "/feedback",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { rows } = await pool.query(
        "SELECT id, type, title, description, steps, severity, page_path, user_name, user_email, user_role, status, created_at, updated_at FROM feedback ORDER BY created_at DESC"
      );

      const data = rows.map((row) => ({
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
        status: row.status ?? "submitted",
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at,
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
      await pool.query(
        `
        INSERT INTO feedback
          (id, type, title, description, steps, severity, page_path, user_name, user_email, user_role, status, created_at, updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          id,
          type,
          title,
          description,
          steps || null,
          severity || null,
          pagePath || null,
          userName || null,
          userEmail || null,
          userRole || null,
          "submitted",
          new Date(nowIso),
          new Date(nowIso),
        ]
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
        status: "submitted",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    })
  );

  router.patch(
    "/feedback/:feedbackId",
    asyncHandler(async (req, res) => {
      const { feedbackId } = req.params;
      const body = req.body;
      const status = String(body?.status ?? "").trim().toLowerCase();
      const allowed = new Set(["submitted", "ongoing", "finished", "cancelled"]);

      if (!feedbackId) {
        res.status(400).json({ error: "Missing feedback id" });
        return;
      }

      if (!allowed.has(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }

      const pool = await getPool();
      const nowIso = new Date().toISOString();
      const result = await pool.query("UPDATE feedback SET status=$1, updated_at=$2 WHERE id=$3", [
        status,
        new Date(nowIso),
        feedbackId,
      ]);

      if (!result.rowCount) {
        res.status(404).json({ error: "Feedback not found" });
        return;
      }

      res.json({ ok: true, id: feedbackId, status, updatedAt: nowIso });
    })
  );

  router.delete(
    "/feedback/:feedbackId",
    asyncHandler(async (req, res) => {
      const { feedbackId } = req.params;
      if (!feedbackId) {
        res.status(400).json({ error: "Missing feedback id" });
        return;
      }

      const pool = await getPool();
      const result = await pool.query("DELETE FROM feedback WHERE id=$1", [feedbackId]);

      if (!result.rowCount) {
        res.status(404).json({ error: "Feedback not found" });
        return;
      }

      res.status(204).send();
    })
  );

  router.get(
    "/price-list",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { rows } = await pool.query(
        "SELECT id, configuration_type, articulation_type, brake_type, brake_size, studs_pcd_standards, created_at, updated_at FROM reference_products ORDER BY updated_at DESC"
      );

      const data = rows.map((row) => ({
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
      await pool.query(
        `
        INSERT INTO reference_products
          (id, configuration_type, articulation_type, brake_type, brake_size, studs_pcd_standards, created_at, updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
        `,
        [
          id,
          body.configurationType ?? "",
          body.articulationType ?? "",
          body.brakeType ?? "",
          body.brakeSize ?? "",
          JSON.stringify(studs),
          new Date(nowIso),
          new Date(nowIso),
        ]
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
      await pool.query(
        `
        UPDATE reference_products
        SET
          configuration_type=$2,
          articulation_type=$3,
          brake_type=$4,
          brake_size=$5,
          studs_pcd_standards=$6::jsonb,
          updated_at=$7
        WHERE id=$1
        `,
        [
          itemId,
          body.configurationType ?? "",
          body.articulationType ?? "",
          body.brakeType ?? "",
          body.brakeSize ?? "",
          JSON.stringify(studs),
          new Date(nowIso),
        ]
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
      await pool.query("DELETE FROM reference_products WHERE id = $1", [itemId]);

      res.status(204).send();
    })
  );

  router.get(
    "/requests",
    asyncHandler(async (req, res) => {
      const pool = await getPool();
      const { rows } = await pool.query("SELECT id, data FROM requests ORDER BY updated_at DESC");

      const parsed = rows
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
      const { rows } = await pool.query(requestSummarySelect);
      res.json(
        rows.map((row) => ({
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

      const { inserts: attachmentInserts } = extractInlineAttachments(requestData);

      await pool.query(
        "INSERT INTO requests (id, data, status, created_at, updated_at) VALUES ($1, $2::jsonb, $3, $4, $5)",
        [id, JSON.stringify(requestData), status, new Date(nowIso), new Date(nowIso)]
      );

      // Persist attachment binaries (urls were already rewritten to /api/attachments/:id above).
      for (const att of attachmentInserts) {
        await pool.query(
          `
          INSERT INTO request_attachments
            (id, request_id, attachment_type, filename, content_type, byte_size, uploaded_at, uploaded_by, data)
          VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            att.id,
            id,
            att.attachmentType,
            att.filename,
            att.contentType,
            att.byteSize,
            att.uploadedAt,
            att.uploadedBy,
            att.data,
          ]
        );
      }

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
                logoCid: "monroc-logo",
                template,
                introOverride: template.intro,
              });
              await pool.query(
                `
                INSERT INTO notification_outbox (id, event_type, request_id, to_emails, subject, body_html)
                VALUES ($1,$2,$3,$4,$5,$6)
                `,
                [randomUUID(), "request_created", id, to.join(", "), subjectTpl || subject, html]
              );
            }
          }
        }
      } catch (e) {
        console.error("Failed to enqueue create email:", e);
      }

      await writeAuditLogBestEffort(pool, req, {
        action: "request.created",
        targetType: "request",
        targetId: id,
        metadata: { status: requestData.status ?? status ?? null },
      });

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

      await pool.query("UPDATE requests SET data=$2::jsonb, status=$3, updated_at=$4 WHERE id=$1", [
        requestId,
        JSON.stringify(updated),
        updated.status,
        new Date(nowIso),
      ]);

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
                logoCid: "monroc-logo",
                template,
                introOverride: template.intro,
              });
              await pool.query(
                `
                INSERT INTO notification_outbox (id, event_type, request_id, to_emails, subject, body_html)
                VALUES ($1,$2,$3,$4,$5,$6)
                `,
                [randomUUID(), "request_status_changed", requestId, to.join(", "), subjectTpl || subject, html]
              );
            }
          }
        }
      } catch (e) {
        console.error("Failed to enqueue status change email:", e);
      }

      await writeAuditLogBestEffort(pool, req, {
        action: "request.status_changed",
        targetType: "request",
        targetId: requestId,
        metadata: { from: previousStatus, to: updated.status ?? null },
      });

      res.json(updated);
    })
  );

  // Enqueue a notification email without changing status/history.
  // Used when a role edits its previously submitted data and we need to re-notify the next step.
  router.post(
    "/requests/:requestId/notify",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const body = safeJson(req.body) ?? {};
      const eventType = String(body.eventType ?? "request_status_changed").trim() || "request_status_changed";
      const actorName = String(body.actorName ?? "").trim();
      const comment = typeof body.comment === "string" ? body.comment : "";

      const pool = await getPool();
      const existing = await getRequestById(pool, requestId);
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      const [settings, tokenState] = await Promise.all([
        getM365Settings(pool),
        getM365TokenState(pool),
      ]);
      if (!settings.enabled) {
        res.json({ enqueued: false, reason: "disabled" });
        return;
      }
      if (!tokenState.hasRefreshToken) {
        res.json({ enqueued: false, reason: "not_connected" });
        return;
      }

      const status = String(body.status ?? existing.status ?? "").trim();
      const to = resolveRecipientsForStatus(settings, status);
      if (!to.length) {
        res.json({ enqueued: false, reason: "no_recipients" });
        return;
      }

      const subjectFallback = `[CRA] Request ${requestId} updated`;
      const link = buildRequestLink(settings.appBaseUrl, requestId);
      const template = getTemplateForEvent(settings, eventType);
      const subjectTpl = applyTemplateVars(template.subject, {
        requestId,
        status,
      });
      const html = renderStatusEmailHtml({
        request: existing,
        newStatus: status,
        actorName,
        comment,
        link,
        dashboardLink: buildDashboardLink(settings.appBaseUrl),
        logoCid: "monroc-logo",
        template,
        introOverride: template.intro,
      });

      await pool.query(
        `
        INSERT INTO notification_outbox (id, event_type, request_id, to_emails, subject, body_html)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [randomUUID(), eventType, requestId, to.join(", "), subjectTpl || subjectFallback, html]
      );

      res.json({ enqueued: true, to });
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

      await materializeRequestAttachments(pool, requestId, updated);

      await pool.query("UPDATE requests SET data=$2::jsonb, status=$3, updated_at=$4 WHERE id=$1", [
        requestId,
        JSON.stringify(updated),
        updated.status ?? existing.status,
        new Date(nowIso),
      ]);

      await writeAuditLogBestEffort(pool, req, {
        action: "request.updated",
        targetType: "request",
        targetId: requestId,
        metadata: {
          status: updated.status ?? existing.status ?? null,
          historyEvent: historyEvent ?? null,
        },
      });

      res.json(updated);
    })
  );

  router.delete(
    "/requests/:requestId",
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      const pool = await getPool();
      await pool.query("DELETE FROM requests WHERE id = $1", [requestId]);
      res.status(204).send();
    })
  );

  return router;
})();
