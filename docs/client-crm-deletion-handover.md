# Client CRM deletion handover

## Scope

Add an owner-only, review-before-delete workflow for a complete CRM customer chain. The workflow removes the selected organisation's opportunities, contacts, sites, intake leads, notes, communications, and explicitly selected bookings in one transaction. It writes a restricted archive and audit entry before deletion.

## New-only integration manifest

- `src/lib/clientCrmDeletion.ts`
- `src/app/api/admin/client-crm/[opportunityId]/deletion/route.ts`
- `src/components/admin/DeleteClientCrmButton.tsx`
- Narrow import and owner-only button hunk in `src/components/admin/ClientCrmWorkspace.tsx`
- `supabase/client_crm_deletion_migration.sql`
- `tests/client-crm-deletion.test.mjs`
- `tests/integration/client-crm-deletion-postgres.mjs`

The source worktree is based on `33a8cc335b00b242993d493d28e61238faf8dbb2`. Integrate only the files and narrow hunk above onto current main. Do not copy the source worktree's other dirty files; those are previously released CRM and sticky-navigation changes.

## Migration and release order

1. Integrate the new-only manifest onto current main.
2. Run the complete current-main validation suite and the PGlite integration test.
3. Apply `supabase/client_crm_deletion_migration.sql` to production.
4. Deploy the application routes and UI.
5. Verify an owner can load a deletion preview and that manager/agent sessions cannot access it.
6. Delete only the frozen, unambiguous test client chains using fresh production previews.

The migration depends on the CRM foundation, CRM profile notes, contract products/sales, audit log, and owner quote deletion migrations already present in production.

## Security and data contract

- API: `GET` and `DELETE /api/admin/client-crm/[opportunityId]/deletion`.
- Both methods require a signed, active owner account. The mutation also applies same-origin and payload-size protection.
- The preview returns dependency counts, blockers, an exact email confirmation value, and a token bound to exact record identities and mutable booking/email delivery state.
- The delete RPC re-locks the active owner, organisation, CRM parents, bookings, intake links, notes, communications, quotes, products, and sales before regenerating the preview.
- Linked quotes, products, product sales, booking sales, ratings, unresolved email deliveries, cross-client links, and incoming references from outside the selected chain block deletion.
- Bookings and sent CRM email history require an explicit owner override. Deleted rows are copied into `client_crm_deletion_archive` before deletion.
- The archive grants `service_role` only `SELECT` and `INSERT`. Browser roles have no table or function access.

## Validation evidence

- `npm test`: 315 passed on the source baseline.
- `npm run type-check`: passed.
- `npm run lint`: passed with no warnings.
- Environment-backed `npm run build`: passed.
- `PGLITE_MODULE=/private/tmp/sc-crm-dbtest/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/client-crm-deletion-postgres.mjs`: passed.
- Integration coverage includes repeatable migration, archive/audit atomicity, dependency rollback, quote/product/sale/booking-sale/rating/in-flight-email blockers, stale same-count relationship swaps, active-owner revalidation, cross-client and incoming site/opportunity/lead references, anonymous denial, and exact archive grants.

## Production cleanup evidence

Sixteen explicitly marked test quotes were deleted through the existing `admin_delete_quote_with_override` RPC, and a read-back found zero of those references remaining. The deletion archive and existing linked-record retention behavior were preserved.

After this release, seven unambiguous test organisations are eligible for cleanup. The expected removal is seven clients, nine sites, eleven opportunities, five bookings, and their linked intake/communication/note rows. Each deletion must use a fresh preview; final production counts take precedence over this estimate.

## Protected records

- Preserve `SC-20260319-VX6G` (`mik franchise`, `smith`, `lylesincl@gmail.com`) and its organisation chain until the user explicitly confirms it is test data.
- Preserve the Seven Room Product Workflow Test organisation because its retained product and two sales include one invoice and two agreement records. Do not weaken or bypass the financial-history blockers.
