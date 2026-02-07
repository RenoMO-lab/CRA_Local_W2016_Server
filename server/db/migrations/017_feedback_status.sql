-- Note: use dynamic SQL so the batch compiles even before the columns exist.

IF COL_LENGTH('dbo.feedback', 'status') IS NULL
BEGIN
  EXEC(N'ALTER TABLE dbo.feedback
    ADD status NVARCHAR(50) NOT NULL
      CONSTRAINT DF_feedback_status DEFAULT ''submitted'';');
END;

IF COL_LENGTH('dbo.feedback', 'updated_at') IS NULL
BEGIN
  EXEC(N'ALTER TABLE dbo.feedback
    ADD updated_at DATETIME2 NULL;');
END;

EXEC(N'UPDATE dbo.feedback
SET
  status = COALESCE(NULLIF(status, ''''), ''submitted''),
  updated_at = COALESCE(updated_at, created_at);');
