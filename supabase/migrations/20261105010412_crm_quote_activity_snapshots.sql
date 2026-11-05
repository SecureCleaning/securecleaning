BEGIN;
-- Private immutable archives; no send/backfill-email action is performed.
ALTER TABLE public.quote_send_attempts ADD COLUMN email_snapshot jsonb,
 ADD COLUMN document_snapshot jsonb;
ALTER TABLE public.crm_communications ADD COLUMN follow_up_quote_send_id uuid
 REFERENCES public.quote_send_attempts(id) ON DELETE SET NULL;
ALTER TABLE public.crm_communications ADD CONSTRAINT crm_one_follow_up_origin
 CHECK (follow_up_to_id IS NULL OR follow_up_quote_send_id IS NULL);
-- Only recover a document if the exact recorded version is still retained.
UPDATE public.quote_send_attempts a SET document_snapshot=q.final_quote_document
FROM public.quotes q WHERE q.quote_ref=a.quote_ref
 AND q.final_quote_document_version=a.document_version
 AND q.final_quote_document->>'version'=a.document_version::text;
CREATE FUNCTION public.archive_quote_send_document() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT final_quote_document INTO NEW.document_snapshot FROM quotes
  WHERE quote_ref=NEW.quote_ref AND final_quote_document_version=NEW.document_version;
 ELSIF NEW.document_snapshot IS DISTINCT FROM OLD.document_snapshot
 OR (OLD.email_snapshot IS NOT NULL AND NEW.email_snapshot IS DISTINCT FROM OLD.email_snapshot)
 OR (NEW.email_snapshot IS DISTINCT FROM OLD.email_snapshot AND OLD.status<>'claimed') THEN
  RAISE EXCEPTION 'Quote send archive cannot be changed';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_send_archive BEFORE INSERT OR UPDATE ON public.quote_send_attempts
 FOR EACH ROW EXECUTE FUNCTION public.archive_quote_send_document();
REVOKE ALL ON FUNCTION public.archive_quote_send_document() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.archive_quote_send_document() TO service_role;

-- A successful follow-up completes the prior reminder. Normal emails without a
-- requested reminder leave unrelated reminders alone. Finalization is atomic.
CREATE FUNCTION public.guard_crm_quote_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.follow_up_quote_send_id IS NOT NULL THEN
  IF TG_OP='UPDATE' AND NEW.follow_up_quote_send_id IS DISTINCT FROM OLD.follow_up_quote_send_id
    AND (OLD.follow_up_quote_send_id IS NOT NULL OR OLD.status<>'sending') THEN
   RAISE EXCEPTION 'Quote follow-up origin cannot be changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quote_send_attempts a JOIN quotes q ON q.quote_ref=a.quote_ref
    JOIN crm_opportunity_quotes l ON l.quote_id=q.id
    JOIN crm_opportunities o ON o.id=l.opportunity_id
    WHERE a.id=NEW.follow_up_quote_send_id AND a.status='finalized'
      AND l.opportunity_id=NEW.opportunity_id AND o.primary_contact_id=NEW.contact_id
      AND lower(trim(a.recipient))=lower(trim(NEW.to_email))) THEN
   RAISE EXCEPTION 'Quote follow-up must match the opportunity and recipient';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_quote_follow_up_guard BEFORE INSERT OR UPDATE OF follow_up_quote_send_id ON public.crm_communications
 FOR EACH ROW EXECUTE FUNCTION public.guard_crm_quote_follow_up();
REVOKE ALL ON FUNCTION public.guard_crm_quote_follow_up() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_crm_quote_follow_up() TO service_role;
CREATE OR REPLACE FUNCTION public.apply_crm_email_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent'
     AND (NEW.follow_up_to_id IS NOT NULL OR NEW.follow_up_quote_send_id IS NOT NULL OR NEW.follow_up_at IS NOT NULL) THEN
    -- Serialize updates for one opportunity and ignore late finalization of an
    -- older email when a newer successfully sent email is already recorded.
    PERFORM 1 FROM public.crm_opportunities WHERE id = NEW.opportunity_id FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_communications c
      WHERE c.opportunity_id = NEW.opportunity_id AND c.id <> NEW.id
        AND c.status = 'sent' AND c.sent_at > NEW.sent_at
    ) THEN
      UPDATE public.crm_opportunities SET
        next_follow_up_at = NEW.follow_up_at,
        notes = CASE WHEN NEW.follow_up_at IS NOT NULL THEN
          concat_ws(E'\n', NULLIF(notes, ''), 'Email follow-up: ' || COALESCE(NULLIF(NEW.follow_up_note, ''), 'Follow up outreach email'))
          ELSE notes END
      WHERE id = NEW.opportunity_id AND stage NOT IN ('won', 'lost', 'cancelled');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_crm_email_follow_up() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_crm_email_follow_up() TO service_role;

COMMIT;
