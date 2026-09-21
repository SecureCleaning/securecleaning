# Configurable menus and invoice directory

Base: `38964e00fe29d4a22ef8286870e998cd988bc1ba` (deployed commissions/payment-plan release).
Implementation worktree: `c349/securecleaning-codex-handoff-20260331-144602`.
Release owner: SC Deploy - Release coordination.

## Result

- Rounded Secure Cleaning green navigation labels, click/tap dropdown panels, Escape-to-close with focus return, ArrowDown-to-enter, outside-click dismissal, active page indicators and a collapsible mobile menu.
- Existing sticky wrappers and shared `useSiteHeaderHeight` are preserved. Long mobile menus scroll within the expanded menu.
- Owners open Settings > Menu configuration to arrange the shared admin layout and the shared agent layout independently. Links and groups can be reordered; groups created, renamed or removed; links moved between the top row, a group or Hidden. Live preview, reset, unsaved-change warning, save/reload and conflict protection are provided.
- Admin menu applies to admin users with role-filtered destinations; it is not a per-owner personal preference. Agent menu applies to all agents. Agents cannot edit layouts. Menu visibility never grants access.
- Invoices is a direct default link on both menus. Directory searches invoice number or purchaser, filters status, and returns pages of 25 invoices. This covers existing contract-sale invoices only.
- Invoice & payments opens the existing Product Sales invoice tab, selecting the matching invoice in the payment form. Selection hints cannot substitute for authorization or invoice/sale association checks. Existing payment confirmation, invoice generation and commission logic are unchanged.

## Storage, API and rollout

No migrations and no dependency changes. Existing deployed `site_content`, `admin_audit_log`, staff, product-sale, invoice and payment-allocation tables are required.

`site_content` key `navigation.menus` stores version 1 JSON with `admin` and `agent` layouts. Data contains only fixed catalog IDs, dropdown labels, order and hidden IDs. This table has public read RLS, so no user IDs, roles, secrets or sensitive business records are stored in the configuration. Normal application writes remain restricted to the service role through the owner-only API. The content editor already restricts writes to its own content key catalog.

- `GET /api/menu-settings`: active staff identity revalidation; returns only the current audience layout filtered to the actor's allowed destinations, role and linked assignee ID. Private/no-store.
- `GET /api/menu-settings?edit=1`: active owner only; returns both editable layouts, revision and recovery status.
- `PUT /api/menu-settings`: active owner only, same-origin guard, rate limit and 16 KiB payload limit. Validates bounded labels, fixed catalog IDs, single membership, groups and version. Owner configuration link cannot be hidden. Takes `{ config, revision }`; updates compare `updated_at`, first creation uses insert. Stale revisions or simultaneous creation return 409 without overwriting.
- Audit intent `menu.save_requested` is written strictly before each database mutation; audit failure prevents the write. It records the actor ID, not the layout. The intent event does not imply a save succeeded; failed/conflicting attempts also retain that event.
- `GET /api/admin/invoices?q=&status=all&page=0`: existing contract-product actor authorization; minimal invoice/purchaser/payment-total fields, private/no-store. Agent query restricts sale assignment, product assignment and product state before pagination, with defensive filtering afterward. Confirmed allocations determine paid totals and are themselves paginated to avoid REST row-limit truncation.
- New pages: `/admin/menus`, `/admin/invoices`, `/availability/invoices/[assigneeId]`.
- Additive sales selection parameters: `sale`, `invoice`, `tab=invoices`; existing `product` parameter remains supported. Agent login redirect preserves query selections. New workspace props are optional.

Defaults take effect without a settings write. First owner save creates the settings row. No live settings or invoice/payment data were changed during implementation. No quote-deletion/eligibility schema work is included. Do not import other tasks' `contractSales.ts` or `contractProducts.ts` edits into this release.

## Validation

- Type check: passed.
- Lint: passed without warnings.
- Tests: 329 passed, zero failures (includes focused menu/auth/conflict/audit/scope/deep-link tests).
- Production build: passed with local placeholder credentials (no production environment validation). Existing SWC minifier configuration warning remains.
- `git diff --check`: passed.
- Browser: development app and final production build against loopback-only synthetic Supabase responses; desktop 1280px and mobile 320px/375px. Verified click dropdown, ArrowDown focus, Escape focus return, menu group creation/link placement, save/reload, separate agent layout, no mobile horizontal overflow, admin invoice directory and invoice preselection, mismatched invoice rejection, agent invoice directory, anonymous invoice rejection, owner-only configuration mutation, agent invoice preselection, and stale saves returning 409. No browser page errors. Screenshots inspected.
- No real payment was recorded, no email sent, no production database accessed. Production Supabase relationship resolution and production save/reload remain release smoke checks; local query tests and fixtures do not replace those checks.

## Integration

Single GUI implementation owner. `ContractSalesWorkspace.tsx` changes are imports, optional initial selection props, selection refs/state and `load()` matching; no returned JSX, reserve-button or winning-quote-link edits. Quote Workflow may separately edit those nonoverlapping JSX areas. Keep its deletion/eligibility release separate.

## Exact file manifest

- `docs/handoffs/gui-menus-invoices-20260921.md`
- `src/app/admin/invoices/page.tsx`
- `src/app/admin/menus/page.tsx`
- `src/app/admin/sales/page.tsx`
- `src/app/api/admin/invoices/route.ts`
- `src/app/api/menu-settings/route.ts`
- `src/app/availability/invoices/[assigneeId]/page.tsx`
- `src/app/availability/sales/[assigneeId]/page.tsx`
- `src/components/admin/AdminNav.tsx`
- `src/components/admin/ContractSalesWorkspace.tsx`
- `src/components/admin/InvoiceDirectory.tsx`
- `src/components/admin/MenuConfigurationEditor.tsx`
- `src/components/availability/AvailabilityAgentNav.tsx`
- `src/components/navigation/ConfigurableNavigation.tsx`
- `src/lib/invoiceDirectory.ts`
- `src/lib/invoiceDirectoryPolicy.ts`
- `src/lib/menuConfiguration.ts`
- `src/lib/menuSettings.ts`
- `src/lib/menuSettingsAuth.ts`
- `src/lib/useNavigationMenu.ts`
- `tests/admin-clients-sites-consolidation.test.mjs`
- `tests/agent-portal-finalization.test.mjs`
- `tests/availability-agent-cleaners.test.mjs`
- `tests/contract-product-sales.test.mjs`
- `tests/menu-configuration.test.mjs`
- `tests/pricing-rooms-admin.test.mjs`

## Coordinated release correction: allocation ordering

The release coordinator's read-only production schema probe found that payment allocations have no `id` column. The original permissive local fixture did not validate requested ordering columns. Corrected the allocation query to order by the existing composite primary key, `payment_id` then `invoice_id`, confirmed in `supabase/contract_product_sales_migration.sql`.

The focused regression now checks that schema definition, rejects nonexistent ordering columns, and paginates 501 allocations with repeated payment IDs across two invoices. It reproduced error 42703 against the old query and passes with the corrected composite ordering, including both invoice totals.

Only `src/lib/invoiceDirectory.ts`, `tests/menu-configuration.test.mjs`, and this handoff document changed after the original freeze. No migration, API contract, dependency or UI changes. Prior desktop/mobile browser QA remains applicable; the schema probe and focused query regression cover this correction. Corrected candidate validation: type-check passed, lint passed, all 329 tests passed, production build passed, and git diff --check passed. The release coordinator also confirmed the corrected composite ordering passes its read-only production limit-zero schema probe. No production mutation was performed. The 26-file SHA256 manifest has been refreshed; all other 23 files remain byte-for-byte identical to the original frozen candidate.
