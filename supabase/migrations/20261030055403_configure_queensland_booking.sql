-- Queensland uses the existing region enum and state-scoped permissions.
-- Existing function signatures, grants, authorization and financial rules are preserved.

-- Based on 20261005215106_quote_request_sms_permission.sql
CREATE OR REPLACE FUNCTION public.sms_record_remote_quote_email(
  p_quote_ref text, p_mobile text, p_recipient text, p_provider_message_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE; s public.sms_settings%ROWTYPE; z text; permission boolean; added integer;
BEGIN
  IF nullif(trim(p_provider_message_id), '') IS NULL THEN RETURN false; END IF;
  SELECT * INTO q FROM public.quotes WHERE quote_ref = p_quote_ref FOR UPDATE;
  IF NOT FOUND OR public.sms_mobile(q.inputs->>'phone') IS DISTINCT FROM p_mobile
     OR lower(trim(q.inputs->>'email')) IS DISTINCT FROM lower(trim(p_recipient)) THEN RETURN false; END IF;
  SELECT allowed INTO permission FROM public.sms_quote_requests
    WHERE quote_ref = p_quote_ref AND mobile = p_mobile AND source = 'online_request';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.sms_remote_quote_emails(quote_ref, mobile, recipient, provider_message_id)
    VALUES(p_quote_ref, p_mobile, p_recipient, p_provider_message_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added = 0 THEN RETURN true; END IF;
  SELECT * INTO s FROM public.sms_settings WHERE id;
  IF NOT s.auto_enabled THEN RETURN true; END IF;
  z := CASE q.inputs->>'city' WHEN 'sydney' THEN 'Australia/Sydney' WHEN 'brisbane' THEN 'Australia/Brisbane' WHEN 'melbourne' THEN 'Australia/Melbourne' END;
  INSERT INTO public.sms_jobs(purpose, entity_type, entity_ref, quote_ref, document_version, automatic,
    mobile, template, fields, time_zone, due_at, status, reason, actor_id)
  VALUES('remote_quote_followup', 'quote', q.quote_ref, q.quote_ref, 0, true, p_mobile,
    'Secure Cleaning: We''ve emailed your quote. Please check your inbox and junk folder. Can''t find it? Reply here and we''ll help. Reply STOP to opt out.',
    jsonb_build_object('quote_reference', q.quote_ref), coalesce(z, 'Australia/Sydney'),
    public.sms_next_time(now() + make_interval(mins => s.delay_minutes), coalesce(z, 'Australia/Sydney')),
    CASE WHEN NOT permission OR z IS NULL THEN 'skipped' ELSE 'queued' END,
    CASE WHEN NOT permission THEN 'quote_email_only' WHEN z IS NULL THEN 'unknown_timezone' END,
    'online_customer') ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- Based on 20261005215106_quote_request_sms_permission.sql
CREATE OR REPLACE FUNCTION public.sms_queue_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q public.quotes%ROWTYPE; s public.sms_settings%ROWTYPE; z text; m text;
BEGIN
 IF NEW.status NOT IN ('provider_accepted','finalized') OR nullif(trim(NEW.provider_message_id),'') IS NULL OR
    (TG_OP='UPDATE' AND OLD.provider_message_id IS NOT NULL AND OLD.status IN ('provider_accepted','finalized')) THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.sms_settings WHERE id;
 IF NOT s.auto_enabled THEN RETURN NEW; END IF;
 SELECT * INTO q FROM public.quotes WHERE quote_ref=NEW.quote_ref;
 IF NOT FOUND OR q.final_quote_document_version IS DISTINCT FROM NEW.document_version THEN RETURN NEW; END IF;
 z:=CASE q.final_quote_document->'inputs'->>'city' WHEN 'sydney' THEN 'Australia/Sydney' WHEN 'brisbane' THEN 'Australia/Brisbane' WHEN 'melbourne' THEN 'Australia/Melbourne' END;
 m:=public.sms_mobile(q.final_quote_document->'inputs'->>'phone');
 INSERT INTO public.sms_jobs(purpose,entity_type,entity_ref,quote_ref,document_version,email_attempt_id,automatic,mobile,template,fields,time_zone,due_at,status,reason,actor_id)
 VALUES('quote_followup','quote',q.quote_ref,q.quote_ref,NEW.document_version,NEW.id,true,coalesce(m,''),CASE WHEN EXISTS (SELECT 1 FROM public.sms_quote_requests qr WHERE qr.quote_ref=q.quote_ref AND qr.mobile=m AND qr.allowed) THEN 'Secure Cleaning: We''ve emailed your quote. Please check your inbox and junk folder. Can''t find it? Reply here and we''ll help. Reply STOP to opt out.' ELSE s.template END,
 jsonb_build_object('client_name',coalesce(q.final_quote_document->'inputs'->>'contactName',''),'first_name',split_part(coalesce(q.final_quote_document->'inputs'->>'contactName',''),' ',1),'quote_reference',q.quote_ref),coalesce(z,'Australia/Sydney'),
 public.sms_next_time(coalesce(NEW.provider_accepted_at,now())+make_interval(mins=>s.delay_minutes),coalesce(z,'Australia/Sydney')),
 CASE WHEN m IS NULL OR z IS NULL THEN 'skipped' ELSE 'queued' END,
 CASE WHEN m IS NULL THEN 'invalid_mobile' WHEN z IS NULL THEN 'unknown_timezone' END,coalesce(NEW.actor->>'id','system')) ON CONFLICT DO NOTHING;
 IF m IS NULL OR z IS NULL THEN
  INSERT INTO public.sms_alerts(dedupe_key,code,job_id) SELECT 'eligibility:'||id::text,reason,id FROM public.sms_jobs WHERE quote_ref=q.quote_ref AND automatic AND document_version=NEW.document_version ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

-- Based on 20261020043531_seven_day_cleaning_frequency.sql
CREATE OR REPLACE FUNCTION public.close_crm_opportunity_won_and_create_product(p_opportunity_id uuid, p_quote_id uuid, p_expected_updated_at timestamp with time zone, p_acceptance_date date, p_acceptance_method text, p_acceptance_note text, p_cleaner_scope_snapshot jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  opportunity_row crm_opportunities%ROWTYPE;
  quote_row quotes%ROWTYPE;
  existing_product_id UUID;
  product_id UUID := gen_random_uuid();
  source_inputs JSONB;
  source_kind TEXT;
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
  source_start_date DATE;
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
  IF quote_row.id IS NULL THEN
    RAISE EXCEPTION 'saved quote not found' USING ERRCODE = '23514';
  END IF;
  IF p_cleaner_scope_snapshot IS NULL OR jsonb_typeof(p_cleaner_scope_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'cleaner scope snapshot is required' USING ERRCODE = '23514';
  END IF;

  IF quote_row.final_quote_document IS NOT NULL THEN
    source_kind := 'final';
    source_inputs := quote_row.final_quote_document->'inputs';
    source_version := COALESCE(quote_row.final_quote_document_version, 1);
    source_rate_cents := ROUND(COALESCE(NULLIF(quote_row.final_quote_document #>> '{displayPrice,low}', '')::NUMERIC, 0) * 100);
  ELSIF jsonb_typeof(quote_row.firm_quote_workflow) = 'object'
        AND jsonb_typeof(quote_row.firm_quote_workflow->'revisedInputs') = 'object' THEN
    source_kind := 'saved_workflow';
    source_inputs := quote_row.firm_quote_workflow->'revisedInputs';
    source_version := 1;
    source_rate_cents := CASE
      WHEN COALESCE(p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}', '') ~ '^[0-9]+$'
        THEN (p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}')::INTEGER
      ELSE 0
    END;
  ELSE
    source_kind := 'original';
    source_inputs := quote_row.inputs;
    source_version := 1;
    source_rate_cents := CASE
      WHEN COALESCE(p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}', '') ~ '^[0-9]+$'
        THEN (p_cleaner_scope_snapshot #>> '{sourcePricing,clientPricePerVisitExGstCents}')::INTEGER
      ELSE 0
    END;
  END IF;

  IF source_inputs IS NULL OR jsonb_typeof(source_inputs) <> 'object' THEN
    RAISE EXCEPTION 'saved quote inputs are incomplete' USING ERRCODE = '23514';
  END IF;
  source_city := LOWER(BTRIM(COALESCE(source_inputs->>'city', '')));
  source_state := CASE source_city WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' WHEN 'brisbane' THEN 'QLD' ELSE NULL END;
  IF p_actor_role = 'agent' AND source_state IS DISTINCT FROM p_actor_state THEN
    RAISE EXCEPTION 'product state is outside agent region' USING ERRCODE = '42501';
  END IF;
  source_suburb := BTRIM(COALESCE(source_inputs->>'suburb', ''));
  source_premises := BTRIM(COALESCE(source_inputs->>'premisesType', 'commercial'));
  source_frequency := BTRIM(COALESCE(source_inputs->>'frequency', ''));
  source_time := BTRIM(COALESCE(source_inputs->>'timePreference', ''));
  source_annual_visits := CASE source_frequency
    WHEN 'daily' THEN 260 WHEN '7x_week' THEN 364 WHEN '3x_week' THEN 156 WHEN '2x_week' THEN 104
    WHEN 'weekly' THEN 52 WHEN 'fortnightly' THEN 26 WHEN 'monthly' THEN 12
    WHEN 'once_off' THEN 1 ELSE 0 END;
  IF source_state IS NULL OR source_suburb = '' OR source_frequency = '' OR source_time = ''
     OR source_rate_cents <= 0 OR source_annual_visits <= 0 THEN
    RAISE EXCEPTION 'saved quote cannot seed a complete product' USING ERRCODE = '23514';
  END IF;
  IF UPPER(BTRIM(COALESCE(p_cleaner_scope_snapshot->>'state', ''))) IS DISTINCT FROM source_state
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'suburb', '')) IS DISTINCT FROM source_suburb
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'premisesType', '')) IS DISTINCT FROM source_premises
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'frequency', '')) IS DISTINCT FROM source_frequency
     OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'timePreference', '')) IS DISTINCT FROM source_time THEN
    RAISE EXCEPTION 'cleaner scope does not match saved quote' USING ERRCODE = '23514';
  END IF;

  source_start_date := CASE
    WHEN COALESCE(source_inputs->>'preferredStartDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN (source_inputs->>'preferredStartDate')::DATE
    ELSE NULL
  END;
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
    source_premises, source_start_date, source_frequency, source_annual_visits, source_time,
    source_rate_cents, source_annual_value, ROUND(source_annual_value * 0.5),
    p_cleaner_scope_snapshot - 'sourcePricing', p_actor_id
  );

  UPDATE crm_opportunities SET
    stage = 'won', closed_at = NOW(), winning_quote_id = p_quote_id,
    acceptance_date = p_acceptance_date, acceptance_method = p_acceptance_method,
    acceptance_note = BTRIM(p_acceptance_note), updated_at = NOW()
  WHERE id = p_opportunity_id;

  INSERT INTO admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('contract_product', product_id::TEXT, 'contract_product.created_from_won_opportunity',
    jsonb_build_object(
      'opportunityId', p_opportunity_id,
      'quoteId', p_quote_id,
      'quoteSnapshotKind', source_kind,
      'actorId', p_actor_id
    ));
  RETURN product_id;
END;
$function$
;

-- Based on 20261020071815_state_agent_product_access.sql
CREATE OR REPLACE FUNCTION public.agent_can_access_product_state(p_actor_id uuid, p_state text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_staff_accounts staff
    JOIN availability_private_config config ON config.key = 'availability.config'
    CROSS JOIN LATERAL jsonb_array_elements(config.content::jsonb->'assignees') agent
    WHERE staff.id = p_actor_id AND staff.active = TRUE AND staff.role::text = 'agent'
      AND staff.availability_assignee_id = agent->>'id'
      AND COALESCE((agent->>'active')::boolean, false)
      AND p_state IN ('NSW', 'VIC', 'QLD')
      AND CASE agent->>'city' WHEN 'sydney' THEN 'NSW' WHEN 'brisbane' THEN 'QLD' WHEN 'melbourne' THEN 'VIC' END = p_state
  );
$$;

-- Based on 20261020071815_state_agent_product_access.sql
CREATE OR REPLACE FUNCTION public.refresh_contract_product_cleaner_scope(p_product_id uuid, p_expected_updated_at timestamp with time zone, p_source_quote_document_version integer, p_cleaner_scope_snapshot jsonb, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
product_row contract_products%ROWTYPE;
source_inputs JSONB;
source_state TEXT;
refreshed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
IF NOT EXISTS (SELECT 1 FROM admin_staff_accounts WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role AND role::TEXT IN ('owner', 'manager', 'agent')) THEN
RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501';
END IF;
SELECT * INTO product_row FROM contract_products WHERE id = p_product_id FOR UPDATE;
IF product_row.id IS NULL THEN
RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
END IF;
IF product_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
RAISE EXCEPTION 'product changed while editing' USING ERRCODE = '40001';
END IF;
IF product_row.status NOT IN ('draft', 'withdrawn') THEN
RAISE EXCEPTION 'product scope cannot be refreshed from this status' USING ERRCODE = '23514';
END IF;
IF p_actor_role = 'agent' AND (NOT public.agent_can_access_product_state(p_actor_id, product_row.state) OR product_row.state IS DISTINCT FROM p_actor_state) THEN
RAISE EXCEPTION 'product outside agent access' USING ERRCODE = '42501';
END IF;
IF p_cleaner_scope_snapshot IS NULL OR jsonb_typeof(p_cleaner_scope_snapshot) <> 'object' OR jsonb_typeof(p_cleaner_scope_snapshot->'rooms') <> 'array' OR jsonb_array_length(p_cleaner_scope_snapshot->'rooms') = 0 THEN
RAISE EXCEPTION 'cleaner scope snapshot is incomplete' USING ERRCODE = '23514';
END IF;
SELECT COALESCE(final_quote_document->'inputs', firm_quote_workflow->'revisedInputs', inputs) INTO source_inputs FROM quotes WHERE id = product_row.source_quote_id FOR SHARE;
IF source_inputs IS NULL OR jsonb_typeof(source_inputs) <> 'object' THEN
RAISE EXCEPTION 'winning quote snapshot unavailable' USING ERRCODE = '23514';
END IF;
source_state := CASE LOWER(BTRIM(COALESCE(source_inputs->>'city', ''))) WHEN 'melbourne' THEN 'VIC' WHEN 'sydney' THEN 'NSW' WHEN 'brisbane' THEN 'QLD' ELSE NULL END;
IF UPPER(BTRIM(COALESCE(p_cleaner_scope_snapshot->>'state', ''))) IS DISTINCT FROM source_state
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'suburb', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'suburb', ''))
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'premisesType', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'premisesType', ''))
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'frequency', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'frequency', ''))
OR BTRIM(COALESCE(p_cleaner_scope_snapshot->>'timePreference', '')) IS DISTINCT FROM BTRIM(COALESCE(source_inputs->>'timePreference', '')) THEN
RAISE EXCEPTION 'cleaner scope does not match winning quote' USING ERRCODE = '23514';
END IF;
IF COALESCE(source_inputs->>'timePreference', '') NOT IN ('business_hours', 'after_hours', 'weekend') THEN
RAISE EXCEPTION 'winning quote cleaning timing invalid' USING ERRCODE = '23514';
END IF;
UPDATE contract_products SET cleaner_scope_snapshot = p_cleaner_scope_snapshot, time_preference = source_inputs->>'timePreference', source_quote_document_version = GREATEST(1, p_source_quote_document_version), updated_at = refreshed_at WHERE id = p_product_id RETURNING updated_at INTO refreshed_at;
INSERT INTO admin_audit_log(entity_type, entity_ref, action, details) VALUES ('contract_product', p_product_id::TEXT, 'contract_product.scope_refreshed_from_winning_quote', jsonb_build_object('quoteId', product_row.source_quote_id, 'actorId', p_actor_id, 'sourceQuoteDocumentVersion', GREATEST(1, p_source_quote_document_version)));
RETURN refreshed_at;
END;
$function$
;

-- Based on 20261029003131_crm_automatic_lead_stages.sql
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
      'new',
      COALESCE(resolved_cycle, 0) + 1, previous_opportunity_id,
      CASE WHEN previous_opportunity_id IS NULL THEN 'new_enquiry' ELSE 'requote' END,
      p_assignment_method
    ) RETURNING id INTO resolved_opportunity_id;
  ELSE
    UPDATE crm_opportunities SET
      assigned_staff_id = COALESCE(assigned_staff_id, p_assigned_staff_id),
      assignment_method = CASE WHEN assigned_staff_id IS NULL AND p_assigned_staff_id IS NOT NULL THEN p_assignment_method ELSE assignment_method END,
      stage = stage
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
      CASE WHEN p_city = 'sydney' THEN 'NSW' WHEN p_city = 'brisbane' THEN 'QLD' ELSE 'VIC' END,
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

-- Append only missing Queensland zones. Never replace current agents, schedules,
-- block-outs, region settings, bookings or client assignments.
DO $qld$
DECLARE config jsonb; zone jsonb;
BEGIN
 SELECT content::jsonb INTO config FROM public.availability_private_config
 WHERE key = 'availability.config' FOR UPDATE;
 IF config IS NULL THEN RAISE EXCEPTION 'availability.config is missing'; END IF;
 FOR zone IN SELECT value FROM jsonb_array_elements($zones$[{"id": "qld_brisbane", "name": "Greater Brisbane", "city": "brisbane", "matchTerms": [], "postcodes": ["4000", "4005", "4006", "4007", "4008", "4009", "4010", "4011", "4012", "4013", "4014", "4017", "4018", "4019", "4020", "4021", "4022", "4025", "4030", "4031", "4032", "4034", "4035", "4036", "4037", "4051", "4053", "4054", "4055", "4059", "4060", "4061", "4064", "4065", "4066", "4067", "4068", "4069", "4070", "4073", "4074", "4075", "4076", "4077", "4078", "4101", "4102", "4103", "4104", "4105", "4106", "4107", "4108", "4109", "4110", "4111", "4112", "4113", "4114", "4115", "4116", "4117", "4118", "4119", "4120", "4121", "4122", "4123", "4124", "4125", "4127", "4128", "4129", "4130", "4131", "4132", "4133", "4151", "4152", "4153", "4154", "4155", "4156", "4157", "4158", "4159", "4160", "4161", "4163", "4164", "4165", "4169", "4170", "4171", "4172", "4173", "4174", "4178", "4179", "4183", "4184", "4205", "4207", "4275", "4280", "4285", "4287", "4300", "4301", "4303", "4304", "4305", "4306", "4307", "4309", "4310", "4311", "4312", "4313", "4314", "4340", "4341", "4342", "4343", "4346", "4500", "4501", "4502", "4503", "4504", "4505", "4506", "4507", "4508", "4509", "4510", "4511", "4512", "4513", "4514", "4515", "4516", "4520", "4521"], "anchors": []}, {"id": "qld_gold_coast", "name": "Gold Coast", "city": "brisbane", "matchTerms": [], "postcodes": ["4207", "4208", "4209", "4210", "4211", "4212", "4213", "4214", "4215", "4216", "4217", "4218", "4220", "4221", "4223", "4224", "4225", "4226", "4227", "4228"], "anchors": []}, {"id": "qld_sunshine_coast", "name": "Sunshine Coast", "city": "brisbane", "matchTerms": [], "postcodes": ["4507", "4517", "4518", "4519", "4550", "4551", "4552", "4553", "4554", "4555", "4556", "4557", "4558", "4559", "4560", "4561", "4562", "4563", "4564", "4565", "4566", "4567", "4568", "4569", "4571", "4572", "4573", "4574", "4575"], "anchors": []}]$zones$::jsonb) LOOP
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(config->'zones','[]'::jsonb)) existing WHERE existing->>'id'=zone->>'id') THEN
   config := jsonb_set(config, '{zones}', COALESCE(config->'zones','[]'::jsonb) || jsonb_build_array(zone));
  END IF;
 END LOOP;
 UPDATE public.availability_private_config SET content=config WHERE key='availability.config';
END;
$qld$;
