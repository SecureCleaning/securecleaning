# Partner cleaner lead entry - ready for release coordination

Implementation complete in `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Baseline: `f8d0668e462202edf1d4a1bfe789d19157777b34`, independently verified against the Ready deployment aliased to `securecleaning.com.au` and fetched `origin/main` at startup and after validation on 8 November 2026. The checkout was clean at startup. Changes remain uncommitted.

On 9 November 2026 the user requested: "deploy through SC". This supersedes the earlier readiness-only handoff and authorizes SC Deploy to reconcile, validate, commit, migrate, push and deploy all ready intended project changes under the standing project-wide release rules. It does not authorize real customer test submissions or email sends.

## Behaviour

- Appointment booking remains the default. A secondary **Add cleaner lead** button switches to a short form; both forms retain their drafts when switching.
- Required: business name, email, phone, state and matching suburb/postcode. Contact names and internal notes are optional; an unknown first name is saved as Manager.
- Existing partner company state permissions apply. Calendar permissions are not required to enter a cleaner lead. The partner cannot browse cleaner records or retrieve private profile links.
- Caller reviews the entry and confirms the cleaner agreed to having their details recorded and receiving the email.
- A new cleaner is saved immediately as a `lead`, with `not_checked` compliance, suburb + 20 km service area, source attribution and private call notes. Approval remains the existing staff process.
- The automatic email thanks them for the call about contract purchases and provides the existing secure, 48-hour profile-update link. This supports services, areas, machinery and documents. It does not approve the cleaner or commit them to a purchase.
- An exact email match is held for owner review, without overwriting the existing cleaner or sending another invitation. Suppressed recipients do not receive an email.
- Owner Telemarketing administration gains a read-only recent cleaner submissions list: caller/company, contact details, internal notes and delivery/review status. New records also appear in the existing Cleaner Database.
- Durable database reservation and delivery claim prevent duplicate dispatch. Failed or uncertain delivery preserves the lead and requires review. Existing owner email-failure alerts are reused; missing link configuration and failure to persist delivery status also report through that helper.

## Changed files

- `src/app/api/partner-booking/cleaners/route.ts`: new authenticated, same-origin, size-limited and rate-limited POST route.
- `src/lib/partnerCleanerPolicy.ts`: strict input/state/locality validation and restricted public receipt.
- `src/lib/partnerCleanerCreate.ts`: atomic reservation, delivery claim, existing profile link/email helpers and recorded outcomes.
- `src/lib/partnerCleanerMessage.ts`: branded invitation wording; no internal notes or private operational data.
- `src/components/partner/PartnerCleanerLeadForm.tsx`: entry, review, consent, receipt and retry flow.
- `src/components/partner/PartnerBookingPortal.tsx`: secondary view toggle with retained drafts and busy-state protection.
- `src/components/shared/LocalityAutocomplete.tsx`: optional ID prefix to keep labels unique when both forms are mounted; existing callers retain their IDs.
- `src/components/admin/PartnerCleanerIntakes.tsx`: read-only owner review list.
- `src/components/admin/TelemarketingAdmin.tsx`: displays the additional list.
- `src/app/api/admin/telemarketing/route.ts`: additive owner-only `cleanerIntakes` result (latest 100); no private link, token or hash.
- `supabase/migrations/20261108013312_partner_cleaner_lead_intake.sql`.
- `tests/partner-cleaner-intake.test.mjs`.
- `tests/integration/partner-cleaner-intake-postgres.mjs`.
- `tests/integration/partner-cleaner-browser.mjs`.
- This handoff document.

## Database/API/deployment prerequisites

Apply migration **before** the application release. It creates `partner_cleaner_intakes`, indexes, RLS/grants, and three service-role-only invoker functions: `create_partner_cleaner_intake`, `claim_partner_cleaner_email`, `complete_partner_cleaner_email`. It does not migrate or change existing cleaners, bookings, calendars, payments or assignments. Database functions recheck active partner/company/session, allowed state, recipient consistency and suppressions. Existing cleaner-email uniqueness is reused. The migration was tested twice for repeatability.

New POST `/api/partner-booking/cleaners` accepts only validated lead details, consent and a UUID submission key. Public result is `{ reference, emailStatus: 'sent' | 'team_review', replay }`. Admin GET has only the additive field described above.

No application dependencies or environment variables added. Reuses the current Supabase service-role configuration, cleaner portal signing/link configuration, Resend, `FROM_EMAIL` and `ADMIN_EMAIL`. No package/lockfile changes. Temporary test-only tools were installed outside the repository: PGlite 0.3.14 and Supabase CLI 2.54.11 in `/tmp/sc-partner-cleaner-tools`.

## Validation

All final checks passed:

- `npm run type-check`
- `npm run lint` (no warnings/errors; existing Next lint deprecation notice only)
- `npm test`: **813 passed**, zero failures/skips.
- `npm run build`: passed with synthetic Supabase/site configuration.
- `git diff --check`
- `PGLITE_MODULE=/tmp/sc-partner-cleaner-tools/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/partner-cleaner-intake-postgres.mjs`
  - Actual migration twice; atomic creation/private notes/consent; replay and collision; one delivery claim; duplicate preservation; revoked/expired access; suppression and changed recipient/state/status; failed/uncertain outcome; RLS and execute permissions; durable hourly limit; cleaner deletion compatibility.
- `PLAYWRIGHT_MODULE=/Users/lyle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node tests/integration/partner-cleaner-browser.mjs`
  - Local server with synthetic credentials; all API calls mocked, external traffic blocked. Default booking, both draft states, unique input labels, consent, stable retry key, fresh-entry reset, delivery-review receipt, 390px layout and no page errors. Desktop/mobile screenshots visually reviewed.

No live records changed, no migration applied to production, no real emails sent, no live bookings or calendars touched. Local development server stopped after testing.

## Limits and post-release checks

- Production UI and real delivery are not yet verified; local mocked delivery does not prove provider delivery. After an authorized release, inspect the partner toggle and owner review list without submitting live data. A real send test needs a specifically authorized test recipient.
- Sending/unknown statuses are intentionally not automatically retried, because the provider may already have accepted an email. Owner review checks Resend before using the existing manual secure-link function.
- Exact email matching cannot detect a company submitted under a different email; these remain new leads for ordinary staff review.
- Invitation text is defined in the new message helper; this request did not add a separate template editor.
- The Vercel connector returned a scope-access 403; the existing authenticated CLI successfully verified the production alias/build log instead. No credential change is needed for this patch.
