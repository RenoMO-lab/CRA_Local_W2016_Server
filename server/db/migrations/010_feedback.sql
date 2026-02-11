CREATE TABLE IF NOT EXISTS feedback (
  id text PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  steps text NULL,
  severity text NULL,
  page_path text NULL,
  user_name text NULL,
  user_email text NULL,
  user_role text NULL,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
