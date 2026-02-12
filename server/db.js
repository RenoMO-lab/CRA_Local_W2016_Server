import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const getEnv = (name, fallback = undefined) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value;
};

const parseIntValue = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const ensureRequiredEnv = () => {
  // Prefer DATABASE_URL. Otherwise use discrete PG* vars.
  if (getEnv("DATABASE_URL")) return;
  const required = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = required.filter((key) => !getEnv(key));
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
};

let pool;

export const getPool = async () => {
  ensureRequiredEnv();
  if (!pool) {
    const connectionString = getEnv("DATABASE_URL");
    pool = new Pool(
      connectionString
        ? { connectionString }
        : {
            host: getEnv("PGHOST", "localhost"),
            port: parseIntValue(getEnv("PGPORT"), 5432),
            database: getEnv("PGDATABASE"),
            user: getEnv("PGUSER"),
            password: getEnv("PGPASSWORD"),
            ssl: false,
            max: parseIntValue(getEnv("PGPOOL_MAX"), 10),
            idleTimeoutMillis: parseIntValue(getEnv("PGPOOL_IDLE_MS"), 30_000),
          }
    );

    // If initial connect fails, allow later retries without restarting.
    pool.on("error", (err) => {
      console.error("Postgres pool error:", err);
    });
  }
  return pool;
};

export const closePool = async () => {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
};

export const pingDb = async () => {
  const p = await getPool();
  await p.query("SELECT 1");
};

export const withTransaction = async (poolOrClient, fn) => {
  const poolLike = poolOrClient;
  const client = typeof poolLike.connect === "function" ? await poolLike.connect() : poolLike;
  const shouldRelease = client !== poolOrClient;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    if (shouldRelease) client.release();
  }
};
