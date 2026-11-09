# Partner cleaner introduction email

Implemented in the existing b3b0 checkout against independently verified Ready production and origin/main `7203752ac22ff8cc173b5406b946ccd4d9a1924c`. This is a readiness handoff, not a deployment request.

## Result

New partner cleaner submissions ask for agreement to two separate emails. The existing profile-completion email retains its private update link. The additional introduction uses the active saved **New Cleaner First Email** template from Cleaner Database > Email templates. Its subject and rich-text wording remain editable there; keep that template name for automatic lookup. No template body is seeded or overwritten.

The introduction selects the active regional profile for the cleaner's state with the lowest booking-priority number (existing default 100; profile ID breaks ties). NSW, VIC and QLD remain separate. It uses that profile's single active linked Team Access account, complete signature, reply address and CC. Booking windows, appointments and client allocations do not change. Missing configuration, template or signature holds the introduction for staff review and invokes the existing owner failure-alert service. The profile-completion email has independent delivery status and can still succeed.

Both messages have existing unsubscribe handling. Initial suppression and a second check when claiming each email prevent opted-out recipients being sent the introduction. Cleaner names are escaped, private call notes are excluded, and the introduction footer describes a prospective cleaner rather than claiming approval. The private profile-link email is not copied to the agent; the introduction is.

## Migration and rollout

Apply `supabase/migrations/20261109050351_partner_cleaner_welcome_email.sql` before the application. CLI-generated forward migration adds `welcome_email_status`, `welcome_email_id` and `welcome_review_reason` to partner intake history, extends the intake reservation function, and adds service-only welcome claim/completion functions. RLS and partner access checks remain in place. No production migration or data change has been performed in this task.

Existing submissions default to `not_required`. There is no backfill or automatic email to existing leads. Old browser payloads remain profile-only, and their idempotency fingerprints remain valid. Duplicate cleaner email addresses continue to go to review without overwriting a record or sending again. Separate database claims and provider idempotency keys prevent duplicate dispatch. Failed, uncertain or interrupted deliveries are never blindly retried; staff should check Resend and recorded history first.

Before live rollout, verify the named template is active and intended state agents have their Team Access links/signatures configured. This task did not read production configuration or send live test email. The runtime fails closed and flags missing prerequisites.

## Files and contracts

- `src/lib/partnerCleanerWelcome.ts`: state/priority selection, saved-template rendering, agent headers, snapshots, delivery and failure reporting.
- `src/lib/partnerCleanerCreate.ts`: independent profile and introduction dispatch after one intake reservation.
- `src/lib/partnerCleanerPolicy.ts`: optional explicit `welcomeEmailConsent` input and `welcomeEmailStatus` receipt; existing receipt fields retained. No private cleaner IDs or links returned to partners.
- `src/lib/cleanerEmailPolicy.ts`: prospective-cleaner footer context; existing approved-cleaner default retained.
- Partner lead form: two-email review/consent and separate receipt status.
- Admin telemarketing API/intake display: independent introduction status and review reason.
- Cleaner template editor: explains the automatic template and agent selection.
- Focused unit and existing integration/browser fixtures cover the expanded flow.

No package, dependency, environment-variable, booking, payment or calendar changes.

## Validation

- `npm run type-check`, `npm run lint`, `npm test` (823 passing), `npm run build`, and `git diff --check`.
- Actual SQL applied twice in isolated PGlite. Checked legacy preservation, service-only grants/RLS, state/session/recipient guards, consent, suppression after profile delivery, independent history/outcomes, duplicate/replay prevention and failure handling.
- Local browser with synthetic credentials and all API requests mocked: desktop/390px mobile review, consent, retry key, independent partial-failure receipt, both branded emails and signature, unsubscribe interaction and no horizontal overflow. Screenshots inspected locally. No real messages, bookings or cleaner records were changed.

Useful local test commands:

```sh
PGLITE_MODULE=/tmp/sc-partner-release-tools/node_modules/@electric-sql/pglite/dist/index.js node tests/integration/partner-cleaner-intake-postgres.mjs
PLAYWRIGHT_MODULE=/Users/lyle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node tests/integration/partner-cleaner-browser.mjs
PLAYWRIGHT_MODULE=/Users/lyle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node --experimental-loader ./tests/ts-loader.mjs tests/integration/partner-cleaner-email-browser.mjs
```
