-- Apply after contract_products_migration.sql and cleaner_permanent_deletion_migration.sql.
-- Historical broadcast snapshots survive cleaner deletion, while the deleted email
-- remains suppressed if the same address is registered again later.
BEGIN;

ALTER TABLE public.cleaner_broadcast_recipients
  DROP CONSTRAINT IF EXISTS cleaner_broadcast_recipients_cleaner_id_fkey;
ALTER TABLE public.cleaner_broadcast_recipients
  ALTER COLUMN cleaner_id DROP NOT NULL;
ALTER TABLE public.cleaner_broadcast_recipients
  ADD CONSTRAINT cleaner_broadcast_recipients_cleaner_id_fkey
  FOREIGN KEY (cleaner_id) REFERENCES public.cleaners(id) ON DELETE SET NULL;

ALTER TABLE public.cleaner_broadcast_suppressions
  DROP CONSTRAINT IF EXISTS cleaner_broadcast_suppressions_cleaner_id_fkey;
ALTER TABLE public.cleaner_broadcast_suppressions
  ALTER COLUMN cleaner_id DROP NOT NULL;
ALTER TABLE public.cleaner_broadcast_suppressions
  ADD CONSTRAINT cleaner_broadcast_suppressions_cleaner_id_fkey
  FOREIGN KEY (cleaner_id) REFERENCES public.cleaners(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.attach_existing_cleaner_broadcast_suppression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  suppression_id UUID;
BEGIN
  -- An existing suppression already blocks this cleaner. Keep detached email
  -- suppressions intact rather than violating the unique cleaner_id constraint.
  IF EXISTS (
    SELECT 1 FROM public.cleaner_broadcast_suppressions WHERE cleaner_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO suppression_id
  FROM public.cleaner_broadcast_suppressions
  WHERE cleaner_id IS NULL
    AND email_normalized = LOWER(BTRIM(NEW.email))
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF suppression_id IS NOT NULL THEN
    UPDATE public.cleaner_broadcast_suppressions
    SET cleaner_id = NEW.id, updated_at = NOW()
    WHERE id = suppression_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attach_cleaner_broadcast_suppression ON public.cleaners;
CREATE TRIGGER trg_attach_cleaner_broadcast_suppression
  AFTER INSERT OR UPDATE OF email ON public.cleaners
  FOR EACH ROW EXECUTE FUNCTION public.attach_existing_cleaner_broadcast_suppression();

CREATE OR REPLACE FUNCTION public.delete_cleaner_permanently(
  p_cleaner_id UUID,
  p_actor_id TEXT,
  p_actor_username TEXT,
  p_actor_role TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  previous_status TEXT;
  cleaner_email TEXT;
  suppression_id UUID;
BEGIN
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('manager', 'owner')
     OR NULLIF(BTRIM(p_actor_id), '') IS NULL
     OR NULLIF(BTRIM(p_actor_username), '') IS NULL THEN
    RAISE EXCEPTION 'Unauthorized cleaner deletion' USING ERRCODE = '42501';
  END IF;

  SELECT status, LOWER(BTRIM(email)) INTO previous_status, cleaner_email
  FROM public.cleaners
  WHERE id = p_cleaner_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM public.cleaner_documents WHERE cleaner_id = p_cleaner_id) THEN
    RAISE EXCEPTION 'cleaner_has_documents';
  END IF;

  SELECT id INTO suppression_id
  FROM public.cleaner_broadcast_suppressions
  WHERE cleaner_id = p_cleaner_id OR email_normalized = cleaner_email
  ORDER BY (cleaner_id = p_cleaner_id) DESC NULLS LAST, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF suppression_id IS NULL THEN
    INSERT INTO public.cleaner_broadcast_suppressions(
      cleaner_id, email_normalized, reason
    ) VALUES (
      p_cleaner_id, cleaner_email, 'unsubscribed'
    );
  ELSE
    UPDATE public.cleaner_broadcast_suppressions
    SET cleaner_id = p_cleaner_id,
        email_normalized = cleaner_email,
        reason = 'unsubscribed',
        updated_at = NOW()
    WHERE id = suppression_id;
  END IF;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('cleaner', p_cleaner_id::TEXT, 'cleaner.permanently_deleted',
    jsonb_build_object('actorId', p_actor_id, 'actorName', p_actor_username,
      'actorRole', p_actor_role, 'previousStatus', previous_status,
      'broadcastEmailSuppressed', TRUE));

  -- Broadcast recipient and suppression links become NULL. Operational sales and
  -- offer foreign keys remain restrictive and still block the whole transaction.
  DELETE FROM public.cleaners WHERE id = p_cleaner_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_existing_cleaner_broadcast_suppression() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_existing_cleaner_broadcast_suppression() TO service_role;
REVOKE ALL ON FUNCTION public.delete_cleaner_permanently(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cleaner_permanently(UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
