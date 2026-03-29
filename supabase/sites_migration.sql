-- Secure Cleaning - Sites model extension

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
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sites' AND policyname = 'Service role full access — sites'
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
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sites_updated_at'
  ) THEN
    CREATE TRIGGER trg_sites_updated_at
      BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
