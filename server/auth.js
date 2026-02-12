import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { withTransaction } from "./db.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const SESSION_COOKIE_NAME = String(process.env.SESSION_COOKIE_NAME || "cra_sid").trim() || "cra_sid";
const SESSION_COOKIE_SECURE =
  String(process.env.SESSION_COOKIE_SECURE || "").trim().toLowerCase() === "true";
const SESSION_TTL_HOURS = Number.parseInt(process.env.SESSION_TTL_HOURS || "24", 10);
const SESSION_TTL_MS = Math.max(1, Number.isFinite(SESSION_TTL_HOURS) ? SESSION_TTL_HOURS : 24) * 60 * 60 * 1000;

const BOOTSTRAP_ADMIN_NAME = String(process.env.BOOTSTRAP_ADMIN_NAME || "Admin").trim() || "Admin";
const BOOTSTRAP_ADMIN_EMAIL =
  String(process.env.BOOTSTRAP_ADMIN_EMAIL || "r.molinier@sonasia.monroc.com").trim().toLowerCase() ||
  "r.molinier@sonasia.monroc.com";
const BOOTSTRAP_ADMIN_PASSWORD =
  String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "123#56Rt9").trim() || "123#56Rt9";

const LEGACY_SEED_USERS = [
  { name: "Renaud", email: "r.molinier@sonasia.monroc.com", role: "admin", password: "4689" },
  { name: "Leo", email: "leo@sonasia.monroc.com", role: "sales", password: "K987" },
  { name: "Kevin", email: "kevin@sonasia.monroc.com", role: "sales", password: "K123" },
  { name: "Phoebe", email: "phoebe@sonasia.monroc.com", role: "design", password: "P123" },
  { name: "Bai", email: "bairumei@sonasia.monroc.com", role: "costing", password: "B345" },
  { name: "ZhaoHe", email: "zhaohe@sonasia.monroc.com", role: "design", password: "Z678" },
];

const VALID_ROLES = new Set(["sales", "design", "costing", "admin"]);

let bootstrapDone = false;
let bootstrapPromise = null;

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const normalizeName = (value) => String(value ?? "").trim();
const normalizeRole = (value) => {
  const role = String(value ?? "").trim().toLowerCase();
  return VALID_ROLES.has(role) ? role : null;
};

const parseCookies = (headerValue) => {
  const source = String(headerValue ?? "");
  if (!source) return {};
  return source.split(";").reduce((acc, pair) => {
    const [k, ...rest] = pair.split("=");
    const key = String(k ?? "").trim();
    if (!key) return acc;
    const value = rest.join("=").trim();
    acc[key] = decodeURIComponent(value || "");
    return acc;
  }, {});
};

const hashSessionToken = (token) => createHash("sha256").update(String(token ?? "")).digest("hex");

const serializeUser = (row) => ({
  id: String(row?.id ?? ""),
  name: String(row?.name ?? ""),
  email: String(row?.email ?? ""),
  role: String(row?.role ?? ""),
  createdAt: row?.created_at ?? null,
});

const hashPassword = (password) => {
  const plain = String(password ?? "");
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
};

const verifyPassword = (password, storedHash) => {
  const raw = String(storedHash ?? "");
  const [algo, nRaw, rRaw, pRaw, saltB64, hashB64] = raw.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;

  const n = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  try {
    const expected = Buffer.from(hashB64, "base64");
    const derived = scryptSync(String(password ?? ""), Buffer.from(saltB64, "base64"), expected.length, {
      N: n,
      r,
      p,
    });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
};

const buildSeedUsers = () => {
  const byEmail = new Map();
  const add = (entry) => {
    const email = normalizeEmail(entry?.email);
    const name = normalizeName(entry?.name);
    const role = normalizeRole(entry?.role);
    const password = String(entry?.password ?? "").trim();
    if (!email || !name || !role || !password) return;
    byEmail.set(email, { name, email, role, password });
  };

  for (const user of LEGACY_SEED_USERS) add(user);

  // Bootstrap admin must win over any legacy default with the same email.
  add({
    name: BOOTSTRAP_ADMIN_NAME,
    email: BOOTSTRAP_ADMIN_EMAIL,
    role: "admin",
    password: BOOTSTRAP_ADMIN_PASSWORD,
  });

  return Array.from(byEmail.values());
};

export const readSessionTokenFromRequest = (req) => {
  const cookies = parseCookies(req?.headers?.cookie);
  return String(cookies?.[SESSION_COOKIE_NAME] ?? "").trim();
};

export const setSessionCookie = (res, sessionToken, expiresAt) => {
  const expires = expiresAt instanceof Date ? expiresAt : new Date(Date.now() + SESSION_TTL_MS);
  res.cookie(SESSION_COOKIE_NAME, String(sessionToken ?? ""), {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE,
    path: "/",
    expires,
  });
};

export const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: SESSION_COOKIE_SECURE,
    path: "/",
  });
};

export const ensureBootstrapAuthData = async (pool) => {
  if (bootstrapDone) return;
  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }

  bootstrapPromise = (async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM app_users");
      const count = Number.parseInt(rows?.[0]?.count ?? "0", 10);
      if (count > 0) return;

      const seeds = buildSeedUsers();
      for (const seed of seeds) {
        await client.query(
          `INSERT INTO app_users (id, name, email, role, password_hash, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [randomUUID(), seed.name, seed.email, seed.role, hashPassword(seed.password)]
        );
      }
    });
    bootstrapDone = true;
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
};

export const findUserForLogin = async (pool, email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { rows } = await pool.query(
    `SELECT id, name, email, role, password_hash, is_active, created_at
       FROM app_users
      WHERE lower(email) = $1
      LIMIT 1`,
    [normalized]
  );
  const row = rows?.[0] ?? null;
  if (!row || row.is_active === false) return null;
  return row;
};

export const verifyUserPassword = (plainText, storedHash) => verifyPassword(plainText, storedHash);

export const createUserSession = async (pool, userId) => {
  const sessionId = randomUUID();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, session_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, String(userId), tokenHash, expiresAt.toISOString()]
  );

  return { sessionId, token, expiresAt };
};

export const revokeSessionById = async (pool, sessionId) => {
  if (!sessionId) return;
  await pool.query(
    `UPDATE auth_sessions
        SET revoked_at = now()
      WHERE id = $1
        AND revoked_at IS NULL`,
    [String(sessionId)]
  );
};

export const getAuthFromSessionToken = async (pool, token) => {
  const raw = String(token ?? "").trim();
  if (!raw) return null;
  const tokenHash = hashSessionToken(raw);

  const { rows } = await pool.query(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
            u.id, u.name, u.email, u.role, u.created_at, u.is_active
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.session_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  const row = rows?.[0] ?? null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.is_active === false) return null;
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;

  await pool.query("UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]);

  return {
    sessionId: row.session_id,
    user: serializeUser(row),
  };
};

export const mapUserRow = (row) => serializeUser(row);

export const validateUserPayload = ({ name, email, role, password, requirePassword = true }) => {
  const normalized = {
    name: normalizeName(name),
    email: normalizeEmail(email),
    role: normalizeRole(role),
    password: String(password ?? ""),
  };

  if (!normalized.name) return { ok: false, error: "Missing name" };
  if (!normalized.email) return { ok: false, error: "Missing email" };
  if (!normalized.role) return { ok: false, error: "Invalid role" };
  if (requirePassword && !normalized.password.trim()) return { ok: false, error: "Missing password" };

  return {
    ok: true,
    value: {
      name: normalized.name,
      email: normalized.email,
      role: normalized.role,
      password: normalized.password.trim(),
    },
  };
};

export const makePasswordHash = (plainTextPassword) => hashPassword(plainTextPassword);

export const SESSION_CONFIG = {
  cookieName: SESSION_COOKIE_NAME,
  ttlHours: SESSION_TTL_HOURS,
};
