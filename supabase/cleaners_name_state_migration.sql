-- Secure Cleaning - Cleaner first/surname and Australian state support

ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS state TEXT;

UPDATE cleaners
SET
  first_name = COALESCE(
    NULLIF(first_name, ''),
    CASE
      WHEN contact_name IS NULL OR BTRIM(contact_name) = '' THEN NULL
      WHEN POSITION(' ' IN BTRIM(contact_name)) = 0 THEN BTRIM(contact_name)
      ELSE BTRIM(SUBSTRING(BTRIM(contact_name) FROM 1 FOR LENGTH(BTRIM(contact_name)) - POSITION(' ' IN REVERSE(BTRIM(contact_name)))))
    END
  ),
  last_name = COALESCE(
    NULLIF(last_name, ''),
    CASE
      WHEN contact_name IS NULL OR BTRIM(contact_name) = '' THEN NULL
      WHEN POSITION(' ' IN BTRIM(contact_name)) = 0 THEN ''
      ELSE BTRIM(RIGHT(BTRIM(contact_name), POSITION(' ' IN REVERSE(BTRIM(contact_name))) - 1))
    END
  )
WHERE first_name IS NULL OR last_name IS NULL;

DROP INDEX IF EXISTS idx_cleaners_search;
CREATE INDEX IF NOT EXISTS idx_cleaners_search ON cleaners
  USING GIN (
    to_tsvector(
      'simple',
      COALESCE(business_name, '') || ' ' ||
      COALESCE(first_name, '') || ' ' ||
      COALESCE(last_name, '') || ' ' ||
      COALESCE(contact_name, '') || ' ' ||
      COALESCE(email, '') || ' ' ||
      COALESCE(phone, '') || ' ' ||
      COALESCE(alternate_phone, '') || ' ' ||
      COALESCE(suburb, '') || ' ' ||
      COALESCE(postcode, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(state, '') || ' ' ||
      COALESCE(abn, '')
    )
  );
