-- After cleaners, staff_accounts, audit_log, client CRM suppression and
-- contract_products and rich_email_composer migrations. Apply before deploying the new email composer.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cleaner_email_batches (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
  input_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.cleaner_email_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cleaner_email_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.cleaner_email_batches TO service_role;
DROP POLICY IF EXISTS cleaner_email_batches_service ON public.cleaner_email_batches;
CREATE POLICY cleaner_email_batches_service ON public.cleaner_email_batches
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
ALTER TABLE public.cleaner_emails ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.cleaner_email_batches(id) ON DELETE RESTRICT;
ALTER TABLE public.cleaner_emails ADD COLUMN IF NOT EXISTS delivery_outcome TEXT CHECK (delivery_outcome IN ('queued','sending','sent','failed','unknown','skipped'));
CREATE UNIQUE INDEX IF NOT EXISTS cleaner_email_batch_recipient ON public.cleaner_emails(batch_id, cleaner_id) WHERE batch_id IS NOT NULL;

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
      AND c.status = 'approved' AND LOWER(BTRIM(c.email)) = message->>'email'
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
    AND c.status='approved' AND LOWER(BTRIM(c.email))=item.to_email
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

CREATE OR REPLACE FUNCTION public.complete_cleaner_email_delivery(p_email_id UUID,p_actor_id UUID,p_outcome TEXT,p_provider_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','unknown') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  UPDATE public.cleaner_emails e SET delivery_outcome=p_outcome,
    status=CASE WHEN p_outcome='sent' THEN 'sent' WHEN p_outcome='failed' THEN 'failed' ELSE 'draft' END,
    provider_message_id=p_provider_id,sent_at=CASE WHEN p_outcome='sent' THEN NOW() ELSE NULL END,
    error_message=CASE WHEN p_outcome='unknown' THEN 'Delivery outcome is unknown. Check provider history before sending again.' WHEN p_outcome='failed' THEN 'Email provider rejected this message.' ELSE NULL END
    FROM public.cleaner_email_batches b WHERE e.id=p_email_id AND e.batch_id=b.id AND b.actor_id=p_actor_id AND e.delivery_outcome='sending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unclaimed delivery'; END IF;
  INSERT INTO public.admin_audit_log(entity_type,entity_ref,action,details)
    VALUES('cleaner_email',p_email_id::TEXT,'cleaner.email.completed',jsonb_build_object('actorId',p_actor_id,'outcome',p_outcome));
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_cleaner_email_batch(UUID,UUID,TEXT,JSONB,UUID,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_cleaner_email_delivery(UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_cleaner_email_delivery(UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_cleaner_email_batch(UUID,UUID,TEXT,JSONB,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_cleaner_email_delivery(UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_cleaner_email_delivery(UUID,UUID,TEXT,TEXT) TO service_role;
-- Reuse existing direct-email cascade semantics: removing a cleaner removes its
-- per-cleaner messages. Batch ledger + minimal admin audit evidence survive.
-- Protected sales/offers/job broadcasts still prevent permanent deletion.
INSERT INTO public.cleaner_email_templates(name,description,subject,body)
SELECT 'Cleaner network update','A personalised update for approved cleaners.','An update from Secure Cleaning',
  E'Hi {{first_name}},\n\nWe are getting in touch with an update for our cleaner network.\n\nPlease reply with your current availability and preferred work locations.\n\nPlease reply to this email if you have any questions.'
WHERE NOT EXISTS (SELECT 1 FROM public.cleaner_email_templates WHERE LOWER(name)='cleaner network update');
COMMIT;
