-- Private, service-only partner portal. No accounts/permissions enabled by migration.
CREATE TABLE public.partner_booking_companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
 active boolean NOT NULL DEFAULT false, cities text[] NOT NULL DEFAULT '{}', assignee_ids text[] NOT NULL DEFAULT '{}',
 expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (cities <@ ARRAY['melbourne','sydney','brisbane']::text[])
);
CREATE TABLE public.partner_booking_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.partner_booking_companies(id),
 username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{1,80}$'), display_name text NOT NULL,
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true, session_version uuid NOT NULL DEFAULT gen_random_uuid(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.partner_booking_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_booking_users(id) ON DELETE CASCADE,
 session_version uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX ON public.partner_booking_sessions(expires_at);
CREATE TABLE public.partner_booking_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.partner_booking_users(id),
 company_id uuid NOT NULL REFERENCES public.partner_booking_companies(id), input_hash text NOT NULL,
 booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
 email_status text NOT NULL DEFAULT 'queued' CHECK(email_status IN ('queued','sending','sent','review_required')),
 calendar_status text NOT NULL DEFAULT 'queued' CHECK(calendar_status IN ('queued','sending','sent','internal','review_required')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ADD COLUMN partner_request_id uuid REFERENCES public.partner_booking_requests(id);
CREATE UNIQUE INDEX ON public.bookings(partner_request_id) WHERE partner_request_id IS NOT NULL;
CREATE INDEX ON public.partner_booking_requests(company_id, created_at DESC);
CREATE INDEX ON public.partner_booking_users(company_id);
ALTER TABLE public.partner_booking_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_booking_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_booking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_booking_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_booking_companies, public.partner_booking_users, public.partner_booking_sessions, public.partner_booking_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_booking_companies, public.partner_booking_users, public.partner_booking_sessions, public.partner_booking_requests TO service_role;

CREATE FUNCTION public.partner_inspection_minutes(value jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT CASE
 WHEN value->>'inspectionDurationMinutes' ~ '^[0-9]{1,4}$' THEN greatest(1, least(1440, (value->>'inspectionDurationMinutes')::int))
 WHEN value->>'preferredInspectionStartTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 AND value->>'preferredInspectionEndTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 THEN greatest(10, (extract(epoch FROM ((value->>'preferredInspectionEndTime')::time - (value->>'preferredInspectionStartTime')::time))/60)::int)
 ELSE 10 END
$$;
REVOKE ALL ON FUNCTION public.partner_inspection_minutes(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_inspection_minutes(jsonb) TO service_role;

-- A common transaction lock covers all booking/sale-inspection writers. Existing
-- internal/manual overlaps remain unchanged; only clashes involving a partner
-- booking are rejected. No existing rows are updated by this migration.
CREATE FUNCTION public.guard_partner_booking_collision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a text; s timestamptz; e timestamptz; partner boolean := false; own_booking uuid; own_inspection uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(617204, 1);
 IF TG_TABLE_NAME = 'bookings' THEN
   IF NEW.status::text = 'cancelled' OR NEW.inspection_status = 'cancelled' OR NEW.inspection_scheduled_for IS NULL THEN RETURN NEW; END IF;
   a := COALESCE(NEW.inputs->>'preferredInspectionAssigneeId',''); s := NEW.inspection_scheduled_for; own_booking := NEW.id;
   e := s + make_interval(mins => partner_inspection_minutes(NEW.inputs));
   partner := NEW.partner_request_id IS NOT NULL;
 ELSE
   IF NEW.status NOT IN ('scheduled','completed') THEN RETURN NEW; END IF;
   SELECT availability_assignee_id INTO a FROM admin_staff_accounts WHERE id = NEW.scheduled_by_staff_id;
   s := NEW.starts_at; e := s + make_interval(mins => NEW.duration_minutes); own_inspection := NEW.id;
 END IF;
 IF EXISTS (
   SELECT 1 FROM bookings b WHERE b.id IS DISTINCT FROM own_booking
   AND (partner OR b.partner_request_id IS NOT NULL)
   AND b.status::text <> 'cancelled' AND b.inspection_status IS DISTINCT FROM 'cancelled'
   AND b.inspection_scheduled_for IS NOT NULL
   AND (COALESCE(b.inputs->>'preferredInspectionAssigneeId','') = COALESCE(a,'') OR COALESCE(a,'') = '' OR COALESCE(b.inputs->>'preferredInspectionAssigneeId','') = '')
   AND s < b.inspection_scheduled_for + make_interval(mins => partner_inspection_minutes(b.inputs)) + interval '50 minutes'
   AND e + interval '50 minutes' > b.inspection_scheduled_for
 ) THEN RAISE EXCEPTION 'Appointment time no longer available' USING ERRCODE = '23P01'; END IF;
 IF partner AND EXISTS (
   SELECT 1 FROM contract_sale_inspections i JOIN admin_staff_accounts u ON u.id = i.scheduled_by_staff_id
   WHERE i.id IS DISTINCT FROM own_inspection AND i.status IN ('scheduled','completed') AND u.availability_assignee_id = a
   AND s < i.starts_at + make_interval(mins => i.duration_minutes) + interval '50 minutes'
   AND e + interval '50 minutes' > i.starts_at
 ) THEN RAISE EXCEPTION 'Appointment time no longer available' USING ERRCODE = '23P01'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_partner_booking_collision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_partner_booking_collision() TO service_role;
CREATE TRIGGER partner_booking_conflict BEFORE INSERT OR UPDATE OF inputs, inspection_scheduled_for, inspection_status, status ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.guard_partner_booking_collision();
CREATE TRIGGER partner_inspection_conflict BEFORE INSERT OR UPDATE OF starts_at, duration_minutes, scheduled_by_staff_id, status ON public.contract_sale_inspections
 FOR EACH ROW EXECUTE FUNCTION public.guard_partner_booking_collision();

CREATE FUNCTION public.create_partner_booking(p_user_id uuid, p_session_version uuid, p_request_id uuid, p_input_hash text, p_inputs jsonb, p_start timestamptz, p_config text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE u partner_booking_users%ROWTYPE; c partner_booking_companies%ROWTYPE; r partner_booking_requests%ROWTYPE;
 config_text text; profile jsonb; contact_id uuid; v_booking_id uuid; booking_ref text; staff_id uuid; opportunity_id uuid; matches integer;
BEGIN
 PERFORM pg_advisory_xact_lock(617204, 1);
 SELECT * INTO u FROM partner_booking_users WHERE id = p_user_id FOR SHARE;
 SELECT * INTO c FROM partner_booking_companies WHERE id = u.company_id FOR SHARE;
 IF u.id IS NULL OR NOT u.active OR u.session_version <> p_session_version OR NOT c.active OR (c.expires_at IS NOT NULL AND c.expires_at <= now()) THEN
   RAISE EXCEPTION 'Partner access revoked' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO r FROM partner_booking_requests WHERE id = p_request_id;
 IF r.id IS NOT NULL THEN
   IF r.user_id <> u.id OR r.input_hash <> p_input_hash THEN RAISE EXCEPTION 'Booking request conflict' USING ERRCODE = '23514'; END IF;
   RETURN jsonb_build_object('created',false,'bookingRef',(SELECT b.booking_ref FROM bookings b WHERE b.id = r.booking_id));
 END IF;
 IF NOT (p_inputs->>'city' = ANY(c.cities)) OR NOT (p_inputs->>'preferredInspectionAssigneeId' = ANY(c.assignee_ids)) THEN RAISE EXCEPTION 'Calendar not permitted' USING ERRCODE = '42501'; END IF;
 SELECT content INTO config_text FROM availability_private_config WHERE key = 'availability.config' FOR SHARE;
 IF config_text IS DISTINCT FROM p_config THEN RAISE EXCEPTION 'Availability changed; refresh before booking' USING ERRCODE = '23P01'; END IF;
 SELECT value INTO profile FROM jsonb_array_elements(config_text::jsonb->'assignees') WHERE value->>'id' = p_inputs->>'preferredInspectionAssigneeId';
 IF profile IS NULL OR profile->>'active' <> 'true' OR profile->>'city' <> p_inputs->>'city' OR p_start <= now() OR p_start > now() + interval '92 days' THEN RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '23514'; END IF;
 -- Exact contact matching only. Never overwrite an existing person's details.
 SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO matches, contact_id FROM clients WHERE lower(trim(email)) = lower(trim(p_inputs->>'email'))
 AND lower(trim(business_name)) = lower(trim(p_inputs->>'businessName'))
 AND lower(trim(contact_name)) = lower(trim(p_inputs->>'contactName')) AND city::text = p_inputs->>'city'
 AND regexp_replace(regexp_replace(COALESCE(phone,''),'[^0-9]','','g'),'^61','0') = regexp_replace(regexp_replace(COALESCE(p_inputs->>'phone',''),'[^0-9]','','g'),'^61','0');
 IF matches > 1 OR (matches = 0 AND EXISTS(SELECT 1 FROM clients WHERE lower(trim(email)) = lower(trim(p_inputs->>'email')))) THEN
   RAISE EXCEPTION 'Contact reconciliation required' USING ERRCODE = '23514';
 END IF;
 IF contact_id IS NULL THEN
   INSERT INTO clients(business_name, contact_name, email, phone, address, city) VALUES
   (p_inputs->>'businessName', p_inputs->>'contactName', p_inputs->>'email', p_inputs->>'phone', p_inputs->>'address', (p_inputs->>'city')::city_type) RETURNING id INTO contact_id;
 END IF;
 INSERT INTO partner_booking_requests(id,user_id,company_id,input_hash) VALUES(p_request_id,u.id,c.id,p_input_hash);
 booking_ref := 'BK-' || to_char(now(),'YYYYMMDD') || '-' || upper(replace(p_request_id::text,'-',''));
 INSERT INTO bookings(booking_ref, client_id, inputs, status, inspection_status, inspection_scheduled_for, assigned_operator_id, partner_request_id)
 VALUES(booking_ref, contact_id, p_inputs, 'pending', 'scheduled', p_start, NULLIF(profile->>'ownerOperatorId','')::uuid, p_request_id) RETURNING id INTO v_booking_id;
 SELECT id INTO staff_id FROM admin_staff_accounts WHERE active AND role::text = 'agent' AND availability_assignee_id = profile->>'id' ORDER BY id LIMIT 1;
 opportunity_id := sync_client_crm_opportunity(NULL, v_booking_id, contact_id, NULL,
 p_inputs->>'address', p_inputs->>'suburb', p_inputs->>'postcode', (p_inputs->>'city')::city_type,
 'direct_booking', 'Appointment agreed by customer through telemarketing partner: ' || c.name, staff_id, CASE WHEN staff_id IS NULL THEN 'unassigned' ELSE 'booking_assignee' END);
 -- The existing sync routine preserves established client assignments.
 UPDATE partner_booking_requests SET booking_id = v_booking_id WHERE id = p_request_id;
 INSERT INTO admin_audit_log(entity_type, entity_ref, action, details) VALUES('booking', booking_ref, 'partner.appointment.created', jsonb_build_object('companyId',c.id,'companyName',c.name,'partnerUserId',u.id,'caller',u.display_name,'opportunityId',opportunity_id));
 RETURN jsonb_build_object('created',true,'bookingRef',booking_ref,'bookingId',v_booking_id);
END $$;
REVOKE ALL ON FUNCTION public.create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamptz,text) TO service_role;
