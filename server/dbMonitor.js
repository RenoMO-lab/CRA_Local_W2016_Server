import { getPool } from "./db.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

let monitorState = {
  snapshot: null,
  lastError: null,
  lastRefreshedAt: null,
  nextRefreshAt: null,
  refreshing: false,
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
};

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const runQuery = async (pool, query) => {
  const result = await pool.request().query(query);
  return Array.isArray(result?.recordset) ? result.recordset : [];
};

const collectDbSnapshot = async (pool) => {
  const errors = [];

  const snapshot = {
    collectedAt: new Date().toISOString(),
    database: null,
    sizeMb: null,
    sessions: {
      userSessions: null,
      activeRequests: null,
      blockedRequests: null,
    },
    topWaits: [],
    topQueries: [],
    errors,
  };

  try {
    const rows = await runQuery(
      pool,
      `
      SELECT
        DB_NAME() AS databaseName,
        @@SERVERNAME AS serverName,
        CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS productVersion,
        CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition
      `
    );
    const r = rows[0] ?? null;
    if (r) {
      snapshot.database = {
        databaseName: String(r.databaseName ?? ""),
        serverName: String(r.serverName ?? ""),
        productVersion: String(r.productVersion ?? ""),
        edition: String(r.edition ?? ""),
      };
    }
  } catch (e) {
    errors.push({ section: "database", message: String(e?.message ?? e) });
  }

  try {
    const rows = await runQuery(
      pool,
      `
      SELECT SUM(size) * 8.0 / 1024.0 AS sizeMb
      FROM sys.database_files
      `
    );
    snapshot.sizeMb = safeNumber(rows?.[0]?.sizeMb);
  } catch (e) {
    errors.push({ section: "size", message: String(e?.message ?? e) });
  }

  // Note: these DMVs typically require VIEW SERVER STATE. If not granted, we surface
  // a readable error and keep the rest of the snapshot.
  try {
    const rows = await runQuery(
      pool,
      `
      SELECT COUNT(*) AS userSessions
      FROM sys.dm_exec_sessions
      WHERE is_user_process = 1
      `
    );
    snapshot.sessions.userSessions = safeNumber(rows?.[0]?.userSessions);
  } catch (e) {
    errors.push({ section: "sessions", message: String(e?.message ?? e) });
  }

  try {
    const rows = await runQuery(
      pool,
      `
      SELECT
        SUM(CASE WHEN status IN ('running','runnable','suspended') THEN 1 ELSE 0 END) AS activeRequests,
        SUM(CASE WHEN blocking_session_id > 0 THEN 1 ELSE 0 END) AS blockedRequests
      FROM sys.dm_exec_requests
      `
    );
    snapshot.sessions.activeRequests = safeNumber(rows?.[0]?.activeRequests);
    snapshot.sessions.blockedRequests = safeNumber(rows?.[0]?.blockedRequests);
  } catch (e) {
    errors.push({ section: "requests", message: String(e?.message ?? e) });
  }

  try {
    const rows = await runQuery(
      pool,
      `
      SELECT TOP (10)
        wait_type AS waitType,
        wait_time_ms AS waitMs
      FROM sys.dm_os_wait_stats
      WHERE wait_type NOT LIKE 'SLEEP%'
        AND wait_type NOT IN ('CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SQLTRACE_BUFFER_FLUSH','WAITFOR','LOGMGR_QUEUE','CHECKPOINT_QUEUE','REQUEST_FOR_DEADLOCK_SEARCH','XE_TIMER_EVENT','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_MANUAL_EVENT','CLR_AUTO_EVENT','DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT','XE_DISPATCHER_WAIT','XE_DISPATCHER_JOIN','BROKER_EVENTHANDLER','BROKER_RECEIVE_WAITFOR')
      ORDER BY wait_time_ms DESC
      `
    );
    snapshot.topWaits = rows.map((r) => ({
      waitType: String(r.waitType ?? ""),
      waitMs: safeNumber(r.waitMs),
    }));
  } catch (e) {
    errors.push({ section: "waits", message: String(e?.message ?? e) });
  }

  try {
    const rows = await runQuery(
      pool,
      `
      SELECT TOP (10)
        CONVERT(varchar(34), qs.query_hash, 1) AS queryHash,
        qs.execution_count AS execCount,
        qs.total_elapsed_time / 1000.0 AS totalMs,
        (qs.total_elapsed_time / NULLIF(qs.execution_count, 0)) / 1000.0 AS avgMs,
        qs.total_worker_time / 1000.0 AS cpuMs,
        qs.total_logical_reads AS logicalReads
      FROM sys.dm_exec_query_stats qs
      ORDER BY qs.total_elapsed_time DESC
      `
    );
    snapshot.topQueries = rows.map((r) => ({
      queryHash: String(r.queryHash ?? ""),
      execCount: safeNumber(r.execCount),
      totalMs: safeNumber(r.totalMs),
      avgMs: safeNumber(r.avgMs),
      cpuMs: safeNumber(r.cpuMs),
      logicalReads: safeNumber(r.logicalReads),
    }));
  } catch (e) {
    errors.push({ section: "queries", message: String(e?.message ?? e) });
  }

  return snapshot;
};

export const getDbMonitorState = () => ({
  snapshot: monitorState.snapshot,
  refreshing: monitorState.refreshing,
  lastError: monitorState.lastError,
  lastRefreshedAt: monitorState.lastRefreshedAt,
  nextRefreshAt: monitorState.nextRefreshAt,
});

export const refreshDbMonitorSnapshot = async () => {
  if (monitorState.refreshing) {
    return getDbMonitorState();
  }

  monitorState.refreshing = true;
  try {
    const pool = await getPool();
    const snapshot = await collectDbSnapshot(pool);
    monitorState.snapshot = snapshot;
    monitorState.lastError = null;
    monitorState.lastRefreshedAt = snapshot.collectedAt;
  } catch (e) {
    monitorState.lastError = String(e?.message ?? e);
  } finally {
    monitorState.refreshing = false;
    monitorState.nextRefreshAt = toIsoOrNull(Date.now() + ONE_HOUR_MS);
  }

  return getDbMonitorState();
};

export const startDbMonitor = () => {
  // Kick off once at startup, then hourly. The UI can also manually refresh.
  refreshDbMonitorSnapshot().catch(() => {});

  const timer = setInterval(() => {
    refreshDbMonitorSnapshot().catch(() => {});
  }, ONE_HOUR_MS);
  // Do not keep the process alive just for this timer.
  timer.unref?.();
};

