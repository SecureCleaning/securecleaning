-- Restrict final quote send-attempt records to trusted server-side callers.

REVOKE ALL PRIVILEGES ON TABLE public.quote_send_attempts FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.quote_send_attempts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.quote_send_attempts FROM authenticated;
GRANT ALL PRIVILEGES ON TABLE public.quote_send_attempts TO service_role;
