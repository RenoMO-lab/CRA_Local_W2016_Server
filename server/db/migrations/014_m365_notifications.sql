IF OBJECT_ID(N'dbo.m365_mail_settings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.m365_mail_settings (
    id INT NOT NULL PRIMARY KEY,
    enabled BIT NOT NULL DEFAULT 0,
    tenant_id NVARCHAR(100) NULL,
    client_id NVARCHAR(100) NULL,
    sender_upn NVARCHAR(255) NULL,
    app_base_url NVARCHAR(255) NULL,
    recipients_sales NVARCHAR(2000) NULL,
    recipients_design NVARCHAR(2000) NULL,
    recipients_costing NVARCHAR(2000) NULL,
    recipients_admin NVARCHAR(2000) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.m365_mail_settings WHERE id = 1)
BEGIN
  INSERT INTO dbo.m365_mail_settings (id, enabled) VALUES (1, 0);
END;

IF OBJECT_ID(N'dbo.m365_mail_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.m365_mail_tokens (
    id INT NOT NULL PRIMARY KEY,
    access_token NVARCHAR(MAX) NULL,
    refresh_token NVARCHAR(MAX) NULL,
    expires_at DATETIME2 NULL,
    scope NVARCHAR(4000) NULL,
    token_type NVARCHAR(50) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.m365_mail_tokens WHERE id = 1)
BEGIN
  INSERT INTO dbo.m365_mail_tokens (id) VALUES (1);
END;

IF OBJECT_ID(N'dbo.m365_device_code_sessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.m365_device_code_sessions (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    device_code NVARCHAR(MAX) NOT NULL,
    user_code NVARCHAR(64) NULL,
    verification_uri NVARCHAR(255) NULL,
    verification_uri_complete NVARCHAR(512) NULL,
    message NVARCHAR(MAX) NULL,
    interval_seconds INT NULL,
    expires_at DATETIME2 NULL,
    status NVARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.notification_outbox', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.notification_outbox (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    event_type NVARCHAR(64) NOT NULL,
    request_id NVARCHAR(64) NOT NULL,
    to_emails NVARCHAR(MAX) NOT NULL,
    subject NVARCHAR(255) NOT NULL,
    body_html NVARCHAR(MAX) NOT NULL,
    status NVARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    last_error NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    sent_at DATETIME2 NULL
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_notification_outbox_status_next'
    AND object_id = OBJECT_ID(N'dbo.notification_outbox')
)
BEGIN
  CREATE INDEX IX_notification_outbox_status_next
  ON dbo.notification_outbox (status, next_attempt_at);
END;
