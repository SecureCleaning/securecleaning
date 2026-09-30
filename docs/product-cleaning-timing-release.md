# Product cleaning timing consistency

## Rollout

Apply `supabase/contract_product_timing_refresh_migration.sql` after the existing scope-refresh migration and before deploying the application. It replaces the protected refresh function, preserves its signature and service-role-only grants, and copies validated winning-quote timing into the product and scope atomically. No listing data is backfilled.

Deploy the product editor and update handler together. `timePreference` is an optional addition to the product update request; older callers retain the saved timing. Accepted values are business_hours, after_hours and weekend. Key access is independent and is never used to infer cleaning hours.

After deployment, correct C001012 through the authorised product editor: withdraw, select After hours (the supplied description permits evenings/weekends), save and publish. If its winning quote already contains the correct timing, Refresh from winning quote also copies it. Verify both /jobs and /jobs/C001012. Do not overwrite other products or infer timing by parsing free-text descriptions. Refresh replaces a manual product timing selection with the winning quote value.

No dependency changes. No SMS changes or sends. Existing public pages read the product timing; privacy projections remain unchanged. Historical published-version snapshots remain unchanged.

## Validation

Run the full type-check, lint, test, build and diff checks. Focused service tests verify timing/scope agreement, legacy callers, independent keyed access, validation and regional/stale/published mutation rejection. Run the disposable Postgres test with PGLITE_MODULE pointing to an installed PGlite module: `node tests/integration/contract-product-timing-postgres.mjs`. This checks migration replay, atomic refresh, function permissions and stale/published protections without contacting production.
