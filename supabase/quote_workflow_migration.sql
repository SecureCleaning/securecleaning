-- Secure Cleaning - quote inspection / firm quote workflow extension

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS inspection_report JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS firm_quote_workflow JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN quotes.inspection_report IS
  'Structured site inspection worksheet notes linked to the original remote quote.';

COMMENT ON COLUMN quotes.firm_quote_workflow IS
  'Editable firm quote draft derived from the original remote quote after inspection.';
