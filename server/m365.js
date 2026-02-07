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

const safeParseFlowMap = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {
    return null;
  }
  return null;
};

export const getM365Settings = async (pool) => {
  const { recordset } = await pool.request().query("SELECT TOP 1 * FROM m365_mail_settings WHERE id = 1");
  const row = recordset[0] ?? {};
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
    flowMap: safeParseFlowMap(row.flow_map),
  };
};

export const updateM365Settings = async (pool, input) => {
  const enabled = input?.enabled ? 1 : 0;
  const tenantId = String(input?.tenantId ?? "").trim();
  const clientId = String(input?.clientId ?? "").trim();
  const senderUpn = String(input?.senderUpn ?? "").trim();
  const appBaseUrl = String(input?.appBaseUrl ?? "").trim();
  const recipientsSales = String(input?.recipientsSales ?? "").trim();
  const recipientsDesign = String(input?.recipientsDesign ?? "").trim();
  const recipientsCosting = String(input?.recipientsCosting ?? "").trim();
  const recipientsAdmin = String(input?.recipientsAdmin ?? "").trim();
  const testMode = input?.testMode ? 1 : 0;
  const testEmail = String(input?.testEmail ?? "").trim();
  const flowMap = safeParseFlowMap(input?.flowMap);
  const flowMapJson = flowMap ? JSON.stringify(flowMap) : null;

  await pool
    .request()
    .input("enabled", enabled)
    .input("tenant_id", tenantId || null)
    .input("client_id", clientId || null)
    .input("sender_upn", senderUpn || null)
    .input("app_base_url", appBaseUrl || null)
    .input("recipients_sales", recipientsSales || null)
    .input("recipients_design", recipientsDesign || null)
    .input("recipients_costing", recipientsCosting || null)
    .input("recipients_admin", recipientsAdmin || null)
    .input("test_mode", testMode)
    .input("test_email", testEmail || null)
    .input("flow_map", flowMapJson)
    .query(
      "UPDATE m365_mail_settings SET enabled=@enabled, tenant_id=@tenant_id, client_id=@client_id, sender_upn=@sender_upn, app_base_url=@app_base_url, recipients_sales=@recipients_sales, recipients_design=@recipients_design, recipients_costing=@recipients_costing, recipients_admin=@recipients_admin, test_mode=@test_mode, test_email=@test_email, flow_map=@flow_map, updated_at=SYSUTCDATETIME() WHERE id = 1"
    );
};

export const getM365TokenState = async (pool) => {
  const { recordset } = await pool.request().query("SELECT TOP 1 refresh_token, expires_at FROM m365_mail_tokens WHERE id = 1");
  const row = recordset[0] ?? {};
  return {
    hasRefreshToken: Boolean(row.refresh_token),
    expiresAt: row.expires_at ?? null,
  };
};

export const clearM365Tokens = async (pool) => {
  await pool
    .request()
    .query("UPDATE m365_mail_tokens SET access_token=NULL, refresh_token=NULL, expires_at=NULL, scope=NULL, token_type=NULL, updated_at=SYSUTCDATETIME() WHERE id = 1");
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

  await pool
    .request()
    .input("device_code", dc.device_code)
    .input("user_code", dc.user_code ?? null)
    .input("verification_uri", dc.verification_uri ?? null)
    .input("verification_uri_complete", dc.verification_uri_complete ?? null)
    .input("message", dc.message ?? null)
    .input("interval_seconds", Number.isFinite(intervalSeconds) ? intervalSeconds : null)
    .input("expires_at", expiresAt)
    .query(
      "INSERT INTO m365_device_code_sessions (device_code, user_code, verification_uri, verification_uri_complete, message, interval_seconds, expires_at) VALUES (@device_code, @user_code, @verification_uri, @verification_uri_complete, @message, @interval_seconds, @expires_at)"
    );
};

export const getLatestDeviceCodeSession = async (pool) => {
  const { recordset } = await pool
    .request()
    .query(
      "SELECT TOP 1 id, device_code, user_code, verification_uri, verification_uri_complete, message, interval_seconds, expires_at, status, created_at FROM m365_device_code_sessions ORDER BY created_at DESC"
    );
  const row = recordset[0] ?? null;
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

  await pool
    .request()
    .input("access_token", tokenJson?.access_token ?? null)
    .input("refresh_token", tokenJson?.refresh_token ?? null)
    .input("expires_at", expiresAt)
    .input("scope", tokenJson?.scope ?? null)
    .input("token_type", tokenJson?.token_type ?? null)
    .query(
      "UPDATE m365_mail_tokens SET access_token=@access_token, refresh_token=@refresh_token, expires_at=@expires_at, scope=@scope, token_type=@token_type, updated_at=SYSUTCDATETIME() WHERE id = 1"
    );
};

export const refreshAccessToken = async ({ tenantId, clientId, refreshToken, scope }) => {
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

  const { recordset } = await pool.request().query("SELECT TOP 1 access_token, refresh_token, expires_at FROM m365_mail_tokens WHERE id = 1");
  const row = recordset[0] ?? {};
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

export const sendMail = async ({ accessToken, subject, bodyHtml, toEmails }) => {
  ensureFetch();
  const recipients = Array.isArray(toEmails) ? toEmails : [];
  if (!recipients.length) throw new Error("Missing email recipients.");

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
