-- Secure Cleaning - won opportunity to contract-product workflow
-- Apply after client_crm_foundation_migration.sql and staff_accounts_migration.sql.

CREATE SEQUENCE IF NOT EXISTS contract_product_code_seq START WITH 1000;

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS winning_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acceptance_date DATE,
  ADD COLUMN IF NOT EXISTS acceptance_method TEXT,
  ADD COLUMN IF NOT EXISTS acceptance_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_opportunities_acceptance_method_check'
  ) THEN
    ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_acceptance_method_check
      CHECK (acceptance_method IS NULL OR acceptance_method IN ('email', 'signed_agreement', 'phone', 'other'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contract_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_code TEXT NOT NULL UNIQUE,
  opportunity_id UUID NOT NULL UNIQUE REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  source_quote_id UUID NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE RESTRICT,
  source_quote_document_version INTEGER NOT NULL CHECK (source_quote_document_version > 0),
  assigned_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'available', 'reserved', 'sold', 'withdrawn')),
  heading TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  suburb TEXT NOT NULL,
  premises_type TEXT NOT NULL,
  start_date DATE,
  frequency TEXT NOT NULL,
  annual_visits INTEGER NOT NULL CHECK (annual_visits > 0 AND annual_visits <= 366),
  time_preference TEXT NOT NULL,
  estimated_hours_per_visit NUMERIC(7,2),
  keyed_job TEXT NOT NULL DEFAULT 'unknown' CHECK (keyed_job IN ('unknown', 'keyed', 'not_keyed')),
  formal_contract BOOLEAN NOT NULL DEFAULT FALSE,
  free_initial_clean BOOLEAN NOT NULL DEFAULT FALSE,
  client_price_per_visit_ex_gst_cents INTEGER NOT NULL CHECK (client_price_per_visit_ex_gst_cents > 0),
  annual_contract_value_ex_gst_cents INTEGER NOT NULL CHECK (annual_contract_value_ex_gst_cents > 0),
  purchase_price_ex_gst_cents INTEGER NOT NULL CHECK (purchase_price_ex_gst_cents > 0),
  pricing_method TEXT NOT NULL DEFAULT 'default_50_percent'
    CHECK (pricing_method IN ('default_50_percent', 'manual')),
  pricing_note TEXT,
  cleaner_scope_snapshot JSONB NOT NULL,
  image_url TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  listed_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  published_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_products_directory
  ON contract_products(status, state, listed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_products_assignee
  ON contract_products(assigned_staff_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS contract_product_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES contract_products(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  listing_snapshot JSONB NOT NULL,
  published_by_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, version)
);

CREATE TABLE IF NOT EXISTS contract_product_access_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  state TEXT CHECK (state IS NULL OR state IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_product_access_links_one_active_global
  ON contract_product_access_links((state IS NULL)) WHERE active = TRUE AND state IS NULL;

INSERT INTO contract_product_access_links(id, label, state, active)
VALUES ('10000000-0000-4000-8000-000000000001', 'Reusable cleaner jobs directory', NULL, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS contract_product_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES contract_products(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE RESTRICT,
  access_link_id UUID NOT NULL REFERENCES contract_product_access_links(id) ON DELETE RESTRICT,
  contact_name TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'confirmed', 'rejected')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'shortlisted', 'declined', 'selected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, cleaner_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_product_interests_product
  ON contract_product_interests(product_id, status, created_at DESC);

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS broadcast_unsubscribe_token UUID NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaners_broadcast_unsubscribe_token
  ON cleaners(broadcast_unsubscribe_token);

CREATE TABLE IF NOT EXISTS cleaner_broadcast_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id UUID NOT NULL UNIQUE REFERENCES cleaners(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribed' CHECK (reason IN ('unsubscribed', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cleaner_broadcast_suppressions_email
  ON cleaner_broadcast_suppressions(email_normalized);

CREATE TABLE IF NOT EXISTS cleaner_broadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key UUID NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  subject_snapshot TEXT NOT NULL,
  intro_snapshot TEXT NOT NULL,
  sender_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  sender_name_snapshot TEXT NOT NULL,
  sender_email_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'completed', 'partially_failed', 'failed', 'cancelled')),
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  runner_token UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cleaner_broadcast_campaign_products (
  campaign_id UUID NOT NULL REFERENCES cleaner_broadcast_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES contract_products(id) ON DELETE RESTRICT,
  product_snapshot JSONB NOT NULL,
  PRIMARY KEY(campaign_id, product_id)
);

CREATE TABLE IF NOT EXISTS cleaner_broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES cleaner_broadcast_campaigns(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE RESTRICT,
  to_email TEXT NOT NULL,
  cleaner_name_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'rejected', 'unknown', 'suppressed', 'skipped')),
  provider_message_id TEXT,
  failure_code TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, cleaner_id)
);

CREATE INDEX IF NOT EXISTS idx_cleaner_broadcast_campaigns_history
  ON cleaner_broadcast_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleaner_broadcast_recipients_status
  ON cleaner_broadcast_recipients(campaign_id, status);

CREATE OR REPLACE FUNCTION close_crm_opportunity_won_and_create_product(
  p_opportunity_id UUID,
  p_quote_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_acceptance_date DATE,
  p_acceptance_method TEXT,
  p_acceptance_note TEXT,
  p_cleaner_scope_snapshot JSONB,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  quote_row quotes%ROWTYPE;
  existing_product_id UUID;
  product_id UUID := uuid_generate_v4();
  source_version INTEGER;
  source_city TEXT;
  source_state TEXT;
  source_suburb TEXT;
  source_premises TEXT;
  source_frequency TEXT;
  source_time TEXT;
  source_rate_cents INTEGER;
  source_annual_visits INTEGER;
  source_annual_value INTEGER;
  source_heading TEXT;
  actor_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) INTO actor_is_valid;
  IF NOT actor_is_valid THEN
    RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO opportunity_row FROM crm_opportunities
  WHERE id = p_opportunity_id FOR UPDATE;
  IF opportunity_row.id IS NULL THEN
    RAISE EXCEPTION 'opportunity not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_role = 'agent' AND opportunity_row.assigned_staff_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'opportunity not assigned to agent' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO existing_product_id FROM contract_products
  WHERE opportunity_id = p_opportunity_id;
  IF existing_product_id IS NOT NULL THEN RETURN existing_product_id; END IF;
  IF opportunity_row.closed_at IS NOT NULL OR opportunity_row.stage IN ('won', 'lost', 'cancelled') THEN
    RAISE EXCEPTION 'opportunity is already closed' USING ERRCODE = '23514';
  END IF;
  IF opportunity_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'opportunity changed while editing' USING ERRCODE = '40001';
  END IF;
  IF p_acceptance_date IS NULL OR p_acceptance_date > (NOW() AT TIME ZONE 'Australia/Melbourne')::DATE
     OR p_acceptance_method NOT IN ('email', 'signed_agreement', 'phone', 'other')
     OR LENGTH(BTRIM(COALESCE(p_acceptance_note, ''))) < 3 THEN
    RAISE EXCEPTION 'acceptance evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_opportunity_quotes
    WHERE opportunity_id = p_opportunity_id AND quote_id = p_quote_id
  ) THEN
    RAISE EXCEPTION 'quote is not linked to opportunity' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO quote_row FROM quotes WHERE id = p_quote_id FOR SHARE;
  IF quote_row.id IS NULL OR quote_row.final_quote_document IS NULL THEN
    RAISE EXCEPTION 'a reviewed final quote is required' USING ERRCODE = '23514';
  END IF;

  source_version := COALESCE(quote_row.final_quote_document_version, 1);
  source_city := LOWER(COALESCE(quote_row.final_quote_document #>> '{inputs,city}', ''));
  source_state := CASE source_city WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' ELSE NULL END;
  IF p_actor_role = 'agent' AND source_state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'product state is outside agent region' USING ERRCODE = '42501';
  END IF;
  source_suburb := BTRIM(COALESCE(quote_row.final_quote_document #>> '{inputs,suburb}', ''));
  source_premises := BTRIM(COALESCE(quote_row.final_quote_document #>> '{inputs,premisesType}', 'commercial'));
  source_frequency := BTRIM(COALESCE(quote_row.final_quote_document #>> '{inputs,frequency}', ''));
  source_time := BTRIM(COALESCE(quote_row.final_quote_document #>> '{inputs,timePreference}', ''));
  source_rate_cents := ROUND(COALESCE(NULLIF(quote_row.final_quote_document #>> '{displayPrice,low}', '')::NUMERIC, 0) * 100);
  source_annual_visits := CASE source_frequency
    WHEN 'daily' THEN 260 WHEN '3x_week' THEN 156 WHEN '2x_week' THEN 104
    WHEN 'weekly' THEN 52 WHEN 'fortnightly' THEN 26 WHEN 'once_off' THEN 1 ELSE 0 END;
  IF source_state IS NULL OR source_suburb = '' OR source_frequency = '' OR source_time = ''
     OR source_rate_cents <= 0 OR source_annual_visits <= 0 THEN
    RAISE EXCEPTION 'final quote cannot seed a complete product' USING ERRCODE = '23514';
  END IF;
  IF p_cleaner_scope_snapshot IS NULL OR jsonb_typeof(p_cleaner_scope_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'cleaner scope snapshot is required' USING ERRCODE = '23514';
  END IF;

  source_annual_value := source_rate_cents * source_annual_visits;
  source_heading := INITCAP(REPLACE(source_frequency, '_', ' ')) || ' ' ||
    INITCAP(REPLACE(source_premises, '_', ' ')) || ' cleaning contract - ' || source_suburb || ', ' || source_state;

  INSERT INTO contract_products(
    id, product_code, opportunity_id, source_quote_id, source_quote_document_version,
    assigned_staff_id, heading, description, state, suburb, premises_type, start_date,
    frequency, annual_visits, time_preference, client_price_per_visit_ex_gst_cents,
    annual_contract_value_ex_gst_cents, purchase_price_ex_gst_cents, cleaner_scope_snapshot,
    created_by_staff_id
  ) VALUES (
    product_id, 'C' || LPAD(nextval('contract_product_code_seq')::TEXT, 6, '0'),
    p_opportunity_id, p_quote_id, source_version, opportunity_row.assigned_staff_id,
    source_heading, COALESCE(p_cleaner_scope_snapshot->>'summary', ''), source_state, source_suburb,
    source_premises, NULLIF(quote_row.final_quote_document #>> '{inputs,preferredStartDate}', '')::DATE,
    source_frequency, source_annual_visits, source_time, source_rate_cents,
    source_annual_value, ROUND(source_annual_value * 0.5), p_cleaner_scope_snapshot, p_actor_id
  );

  UPDATE crm_opportunities SET
    stage = 'won', closed_at = NOW(), winning_quote_id = p_quote_id,
    acceptance_date = p_acceptance_date, acceptance_method = p_acceptance_method,
    acceptance_note = BTRIM(p_acceptance_note), updated_at = NOW()
  WHERE id = p_opportunity_id;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_product', product_id::TEXT, 'contract_product.created_from_won_opportunity',
    jsonb_build_object('opportunityId', p_opportunity_id, 'quoteId', p_quote_id, 'actorId', p_actor_id));
  RETURN product_id;
END;
$$;

CREATE OR REPLACE FUNCTION publish_contract_product(
  p_product_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_row contract_products%ROWTYPE;
  next_version INTEGER;
  actor_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) INTO actor_is_valid;
  IF NOT actor_is_valid THEN RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO product_row FROM contract_products WHERE id = p_product_id FOR UPDATE;
  IF product_row.id IS NULL THEN RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002'; END IF;
  IF p_actor_role = 'agent' AND product_row.assigned_staff_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'product not assigned to agent' USING ERRCODE = '42501';
  END IF;
  IF p_actor_role = 'agent' AND product_row.state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'product state is outside agent region' USING ERRCODE = '42501';
  END IF;
  IF product_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'product changed while editing' USING ERRCODE = '40001';
  END IF;
  IF product_row.status NOT IN ('draft', 'withdrawn', 'available') THEN
    RAISE EXCEPTION 'product cannot be published from this status' USING ERRCODE = '23514';
  END IF;
  IF BTRIM(product_row.heading) = '' OR BTRIM(product_row.description) = '' OR BTRIM(product_row.suburb) = ''
     OR product_row.annual_visits <= 0 OR product_row.purchase_price_ex_gst_cents <= 0
     OR jsonb_typeof(product_row.cleaner_scope_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'product is not ready to publish' USING ERRCODE = '23514';
  END IF;

  next_version := product_row.version + 1;
  UPDATE contract_products SET
    status = 'available', version = next_version,
    listed_at = COALESCE(listed_at, NOW()), withdrawn_at = NULL,
    published_by_staff_id = p_actor_id, updated_at = NOW()
  WHERE id = p_product_id;

  SELECT * INTO product_row FROM contract_products WHERE id = p_product_id;

  INSERT INTO contract_product_versions(product_id, version, listing_snapshot, published_by_staff_id)
  VALUES (p_product_id, next_version, to_jsonb(product_row) - 'pricing_note' - 'acceptance_note', p_actor_id)
  ON CONFLICT (product_id, version) DO NOTHING;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_product', p_product_id::TEXT, 'contract_product.published',
    jsonb_build_object('version', next_version, 'actorId', p_actor_id));
  RETURN next_version;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_crm_won_product_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.stage = 'won' AND OLD.stage IS DISTINCT FROM 'won' AND (
    NEW.winning_quote_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM contract_products
      WHERE opportunity_id = NEW.id AND source_quote_id = NEW.winning_quote_id
    )
  ) THEN
    RAISE EXCEPTION 'won opportunities require a linked contract product and winning quote'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION unsubscribe_cleaner_broadcast(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cleaner_ref UUID;
  cleaner_email TEXT;
BEGIN
  SELECT id, LOWER(BTRIM(email)) INTO cleaner_ref, cleaner_email
  FROM cleaners WHERE broadcast_unsubscribe_token = p_token;
  IF cleaner_ref IS NULL OR cleaner_email IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO cleaner_broadcast_suppressions(cleaner_id, email_normalized, reason)
  VALUES (cleaner_ref, cleaner_email, 'unsubscribed')
  ON CONFLICT (cleaner_id) DO UPDATE SET
    email_normalized = EXCLUDED.email_normalized, reason = EXCLUDED.reason, updated_at = NOW();
  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('cleaner', cleaner_ref::TEXT, 'cleaner.broadcast.unsubscribed', '{}'::jsonb);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_recipient(
  p_campaign_id UUID,
  p_recipient_id UUID,
  p_runner_token UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  campaign_row cleaner_broadcast_campaigns%ROWTYPE;
  recipient_row cleaner_broadcast_recipients%ROWTYPE;
  eligible BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN
    RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO campaign_row FROM cleaner_broadcast_campaigns
  WHERE id = p_campaign_id FOR UPDATE;
  IF campaign_row.id IS NULL OR campaign_row.sender_staff_id IS DISTINCT FROM p_actor_id
     OR campaign_row.status <> 'sending'
     OR campaign_row.runner_token IS DISTINCT FROM p_runner_token
     OR campaign_row.lease_expires_at IS NULL
     OR campaign_row.lease_expires_at <= NOW() THEN RETURN FALSE; END IF;
  IF p_actor_role = 'agent' AND campaign_row.state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'broadcast state is outside agent region' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO recipient_row FROM cleaner_broadcast_recipients
  WHERE id = p_recipient_id AND campaign_id = p_campaign_id FOR UPDATE;
  IF recipient_row.id IS NULL OR recipient_row.status <> 'queued' THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM cleaners c
    WHERE c.id = recipient_row.cleaner_id
      AND c.status = 'approved'
      AND c.state = campaign_row.state
      AND LOWER(BTRIM(c.email)) = LOWER(BTRIM(recipient_row.to_email))
      AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM crm_email_suppressions s
        WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE
      )
  ) AND EXISTS (
    SELECT 1 FROM cleaner_broadcast_campaign_products cp
    JOIN contract_products p ON p.id = cp.product_id
    WHERE cp.campaign_id = p_campaign_id
  ) AND NOT EXISTS (
    SELECT 1 FROM cleaner_broadcast_campaign_products cp
    JOIN contract_products p ON p.id = cp.product_id
    WHERE cp.campaign_id = p_campaign_id
      AND (p.status <> 'available' OR p.state <> campaign_row.state)
  ) INTO eligible;

  IF NOT eligible THEN
    UPDATE cleaner_broadcast_recipients SET status = 'skipped', failure_code = 'eligibility_changed'
    WHERE id = p_recipient_id;
    RETURN FALSE;
  END IF;
  UPDATE cleaner_broadcast_recipients SET status = 'sending', failure_code = NULL
  WHERE id = p_recipient_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION claim_cleaner_broadcast_campaign(
  p_campaign_id UUID,
  p_runner_token UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN
    RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE cleaner_broadcast_campaigns
  SET runner_token = p_runner_token, lease_expires_at = NOW() + INTERVAL '15 minutes'
  WHERE id = p_campaign_id
    AND sender_staff_id = p_actor_id
    AND status = 'sending'
    AND (p_actor_role <> 'agent' OR state = p_actor_state)
    AND (runner_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= NOW()
      OR runner_token = p_runner_token);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION create_cleaner_broadcast_campaign(
  p_idempotency_key UUID,
  p_state TEXT,
  p_subject TEXT,
  p_intro TEXT,
  p_product_ids UUID[],
  p_product_snapshots JSONB,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_state TEXT,
  p_actor_name TEXT,
  p_actor_email TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed_campaign_id UUID;
  eligible_count INTEGER;
  expected_products INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_staff_accounts
    WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role
      AND role::TEXT IN ('owner', 'manager', 'agent')
  ) THEN RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')
     OR (p_actor_role = 'agent' AND p_state IS DISTINCT FROM p_actor_state) THEN
    RAISE EXCEPTION 'broadcast state is outside agent region' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(BTRIM(p_subject), '') IS NULL OR NULLIF(BTRIM(p_intro), '') IS NULL THEN
    RAISE EXCEPTION 'broadcast content is required' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF claimed_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM cleaner_broadcast_campaigns
      WHERE id = claimed_campaign_id AND sender_staff_id = p_actor_id AND state = p_state
        AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro)
    ) OR (SELECT COUNT(*) FROM cleaner_broadcast_campaign_products
      WHERE campaign_id = claimed_campaign_id) <> COALESCE(array_length(p_product_ids, 1), 0)
    OR EXISTS (
      SELECT 1 FROM cleaner_broadcast_campaign_products
      WHERE campaign_id = claimed_campaign_id AND product_id <> ALL(p_product_ids)
    ) THEN RAISE EXCEPTION 'idempotency key belongs to another broadcast' USING ERRCODE = '23505'; END IF;
    RETURN claimed_campaign_id;
  END IF;

  expected_products := COALESCE(array_length(p_product_ids, 1), 0);
  IF expected_products = 0 OR jsonb_typeof(p_product_snapshots) <> 'array'
     OR jsonb_array_length(p_product_snapshots) <> expected_products
     OR (SELECT COUNT(DISTINCT id) FROM contract_products WHERE id = ANY(p_product_ids)
       AND status = 'available' AND state = p_state
       AND (p_actor_role <> 'agent' OR assigned_staff_id = p_actor_id)) <> expected_products THEN
    RAISE EXCEPTION 'one or more products are unavailable or outside the actor region' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO eligible_count FROM (
    SELECT DISTINCT ON (LOWER(BTRIM(c.email))) c.id
    FROM cleaners c
    WHERE c.status = 'approved' AND c.state = p_state
      AND c.broadcast_unsubscribe_token IS NOT NULL
      AND BTRIM(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM crm_email_suppressions s
        WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE
      )
    ORDER BY LOWER(BTRIM(c.email)), c.created_at, c.id
  ) eligible;
  IF eligible_count = 0 OR eligible_count > 50 THEN
    RAISE EXCEPTION 'broadcast recipient count is outside the safe limit' USING ERRCODE = '23514';
  END IF;

  INSERT INTO cleaner_broadcast_campaigns(
    idempotency_key, state, subject_snapshot, intro_snapshot, sender_staff_id,
    sender_name_snapshot, sender_email_snapshot, recipient_count
  ) VALUES (
    p_idempotency_key, p_state, BTRIM(p_subject), BTRIM(p_intro), p_actor_id,
    BTRIM(p_actor_name), LOWER(BTRIM(p_actor_email)), eligible_count
  ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO claimed_campaign_id;
  IF claimed_campaign_id IS NULL THEN
    SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns
    WHERE idempotency_key = p_idempotency_key AND sender_staff_id = p_actor_id AND state = p_state
      AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro);
    IF claimed_campaign_id IS NULL THEN
      RAISE EXCEPTION 'idempotency key belongs to another broadcast' USING ERRCODE = '23505';
    END IF;
    RETURN claimed_campaign_id;
  END IF;

  INSERT INTO cleaner_broadcast_campaign_products(campaign_id, product_id, product_snapshot)
  SELECT claimed_campaign_id, product.id, snapshot.value
  FROM jsonb_array_elements(p_product_snapshots) snapshot(value)
  JOIN contract_products product ON product.id = (snapshot.value->>'id')::UUID
  WHERE product.id = ANY(p_product_ids);

  INSERT INTO cleaner_broadcast_recipients(campaign_id, cleaner_id, to_email, cleaner_name_snapshot)
  SELECT claimed_campaign_id, eligible.id, LOWER(BTRIM(eligible.email)),
    COALESCE(NULLIF(BTRIM(eligible.contact_name), ''), 'Cleaner')
  FROM (
    SELECT DISTINCT ON (LOWER(BTRIM(c.email))) c.id, c.email, c.contact_name
    FROM cleaners c
    WHERE c.status = 'approved' AND c.state = p_state
      AND c.broadcast_unsubscribe_token IS NOT NULL
      AND BTRIM(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM crm_email_suppressions s
        WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE
      )
    ORDER BY LOWER(BTRIM(c.email)), c.created_at, c.id
  ) eligible;
  RETURN claimed_campaign_id;
END;
$$;

ALTER TABLE contract_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_product_access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_product_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_broadcast_campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_broadcast_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE contract_products, contract_product_versions, contract_product_access_links,
  contract_product_interests, cleaner_broadcast_campaigns, cleaner_broadcast_campaign_products,
  cleaner_broadcast_recipients, cleaner_broadcast_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE contract_products, contract_product_versions, contract_product_access_links,
  contract_product_interests, cleaner_broadcast_campaigns, cleaner_broadcast_campaign_products,
  cleaner_broadcast_recipients, cleaner_broadcast_suppressions TO service_role;
REVOKE ALL ON SEQUENCE contract_product_code_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE contract_product_code_seq TO service_role;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contract_products', 'contract_product_versions', 'contract_product_access_links',
    'contract_product_interests', 'cleaner_broadcast_campaigns',
    'cleaner_broadcast_campaign_products', 'cleaner_broadcast_recipients',
    'cleaner_broadcast_suppressions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
        AND policyname = 'Service role full access - ' || table_name
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'Service role full access - ' || table_name, table_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contract_products_updated_at') THEN
    CREATE TRIGGER trg_contract_products_updated_at BEFORE UPDATE ON contract_products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contract_product_interests_updated_at') THEN
    CREATE TRIGGER trg_contract_product_interests_updated_at BEFORE UPDATE ON contract_product_interests
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cleaner_broadcast_recipients_updated_at') THEN
    CREATE TRIGGER trg_cleaner_broadcast_recipients_updated_at BEFORE UPDATE ON cleaner_broadcast_recipients
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_won_product_link') THEN
    CREATE TRIGGER trg_crm_won_product_link BEFORE UPDATE ON crm_opportunities
      FOR EACH ROW EXECUTE FUNCTION enforce_crm_won_product_link();
  END IF;
END $$;

REVOKE ALL ON FUNCTION enforce_crm_won_product_link() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION publish_contract_product(UUID, TIMESTAMPTZ, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unsubscribe_cleaner_broadcast(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_cleaner_broadcast_recipient(UUID, UUID, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_cleaner_broadcast_campaign(UUID, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_cleaner_broadcast_campaign(
  UUID, TEXT, TEXT, TEXT, UUID[], JSONB, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_crm_opportunity_won_and_create_product(
  UUID, UUID, TIMESTAMPTZ, DATE, TEXT, TEXT, JSONB, UUID, TEXT, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION publish_contract_product(UUID, TIMESTAMPTZ, UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION unsubscribe_cleaner_broadcast(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION claim_cleaner_broadcast_recipient(UUID, UUID, UUID, UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION claim_cleaner_broadcast_campaign(UUID, UUID, UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION create_cleaner_broadcast_campaign(
  UUID, TEXT, TEXT, TEXT, UUID[], JSONB, UUID, TEXT, TEXT, TEXT, TEXT
) TO service_role;
