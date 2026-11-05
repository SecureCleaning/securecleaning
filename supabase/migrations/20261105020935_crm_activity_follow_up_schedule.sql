-- Apply before app. Only CRM reminders change; no bookings, sends or calendar writes.
BEGIN;
ALTER TABLE public.crm_opportunities
 ADD COLUMN follow_up_source text CHECK (follow_up_source IN ('manual','email','inspection','inspection_cancelled','quote')),
 ADD COLUMN follow_up_source_id uuid,
 ADD COLUMN follow_up_event_at timestamptz;

CREATE FUNCTION public.crm_follow_up_due(anchor_at timestamptz, city text, business_days integer DEFAULT 2)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE zone text := CASE city WHEN 'brisbane' THEN 'Australia/Brisbane' WHEN 'sydney' THEN 'Australia/Sydney' ELSE 'Australia/Melbourne' END;
 local_day date; remaining integer := business_days;
BEGIN
 IF anchor_at IS NULL THEN RETURN NULL; END IF;
 IF business_days NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid follow-up interval'; END IF;
 local_day := (anchor_at AT TIME ZONE zone)::date;
 WHILE remaining > 0 LOOP
  local_day := local_day + 1;
  IF extract(isodow FROM local_day) < 6 THEN remaining := remaining - 1; END IF;
 END LOOP;
 RETURN (local_day + time '09:00') AT TIME ZONE zone;
END $$;

-- Preserve manual decisions against late delivery finalization and repeated saves.
CREATE FUNCTION public.mark_manual_crm_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.next_follow_up_at IS DISTINCT FROM OLD.next_follow_up_at
 AND (NEW.follow_up_source,NEW.follow_up_source_id,NEW.follow_up_event_at)
   IS NOT DISTINCT FROM (OLD.follow_up_source,OLD.follow_up_source_id,OLD.follow_up_event_at) THEN
  NEW.follow_up_source := 'manual'; NEW.follow_up_source_id := NULL;
  NEW.follow_up_event_at := clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_follow_up_manual BEFORE UPDATE OF next_follow_up_at ON public.crm_opportunities
 FOR EACH ROW EXECUTE FUNCTION public.mark_manual_crm_follow_up();

CREATE FUNCTION public.set_crm_activity_follow_up(opportunity uuid, source text, source_id uuid, event_at timestamptz, due_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE previous public.crm_opportunities%ROWTYPE; resolved_due timestamptz := due_at;
BEGIN
 IF opportunity IS NULL OR event_at IS NULL THEN RETURN false; END IF;
 SELECT * INTO previous FROM crm_opportunities WHERE id=opportunity FOR UPDATE;
 IF NOT FOUND OR previous.closed_at IS NOT NULL OR previous.stage IN ('won','lost','cancelled') THEN RETURN false; END IF;
 IF previous.follow_up_event_at IS NOT NULL AND event_at <= previous.follow_up_event_at THEN RETURN false; END IF;
 -- A quote sent ahead of an already-booked visit must not bring its reminder
 -- back to before the inspection. Later quote sends use their own send date.
 IF source='quote' THEN
  SELECT greatest(due_at,max(crm_follow_up_due(b.inspection_scheduled_for,b.inputs->>'city')))
   INTO resolved_due FROM bookings b WHERE b.opportunity_id=opportunity
   AND b.inspection_status='scheduled' AND b.status::text<>'cancelled' AND b.inspection_scheduled_for>event_at;
 END IF;
 UPDATE crm_opportunities SET next_follow_up_at=resolved_due, follow_up_source=source,
  follow_up_source_id=source_id,follow_up_event_at=event_at,updated_at=clock_timestamp() WHERE id=opportunity;
 RETURN true;
END $$;

CREATE FUNCTION public.crm_booking_follow_up_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.opportunity_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.opportunity_id,NEW.inspection_status,NEW.inspection_scheduled_for,NEW.status)
   IS NOT DISTINCT FROM (OLD.opportunity_id,OLD.inspection_status,OLD.inspection_scheduled_for,OLD.status) THEN RETURN NEW; END IF;
 IF NEW.inspection_status='scheduled' AND NEW.inspection_scheduled_for IS NOT NULL AND NEW.status::text<>'cancelled' THEN
  -- Completion, reassignment, input edits and notification retries are not new appointments.
  IF TG_OP='UPDATE' AND OLD.inspection_status='scheduled' AND OLD.status::text<>'cancelled'
   AND NEW.opportunity_id IS NOT DISTINCT FROM OLD.opportunity_id
   AND NEW.inspection_scheduled_for IS NOT DISTINCT FROM OLD.inspection_scheduled_for THEN RETURN NEW; END IF;
  PERFORM set_crm_activity_follow_up(NEW.opportunity_id,'inspection',NEW.id,clock_timestamp(),
    crm_follow_up_due(NEW.inspection_scheduled_for,NEW.inputs->>'city'));
 ELSIF TG_OP='UPDATE' AND (NEW.status::text='cancelled' OR NEW.inspection_status='cancelled')
   AND EXISTS (SELECT 1 FROM crm_opportunities WHERE id=NEW.opportunity_id
     AND follow_up_source='inspection' AND follow_up_source_id=NEW.id) THEN
  PERFORM set_crm_activity_follow_up(NEW.opportunity_id,'inspection_cancelled',NEW.id,clock_timestamp(),
    crm_follow_up_due(clock_timestamp(),NEW.inputs->>'city',1));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_booking_follow_up AFTER INSERT OR UPDATE OF opportunity_id,inspection_status,inspection_scheduled_for,status ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.crm_booking_follow_up_event();

CREATE FUNCTION public.crm_quote_follow_up_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE item record; q public.quotes%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='quotes' THEN
  IF NEW.final_quote_sent_at IS NULL OR NEW.final_quote_sent_at IS NOT DISTINCT FROM OLD.final_quote_sent_at THEN RETURN NEW; END IF;
  FOR item IN SELECT opportunity_id FROM crm_opportunity_quotes WHERE quote_id=NEW.id LOOP
   PERFORM set_crm_activity_follow_up(item.opportunity_id,'quote',NEW.id,NEW.final_quote_sent_at,
    crm_follow_up_due(NEW.final_quote_sent_at,NEW.inputs->>'city'));
  END LOOP;
 ELSE
  SELECT * INTO q FROM quotes WHERE id=NEW.quote_id;
  IF q.final_quote_sent_at IS NOT NULL THEN
   PERFORM set_crm_activity_follow_up(NEW.opportunity_id,'quote',q.id,q.final_quote_sent_at,
     crm_follow_up_due(q.final_quote_sent_at,q.inputs->>'city'));
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_quote_follow_up AFTER UPDATE OF final_quote_sent_at ON public.quotes
 FOR EACH ROW EXECUTE FUNCTION public.crm_quote_follow_up_event();
CREATE TRIGGER crm_quote_link_follow_up AFTER INSERT ON public.crm_opportunity_quotes
 FOR EACH ROW EXECUTE FUNCTION public.crm_quote_follow_up_event();

CREATE OR REPLACE FUNCTION public.apply_crm_email_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='sent' AND OLD.status IS DISTINCT FROM 'sent'
 AND (NEW.follow_up_to_id IS NOT NULL OR NEW.follow_up_quote_send_id IS NOT NULL OR NEW.follow_up_at IS NOT NULL) THEN
  PERFORM 1 FROM crm_opportunities WHERE id=NEW.opportunity_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM crm_communications c WHERE c.opportunity_id=NEW.opportunity_id
    AND c.id<>NEW.id AND c.status='sent' AND c.sent_at>NEW.sent_at)
  AND set_crm_activity_follow_up(NEW.opportunity_id,'email',NEW.id,NEW.sent_at,NEW.follow_up_at) THEN
   IF NEW.follow_up_at IS NOT NULL THEN
    UPDATE crm_opportunities SET notes=concat_ws(E'\n',NULLIF(notes,''),
      'Email follow-up: ' || COALESCE(NULLIF(NEW.follow_up_note,''),'Follow up outreach email'))
    WHERE id=NEW.opportunity_id;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_crm_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF (OLD.next_follow_up_at,OLD.follow_up_source,OLD.follow_up_source_id)
 IS DISTINCT FROM (NEW.next_follow_up_at,NEW.follow_up_source,NEW.follow_up_source_id) THEN
  INSERT INTO admin_audit_log(entity_type,entity_ref,action,details)
  VALUES('crm_opportunity',NEW.id::text,'crm.follow_up.changed',jsonb_build_object(
   'previousDueAt',OLD.next_follow_up_at,'dueAt',NEW.next_follow_up_at,'assignedStaffId',NEW.assigned_staff_id,
   'source',NEW.follow_up_source,'sourceId',NEW.follow_up_source_id,'eventAt',NEW.follow_up_event_at));
 END IF;
 RETURN NEW;
END $$;

-- Repair only still-open reminders predating a confirmed activity. An explicit
-- later reminder edit, completion, later sent email or closed cycle is preserved.
DO $$
DECLARE item record;
BEGIN
 FOR item IN
  WITH events AS (
   SELECT b.opportunity_id,'inspection'::text source,b.id source_id,b.created_at event_at,
    b.inspection_scheduled_for anchor_at,b.inputs->>'city' city
   FROM bookings b WHERE b.inspection_status='scheduled' AND b.status::text<>'cancelled' AND b.inspection_scheduled_for IS NOT NULL
   UNION ALL
   SELECT l.opportunity_id,'quote',q.id,q.final_quote_sent_at,q.final_quote_sent_at,q.inputs->>'city'
   FROM crm_opportunity_quotes l JOIN quotes q ON q.id=l.quote_id WHERE q.final_quote_sent_at IS NOT NULL
  ), latest AS (SELECT DISTINCT ON(opportunity_id) * FROM events ORDER BY opportunity_id,event_at DESC,source_id)
  SELECT e.* FROM latest e JOIN crm_opportunities o ON o.id=e.opportunity_id
  WHERE o.closed_at IS NULL AND o.stage NOT IN ('won','lost','cancelled') AND o.follow_up_source IS NULL
   AND o.next_follow_up_at IS NOT NULL AND o.next_follow_up_at<=e.anchor_at
   AND NOT EXISTS (SELECT 1 FROM admin_audit_log a WHERE a.entity_type='crm_opportunity' AND a.entity_ref=o.id::text
     AND a.action='crm.follow_up.changed' AND a.created_at>e.event_at)
   AND NOT EXISTS (SELECT 1 FROM crm_communications c WHERE c.opportunity_id=o.id AND c.status='sent' AND c.sent_at>e.event_at)
 LOOP
  PERFORM set_crm_activity_follow_up(item.opportunity_id,item.source,item.source_id,item.event_at,crm_follow_up_due(item.anchor_at,item.city));
 END LOOP;
END $$;

-- Legacy reminders have no provenance. Retain their existing display labels,
-- but do not let an older send finalized after rollout overwrite a later edit.
UPDATE crm_opportunities o SET follow_up_event_at=COALESCE(
 (SELECT max(a.created_at) FROM admin_audit_log a WHERE a.entity_type='crm_opportunity'
   AND a.entity_ref=o.id::text AND a.action='crm.follow_up.changed'),o.updated_at)
WHERE o.follow_up_source IS NULL AND o.follow_up_event_at IS NULL;

REVOKE ALL ON FUNCTION public.crm_follow_up_due(timestamptz,text,integer),public.mark_manual_crm_follow_up(),
 public.set_crm_activity_follow_up(uuid,text,uuid,timestamptz,timestamptz),public.crm_booking_follow_up_event(),
 public.crm_quote_follow_up_event(),public.apply_crm_email_follow_up(),public.audit_crm_follow_up() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_follow_up_due(timestamptz,text,integer),public.mark_manual_crm_follow_up(),
 public.set_crm_activity_follow_up(uuid,text,uuid,timestamptz,timestamptz),public.crm_booking_follow_up_event(),
 public.crm_quote_follow_up_event(),public.apply_crm_email_follow_up(),public.audit_crm_follow_up() TO service_role;
COMMIT;
