-- Optional staff attribution; existing cleaners remain unclassified.
-- Empty business names preserve the existing non-null text API contract.
ALTER TABLE public.cleaners ALTER COLUMN business_name SET DEFAULT '';
ALTER TABLE public.cleaners
  ADD COLUMN lead_source text,
  ADD COLUMN lead_source_details text,
  ADD CONSTRAINT cleaners_lead_source_check CHECK (
    lead_source IN ('gumtree', 'referral', 'relationship', 'telemarketing', 'website', 'social_media', 'other')
  ),
  ADD CONSTRAINT cleaners_lead_source_details_check CHECK (char_length(lead_source_details) <= 1000);

COMMENT ON COLUMN public.cleaners.lead_source IS 'Optional internal cleaner acquisition source, maintained by staff.';
COMMENT ON COLUMN public.cleaners.lead_source_details IS 'Optional internal source details such as referrer or advert link; excluded from cleaner-facing profiles.';
