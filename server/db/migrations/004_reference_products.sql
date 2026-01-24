IF OBJECT_ID(N'dbo.reference_products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.reference_products (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    configuration_type NVARCHAR(255) NULL,
    articulation_type NVARCHAR(255) NULL,
    brake_type NVARCHAR(255) NULL,
    brake_size NVARCHAR(255) NULL,
    studs_pcd_standards NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_reference_products_updated_at'
    AND object_id = OBJECT_ID(N'dbo.reference_products')
)
BEGIN
  CREATE INDEX idx_reference_products_updated_at ON dbo.reference_products (updated_at DESC);
END;
