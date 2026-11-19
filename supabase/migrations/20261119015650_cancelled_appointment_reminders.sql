-- Cancel only unattempted appointment SMS; retain sent/uncertain history and unrelated follow-ups.
BEGIN;
CREATE OR REPLACE FUNCTION public.sms_inspection_block_reason(p_receipt uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e public.sms_inspection_emails%ROWTYPE; c jsonb;
BEGIN
 SELECT * INTO e FROM public.sms_inspection_emails WHERE id=p_receipt;
 IF NOT FOUND OR nullif(trim(e.provider_message_id),'') IS NULL THEN RETURN 'email_not_confirmed'; END IF;
 IF e.kind='request' THEN RETURN 'inspection_request_sms_disabled'; END IF;
 c:=public.sms_inspection_context(e.entity_type,e.entity_ref);
 IF e.entity_type='booking' AND EXISTS (SELECT 1 FROM public.bookings WHERE booking_ref=e.entity_ref AND inspection_status='cancelled') THEN RETURN 'inspection_cancelled'; END IF;
 IF c IS NULL OR c->'snapshot' IS DISTINCT FROM e.snapshot THEN RETURN 'inspection_changed_or_removed'; END IF;
 IF c->>'mobile' IS DISTINCT FROM e.mobile OR c->>'recipient' IS DISTINCT FROM e.recipient THEN RETURN 'inspection_contact_changed'; END IF;
 IF (c->>'startsAt')::timestamptz<=now() THEN RETURN 'inspection_passed'; END IF;
 IF EXISTS(SELECT 1 FROM public.sms_quote_requests r WHERE r.quote_ref=c->>'quoteRef' AND r.mobile=e.mobile AND NOT r.allowed) THEN RETURN 'quote_email_only'; END IF;
 RETURN NULL;
END $$;


CREATE OR REPLACE FUNCTION public.cancel_appointment_sms_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE kind text; ref text;
BEGIN
 IF TG_TABLE_NAME='bookings' THEN
  IF NEW.inspection_status IS DISTINCT FROM 'cancelled' AND NEW.status::text IS DISTINCT FROM 'cancelled' THEN RETURN NEW; END IF;
  kind:='booking'; ref:=NEW.booking_ref;
 ELSE
  IF NEW.status IS DISTINCT FROM 'cancelled' THEN RETURN NEW; END IF;
  kind:='sale_inspection'; ref:=NEW.id::text;
 END IF;
 UPDATE public.sms_jobs SET status='cancelled',cancel_requested=true,reason='inspection_cancelled',
   lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE id IN (SELECT id FROM public.sms_jobs WHERE entity_type=kind AND entity_ref=ref
   AND purpose IN ('inspection_request','inspection_confirmation','sale_inspection')
   AND first_attempt_at IS NULL AND status IN ('queued','leased') FOR UPDATE SKIP LOCKED);
 -- Dispatch locks its job before the booking. Skip that lock to avoid a deadlock;
 -- the dispatch-time guard above checks cancellation after acquiring the booking lock.
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cancel_appointment_sms_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_sms_jobs() TO service_role;
REVOKE ALL ON FUNCTION public.sms_inspection_block_reason(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sms_inspection_block_reason(uuid) TO service_role;
CREATE TRIGGER cancel_booking_appointment_sms AFTER UPDATE OF status,inspection_status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.cancel_appointment_sms_jobs();
CREATE TRIGGER cancel_sale_appointment_sms AFTER UPDATE OF status ON public.contract_sale_inspections
FOR EACH ROW EXECUTE FUNCTION public.cancel_appointment_sms_jobs();

-- Existing cancellations receive the same cleanup, without changing any booking or follow-up.
UPDATE public.sms_jobs j SET status='cancelled',cancel_requested=true,reason='inspection_cancelled',
 lease_token=NULL,lease_until=NULL,updated_at=now()
WHERE j.first_attempt_at IS NULL AND j.status IN ('queued','leased')
 AND j.purpose IN ('inspection_request','inspection_confirmation','sale_inspection')
 AND ((j.entity_type='booking' AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.booking_ref=j.entity_ref AND (b.inspection_status='cancelled' OR b.status::text='cancelled')))
 OR (j.entity_type='sale_inspection' AND EXISTS (SELECT 1 FROM public.contract_sale_inspections i WHERE i.id::text=j.entity_ref AND i.status='cancelled')));
COMMIT;
