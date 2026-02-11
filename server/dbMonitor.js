import { getPool } from "./db.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const KEEP_SNAPSHOTS = 168; // 7 days of hourly samples

let monitorState = {
  snapshot: null,
  history: [],
  baseline: null,
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

const parseJsonOrNull = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isNoiseWait = (waitType) => {
  const w = String(waitType ?? "").toLowerCase();
  if (!w) return true;
  // Common "idle" or low-signal events in pg_stat_activity.
  if (w.includes("client")) return true;
  if (w.includes("idle")) return true;
  if (w.includes("timeout")) return true;
  return false;
};

const readSnapshots = async (pool, limit) => {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      collected_at AS "collectedAt",
      db_start_time AS "dbStartTime",
      database_name AS "databaseName",
      server_name AS "serverName",
      product_version AS "productVersion",
      edition,
      size_mb AS "sizeMb",
      user_sessions AS "userSessions",
      active_requests AS "activeRequests",
      blocked_requests AS "blockedRequests",
      waits_json AS "waitsJson",
      queries_json AS "queriesJson",
      collector_errors_json AS "collectorErrorsJson"
    FROM db_monitor_snapshots
    ORDER BY collected_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return (rows ?? []).map((row) => {
    const database =
      row.databaseName || row.serverName || row.productVersion || row.edition
        ? {
            databaseName: String(row.databaseName ?? ""),
            serverName: String(row.serverName ?? ""),
            productVersion: String(row.productVersion ?? ""),
            edition: String(row.edition ?? ""),
          }
        : null;

    const errors = parseJsonOrNull(row.collectorErrorsJson);
    return {
      id: row.id,
      collectedAt: toIsoOrNull(row.collectedAt),
      // Keep the existing API field name for the frontend; this is the DB engine start time now.
      sqlserverStartTime: toIsoOrNull(row.dbStartTime),
      database,
      sizeMb: safeNumber(row.sizeMb),
      sessions: {
        userSessions: safeNumber(row.userSessions),
        activeRequests: safeNumber(row.activeRequests),
        blockedRequests: safeNumber(row.blockedRequests),
      },
      waits: Array.isArray(parseJsonOrNull(row.waitsJson)) ? parseJsonOrNull(row.waitsJson) : [],
      topQueries: Array.isArray(parseJsonOrNull(row.queriesJson)) ? parseJsonOrNull(row.queriesJson) : [],
      errors: Array.isArray(errors) ? errors : [],
    };
  });
};

const insertSnapshot = async (pool, snapshot) => {
  await pool.query(
    `
    INSERT INTO db_monitor_snapshots (
      collected_at,
      db_start_time,
      database_name,
      server_name,
      product_version,
      edition,
      size_mb,
      user_sessions,
      active_requests,
      blocked_requests,
      waits_json,
      queries_json,
      collector_errors_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb
    )
    `,
    [
      new Date(snapshot.collectedAt),
      snapshot.sqlserverStartTime ? new Date(snapshot.sqlserverStartTime) : null,
      snapshot.database?.databaseName || null,
      snapshot.database?.serverName || null,
      snapshot.database?.productVersion || null,
      snapshot.database?.edition || null,
      snapshot.sizeMb ?? null,
      snapshot.sessions?.userSessions ?? null,
      snapshot.sessions?.activeRequests ?? null,
      snapshot.sessions?.blockedRequests ?? null,
      JSON.stringify(snapshot.waits ?? []),
      JSON.stringify(snapshot.topQueries ?? []),
      JSON.stringify(snapshot.errors ?? []),
    ]
  );

  // Retention: keep latest KEEP_SNAPSHOTS rows.
  await pool.query(
    `
    DELETE FROM db_monitor_snapshots
    WHERE id NOT IN (
      SELECT id
      FROM db_monitor_snapshots
      ORDER BY collected_at DESC
      LIMIT $1
    )
    `,
    [KEEP_SNAPSHOTS]
  );
};

const collectDbSnapshot = async (pool) => {
  const errors = [];

  const snapshot = {
    collectedAt: new Date().toISOString(),
    sqlserverStartTime: null,
    database: null,
    sizeMb: null,
    sessions: {
      userSessions: null,
      activeRequests: null,
      blockedRequests: null,
    },
    waits: [],
    topQueries: [],
    errors,
  };

  try {
    const { rows } = await pool.query(
      `
      SELECT
        current_database() AS "databaseName",
        COALESCE(inet_server_addr()::text, '') AS "serverName",
        current_setting('server_version') AS "productVersion",
        version() AS "edition"
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
    const { rows } = await pool.query(
      `
      SELECT pg_postmaster_start_time() AS "dbStartTime"
      `
    );
    snapshot.sqlserverStartTime = toIsoOrNull(rows?.[0]?.dbStartTime);
  } catch (e) {
    errors.push({ section: "db_start_time", message: String(e?.message ?? e) });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT pg_database_size(current_database()) / 1024.0 / 1024.0 AS "sizeMb"
      `
    );
    snapshot.sizeMb = safeNumber(rows?.[0]?.sizeMb);
  } catch (e) {
    errors.push({ section: "size", message: String(e?.message ?? e) });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        COUNT(*)::int AS "userSessions",
        COUNT(*) FILTER (WHERE state = 'active')::int AS "activeRequests",
        COUNT(*) FILTER (WHERE array_length(pg_blocking_pids(pid), 1) > 0)::int AS "blockedRequests"
      FROM pg_stat_activity
      WHERE datname = current_database()
      `
    );
    snapshot.sessions.userSessions = safeNumber(rows?.[0]?.userSessions);
    snapshot.sessions.activeRequests = safeNumber(rows?.[0]?.activeRequests);
    snapshot.sessions.blockedRequests = safeNumber(rows?.[0]?.blockedRequests);
  } catch (e) {
    errors.push({ section: "sessions", message: String(e?.message ?? e) });
  }

  // Waits: Postgres doesn't expose cumulative "wait ms" like SQL Server DMVs by default.
  // We approximate by counting sessions per wait event (useful for spotting lock contention).
  try {
    const { rows } = await pool.query(
      `
      SELECT
        COALESCE(wait_event_type, '') AS "waitEventType",
        COALESCE(wait_event, '') AS "waitEvent",
        COUNT(*)::int AS "sessions"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event IS NOT NULL
      GROUP BY wait_event_type, wait_event
      ORDER BY COUNT(*) DESC
      LIMIT 200
      `
    );
    snapshot.waits = (rows ?? []).map((r) => ({
      waitType: `${String(r.waitEventType ?? "").trim()}:${String(r.waitEvent ?? "").trim()}`.replace(/^:/, ""),
      // Keep the numeric field name for the frontend; represents "sessions", not ms.
      waitMs: safeNumber(r.sessions),
    }));
  } catch (e) {
    errors.push({ section: "waits", message: String(e?.message ?? e) });
  }

  try {
    const ext = await pool.query("SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements' LIMIT 1");
    if (!ext.rows.length) {
      errors.push({
        section: "queries",
        message: "pg_stat_statements is not installed; install the extension to see top query stats.",
      });
    } else {
      const { rows } = await pool.query(
        `
        SELECT
          queryid::text AS "queryHash",
          calls::bigint AS "execCount",
          total_exec_time AS "totalMs",
          mean_exec_time AS "avgMs",
          NULL::double precision AS "cpuMs",
          (shared_blks_read + shared_blks_hit)::bigint AS "logicalReads"
        FROM pg_stat_statements
        ORDER BY total_exec_time DESC
        LIMIT 10
        `
      );
      snapshot.topQueries = (rows ?? []).map((r) => ({
        queryHash: String(r.queryHash ?? ""),
        execCount: safeNumber(r.execCount),
        totalMs: safeNumber(r.totalMs),
        avgMs: safeNumber(r.avgMs),
        cpuMs: safeNumber(r.cpuMs),
        logicalReads: safeNumber(r.logicalReads),
      }));
    }
  } catch (e) {
    errors.push({ section: "queries", message: String(e?.message ?? e) });
  }

  return snapshot;
};

const computeHealth = () => {
  const snap = monitorState.snapshot;
  if (monitorState.lastError || !snap) {
    return { status: "red", label: "Error" };
  }
  const ageMs = snap?.collectedAt ? Date.now() - new Date(snap.collectedAt).getTime() : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(ageMs) || ageMs > 2 * ONE_HOUR_MS) {
    return { status: "yellow", label: "Stale" };
  }
  return { status: "green", label: "OK" };
};

const computeWaitDeltas = () => {
  const current = monitorState.snapshot;
  const prev = monitorState.baseline;
  if (!current) return { baselineCollectedAt: null, waits: [], recommended: [] };

  if (!prev) {
    const waits = (current.waits ?? [])
      .map((w) => {
        const key = String(w.waitType ?? "");
        const cur = safeNumber(w.waitMs);
        return {
          waitType: key,
          waitMs: cur,
          deltaWaitMs: null,
          isNoise: isNoiseWait(key),
        };
      })
      .filter((w) => w.waitType)
      .sort((a, b) => Number(b.waitMs ?? 0) - Number(a.waitMs ?? 0))
      .slice(0, 200);

    const recommended = waits
      .filter((w) => !w.isNoise && (w.waitMs ?? 0) > 0)
      .slice(0, 10);

    return { baselineCollectedAt: null, waits, recommended };
  }

  if (!current.sqlserverStartTime || !prev.sqlserverStartTime) {
    return { baselineCollectedAt: prev.collectedAt ?? null, waits: [], recommended: [] };
  }
  if (current.sqlserverStartTime !== prev.sqlserverStartTime) {
    // DB restart: deltas are meaningless.
    return { baselineCollectedAt: prev.collectedAt ?? null, waits: [], recommended: [] };
  }

  const currentTs = current.collectedAt ? new Date(current.collectedAt).getTime() : null;
  const prevTs = prev.collectedAt ? new Date(prev.collectedAt).getTime() : null;
  const hours =
    currentTs !== null && prevTs !== null
      ? Math.max(0.001, (currentTs - prevTs) / ONE_HOUR_MS)
      : 1;

  const prevMap = new Map();
  for (const w of prev.waits ?? []) {
    const key = String(w.waitType ?? "");
    const val = safeNumber(w.waitMs);
    if (key) prevMap.set(key, val ?? 0);
  }

  const waitsAll = (current.waits ?? [])
    .map((w) => {
      const key = String(w.waitType ?? "");
      const cur = safeNumber(w.waitMs);
      const prevVal = prevMap.has(key) ? prevMap.get(key) : null;
      const delta = cur !== null && prevVal !== null ? (cur - prevVal) / hours : null;
      return {
        waitType: key,
        waitMs: cur,
        deltaWaitMs: delta !== null && delta >= 0 ? delta : null,
        isNoise: isNoiseWait(key),
      };
    })
    .filter((w) => w.waitType);

  const waits = waitsAll
    .slice()
    .sort(
      (a, b) =>
        (Number(b.deltaWaitMs ?? 0) - Number(a.deltaWaitMs ?? 0)) ||
        (Number(b.waitMs ?? 0) - Number(a.waitMs ?? 0))
    )
    .slice(0, 200);

  const recommended = waitsAll
    .filter((w) => !w.isNoise && (w.deltaWaitMs ?? 0) > 0)
    .sort((a, b) => (b.deltaWaitMs ?? 0) - (a.deltaWaitMs ?? 0))
    .slice(0, 10);

  return { baselineCollectedAt: prev.collectedAt ?? null, waits, recommended };
};

export const getDbMonitorState = () => {
  const deltas = computeWaitDeltas();
  const historyPoints = (monitorState.history ?? [])
    .slice()
    .reverse()
    .map((s) => ({
      collectedAt: s.collectedAt,
      sizeMb: s.sizeMb,
      userSessions: s.sessions?.userSessions ?? null,
      activeRequests: s.sessions?.activeRequests ?? null,
      blockedRequests: s.sessions?.blockedRequests ?? null,
      partialErrors: Array.isArray(s.errors) ? s.errors.length : 0,
    }));

  return {
    health: computeHealth(),
    snapshot: monitorState.snapshot
      ? {
          id: monitorState.snapshot.id,
          collectedAt: monitorState.snapshot.collectedAt,
          sqlserverStartTime: monitorState.snapshot.sqlserverStartTime ?? null,
          database: monitorState.snapshot.database,
          sizeMb: monitorState.snapshot.sizeMb,
          sessions: monitorState.snapshot.sessions,
          topQueries: monitorState.snapshot.topQueries ?? [],
          errors: monitorState.snapshot.errors ?? [],
          topWaits: deltas.recommended,
          allWaits: deltas.waits,
          baselineCollectedAt: deltas.baselineCollectedAt,
        }
      : null,
    history: {
      keep: KEEP_SNAPSHOTS,
      points: historyPoints,
    },
    refreshing: monitorState.refreshing,
    lastError: monitorState.lastError,
    lastRefreshedAt: monitorState.lastRefreshedAt,
    nextRefreshAt: monitorState.nextRefreshAt,
  };
};

export const refreshDbMonitorSnapshot = async () => {
  if (monitorState.refreshing) {
    return getDbMonitorState();
  }

  monitorState.refreshing = true;
  try {
    const pool = await getPool();
    if (!Array.isArray(monitorState.history) || monitorState.history.length === 0) {
      try {
        monitorState.history = await readSnapshots(pool, KEEP_SNAPSHOTS);
        monitorState.snapshot = monitorState.history[0] ?? null;
        monitorState.baseline = monitorState.history[1] ?? null;
      } catch {
        // ignore
      }
    }

    const snapshot = await collectDbSnapshot(pool);
    await insertSnapshot(pool, snapshot);

    const history = await readSnapshots(pool, KEEP_SNAPSHOTS);
    monitorState.history = history;
    monitorState.snapshot = history[0] ?? snapshot;
    monitorState.baseline = history[1] ?? null;
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
  (async () => {
    try {
      const pool = await getPool();
      monitorState.history = await readSnapshots(pool, KEEP_SNAPSHOTS);
      monitorState.snapshot = monitorState.history[0] ?? null;
      monitorState.baseline = monitorState.history[1] ?? null;
      monitorState.lastRefreshedAt = monitorState.snapshot?.collectedAt ?? null;
    } catch {
      // ignore
    }
    await refreshDbMonitorSnapshot();
  })().catch(() => {});

  const timer = setInterval(() => {
    refreshDbMonitorSnapshot().catch(() => {});
  }, ONE_HOUR_MS);
  timer.unref?.();
};

