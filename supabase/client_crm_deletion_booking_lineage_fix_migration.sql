-- Allow an owner to delete bookings owned by a CRM client even when legacy data
-- left those bookings pointing at a site owned by another client. A booking owned
-- by another client that points into the target client's sites remains blocked.
-- Apply after client_crm_deletion_migration.sql.
-- Existing records are not changed by applying this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.client_crm_deletion_archive (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  actor jsonb NOT NULL,
  reason text NOT NULL,
  snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_crm_deletion_archive_organisation
  ON public.client_crm_deletion_archive(organisation_id, deleted_at DESC);
ALTER TABLE public.client_crm_deletion_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_crm_deletion_archive FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.client_crm_deletion_archive FROM service_role;
GRANT SELECT, INSERT ON public.client_crm_deletion_archive TO service_role;

CREATE OR REPLACE FUNCTION public.admin_preview_client_crm_deletion(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.crm_opportunities%ROWTYPE;
  organisation_row public.crm_organisations%ROWTYPE;
  opportunity_ids uuid[];
  contact_ids uuid[];
  site_ids uuid[];
  booking_ids uuid[];
  lead_ids uuid[];
  quote_ids uuid[];
  product_ids uuid[];
  sale_ids uuid[];
  quote_count integer;
  product_count integer;
  sale_count integer;
  booking_sale_count integer;
  rating_count integer;
  in_flight_communications integer;
  cross_org_opportunities integer;
  cross_org_sites integer;
  cross_org_bookings integer;
  incoming_site_links integer;
  incoming_opportunity_links integer;
  incoming_previous_opportunity_links integer;
  incoming_lead_links integer;
  incoming_communication_links integer;
  incoming_booking_links integer;
  result jsonb;
  blockers jsonb := '[]'::jsonb;
  confirmation_value text;
  display_name text;
BEGIN
  SELECT * INTO target FROM public.crm_opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM record not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO organisation_row FROM public.crm_organisations WHERE id = target.organisation_id;

  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO opportunity_ids
  FROM public.crm_opportunities WHERE organisation_id = target.organisation_id;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO contact_ids
  FROM public.clients WHERE organisation_id = target.organisation_id;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO site_ids
  FROM public.sites WHERE organisation_id = target.organisation_id;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO booking_ids
  FROM public.bookings
  WHERE client_id = ANY(contact_ids) OR opportunity_id = ANY(opportunity_ids);
  SELECT COALESCE(array_agg(lead_id ORDER BY lead_id), '{}'::uuid[]) INTO lead_ids
  FROM public.crm_opportunity_intakes WHERE opportunity_id = ANY(opportunity_ids);

  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO quote_ids FROM (
    SELECT DISTINCT q.id
    FROM public.quotes q
    LEFT JOIN public.crm_opportunity_quotes oq ON oq.quote_id = q.id
    WHERE q.client_id = ANY(contact_ids) OR oq.opportunity_id = ANY(opportunity_ids)
  ) linked_quotes;
  quote_count := cardinality(quote_ids);
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO product_ids
  FROM public.contract_products WHERE opportunity_id = ANY(opportunity_ids);
  product_count := cardinality(product_ids);
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO sale_ids
  FROM public.contract_product_sales WHERE opportunity_id = ANY(opportunity_ids) OR site_id = ANY(site_ids);
  sale_count := cardinality(sale_ids);
  SELECT count(*) INTO booking_sale_count FROM public.contract_sales WHERE booking_id = ANY(booking_ids);
  SELECT count(*) INTO rating_count FROM public.owner_operator_ratings WHERE booking_id = ANY(booking_ids) OR client_id = ANY(contact_ids);
  SELECT count(*) INTO in_flight_communications FROM public.crm_communications
  WHERE opportunity_id = ANY(opportunity_ids) AND status IN ('sending', 'unknown');
  SELECT count(*) INTO cross_org_opportunities FROM public.crm_opportunities
  WHERE id = ANY(opportunity_ids)
    AND (primary_contact_id <> ALL(contact_ids) OR (site_id IS NOT NULL AND site_id <> ALL(site_ids)));
  SELECT count(*) INTO cross_org_sites FROM public.sites
  WHERE id = ANY(site_ids) AND client_id IS NOT NULL AND client_id <> ALL(contact_ids);
  SELECT count(*) INTO cross_org_bookings FROM public.bookings
  WHERE id = ANY(booking_ids) AND (
    client_id <> ALL(contact_ids)
    OR (opportunity_id IS NOT NULL AND opportunity_id <> ALL(opportunity_ids))
  );
  SELECT count(*) INTO incoming_booking_links FROM public.bookings
  WHERE id <> ALL(booking_ids) AND site_id = ANY(site_ids);
  SELECT count(*) INTO incoming_site_links FROM public.sites
  WHERE client_id = ANY(contact_ids) AND id <> ALL(site_ids);
  SELECT count(*) INTO incoming_opportunity_links FROM public.crm_opportunities
  WHERE id <> ALL(opportunity_ids)
    AND (primary_contact_id = ANY(contact_ids) OR site_id = ANY(site_ids));
  SELECT count(*) INTO incoming_previous_opportunity_links FROM public.crm_opportunities
  WHERE id <> ALL(opportunity_ids) AND previous_opportunity_id = ANY(opportunity_ids);
  SELECT count(*) INTO incoming_lead_links FROM public.leads
  WHERE id <> ALL(lead_ids) AND (
    organisation_id = target.organisation_id
    OR contact_id = ANY(contact_ids)
    OR converted_to_client_id = ANY(contact_ids)
    OR site_id = ANY(site_ids)
  );
  SELECT count(*) INTO incoming_communication_links FROM public.crm_communications
  WHERE opportunity_id <> ALL(opportunity_ids) AND contact_id = ANY(contact_ids);

  IF quote_count > 0 THEN blockers := blockers || jsonb_build_array(format('%s linked quote(s) must be deleted first.', quote_count)); END IF;
  IF product_count > 0 THEN blockers := blockers || jsonb_build_array(format('%s contract product(s) must be retained.', product_count)); END IF;
  IF sale_count > 0 THEN blockers := blockers || jsonb_build_array(format('%s product sale(s) must be retained.', sale_count)); END IF;
  IF booking_sale_count > 0 THEN blockers := blockers || jsonb_build_array(format('%s legacy contract sale(s) retain booking history.', booking_sale_count)); END IF;
  IF rating_count > 0 THEN blockers := blockers || jsonb_build_array(format('%s client rating(s) retain booking history.', rating_count)); END IF;
  IF in_flight_communications > 0 THEN blockers := blockers || jsonb_build_array(format('%s CRM email(s) still have an unresolved delivery outcome.', in_flight_communications)); END IF;
  IF cross_org_opportunities > 0 OR cross_org_sites > 0 OR cross_org_bookings > 0 THEN
    blockers := blockers || jsonb_build_array('Cross-client CRM links must be reconciled before deletion.');
  END IF;
  IF incoming_site_links > 0 OR incoming_opportunity_links > 0 OR incoming_previous_opportunity_links > 0
    OR incoming_lead_links > 0 OR incoming_communication_links > 0 OR incoming_booking_links > 0 THEN
    blockers := blockers || jsonb_build_array('Records outside this client chain still reference its contacts, sites, opportunities, or organisation.');
  END IF;

  SELECT email INTO confirmation_value FROM public.clients WHERE id = target.primary_contact_id;
  display_name := COALESCE(NULLIF(btrim(organisation_row.business_name), ''), NULLIF(btrim(confirmation_value), ''), target.organisation_id::text);
  result := jsonb_build_object(
    'opportunityId', target.id,
    'organisationId', target.organisation_id,
    'confirmationValue', confirmation_value,
    'displayName', display_name,
    'blocked', jsonb_array_length(blockers) > 0,
    'blockers', blockers,
    'opportunities', cardinality(opportunity_ids),
    'contacts', cardinality(contact_ids),
    'sites', cardinality(site_ids),
    'leads', (SELECT count(*) FROM public.crm_opportunity_intakes WHERE opportunity_id = ANY(opportunity_ids)),
    'communications', (SELECT count(*) FROM public.crm_communications WHERE opportunity_id = ANY(opportunity_ids)),
    'sentCommunications', (SELECT count(*) FROM public.crm_communications WHERE opportunity_id = ANY(opportunity_ids) AND status = 'sent'),
    'bookings', cardinality(booking_ids),
    'activeBookings', (SELECT count(*) FROM public.bookings WHERE id = ANY(booking_ids) AND status <> 'cancelled'),
    'quotes', quote_count,
    'contractProducts', product_count,
    'contractSales', sale_count,
    'bookingSales', booking_sale_count,
    'ratings', rating_count,
    'crossOrganisationLinks', cross_org_opportunities + cross_org_sites + cross_org_bookings,
    'incomingReferences', incoming_site_links + incoming_opportunity_links + incoming_previous_opportunity_links + incoming_lead_links + incoming_communication_links + incoming_booking_links,
    /* Exact identities and mutable delivery states are bound into the preview token. */
    'dependencyFingerprint', md5(jsonb_build_object(
      'opportunityIds', opportunity_ids,
      'contactIds', contact_ids,
      'siteIds', site_ids,
      'bookingState', (SELECT COALESCE(jsonb_agg(jsonb_build_array(id, status, updated_at) ORDER BY id), '[]'::jsonb) FROM public.bookings WHERE id = ANY(booking_ids)),
      'leadIds', lead_ids,
      'communicationState', (SELECT COALESCE(jsonb_agg(jsonb_build_array(id, status, provider_message_id, sent_at) ORDER BY id), '[]'::jsonb) FROM public.crm_communications WHERE opportunity_id = ANY(opportunity_ids)),
      'quoteIds', quote_ids,
      'productIds', product_ids,
      'saleIds', sale_ids,
      'incomingSiteIds', (SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) FROM public.sites WHERE client_id = ANY(contact_ids) AND id <> ALL(site_ids)),
      'incomingOpportunityIds', (SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) FROM public.crm_opportunities WHERE id <> ALL(opportunity_ids) AND (primary_contact_id = ANY(contact_ids) OR site_id = ANY(site_ids) OR previous_opportunity_id = ANY(opportunity_ids))),
      'incomingLeadIds', (SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) FROM public.leads WHERE id <> ALL(lead_ids) AND (organisation_id = target.organisation_id OR contact_id = ANY(contact_ids) OR converted_to_client_id = ANY(contact_ids) OR site_id = ANY(site_ids))),
      'incomingCommunicationIds', (SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) FROM public.crm_communications WHERE opportunity_id <> ALL(opportunity_ids) AND contact_id = ANY(contact_ids)),
      'incomingBookingIds', (SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) FROM public.bookings WHERE id <> ALL(booking_ids) AND site_id = ANY(site_ids))
    )::text),
    'latestOpportunityUpdate', (SELECT max(updated_at) FROM public.crm_opportunities WHERE id = ANY(opportunity_ids)),
    'latestContactUpdate', (SELECT max(updated_at) FROM public.clients WHERE id = ANY(contact_ids)),
    'latestSiteUpdate', (SELECT max(updated_at) FROM public.sites WHERE id = ANY(site_ids)),
    'latestBookingUpdate', (SELECT max(updated_at) FROM public.bookings WHERE id = ANY(booking_ids))
  );
  RETURN result || jsonb_build_object('previewToken', md5(result::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_client_crm_record(
  p_opportunity_id uuid,
  p_reason text,
  p_actor jsonb,
  p_delete_bookings boolean,
  p_override boolean,
  p_preview_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.crm_opportunities%ROWTYPE;
  opportunity_ids uuid[];
  contact_ids uuid[];
  site_ids uuid[];
  booking_ids uuid[];
  lead_ids uuid[];
  preview jsonb;
  snapshot jsonb;
BEGIN
  IF COALESCE(p_actor->>'role', '') <> 'owner'
    OR COALESCE(btrim(p_actor->>'id'), '') = ''
    OR COALESCE(btrim(p_actor->>'name'), '') = '' THEN
    RAISE EXCEPTION 'Verified owner identity required.' USING ERRCODE = '42501';
  END IF;
  PERFORM id FROM public.admin_staff_accounts
  WHERE id::text = p_actor->>'id' AND username = p_actor->>'name' AND active = true AND role::text = 'owner'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active owner access required.' USING ERRCODE = '28000'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Invalid deletion reason.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target FROM public.crm_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM record not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM id FROM public.crm_organisations WHERE id = target.organisation_id FOR UPDATE;
  PERFORM id FROM public.crm_opportunities WHERE organisation_id = target.organisation_id ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO opportunity_ids
  FROM public.crm_opportunities WHERE organisation_id = target.organisation_id;
  PERFORM id FROM public.clients WHERE organisation_id = target.organisation_id ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO contact_ids
  FROM public.clients WHERE organisation_id = target.organisation_id;
  PERFORM id FROM public.sites WHERE organisation_id = target.organisation_id ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO site_ids
  FROM public.sites WHERE organisation_id = target.organisation_id;
  PERFORM id FROM public.bookings
  WHERE client_id = ANY(contact_ids) OR opportunity_id = ANY(opportunity_ids)
  ORDER BY id FOR UPDATE;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO booking_ids
  FROM public.bookings
  WHERE client_id = ANY(contact_ids) OR opportunity_id = ANY(opportunity_ids);
  SELECT COALESCE(array_agg(lead_id ORDER BY lead_id), '{}'::uuid[]) INTO lead_ids
  FROM public.crm_opportunity_intakes WHERE opportunity_id = ANY(opportunity_ids);
  PERFORM id FROM public.leads WHERE id = ANY(lead_ids) ORDER BY id FOR UPDATE;
  PERFORM lead_id FROM public.crm_opportunity_intakes WHERE opportunity_id = ANY(opportunity_ids) ORDER BY lead_id FOR UPDATE;
  PERFORM id FROM public.crm_opportunity_notes WHERE opportunity_id = ANY(opportunity_ids) ORDER BY id FOR UPDATE;
  -- Sender finalization updates existing rows, so lock them before checking delivery state.
  PERFORM id FROM public.crm_communications
  WHERE opportunity_id = ANY(opportunity_ids) OR contact_id = ANY(contact_ids)
  ORDER BY id FOR UPDATE;
  -- Lock incoming references that would otherwise be silently cleared by SET NULL constraints.
  PERFORM id FROM public.sites WHERE client_id = ANY(contact_ids) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.bookings WHERE site_id = ANY(site_ids) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.crm_opportunities
  WHERE primary_contact_id = ANY(contact_ids) OR site_id = ANY(site_ids) OR previous_opportunity_id = ANY(opportunity_ids)
  ORDER BY id FOR UPDATE;
  PERFORM id FROM public.leads
  WHERE organisation_id = target.organisation_id OR contact_id = ANY(contact_ids)
    OR converted_to_client_id = ANY(contact_ids) OR site_id = ANY(site_ids)
  ORDER BY id FOR UPDATE;

  -- Lock all business dependencies before regenerating the reviewed preview.
  PERFORM q.id FROM public.quotes q LEFT JOIN public.crm_opportunity_quotes oq ON oq.quote_id = q.id
  WHERE q.client_id = ANY(contact_ids) OR oq.opportunity_id = ANY(opportunity_ids) ORDER BY q.id FOR UPDATE OF q;
  PERFORM id FROM public.contract_products WHERE opportunity_id = ANY(opportunity_ids) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.contract_product_sales WHERE opportunity_id = ANY(opportunity_ids) OR site_id = ANY(site_ids) ORDER BY id FOR UPDATE;

  preview := public.admin_preview_client_crm_deletion(p_opportunity_id);
  IF p_preview_token IS DISTINCT FROM preview->>'previewToken' THEN
    RAISE EXCEPTION 'Deletion preview changed.' USING ERRCODE = '40001';
  END IF;
  IF (preview->>'blocked')::boolean THEN
    RAISE EXCEPTION 'Linked business or financial records must be resolved first.' USING ERRCODE = '23503';
  END IF;
  IF (preview->>'bookings')::integer > 0 AND NOT COALESCE(p_delete_bookings, false) THEN
    RAISE EXCEPTION 'Choose whether to delete linked bookings.' USING ERRCODE = '23503';
  END IF;
  IF NOT COALESCE(p_override, false) AND (
    (preview->>'bookings')::integer > 0 OR (preview->>'sentCommunications')::integer > 0
  ) THEN
    RAISE EXCEPTION 'Owner override is required.' USING ERRCODE = '42501';
  END IF;

  snapshot := jsonb_build_object(
    'preview', preview,
    'organisation', (SELECT to_jsonb(o) FROM public.crm_organisations o WHERE id = target.organisation_id),
    'opportunities', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM public.crm_opportunities o WHERE id = ANY(opportunity_ids)),
    'contacts', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM public.clients c WHERE id = ANY(contact_ids)),
    'sites', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.sites s WHERE id = ANY(site_ids)),
    'leads', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM public.leads l WHERE id = ANY(lead_ids)),
    'intakeLinks', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM public.crm_opportunity_intakes i WHERE opportunity_id = ANY(opportunity_ids)),
    'communications', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM public.crm_communications c WHERE opportunity_id = ANY(opportunity_ids)),
    'notes', (SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM public.crm_opportunity_notes n WHERE opportunity_id = ANY(opportunity_ids)),
    'bookings', (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM public.bookings b WHERE id = ANY(booking_ids))
  );
  INSERT INTO public.client_crm_deletion_archive(organisation_id, actor, reason, snapshot)
  VALUES(target.organisation_id, p_actor, btrim(p_reason), snapshot);

  IF cardinality(booking_ids) > 0 THEN DELETE FROM public.bookings WHERE id = ANY(booking_ids); END IF;
  DELETE FROM public.crm_opportunities WHERE id = ANY(opportunity_ids);
  IF cardinality(lead_ids) > 0 THEN DELETE FROM public.leads WHERE id = ANY(lead_ids); END IF;
  DELETE FROM public.sites WHERE id = ANY(site_ids);
  DELETE FROM public.clients WHERE id = ANY(contact_ids);
  DELETE FROM public.crm_organisations WHERE id = target.organisation_id;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES('crm_organisation', target.organisation_id::text, 'client_crm_deleted', jsonb_build_object(
    'actorId', p_actor->>'id', 'actorName', p_actor->>'name', 'actorRole', 'owner',
    'reason', btrim(p_reason), 'bookingsDeleted', cardinality(booking_ids),
    'opportunitiesDeleted', cardinality(opportunity_ids), 'contactsDeleted', cardinality(contact_ids),
    'sitesDeleted', cardinality(site_ids), 'leadsDeleted', cardinality(lead_ids)
  ));
  RETURN jsonb_build_object(
    'organisationId', target.organisation_id,
    'opportunitiesDeleted', cardinality(opportunity_ids),
    'contactsDeleted', cardinality(contact_ids),
    'sitesDeleted', cardinality(site_ids),
    'bookingsDeleted', cardinality(booking_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_preview_client_crm_deletion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_client_crm_record(uuid, text, jsonb, boolean, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preview_client_crm_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_client_crm_record(uuid, text, jsonb, boolean, boolean, text) TO service_role;

COMMIT;
