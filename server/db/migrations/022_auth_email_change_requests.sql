CREATE TABLE IF NOT EXISTS auth_email_change_requests (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  old_email text NOT NULL,
  new_email text NOT NULL,
  token_hash text NOT NULL,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_email_change_requests_user_id
  ON auth_email_change_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_email_change_requests_expires_at
  ON auth_email_change_requests (expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_email_change_requests_user_code_hash
  ON auth_email_change_requests (user_id, code_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_email_change_requests_token_hash
  ON auth_email_change_requests (token_hash);

