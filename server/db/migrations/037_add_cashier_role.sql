DO $$
DECLARE
  role_constraint_name text;
BEGIN
  FOR role_constraint_name IN
    SELECT DISTINCT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'app_users'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE app_users DROP CONSTRAINT IF EXISTS %I', role_constraint_name);
  END LOOP;
END $$;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('sales', 'design', 'costing', 'admin', 'finance', 'cashier'));
