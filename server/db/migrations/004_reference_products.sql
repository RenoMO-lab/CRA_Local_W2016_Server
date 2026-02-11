CREATE TABLE IF NOT EXISTS reference_products (
  id text PRIMARY KEY,
  configuration_type text NULL,
  articulation_type text NULL,
  brake_type text NULL,
  brake_size text NULL,
  studs_pcd_standards jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reference_products_updated_at
  ON reference_products (updated_at DESC);
