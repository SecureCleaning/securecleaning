# Opportunity cleaning preferences

Ready implementation in Quote Workflow checkout `/Users/lyle/.codex/worktrees/23c4/securecleaning-codex-handoff-20260331-144602`.

Baseline: verified Ready production `778bb1e03ed7d448063ab2ff9fdd2752ea895473` / `dpl_EJwoCUikikPwJ395NcqYrfGLxd7g`, safely fast-forwarded from d7fe559 while preserving this feature. No deployment requested in this feature turn. Editing complete; release through coordinator only.

## Behavior

- New Opportunity (shared admin/agent workspace) offers optional cleaning frequency and cleaning time preference, initially After hours.
- Frequency can remain unspecified at creation. Inspection booking then requires an explicit choice instead of silently assuming Weekly.
- Saved selections prefill inspection booking. Existing linked quote or scheduled inspection preferences take precedence over intake defaults.
- CRM quote creation uses saved opportunity preferences when there is no booking preference, with After hours as the absent-time fallback. The existing Weekly estimate fallback for a quote with no known frequency is unchanged; inspection booking no longer silently uses that fallback.
- Cleaning time is separate from the inspection appointment's start time; the latter is unchanged.
- No existing customer records, appointments, messages, or open browser forms were changed.

## Files and contract

- `src/components/admin/ClientCrmWorkspace.tsx`: opportunity fields and appointment defaults/required frequency choice.
- `src/lib/crmCleaningPreferences.ts`: allowed values and preference resolution.
- `src/lib/clientCrmData.ts`: validates creation, sends optional preferences through existing transactional RPC, reads preferences into authorized workspace results. Linked quote query reads only required preference JSON scalars.
- `src/lib/clientCrmQuoteDraft.ts`, `src/lib/clientCrmQuotes.ts`: opportunity-to-quote defaults.
- `tests/crm-cleaning-preferences.test.mjs`, `tests/client-crm-intake.test.mjs`: defaults, selection persistence payload, validation, preserved booking overrides.
- `tests/integration/client-premises-postgres.mjs`: real database create/profile functions plus new migration; persistence, invalid-value rollback, retry behavior, old-caller defaults, restricted roles.
- `supabase/migrations/20261027025310_opportunity_cleaning_preferences.sql`: APPLY BEFORE application. Adds nullable constrained `cleaning_frequency` and `cleaning_time_preference` to crm_opportunities; replaces current save_crm_record_with_premises with narrowly extended create transaction. Signature, invoker security, service-role-only grants, profile checks, import idempotency unchanged. Existing rows remain null. Older callers still work.

API: optional `cleaningFrequency` / `cleaningTimePreference` on opportunity.create; workspace supplies resolved optional fields of the same names. No booking API signature change. No environment/dependency changes.

## Validation

- Full npm test: 651/651 passed. Run with local network permission for the existing loopback transport test.
- Type-check, lint, production build, git diff --check passed.
- Isolated PGlite migration test passed, using actual repository legacy create/profile functions. No production writes.
- First parallel type-check/build attempt raced generated Next types; repeated type-check after build passed. Not an application failure.
- Browser verification of new forms remains for post-migration preview/release. No live browser form or customer submission used for testing.

## Release checks

Review/apply migration, deploy app, use a separate authorized test record to confirm optional/new selections survive reopen and prefill booking for admin and agent. Verify leaving frequency unspecified blocks booking until selected and an existing Business hours/Weekend preference stays selected. Never send real customer notifications as a smoke test.
