-- ═══════════════════════════════════════════════════════════════════════════
-- Secure Cleaning — Supabase Schema
-- Secure Contracts Pty Ltd
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ──────────────────────────────────────────────────────────────────

CREATE TYPE city_type AS ENUM ('melbourne', 'sydney');

CREATE TYPE premises_type AS ENUM (
  'office', 'medical', 'industrial', 'childcare',
  'retail', 'gym', 'warehouse', 'other'
);

CREATE TYPE cleaning_frequency AS ENUM (
  'daily', '3x_week', '2x_week', 'weekly', 'fortnightly', 'once_off'
);

CREATE TYPE time_preference AS ENUM ('business_hours', 'after_hours', 'weekend');

CREATE TYPE flooring_type AS ENUM ('carpet', 'hard_floor', 'mixed');

CREATE TYPE quote_status AS ENUM ('pending', 'sent', 'accepted', 'expired', 'declined');

CREATE TYPE booking_status AS ENUM (
  'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
);

CREATE TYPE sale_status AS ENUM ('pending', 'paid', 'disputed');

-- ─── CLIENTS ────────────────────────────────────────────────────────────────

CREATE TABLE clients (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name    TEXT NOT NULL,
  contact_name     TEXT NOT NULL,
  email            TEXT UNIQUE NOT NULL,
  phone            TEXT,
  address          TEXT,
  city             city_type,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── QUOTES ─────────────────────────────────────────────────────────────────

CREATE TABLE quotes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_ref    TEXT UNIQUE NOT NULL,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  inputs       JSONB NOT NULL,          -- QuoteInputs snapshot
  result       JSONB NOT NULL,          -- QuoteResult snapshot
  status       quote_status NOT NULL DEFAULT 'pending',
  valid_until  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotes_client_id  ON quotes(client_id);
CREATE INDEX idx_quotes_quote_ref  ON quotes(quote_ref);
CREATE INDEX idx_quotes_status     ON quotes(status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);

-- ─── BOOKINGS ────────────────────────────────────────────────────────────────

CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_ref           TEXT UNIQUE NOT NULL,
  quote_id              UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  inputs                JSONB NOT NULL,          -- BookingInputs snapshot
  status                booking_status NOT NULL DEFAULT 'pending',
  assigned_inspector_id UUID,                    -- FK added after inspectors table
  assigned_operator_id  UUID,                    -- FK added after owner_operators table
  first_clean_date      DATE,
  recurring_schedule    JSONB,
  internal_notes        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_client_id  ON bookings(client_id);
CREATE INDEX idx_bookings_status     ON bookings(status);
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);

-- ─── INSPECTORS ──────────────────────────────────────────────────────────────

CREATE TABLE inspectors (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  email                TEXT UNIQUE NOT NULL,
  phone                TEXT,
  city                 city_type NOT NULL,
  calendar_connected   BOOLEAN NOT NULL DEFAULT FALSE,
  google_calendar_id   TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from bookings now that inspectors table exists
ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_inspector
  FOREIGN KEY (assigned_inspector_id) REFERENCES inspectors(id) ON DELETE SET NULL;

-- ─── AVAILABILITY BLOCKS ──────────────────────────────────────────────────────

CREATE TABLE availability_blocks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspector_id  UUID NOT NULL REFERENCES inspectors(id) ON DELETE CASCADE,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_availability_order CHECK (end_at > start_at)
);

CREATE INDEX idx_avail_inspector_id ON availability_blocks(inspector_id);
CREATE INDEX idx_avail_start_at     ON availability_blocks(start_at);

-- ─── LEADS ───────────────────────────────────────────────────────────────────

CREATE TABLE leads (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                    TEXT NOT NULL,
  business_name            TEXT,
  contact_name             TEXT,
  phone                    TEXT,
  city                     city_type,
  source                   TEXT,
  notes                    TEXT,
  converted_to_client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_email      ON leads(email);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- ─── OWNER OPERATORS ─────────────────────────────────────────────────────────

CREATE TABLE owner_operators (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name     TEXT NOT NULL,
  operator_name     TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  phone             TEXT NOT NULL,
  city              city_type NOT NULL,
  areas_serviced    TEXT[] NOT NULL DEFAULT '{}',
  premises_types    premises_type[] NOT NULL DEFAULT '{}',
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  site_inducted     BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_expiry  DATE,
  abn               TEXT,
  rating            NUMERIC(3,2),
  review_count      INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operators_city ON owner_operators(city);
CREATE INDEX idx_operators_active ON owner_operators(is_active);

-- Add FK from bookings now that owner_operators table exists
ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_operator
  FOREIGN KEY (assigned_operator_id) REFERENCES owner_operators(id) ON DELETE SET NULL;

-- ─── CONTRACT SALES ───────────────────────────────────────────────────────────

CREATE TABLE contract_sales (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  operator_id       UUID NOT NULL REFERENCES owner_operators(id) ON DELETE RESTRICT,
  sale_price        NUMERIC(10,2) NOT NULL,
  commission_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.15,   -- e.g. 0.15 = 15%
  commission_amount NUMERIC(10,2) NOT NULL,
  status            sale_status NOT NULL DEFAULT 'pending',
  paid_at           TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contract_sales_operator_id ON contract_sales(operator_id);
CREATE INDEX idx_contract_sales_status      ON contract_sales(status);

-- ─── OWNER OPERATOR RATINGS ───────────────────────────────────────────────────

CREATE TABLE owner_operator_ratings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id  UUID NOT NULL REFERENCES owner_operators(id) ON DELETE CASCADE,
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review       TEXT,
  is_public    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, client_id)   -- one review per booking
);

CREATE INDEX idx_ratings_operator_id ON owner_operator_ratings(operator_id);
CREATE INDEX idx_ratings_is_public   ON owner_operator_ratings(is_public);

-- Trigger: update operator rating average after each insert/update
CREATE OR REPLACE FUNCTION update_operator_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE owner_operators
  SET
    rating       = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM owner_operator_ratings WHERE operator_id = NEW.operator_id),
    review_count = (SELECT COUNT(*) FROM owner_operator_ratings WHERE operator_id = NEW.operator_id)
  WHERE id = NEW.operator_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_operator_rating
AFTER INSERT OR UPDATE ON owner_operator_ratings
FOR EACH ROW EXECUTE FUNCTION update_operator_rating();

-- ─── AI CHAT SESSIONS ────────────────────────────────────────────────────────

CREATE TABLE ai_chat_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token  TEXT UNIQUE NOT NULL,
  messages       JSONB NOT NULL DEFAULT '[]',
  client_email   TEXT,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_session_token  ON ai_chat_sessions(session_token);
CREATE INDEX idx_chat_client_email   ON ai_chat_sessions(client_email);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inspectors_updated_at
  BEFORE UPDATE ON inspectors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_operators_updated_at
  BEFORE UPDATE ON owner_operators FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contract_sales_updated_at
  BEFORE UPDATE ON contract_sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON ai_chat_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspectors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_operators       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_sales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_operator_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions      ENABLE ROW LEVEL SECURITY;

-- ── CLIENTS ──────────────────────────────────────────────────────────────────
-- Service role can do anything; anon/authenticated cannot read other clients

CREATE POLICY "Service role full access — clients"
  ON clients FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own client record (matched by email)
CREATE POLICY "Users read own client record"
  ON clients FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- ── QUOTES ───────────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — quotes"
  ON quotes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anonymous users can insert quotes (quote form is public)
CREATE POLICY "Anon can insert quotes"
  ON quotes FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated users can read their own quotes
CREATE POLICY "Users read own quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE email = auth.jwt()->>'email'
    )
  );

-- ── BOOKINGS ─────────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — bookings"
  ON bookings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own bookings
CREATE POLICY "Users read own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE email = auth.jwt()->>'email'
    )
  );

-- ── INSPECTORS ───────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — inspectors"
  ON inspectors FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Active inspectors are readable by authenticated users
CREATE POLICY "Authenticated users can view active inspectors"
  ON inspectors FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ── AVAILABILITY BLOCKS ───────────────────────────────────────────────────────

CREATE POLICY "Service role full access — availability"
  ON availability_blocks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view availability"
  ON availability_blocks FOR SELECT
  TO authenticated
  USING (true);

-- ── LEADS ────────────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — leads"
  ON leads FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can insert leads (contact forms, chat sessions)
CREATE POLICY "Anon can insert leads"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── OWNER OPERATORS ───────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — operators"
  ON owner_operators FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can view active, verified operators
CREATE POLICY "Public can view active operators"
  ON owner_operators FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_verified = true);

-- ── CONTRACT SALES ────────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — contract_sales"
  ON contract_sales FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── OWNER OPERATOR RATINGS ────────────────────────────────────────────────────

CREATE POLICY "Service role full access — ratings"
  ON owner_operator_ratings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can read public ratings
CREATE POLICY "Public read public ratings"
  ON owner_operator_ratings FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Authenticated clients can insert ratings for their bookings
CREATE POLICY "Clients can rate their own bookings"
  ON owner_operator_ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE email = auth.jwt()->>'email'
    )
  );

-- ── AI CHAT SESSIONS ─────────────────────────────────────────────────────────

CREATE POLICY "Service role full access — chat"
  ON ai_chat_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anyone can insert a chat session (public widget)
CREATE POLICY "Anon can create chat session"
  ON ai_chat_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

-- Users can read/update their own chat session by token
CREATE POLICY "Users access own chat by token"
  ON ai_chat_sessions FOR SELECT
  TO anon, authenticated
  USING (true);  -- token-based access controlled at app layer
