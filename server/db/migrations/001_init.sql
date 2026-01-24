IF OBJECT_ID(N'dbo.requests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.requests (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    data NVARCHAR(MAX) NOT NULL,
    status NVARCHAR(50) NOT NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.counters', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.counters (
    name NVARCHAR(64) NOT NULL PRIMARY KEY,
    value INT NOT NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.counters WHERE name = 'request')
BEGIN
  INSERT INTO dbo.counters (name, value) VALUES ('request', 0);
END;
