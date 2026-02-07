IF COL_LENGTH('dbo.m365_mail_settings', 'test_mode') IS NULL
BEGIN
  ALTER TABLE dbo.m365_mail_settings
  ADD test_mode BIT NOT NULL DEFAULT 0;
END;

IF COL_LENGTH('dbo.m365_mail_settings', 'test_email') IS NULL
BEGIN
  ALTER TABLE dbo.m365_mail_settings
  ADD test_email NVARCHAR(255) NULL;
END;

IF COL_LENGTH('dbo.m365_mail_settings', 'flow_map') IS NULL
BEGIN
  ALTER TABLE dbo.m365_mail_settings
  ADD flow_map NVARCHAR(MAX) NULL;
END;
