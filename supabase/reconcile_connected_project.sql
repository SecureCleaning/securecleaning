-- Secure Cleaning - connected Supabase reconciliation
-- Safe/idempotent patch for the schema gaps observed in the live project.
--
-- Current app/runtime errors indicate these objects are missing:
-- - public.admin_audit_log
-- - public.sites
-- - quotes.follow_up_status / quotes.follow_up_notes
-- - leads.follow_up_status / leads.follow_up_notes
-- - bookings.site_id
-- - bookings.inspection_status / inspection_scheduled_for / inspection_completed_at / dispatch_notes
--
-- Run this in the Supabase SQL Editor for the connected project.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit log foundation
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
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_audit_log'
      AND policyname = 'Service role full access — admin_audit_log'
  ) THEN
    CREATE POLICY "Service role full access — admin_audit_log"
      ON admin_audit_log FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- CRM follow-up state
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;

-- Inspection / dispatch workflow
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS inspection_status TEXT DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS inspection_scheduled_for TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS inspection_completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;

-- Sites model extension
CREATE TABLE IF NOT EXISTS sites (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  site_name         TEXT,
  address           TEXT NOT NULL,
  suburb            TEXT,
  postcode          TEXT,
  city              city_type NOT NULL,
  premises_type     premises_type,
  floor_area        INTEGER,
  access_notes      TEXT,
  alarm_notes       TEXT,
  induction_notes   TEXT,
  keyholder_name    TEXT,
  keyholder_phone   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_client_id ON sites(client_id);
CREATE INDEX IF NOT EXISTS idx_sites_city ON sites(city);
CREATE INDEX IF NOT EXISTS idx_sites_created_at ON sites(created_at DESC);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_site_id ON bookings(site_id);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sites'
      AND policyname = 'Service role full access — sites'
  ) THEN
    CREATE POLICY "Service role full access — sites"
      ON sites FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sites_updated_at'
  ) THEN
    CREATE TRIGGER trg_sites_updated_at
      BEFORE UPDATE ON sites
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

COMMIT;
