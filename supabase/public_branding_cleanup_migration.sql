-- Remove placeholder and legacy public wording from editable content.
-- Run this migration in Supabase before relying on the updated defaults.

UPDATE site_content
SET content = CASE
  WHEN key = 'contact.email' AND content = 'info@securecleaning.au' THEN 'info@securecleaning.com.au'
  WHEN key = 'about.intro' THEN 'Secure Cleaning Aus delivers professional commercial cleaning services to businesses in Melbourne and Sydney through our trusted Owner-Operator network.'
  WHEN key = 'contact.phone' AND (content = '1300 000 000' OR content = '') THEN '1300 850 593'
  ELSE content
END
WHERE key IN ('about.intro', 'contact.email', 'contact.phone');
