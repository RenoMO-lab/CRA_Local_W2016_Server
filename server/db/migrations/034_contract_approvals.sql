DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'contract_approval_status'
  ) THEN
    CREATE TYPE contract_approval_status AS ENUM (
      'draft',
      'submitted',
      'gm_approved',
      'gm_rejected',
      'finance_upload',
      'completed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contract_approvals (
  id text PRIMARY KEY,
  status contract_approval_status NOT NULL,
  cra_request_id text NULL REFERENCES requests(id) ON DELETE SET NULL,
  sales_owner_user_id text NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  submitted_at timestamptz NULL,
  gm_decision_at timestamptz NULL,
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_approvals_updated_at
  ON contract_approvals (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_approvals_status_updated
  ON contract_approvals (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_approvals_sales_owner_updated
  ON contract_approvals (sales_owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_approvals_cra_request_id
  ON contract_approvals (cra_request_id);

CREATE TABLE IF NOT EXISTS contract_approval_attachments (
  id text PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contract_approvals(id) ON DELETE CASCADE,
  attachment_stage text NOT NULL CHECK (attachment_stage IN ('draft_contract', 'stamped_contract')),
  filename text NOT NULL,
  content_type text NULL,
  byte_size integer NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text NULL,
  data bytea NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_approval_attachments_contract
  ON contract_approval_attachments (contract_id, uploaded_at DESC);
