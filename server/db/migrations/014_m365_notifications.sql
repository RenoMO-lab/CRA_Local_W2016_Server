CREATE TABLE IF NOT EXISTS m365_mail_settings (
  id integer PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  tenant_id text NULL,
  client_id text NULL,
  sender_upn text NULL,
  app_base_url text NULL,
  recipients_sales text NULL,
  recipients_design text NULL,
  recipients_costing text NULL,
  recipients_admin text NULL,
  test_mode boolean NOT NULL DEFAULT false,
  test_email text NULL,
  flow_map jsonb NULL,
  templates_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO m365_mail_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS m365_mail_tokens (
  id integer PRIMARY KEY,
  access_token text NULL,
  refresh_token text NULL,
  expires_at timestamptz NULL,
  scope text NULL,
  token_type text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO m365_mail_tokens (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS m365_device_code_sessions (
  id text PRIMARY KEY,
  device_code text NOT NULL,
  user_code text NULL,
  verification_uri text NULL,
  verification_uri_complete text NULL,
  message text NULL,
  interval_seconds integer NULL,
  expires_at timestamptz NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  request_id text NOT NULL,
  to_emails text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_next
  ON notification_outbox (status, next_attempt_at);

