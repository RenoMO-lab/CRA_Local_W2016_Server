import sql from "mssql";

const getEnv = (name, fallback = undefined) => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return value;
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
};

const parseIntValue = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const config = {
  server: getEnv("DB_SERVER", "localhost"),
  database: getEnv("DB_NAME", "request_navigator"),
  user: getEnv("DB_USER"),
  password: getEnv("DB_PASSWORD"),
  port: parseIntValue(getEnv("DB_PORT"), 1433),
  options: {
    encrypt: parseBool(getEnv("DB_ENCRYPT"), false),
    trustServerCertificate: parseBool(getEnv("DB_TRUST_CERT"), true),
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const instanceName = getEnv("DB_INSTANCE");
if (instanceName) {
  config.options.instanceName = instanceName;
}

const ensureRequiredEnv = () => {
  const required = ["DB_SERVER", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((key) => !getEnv(key));
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
};

let poolPromise;

export const getPool = async () => {
  ensureRequiredEnv();
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
};

export { sql };
