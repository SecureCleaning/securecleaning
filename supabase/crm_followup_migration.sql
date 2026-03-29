-- Secure Cleaning - CRM follow-up state extension

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;
