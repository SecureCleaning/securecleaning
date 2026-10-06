# Optional product-sale follow-ups

The Follow up (optional) tab sits after Inspection. It is not a workflow step and adds no handover prerequisite. Sending requires a completed inspection and a non-cancelled sale; completed handovers remain eligible. History is readable for cancelled sales.

Templates: client first-clean check-in, issue follow-up, ongoing service check-in; cleaner performance feedback and positive feedback. Messages can be edited in the existing rich email editor. The server builds a signature from the active staff account and resolves the client or cleaner address from the sale's linked records. These are service communications, not marketing campaigns.

## Rollout

Apply `supabase/contract_sale_followups_migration.sql` after `contract_product_sales_migration.sql`, before deploying this code. It adds a service-role-only table with RLS enabled and no browser-role grants. Existing migrations for the application's product-sales workflow remain prerequisites. No dependencies are added. The Supabase CLI was unavailable in the implementation environment, so the SQL follows this repository's existing standalone migration convention.

The existing POST `/api/admin/contract-sales` endpoint gains `followup.history`, `followup.preview`, and `followup.send`. No existing request or response contract changes. Preview returns a fingerprint bound to the full rendered message, recipient, sale, audience, and sender. Send requires that fingerprint and a UUID requestId. History returns the latest 100 messages for the authorized sale.

Sending uses the existing email provider configuration (`RESEND_API_KEY`, `FROM_EMAIL`) and the active staff email for Reply-To. It writes an audit event and an immutable-by-application message snapshot before calling the provider. It does not write sale status, invoices, inspection state, or calendar events. No live emails were sent during implementation.

## Delivery recovery

A unique request ID prevents duplicate retries. A partial unique index allows only one pending/unknown send per sale and audience, including concurrent requests. Provider rejection is recorded as failed. Network failures, missing provider IDs, or failure to persist the delivery result remain pending/unknown and prevent another send to that audience.

An operator must reconcile pending/unknown outcomes against provider activity before changing the history record to sent (with provider ID) or failed (only after confirmed non-delivery). Do not clear uncertain outcomes merely to retry. After a confirmed failure, reload the tab or choose a template to create a fresh request ID. There is no automatic resend or in-app reconciliation action.

## Verification and remaining checks

Focused tests use mocked persistence/provider boundaries to exercise authorization calls, inspection gating, saved recipient selection, HTML sanitization, stale previews, idempotent retries, unknown delivery blocking and rejection history. The existing product-sale workflow test covers the new tab order.

Before rollout, apply the migration in a test database and verify browser-role denial and service-role access. In authenticated admin and regional-agent sessions, verify desktop/mobile layout, rich editing, recipient changes, preview, sending to controlled test addresses, history, wrong-region denial, and handover completion without any follow-up. Live database migration, authenticated browser checks, and real provider delivery were not performed in the implementation environment.

## Files changed for this feature

- `src/components/admin/ContractSalesWorkspace.tsx`: optional tab after Inspection.
- `src/components/admin/ContractSaleFollowup.tsx`: composer, recipient selection, preview and history.
- `src/lib/contractSaleFollowupTemplates.ts`: five editable starting templates.
- `src/lib/contractSaleFollowups.ts`: authorized preview, history and delivery handling.
- `src/lib/contractSales.ts`: export existing authorization/context helpers for reuse.
- `src/app/api/admin/contract-sales/route.ts`: three additional rate-limited actions.
- `supabase/contract_sale_followups_migration.sql`: history and duplicate-send protection.
- `tests/contract-sale-followups.test.mjs`: ten focused behavior tests.
- `tests/contract-product-sales.test.mjs`: expected tab order.
- `docs/product-sale-followups.md`: rollout and verification notes.

Existing unrelated uncommitted work was preserved. Manual source comparison confirmed handover and cancellation service code is unchanged from the starting workspace.

Validation result: `npm run type-check`, `npm run lint`, all 239 `npm test` tests, `npm run build`, and `git diff --check` passed. The first slow build was stopped; the cached retry completed successfully. Existing build warnings mention disabled SWC minification and stale Browserslist data; build configuration was not changed by this feature.

## Migration verification - 6 October 2026

Applied `contract_sale_followups` through the connected Supabase migration tool to the configured Secure Cleaning project (`qhqbthnpzsnnzfannvyl`). Verified the table starts empty, RLS is enabled, anon/authenticated SELECT and INSERT privileges are denied, service-role access is present, and both the history index and partial unique pending/unknown index exist. The security advisor's RLS-with-no-policy informational finding is intentional for this server-only table. Other existing database advisor findings were not changed by this migration.

Started the built app at `http://localhost:3100` with an ephemeral process-only local session secret; no environment files or production authentication settings were changed. Authenticated browser verification is waiting for staff sign-in. Live delivery verification is waiting for a user-selected controlled recipient. No emails have been sent during this verification yet, and the application has not been deployed.

Migration version: `20261006024641`. Unauthenticated GET and same-origin POST to the local product-sale API both returned 403 with `Product sale access required.` Use `localhost`, not `127.0.0.1`, for the local browser because the built server resolves the request origin against localhost. Browser automation disconnected while handing off sign-in; authenticated checks are still pending.

Existing advisor warnings concern mutable function search paths and GraphQL schema visibility on older tables, not the new follow-up table. References: [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous GraphQL visibility](https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed), [authenticated GraphQL visibility](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed).
