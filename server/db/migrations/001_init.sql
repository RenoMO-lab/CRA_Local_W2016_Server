CREATE TABLE IF NOT EXISTS requests (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_updated_at ON requests (updated_at DESC);

CREATE TABLE IF NOT EXISTS counters (
  name text PRIMARY KEY,
  value integer NOT NULL
);

INSERT INTO counters (name, value)
VALUES ('request', 0)
ON CONFLICT (name) DO NOTHING;
