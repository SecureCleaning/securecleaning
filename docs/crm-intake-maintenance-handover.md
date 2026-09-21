# CRM intake maintenance - 21 September 2026

Candidate in Misc Issues worktree e018, based on deployed 33a8cc3. Not committed or deployed. No production records changed.

## Changes and ownership

- src/components/admin/ClientCrmWorkspace.tsx: optional business name on creation/profile; contact-name list fallback; region initialized and reset from authenticated workspace default; agents cannot change region; owner/manager without a linked region selects it explicitly. Reuse LocalityAutocomplete in creation and site details, with manual suburb/postcode correction retained.
- src/lib/clientCrmData.ts: allow blank business names, expose defaultCity, default an omitted city from the authenticated active availability assignee, preserve explicit valid city, validate known postcode/state pairs. Existing role and self-assignment checks remain.
- src/lib/clientCrmAssignment.ts: active assignee region lookup.
- src/lib/clientCrmLocation.ts: postcode/state validation against existing local catalogue. Unknown catalogue entries retain manual-entry compatibility; not a new coverage guarantee.
- supabase/client_crm_optional_business_name_migration.sql: replacement of latest update_client_crm_profile, allowing blank business names. Names are stored as empty strings, not invented placeholders. Existing function signature, authorization, optimistic concurrency, contact/site handling, audit and execute grants preserved.
- tests/client-crm-intake.test.mjs: six tests for defaults, missing/inactive links, catalogue locality/state, creation and profile blank/whitespace/named business values, region rejection, role rejection, stale writes and migration preservation.
- tests/client-crm-foundation.test.mjs: update existing expectations for optional business names and shared locality control.
- This handover.

## Rollout

Apply client_crm_optional_business_name_migration.sql after client_crm_missing_site_profile_migration.sql and before application rollout. Existing NOT NULL columns accept empty strings; no table, RLS, dependency or environment changes. Migration is transactional and repeatable. It was reviewed against the prior migration, not executed against a database in this task. Release owner must validate it in a safe database and confirm deployed function lineage before applying.

API addition: GET /api/admin/client-crm returns defaultCity: 'melbourne' | 'sydney' | null. Existing city input remains supported; a missing city can resolve from the authenticated assignee, never from a different agent. Business name is optional in create/profile writes. Contact name, email, and create postcode remain required. Keep the selector: existing routing, locality search and site identity depend on service region. Owner/manager automatic agent suggestions continue to use postcode coverage. Existing conflicting contact details still require reconciliation; blank business names do not bypass identity/ownership checks.

No automatic conversion of existing dot/placeholder business names. No live email, calendar, customer record, or deployment writes.

## Verification

- npm run type-check: passed.
- npm run lint: passed, no lint warnings/errors.
- npm test: 312 passed.
- npm run build: passed with synthetic Supabase environment values; inherited SWC/Browserslist warnings.
- git diff --check: passed.
- Local Chrome with synthetic intercepted CRM/locality responses: NSW agent default/locked region, blank business submission, locality selection filling suburb and postcode, new-form reset retaining Sydney, owner explicit region selection, and 1024px tablet layout passed. Screenshot reviewed. Temporary fixture route removed.
- Live authenticated save/reload and database migration execution not performed. SQL authorization/concurrency preservation checked by exact comparison to prior function, and server error handling exercised with synthetic responses.
