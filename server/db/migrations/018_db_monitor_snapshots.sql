CREATE TABLE IF NOT EXISTS db_monitor_snapshots (
  id bigserial PRIMARY KEY,
  collected_at timestamptz NOT NULL,
  db_start_time timestamptz NULL,
  database_name text NULL,
  server_name text NULL,
  product_version text NULL,
  edition text NULL,
  size_mb double precision NULL,
  user_sessions integer NULL,
  active_requests integer NULL,
  blocked_requests integer NULL,
  waits_json jsonb NULL,
  queries_json jsonb NULL,
  collector_errors_json jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_db_monitor_snapshots_collected_at
  ON db_monitor_snapshots(collected_at DESC);

