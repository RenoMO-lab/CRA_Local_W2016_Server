-- Add per-user preferred language for email/notification communications.
-- Defaults to English for existing users and unknown recipients.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'app_users_preferred_language_check'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_preferred_language_check
      CHECK (preferred_language IN ('en', 'fr', 'zh'));
  END IF;
END $$;

