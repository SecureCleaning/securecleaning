-- Secure Cleaning - client CRM foundation and canonical staff signatures

ALTER TABLE admin_staff_accounts
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS crm_organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT NOT NULL,
  legal_name TEXT,
  abn TEXT,
  website TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES crm_organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS position_title TEXT,
  ADD COLUMN IF NOT EXISTS is_primary_contact BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT uuid_generate_v4();

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unsubscribe_token ON clients(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_clients_organisation_id ON clients(organisation_id);

CREATE INDEX IF NOT EXISTS idx_clients_email_normalized
  ON clients(LOWER(BTRIM(email)));

CREATE OR REPLACE FUNCTION crm_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION crm_site_identity_key(
  p_address TEXT,
  p_suburb TEXT,
  p_postcode TEXT,
  p_city city_type
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(p_address), '') IS NULL
      OR NULLIF(BTRIM(p_postcode), '') IS NULL
      OR p_city IS NULL
    THEN NULL
    ELSE md5(
      LOWER(regexp_replace(BTRIM(p_address), '[[:space:]]+', ' ', 'g')) || '|' ||
      LOWER(regexp_replace(COALESCE(BTRIM(p_suburb), ''), '[[:space:]]+', ' ', 'g')) || '|' ||
      regexp_replace(BTRIM(p_postcode), '[^0-9]', '', 'g') || '|' ||
      p_city::TEXT
    )
  END;
$$;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES crm_organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS crm_site_key TEXT;
CREATE INDEX IF NOT EXISTS idx_sites_organisation_id ON sites(organisation_id);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES crm_organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS suburb TEXT,
  ADD COLUMN IF NOT EXISTS postcode TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS source_provider TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS source_explanation TEXT,
  ADD COLUMN IF NOT EXISTS source_obtained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_basis TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_leads_organisation_id ON leads(organisation_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id);

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES crm_organisations(id) ON DELETE RESTRICT,
  primary_contact_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  assigned_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (
    stage IN ('new', 'contacted', 'qualified', 'inspection', 'quoting', 'proposal_sent', 'won', 'lost', 'cancelled')
  ),
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
  previous_opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  cycle_reason TEXT NOT NULL DEFAULT 'new_enquiry' CHECK (
    cycle_reason IN ('new_enquiry', 'requote', 'renewal', 'new_requirement', 'new_site', 'legacy')
  ),
  assignment_method TEXT NOT NULL DEFAULT 'unassigned',
  assignment_zone_ids TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  next_follow_up_at TIMESTAMPTZ,
  lost_reason TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (stage IN ('won', 'lost', 'cancelled') AND closed_at IS NOT NULL)
    OR (stage NOT IN ('won', 'lost', 'cancelled') AND closed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_site_cycle
  ON crm_opportunities(organisation_id, site_id, cycle_number)
  WHERE site_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_provisional_cycle
  ON crm_opportunities(organisation_id, primary_contact_id, cycle_number)
  WHERE site_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_open_site
  ON crm_opportunities(organisation_id, site_id)
  WHERE closed_at IS NULL AND site_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_open_provisional
  ON crm_opportunities(organisation_id, primary_contact_id)
  WHERE closed_at IS NULL AND site_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_assigned_staff
  ON crm_opportunities(assigned_staff_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_opportunity_intakes (
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE RESTRICT UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(opportunity_id, lead_id)
);

CREATE TABLE IF NOT EXISTS crm_opportunity_quotes (
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT UNIQUE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  link_source TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(opportunity_id, quote_id),
  UNIQUE(opportunity_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_crm_opportunity_quotes_history
  ON crm_opportunity_quotes(opportunity_id, sequence_number);

CREATE TABLE IF NOT EXISTS crm_reconciliation_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  issue_code TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(record_type, record_id, issue_code)
);

INSERT INTO crm_reconciliation_issues(record_type, record_id, issue_code, details)
SELECT
  'client', clients.id, 'duplicate_normalized_email',
  jsonb_build_object('emailNormalized', LOWER(BTRIM(clients.email)))
FROM clients
JOIN (
  SELECT LOWER(BTRIM(email)) AS email_key
  FROM clients
  GROUP BY LOWER(BTRIM(email))
  HAVING COUNT(*) > 1
) duplicates ON duplicates.email_key = LOWER(BTRIM(clients.email))
ON CONFLICT DO NOTHING;

-- Promote a contact-scoped provisional cycle when a site later becomes known.
-- If an active site cycle already exists, its history absorbs the provisional
-- intake/quote links and the empty provisional shell is retained as cancelled
-- history. Otherwise the provisional cycle is rebased after the site's latest
-- closed cycle before the site relation is applied.
CREATE OR REPLACE FUNCTION crm_promote_provisional_opportunity(
  p_opportunity_id UUID,
  p_site_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  provisional crm_opportunities%ROWTYPE;
  destination_id UUID;
  previous_id UUID;
  destination_cycle INTEGER;
  quote_link RECORD;
  next_sequence INTEGER;
BEGIN
  SELECT * INTO provisional
  FROM crm_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;
  IF provisional.id IS NULL OR provisional.site_id IS NOT NULL OR provisional.closed_at IS NOT NULL THEN
    RETURN p_opportunity_id;
  END IF;

  SELECT id INTO destination_id
  FROM crm_opportunities
  WHERE organisation_id = provisional.organisation_id
    AND site_id = p_site_id
    AND closed_at IS NULL
    AND id <> provisional.id
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF destination_id IS NOT NULL THEN
    UPDATE crm_opportunity_intakes
    SET opportunity_id = destination_id
    WHERE opportunity_id = provisional.id;
    UPDATE bookings
    SET opportunity_id = destination_id
    WHERE opportunity_id = provisional.id;

    SELECT COALESCE(MAX(sequence_number), 0) INTO next_sequence
    FROM crm_opportunity_quotes
    WHERE opportunity_id = destination_id;
    FOR quote_link IN
      SELECT quote_id FROM crm_opportunity_quotes
      WHERE opportunity_id = provisional.id
      ORDER BY sequence_number, linked_at, quote_id
    LOOP
      next_sequence := next_sequence + 1;
      UPDATE crm_opportunity_quotes
      SET opportunity_id = destination_id, sequence_number = next_sequence
      WHERE quote_id = quote_link.quote_id;
    END LOOP;

    UPDATE crm_opportunities
    SET stage = 'cancelled', closed_at = NOW(),
        notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Merged into the active site opportunity when the site identity became known.')
    WHERE id = provisional.id;
    RETURN destination_id;
  END IF;

  SELECT id, cycle_number INTO previous_id, destination_cycle
  FROM crm_opportunities
  WHERE organisation_id = provisional.organisation_id
    AND site_id = p_site_id
  ORDER BY cycle_number DESC, created_at DESC, id DESC
  LIMIT 1;

  UPDATE crm_opportunities
  SET site_id = p_site_id,
      cycle_number = COALESCE(destination_cycle, 0) + 1,
      previous_opportunity_id = previous_id,
      cycle_reason = CASE WHEN previous_id IS NULL THEN cycle_reason ELSE 'requote' END
  WHERE id = provisional.id;
  RETURN provisional.id;
END;
$$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_opportunity_id ON bookings(opportunity_id);

-- Preserve existing quote/booking/client history by attaching it to the new
-- organisation/contact model. This creates one organisation per legacy client;
-- owners can consolidate duplicate organisations later without changing IDs.
DO $$
DECLARE
  client_row RECORD;
  new_organisation_id UUID;
BEGIN
  FOR client_row IN
    SELECT id, business_name, phone FROM clients WHERE organisation_id IS NULL
  LOOP
    INSERT INTO crm_organisations (business_name, phone)
    VALUES (client_row.business_name, client_row.phone)
    RETURNING id INTO new_organisation_id;

    UPDATE clients SET organisation_id = new_organisation_id WHERE id = client_row.id;
  END LOOP;
END $$;

UPDATE sites
SET organisation_id = clients.organisation_id
FROM clients
WHERE sites.client_id = clients.id
  AND sites.organisation_id IS NULL;

UPDATE sites
SET crm_site_key = crm_site_identity_key(address, suburb, postcode, city)
WHERE crm_site_key IS NULL;

DO $$
DECLARE duplicate_site RECORD;
BEGIN
  FOR duplicate_site IN
    SELECT duplicate.id, canonical.id AS canonical_id
    FROM sites duplicate
    JOIN LATERAL (
      SELECT candidate.id
      FROM sites candidate
      WHERE candidate.organisation_id = duplicate.organisation_id
        AND candidate.crm_site_key = duplicate.crm_site_key
      ORDER BY candidate.created_at, candidate.id
      LIMIT 1
    ) canonical ON TRUE
    WHERE duplicate.organisation_id IS NOT NULL
      AND duplicate.crm_site_key IS NOT NULL
      AND duplicate.id <> canonical.id
  LOOP
    UPDATE leads SET site_id = duplicate_site.canonical_id WHERE site_id = duplicate_site.id;
    UPDATE bookings SET site_id = duplicate_site.canonical_id WHERE site_id = duplicate_site.id;
    UPDATE sites SET crm_site_key = NULL, is_active = FALSE WHERE id = duplicate_site.id;
    INSERT INTO crm_reconciliation_issues(record_type, record_id, issue_code, details)
    VALUES ('site', duplicate_site.id, 'duplicate_site_identity', jsonb_build_object('canonicalSiteId', duplicate_site.canonical_id))
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_organisation_crm_key
  ON sites(organisation_id, crm_site_key)
  WHERE organisation_id IS NOT NULL AND crm_site_key IS NOT NULL;

UPDATE leads
SET contact_id = converted_to_client_id
WHERE contact_id IS NULL
  AND converted_to_client_id IS NOT NULL;

UPDATE leads
SET contact_id = matched.id
FROM (
  SELECT LOWER(BTRIM(email)) AS email_key, MIN(id::TEXT)::UUID AS id
  FROM clients
  GROUP BY LOWER(BTRIM(email))
  HAVING COUNT(*) = 1
) matched
WHERE leads.contact_id IS NULL
  AND LOWER(BTRIM(leads.email)) = matched.email_key;

UPDATE leads
SET organisation_id = clients.organisation_id
FROM clients
WHERE leads.contact_id = clients.id
  AND leads.organisation_id IS NULL;

UPDATE leads
SET
  contact_basis = 'enquiry',
  source_explanation = CASE
    WHEN source = 'direct_booking' THEN 'you requested a site inspection through the Secure Cleaning Aus website'
    ELSE 'you requested information or a quote through the Secure Cleaning Aus website'
  END,
  source_obtained_at = COALESCE(source_obtained_at, created_at)
WHERE contact_basis IS NULL
  AND source IN ('quote_flow', 'direct_booking', 'online_quote');

-- Every legacy lead remains an intake event. Repeated active intakes for the
-- same organisation/site sales cycle attach to one deterministic opportunity.
DO $$
DECLARE
  intake_row RECORD;
  resolved_opportunity_id UUID;
  resolved_site_id UUID;
  resolved_cycle INTEGER;
  terminal_stage TEXT;
BEGIN
  FOR intake_row IN
    SELECT leads.*
    FROM leads
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_opportunity_intakes WHERE lead_id = leads.id
    )
    ORDER BY leads.created_at, leads.id
  LOOP
    IF intake_row.contact_id IS NULL OR intake_row.organisation_id IS NULL THEN
      INSERT INTO crm_reconciliation_issues(record_type, record_id, issue_code, details)
      VALUES ('lead', intake_row.id, 'contact_or_organisation_unresolved', jsonb_build_object('email', LOWER(BTRIM(intake_row.email))))
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    resolved_site_id := intake_row.site_id;
    IF resolved_site_id IS NULL THEN
      SELECT sites.id INTO resolved_site_id
      FROM sites
      WHERE sites.organisation_id = intake_row.organisation_id
        AND sites.crm_site_key = crm_site_identity_key(
          intake_row.address, intake_row.suburb, intake_row.postcode, intake_row.city
        );
    END IF;

    terminal_stage := CASE
      WHEN intake_row.follow_up_status IN ('won', 'lost') THEN intake_row.follow_up_status
      ELSE NULL
    END;
    resolved_opportunity_id := NULL;

    IF terminal_stage IS NULL THEN
      SELECT id INTO resolved_opportunity_id
      FROM crm_opportunities
      WHERE organisation_id = intake_row.organisation_id
        AND closed_at IS NULL
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = intake_row.contact_id)
        )
      ORDER BY created_at, id
      LIMIT 1;
    END IF;

    IF resolved_opportunity_id IS NULL THEN
      SELECT COALESCE(MAX(cycle_number), 0) + 1 INTO resolved_cycle
      FROM crm_opportunities
      WHERE organisation_id = intake_row.organisation_id
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = intake_row.contact_id)
        );

      INSERT INTO crm_opportunities(
        organisation_id, primary_contact_id, site_id, stage, cycle_number,
        cycle_reason, notes, closed_at, created_at, updated_at
      ) VALUES (
        intake_row.organisation_id, intake_row.contact_id, resolved_site_id,
        COALESCE(terminal_stage, 'new'), resolved_cycle, 'legacy',
        COALESCE(intake_row.follow_up_notes, intake_row.notes),
        CASE WHEN terminal_stage IS NOT NULL THEN COALESCE(intake_row.updated_at, intake_row.created_at) ELSE NULL END,
        intake_row.created_at, COALESCE(intake_row.updated_at, intake_row.created_at)
      ) RETURNING id INTO resolved_opportunity_id;
    END IF;

    INSERT INTO crm_opportunity_intakes(opportunity_id, lead_id, linked_at)
    VALUES (resolved_opportunity_id, intake_row.id, intake_row.created_at)
    ON CONFLICT (lead_id) DO NOTHING;
  END LOOP;
END $$;

-- Quote events are preserved independently and linked chronologically. A
-- complete quote address resolves an organisation-scoped site; incomplete
-- addresses remain on the provisional, contact-scoped opportunity.
DO $$
DECLARE
  quote_row RECORD;
  resolved_site_id UUID;
  resolved_site_key TEXT;
  resolved_opportunity_id UUID;
  resolved_intake_id UUID;
  resolved_cycle INTEGER;
  resolved_sequence INTEGER;
  resolved_city city_type;
  resolved_stage TEXT;
BEGIN
  FOR quote_row IN
    SELECT quotes.*, clients.organisation_id, clients.email, clients.business_name,
      clients.contact_name, clients.phone, clients.city AS client_city
    FROM quotes
    JOIN clients ON clients.id = quotes.client_id
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_opportunity_quotes WHERE quote_id = quotes.id
    )
    ORDER BY quotes.created_at, quotes.id
  LOOP
    IF quote_row.organisation_id IS NULL THEN
      INSERT INTO crm_reconciliation_issues(record_type, record_id, issue_code)
      VALUES ('quote', quote_row.id, 'organisation_unresolved')
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    resolved_city := COALESCE(
      CASE WHEN quote_row.inputs->>'city' IN ('melbourne', 'sydney') THEN (quote_row.inputs->>'city')::city_type END,
      quote_row.client_city
    );
    resolved_site_key := crm_site_identity_key(
      quote_row.inputs->>'address', quote_row.inputs->>'suburb', quote_row.inputs->>'postcode', resolved_city
    );
    resolved_site_id := NULL;
    resolved_stage := CASE
      WHEN quote_row.follow_up_status IN ('won', 'lost') THEN quote_row.follow_up_status
      WHEN quote_row.status = 'accepted' THEN 'qualified'
      WHEN quote_row.follow_up_status IN ('new', 'contacted', 'qualified') THEN quote_row.follow_up_status
      ELSE 'new'
    END;

    IF resolved_site_key IS NOT NULL THEN
      SELECT id INTO resolved_site_id
      FROM sites
      WHERE organisation_id = quote_row.organisation_id
        AND crm_site_key = resolved_site_key;

      IF resolved_site_id IS NULL THEN
        INSERT INTO sites(
          client_id, organisation_id, site_name, address, suburb, postcode, city,
          is_active, crm_site_key, created_at, updated_at
        ) VALUES (
          quote_row.client_id, quote_row.organisation_id, quote_row.business_name,
          BTRIM(quote_row.inputs->>'address'), NULLIF(BTRIM(quote_row.inputs->>'suburb'), ''),
          regexp_replace(BTRIM(quote_row.inputs->>'postcode'), '[^0-9]', '', 'g'),
          resolved_city, TRUE, resolved_site_key, quote_row.created_at, quote_row.created_at
        )
        ON CONFLICT (organisation_id, crm_site_key)
          WHERE organisation_id IS NOT NULL AND crm_site_key IS NOT NULL
        DO UPDATE SET crm_site_key = EXCLUDED.crm_site_key
        RETURNING id INTO resolved_site_id;
      END IF;
    END IF;

    IF resolved_stage IN ('won', 'lost') THEN
      SELECT id INTO resolved_opportunity_id
      FROM crm_opportunities
      WHERE organisation_id = quote_row.organisation_id
        AND closed_at IS NOT NULL
        AND stage = resolved_stage
        AND primary_contact_id = quote_row.client_id
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL)
        )
      ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - quote_row.created_at))), created_at, id
      LIMIT 1;
    ELSE
      SELECT id INTO resolved_opportunity_id
      FROM crm_opportunities
      WHERE organisation_id = quote_row.organisation_id
        AND closed_at IS NULL
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = quote_row.client_id)
        )
      ORDER BY created_at, id
      LIMIT 1;
    END IF;

    IF resolved_opportunity_id IS NULL AND resolved_stage IN ('won', 'lost') THEN
      SELECT id INTO resolved_opportunity_id
      FROM crm_opportunities
      WHERE organisation_id = quote_row.organisation_id
        AND closed_at IS NULL
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = quote_row.client_id)
        )
      ORDER BY created_at, id
      LIMIT 1;
    END IF;

    IF resolved_opportunity_id IS NULL AND resolved_stage IN ('won', 'lost') THEN
      SELECT id INTO resolved_opportunity_id
      FROM crm_opportunities
      WHERE organisation_id = quote_row.organisation_id
        AND closed_at IS NOT NULL
        AND primary_contact_id = quote_row.client_id
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL)
        )
      ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - quote_row.created_at))), created_at, id
      LIMIT 1;
      IF resolved_opportunity_id IS NOT NULL THEN
        INSERT INTO crm_reconciliation_issues(record_type, record_id, issue_code, details)
        VALUES (
          'quote', quote_row.id, 'terminal_stage_conflict',
          jsonb_build_object('opportunityId', resolved_opportunity_id, 'quoteStage', resolved_stage)
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    IF resolved_opportunity_id IS NULL AND resolved_site_id IS NOT NULL THEN
      SELECT id INTO resolved_opportunity_id
      FROM crm_opportunities
      WHERE organisation_id = quote_row.organisation_id
        AND primary_contact_id = quote_row.client_id
        AND site_id IS NULL
        AND closed_at IS NULL
      ORDER BY created_at, id
      LIMIT 1;
      IF resolved_opportunity_id IS NOT NULL THEN
        resolved_opportunity_id := crm_promote_provisional_opportunity(resolved_opportunity_id, resolved_site_id);
      END IF;
    END IF;

    IF resolved_opportunity_id IS NULL THEN
      SELECT COALESCE(MAX(cycle_number), 0) + 1 INTO resolved_cycle
      FROM crm_opportunities
      WHERE organisation_id = quote_row.organisation_id
        AND (
          (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
          OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = quote_row.client_id)
        );
      INSERT INTO crm_opportunities(
        organisation_id, primary_contact_id, site_id, stage, cycle_number,
        cycle_reason, closed_at, created_at, updated_at
      ) VALUES (
        quote_row.organisation_id, quote_row.client_id, resolved_site_id,
        resolved_stage, resolved_cycle, 'new_enquiry',
        CASE WHEN resolved_stage IN ('won', 'lost') THEN COALESCE(quote_row.updated_at, quote_row.created_at) ELSE NULL END,
        quote_row.created_at, quote_row.updated_at
      ) RETURNING id INTO resolved_opportunity_id;
    END IF;

    IF resolved_stage IN ('won', 'lost') THEN
      UPDATE crm_opportunities
      SET stage = resolved_stage,
          closed_at = COALESCE(closed_at, quote_row.updated_at, quote_row.created_at)
      WHERE id = resolved_opportunity_id
        AND closed_at IS NULL;
    END IF;

    SELECT id INTO resolved_intake_id
    FROM leads
    WHERE source = 'online_quote' AND source_reference = quote_row.id::TEXT
    ORDER BY created_at, id
    LIMIT 1;
    IF resolved_intake_id IS NULL THEN
      INSERT INTO leads(
        email, business_name, contact_name, phone, city, source, converted_to_client_id,
        organisation_id, contact_id, site_id, address, suburb, postcode, state,
        source_reference, source_explanation, source_obtained_at, contact_basis,
        created_at, updated_at
      ) VALUES (
        LOWER(BTRIM(quote_row.email)), quote_row.business_name, quote_row.contact_name,
        quote_row.phone, resolved_city, 'online_quote', quote_row.client_id,
        quote_row.organisation_id, quote_row.client_id, resolved_site_id,
        NULLIF(BTRIM(quote_row.inputs->>'address'), ''), NULLIF(BTRIM(quote_row.inputs->>'suburb'), ''),
        NULLIF(regexp_replace(BTRIM(quote_row.inputs->>'postcode'), '[^0-9]', '', 'g'), ''),
        CASE WHEN resolved_city = 'sydney' THEN 'NSW' ELSE 'VIC' END,
        quote_row.id::TEXT, 'you requested information or a quote through the Secure Cleaning Aus website',
        quote_row.created_at, 'enquiry', quote_row.created_at, quote_row.updated_at
      ) RETURNING id INTO resolved_intake_id;
    END IF;

    INSERT INTO crm_opportunity_intakes(opportunity_id, lead_id, linked_at)
    VALUES (resolved_opportunity_id, resolved_intake_id, quote_row.created_at)
    ON CONFLICT (lead_id) DO NOTHING;

    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO resolved_sequence
    FROM crm_opportunity_quotes
    WHERE opportunity_id = resolved_opportunity_id;
    INSERT INTO crm_opportunity_quotes(
      opportunity_id, quote_id, sequence_number, link_source, linked_at
    ) VALUES (
      resolved_opportunity_id, quote_row.id, resolved_sequence, 'migration', quote_row.created_at
    ) ON CONFLICT (quote_id) DO NOTHING;
  END LOOP;
END $$;

INSERT INTO crm_reconciliation_issues(record_type, record_id, issue_code, details)
SELECT 'quote', quotes.id, 'contact_unresolved', jsonb_build_object('clientId', quotes.client_id)
FROM quotes
LEFT JOIN clients ON clients.id = quotes.client_id
WHERE clients.id IS NULL
ON CONFLICT DO NOTHING;

UPDATE bookings
SET opportunity_id = crm_opportunity_quotes.opportunity_id
FROM crm_opportunity_quotes
WHERE bookings.opportunity_id IS NULL
  AND bookings.quote_id = crm_opportunity_quotes.quote_id;

CREATE TABLE IF NOT EXISTS crm_email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'outreach',
  purpose TEXT NOT NULL DEFAULT 'marketing' CHECK (purpose IN ('marketing', 'transactional')),
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'personal')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  updated_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_email_templates_shared_name
  ON crm_email_templates(LOWER(name)) WHERE visibility = 'shared' AND status <> 'archived';
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_status ON crm_email_templates(status, visibility);

CREATE TABLE IF NOT EXISTS crm_email_template_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES crm_email_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('marketing', 'transactional')),
  changed_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS crm_email_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_normalized TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed', 'hard_bounce', 'complaint', 'manual')),
  blocks_all BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'client_crm',
  created_by_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES crm_organisations(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  template_id UUID REFERENCES crm_email_templates(id) ON DELETE SET NULL,
  template_version INTEGER,
  purpose TEXT NOT NULL CHECK (purpose IN ('marketing', 'transactional')),
  idempotency_key UUID NOT NULL UNIQUE,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to_email TEXT NOT NULL,
  sender_staff_id UUID NOT NULL REFERENCES admin_staff_accounts(id) ON DELETE RESTRICT,
  sender_name TEXT NOT NULL,
  subject_snapshot TEXT NOT NULL,
  body_snapshot TEXT NOT NULL,
  signature_snapshot TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  footer_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'rejected', 'unknown')),
  provider_message_id TEXT,
  failure_code TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_source_reference
  ON leads(source, source_reference)
  WHERE source_reference IS NOT NULL;

-- SECURITY DEFINER routines below resolve objects from public. Keep that
-- schema usable for queries but writable only by database owners.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION find_client_crm_contacts_by_email(p_email TEXT)
RETURNS TABLE(id UUID, business_name TEXT, contact_name TEXT, phone TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clients.id, clients.business_name, clients.contact_name, clients.phone
  FROM clients
  WHERE LOWER(BTRIM(clients.email)) = LOWER(BTRIM(p_email))
  ORDER BY clients.id
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION create_client_crm_opportunity(
  p_business_name TEXT,
  p_contact_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_suburb TEXT,
  p_postcode TEXT,
  p_city city_type,
  p_source TEXT,
  p_source_provider TEXT,
  p_source_reference TEXT,
  p_source_explanation TEXT,
  p_contact_basis TEXT,
  p_assigned_staff_id UUID,
  p_assignment_method TEXT,
  p_notes TEXT,
  p_actor_id UUID,
  p_actor_role TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_contact clients%ROWTYPE;
  resolved_organisation_id UUID;
  resolved_contact_id UUID;
  resolved_site_id UUID;
  created_intake_id UUID;
  created_opportunity_id UUID;
  previous_opportunity_id UUID;
  resolved_cycle INTEGER;
  resolved_site_key TEXT;
  name_parts TEXT[];
  normalized_match_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-contact-email:' || LOWER(BTRIM(p_email)), 0));
  SELECT COUNT(*) INTO normalized_match_count
  FROM clients
  WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(p_email));

  IF normalized_match_count > 1 THEN
    SELECT COUNT(*) INTO normalized_match_count
    FROM clients
    WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(p_email))
      AND LOWER(BTRIM(business_name)) = LOWER(BTRIM(p_business_name))
      AND LOWER(BTRIM(contact_name)) = LOWER(BTRIM(p_contact_name))
      AND (
        crm_normalize_phone(phone) = crm_normalize_phone(p_phone)
        OR crm_normalize_phone(phone) IS NULL
        OR crm_normalize_phone(p_phone) IS NULL
      );
    IF normalized_match_count <> 1 THEN
      RAISE EXCEPTION 'contact details require reconciliation' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO existing_contact
    FROM clients
    WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(p_email))
      AND LOWER(BTRIM(business_name)) = LOWER(BTRIM(p_business_name))
      AND LOWER(BTRIM(contact_name)) = LOWER(BTRIM(p_contact_name))
      AND (
        crm_normalize_phone(phone) = crm_normalize_phone(p_phone)
        OR crm_normalize_phone(phone) IS NULL
        OR crm_normalize_phone(p_phone) IS NULL
      )
    ORDER BY id
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO existing_contact
    FROM clients
    WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(p_email))
    ORDER BY id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF existing_contact.id IS NOT NULL THEN
    IF LOWER(BTRIM(existing_contact.business_name)) <> LOWER(BTRIM(p_business_name))
      OR LOWER(BTRIM(existing_contact.contact_name)) <> LOWER(BTRIM(p_contact_name))
      OR (
        crm_normalize_phone(existing_contact.phone) IS NOT NULL
        AND crm_normalize_phone(p_phone) IS NOT NULL
        AND crm_normalize_phone(existing_contact.phone) <> crm_normalize_phone(p_phone)
      )
    THEN
      RAISE EXCEPTION 'contact details require reconciliation' USING ERRCODE = '23514';
    END IF;
    IF p_actor_role = 'agent' AND NOT EXISTS (
      SELECT 1 FROM crm_opportunities
      WHERE primary_contact_id = existing_contact.id
        AND assigned_staff_id = p_actor_id
    ) THEN
      RAISE EXCEPTION 'existing contact requires reconciliation' USING ERRCODE = '42501';
    END IF;
    resolved_contact_id := existing_contact.id;
    resolved_organisation_id := existing_contact.organisation_id;
    IF resolved_organisation_id IS NULL THEN
      INSERT INTO crm_organisations (business_name, phone)
      VALUES (existing_contact.business_name, existing_contact.phone)
      RETURNING id INTO resolved_organisation_id;
      UPDATE clients SET organisation_id = resolved_organisation_id WHERE id = resolved_contact_id;
    END IF;
  ELSE
    INSERT INTO crm_organisations (business_name, phone)
    VALUES (p_business_name, NULLIF(p_phone, ''))
    RETURNING id INTO resolved_organisation_id;

    name_parts := regexp_split_to_array(p_contact_name, E'\\s+');
    INSERT INTO clients (
      business_name, contact_name, first_name, last_name, email, phone, address,
      city, organisation_id, is_primary_contact, updated_at
    ) VALUES (
      p_business_name, p_contact_name, name_parts[1],
      NULLIF(array_to_string(name_parts[2:array_length(name_parts, 1)], ' '), ''),
      LOWER(BTRIM(p_email)), NULLIF(BTRIM(p_phone), ''), NULLIF(BTRIM(p_address), ''), p_city,
      resolved_organisation_id, TRUE, NOW()
    ) RETURNING id INTO resolved_contact_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crm-org:' || resolved_organisation_id::TEXT, 0));

  resolved_site_key := crm_site_identity_key(p_address, p_suburb, p_postcode, p_city);
  IF resolved_site_key IS NOT NULL THEN
    SELECT id INTO resolved_site_id
    FROM sites
    WHERE organisation_id = resolved_organisation_id
      AND crm_site_key = resolved_site_key;

    IF resolved_site_id IS NULL THEN
      INSERT INTO sites (
        client_id, organisation_id, site_name, address, suburb, postcode, city,
        is_active, crm_site_key
      ) VALUES (
        resolved_contact_id, resolved_organisation_id, p_business_name, BTRIM(p_address),
        NULLIF(BTRIM(p_suburb), ''), regexp_replace(BTRIM(p_postcode), '[^0-9]', '', 'g'),
        p_city, TRUE, resolved_site_key
      ) RETURNING id INTO resolved_site_id;
    END IF;
  END IF;

  IF resolved_site_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-site:' || resolved_site_id::TEXT, 0));
  END IF;

  IF EXISTS (
    SELECT 1 FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND closed_at IS NULL
      AND (
        (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
        OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = resolved_contact_id)
      )
  ) THEN
    RAISE EXCEPTION 'active opportunity exists' USING ERRCODE = '23505';
  END IF;
  IF resolved_site_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND primary_contact_id = resolved_contact_id
      AND site_id IS NULL
      AND closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active provisional opportunity exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO leads (
    email, business_name, contact_name, phone, city, source, notes,
    follow_up_status, follow_up_notes, converted_to_client_id, organisation_id,
    contact_id, site_id, address, suburb, postcode, state,
    source_provider, source_reference, source_explanation, source_obtained_at,
    contact_basis
  ) VALUES (
    LOWER(BTRIM(p_email)), p_business_name, p_contact_name, NULLIF(BTRIM(p_phone), ''), p_city,
    p_source, NULLIF(p_notes, ''), 'new', NULLIF(p_notes, ''), resolved_contact_id,
    resolved_organisation_id, resolved_contact_id, resolved_site_id, NULLIF(BTRIM(p_address), ''),
    NULLIF(p_suburb, ''), p_postcode, CASE WHEN p_city = 'sydney' THEN 'NSW' ELSE 'VIC' END,
    NULLIF(p_source_provider, ''), NULLIF(p_source_reference, ''), p_source_explanation,
    NOW(), p_contact_basis
  ) RETURNING id INTO created_intake_id;

  SELECT id, cycle_number INTO previous_opportunity_id, resolved_cycle
  FROM crm_opportunities
  WHERE organisation_id = resolved_organisation_id
    AND (
      (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
      OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = resolved_contact_id)
    )
  ORDER BY cycle_number DESC, created_at DESC, id DESC
  LIMIT 1;

  INSERT INTO crm_opportunities(
    organisation_id, primary_contact_id, site_id, assigned_staff_id, stage,
    cycle_number, previous_opportunity_id, cycle_reason, assignment_method, notes
  ) VALUES (
    resolved_organisation_id, resolved_contact_id, resolved_site_id, p_assigned_staff_id,
    'new', COALESCE(resolved_cycle, 0) + 1, previous_opportunity_id,
    CASE WHEN previous_opportunity_id IS NULL THEN 'new_enquiry' ELSE 'new_requirement' END,
    p_assignment_method, NULLIF(p_notes, '')
  ) RETURNING id INTO created_opportunity_id;

  INSERT INTO crm_opportunity_intakes(opportunity_id, lead_id)
  VALUES (created_opportunity_id, created_intake_id);

  INSERT INTO admin_audit_log (entity_type, entity_ref, action, details)
  VALUES (
    'crm_opportunity', created_opportunity_id::TEXT, 'crm.opportunity.created',
    jsonb_build_object(
      'intakeId', created_intake_id,
      'assignedStaffId', p_assigned_staff_id,
      'assignmentMethod', p_assignment_method,
      'sourceType', p_source,
      'actorId', p_actor_id,
      'actorRole', p_actor_role
    )
  );
  RETURN created_opportunity_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_client_crm_opportunity(
  p_quote_id UUID,
  p_booking_id UUID,
  p_contact_id UUID,
  p_site_id UUID,
  p_address TEXT,
  p_suburb TEXT,
  p_postcode TEXT,
  p_city city_type,
  p_source TEXT,
  p_source_explanation TEXT,
  p_assigned_staff_id UUID,
  p_assignment_method TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_row clients%ROWTYPE;
  resolved_organisation_id UUID;
  resolved_site_id UUID;
  resolved_site_key TEXT;
  resolved_opportunity_id UUID;
  resolved_intake_id UUID;
  resolved_sequence INTEGER;
  resolved_cycle INTEGER;
  previous_opportunity_id UUID;
  resolved_reference TEXT;
  quote_opportunity_id UUID;
  booking_opportunity_id UUID;
BEGIN
  IF p_quote_id IS NULL AND p_booking_id IS NULL THEN
    RAISE EXCEPTION 'quote or booking reference is required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO contact_row FROM clients WHERE id = p_contact_id FOR UPDATE;
  IF contact_row.id IS NULL THEN RAISE EXCEPTION 'contact not found' USING ERRCODE = '23503'; END IF;

  resolved_organisation_id := contact_row.organisation_id;
  IF resolved_organisation_id IS NULL THEN
    INSERT INTO crm_organisations(business_name, phone)
    VALUES (contact_row.business_name, contact_row.phone)
    RETURNING id INTO resolved_organisation_id;
    UPDATE clients SET organisation_id = resolved_organisation_id WHERE id = contact_row.id;
  END IF;

  IF p_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quotes
    WHERE id = p_quote_id AND client_id = contact_row.id
  ) THEN
    RAISE EXCEPTION 'quote does not belong to contact' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crm-org:' || resolved_organisation_id::TEXT, 0));

  IF p_site_id IS NOT NULL THEN
    SELECT (details->>'canonicalSiteId')::UUID INTO resolved_site_id
    FROM crm_reconciliation_issues
    WHERE record_type = 'site'
      AND record_id = p_site_id
      AND issue_code = 'duplicate_site_identity'
      AND resolved_at IS NULL;
    resolved_site_id := COALESCE(resolved_site_id, p_site_id);
    SELECT id INTO resolved_site_id
    FROM sites
    WHERE id = resolved_site_id
      AND (organisation_id = resolved_organisation_id OR organisation_id IS NULL)
      AND is_active = TRUE
    FOR UPDATE;
    IF resolved_site_id IS NULL THEN RAISE EXCEPTION 'site does not belong to contact organisation' USING ERRCODE = '23514'; END IF;
    UPDATE sites SET
      organisation_id = resolved_organisation_id,
      crm_site_key = COALESCE(crm_site_key, crm_site_identity_key(address, suburb, postcode, city))
    WHERE id = resolved_site_id;
  ELSE
    resolved_site_key := crm_site_identity_key(p_address, p_suburb, p_postcode, p_city);
    IF resolved_site_key IS NOT NULL THEN
      SELECT id INTO resolved_site_id
      FROM sites
      WHERE organisation_id = resolved_organisation_id AND crm_site_key = resolved_site_key;
      IF resolved_site_id IS NULL THEN
        INSERT INTO sites(
          client_id, organisation_id, site_name, address, suburb, postcode, city,
          is_active, crm_site_key
        ) VALUES (
          contact_row.id, resolved_organisation_id, contact_row.business_name,
          BTRIM(p_address), NULLIF(BTRIM(p_suburb), ''),
          regexp_replace(BTRIM(p_postcode), '[^0-9]', '', 'g'), p_city, TRUE, resolved_site_key
        )
        ON CONFLICT (organisation_id, crm_site_key)
          WHERE organisation_id IS NOT NULL AND crm_site_key IS NOT NULL
        DO UPDATE SET crm_site_key = EXCLUDED.crm_site_key
        RETURNING id INTO resolved_site_id;
      END IF;
    END IF;
  END IF;

  IF resolved_site_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-site:' || resolved_site_id::TEXT, 0));
  END IF;

  IF p_quote_id IS NOT NULL THEN
    SELECT opportunity_id INTO quote_opportunity_id
    FROM crm_opportunity_quotes
    WHERE quote_id = p_quote_id;
    IF quote_opportunity_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM crm_opportunities
      WHERE id = quote_opportunity_id
        AND organisation_id = resolved_organisation_id
        AND primary_contact_id = contact_row.id
    ) THEN
      RAISE EXCEPTION 'quote opportunity does not belong to contact' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT opportunity_id INTO booking_opportunity_id
    FROM bookings
    WHERE id = p_booking_id
      AND client_id = contact_row.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking does not belong to contact' USING ERRCODE = '23514';
    END IF;
    IF booking_opportunity_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM crm_opportunities
      WHERE id = booking_opportunity_id
        AND organisation_id = resolved_organisation_id
        AND primary_contact_id = contact_row.id
    ) THEN
      RAISE EXCEPTION 'booking opportunity does not belong to contact' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF quote_opportunity_id IS NOT NULL AND booking_opportunity_id IS NOT NULL
    AND quote_opportunity_id <> booking_opportunity_id THEN
    RAISE EXCEPTION 'quote and booking belong to different opportunities' USING ERRCODE = '23514';
  END IF;
  resolved_opportunity_id := COALESCE(quote_opportunity_id, booking_opportunity_id);

  IF resolved_opportunity_id IS NOT NULL AND resolved_site_id IS NOT NULL THEN
    resolved_opportunity_id := crm_promote_provisional_opportunity(resolved_opportunity_id, resolved_site_id);
  END IF;

  IF resolved_opportunity_id IS NULL THEN
    SELECT id INTO resolved_opportunity_id
    FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND closed_at IS NULL
      AND (
        (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
        OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = contact_row.id)
      )
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF resolved_opportunity_id IS NULL AND resolved_site_id IS NOT NULL THEN
    SELECT id INTO resolved_opportunity_id
    FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND primary_contact_id = contact_row.id
      AND site_id IS NULL
      AND closed_at IS NULL
    ORDER BY created_at, id
    LIMIT 1;
    IF resolved_opportunity_id IS NOT NULL THEN
      resolved_opportunity_id := crm_promote_provisional_opportunity(resolved_opportunity_id, resolved_site_id);
    END IF;
  END IF;

  IF resolved_opportunity_id IS NULL THEN
    SELECT id, cycle_number INTO previous_opportunity_id, resolved_cycle
    FROM crm_opportunities
    WHERE organisation_id = resolved_organisation_id
      AND (
        (resolved_site_id IS NOT NULL AND site_id = resolved_site_id)
        OR (resolved_site_id IS NULL AND site_id IS NULL AND primary_contact_id = contact_row.id)
      )
    ORDER BY cycle_number DESC, created_at DESC, id DESC
    LIMIT 1;
    INSERT INTO crm_opportunities(
      organisation_id, primary_contact_id, site_id, assigned_staff_id, stage,
      cycle_number, previous_opportunity_id, cycle_reason, assignment_method
    ) VALUES (
      resolved_organisation_id, contact_row.id, resolved_site_id, p_assigned_staff_id,
      CASE WHEN p_booking_id IS NOT NULL THEN 'qualified' ELSE 'new' END,
      COALESCE(resolved_cycle, 0) + 1, previous_opportunity_id,
      CASE WHEN previous_opportunity_id IS NULL THEN 'new_enquiry' ELSE 'requote' END,
      p_assignment_method
    ) RETURNING id INTO resolved_opportunity_id;
  ELSE
    UPDATE crm_opportunities SET
      assigned_staff_id = COALESCE(assigned_staff_id, p_assigned_staff_id),
      assignment_method = CASE WHEN assigned_staff_id IS NULL AND p_assigned_staff_id IS NOT NULL THEN p_assignment_method ELSE assignment_method END,
      stage = CASE WHEN p_booking_id IS NOT NULL AND stage IN ('new', 'contacted') THEN 'qualified' ELSE stage END
    WHERE id = resolved_opportunity_id;
  END IF;

  resolved_reference := COALESCE(p_quote_id::TEXT, p_booking_id::TEXT);
  SELECT id INTO resolved_intake_id
  FROM leads
  WHERE source = p_source AND source_reference = resolved_reference;
  IF resolved_intake_id IS NULL THEN
    INSERT INTO leads(
      email, business_name, contact_name, phone, city, source, converted_to_client_id,
      organisation_id, contact_id, site_id, address, suburb, postcode, state,
      source_reference, source_explanation, source_obtained_at, contact_basis
    ) VALUES (
      LOWER(BTRIM(contact_row.email)), contact_row.business_name, contact_row.contact_name,
      contact_row.phone, p_city, p_source, contact_row.id, resolved_organisation_id,
      contact_row.id, resolved_site_id, NULLIF(BTRIM(p_address), ''), NULLIF(BTRIM(p_suburb), ''),
      NULLIF(regexp_replace(BTRIM(p_postcode), '[^0-9]', '', 'g'), ''),
      CASE WHEN p_city = 'sydney' THEN 'NSW' ELSE 'VIC' END,
      resolved_reference, p_source_explanation, NOW(), 'enquiry'
    ) RETURNING id INTO resolved_intake_id;
  END IF;
  INSERT INTO crm_opportunity_intakes(opportunity_id, lead_id)
  VALUES (resolved_opportunity_id, resolved_intake_id)
  ON CONFLICT (lead_id) DO NOTHING;

  IF p_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity_quotes WHERE quote_id = p_quote_id
  ) THEN
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO resolved_sequence
    FROM crm_opportunity_quotes WHERE opportunity_id = resolved_opportunity_id;
    INSERT INTO crm_opportunity_quotes(opportunity_id, quote_id, sequence_number, link_source)
    VALUES (resolved_opportunity_id, p_quote_id, resolved_sequence, p_source)
    ON CONFLICT (quote_id) DO NOTHING;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    UPDATE bookings SET opportunity_id = resolved_opportunity_id
    WHERE id = p_booking_id AND opportunity_id IS NULL;
  END IF;
  RETURN resolved_opportunity_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_client_crm_opportunity(
  p_opportunity_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_stage TEXT,
  p_notes TEXT,
  p_next_follow_up_at TIMESTAMPTZ,
  p_assigned_staff_id UUID,
  p_assignment_method TEXT,
  p_contact_basis TEXT,
  p_source_provider TEXT,
  p_source_explanation TEXT,
  p_actor_id UUID,
  p_actor_role TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_opportunity crm_opportunities%ROWTYPE;
  actor_account admin_staff_accounts%ROWTYPE;
  primary_intake_id UUID;
BEGIN
  SELECT * INTO actor_account
  FROM admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE AND role = p_actor_role;
  IF actor_account.id IS NULL OR p_actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'opportunity access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_opportunity
  FROM crm_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;
  IF current_opportunity.id IS NULL THEN RAISE EXCEPTION 'opportunity not found' USING ERRCODE = 'P0002'; END IF;
  IF current_opportunity.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'opportunity changed since it was loaded' USING ERRCODE = '40001';
  END IF;
  IF p_actor_role = 'agent' AND current_opportunity.assigned_staff_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'opportunity access denied' USING ERRCODE = '42501';
  END IF;
  IF p_actor_role = 'agent' AND p_assigned_staff_id IS DISTINCT FROM current_opportunity.assigned_staff_id THEN
    RAISE EXCEPTION 'agents cannot reassign opportunities' USING ERRCODE = '42501';
  END IF;
  IF p_stage NOT IN ('new', 'contacted', 'qualified', 'inspection', 'quoting', 'proposal_sent', 'won', 'lost', 'cancelled') THEN
    RAISE EXCEPTION 'invalid opportunity stage' USING ERRCODE = '23514';
  END IF;
  IF current_opportunity.closed_at IS NOT NULL AND p_stage <> current_opportunity.stage THEN
    RAISE EXCEPTION 'closed opportunity history cannot be reopened' USING ERRCODE = '23514';
  END IF;

  UPDATE crm_opportunities SET
    stage = p_stage,
    notes = NULLIF(p_notes, ''),
    next_follow_up_at = p_next_follow_up_at,
    assigned_staff_id = p_assigned_staff_id,
    assignment_method = p_assignment_method,
    closed_at = CASE
      WHEN p_stage IN ('won', 'lost', 'cancelled') THEN COALESCE(closed_at, NOW())
      ELSE NULL
    END
  WHERE id = p_opportunity_id;

  SELECT lead_id INTO primary_intake_id
  FROM crm_opportunity_intakes
  WHERE opportunity_id = p_opportunity_id
  ORDER BY linked_at, lead_id
  LIMIT 1
  FOR UPDATE;
  IF primary_intake_id IS NOT NULL THEN
    UPDATE leads SET
      contact_basis = p_contact_basis,
      source_provider = NULLIF(p_source_provider, ''),
      source_explanation = p_source_explanation
    WHERE id = primary_intake_id;
  END IF;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES (
    'crm_opportunity', p_opportunity_id::TEXT, 'crm.opportunity.updated',
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role)
  );
  RETURN p_opportunity_id;
END;
$$;

CREATE OR REPLACE FUNCTION claim_client_crm_communication(
  p_opportunity_id UUID,
  p_organisation_id UUID,
  p_contact_id UUID,
  p_template_id UUID,
  p_template_version INTEGER,
  p_purpose TEXT,
  p_idempotency_key UUID,
  p_to_email TEXT,
  p_from_email TEXT,
  p_reply_to_email TEXT,
  p_sender_staff_id UUID,
  p_sender_name TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_signature TEXT,
  p_source TEXT,
  p_footer TEXT,
  p_actor_role TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  actor_account admin_staff_accounts%ROWTYPE;
  contact_email TEXT;
  communication_id UUID;
BEGIN
  SELECT * INTO actor_account
  FROM admin_staff_accounts
  WHERE id = p_sender_staff_id AND active = TRUE AND role = p_actor_role;
  IF actor_account.id IS NULL OR p_actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'communication access denied' USING ERRCODE = '42501';
  END IF;
  IF LOWER(BTRIM(actor_account.email)) <> LOWER(BTRIM(p_reply_to_email))
    OR actor_account.display_name <> p_sender_name THEN
    RAISE EXCEPTION 'sender identity mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO opportunity_row
  FROM crm_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;
  IF opportunity_row.id IS NULL
    OR opportunity_row.organisation_id <> p_organisation_id
    OR opportunity_row.primary_contact_id <> p_contact_id THEN
    RAISE EXCEPTION 'opportunity identity mismatch' USING ERRCODE = '23514';
  END IF;
  IF p_actor_role = 'agent' AND opportunity_row.assigned_staff_id IS DISTINCT FROM p_sender_staff_id THEN
    RAISE EXCEPTION 'communication access denied' USING ERRCODE = '42501';
  END IF;
  IF p_purpose <> 'marketing' THEN
    RAISE EXCEPTION 'unsupported communication purpose' USING ERRCODE = '23514';
  END IF;

  SELECT LOWER(BTRIM(email)) INTO contact_email
  FROM clients
  WHERE id = p_contact_id AND organisation_id = p_organisation_id;
  IF contact_email IS NULL OR contact_email <> LOWER(BTRIM(p_to_email)) THEN
    RAISE EXCEPTION 'recipient identity mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM crm_email_suppressions
    WHERE email_normalized = contact_email
  ) THEN
    RAISE EXCEPTION 'recipient is suppressed' USING ERRCODE = '23514';
  END IF;

  INSERT INTO crm_communications(
    opportunity_id, organisation_id, contact_id, template_id, template_version,
    purpose, idempotency_key, to_email, from_email, reply_to_email,
    sender_staff_id, sender_name, subject_snapshot, body_snapshot,
    signature_snapshot, source_snapshot, footer_snapshot, status
  ) VALUES (
    p_opportunity_id, p_organisation_id, p_contact_id, p_template_id, p_template_version,
    p_purpose, p_idempotency_key, contact_email, p_from_email, p_reply_to_email,
    p_sender_staff_id, p_sender_name, p_subject, p_body,
    p_signature, p_source, p_footer, 'sending'
  ) RETURNING id INTO communication_id;
  RETURN communication_id;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_client_crm_communication(
  p_communication_id UUID,
  p_provider_message_id TEXT,
  p_sent_at TIMESTAMPTZ,
  p_audit_details JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opportunity_ref UUID;
BEGIN
  UPDATE crm_communications
  SET status = 'sent', provider_message_id = p_provider_message_id, sent_at = p_sent_at
  WHERE id = p_communication_id AND status = 'sending'
  RETURNING opportunity_id INTO opportunity_ref;

  IF opportunity_ref IS NULL THEN
    RAISE EXCEPTION 'communication is not sendable';
  END IF;

  INSERT INTO admin_audit_log (entity_type, entity_ref, action, details)
  VALUES ('crm_opportunity', opportunity_ref::TEXT, 'crm.email.sent', p_audit_details);
END;
$$;

CREATE OR REPLACE FUNCTION save_client_crm_template(
  p_template_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_category TEXT,
  p_visibility TEXT,
  p_status TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_actor_id UUID,
  p_actor_role TEXT
) RETURNS TABLE(template_id UUID, template_version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_template crm_email_templates%ROWTYPE;
  actor_account admin_staff_accounts%ROWTYPE;
  resolved_id UUID;
  resolved_version INTEGER;
  resolved_purpose TEXT;
  resolved_visibility TEXT;
  resolved_status TEXT;
BEGIN
  SELECT * INTO actor_account
  FROM admin_staff_accounts
  WHERE id = p_actor_id AND active = TRUE AND role = p_actor_role;
  IF actor_account.id IS NULL OR p_actor_role NOT IN ('owner', 'manager', 'agent') THEN
    RAISE EXCEPTION 'template access denied' USING ERRCODE = '42501';
  END IF;
  resolved_visibility := CASE WHEN p_actor_role = 'agent' THEN 'personal' ELSE p_visibility END;
  resolved_status := CASE WHEN p_actor_role = 'agent' THEN 'draft' ELSE p_status END;

  IF p_template_id IS NULL THEN
    INSERT INTO crm_email_templates (
      name, description, category, purpose, visibility, status, is_system,
      subject, body, current_version, created_by_staff_id, updated_by_staff_id
    ) VALUES (
      p_name, NULLIF(p_description, ''), p_category, 'marketing', resolved_visibility,
      resolved_status, FALSE, p_subject, p_body, 1, p_actor_id, p_actor_id
    ) RETURNING id, current_version INTO resolved_id, resolved_version;
    resolved_purpose := 'marketing';
  ELSE
    SELECT * INTO current_template
    FROM crm_email_templates
    WHERE id = p_template_id
    FOR UPDATE;
    IF current_template.id IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;
    IF p_actor_role = 'agent'
      AND current_template.visibility = 'personal'
      AND current_template.created_by_staff_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'template access denied' USING ERRCODE = '42501';
    END IF;
    IF p_actor_role = 'agent' AND current_template.visibility = 'shared' THEN
      resolved_visibility := current_template.visibility;
      resolved_status := current_template.status;
    END IF;
    resolved_id := current_template.id;
    resolved_version := current_template.current_version + 1;
    resolved_purpose := 'marketing';
    UPDATE crm_email_templates SET
      name = p_name,
      description = NULLIF(p_description, ''),
      category = p_category,
      purpose = resolved_purpose,
      visibility = resolved_visibility,
      status = resolved_status,
      subject = p_subject,
      body = p_body,
      current_version = resolved_version,
      updated_by_staff_id = p_actor_id
    WHERE id = resolved_id;
  END IF;

  INSERT INTO crm_email_template_versions (
    template_id, version, subject, body, purpose, changed_by_staff_id
  ) VALUES (
    resolved_id, resolved_version, p_subject, p_body, resolved_purpose, p_actor_id
  );
  INSERT INTO admin_audit_log (entity_type, entity_ref, action, details)
  VALUES (
    'crm_email_template', resolved_id::TEXT,
    CASE WHEN p_template_id IS NULL THEN 'crm.template.created' ELSE 'crm.template.updated' END,
    jsonb_build_object('actorId', p_actor_id, 'actorRole', p_actor_role, 'version', resolved_version)
  );
  RETURN QUERY SELECT resolved_id, resolved_version;
END;
$$;

CREATE OR REPLACE FUNCTION unsubscribe_client_crm_contact(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_ref UUID;
  contact_email TEXT;
BEGIN
  SELECT id, LOWER(BTRIM(email)) INTO contact_ref, contact_email
  FROM clients
  WHERE unsubscribe_token = p_token;
  IF contact_ref IS NULL OR contact_email IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO crm_email_suppressions (
    email_normalized, reason, blocks_all, source
  ) VALUES (
    contact_email, 'unsubscribed', FALSE, 'unsubscribe_link'
  )
  ON CONFLICT (email_normalized) DO UPDATE SET
    reason = CASE
      WHEN crm_email_suppressions.blocks_all THEN crm_email_suppressions.reason
      ELSE EXCLUDED.reason
    END,
    blocks_all = crm_email_suppressions.blocks_all OR EXCLUDED.blocks_all,
    source = CASE
      WHEN crm_email_suppressions.blocks_all THEN crm_email_suppressions.source
      ELSE EXCLUDED.source
    END,
    updated_at = NOW();

  INSERT INTO admin_audit_log (entity_type, entity_ref, action, details)
  VALUES ('client', contact_ref::TEXT, 'crm.email.unsubscribed', '{}'::jsonb);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION crm_normalize_phone(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_site_identity_key(TEXT, TEXT, TEXT, city_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_promote_provisional_opportunity(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION find_client_crm_contacts_by_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_client_crm_opportunity(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, city_type, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_client_crm_opportunity(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, city_type, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_client_crm_opportunity(UUID, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_client_crm_communication(UUID, UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finalize_client_crm_communication(UUID, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_client_crm_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unsubscribe_client_crm_contact(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_normalize_phone(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION crm_site_identity_key(TEXT, TEXT, TEXT, city_type) TO service_role;
GRANT EXECUTE ON FUNCTION crm_promote_provisional_opportunity(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION find_client_crm_contacts_by_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION create_client_crm_opportunity(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, city_type, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sync_client_crm_opportunity(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, city_type, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_client_crm_opportunity(UUID, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_client_crm_communication(UUID, UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION finalize_client_crm_communication(UUID, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION save_client_crm_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION unsubscribe_client_crm_contact(UUID) TO service_role;

CREATE INDEX IF NOT EXISTS idx_crm_communications_opportunity_id ON crm_communications(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_communications_contact_id ON crm_communications(contact_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_communications_provider_id
  ON crm_communications(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_communications_unresolved
  ON crm_communications(contact_id) WHERE status IN ('sending', 'unknown');

ALTER TABLE crm_organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_opportunity_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_opportunity_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_reconciliation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can insert leads" ON leads;
REVOKE INSERT ON TABLE leads FROM anon;

REVOKE ALL ON TABLE crm_organisations, crm_opportunities, crm_opportunity_intakes,
  crm_opportunity_quotes, crm_reconciliation_issues, crm_email_templates, crm_email_template_versions,
  crm_email_suppressions, crm_communications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE crm_organisations, crm_opportunities, crm_opportunity_intakes,
  crm_opportunity_quotes, crm_reconciliation_issues, crm_email_templates, crm_email_template_versions,
  crm_email_suppressions, crm_communications TO service_role;

DO $$
DECLARE crm_table_name TEXT;
BEGIN
  FOREACH crm_table_name IN ARRAY ARRAY[
    'crm_organisations',
    'crm_opportunities',
    'crm_opportunity_intakes',
    'crm_opportunity_quotes',
    'crm_reconciliation_issues',
    'crm_email_templates',
    'crm_email_template_versions',
    'crm_email_suppressions',
    'crm_communications'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = crm_table_name
        AND policyname = 'Service role full access - ' || crm_table_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'Service role full access - ' || crm_table_name,
        crm_table_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_organisations_updated_at') THEN
    CREATE TRIGGER trg_crm_organisations_updated_at BEFORE UPDATE ON crm_organisations
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_opportunities_updated_at') THEN
    CREATE TRIGGER trg_crm_opportunities_updated_at BEFORE UPDATE ON crm_opportunities
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_email_templates_updated_at') THEN
    CREATE TRIGGER trg_crm_email_templates_updated_at BEFORE UPDATE ON crm_email_templates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_email_suppressions_updated_at') THEN
    CREATE TRIGGER trg_crm_email_suppressions_updated_at BEFORE UPDATE ON crm_email_suppressions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_communications_updated_at') THEN
    CREATE TRIGGER trg_crm_communications_updated_at BEFORE UPDATE ON crm_communications
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_updated_at') THEN
    CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

INSERT INTO crm_email_templates (name, description, category, purpose, visibility, status, is_system, subject, body)
VALUES
  ('Purchased lead - first response', 'Initial response to a purchased commercial cleaning lead.', 'outreach', 'marketing', 'shared', 'published', TRUE, 'Commercial cleaning enquiry for {{business_name}}', E'Hi {{first_name}},\n\nWe received your contact information from {{lead_source}} in relation to commercial cleaning services for {{business_name}}.\n\nSecure Cleaning Aus provides commercial cleaning across Melbourne and Sydney, with flexible frequencies and no lock-in contracts. Would you be available for a short call so we can understand the site and prepare the right next step?'),
  ('Business introduction', 'General business-to-business introduction.', 'outreach', 'marketing', 'shared', 'published', TRUE, 'Commercial cleaning support for {{business_name}}', E'Hi {{first_name}},\n\nI am reaching out from Secure Cleaning Aus to introduce our commercial cleaning service. We work with businesses that need reliable, flexible cleaning without a lock-in contract.\n\nIf reviewing your current cleaning arrangement is useful, I would be happy to discuss your site and requirements.'),
  ('Online quote follow-up', 'Follow up after an online quote request.', 'quote_follow_up', 'marketing', 'shared', 'published', TRUE, 'Following up on your Secure Cleaning quote', E'Hi {{first_name}},\n\nThank you for requesting a quote from Secure Cleaning Aus. I wanted to check whether you had any questions about the estimate or would like to arrange a site inspection so we can confirm the scope and final pricing.'),
  ('First follow-up', 'First follow-up when no reply has been received.', 'follow_up', 'marketing', 'shared', 'published', TRUE, 'Following up - {{business_name}}', E'Hi {{first_name}},\n\nI wanted to follow up on my earlier email about commercial cleaning for {{business_name}}. If the timing is not right, please let me know. Otherwise, I would be happy to arrange a short call or site inspection.'),
  ('Close the loop', 'Final courteous follow-up.', 'follow_up', 'marketing', 'shared', 'published', TRUE, 'Should I close this enquiry?', E'Hi {{first_name}},\n\nI have not heard back, so I wanted to check whether you would like us to keep this enquiry open. I am happy to close it for now, or arrange a call if commercial cleaning is still being considered.'),
  ('Site inspection invitation', 'Invite a prospect to choose a site inspection.', 'inspection', 'marketing', 'shared', 'published', TRUE, 'Arrange a site inspection for {{business_name}}', E'Hi {{first_name}},\n\nThe next step is a short site inspection so we can confirm access, scope and the final service price. Please reply with suitable days and times, and I will help arrange the inspection.'),
  ('Final quote follow-up', 'Follow up after a reviewed final quote.', 'quote_follow_up', 'marketing', 'shared', 'published', TRUE, 'Your final Secure Cleaning quote', E'Hi {{first_name}},\n\nI am following up on the final quote prepared for {{business_name}}. Please let me know if you would like to discuss any part of the scope, timing or commencement process.'),
  ('Future opportunity follow-up', 'Revisit a lead at a later date.', 'follow_up', 'marketing', 'shared', 'published', TRUE, 'Checking in about cleaning at {{business_name}}', E'Hi {{first_name}},\n\nWe spoke previously about commercial cleaning for {{business_name}}. I wanted to check whether your requirements or timing have changed and whether it would be useful to review the site now.')
ON CONFLICT DO NOTHING;

INSERT INTO crm_email_template_versions (template_id, version, subject, body, purpose)
SELECT id, current_version, subject, body, purpose
FROM crm_email_templates
ON CONFLICT (template_id, version) DO NOTHING;
