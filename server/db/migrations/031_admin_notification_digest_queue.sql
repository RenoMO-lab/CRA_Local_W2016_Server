CREATE TABLE IF NOT EXISTS notification_admin_digest_queue (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  request_id text NOT NULL,
  request_status text NOT NULL,
  previous_status text NULL,
  actor_name text NULL,
  comment text NULL,
  to_emails text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  digest_date date NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_digest_queue_status_date
  ON notification_admin_digest_queue (status, digest_date, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_admin_digest_queue_date_created
  ON notification_admin_digest_queue (digest_date, created_at);
