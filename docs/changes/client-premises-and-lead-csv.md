# Client premises types and lead CSV

Implementation baseline: production commit 55df7f29e8de3cfd83e1322d4f9397371f5771ab, verified against the Ready deployment aliased to securecleaning.com.au. This feature is not yet deployed.

## User workflow

- Select Industry / premises type when creating an opportunity or editing Client and site details. The value belongs to the site, using the existing premises_type field. Other requires a description.
- Administrators manage labels and active options under Client CRM > Templates. Existing selections survive deactivation. Codes remain stable. The site editor uses the same catalog.
- Use <<industry>> in client, inspection, quote and cleaner email editors and invoice wording; SMS supports it too. A linked site's label or Other description is substituted. Standalone cleaner messages without site context render it blank. Product broadcasts use their selected product types.
- Client CRM > Import / export client leads provides a header-only CSV template, export and import preview. Required fields and source details are explained in the panel. Maximum 200 rows / 500 KB. Preview validates rows before import. Imports create leads without sending email or SMS and never overwrite existing contacts. Existing emails require review in CRM instead. Agent exports and imports retain assignment/region restrictions.
- Successful import rows are remembered per staff member and normalized row content. Retrying an interrupted file does not recreate those opportunities. Changed rows are validated as new input. Partial failures are shown explicitly.

## Data and API changes

Apply supabase/migrations/20261019045622_client_premises_catalog_and_lead_csv.sql BEFORE deploying application code. It seeds crm_premises_types, converts sites.premises_type to catalog-backed text, adds premises_type_other, and adds an import replay ledger. No customer messages are sent by the migration. Existing category codes are preserved. Quote pricing retains its original supported enum: new custom site types map to Other for a new quote draft.

New service-role-only RPCs wrap existing CRM create/profile transactions and save catalog settings with concurrency checks and audit records. New tables deny direct browser access. Existing create/profile RPCs remain available to old callers during rollout.

/api/admin/client-crm supports GET premises=1 and csv=template|export, plus POST premises.save, csv.preview and csv.import. The shared authenticated endpoint retains origin checks, permissions and rate limiting. Site payloads add premisesTypeOther and accept configured category codes.

Changed areas: client CRM/site components and APIs; premises catalog and CSV helpers; client/profile/inspection/product/invoice/quote email and SMS industry substitution; quote-draft premises fallback; focused tests and isolated PostgreSQL migration fixture. No application dependencies or environment variables added. PGlite was installed only in /tmp/sc-premises-db-test for local migration tests.

## Validation and release checks

The isolated PostgreSQL test exercises the actual legacy CRM functions plus this migration: creation, profile updates, Other, partial-site creation, atomic rollback, import retries, stale edits, catalog permissions and browser-role denial.

Run npm run type-check, npm run lint, npm test, npm run build and git diff --check. Migration test command: PGLITE_MODULE=/tmp/sc-premises-db-test/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/client-premises-postgres.mjs.

Authenticated browser acceptance remains required before release: create/edit an industry, rename/deactivate a catalog option, preview a template, preview/import a small synthetic CSV and retry it, export as an agent and administrator. No live customer writes or sends were performed. Production migration remains for release coordination. Export can include historical/incomplete records that intentionally fail new-lead validation; it is not an automatic update/import mechanism.

Local results (19 October 2026): 607/607 tests passed with local listener permission; TypeScript and lint passed; isolated PostgreSQL fixture passed; git diff --check passed. Build validation uses harmless placeholder public Supabase URL/key because this checkout has no deployment environment file.
Final production build also passed (exit 0). Authenticated visual checks and production migration are still pending.
