CREATE TABLE IF NOT EXISTS db_backup_settings (
  id integer PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  host text NOT NULL DEFAULT 'localhost',
  port integer NOT NULL DEFAULT 5432,
  database_name text NOT NULL DEFAULT 'cra_local',
  backup_user text NULL,
  password_cipher text NULL,
  password_iv text NULL,
  password_tag text NULL,
  schedule_hour integer NOT NULL DEFAULT 1,
  schedule_minute integer NOT NULL DEFAULT 0,
  task_name text NOT NULL DEFAULT 'CRA_Local_DailyDbBackup',
  retention_policy text NOT NULL DEFAULT 'Keep latest day, day-1, and week-1 backup',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL
);

INSERT INTO db_backup_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS db_backup_runs (
  id text PRIMARY KEY,
  action text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  message text NULL,
  details_json jsonb NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  actor_user_id text NULL,
  actor_email text NULL
);

CREATE INDEX IF NOT EXISTS idx_db_backup_runs_started_at
  ON db_backup_runs (started_at DESC);

