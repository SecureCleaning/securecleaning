# Editable final quote email templates

Baseline: verified live 7c96417d21b164513014dfd41781000cae215fc3. Release authorized by user; migration applied before deployment.

Owners/managers can edit the reusable subject and rich-text message under Admin > Quotes > Quote email template, including when existing quotes are already sent. Agents can use the default and personalise individual final quote emails. Opening a published unsent quote uses Edit quote email; unpublished quotes retain the explicit Prepare final quote & email publishing step. Existing duplicate-send locks remain. The template is loaded into a new composer once; Replace message with saved template explicitly replaces local edits. Saving defaults affects future drafts, not prior sent emails or open drafts.

Protected content remains server-built: recipient/routing, prices, quote/scope links, validity and terms PDF. Preview now displays a clickable terms PDF. No customer email sends, customer writes or production template writes were performed.

Apply supabase/migrations/20261116093000_quote_email_templates.sql before deploying. Private RLS-enabled singleton table; only service role has table grants. API GET requires an active authorized staff account; POST requires owner/manager plus same-origin and payload-size guards, rich-content validation/sanitization and audit logging. New API /api/quote-email-template; existing quote send API unchanged. No new dependencies or environment variables.

Regression tests cover merged/escaped values, subject/message limits and agent denial. Runtime migration verification and authenticated browser editing remain release checks; do not create customer test records or send emails.

Validation: all 846 tests, type-check, lint, production build and whitespace checks passed. No dependencies changed.

Production migration mapping: repository 20261116093000_quote_email_templates.sql applied through connector as DB history 20261116094925, name quote_email_templates. Do not replay based only on timestamp differences.
