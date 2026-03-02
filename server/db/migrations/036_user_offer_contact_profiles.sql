CREATE TABLE IF NOT EXISTS user_offer_contact_profiles (
  user_id text PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  contact_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
