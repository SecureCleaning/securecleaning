# Owner quote deletion and complete quote directory

Status: implemented locally on deployed baseline 38964e0. No live deletion, production migration, commit or deployment performed.

The owner dashboard previously loaded only 20 quotes, while the regional directory loaded up to 500. This explains older quotes missing from the owner table; it does not establish that any specific quote had previously been deleted. The owner loader now reads successive database pages and the UI provides search and 25-row pagination. Quote-load failures no longer silently render an empty directory. Owner and agent directories refresh on focus/visibility and every 30 seconds while visible. A successful deletion removes the shared quote record, including access through direct quote routes after refresh.

The owner confirmation now requires an explicit keep/delete choice when product/sale records exist, an override acknowledgement for linked/accepted/sent quotes, a reason and exact typed reference. Uploaded storage objects are never deleted. The server rejects stale previews and in-progress email sends. Existing clients, bookings and CRM opportunities are retained, with quote links removed.

Keeping linked records detaches their quote foreign key, preserves `deleted_source_quote_ref`, and retains their existing financial/scope snapshots. Product scope refresh reports that its source quote was deleted. Saved products can still create sales; the insert trigger inherits the historical reference. Retained sale document generation uses that reference; dead quote navigation links are suppressed.

Deleting linked records removes eligible sales, product broadcast links, products, their versions and interest records atomically. Sales with invoices, payments, allocations, plans, inspections, agreements/document references, commission assignments or site handovers cannot be removed. The UI identifies those dependencies and permits deleting the quote while keeping these records instead. Immutable commission/history protections are retained. Unknown restrictive foreign keys fail the transaction safely.

A service-role-only `quote_deletion_archive` stores the deleted quote, quote document versions, delivery attempts and affected product/sale/version/interest/broadcast snapshots. Normal application audit stores owner attribution, reason, chosen mode and counts. Archive records have no foreign key back to the deleted quote and are not exposed to public or agent APIs. No uploaded-file cleanup job is created.

## Files changed

- `src/lib/adminDashboard.ts`, `src/lib/dashboardQuotes.ts`, `src/components/admin/AdminDashboard.tsx`: complete owner quote directory, search and pagination.
- `src/lib/useQuoteListRefresh.ts`, `src/components/availability/AgentQuoteDashboard.tsx`: stale list refresh; owner component also uses the hook.
- `src/lib/quoteDeletion.ts`, `src/app/api/admin/quotes/[ref]/deletion/route.ts`, `src/components/admin/DeleteQuoteButton.tsx`: reviewed, owner-only deletion choices and safe errors.
- `src/lib/contractProducts.ts`, `src/lib/contractSales.ts`: retained source handling only; no financial calculation changes.
- `supabase/owner_quote_deletion_override_migration.sql`: forward migration, restricted archive, preview/delete RPCs, retained-reference trigger and narrowly amended latest sale-snapshot trigger.
- `tests/admin-quote-deletion.test.mjs`, `tests/dashboard-quotes.test.mjs`, `tests/quote-deletion-override.test.mjs`, `tests/integration/quote-deletion-postgres.mjs`: regression/security/database checks.

## Contracts and rollout

Apply `owner_quote_deletion_override_migration.sql` after the existing quote deletion, document bundle workflow and commission/payment-plan migrations, before releasing the application changes. It is transactional and repeatable; it does not delete existing data. It makes `source_quote_id` nullable on products/sales and adds `deleted_source_quote_ref`. Existing foreign-key restrictions remain in place. The sale snapshot trigger is derived from the latest `contract_sale_document_bundle_workflow_migration.sql`, preserving draft-price editing and finalisation rules.

The deletion GET now calls `admin_preview_quote_deletion`. DELETE additionally requires `linkedRecords: keep|delete`, `override: boolean` and the preview's `previewToken`. Actor identity comes only from the signed owner session. The old strict RPC remains available for compatibility; the application uses `admin_delete_quote_with_override`. Deploy migration and application together before using the new keep-records option; older application versions do not handle detached quote sources.

No package/dependency changes. No storage/RLS policy relaxation. No emails or calendar actions are initiated by deletion. Existing external calendar invitations are not recalled; a linked inspection prevents sale-record removal.

## Validation

- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: 322 passed.
- `npm run build`: passed using local placeholder Supabase environment values.
- `git diff --check`: passed.
- `PGLITE_MODULE=/tmp/sc-crm-dbtest/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/quote-deletion-postgres.mjs`: passed, using a disposable PostgreSQL-compatible database with representative schema/foreign keys. Covers repeatable migration, role restrictions, stale previews, rollback, all retention dependencies, source detachment and inherited reference, document/storage preservation, existing draft-price behavior and in-flight send blocking.
- Browser manual: local mocked confirmation UI, missing-choice disabled state, delete-records submission, financial-history reason display, keep-records submission, scrollable styled dialog. Fixture does not connect to production.

Remaining release checks: apply migration in the coordinator's staging/schema environment; verify actual owner and Melbourne agent pages after release with an explicitly designated disposable quote. No particular production test quote was investigated via live audit history or deleted. Large directories still load all owner quote metadata server-side before client pagination. Agent list's existing 500-row cap is unchanged.

## Combined release authorization

The subsequent user request authorizes deployment with the sale-start eligibility repair; see `sale-start-eligibility-handover.md`. No live record deletion or reservation is authorized. The combined suite contains 324 passing tests. ContractSalesWorkspace additionally hides empty quote navigation links for retained sales.

Independent review added current-account verification: GET and DELETE reuse the existing CRM actor resolver to reject deactivated, removed, renamed or demoted owner sessions. The deletion RPC independently locks and verifies the current active owner account, preventing concurrent revocation from racing deletion. Focused API and database regression tests cover this.
