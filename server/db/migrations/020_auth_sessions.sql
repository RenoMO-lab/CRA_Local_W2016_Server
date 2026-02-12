CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('sales', 'design', 'costing', 'admin')),
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON app_users (lower(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
  ON auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON auth_sessions (expires_at);
