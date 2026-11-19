# Cleaner optional business name and source

## Request and baseline

The admin Create Cleaner form rejected an empty business name, so the user entered a full stop as a workaround. The requested minimum is first name, mobile and email, with an optional way to record sources such as Gumtree, referrals and relationships.

Owner checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Started clean on `2d14ac9097a8cce8ed033bd5e13ff2b08d51d5e0`, matching fetched main and independently verified READY production `dpl_Gyau2wSeb4xQzzMNfHxXQmWYb9ic`. Vercel alias inspection and build logs verified the source commit. The connector lacked scope access, so the authenticated Vercel CLI provided the evidence.

The initial handoff was readiness only. On 19 November the user requested: "send to sc deploy for implmentation". This authorizes SC Deploy to integrate, migrate, commit and deploy under the standing project-wide release policy. No production records were changed and no emails/SMS were sent by this feature task.

## Behavior

- Admin and regional-agent cleaner creation require only first name, valid email and nonblank mobile. Business name and surname are optional in both the UI and server validation. Names are derived from the supplied personal name when no business is provided.
- Partial staff updates preserve omitted identity fields and reject attempts to clear a required field. A business name can be cleared normally; no placeholder is needed.
- Staff cleaner records now have optional **Cleaner source** and **Source details** fields. Choices: Gumtree advertisement, Referral, Existing relationship, Telemarketing company, Website enquiry, Social media, Other. Details are limited to 1,000 characters. Staff can leave either field unrecorded or clear it later.
- Source fields round-trip through admin and region-authorized agent detail APIs. Existing authorization and audit calls remain in place.
- CSV export includes `lead_source` and `lead_source_details`. Import accepts source codes or displayed labels. Blank/omitted source, source details and business name do not erase those existing values during CSV updates; clear them using the record editor. Invalid source values and missing required details are reported per row.
- Cleaner self-service update/registration accepts blank business name and surname and requires mobile, so it stays compatible with records created by staff. Registered email remains token-bound, and the existing valid-state requirement and approval routing remain intact. Registration notification display falls back to the personal name. Internal source information is neither exposed nor writable through the self-service payload.
- Existing records, including literal full-stop business names, are not backfilled or changed. Partner lead capture and its separate consent, location and automatic-email workflow are unchanged.

## Files

Application:
- `src/lib/cleaners.ts`: validation, optional-name handling, source storage/selects and CSV support.
- `src/lib/cleanerLeadSource.ts`: source choices and input validation.
- `src/components/cleaners/CleanerSourceFields.tsx`: shared accessible source controls.
- `src/components/admin/CleanersAdmin.tsx`: required inputs, source controls/payload/CSV parsing and business display fallback.
- `src/components/availability/AgentCleaners.tsx`: matching regional-agent fields and required inputs.
- `src/components/cleaners/CleanerPortalForm.tsx`: compatible optional names and required mobile.
- `src/lib/cleanerPortalPolicy.ts`: matching self-service validation, keeping the internal-field whitelist.
- `src/lib/cleanerPortal.ts`: personal-name fallback for existing registration notifications.

Tests:
- `tests/cleaner-optional-surname.test.mjs`: minimum creation, partial updates, source parsing/storage, CSV safety/preservation and no email side effects.
- `tests/cleaner-portal.test.mjs`: optional names and internal-source exclusion.
- `tests/cleaner-machinery.test.mjs`, `tests/security-agent-policy.test.mjs`: fixture mobile values, retaining original machinery/ownership/region assertions.
- `tests/integration/cleaner-source-postgres.mjs`: actual migration in isolated PostgreSQL/PGlite.

## Migration and rollout

Apply `supabase/migrations/20261119003337_cleaner_optional_business_and_source.sql` **before** deploying the app, because full staff cleaner selects include the new columns.

The migration adds nullable `lead_source` and `lead_source_details`, source and length constraints, and a blank default for the existing non-null `business_name`. Empty business names already satisfy production constraints; the default supports omitted names while preserving the existing string API contract. There are no row updates/deletes, new grants, RLS changes, functions, queues, triggers or sends. Existing records remain unclassified. No new dependencies or environment variables are required.

Public/self-service state validation is deliberately retained for regional routing. The new source fields are staff information. Production data cleanup, automatic source backfill and a live send test are not included.

## Validation

- `npm run type-check`: PASS.
- `npm run lint`: PASS; existing Next lint deprecation notice only.
- `npm test`: PASS, 866/866. The localhost transport test required sandbox permission to bind a fixture server; rerun passed. Fixtures were updated to include the newly required mobile.
- `npm run build`: PASS on the final application changes. Synthetic localhost Supabase values were supplied, with no production database access.
- `git diff --check`: PASS.
- Isolated PostgreSQL/PGlite migration: PASS. Verified default blank business name, every supported source, invalid source/oversized detail rejection, nullable clearing, preserved old rows and unchanged RLS.
- Browser checks of the actual admin, agent and self-service components: PASS with synthetic data and all writes intercepted. Verified only three required staff inputs, missing-mobile blocking, successful blank business/surname creation, source create/edit/preservation, accessible labels, 390px source layout, self-service optional names and hidden source fields. No application runtime errors or external sends.
- React review: shared small field component, stable accessible IDs, functional source-state updates, no new effect or data-fetch chain, no dependencies added.

Evidence: `/tmp/sc-cleaner-source-{typecheck,lint,tests,build,db}.log`; browser fixture/script `/tmp/sc-cleaner-source-ui/`; source screenshots `/tmp/sc-cleaner-source-{admin,agent}.png` and `-mobile.png` variants. These are local synthetic test artifacts, not production records.

Post-release read-only check: open Create Cleaner in admin and agent views, verify optional business name and the source section, and inspect a previously saved source. Do not create a real cleaner or send a notification merely to verify deployment.

Implementation is complete and frozen for coordinator review. No commit, push, production migration or deployment has been performed by this task.
