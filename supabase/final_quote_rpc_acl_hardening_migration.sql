-- Restrict final quote workflow RPCs to trusted server-side callers.
-- Function ownership and owner privileges are unchanged by these grants.

REVOKE ALL PRIVILEGES ON FUNCTION public.claim_final_quote_send(UUID, TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.claim_final_quote_send(UUID, TEXT, JSONB, TEXT, INTEGER) FROM anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.claim_final_quote_send(UUID, TEXT, JSONB, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_final_quote_send(UUID, TEXT, JSONB, TEXT, INTEGER) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.finalize_final_quote_send(TEXT, UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.finalize_final_quote_send(TEXT, UUID, INTEGER, TIMESTAMPTZ) FROM anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.finalize_final_quote_send(TEXT, UUID, INTEGER, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_final_quote_send(TEXT, UUID, INTEGER, TIMESTAMPTZ) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.reconcile_final_quote_send(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.reconcile_final_quote_send(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.reconcile_final_quote_send(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_final_quote_send(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) TO service_role;
