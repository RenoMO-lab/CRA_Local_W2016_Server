import { getPool } from "./db.js";
import { getM365Settings, getM365TokenState, getValidAccessToken, parseEmailList, sendMail } from "./m365.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_CID = "monroc-logo";
const LOGO_FILE = "monroc-logo.png";
let cachedLogoAttachment = null;

const getInlineLogoAttachment = async () => {
  if (cachedLogoAttachment) return cachedLogoAttachment;

  const candidates = [
    path.join(REPO_ROOT, "public", LOGO_FILE),
    path.join(REPO_ROOT, "dist", LOGO_FILE),
  ];

  let filePath = null;
  for (const p of candidates) {
    try {
      await fs.access(p);
      filePath = p;
      break;
    } catch {}
  }
  if (!filePath) return null;

  const bytes = await fs.readFile(filePath);
  const base64 = bytes.toString("base64");

  cachedLogoAttachment = {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: LOGO_FILE,
    contentType: "image/png",
    contentId: LOGO_CID,
    isInline: true,
    contentBytes: base64,
  };
  return cachedLogoAttachment;
};

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ADMIN_DAILY_DIGEST_HOUR_LOCAL = 16;

const backoffMs = (attempt) => {
  const base = Math.min(60 * 60_000, Math.max(60_000, 2 ** Math.min(attempt, 10) * 1000));
  // jitter +/- 20%
  const jitter = base * (0.8 + Math.random() * 0.4);
  return Math.floor(jitter);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatLocalDateYmd = (value) => {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatIsoUtc = (value) => {
  const dt = value ? new Date(value) : null;
  if (!dt || Number.isNaN(dt.getTime())) return "";
  return `${dt.toISOString().replace("T", " ").slice(0, 19)} UTC`;
};

const humanizeStatus = (status) =>
  String(status ?? "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const DIGEST_I18N = {
  en: {
    subjectPrefix: "[CRA] Admin daily summary",
    title: "Admin Daily Summary",
    subtitle: "Consolidated notifications",
    intro: "This summary contains admin-targeted CRA notifications batched for today.",
    headers: {
      request: "Request",
      event: "Event",
      status: "Status",
      actor: "Actor",
      time: "Time",
      comment: "Comment",
    },
    requestCreated: "Request Created",
    statusChanged: "Status Changed",
    noComment: "-",
    openRequest: "Open request",
    footer: "You received this email because you are subscribed to CRA request notifications.",
  },
  fr: {
    subjectPrefix: "[CRA] Resume quotidien admin",
    title: "Resume quotidien admin",
    subtitle: "Notifications consolidees",
    intro: "Ce resume contient les notifications CRA destinees aux administrateurs pour aujourd'hui.",
    headers: {
      request: "Demande",
      event: "Evenement",
      status: "Statut",
      actor: "Acteur",
      time: "Heure",
      comment: "Commentaire",
    },
    requestCreated: "Demande creee",
    statusChanged: "Statut modifie",
    noComment: "-",
    openRequest: "Ouvrir la demande",
    footer: "Vous recevez cet e-mail car vous etes abonne aux notifications des demandes CRA.",
  },
  zh: {
    subjectPrefix: "[CRA] 管理员每日报告",
    title: "管理员每日报告",
    subtitle: "通知汇总",
    intro: "此摘要包含今天面向管理员的 CRA 通知汇总。",
    headers: {
      request: "请求",
      event: "事件",
      status: "状态",
      actor: "操作人",
      time: "时间",
      comment: "备注",
    },
    requestCreated: "请求已创建",
    statusChanged: "状态已变更",
    noComment: "-",
    openRequest: "打开请求",
    footer: "您收到此邮件是因为您订阅了 CRA 请求通知。",
  },
};

const getDigestI18n = (lang) => DIGEST_I18N[String(lang ?? "").trim().toLowerCase()] ?? DIGEST_I18N.en;

const mapDigestEventLabel = (lang, eventType) => {
  const i18n = getDigestI18n(lang);
  const type = String(eventType ?? "").trim();
  if (type === "request_created") return i18n.requestCreated;
  if (type === "request_status_changed") return i18n.statusChanged;
  return humanizeStatus(type);
};

const buildRequestLink = (baseUrl, requestId) => {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const rid = String(requestId ?? "").trim();
  if (!base || !rid) return "";
  return `${base}/requests/${encodeURIComponent(rid)}`;
};

const renderAdminDigestEmailHtml = ({ lang, digestDate, rows, appBaseUrl }) => {
  const i18n = getDigestI18n(lang);
  const day = String(digestDate ?? "").trim() || formatLocalDateYmd(new Date());
  const sortedRows = Array.isArray(rows)
    ? [...rows].sort((a, b) => new Date(a?.event_at ?? 0).getTime() - new Date(b?.event_at ?? 0).getTime())
    : [];
  const logoImg = `<img src="cid:${escapeHtml(LOGO_CID)}" width="120" alt="MONROC" style="display:block; border:0; outline:none; text-decoration:none; height:auto;" />`;

  const lines = sortedRows
    .map((row) => {
      const requestId = String(row?.request_id ?? "").trim();
      const reqLink = buildRequestLink(appBaseUrl, requestId);
      const requestCell = reqLink
        ? `<a href="${escapeHtml(reqLink)}" style="color:#1D4ED8; text-decoration:none; font-weight:700;">${escapeHtml(requestId)}</a>`
        : escapeHtml(requestId || "-");
      const previousStatus = String(row?.previous_status ?? "").trim();
      const currentStatus = String(row?.request_status ?? "").trim();
      const statusText =
        previousStatus && previousStatus !== currentStatus
          ? `${humanizeStatus(previousStatus)} -> ${humanizeStatus(currentStatus)}`
          : humanizeStatus(currentStatus || "-");
      const actor = String(row?.actor_name ?? "").trim() || "-";
      const eventText = mapDigestEventLabel(lang, row?.event_type);
      const eventAt = formatIsoUtc(row?.event_at);
      const comment = String(row?.comment ?? "").trim() || i18n.noComment;
      const openText = reqLink ? `<div style="margin-top:4px; font-size:11px;"><a href="${escapeHtml(reqLink)}" style="color:#1D4ED8; text-decoration:none;">${escapeHtml(i18n.openRequest)}</a></div>` : "";

      return `
        <tr>
          <td style="padding:10px 8px; border-bottom:1px solid #E5E7EB; font-size:13px; color:#111827;">${requestCell}${openText}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #E5E7EB; font-size:13px; color:#111827;">${escapeHtml(eventText)}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #E5E7EB; font-size:13px; color:#111827;">${escapeHtml(statusText)}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #E5E7EB; font-size:13px; color:#111827;">${escapeHtml(actor)}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #E5E7EB; font-size:13px; color:#111827; white-space:nowrap;">${escapeHtml(eventAt)}</td>
          <td style="padding:10px 8px; border-bottom:1px solid #E5E7EB; font-size:13px; color:#111827; white-space:pre-wrap;">${escapeHtml(comment)}</td>
        </tr>
      `.trim();
    })
    .join("");

  return `
  <!doctype html>
  <html lang="${escapeHtml(lang)}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </head>
    <body style="margin:0; padding:0; background:#F5F7FB; color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F7FB" style="background:#F5F7FB; width:100%;">
        <tr>
          <td align="center" style="padding:20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="900" style="width:900px; max-width:900px; background:#FFFFFF; border-radius:14px; border:1px solid #E5E7EB; overflow:hidden;">
              <tr>
                <td style="padding:20px 24px; border-bottom:1px solid #E5E7EB;">
                  ${logoImg}
                  <div style="margin-top:12px; font-size:11px; color:#6B7280; letter-spacing:0.08em; text-transform:uppercase;">${escapeHtml(i18n.subtitle)}</div>
                  <div style="margin-top:6px; font-size:24px; font-weight:900; color:#111827;">${escapeHtml(i18n.title)}</div>
                  <div style="margin-top:6px; font-size:13px; color:#374151;">${escapeHtml(day)} | ${escapeHtml(i18n.intro)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px 18px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <th align="left" style="padding:10px 8px; font-size:11px; color:#6B7280; letter-spacing:0.05em; text-transform:uppercase; border-bottom:1px solid #CBD5E1;">${escapeHtml(i18n.headers.request)}</th>
                      <th align="left" style="padding:10px 8px; font-size:11px; color:#6B7280; letter-spacing:0.05em; text-transform:uppercase; border-bottom:1px solid #CBD5E1;">${escapeHtml(i18n.headers.event)}</th>
                      <th align="left" style="padding:10px 8px; font-size:11px; color:#6B7280; letter-spacing:0.05em; text-transform:uppercase; border-bottom:1px solid #CBD5E1;">${escapeHtml(i18n.headers.status)}</th>
                      <th align="left" style="padding:10px 8px; font-size:11px; color:#6B7280; letter-spacing:0.05em; text-transform:uppercase; border-bottom:1px solid #CBD5E1;">${escapeHtml(i18n.headers.actor)}</th>
                      <th align="left" style="padding:10px 8px; font-size:11px; color:#6B7280; letter-spacing:0.05em; text-transform:uppercase; border-bottom:1px solid #CBD5E1;">${escapeHtml(i18n.headers.time)}</th>
                      <th align="left" style="padding:10px 8px; font-size:11px; color:#6B7280; letter-spacing:0.05em; text-transform:uppercase; border-bottom:1px solid #CBD5E1;">${escapeHtml(i18n.headers.comment)}</th>
                    </tr>
                    ${lines}
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 24px 20px 24px; font-size:12px; color:#6B7280; border-top:1px solid #E5E7EB;">${escapeHtml(i18n.footer)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

const processAdminDigestQueue = async ({ pool, settings, accessToken }) => {
  const now = new Date();
  if (now.getHours() < ADMIN_DAILY_DIGEST_HOUR_LOCAL) return;

  const digestDate = formatLocalDateYmd(now);
  if (!digestDate) return;

  const claimed = await pool.query(
    `
    UPDATE notification_admin_digest_queue
    SET status='sending', updated_at=now()
    WHERE id IN (
      SELECT id
      FROM notification_admin_digest_queue
      WHERE status='pending'
        AND digest_date <= $1::date
        AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT 250
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, event_type, request_id, request_status, previous_status, actor_name, comment, to_emails, lang, digest_date, event_at, attempts
    `,
    [digestDate]
  );

  const rows = claimed.rows ?? [];
  if (!rows.length) return;
  let token = accessToken;

  const groups = new Map();
  for (const row of rows) {
    const lang = String(row?.lang ?? "en").trim().toLowerCase() || "en";
    const recipients = parseEmailList(row?.to_emails);
    if (!recipients.length) {
      await pool.query(
        `
        UPDATE notification_admin_digest_queue
        SET status='sent', sent_at=now(), updated_at=now(), last_error='No recipients'
        WHERE id=$1
        `,
        [row.id]
      );
      continue;
    }

    const key = `${lang}|${recipients.map((v) => v.toLowerCase()).sort().join(",")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        lang,
        toEmails: recipients,
        digestDate: String(row?.digest_date ?? digestDate),
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }

  for (const group of groups.values()) {
    const i18n = getDigestI18n(group.lang);
    const subject = `${i18n.subjectPrefix} - ${group.digestDate}`.slice(0, 240);
    const html = renderAdminDigestEmailHtml({
      lang: group.lang,
      digestDate: group.digestDate,
      rows: group.rows,
      appBaseUrl: settings.appBaseUrl,
    });
    const rowIds = group.rows.map((row) => String(row.id)).filter(Boolean);

    try {
      if (!token) token = await getValidAccessToken(pool);
      const attachments = html.includes(`cid:${LOGO_CID}`) ? [await getInlineLogoAttachment()].filter(Boolean) : [];
      await sendMail({
        accessToken: token,
        subject,
        bodyHtml: html,
        toEmails: group.toEmails,
        attachments,
      });

      await pool.query(
        `
        UPDATE notification_admin_digest_queue
        SET status='sent', sent_at=now(), updated_at=now(), last_error=NULL
        WHERE id = ANY($1::text[])
        `,
        [rowIds]
      );
    } catch (err) {
      const message = String(err?.message ?? err);
      for (const row of group.rows) {
        const attempts = Number.parseInt(String(row?.attempts ?? 0), 10) || 0;
        const nextMs = backoffMs(attempts + 1);
        const nextAt = new Date(Date.now() + nextMs);
        await pool.query(
          `
          UPDATE notification_admin_digest_queue
          SET
            status='pending',
            attempts=attempts+1,
            last_error=$2,
            next_attempt_at=$3,
            updated_at=now()
          WHERE id=$1
          `,
          [row.id, message, nextAt]
        );
      }
    }
  }
};

export const startNotificationsWorker = ({ intervalMs = 10_000 } = {}) => {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pool = await getPool();
      const settings = await getM365Settings(pool);
      if (!settings.enabled) return;

      const tokenState = await getM365TokenState(pool);
      if (!tokenState.hasRefreshToken) return;
      let accessToken = null;

      // Claim a small batch without holding locks while sending.
      const claimed = await pool.query(
        `
        UPDATE notification_outbox
        SET status='sending', updated_at=now()
        WHERE id IN (
          SELECT id
          FROM notification_outbox
          WHERE status='pending' AND next_attempt_at <= now()
          ORDER BY created_at ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, to_emails, subject, body_html, attempts
        `
      );

      const rows = claimed.rows ?? [];
      for (const row of rows) {
        const id = row.id;
        const toEmails = parseEmailList(row.to_emails);
        try {
          if (!accessToken) accessToken = await getValidAccessToken(pool);
          const bodyHtml = String(row.body_html ?? "");
          let attachments = [];
          if (bodyHtml.includes(`cid:${LOGO_CID}`)) {
            const inlineLogo = await getInlineLogoAttachment();
            attachments = inlineLogo ? [inlineLogo] : [];
          }

          await sendMail({
            accessToken,
            subject: row.subject,
            bodyHtml,
            toEmails,
            attachments,
          });

          await pool.query(
            `
            UPDATE notification_outbox
            SET status='sent', sent_at=now(), updated_at=now(), last_error=NULL
            WHERE id=$1
            `,
            [id]
          );
        } catch (err) {
          const attempts = Number.parseInt(String(row.attempts ?? 0), 10) || 0;
          const nextMs = backoffMs(attempts + 1);
          const nextAt = new Date(Date.now() + nextMs);
          const message = String(err?.message ?? err);

          await pool.query(
            `
            UPDATE notification_outbox
            SET
              status='pending',
              attempts=attempts+1,
              last_error=$2,
              next_attempt_at=$3,
              updated_at=now()
            WHERE id=$1
            `,
            [id, message, nextAt]
          );
        }

        // Yield a bit between sends to avoid bursts.
        await sleepMs(150);
      }

      await processAdminDigestQueue({ pool, settings, accessToken });
    } catch (e) {
      console.error("Notifications worker tick failed:", e);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  // kick once
  void tick();

  return () => clearInterval(timer);
};
