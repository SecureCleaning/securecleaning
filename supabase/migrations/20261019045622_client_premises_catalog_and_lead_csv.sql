-- Apply before the application release. Existing quote pricing enums are unchanged.
BEGIN;
CREATE TABLE public.crm_premises_types (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{0,59}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_premises_label_unique ON public.crm_premises_types(lower(label));
ALTER TABLE public.crm_premises_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_premises_types FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crm_premises_types TO service_role;
INSERT INTO public.crm_premises_types(code,label) VALUES
 ('office','Office'),('medical','Medical / healthcare'),('industrial','Industrial'),
 ('childcare','Childcare'),('retail','Retail premises'),('gym','Gym'),('warehouse','Warehouse'),
 ('function_centre','Function centre'),('sports_facility','Sporting facility'),
 ('education','Education facility'),('exhibition','Exhibition space'),('other','Other');
ALTER TABLE public.sites ALTER COLUMN premises_type TYPE text USING premises_type::text;
ALTER TABLE public.sites ADD COLUMN premises_type_other text NOT NULL DEFAULT ''
 CHECK (length(premises_type_other) <= 100);
-- Keep legacy values valid and preserve categories already selected on sites.
INSERT INTO public.crm_premises_types(code,label)
 SELECT DISTINCT premises_type, initcap(replace(premises_type,'_',' ')) FROM public.sites
 WHERE premises_type IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE public.sites ADD CONSTRAINT sites_premises_catalog_fk
 FOREIGN KEY(premises_type) REFERENCES public.crm_premises_types(code);
CREATE TABLE public.crm_lead_import_rows (
 actor_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id),
 import_key text NOT NULL,
 opportunity_id uuid NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,import_key)
);
ALTER TABLE public.crm_lead_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_import_rows FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crm_lead_import_rows TO service_role;

-- One transaction for the existing profile/create operation and its premises selection.
CREATE FUNCTION public.save_crm_record_with_premises(p_operation text, p_values jsonb,
 p_premises_type text, p_premises_other text, p_import_key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result_id uuid; site_id_value uuid; current_type text; actor_id_value uuid;
BEGIN
 actor_id_value := (p_values->>'p_actor_id')::uuid;
 IF NOT EXISTS (SELECT 1 FROM admin_staff_accounts WHERE id=actor_id_value AND active
   AND role=p_values->>'p_actor_role' AND role IN ('owner','manager','agent')) THEN
   RAISE EXCEPTION 'CRM access denied' USING ERRCODE='42501';
 END IF;
 IF p_import_key IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(actor_id_value::text || p_import_key,0));
   SELECT opportunity_id INTO result_id FROM crm_lead_import_rows
     WHERE actor_id=actor_id_value AND import_key=p_import_key;
   IF result_id IS NOT NULL THEN
     IF p_values->>'p_actor_role'='agent' AND NOT EXISTS (SELECT 1 FROM crm_opportunities WHERE id=result_id AND assigned_staff_id=actor_id_value) THEN
       RAISE EXCEPTION 'CRM access denied' USING ERRCODE='42501';
     END IF;
     RETURN result_id;
   END IF;
 END IF;
 IF p_operation='update' THEN
   result_id := update_client_crm_profile(
     (p_values->>'p_opportunity_id')::uuid,
     (p_values->>'p_expected_opportunity_updated_at')::timestamptz,
     (p_values->>'p_expected_organisation_updated_at')::timestamptz,
     (p_values->>'p_expected_contact_updated_at')::timestamptz,
     (p_values->>'p_expected_site_updated_at')::timestamptz,
     p_values->>'p_business_name',p_values->>'p_first_name',p_values->>'p_last_name',
     p_values->>'p_position_title',p_values->>'p_email',p_values->>'p_phone',
     p_values->>'p_site_name',p_values->>'p_address',p_values->>'p_suburb',p_values->>'p_postcode',
     actor_id_value,p_values->>'p_actor_role');
 ELSIF p_operation='create' THEN
   result_id := create_client_crm_opportunity(
     p_values->>'p_business_name',p_values->>'p_contact_name',p_values->>'p_email',p_values->>'p_phone',
     p_values->>'p_address',p_values->>'p_suburb',p_values->>'p_postcode',(p_values->>'p_city')::city_type,
     p_values->>'p_source',p_values->>'p_source_provider',p_values->>'p_source_reference',
     p_values->>'p_source_explanation',p_values->>'p_contact_basis',
     (p_values->>'p_assigned_staff_id')::uuid,p_values->>'p_assignment_method',p_values->>'p_notes',
     actor_id_value,p_values->>'p_actor_role');
 ELSE RAISE EXCEPTION 'Invalid operation'; END IF;
 SELECT site_id INTO site_id_value FROM crm_opportunities WHERE id=result_id;
 -- NULL means an older caller did not submit this field: leave it unchanged.
 IF p_premises_type IS NOT NULL THEN
   IF site_id_value IS NULL AND p_premises_type <> '' THEN
     INSERT INTO sites(client_id,organisation_id,site_name,address,city,is_active)
       SELECT o.primary_contact_id,o.organisation_id,nullif(p_values->>'p_business_name',''),'',c.city,true
       FROM crm_opportunities o JOIN clients c ON c.id=o.primary_contact_id WHERE o.id=result_id
       RETURNING id INTO site_id_value;
     result_id := crm_promote_provisional_opportunity(result_id,site_id_value);
   END IF;
   SELECT premises_type INTO current_type FROM sites WHERE id=site_id_value FOR UPDATE;
   IF p_premises_type <> '' AND NOT EXISTS (SELECT 1 FROM crm_premises_types
     WHERE code=p_premises_type AND (active OR code=current_type)) THEN
     RAISE EXCEPTION 'Select an available premises type' USING ERRCODE='23514';
   END IF;
   IF p_premises_type='other' AND length(btrim(coalesce(p_premises_other,''))) NOT BETWEEN 1 AND 100 THEN
     RAISE EXCEPTION 'Describe the other premises type' USING ERRCODE='23514';
   END IF;
   UPDATE sites SET premises_type=nullif(p_premises_type,''),
     premises_type_other=CASE WHEN p_premises_type='other' THEN btrim(p_premises_other) ELSE '' END,
     updated_at=now() WHERE id=site_id_value;
 END IF;
 IF p_import_key IS NOT NULL THEN
   INSERT INTO crm_lead_import_rows(actor_id,import_key,opportunity_id) VALUES(actor_id_value,p_import_key,result_id);
 END IF;
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.save_crm_record_with_premises(text,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_crm_record_with_premises(text,jsonb,text,text,text) TO service_role;
CREATE FUNCTION public.save_crm_premises_option(p_actor_id uuid, p_code text, p_label text,
 p_active boolean, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE saved crm_premises_types%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM admin_staff_accounts WHERE id=p_actor_id AND active AND role IN ('owner','manager')) THEN
   RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
 IF p_code='other' AND (p_active IS DISTINCT FROM true OR p_label IS DISTINCT FROM 'Other') THEN
   RAISE EXCEPTION 'Other must remain available' USING ERRCODE='23514';
 END IF;
 IF p_expected_updated_at IS NULL THEN
   INSERT INTO crm_premises_types(code,label,active) VALUES(p_code,btrim(p_label),p_active) RETURNING * INTO saved;
 ELSE
   UPDATE crm_premises_types SET label=btrim(p_label),active=p_active,updated_at=clock_timestamp()
    WHERE code=p_code AND updated_at=p_expected_updated_at RETURNING * INTO saved;
   IF saved.code IS NULL THEN RAISE EXCEPTION 'List changed; reload before editing' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
 VALUES('crm_premises_type',p_code,'crm.premises_type.saved',jsonb_build_object('actorId',p_actor_id,'label',p_label,'active',p_active));
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_crm_premises_option(uuid,text,text,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_crm_premises_option(uuid,text,text,boolean,timestamptz) TO service_role;
COMMIT;
