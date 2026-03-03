DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_approval_status') THEN
    ALTER TYPE contract_approval_status ADD VALUE 'finance_approved';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_approval_status') THEN
    ALTER TYPE contract_approval_status ADD VALUE 'finance_rejected';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
