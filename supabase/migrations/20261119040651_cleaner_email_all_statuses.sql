-- Email eligibility is independent of cleaner workflow status. No sends, enrolment or recipient resets.
BEGIN;

CREATE OR REPLACE FUNCTION public.claim_cleaner_broadcast_recipient(p_campaign_id uuid, p_recipient_id uuid, p_runner_token uuid, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF campaign_row.id IS NULL OR campaign_row.created_by_staff_id IS DISTINCT FROM p_actor_id
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
$function$
;

REVOKE ALL ON FUNCTION public.claim_cleaner_broadcast_recipient(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cleaner_broadcast_recipient(uuid,uuid,uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_cleaner_broadcast_campaign_v3(p_idempotency_key uuid, p_state text, p_subject text, p_intro text, p_product_ids uuid[], p_product_snapshots jsonb, p_recipient_mode text, p_target_cleaner_id uuid, p_recipient_cleaner_ids uuid[], p_sender_staff_id uuid, p_actor_id uuid, p_actor_role text, p_actor_state text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 claimed_campaign_id UUID;
 eligible_count INTEGER;
 expected_products INTEGER;
 expected_recipients INTEGER;
 sender_name TEXT;
 sender_email TEXT;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM admin_staff_accounts WHERE id = p_actor_id AND active = TRUE AND role::TEXT = p_actor_role AND role::TEXT IN ('owner', 'manager', 'agent')) THEN RAISE EXCEPTION 'actor not authorized' USING ERRCODE = '42501'; END IF;
 IF p_state NOT IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA') OR (p_actor_role = 'agent' AND p_state IS DISTINCT FROM p_actor_state) THEN RAISE EXCEPTION 'broadcast state is outside agent region' USING ERRCODE = '42501'; END IF;
 SELECT display_name, email INTO sender_name, sender_email FROM admin_staff_accounts WHERE id = p_sender_staff_id AND active = TRUE AND role::TEXT IN ('owner', 'manager', 'agent');
 IF sender_name IS NULL OR sender_email IS NULL OR (p_actor_role <> 'owner' AND p_sender_staff_id IS DISTINCT FROM p_actor_id) THEN RAISE EXCEPTION 'broadcast sender is not authorized' USING ERRCODE = '42501'; END IF;
 IF p_recipient_mode NOT IN ('state', 'single', 'multiple') OR (p_recipient_mode = 'single' AND p_target_cleaner_id IS NULL) OR (p_recipient_mode IN ('state', 'multiple') AND p_target_cleaner_id IS NOT NULL) THEN RAISE EXCEPTION 'broadcast recipient selection is invalid' USING ERRCODE = '23514'; END IF;
 IF NULLIF(BTRIM(p_subject), '') IS NULL OR NULLIF(BTRIM(p_intro), '') IS NULL THEN RAISE EXCEPTION 'broadcast content is required' USING ERRCODE = '23514'; END IF;
 expected_recipients := COALESCE(array_length(p_recipient_cleaner_ids, 1), 0);
 IF expected_recipients = 0 OR (SELECT COUNT(DISTINCT id) FROM unnest(p_recipient_cleaner_ids) AS selected(id)) <> expected_recipients OR (p_recipient_mode = 'single' AND (expected_recipients <> 1 OR p_target_cleaner_id <> p_recipient_cleaner_ids[1])) OR (p_recipient_mode = 'multiple' AND expected_recipients < 2) THEN RAISE EXCEPTION 'broadcast recipient selection is outside the safe limit' USING ERRCODE = '23514'; END IF;
 SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns WHERE idempotency_key = p_idempotency_key FOR UPDATE;
 IF claimed_campaign_id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM cleaner_broadcast_campaigns WHERE id = claimed_campaign_id AND created_by_staff_id = p_actor_id AND sender_staff_id = p_sender_staff_id AND state = p_state AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro) AND recipient_mode = p_recipient_mode AND target_cleaner_id IS NOT DISTINCT FROM p_target_cleaner_id)
   OR (SELECT COUNT(*) FROM cleaner_broadcast_campaign_products WHERE campaign_id = claimed_campaign_id) <> COALESCE(array_length(p_product_ids, 1), 0)
   OR EXISTS (SELECT 1 FROM cleaner_broadcast_campaign_products WHERE campaign_id = claimed_campaign_id AND product_id <> ALL(p_product_ids))
   OR (SELECT COUNT(*) FROM cleaner_broadcast_recipients WHERE campaign_id = claimed_campaign_id) <> expected_recipients
   OR EXISTS (SELECT 1 FROM cleaner_broadcast_recipients WHERE campaign_id = claimed_campaign_id AND cleaner_id <> ALL(p_recipient_cleaner_ids)) THEN RAISE EXCEPTION 'idempotency key belongs to another broadcast' USING ERRCODE = '23505'; END IF;
  RETURN claimed_campaign_id;
 END IF;
 expected_products := COALESCE(array_length(p_product_ids, 1), 0);
 IF expected_products = 0 OR jsonb_typeof(p_product_snapshots) <> 'array' OR jsonb_array_length(p_product_snapshots) <> expected_products OR (SELECT COUNT(DISTINCT id) FROM contract_products WHERE id = ANY(p_product_ids) AND status = 'available' AND state = p_state AND (p_actor_role <> 'agent' OR assigned_staff_id = p_actor_id)) <> expected_products THEN RAISE EXCEPTION 'one or more products are unavailable or outside the actor region' USING ERRCODE = '23514'; END IF;
 SELECT COUNT(*) INTO eligible_count FROM (
  SELECT DISTINCT ON (LOWER(BTRIM(c.email))) c.id FROM cleaners c WHERE c.id = ANY(p_recipient_cleaner_ids) AND c.state = p_state AND c.broadcast_unsubscribe_token IS NOT NULL AND BTRIM(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM crm_email_suppressions s WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE)
  ORDER BY LOWER(BTRIM(c.email)), c.created_at, c.id
 ) eligible;
 IF eligible_count <> expected_recipients THEN RAISE EXCEPTION 'one or more selected cleaners are not eligible' USING ERRCODE = '23514'; END IF;
 INSERT INTO cleaner_broadcast_campaigns(idempotency_key, state, subject_snapshot, intro_snapshot, sender_staff_id, created_by_staff_id, sender_name_snapshot, sender_email_snapshot, recipient_count, recipient_mode, target_cleaner_id)
 VALUES (p_idempotency_key, p_state, BTRIM(p_subject), BTRIM(p_intro), p_sender_staff_id, p_actor_id, BTRIM(sender_name), LOWER(BTRIM(sender_email)), eligible_count, p_recipient_mode, p_target_cleaner_id)
 ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO claimed_campaign_id;
 IF claimed_campaign_id IS NULL THEN
  SELECT id INTO claimed_campaign_id FROM cleaner_broadcast_campaigns WHERE idempotency_key = p_idempotency_key AND created_by_staff_id = p_actor_id AND sender_staff_id = p_sender_staff_id AND state = p_state AND subject_snapshot = BTRIM(p_subject) AND intro_snapshot = BTRIM(p_intro) AND recipient_mode = p_recipient_mode AND target_cleaner_id IS NOT DISTINCT FROM p_target_cleaner_id;
  IF claimed_campaign_id IS NULL THEN RAISE EXCEPTION 'idempotency key belongs to another broadcast' USING ERRCODE = '23505'; END IF;
  RETURN claimed_campaign_id;
 END IF;
 INSERT INTO cleaner_broadcast_campaign_products(campaign_id, product_id, product_snapshot)
 SELECT claimed_campaign_id, product.id, snapshot.value FROM jsonb_array_elements(p_product_snapshots) snapshot(value) JOIN contract_products product ON product.id = (snapshot.value->>'id')::UUID WHERE product.id = ANY(p_product_ids);
 INSERT INTO cleaner_broadcast_recipients(campaign_id, cleaner_id, to_email, cleaner_name_snapshot)
 SELECT claimed_campaign_id, eligible.id, LOWER(BTRIM(eligible.email)), COALESCE(NULLIF(BTRIM(eligible.contact_name), ''), 'Cleaner') FROM (
  SELECT DISTINCT ON (LOWER(BTRIM(c.email))) c.id, c.email, c.contact_name FROM cleaners c WHERE c.id = ANY(p_recipient_cleaner_ids) AND c.state = p_state AND c.broadcast_unsubscribe_token IS NOT NULL AND BTRIM(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  AND NOT EXISTS (SELECT 1 FROM cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM crm_email_suppressions s WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all = TRUE)
  ORDER BY LOWER(BTRIM(c.email)), c.created_at, c.id
 ) eligible;
 RETURN claimed_campaign_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.create_cleaner_broadcast_campaign_v3(uuid,text,text,text,uuid[],jsonb,text,uuid,uuid[],uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_cleaner_broadcast_campaign_v3(uuid,text,text,text,uuid[],jsonb,text,uuid,uuid[],uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_cleaner_email_batch(
  p_id UUID, p_actor_id UUID, p_input_hash TEXT, p_messages JSONB,
  p_template_id UUID, p_template_name TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  actor_name TEXT;
  message JSONB;
  existing public.cleaner_email_batches%ROWTYPE;
BEGIN
  SELECT username INTO actor_name FROM public.admin_staff_accounts
    WHERE id = p_actor_id AND active AND role IN ('owner','manager','staff');
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  -- Serialize reservations per sender, including retries and the hourly bound.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::TEXT, 0));
  SELECT * INTO existing FROM public.cleaner_email_batches WHERE id = p_id;
  IF FOUND THEN
    IF existing.actor_id <> p_actor_id OR existing.input_hash <> p_input_hash THEN
      RAISE EXCEPTION 'Request conflict';
    END IF;
    RETURN FALSE;
  END IF;
  IF jsonb_typeof(p_messages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_messages) NOT BETWEEN 1 AND 50
    OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid batch';
  END IF;
  IF (SELECT COUNT(*) FROM public.cleaner_email_batches WHERE actor_id = p_actor_id AND created_at > NOW() - INTERVAL '1 hour') >= 12 THEN
    RAISE EXCEPTION 'Hourly send limit reached';
  END IF;
  INSERT INTO public.cleaner_email_batches(id,actor_id,input_hash) VALUES(p_id,p_actor_id,p_input_hash);
  FOR message IN SELECT value FROM jsonb_array_elements(p_messages) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = (message->>'cleaner_id')::UUID
      AND LOWER(BTRIM(c.email)) = message->>'email'
      AND c.broadcast_unsubscribe_token IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_email_suppressions s WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all)) THEN
      RAISE EXCEPTION 'Recipient ineligible';
    END IF;
    INSERT INTO public.cleaner_emails(cleaner_id,template_id,template_name,to_email,subject,body,status,sent_by,batch_id,delivery_outcome,body_html_snapshot,body_document_snapshot,final_html_snapshot,final_text_snapshot)
    VALUES((message->>'cleaner_id')::UUID,p_template_id,p_template_name,message->>'email',message->>'subject',message->>'body','draft',actor_name,p_id,'queued',message->>'body_html',message->'body_document',message->>'html',message->>'text');
  END LOOP;
  INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('cleaner_email_batch',p_id::TEXT,'cleaner.email_batch.reserved',jsonb_build_object('actorId',p_actor_id,'recipientCount',jsonb_array_length(p_messages)));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_cleaner_email_batch(UUID,UUID,TEXT,JSONB,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_cleaner_email_batch(UUID,UUID,TEXT,JSONB,UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_cleaner_email_delivery(p_email_id UUID,p_actor_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  item public.cleaner_emails%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_staff_accounts WHERE id = p_actor_id AND active AND role IN ('owner','manager','staff')) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT e.* INTO item FROM public.cleaner_emails e JOIN public.cleaner_email_batches b ON b.id=e.batch_id
    WHERE e.id=p_email_id AND b.actor_id=p_actor_id FOR UPDATE OF e;
  IF NOT FOUND OR item.delivery_outcome <> 'queued' THEN RETURN FALSE; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id=item.cleaner_id
    AND LOWER(BTRIM(c.email))=item.to_email
    AND NOT EXISTS (SELECT 1 FROM public.cleaner_broadcast_suppressions s WHERE s.cleaner_id=c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crm_email_suppressions s WHERE s.email_normalized=LOWER(BTRIM(c.email)) AND s.blocks_all)) THEN
    UPDATE public.cleaner_emails SET delivery_outcome='skipped',error_message='Recipient is no longer eligible.' WHERE id=p_email_id;
    INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
      VALUES('cleaner_email',p_email_id::TEXT,'cleaner.email.skipped',jsonb_build_object('actorId',p_actor_id));
    RETURN FALSE;
  END IF;
  UPDATE public.cleaner_emails SET delivery_outcome='sending' WHERE id=p_email_id;
  INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('cleaner_email',p_email_id::TEXT,'cleaner.email.claimed',jsonb_build_object('actorId',p_actor_id));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cleaner_email_delivery(UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cleaner_email_delivery(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_cleaner_email_batch_v2(
  p_id UUID, p_actor_id UUID, p_input_hash TEXT, p_messages JSONB,
  p_template_id UUID, p_template_name TEXT, p_delivery JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  actor_name TEXT;
  message JSONB;
  existing public.cleaner_email_batches%ROWTYPE;
BEGIN
  SELECT username INTO actor_name FROM public.admin_staff_accounts
    WHERE id = p_actor_id AND active AND role IN ('owner','manager','staff');
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  -- Serialize reservations per sender, including retries and the hourly bound.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::TEXT, 0));
  SELECT * INTO existing FROM public.cleaner_email_batches WHERE id = p_id;
  IF FOUND THEN
    IF existing.actor_id <> p_actor_id OR existing.input_hash <> p_input_hash THEN
      RAISE EXCEPTION 'Request conflict';
    END IF;
    RETURN FALSE;
  END IF;
  IF jsonb_typeof(p_messages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_messages) < 1
    OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid batch';
  END IF;
  IF (SELECT COUNT(*) FROM public.cleaner_email_batches WHERE actor_id = p_actor_id AND created_at > NOW() - INTERVAL '1 hour') >= 12 THEN
    RAISE EXCEPTION 'Hourly send limit reached';
  END IF;
  IF p_delivery->>'from' IS NULL OR p_delivery->>'replyTo' IS NULL THEN RAISE EXCEPTION 'Missing sender'; END IF;
  INSERT INTO public.cleaner_email_batches(id,actor_id,input_hash,delivery) VALUES(p_id,p_actor_id,p_input_hash,p_delivery);
  FOR message IN SELECT value FROM jsonb_array_elements(p_messages) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = (message->>'cleaner_id')::UUID
      AND LOWER(BTRIM(c.email)) = message->>'email'
      AND c.broadcast_unsubscribe_token IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.cleaner_broadcast_suppressions s WHERE s.cleaner_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_email_suppressions s WHERE s.email_normalized = LOWER(BTRIM(c.email)) AND s.blocks_all)) THEN
      RAISE EXCEPTION 'Recipient ineligible';
    END IF;
    INSERT INTO public.cleaner_emails(cleaner_id,template_id,template_name,to_email,subject,body,status,sent_by,batch_id,delivery_outcome,body_html_snapshot,body_document_snapshot,final_html_snapshot,final_text_snapshot,delivery_headers)
    VALUES((message->>'cleaner_id')::UUID,p_template_id,p_template_name,message->>'email',message->>'subject',message->>'body','draft',actor_name,p_id,'queued',message->>'body_html',message->'body_document',message->>'html',message->>'text',message->'headers');
  END LOOP;
  INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('cleaner_email_batch',p_id::TEXT,'cleaner.email_batch.reserved',jsonb_build_object('actorId',p_actor_id,'recipientCount',jsonb_array_length(p_messages)));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_cleaner_email_batch_v2(UUID,UUID,TEXT,JSONB,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_cleaner_email_batch_v2(UUID,UUID,TEXT,JSONB,UUID,TEXT,JSONB) TO service_role;

COMMIT;
