# Cleaner email and shared rich editor handover

Local candidate only. No deployment, production migration or email send performed for this feature. Prior separately authorized imported-cleaner approval is complete; do not repeat it. See cleaner-deletion-handover.md for deletion limitations.

## Behavior and ownership

Single implementation owner: Admin Improvements task. Restored the previously implemented shared rich editor selectively from the canonical checkout, preserving the newer CRM frequency, site link, quote workflow and agent privacy behavior. The shared RichEmailComposer provides lazy loading and a plain-text recovery fallback. Toolbar mouse-down preserves the selection; editor package styling is included.

Editable email bodies now use this component in ContractProductsWorkspace (broadcasts/templates), CleanersAdmin (individual/template), AgentCleaners, ClientCrmWorkspace, QuoteWorkflowEditor, ContractSalesWorkspace (invoice introduction), and the new CleanerEmailComposer. Future editable email bodies must use RichEmailComposer, retain server-side sanitization and authorization, and add their surface to tests/rich-email-composer.test.mjs. Generated transactional messages without an editable body remain generated.

Cleaners now has an Email cleaners composer for 1-50 registered addresses, a branded availability template, personalized server preview, review step and separate recipient copies. Staff/manager/owner only; approved and subscribed recipients only. Active sender profile and signature required. Eligibility is rechecked at claim. Durable request IDs and one-time database claims prevent resend on replay. Failed, skipped, pending and uncertain outcomes are distinct. Pending/uncertain sends require provider investigation; never automatically retry. Recipient addresses are not shared via CC. Existing individual/agent email eligibility is unchanged: rejected is not a global no-contact flag.

## Changed files and contracts

- Shared components: RichEmailEditor, RichEmailComposer, EmailPreviewModal, EmailMergeFieldPicker; richEmailContent, richEmailServer, emailMergeFields and broadcast token helpers.
- Seven composer surfaces above; cleaners admin page permission flags.
- CleanerEmailPolicy/Delivery and new POST /api/admin/cleaners/email actions preview/send/status. Send requires a request UUID and preview fingerprint.
- Existing cleaner, agent cleaner, CRM and product broadcast endpoints accept optional HTML/document content and preview fingerprints; existing text content remains supported. Quote send endpoints accept optional messageHtml/messageDocument. Contract-sales template accepts emailIntroHtml/emailIntroDocument.
- Corresponding cleaners, CRM, broadcast and contractSales libraries store sanitized rich snapshots. email.ts accepts sanitized quote-message HTML and exposes provider error name on EmailProviderRejectedError for conservative outcome classification.
- Focused tests, TS test loader and optional tests/integration/cleaner-email-postgres.mjs. No live test recipients.

## Database rollout

Review all forward migrations against target schema and apply before application release:

1. Existing cleaners, staff/audit, CRM, contract-product broadcast and invoice workflow prerequisites must already exist.
2. rich_email_composer_migration.sql adds nullable rich template and delivery snapshots.
3. invoice_email_rich_text_migration.sql adds invoice introduction HTML/document storage and HTML snapshot.
4. cleaner_email_delivery_migration.sql adds service-only batch ledger, one-time reserve/claim/finalize RPCs, delivery outcomes and availability template.
5. cleaner_permanent_deletion_migration.sql is the separate deletion feature; see its handover.

No production migration was run. Migration functions are service-only; existing app authorization is retained. Deletion retains batch/audit ledger but cascades cleaner email records. Existing protected commercial records block deletion.

## Dependencies and validation

Added @react-email/editor 1.7.7, sanitize-html 2.17.7, @types/sanitize-html ^2.16.1. Lockfile updated, including transitive dependencies. Recorded audits show 24 affected package entries at baseline and 23 in the candidate (1 critical, 14 high, 7 moderate, 1 low). All remaining entries are pre-existing with identical advisory sources, paths and versions; the ws update removes one high entry. See email-dependency-audit.md for exact paths, advisories, limitations and report provenance. No blanket dependency fixes made.

Browser manual verification used a temporary synthetic local harness, since removed: real shared editor text selection and Bold serialized to strong HTML; toolbar and cleaner composer reviewed at desktop and tablet sizes. No production authenticated end-to-end send or delivered inbox rendering was tested. Full authenticated coverage of every composer remains a release smoke-test requirement.

Disposable in-memory PostgreSQL checks passed: migrations applied twice; request replay; rejected/unsubscribed claim exclusion; one-time claims; unknown outcome no retry; anonymous RPC denial; deletion document/FK protection and audit rollback; retained batch ledger. These use synthetic prerequisite tables and do not replace target-schema migration review.

The following results cover the combined deletion and email candidate, superseding the earlier deletion-only 247-test checkpoint.

Final validation: npm run type-check PASS; npm run lint PASS; npm test PASS (262 tests); npm run build PASS with synthetic Supabase environment values; git diff --check PASS. Initial type check encountered stale generated types for the removed harness; regeneration resolved it. Initial build lacked required Supabase environment values; the final build used synthetic values. Build warnings include existing stale Browserslist data/SWC configuration. No release or inbox-delivery claim follows from these local results.

## Exact combined file manifest

Repository-relative paths below include both modified tracked and new candidate files, relative to baseline 6a1e346. Documentation-only reconciliation adds no new API, migration or dependency changes.

- `docs/cleaner-deletion-handover.md`
- `docs/email-composer-handover.md`
- `docs/email-dependency-audit.md`
- `package-lock.json`
- `package.json`
- `src/app/admin/cleaners/page.tsx`
- `src/app/api/admin/cleaners/[cleanerId]/email/route.ts`
- `src/app/api/admin/cleaners/[cleanerId]/route.ts`
- `src/app/api/admin/cleaners/email/route.ts`
- `src/app/api/admin/client-crm/route.ts`
- `src/app/api/admin/contract-products/route.ts`
- `src/app/api/admin/contract-sales/route.ts`
- `src/app/api/admin/quotes/[ref]/send/route.ts`
- `src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/email/route.ts`
- `src/app/api/availability-agent/[assigneeId]/quotes/[ref]/send/route.ts`
- `src/components/admin/CleanerEmailComposer.tsx`
- `src/components/admin/CleanersAdmin.tsx`
- `src/components/admin/ClientCrmWorkspace.tsx`
- `src/components/admin/ContractProductsWorkspace.tsx`
- `src/components/admin/ContractSalesWorkspace.tsx`
- `src/components/admin/EmailMergeFieldPicker.tsx`
- `src/components/admin/EmailPreviewModal.tsx`
- `src/components/admin/QuoteWorkflowEditor.tsx`
- `src/components/admin/RichEmailComposer.tsx`
- `src/components/admin/RichEmailEditor.tsx`
- `src/components/availability/AgentCleaners.tsx`
- `src/lib/cleanerAdminAuth.ts`
- `src/lib/cleanerEmailDelivery.ts`
- `src/lib/cleanerEmailPolicy.ts`
- `src/lib/cleaners.ts`
- `src/lib/clientCrmData.ts`
- `src/lib/clientCrmEmail.ts`
- `src/lib/clientCrmPolicy.ts`
- `src/lib/contractProductBroadcastTemplateTokens.ts`
- `src/lib/contractProductBroadcastTemplates.ts`
- `src/lib/contractProductBroadcasts.ts`
- `src/lib/contractSales.ts`
- `src/lib/email.ts`
- `src/lib/emailMergeFields.ts`
- `src/lib/richEmailContent.ts`
- `src/lib/richEmailServer.ts`
- `supabase/cleaner_email_delivery_migration.sql`
- `supabase/cleaner_permanent_deletion_migration.sql`
- `supabase/invoice_email_rich_text_migration.sql`
- `supabase/rich_email_composer_migration.sql`
- `tests/cleaner-admin-security.test.mjs`
- `tests/cleaner-deletion.test.mjs`
- `tests/cleaner-email-delivery.test.mjs`
- `tests/client-crm-foundation.test.mjs`
- `tests/contract-product-broadcast-preview.test.mjs`
- `tests/integration/cleaner-email-postgres.mjs`
- `tests/rich-email-composer.test.mjs`
- `tests/ts-loader.mjs`
