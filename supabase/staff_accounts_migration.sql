-- Secure Cleaning - individual admin staff accounts and roles

CREATE TABLE IF NOT EXISTS admin_staff_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  email           TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'staff',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_admin_staff_role CHECK (role IN ('owner', 'manager', 'staff', 'agent', 'viewer'))
);

ALTER TABLE admin_staff_accounts
  ADD COLUMN IF NOT EXISTS availability_assignee_id TEXT,
  ADD COLUMN IF NOT EXISTS legacy_password_hash TEXT;

ALTER TABLE admin_staff_accounts DROP CONSTRAINT IF EXISTS chk_admin_staff_role;
ALTER TABLE admin_staff_accounts
  ADD CONSTRAINT chk_admin_staff_role CHECK (role IN ('owner', 'manager', 'staff', 'agent', 'viewer'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_staff_assignee
  ON admin_staff_accounts (availability_assignee_id)
  WHERE availability_assignee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_staff_email
  ON admin_staff_accounts (LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_staff_active ON admin_staff_accounts(active);
CREATE INDEX IF NOT EXISTS idx_admin_staff_role ON admin_staff_accounts(role);

ALTER TABLE admin_staff_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_staff_accounts'
      AND policyname = 'Service role full access - admin_staff_accounts'
  ) THEN
    CREATE POLICY "Service role full access - admin_staff_accounts"
      ON admin_staff_accounts FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_staff_accounts_updated_at'
  ) THEN
    CREATE TRIGGER trg_admin_staff_accounts_updated_at
      BEFORE UPDATE ON admin_staff_accounts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
