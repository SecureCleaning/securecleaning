-- Owner-only application workflow for permanently deleting test or corrupt quotes.
-- The application authorizes the owner before calling this service-role-only RPC.

CREATE OR REPLACE FUNCTION public.admin_delete_quote(
  p_quote_ref TEXT,
  p_reason TEXT,
  p_actor JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_row public.quotes%ROWTYPE;
  product_count INTEGER;
  sale_count INTEGER;
  booking_count INTEGER;
  opportunity_link_count INTEGER;
  send_attempt_count INTEGER;
  document_version_count INTEGER;
  deleted_quote_count INTEGER;
BEGIN
  IF p_quote_ref IS NULL
     OR p_quote_ref !~ '^SC-[0-9]{8}-([A-Z0-9]{4}|[A-Z0-9]{8})$' THEN
    RAISE EXCEPTION 'A valid quote reference is required.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(BTRIM(p_actor->>'id'), '') = ''
     OR COALESCE(BTRIM(p_actor->>'name'), '') = ''
     OR COALESCE(BTRIM(p_actor->>'role'), '') <> 'owner' THEN
    RAISE EXCEPTION 'A verified owner identity is required.' USING ERRCODE = '42501';
  END IF;

  IF LENGTH(BTRIM(COALESCE(p_reason, ''))) < 10
     OR LENGTH(BTRIM(COALESCE(p_reason, ''))) > 500 THEN
    RAISE EXCEPTION 'Enter a deletion reason between 10 and 500 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO quote_row
  FROM public.quotes
  WHERE quote_ref = p_quote_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'P0002';
  END IF;

  IF quote_row.status = 'accepted' THEN
    RAISE EXCEPTION 'Accepted quotes cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  IF quote_row.final_quote_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Quotes with a sent final document cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quote_send_attempts
    WHERE quote_ref = quote_row.quote_ref
      AND status IN ('provider_accepted', 'finalized')
  ) THEN
    RAISE EXCEPTION 'Quotes with provider-confirmed email delivery cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*) INTO product_count
  FROM public.contract_products
  WHERE source_quote_id = quote_row.id;

  SELECT COUNT(*) INTO sale_count
  FROM public.contract_product_sales
  WHERE source_quote_id = quote_row.id;

  IF product_count > 0 OR sale_count > 0 THEN
    RAISE EXCEPTION 'Quotes linked to a contract product or sale cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*) INTO booking_count
  FROM public.bookings
  WHERE quote_id = quote_row.id;

  IF booking_count > 0 THEN
    RAISE EXCEPTION 'Quotes linked to a booking cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*) INTO opportunity_link_count
  FROM public.crm_opportunity_quotes
  WHERE quote_id = quote_row.id;

  IF EXISTS (
    SELECT 1 FROM public.crm_opportunities
    WHERE winning_quote_id = quote_row.id
  ) THEN
    RAISE EXCEPTION 'Winning opportunity quotes cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*) INTO send_attempt_count
  FROM public.quote_send_attempts
  WHERE quote_ref = quote_row.quote_ref;

  SELECT COUNT(*) INTO document_version_count
  FROM public.final_quote_document_versions
  WHERE quote_ref = quote_row.quote_ref;

  DELETE FROM public.crm_opportunity_quotes
  WHERE quote_id = quote_row.id;

  INSERT INTO public.admin_audit_log(entity_type, entity_ref, action, details)
  VALUES (
    'quote',
    quote_row.quote_ref,
    'quote_deleted',
    jsonb_build_object(
      'actorId', p_actor->>'id',
      'actorName', p_actor->>'name',
      'actorRole', p_actor->>'role',
      'reason', BTRIM(p_reason),
      'previousStatus', quote_row.status,
      'opportunityLinksRemoved', opportunity_link_count,
      'sendAttemptsRemoved', send_attempt_count,
      'documentVersionsRemoved', document_version_count
    )
  );

  DELETE FROM public.quotes
  WHERE id = quote_row.id;
  GET DIAGNOSTICS deleted_quote_count = ROW_COUNT;

  IF deleted_quote_count <> 1 THEN
    RAISE EXCEPTION 'Quote deletion did not affect exactly one quote.';
  END IF;

  RETURN jsonb_build_object(
    'quoteRef', quote_row.quote_ref,
    'opportunityLinksRemoved', opportunity_link_count,
    'sendAttemptsRemoved', send_attempt_count,
    'documentVersionsRemoved', document_version_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_quote(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_quote(TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_quote(TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_quote(TEXT, TEXT, JSONB) TO service_role;
