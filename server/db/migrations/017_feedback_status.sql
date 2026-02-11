ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted';

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;

UPDATE feedback
SET
  status = COALESCE(NULLIF(status, ''), 'submitted'),
  updated_at = COALESCE(updated_at, created_at);
