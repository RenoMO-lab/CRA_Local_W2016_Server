ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS ticket_number text NULL;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS reporter_user_id text NULL REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS reporter_language text NOT NULL DEFAULT 'en';

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS resolution_note text NULL;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS closed_by_user_id text NULL REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE feedback f
SET
  reporter_user_id = u.id,
  reporter_language = COALESCE(NULLIF(u.preferred_language, ''), 'en')
FROM app_users u
WHERE lower(COALESCE(f.user_email, '')) = lower(COALESCE(u.email, ''))
  AND f.reporter_user_id IS NULL;

UPDATE feedback
SET reporter_language = COALESCE(NULLIF(reporter_language, ''), 'en')
WHERE reporter_language IS NULL
   OR reporter_language = '';

DO $$
DECLARE
  rec record;
  y text;
  counter_name text;
  seq integer;
  next_ticket text;
BEGIN
  FOR rec IN
    SELECT id, created_at
      FROM feedback
     WHERE COALESCE(ticket_number, '') = ''
     ORDER BY created_at ASC, id ASC
  LOOP
    y := to_char(COALESCE(rec.created_at, now()), 'YYYY');
    counter_name := format('feedback_%s', y);

    SELECT value
      INTO seq
      FROM counters
     WHERE name = counter_name
     FOR UPDATE;

    IF seq IS NULL THEN
      INSERT INTO counters (name, value)
      VALUES (counter_name, 0)
      ON CONFLICT (name) DO NOTHING;

      SELECT value
        INTO seq
        FROM counters
       WHERE name = counter_name
       FOR UPDATE;
    END IF;

    seq := COALESCE(seq, 0) + 1;
    UPDATE counters SET value = seq WHERE name = counter_name;

    next_ticket := format('CRA-%s-%s', y, lpad(seq::text, 6, '0'));
    UPDATE feedback
       SET ticket_number = next_ticket
     WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE feedback
  ALTER COLUMN ticket_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_ticket_number
  ON feedback (ticket_number);

CREATE INDEX IF NOT EXISTS idx_feedback_status_updated
  ON feedback (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_reporter_user_created
  ON feedback (reporter_user_id, created_at DESC);
