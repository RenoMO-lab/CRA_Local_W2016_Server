IF OBJECT_ID(N'dbo.feedback', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.feedback (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    type NVARCHAR(50) NOT NULL,
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NOT NULL,
    steps NVARCHAR(MAX) NULL,
    severity NVARCHAR(50) NULL,
    page_path NVARCHAR(255) NULL,
    user_name NVARCHAR(255) NULL,
    user_email NVARCHAR(255) NULL,
    user_role NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL
  );
END;
