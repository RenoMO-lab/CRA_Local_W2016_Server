import { randomUUID } from "node:crypto";
import { getPool } from "./db.js";
import { getM365Settings, getM365TokenState, parseEmailList } from "./m365.js";
import { generateStatusIntegrityReport } from "./statusIntegrity.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const getSnapshotDate = (isoValue) => String(isoValue ?? "").slice(0, 10);

const buildAlertPayload = (report) => ({
  snapshotDate: getSnapshotDate(report.generatedAt),
  generatedAt: report.generatedAt,
  mismatchCount: report.mismatchCount,
  repeatedSubmitLoopCount: report.repeatedSubmitLoopCount,
  actionPath: "/settings?tab=deployments",
});

const enqueueInAppIntegrityAlerts = async (pool, report) => {
  const payload = buildAlertPayload(report);
  const title = "Request status integrity alert";
  const body = `${report.mismatchCount} request(s) have status/history mismatches.`;

  const { rows: admins } = await pool.query(
    `
    SELECT id
      FROM app_users
     WHERE is_active = true
       AND role = 'admin'
    `
  );

  if (!admins?.length) return 0;

  let inserted = 0;
  for (const admin of admins) {
    const { rowCount } = await pool.query(
      `
      INSERT INTO app_notifications
        (id, user_id, notification_type, title, body, payload_json)
      VALUES
        ($1, $2, 'status_integrity_alert', $3, $4, $5::jsonb)
      ON CONFLICT DO NOTHING
      `,
      [randomUUID(), String(admin.id), title, body, JSON.stringify(payload)]
    );
    inserted += rowCount ?? 0;
  }

  return inserted;
};

const enqueueIntegrityEmailAlert = async (pool, report) => {
  const [settings, tokenState] = await Promise.all([getM365Settings(pool), getM365TokenState(pool)]);
  if (!settings.enabled || !tokenState.hasRefreshToken) return { queued: false, reason: "email_disabled_or_disconnected" };

  const recipients = parseEmailList(settings.recipientsAdmin);
  if (!recipients.length) return { queued: false, reason: "no_admin_recipients" };

  const snapshotDate = getSnapshotDate(report.generatedAt);
  const existing = await pool.query(
    `
    SELECT 1
      FROM notification_outbox
     WHERE event_type = 'status_integrity_alert'
       AND created_at >= date_trunc('day', now())
     LIMIT 1
    `
  );
  if (existing.rows?.length) return { queued: false, reason: "already_queued_today" };

  const subject = `[CRA] Status integrity alert (${report.mismatchCount})`;
  const appBaseUrl = String(settings.appBaseUrl ?? "").trim().replace(/\/+$/, "");
  const dashboardLink = appBaseUrl ? `${appBaseUrl}/settings?tab=deployments` : "";
  const cta = dashboardLink
    ? `<p><a href="${dashboardLink}">Open deployment diagnostics</a></p>`
    : "";
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827">
      <h2 style="margin:0 0 8px 0;">Request status integrity alert</h2>
      <p style="margin:0 0 8px 0;">Snapshot date: <strong>${snapshotDate}</strong></p>
      <p style="margin:0 0 8px 0;">Mismatches found: <strong>${report.mismatchCount}</strong></p>
      <p style="margin:0 0 8px 0;">Repeated clarification resubmits: <strong>${report.repeatedSubmitLoopCount}</strong></p>
      ${cta}
    </div>
  `;

  await pool.query(
    `
    INSERT INTO notification_outbox (id, event_type, request_id, to_emails, subject, body_html)
    VALUES ($1, 'status_integrity_alert', NULL, $2, $3, $4)
    `,
    [randomUUID(), recipients.join(", "), subject, html]
  );
  return { queued: true, reason: null };
};

export const startStatusIntegrityMonitor = ({ intervalMs = DEFAULT_INTERVAL_MS } = {}) => {
  const effectiveIntervalMs = Number.parseInt(String(intervalMs ?? DEFAULT_INTERVAL_MS), 10);
  const cadenceMs = Number.isFinite(effectiveIntervalMs) && effectiveIntervalMs >= 60_000
    ? effectiveIntervalMs
    : DEFAULT_INTERVAL_MS;

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pool = await getPool();
      const report = await generateStatusIntegrityReport(pool, { limit: 50 });
      if (report.mismatchCount <= 0) return;

      const [inAppResult, emailResult] = await Promise.all([
        enqueueInAppIntegrityAlerts(pool, report),
        enqueueIntegrityEmailAlert(pool, report),
      ]);

      console.warn(
        "[status-integrity] mismatches detected",
        JSON.stringify({
          mismatchCount: report.mismatchCount,
          repeatedSubmitLoopCount: report.repeatedSubmitLoopCount,
          inAppInserted: inAppResult,
          emailQueued: Boolean(emailResult?.queued),
          emailReason: emailResult?.reason ?? null,
        })
      );
    } catch (error) {
      console.error("[status-integrity] monitor tick failed:", error?.message ?? error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, cadenceMs);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
};
