CREATE TABLE IF NOT EXISTS request_attachments (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  attachment_type text NOT NULL DEFAULT 'other',
  filename text NOT NULL,
  content_type text NULL,
  byte_size integer NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text NULL,
  data bytea NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_attachments_request_id
  ON request_attachments (request_id, uploaded_at DESC);

