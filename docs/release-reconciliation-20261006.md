# Reconciled release - 6 October 2026

GitHub main was fast-forwarded from 2cc6bfe to the verified production d5a6eff before integrating pending work. The integration uses the current Next.js 15/security baseline, not the older dirty Playground checkout. Original checkouts remain untouched.

## Included work

- Optional product-sale Follow up tab: client/cleaner templates, preview, staff signature, retained history, idempotent sends, and unresolved-delivery blocking.
- Invoice email archival for both document bundles and invoice-only resends, authorized history viewer, and an in-page current PDF preview. Current paid balances, bank revisions, rich introduction, reply-to routing, and existing send-state checks remain intact. Archived emails retain attachment names, not historical PDF bytes. Earlier unarchived sends cannot be reconstructed.
- Agent cleaner sent-email viewer with the retained recipient and HTML snapshot, within existing region authorization.
- Admin quote Location column with suburb/postcode and city fallback.
- Private/no-store headers for admin and agent pages.
- Email SDK transport/application failures remain uncertain instead of being classified as definitive rejection, preventing automatic retry after ambiguous outcomes.

## Database and API

Both `contract_sale_followups` and `contract_sale_invoice_email_deliveries` already exist in production. Verified columns, indexes, invoice-history immutability trigger, RLS, denied anon/authenticated SELECT, and service-role access. No production SQL changes are required for this release.

`contract_sale_followups_migration.sql` is retained in Git to reconcile the previously applied migration (history version 20261006024641). `contract_sale_invoice_preview_history_migration.sql` is the historical, previously applied invoice-history migration recovered from the old checkout. Do not rerun the historical invoice migration on an existing database: later bank/payment-term snapshot migrations supersede parts of it. New environments must apply historical migrations in dependency order, with later bank revisions/rich text protections afterward.

The existing authenticated contract-sales POST endpoint adds `followup.history`, `followup.preview`, `followup.send`, and `invoice-email.preview`. Workspace invoice records add `emailDeliveries`; agent email history adds retained HTML and recipient. No dependencies changed.

## Validation and limits

Validation passed: npm run type-check, npm run lint, all 477 tests, npm run build with the existing production environment, and git diff --check. Vercel React best-practices review completed. Focused tests cover archival failure before provider dispatch, archived/rendered content parity, invoice/sale authorization, ambiguous provider outcomes, follow-up authorization, stale previews and repeat sends. No real email/SMS delivery or business-record modification is part of verification.

Old dirty worktrees contain superseded or duplicate work and remain preserved. They are not authoritative release sources. Release from reconciled GitHub main going forward.
