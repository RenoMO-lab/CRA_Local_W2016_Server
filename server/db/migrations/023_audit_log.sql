-- Audit log: captures key security/admin/workflow events for admin review.
-- Keep it append-only; use retention policies externally if needed.

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_user_id text NULL,
  actor_email text NULL,
  actor_role text NULL,
  action text NOT NULL,
  target_type text NULL,
  target_id text NULL,
  ip text NULL,
  user_agent text NULL,
  result text NOT NULL DEFAULT 'ok', -- ok | error
  error_message text NULL,
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id);

