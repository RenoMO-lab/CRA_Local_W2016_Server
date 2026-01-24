IF OBJECT_ID(N'dbo.rate_limits', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rate_limits (
    [key] NVARCHAR(200) NOT NULL PRIMARY KEY,
    window_start DATETIME2 NOT NULL,
    [count] INT NOT NULL
  );
END;
