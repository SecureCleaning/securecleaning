-- Apply before the cleaner form release. NULL preserves the distinction between
-- not yet provided and an explicitly empty equipment list. Existing RLS is unchanged.
BEGIN;
CREATE FUNCTION public.valid_cleaner_machinery(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(value)<>'object' OR NOT (value ?& ARRAY['items','other','notes'])
   OR (value - ARRAY['items','other','notes']) <> '{}'::jsonb THEN RETURN false; END IF;
 IF jsonb_typeof(value->'items')<>'array' OR jsonb_typeof(value->'other')<>'string'
   OR jsonb_typeof(value->'notes')<>'string' THEN RETURN false; END IF;
 IF jsonb_array_length(value->'items')>5 OR length(value->>'other')>200 OR length(value->>'notes')>1000 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(value->'items') item WHERE item NOT IN ('"carpet_extractor"'::jsonb,'"multi_wash"'::jsonb,'"walk_behind_scrubber"'::jsonb,'"rotary_buffer"'::jsonb,'"other"'::jsonb)) THEN RETURN false; END IF;
 IF (value->'items') ? 'other' THEN RETURN length(trim(value->>'other'))>0; END IF;
 RETURN value->>'other'='';
END $$;
ALTER TABLE public.cleaners ADD COLUMN specialist_machinery jsonb
 CHECK (public.valid_cleaner_machinery(specialist_machinery));
COMMENT ON COLUMN public.cleaners.specialist_machinery IS 'Self-reported available specialist machinery; null = not provided, empty items = none. Saved via existing authorised cleaner workflows and audit log.';
COMMIT;
