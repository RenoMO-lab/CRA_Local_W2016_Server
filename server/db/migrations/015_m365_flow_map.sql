ALTER TABLE m365_mail_settings
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;

ALTER TABLE m365_mail_settings
  ADD COLUMN IF NOT EXISTS test_email text NULL;

ALTER TABLE m365_mail_settings
  ADD COLUMN IF NOT EXISTS flow_map jsonb NULL;
