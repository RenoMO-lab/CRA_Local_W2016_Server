ALTER TABLE m365_mail_settings
  ADD COLUMN IF NOT EXISTS templates_json jsonb NULL;
