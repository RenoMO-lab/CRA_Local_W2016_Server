import { getM365Settings, getM365TokenState, getValidAccessToken, parseEmailList, sendMail } from "./m365.js";

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const backoffMs = (attempt) => {
  const base = Math.min(60 * 60_000, Math.max(60_000, 2 ** Math.min(attempt, 10) * 1000));
  // jitter +/- 20%
  const jitter = base * (0.8 + Math.random() * 0.4);
  return Math.floor(jitter);
};

export const startNotificationsWorker = ({ getPool, intervalMs = 10_000 } = {}) => {
  if (typeof getPool !== "function") {
    throw new Error("startNotificationsWorker requires getPool()");
  }

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

      const { recordset } = await pool
        .request()
        .query(
          "SELECT TOP 10 id, to_emails, subject, body_html, attempts FROM notification_outbox WHERE status = 'pending' AND next_attempt_at <= SYSUTCDATETIME() ORDER BY created_at ASC"
        );
      if (!recordset.length) return;

      const accessToken = await getValidAccessToken(pool);
      for (const row of recordset) {
        const id = row.id;
        const toEmails = parseEmailList(row.to_emails);
        try {
          await pool
            .request()
            .input("id", id)
            .query("UPDATE notification_outbox SET updated_at=SYSUTCDATETIME() WHERE id = @id");

          await sendMail({
            accessToken,
            subject: row.subject,
            bodyHtml: row.body_html,
            toEmails,
          });

          await pool
            .request()
            .input("id", id)
            .query(
              "UPDATE notification_outbox SET status='sent', sent_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME(), last_error=NULL WHERE id = @id"
            );
        } catch (err) {
          const attempts = Number.parseInt(String(row.attempts ?? 0), 10) || 0;
          const nextMs = backoffMs(attempts + 1);
          const nextAt = new Date(Date.now() + nextMs);
          const message = String(err?.message ?? err);

          await pool
            .request()
            .input("id", id)
            .input("last_error", message)
            .input("next_attempt_at", nextAt)
            .query(
              "UPDATE notification_outbox SET attempts = attempts + 1, last_error=@last_error, next_attempt_at=@next_attempt_at, updated_at=SYSUTCDATETIME() WHERE id = @id"
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
