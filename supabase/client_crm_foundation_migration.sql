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

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES crm_organisations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sites_organisation_id ON sites(organisation_id);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES crm_organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES admin_staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS suburb TEXT,
  ADD COLUMN IF NOT EXISTS postcode TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS source_provider TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS source_explanation TEXT,
  ADD COLUMN IF NOT EXISTS source_obtained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_basis TEXT,
  ADD COLUMN IF NOT EXISTS assignment_method TEXT,
  ADD COLUMN IF NOT EXISTS assignment_zone_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_leads_organisation_id ON leads(organisation_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_staff_id ON leads(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_leads_quote_id ON leads(quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_quote_id_unique ON leads(quote_id) WHERE quote_id IS NOT NULL;

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

UPDATE leads
SET contact_id = converted_to_client_id
WHERE contact_id IS NULL
  AND converted_to_client_id IS NOT NULL;

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

INSERT INTO leads (
  email, business_name, contact_name, phone, city, source, converted_to_client_id,
  organisation_id, contact_id, quote_id, address, suburb, postcode, state,
  source_explanation, source_obtained_at, contact_basis, assignment_method,
  follow_up_status, created_at, updated_at
)
SELECT
  clients.email,
  clients.business_name,
  clients.contact_name,
  clients.phone,
  clients.city,
  'online_quote',
  clients.id,
  clients.organisation_id,
  clients.id,
  quotes.id,
  NULLIF(quotes.inputs->>'address', ''),
  NULLIF(quotes.inputs->>'suburb', ''),
  NULLIF(quotes.inputs->>'postcode', ''),
  CASE WHEN clients.city = 'sydney' THEN 'NSW' ELSE 'VIC' END,
  'you requested information or a quote through the Secure Cleaning Aus website',
  quotes.created_at,
  'enquiry',
  'unassigned',
  COALESCE(quotes.follow_up_status, 'new'),
  quotes.created_at,
  quotes.updated_at
FROM quotes
JOIN clients ON clients.id = quotes.client_id
WHERE NOT EXISTS (SELECT 1 FROM leads WHERE leads.quote_id = quotes.id)
ON CONFLICT DO NOTHING;

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
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
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

CREATE OR REPLACE FUNCTION create_client_crm_lead(
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
  created_lead_id UUID;
  name_parts TEXT[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM leads
    WHERE LOWER(email) = LOWER(p_email)
      AND follow_up_status IN ('new', 'contacted', 'qualified')
  ) THEN
    RAISE EXCEPTION 'active lead exists' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO existing_contact
  FROM clients
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1
  FOR UPDATE;

  IF existing_contact.id IS NOT NULL THEN
    IF LOWER(BTRIM(existing_contact.business_name)) <> LOWER(BTRIM(p_business_name))
      OR LOWER(BTRIM(existing_contact.contact_name)) <> LOWER(BTRIM(p_contact_name))
      OR regexp_replace(COALESCE(existing_contact.phone, ''), '[^0-9]', '', 'g')
        <> regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g')
    THEN
      RAISE EXCEPTION 'contact details require reconciliation' USING ERRCODE = '23514';
    END IF;
    IF p_actor_role = 'agent' AND NOT EXISTS (
      SELECT 1 FROM leads
      WHERE contact_id = existing_contact.id
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
      LOWER(p_email), NULLIF(p_phone, ''), NULLIF(p_address, ''), p_city,
      resolved_organisation_id, TRUE, NOW()
    ) RETURNING id INTO resolved_contact_id;
  END IF;

  IF NULLIF(p_address, '') IS NOT NULL THEN
    SELECT id INTO resolved_site_id
    FROM sites
    WHERE client_id = resolved_contact_id
      AND LOWER(address) = LOWER(p_address)
      AND COALESCE(postcode, '') = p_postcode
    LIMIT 1;

    IF resolved_site_id IS NULL THEN
      INSERT INTO sites (
        client_id, organisation_id, site_name, address, suburb, postcode, city, is_active
      ) VALUES (
        resolved_contact_id, resolved_organisation_id, p_business_name, p_address, NULLIF(p_suburb, ''),
        p_postcode, p_city, TRUE
      ) RETURNING id INTO resolved_site_id;
    END IF;
  END IF;

  INSERT INTO leads (
    email, business_name, contact_name, phone, city, source, notes,
    follow_up_status, follow_up_notes, converted_to_client_id, organisation_id,
    contact_id, site_id, assigned_staff_id, address, suburb, postcode, state,
    source_provider, source_reference, source_explanation, source_obtained_at,
    contact_basis, assignment_method
  ) VALUES (
    LOWER(p_email), p_business_name, p_contact_name, NULLIF(p_phone, ''), p_city,
    p_source, NULLIF(p_notes, ''), 'new', NULLIF(p_notes, ''), resolved_contact_id,
    resolved_organisation_id, resolved_contact_id, resolved_site_id, p_assigned_staff_id, NULLIF(p_address, ''),
    NULLIF(p_suburb, ''), p_postcode, CASE WHEN p_city = 'sydney' THEN 'NSW' ELSE 'VIC' END,
    NULLIF(p_source_provider, ''), NULLIF(p_source_reference, ''), p_source_explanation,
    NOW(), p_contact_basis, p_assignment_method
  ) RETURNING id INTO created_lead_id;

  INSERT INTO admin_audit_log (entity_type, entity_ref, action, details)
  VALUES (
    'lead', created_lead_id::TEXT, 'crm.lead.created',
    jsonb_build_object(
      'assignedStaffId', p_assigned_staff_id,
      'assignmentMethod', p_assignment_method,
      'sourceType', p_source,
      'actorId', p_actor_id,
      'actorRole', p_actor_role
    )
  );
  RETURN created_lead_id;
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
  lead_ref UUID;
BEGIN
  UPDATE crm_communications
  SET status = 'sent', provider_message_id = p_provider_message_id, sent_at = p_sent_at
  WHERE id = p_communication_id AND status = 'sending'
  RETURNING lead_id INTO lead_ref;

  IF lead_ref IS NULL THEN
    RAISE EXCEPTION 'communication is not sendable';
  END IF;

  INSERT INTO admin_audit_log (entity_type, entity_ref, action, details)
  VALUES ('lead', lead_ref::TEXT, 'crm.email.sent', p_audit_details);
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
  resolved_id UUID;
  resolved_version INTEGER;
  resolved_purpose TEXT;
  resolved_visibility TEXT;
  resolved_status TEXT;
BEGIN
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
    IF p_actor_role = 'agent' AND (
      current_template.visibility <> 'personal'
      OR current_template.created_by_staff_id <> p_actor_id
    ) THEN
      RAISE EXCEPTION 'template access denied' USING ERRCODE = '42501';
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
  SELECT id, LOWER(email) INTO contact_ref, contact_email
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

REVOKE ALL ON FUNCTION create_client_crm_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, city_type, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finalize_client_crm_communication(UUID, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_client_crm_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unsubscribe_client_crm_contact(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_client_crm_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, city_type, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION finalize_client_crm_communication(UUID, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION save_client_crm_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION unsubscribe_client_crm_contact(UUID) TO service_role;

CREATE INDEX IF NOT EXISTS idx_crm_communications_lead_id ON crm_communications(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_communications_contact_id ON crm_communications(contact_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_communications_provider_id
  ON crm_communications(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_communications_unresolved
  ON crm_communications(contact_id) WHERE status IN ('sending', 'unknown');

ALTER TABLE crm_organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can insert leads" ON leads;
REVOKE INSERT ON TABLE leads FROM anon;

REVOKE ALL ON TABLE crm_organisations, crm_email_templates, crm_email_template_versions,
  crm_email_suppressions, crm_communications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE crm_organisations, crm_email_templates, crm_email_template_versions,
  crm_email_suppressions, crm_communications TO service_role;

DO $$
DECLARE crm_table_name TEXT;
BEGIN
  FOREACH crm_table_name IN ARRAY ARRAY[
    'crm_organisations',
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
