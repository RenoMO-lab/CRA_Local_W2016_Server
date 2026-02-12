import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { closePool, getPool } from "./db.js";

const execFileAsync = promisify(execFile);
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

const BACKUP_GLOBALS_SUFFIX = "_globals.sql";
const BACKUP_MANIFEST_SUFFIX = "_manifest.json";
const DEFAULT_DB_BACKUP_DIR = path.resolve(process.env.DB_BACKUP_DIR || "C:\\CRA_Local_W2016_Main\\backups\\postgres");
const MAX_DB_BACKUP_LIST = 100;

const DEFAULT_SCHEDULE_HOUR = 1;
const DEFAULT_SCHEDULE_MINUTE = 0;
const DEFAULT_TASK_NAME = "CRA_Local_DailyDbBackup";
const DEFAULT_RETENTION_POLICY = "Keep latest day, day-1, and week-1 backup";

const ENCRYPTION_KEY_SOURCE =
  String(process.env.BACKUP_CREDENTIALS_SECRET || "").trim() ||
  `fallback|${String(process.env.PGDATABASE || "cra_local")}|${os.hostname()}|${String(
    process.env.SESSION_COOKIE_NAME || "cra_sid"
  )}`;

let backupOp = {
  inProgress: false,
  operation: "",
  startedAt: null,
  error: null,
};

let schedulerTimer = null;
let schedulerTickRunning = false;

const isSafeBackupFileName = (value) => /^[A-Za-z0-9._-]+\.dump$/i.test(String(value ?? ""));

const formatBackupTimestamp = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}${ss}`;
};

const normalizePort = (value, fallback = 5432) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeScheduleHour = (value) => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_SCHEDULE_HOUR), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SCHEDULE_HOUR;
  return Math.min(Math.max(parsed, 0), 23);
};

const normalizeScheduleMinute = (value) => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_SCHEDULE_MINUTE), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SCHEDULE_MINUTE;
  return Math.min(Math.max(parsed, 0), 59);
};

const computeNextRunAt = (hour, minute, now = new Date()) => {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
};

const getBackupPrefixFromFileName = (fileName) => {
  const name = String(fileName ?? "").trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith(".dump")) return name.slice(0, -5);
  if (lower.endsWith(BACKUP_GLOBALS_SUFFIX)) return name.slice(0, -BACKUP_GLOBALS_SUFFIX.length);
  if (lower.endsWith(BACKUP_MANIFEST_SUFFIX)) return name.slice(0, -BACKUP_MANIFEST_SUFFIX.length);
  return null;
};

const isManagedBackupArtifact = (fileName) => Boolean(getBackupPrefixFromFileName(fileName));

const buildEncryptionKey = () => createHash("sha256").update(ENCRYPTION_KEY_SOURCE).digest();

const encryptSecret = (plainText) => {
  const iv = randomBytes(12);
  const key = buildEncryptionKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(String(plainText ?? ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
};

const decryptSecret = ({ cipher, iv, tag }) => {
  if (!cipher || !iv || !tag) return "";
  const key = buildEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(String(iv), "base64"));
  decipher.setAuthTag(Buffer.from(String(tag), "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(String(cipher), "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
};

const quoteIdent = (value) => {
  const ident = String(value ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    throw new Error(`Invalid identifier: ${ident}`);
  }
  return `"${ident.replaceAll('"', '""')}"`;
};

const resolveExecutable = async (candidates) => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = String(candidate).trim();
    if (!value) continue;
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
      // Try next candidate.
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

const resolvePgDumpPath = async () => {
  const fromBinDir = process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, process.platform === "win32" ? "pg_dump.exe" : "pg_dump")
    : null;
  return resolveExecutable([
    process.env.PG_DUMP_PATH,
    fromBinDir,
    path.join(APP_ROOT, "tools", "postgresql", "bin", process.platform === "win32" ? "pg_dump.exe" : "pg_dump"),
    process.platform === "win32" ? "pg_dump.exe" : "pg_dump",
  ]);
};

const resolvePgDumpAllPath = async () => {
  const fromBinDir = process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, process.platform === "win32" ? "pg_dumpall.exe" : "pg_dumpall")
    : null;
  return resolveExecutable([
    process.env.PG_DUMPALL_PATH,
    fromBinDir,
    path.join(APP_ROOT, "tools", "postgresql", "bin", process.platform === "win32" ? "pg_dumpall.exe" : "pg_dumpall"),
    process.platform === "win32" ? "pg_dumpall.exe" : "pg_dumpall",
  ]);
};

const resolvePgRestorePath = async () => {
  const fromBinDir = process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, process.platform === "win32" ? "pg_restore.exe" : "pg_restore")
    : null;
  return resolveExecutable([
    process.env.PG_RESTORE_PATH,
    fromBinDir,
    path.join(APP_ROOT, "tools", "postgresql", "bin", process.platform === "win32" ? "pg_restore.exe" : "pg_restore"),
    process.platform === "win32" ? "pg_restore.exe" : "pg_restore",
  ]);
};

const resolvePsqlPath = async () => {
  const fromBinDir = process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, process.platform === "win32" ? "psql.exe" : "psql")
    : null;
  return resolveExecutable([
    process.env.PSQL_PATH,
    fromBinDir,
    path.join(APP_ROOT, "tools", "postgresql", "bin", process.platform === "win32" ? "psql.exe" : "psql"),
    process.platform === "win32" ? "psql.exe" : "psql",
  ]);
};

const resolveNpmPath = async () => {
  return resolveExecutable([
    path.join(APP_ROOT, "tools", "node", process.platform === "win32" ? "npm.cmd" : "npm"),
    process.platform === "win32" ? "npm.cmd" : "npm",
  ]);
};

const getBackupRetentionWindows = (now = new Date()) => {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
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

const getDefaultSettings = () => ({
  enabled: true,
  host: process.env.PGHOST || "localhost",
  port: normalizePort(process.env.PGPORT, 5432),
  databaseName: process.env.PGDATABASE || "cra_local",
  backupUser: "",
  backupPassword: "",
  configured: false,
  scheduleHour: DEFAULT_SCHEDULE_HOUR,
  scheduleMinute: DEFAULT_SCHEDULE_MINUTE,
  taskName: DEFAULT_TASK_NAME,
  retentionPolicy: DEFAULT_RETENTION_POLICY,
  updatedAt: null,
  updatedBy: null,
});

const getSettingsRow = async (pool) => {
  const { rows } = await pool.query("SELECT * FROM db_backup_settings WHERE id = 1 LIMIT 1");
  return rows?.[0] ?? null;
};

const buildSettingsFromRow = (row) => {
  const defaults = getDefaultSettings();
  if (!row) return defaults;
  let backupPassword = "";
  try {
    backupPassword = decryptSecret({
      cipher: row.password_cipher,
      iv: row.password_iv,
      tag: row.password_tag,
    });
  } catch {
    backupPassword = "";
  }
  return {
    enabled: row.enabled !== false,
    host: String(row.host || defaults.host),
    port: normalizePort(row.port, defaults.port),
    databaseName: String(row.database_name || defaults.databaseName),
    backupUser: String(row.backup_user || ""),
    backupPassword: String(backupPassword || ""),
    configured: Boolean(row.backup_user && row.password_cipher && row.password_iv && row.password_tag),
    scheduleHour: normalizeScheduleHour(row.schedule_hour),
    scheduleMinute: normalizeScheduleMinute(row.schedule_minute),
    taskName: String(row.task_name || DEFAULT_TASK_NAME),
    retentionPolicy: String(row.retention_policy || DEFAULT_RETENTION_POLICY),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
};

const getRuntimeSettings = async () => {
  const pool = await getPool();
  const row = await getSettingsRow(pool);
  return buildSettingsFromRow(row);
};

const getConnectionConfig = (settings) => {
  const host = String(settings.host || "").trim();
  const port = normalizePort(settings.port, 5432);
  const database = String(settings.databaseName || "").trim();
  const user = String(settings.backupUser || "").trim();
  const password = String(settings.backupPassword || "");
  return { host, port, database, user, password };
};

const readBackupDirectoryEntries = async (backupDir) => {
  await fs.mkdir(backupDir, { recursive: true });

  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".dump")) continue;
    if (!isSafeBackupFileName(entry.name)) continue;
    const filePath = path.join(backupDir, entry.name);
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

const applyDbBackupRetentionPolicy = async (backupDir) => {
  const entries = await readBackupDirectoryEntries(backupDir);
  const now = new Date();
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
  const allEntries = await fs.readdir(backupDir, { withFileTypes: true });
  for (const entry of allEntries) {
    if (!entry.isFile()) continue;
    if (!isManagedBackupArtifact(entry.name)) continue;
    const prefix = getBackupPrefixFromFileName(entry.name);
    if (!prefix) continue;
    if (keepPrefixes.has(prefix)) continue;
    const filePath = path.join(backupDir, entry.name);
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

const listDbBackups = async (backupDir) => {
  const entries = await readBackupDirectoryEntries(backupDir);
  return entries.map(({ fileName, sizeBytes, createdAt }) => ({ fileName, sizeBytes, createdAt })).slice(0, MAX_DB_BACKUP_LIST);
};

const startRun = async ({ action, mode, actor = null, details = null }) => {
  const pool = await getPool();
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO db_backup_runs (id, action, mode, status, message, details_json, actor_user_id, actor_email)
     VALUES ($1, $2, $3, 'running', '', $4, $5, $6)`,
    [runId, action, mode, details, actor?.id ?? null, actor?.email ?? null]
  );
  return runId;
};

const finishRun = async ({ runId, status, message, details = null }) => {
  if (!runId) return;
  const pool = await getPool();
  await pool.query(
    `UPDATE db_backup_runs
        SET status = $2,
            message = $3,
            details_json = COALESCE($4::jsonb, details_json),
            finished_at = now()
      WHERE id = $1`,
    [runId, status, String(message || ""), details]
  );
};

const getLatestRun = async (action, mode = null) => {
  const pool = await getPool();
  const params = [action];
  let sql = `SELECT id, action, mode, status, message, details_json, started_at, finished_at, actor_user_id, actor_email
               FROM db_backup_runs
              WHERE action = $1`;
  if (mode) {
    params.push(mode);
    sql += ` AND mode = $${params.length}`;
  }
  sql += " ORDER BY started_at DESC LIMIT 1";
  const { rows } = await pool.query(sql, params);
  return rows?.[0] ?? null;
};

const hasSuccessfulAutoBackupToday = async (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT 1
       FROM db_backup_runs
      WHERE action = 'backup'
        AND mode = 'automatic'
        AND status = 'success'
        AND started_at >= $1
        AND started_at < $2
      LIMIT 1`,
    [start, end]
  );
  return rows.length > 0;
};

const runWithLock = async (operation, fn) => {
  if (backupOp.inProgress) {
    throw new Error(`Backup operation in progress (${backupOp.operation}).`);
  }
  backupOp = {
    inProgress: true,
    operation,
    startedAt: new Date().toISOString(),
    error: null,
  };
  try {
    return await fn();
  } catch (error) {
    backupOp.error = String(error?.message ?? error);
    throw error;
  } finally {
    backupOp = {
      inProgress: false,
      operation: "",
      startedAt: null,
      error: backupOp.error,
    };
  }
};

const assertConfiguredBackupSettings = (settings) => {
  if (!settings.configured) {
    throw new Error("Backup credentials are not configured. Open DB Monitor and run Backup Setup.");
  }
  const cfg = getConnectionConfig(settings);
  if (!cfg.host || !cfg.port || !cfg.database || !cfg.user) {
    throw new Error("Backup configuration is incomplete.");
  }
  return cfg;
};

const saveBackupSettings = async ({
  enabled,
  host,
  port,
  databaseName,
  backupUser,
  backupPassword,
  scheduleHour,
  scheduleMinute,
  updatedBy,
}) => {
  const encrypted = encryptSecret(backupPassword);
  const pool = await getPool();
  await pool.query(
    `INSERT INTO db_backup_settings
      (id, enabled, host, port, database_name, backup_user, password_cipher, password_iv, password_tag, schedule_hour, schedule_minute, task_name, retention_policy, updated_at, updated_by)
     VALUES
      (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
     ON CONFLICT (id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      host = EXCLUDED.host,
      port = EXCLUDED.port,
      database_name = EXCLUDED.database_name,
      backup_user = EXCLUDED.backup_user,
      password_cipher = EXCLUDED.password_cipher,
      password_iv = EXCLUDED.password_iv,
      password_tag = EXCLUDED.password_tag,
      schedule_hour = EXCLUDED.schedule_hour,
      schedule_minute = EXCLUDED.schedule_minute,
      task_name = EXCLUDED.task_name,
      retention_policy = EXCLUDED.retention_policy,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by`,
    [
      enabled !== false,
      host,
      normalizePort(port, 5432),
      databaseName,
      backupUser,
      encrypted.cipher,
      encrypted.iv,
      encrypted.tag,
      normalizeScheduleHour(scheduleHour),
      normalizeScheduleMinute(scheduleMinute),
      DEFAULT_TASK_NAME,
      DEFAULT_RETENTION_POLICY,
      updatedBy || null,
    ]
  );
};

const buildBackupManifest = async ({
  backupDir,
  backupPrefix,
  dumpFileName,
  globalsFileName,
  dumpPath,
  globalsPath,
  cfg,
  pgDumpPath,
  pgDumpAllPath,
}) => {
  const manifestFileName = `${backupPrefix}${BACKUP_MANIFEST_SUFFIX}`;
  const manifestFilePath = path.join(backupDir, manifestFileName);
  const [dumpStat, globalsStat] = await Promise.all([fs.stat(dumpPath), fs.stat(globalsPath)]);
  const [pgDumpVersion, pgDumpAllVersion] = await Promise.all([
    readExecutableVersion(pgDumpPath),
    readExecutableVersion(pgDumpAllPath),
  ]);
  const manifest = {
    generatedAt: new Date().toISOString(),
    database: cfg.database,
    host: cfg.host,
    port: cfg.port,
    files: {
      dump: { fileName: dumpFileName, sizeBytes: dumpStat.size },
      globals: { fileName: globalsFileName, sizeBytes: globalsStat.size },
    },
    tools: {
      pg_dump: pgDumpVersion,
      pg_dumpall: pgDumpAllVersion,
    },
  };
  await fs.writeFile(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifestFileName, dumpStat };
};

export const getDbBackupStatus = async () => {
  const settings = await getRuntimeSettings();
  const backupDir = DEFAULT_DB_BACKUP_DIR;
  await fs.mkdir(backupDir, { recursive: true });
  const latestManual = await getLatestRun("backup", "manual");
  const latestAuto = await getLatestRun("backup", "automatic");
  const latestRestore = await getLatestRun("restore");
  return {
    directory: backupDir,
    inProgress: backupOp.inProgress,
    operation: backupOp.operation || null,
    error: backupOp.error,
    automatic: {
      enabled: settings.enabled,
      configured: settings.configured,
      frequency: `Daily at ${String(settings.scheduleHour).padStart(2, "0")}:${String(settings.scheduleMinute).padStart(2, "0")}`,
      schedule: {
        hour: settings.scheduleHour,
        minute: settings.scheduleMinute,
      },
      taskName: settings.taskName,
      policy: settings.retentionPolicy,
      nextRunAt: computeNextRunAt(settings.scheduleHour, settings.scheduleMinute).toISOString(),
      latestManual,
      latestAuto,
      latestRestore,
    },
  };
};

export const getDbBackupConfig = async () => {
  const settings = await getRuntimeSettings();
  return {
    enabled: settings.enabled,
    configured: settings.configured,
    host: settings.host,
    port: settings.port,
    databaseName: settings.databaseName,
    backupUser: settings.backupUser || "",
    scheduleHour: settings.scheduleHour,
    scheduleMinute: settings.scheduleMinute,
    taskName: settings.taskName,
    retentionPolicy: settings.retentionPolicy,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
    encryptionUsingFallback: !String(process.env.BACKUP_CREDENTIALS_SECRET || "").trim(),
  };
};

export const updateDbBackupConfig = async ({ enabled, scheduleHour, scheduleMinute, actor }) => {
  const settings = await getRuntimeSettings();
  if (!settings.configured) {
    throw new Error("Backup credentials are not configured yet.");
  }
  await saveBackupSettings({
    enabled: enabled ?? settings.enabled,
    host: settings.host,
    port: settings.port,
    databaseName: settings.databaseName,
    backupUser: settings.backupUser,
    backupPassword: settings.backupPassword,
    scheduleHour: scheduleHour ?? settings.scheduleHour,
    scheduleMinute: scheduleMinute ?? settings.scheduleMinute,
    updatedBy: actor?.email || actor?.id || null,
  });
  return getDbBackupConfig();
};

export const setupDbBackupCredentials = async ({
  adminHost,
  adminPort,
  adminDatabase,
  adminUser,
  adminPassword,
  backupHost,
  backupPort,
  backupDatabase,
  backupUser,
  backupPassword,
  scheduleHour,
  scheduleMinute,
  enabled = true,
  actor = null,
}) => {
  const runId = await startRun({
    action: "setup",
    mode: "manual",
    actor,
    details: {
      backupHost,
      backupPort,
      backupDatabase,
      backupUser,
    },
  });

  try {
    const host = String(backupHost || adminHost || "localhost").trim();
    const port = normalizePort(backupPort || adminPort, 5432);
    const databaseName = String(backupDatabase || process.env.PGDATABASE || "cra_local").trim();
    const backupRole = String(backupUser || "cra_backup").trim();
    const backupPass = String(backupPassword || "").trim();
    const adminDb = String(adminDatabase || "postgres").trim();

    if (!host || !databaseName || !backupRole || !backupPass) {
      throw new Error("Missing backup setup fields.");
    }
    if (!adminUser || !adminPassword) {
      throw new Error("Admin Postgres credentials are required for setup.");
    }

    const quotedRole = quoteIdent(backupRole);
    const quotedDb = quoteIdent(databaseName);

    const adminPool = new Pool({
      host: String(adminHost || host).trim(),
      port: normalizePort(adminPort, port),
      database: adminDb,
      user: String(adminUser),
      password: String(adminPassword),
      ssl: false,
      max: 1,
      idleTimeoutMillis: 5_000,
    });

    try {
      const client = await adminPool.connect();
      try {
        await client.query("SELECT 1");

        const dbCheck = await client.query("SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1", [databaseName]);
        if (!dbCheck.rows.length) {
          throw new Error(`Database '${databaseName}' not found.`);
        }

        const roleCheck = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1 LIMIT 1", [backupRole]);
        if (!roleCheck.rows.length) {
          await client.query(`CREATE ROLE ${quotedRole} WITH LOGIN SUPERUSER PASSWORD $1`, [backupPass]);
        } else {
          await client.query(`ALTER ROLE ${quotedRole} WITH LOGIN SUPERUSER PASSWORD $1`, [backupPass]);
        }
        await client.query(`GRANT CONNECT ON DATABASE ${quotedDb} TO ${quotedRole}`);
      } finally {
        client.release();
      }
    } finally {
      await adminPool.end();
    }

    const verifyPool = new Pool({
      host,
      port,
      database: databaseName,
      user: backupRole,
      password: backupPass,
      ssl: false,
      max: 1,
      idleTimeoutMillis: 5_000,
    });
    try {
      await verifyPool.query("SELECT current_user");
      await verifyPool.query("SELECT 1 FROM pg_catalog.pg_authid LIMIT 1");
    } finally {
      await verifyPool.end();
    }

    await saveBackupSettings({
      enabled,
      host,
      port,
      databaseName,
      backupUser: backupRole,
      backupPassword: backupPass,
      scheduleHour,
      scheduleMinute,
      updatedBy: actor?.email || actor?.id || null,
    });

    const config = await getDbBackupConfig();
    await finishRun({
      runId,
      status: "success",
      message: "Backup credentials configured.",
      details: { configured: true, backupUser: backupRole, host, port, databaseName },
    });
    return config;
  } catch (error) {
    await finishRun({
      runId,
      status: "error",
      message: String(error?.message ?? error),
      details: { configured: false },
    });
    throw error;
  }
};

export const listDbBackupsWithStatus = async () => {
  const backupDir = DEFAULT_DB_BACKUP_DIR;
  await fs.mkdir(backupDir, { recursive: true });
  const retention = await applyDbBackupRetentionPolicy(backupDir);
  const items = await listDbBackups(backupDir);
  const status = await getDbBackupStatus();
  return {
    directory: backupDir,
    inProgress: status.inProgress,
    operation: status.operation,
    error: status.error,
    retention,
    items,
    automatic: status.automatic,
  };
};

export const createDbBackup = async ({ mode = "manual", actor = null } = {}) => {
  return runWithLock("backup", async () => {
    const runId = await startRun({
      action: "backup",
      mode,
      actor,
      details: { requestedAt: new Date().toISOString() },
    });

    try {
      const settings = await getRuntimeSettings();
      const cfg = assertConfiguredBackupSettings(settings);
      const backupDir = DEFAULT_DB_BACKUP_DIR;

      const pgDumpPath = await resolvePgDumpPath();
      if (!pgDumpPath) throw new Error("pg_dump executable not found.");
      const pgDumpAllPath = await resolvePgDumpAllPath();
      if (!pgDumpAllPath) throw new Error("pg_dumpall executable not found.");

      await fs.mkdir(backupDir, { recursive: true });

      const backupPrefix = `${cfg.database}_${formatBackupTimestamp()}`;
      const dumpFileName = `${backupPrefix}.dump`;
      const dumpPath = path.join(backupDir, dumpFileName);
      const globalsFileName = `${backupPrefix}${BACKUP_GLOBALS_SUFFIX}`;
      const globalsPath = path.join(backupDir, globalsFileName);

      const env = { ...process.env };
      if (cfg.password) env.PGPASSWORD = cfg.password;

      const dumpArgs = [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        dumpPath,
        "--host",
        cfg.host,
        "--port",
        String(cfg.port),
        "--username",
        cfg.user,
        cfg.database,
      ];

      const globalsArgs = [
        "--globals-only",
        "--host",
        cfg.host,
        "--port",
        String(cfg.port),
        "--username",
        cfg.user,
      ];

      await execFileAsync(pgDumpPath, dumpArgs, { env, maxBuffer: 10 * 1024 * 1024 });
      const globalsOutput = await execFileAsync(pgDumpAllPath, globalsArgs, {
        env,
        maxBuffer: 10 * 1024 * 1024,
      });
      await fs.writeFile(globalsPath, String(globalsOutput.stdout ?? ""), "utf8");

      const { manifestFileName, dumpStat } = await buildBackupManifest({
        backupDir,
        backupPrefix,
        dumpFileName,
        globalsFileName,
        dumpPath,
        globalsPath,
        cfg,
        pgDumpPath,
        pgDumpAllPath,
      });

      const retention = await applyDbBackupRetentionPolicy(backupDir);
      const items = await listDbBackups(backupDir);

      const result = {
        fileName: dumpFileName,
        globalsFileName,
        manifestFileName,
        sizeBytes: dumpStat.size,
        createdAt: new Date().toISOString(),
        retention,
      };

      await finishRun({
        runId,
        status: "success",
        message: "Backup completed.",
        details: result,
      });

      return {
        directory: backupDir,
        created: result,
        retention,
        items,
      };
    } catch (error) {
      await finishRun({
        runId,
        status: "error",
        message: String(error?.message ?? error),
      });
      throw error;
    }
  });
};

export const restoreDbBackup = async ({ fileName, includeGlobals = true, actor = null } = {}) => {
  return runWithLock("restore", async () => {
    const runId = await startRun({
      action: "restore",
      mode: "manual",
      actor,
      details: { fileName, includeGlobals },
    });

    try {
      const name = String(fileName ?? "").trim();
      if (!isSafeBackupFileName(name)) {
        throw new Error("Invalid backup file name.");
      }

      const settings = await getRuntimeSettings();
      const cfg = assertConfiguredBackupSettings(settings);

      const backupDir = DEFAULT_DB_BACKUP_DIR;
      const dumpPath = path.join(backupDir, name);
      const prefix = getBackupPrefixFromFileName(name);
      if (!prefix) throw new Error("Invalid backup prefix.");
      const globalsPath = path.join(backupDir, `${prefix}${BACKUP_GLOBALS_SUFFIX}`);

      const [pgRestorePath, psqlPath, npmPath] = await Promise.all([
        resolvePgRestorePath(),
        resolvePsqlPath(),
        resolveNpmPath(),
      ]);
      if (!pgRestorePath) throw new Error("pg_restore executable not found.");
      if (!psqlPath) throw new Error("psql executable not found.");
      if (!npmPath) throw new Error("npm executable not found.");

      await fs.access(dumpPath);
      if (includeGlobals) {
        try {
          await fs.access(globalsPath);
        } catch {
          throw new Error(`Globals file not found for ${name}.`);
        }
      }

      const env = { ...process.env };
      if (cfg.password) env.PGPASSWORD = cfg.password;

      await closePool();

      await execFileAsync(
        psqlPath,
        [
          "-v",
          "ON_ERROR_STOP=1",
          "-h",
          cfg.host,
          "-p",
          String(cfg.port),
          "-U",
          cfg.user,
          "-d",
          "postgres",
          "-c",
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${cfg.database.replaceAll("'", "''")}' AND pid <> pg_backend_pid();`,
        ],
        { env, maxBuffer: 10 * 1024 * 1024 }
      );

      if (includeGlobals) {
        await execFileAsync(
          psqlPath,
          ["-v", "ON_ERROR_STOP=1", "-h", cfg.host, "-p", String(cfg.port), "-U", cfg.user, "-d", "postgres", "-f", globalsPath],
          { env, maxBuffer: 10 * 1024 * 1024 }
        );
      }

      await execFileAsync(
        pgRestorePath,
        [
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-privileges",
          "-h",
          cfg.host,
          "-p",
          String(cfg.port),
          "-U",
          cfg.user,
          "-d",
          cfg.database,
          dumpPath,
        ],
        { env, maxBuffer: 20 * 1024 * 1024 }
      );

      await execFileAsync(npmPath, ["run", "migrate"], {
        cwd: APP_ROOT,
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
      });

      const pool = await getPool();
      await pool.query("SELECT 1");

      const result = {
        fileName: name,
        includeGlobals,
        restoredAt: new Date().toISOString(),
      };

      await finishRun({
        runId,
        status: "success",
        message: "Restore completed.",
        details: result,
      });
      return result;
    } catch (error) {
      await finishRun({
        runId,
        status: "error",
        message: String(error?.message ?? error),
      });
      throw error;
    }
  });
};

const schedulerTick = async () => {
  if (schedulerTickRunning) return;
  schedulerTickRunning = true;
  try {
    if (backupOp.inProgress) return;
    const settings = await getRuntimeSettings();
    if (!settings.enabled || !settings.configured) return;

    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setHours(settings.scheduleHour, settings.scheduleMinute, 0, 0);
    if (now.getTime() < scheduledAt.getTime()) return;

    const alreadyDoneToday = await hasSuccessfulAutoBackupToday(now);
    if (alreadyDoneToday) return;

    await createDbBackup({ mode: "automatic", actor: null });
  } catch (error) {
    console.error("Automatic backup tick failed:", error?.message ?? error);
  } finally {
    schedulerTickRunning = false;
  }
};

export const startDbBackupScheduler = () => {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    schedulerTick().catch((error) => {
      console.error("Automatic backup tick failed:", error?.message ?? error);
    });
  }, 60 * 1000);
  schedulerTick().catch((error) => {
    console.error("Automatic backup initial check failed:", error?.message ?? error);
  });
};

export const stopDbBackupScheduler = () => {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
};
