-- Apply after cleaners_migration.sql, cleaner_documents_migration.sql and
-- audit_log_migration.sql, before deploying the cleaner deletion UI/API.
-- Existing RESTRICT foreign keys intentionally protect sales/offers/broadcasts.
BEGIN;
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
BEGIN
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('manager', 'owner')
     OR NULLIF(BTRIM(p_actor_id), '') IS NULL
     OR NULLIF(BTRIM(p_actor_username), '') IS NULL THEN
    RAISE EXCEPTION 'Unauthorized cleaner deletion' USING ERRCODE = '42501';
  END IF;

  -- Lock the parent so concurrent FK-backed document inserts cannot slip past
  -- this check and leave private storage objects without document metadata.
  SELECT status INTO previous_status FROM public.cleaners
    WHERE id = p_cleaner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM public.cleaner_documents WHERE cleaner_id = p_cleaner_id) THEN
    RAISE EXCEPTION 'cleaner_has_documents';
  END IF;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES ('cleaner', p_cleaner_id::TEXT, 'cleaner.permanently_deleted',
    jsonb_build_object('actorId', p_actor_id, 'actorName', p_actor_username,
      'actorRole', p_actor_role, 'previousStatus', previous_status));
  -- Audit and deletion commit together; any protected relation rolls both back.
  DELETE FROM public.cleaners WHERE id = p_cleaner_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_cleaner_permanently(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cleaner_permanently(UUID, TEXT, TEXT, TEXT) TO service_role;
COMMIT;
