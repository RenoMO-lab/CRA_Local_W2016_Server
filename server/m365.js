import { randomUUID } from "node:crypto";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const getTenant = (tenantId) => (tenantId && tenantId.trim() ? tenantId.trim() : "common");

const formEncode = (payload) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  return params;
};

const ensureFetch = () => {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this Node runtime.");
  }
};

export const parseEmailList = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const items = text
    // Allow admins to paste lists with commas/semicolons/newlines.
    .split(/[;,\n]/g)
    .map((v) => v.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const email of items) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
};

const safeParseJson = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return null;
  }
  return null;
};

const ensureTemplatesColumn = async (pool) => {
  // Older DBs may not have this column yet. Avoid breaking "Save changes" by creating it lazily.
  // Note: requires DDL privileges for the DB user.
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='m365_mail_settings' AND column_name='templates_json' LIMIT 1"
  );
  if (rows.length) return;
  await pool.query("ALTER TABLE m365_mail_settings ADD COLUMN templates_json jsonb NULL");
};

export const getM365Settings = async (pool) => {
  const { rows } = await pool.query("SELECT * FROM m365_mail_settings WHERE id = 1");
  const row = rows[0] ?? {};
  return {
    enabled: Boolean(row.enabled),
    tenantId: row.tenant_id ?? "",
    clientId: row.client_id ?? "",
    senderUpn: row.sender_upn ?? "",
    appBaseUrl: row.app_base_url ?? "",
    recipientsSales: row.recipients_sales ?? "",
    recipientsDesign: row.recipients_design ?? "",
    recipientsCosting: row.recipients_costing ?? "",
    recipientsAdmin: row.recipients_admin ?? "",
    testMode: Boolean(row.test_mode),
    testEmail: row.test_email ?? "",
    flowMap: safeParseJson(row.flow_map),
    templates: safeParseJson(row.templates_json),
  };
};

export const updateM365Settings = async (pool, input) => {
  await ensureTemplatesColumn(pool);

  const enabled = !!input?.enabled;
  const tenantId = String(input?.tenantId ?? "").trim();
  const clientId = String(input?.clientId ?? "").trim();
  const senderUpn = String(input?.senderUpn ?? "").trim();
  const appBaseUrl = String(input?.appBaseUrl ?? "").trim();
  const recipientsSales = String(input?.recipientsSales ?? "").trim();
  const recipientsDesign = String(input?.recipientsDesign ?? "").trim();
  const recipientsCosting = String(input?.recipientsCosting ?? "").trim();
  const recipientsAdmin = String(input?.recipientsAdmin ?? "").trim();
  const testMode = !!input?.testMode;
  const testEmail = String(input?.testEmail ?? "").trim();

  const flowMap = safeParseJson(input?.flowMap);
  const flowMapJson = flowMap ? JSON.stringify(flowMap) : null;
  const templates = safeParseJson(input?.templates);
  const templatesJson = templates ? JSON.stringify(templates) : null;

  await pool.query(
    `
    UPDATE m365_mail_settings
    SET
      enabled=$1,
      tenant_id=$2,
      client_id=$3,
      sender_upn=$4,
      app_base_url=$5,
      recipients_sales=$6,
      recipients_design=$7,
      recipients_costing=$8,
      recipients_admin=$9,
      test_mode=$10,
      test_email=$11,
      flow_map=$12::jsonb,
      templates_json=$13::jsonb,
      updated_at=now()
    WHERE id=1
    `,
    [
      enabled,
      tenantId || null,
      clientId || null,
      senderUpn || null,
      appBaseUrl || null,
      recipientsSales || null,
      recipientsDesign || null,
      recipientsCosting || null,
      recipientsAdmin || null,
      testMode,
      testEmail || null,
      flowMapJson,
      templatesJson,
    ]
  );
};

export const getM365TokenState = async (pool) => {
  const { rows } = await pool.query("SELECT refresh_token, expires_at FROM m365_mail_tokens WHERE id = 1");
  const row = rows[0] ?? {};
  return {
    hasRefreshToken: Boolean(row.refresh_token),
    expiresAt: row.expires_at ?? null,
  };
};

export const clearM365Tokens = async (pool) => {
  await pool.query(
    `
    UPDATE m365_mail_tokens
    SET
      access_token=NULL,
      refresh_token=NULL,
      expires_at=NULL,
      scope=NULL,
      token_type=NULL,
      updated_at=now()
    WHERE id=1
    `
  );
};

export const startDeviceCodeFlow = async ({ tenantId, clientId, scope }) => {
  ensureFetch();
  const tenant = getTenant(tenantId);
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formEncode({
      client_id: clientId,
      scope,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Device code request failed: ${res.status} ${text}`.trim());
  }
  return res.json();
};

export const storeDeviceCodeSession = async (pool, dc) => {
  const intervalSeconds = Number.parseInt(String(dc?.interval ?? ""), 10);
  const expiresIn = Number.parseInt(String(dc?.expires_in ?? ""), 10);
  const expiresAt = Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null;
  const id = randomUUID();

  // Avoid having multiple "pending" codes in the UI. Old ones become confusing fast.
  await pool.query("UPDATE m365_device_code_sessions SET status='superseded' WHERE status='pending'");

  await pool.query(
    `
    INSERT INTO m365_device_code_sessions
      (id, device_code, user_code, verification_uri, verification_uri_complete, message, interval_seconds, expires_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      id,
      dc.device_code,
      dc.user_code ?? null,
      dc.verification_uri ?? null,
      dc.verification_uri_complete ?? null,
      dc.message ?? null,
      Number.isFinite(intervalSeconds) ? intervalSeconds : null,
      expiresAt,
    ]
  );

  return id;
};

export const getLatestDeviceCodeSession = async (pool) => {
  const { rows } = await pool.query(
    `
    SELECT id, device_code, user_code, verification_uri, verification_uri_complete, message, interval_seconds, expires_at, status, created_at
    FROM m365_device_code_sessions
    ORDER BY created_at DESC
    LIMIT 1
    `
  );
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    id: row.id,
    deviceCode: row.device_code,
    userCode: row.user_code,
    verificationUri: row.verification_uri,
    verificationUriComplete: row.verification_uri_complete,
    message: row.message,
    intervalSeconds: row.interval_seconds,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
};

export const pollDeviceCodeToken = async ({ tenantId, clientId, deviceCode }) => {
  ensureFetch();
  const tenant = getTenant(tenantId);
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formEncode({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: deviceCode,
    }),
  });
  const json = await res.json().catch(() => null);
  if (res.ok) return { ok: true, json };
  return { ok: false, json, status: res.status };
};

export const storeTokenResponse = async (pool, tokenJson) => {
  const expiresIn = Number.parseInt(String(tokenJson?.expires_in ?? ""), 10);
  const expiresAt = Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null;

  // Some providers omit refresh_token on refresh; never wipe it in that case.
  const refreshToken =
    tokenJson && Object.prototype.hasOwnProperty.call(tokenJson, "refresh_token")
      ? (tokenJson.refresh_token ?? null)
      : undefined;

  await pool.query(
    `
    UPDATE m365_mail_tokens
    SET
      access_token=$1,
      refresh_token=COALESCE($2, refresh_token),
      expires_at=$3,
      scope=COALESCE($4, scope),
      token_type=COALESCE($5, token_type),
      updated_at=now()
    WHERE id=1
    `,
    [
      tokenJson?.access_token ?? null,
      refreshToken ?? null,
      expiresAt,
      tokenJson?.scope ?? null,
      tokenJson?.token_type ?? null,
    ]
  );
};

export const updateDeviceCodeSessionStatus = async (pool, { id, status }) => {
  const next = String(status ?? "").trim();
  if (!next) return;
  await pool.query("UPDATE m365_device_code_sessions SET status=$1 WHERE id=$2", [next, id]);
};

// Concurrency guard for device-code polling: only one request should attempt redemption at a time.
// Returns the number of affected rows (1 if lock acquired, 0 otherwise).
export const claimDeviceCodeSessionForRedeem = async (pool, { id }) => {
  const result = await pool.query(
    "UPDATE m365_device_code_sessions SET status='redeeming' WHERE id=$1 AND status='pending'",
    [id]
  );
  return result?.rowCount ?? 0;
};

const refreshAccessToken = async ({ tenantId, clientId, refreshToken, scope }) => {
  ensureFetch();
  const tenant = getTenant(tenantId);
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formEncode({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
      scope,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`Token refresh failed: ${err}`);
  }
  return json;
};

export const getValidAccessToken = async (pool) => {
  const settings = await getM365Settings(pool);
  if (!settings.clientId) throw new Error("Missing Microsoft 365 client id.");
  if (!settings.tenantId) throw new Error("Missing Microsoft 365 tenant id.");

  const { rows } = await pool.query("SELECT access_token, refresh_token, expires_at FROM m365_mail_tokens WHERE id = 1");
  const row = rows[0] ?? {};
  const accessToken = row.access_token ?? null;
  const refreshToken = row.refresh_token ?? null;
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const now = Date.now();

  if (accessToken && expiresAt && expiresAt.getTime() - now > 60_000) {
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error("Microsoft 365 is not connected (missing refresh token).");
  }

  const scope = "offline_access Mail.Send";
  const refreshed = await refreshAccessToken({
    tenantId: settings.tenantId,
    clientId: settings.clientId,
    refreshToken,
    scope,
  });
  await storeTokenResponse(pool, refreshed);
  return refreshed.access_token;
};

export const forceRefreshAccessToken = async (pool) => {
  const settings = await getM365Settings(pool);
  if (!settings.clientId) throw new Error("Missing Microsoft 365 client id.");
  if (!settings.tenantId) throw new Error("Missing Microsoft 365 tenant id.");

  const { rows } = await pool.query("SELECT refresh_token FROM m365_mail_tokens WHERE id = 1");
  const row = rows[0] ?? {};
  const refreshToken = row.refresh_token ?? null;
  if (!refreshToken) {
    throw new Error("Microsoft 365 is not connected (missing refresh token).");
  }

  const scope = "offline_access Mail.Send";
  const refreshed = await refreshAccessToken({
    tenantId: settings.tenantId,
    clientId: settings.clientId,
    refreshToken,
    scope,
  });
  await storeTokenResponse(pool, refreshed);
  return refreshed.access_token;
};

export const sendMail = async ({ accessToken, subject, bodyHtml, toEmails, attachments }) => {
  ensureFetch();
  const recipients = Array.isArray(toEmails) ? toEmails : [];
  if (!recipients.length) throw new Error("Missing email recipients.");

  const att = Array.isArray(attachments) ? attachments.filter(Boolean) : [];

  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: bodyHtml,
        },
        toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        ...(att.length ? { attachments: att } : {}),
      },
      saveToSentItems: true,
    }),
  });
  if (res.status === 202) return;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`.trim());
  }
};

