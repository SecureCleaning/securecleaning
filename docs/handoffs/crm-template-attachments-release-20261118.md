# CRM template PDF attachments release

Baseline: ea606a61e09ddc5a4073e39f95bc58993b17bf98, independently verified on the production alias.

Integrated the completed Misc Issues patch. Owners/managers can upload private PDFs and select up to three per template version (10 MB each, 20 MB total). Preview and send bind attachment IDs and hashes; send rechecks content. Existing quote attachments remain supported. Sending stays manual.

## Applied migrations

- Repository `20261118004956_crm_template_attachments.sql` applied as DB history `20261118041905`, name `crm_template_attachments`.
- Repository `20261118042001_crm_template_attachment_indexes.sql` applied as DB history `20261118042013`, name `crm_template_attachment_indexes`.
- Do not replay based only on timestamp differences.

Verified private PDF-only bucket with 10 MB object limit, RLS on both new tables, service-role-only table/function privileges, communication attachment snapshot, and supporting indexes. Advisors report no new warning-level findings. New no-policy RLS informational findings are intentional for service-only tables; unused-index findings are expected before use. Existing unrelated advisor findings remain.

Validation: 856 tests passed; type-check, lint, isolated production build and diff checks passed. The follow-up migration adds indexes only; verified resulting index definitions and reran performance advisors.

No dependency or environment changes. API additions are authenticated upload creation/finalization and version-bound PDF retrieval, plus additive attachment metadata. Production upload/send tests are intentionally excluded; verify the editor read-only after deployment.
