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

const backoffMs = (attempt) => {
  const base = Math.min(60 * 60_000, Math.max(60_000, 2 ** Math.min(attempt, 10) * 1000));
  // jitter +/- 20%
  const jitter = base * (0.8 + Math.random() * 0.4);
  return Math.floor(jitter);
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
      if (!rows.length) return;

      const accessToken = await getValidAccessToken(pool);
      for (const row of rows) {
        const id = row.id;
        const toEmails = parseEmailList(row.to_emails);
        try {
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

