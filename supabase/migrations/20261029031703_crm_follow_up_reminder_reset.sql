BEGIN;
-- A successful follow-up completes the prior reminder. Normal emails without a
-- requested reminder leave unrelated reminders alone. Finalization is atomic.
CREATE OR REPLACE FUNCTION public.apply_crm_email_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent'
     AND (NEW.follow_up_to_id IS NOT NULL OR NEW.follow_up_at IS NOT NULL) THEN
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
