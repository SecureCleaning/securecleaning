-- Secure Cleaning - audit log foundation

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type     TEXT NOT NULL,
  entity_ref      TEXT NOT NULL,
  action          TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON admin_audit_log(entity_type, entity_ref);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_audit_log' AND policyname = 'Service role full access — admin_audit_log'
  ) THEN
    CREATE POLICY "Service role full access — admin_audit_log"
      ON admin_audit_log FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
