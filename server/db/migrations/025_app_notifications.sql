CREATE TABLE IF NOT EXISTS app_notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  request_id text NULL,
  payload_json jsonb NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_created
  ON app_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_unread
  ON app_notifications (user_id, is_read, created_at DESC);
