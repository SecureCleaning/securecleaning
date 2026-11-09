# Partner NSW default, optional cleaner address and invitation email

Owner/source: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Started clean from `7858780590cab6332f1004a17813a37d606b6bd3`, verified against fetched origin/main and the Ready deployment aliased to securecleaning.com.au on 9 November 2026. Release authorized on 9 November 2026: "migrate commit and deploy through SC please". Route through SC Deploy and include all ready intended project work under the standing project-wide release instructions.

## Behaviour

- NSW is selected initially in both partner booking and cleaner entry if the company's permitted states include NSW. Otherwise the first allowed state is selected, or none when no states are permitted. This also applies after sign-in and when starting another cleaner entry.
- Switching views preserves manually selected states and drafts. State permissions, calendars, assignment priority and existing bookings are unaffected.
- Cleaner lead entry has **Street address (optional)**, with a 240-character limit matching the existing cleaner profile. It is shown in the review summary and owner's intake review list, and saved to the existing `cleaners.address` field. The existing cleaner record and secure update form already read this field.
- Empty or omitted addresses are accepted. Empty addresses are omitted from normalized input to retain earlier submission fingerprints. Existing cleaner email matches remain review-only and cannot overwrite an address.
- The partner cleaner invitation now matches the supplied contract-sale email example: teal Secure Cleaning header, white bordered card, light teal profile panel, clear action button and a branded footer. It retains the 48-hour profile link, consent context and no-approval wording; internal call notes are excluded.
- A visible unsubscribe link is included in HTML and plain text, with one-click mailbox headers. It uses the cleaner's existing `broadcast_unsubscribe_token` and existing unsubscribe endpoint, preserving the established suppression and audit flow. The preference page now describes cleaner outreach, updates and job broadcasts. Operational messages about requested/existing work are unaffected.
- Missing/unreadable unsubscribe capabilities prevent a send and mark the intake for review through the existing delivery/failure-alert mechanism. Private capability links are not added to the partner response or stored email-history summary.

## Changed files and contracts

- `src/lib/partnerPortalDefaults.ts`: shared browser-safe permitted-state default.
- `src/components/partner/PartnerBookingPortal.tsx`: default on session restoration/sign-in.
- `src/components/partner/PartnerCleanerLeadForm.tsx`: default, optional address input, reset and review summary.
- `src/lib/partnerCleanerPolicy.ts`: optional trimmed/bounded address; otherwise unchanged validation.
- `src/components/admin/PartnerCleanerIntakes.tsx`: optional address in intake display/type; older rows remain compatible.
- `src/lib/partnerCleanerCreate.ts`: server-side lookup of the saved cleaner's unsubscribe capability, visible link and one-click headers; fail closed when preferences cannot be prepared.
- `src/lib/partnerCleanerMessage.ts`: branded HTML and matching plain-text email, visible unsubscribe, mobile layout and accessibility markup.
- `src/components/CleanerBroadcastUnsubscribeForm.tsx`: accurately explains the existing cleaner email suppression scope.
- `supabase/migrations/20261109032635_partner_cleaner_optional_address.sql`: forward replacement of `create_partner_cleaner_intake`, adding only address length validation and inserting a trimmed address or NULL. Reaffirms service-only execute permissions. No table/column changes, backfill or existing-record updates.
- `tests/partner-cleaner-intake.test.mjs`: allowed-state defaults and optional address validation.
- `tests/integration/partner-cleaner-intake-postgres.mjs`: actual migration upgrade twice with a pre-existing intake; address persistence, blank/missing acceptance, length limit, legacy replay and duplicate preservation.
- `tests/integration/partner-cleaner-browser.mjs`: NSW defaults on restored session/sign-in/reset, fallback without NSW permission, retained manual selection, address submission, blank-address submission, desktop/mobile layout.
- `tests/cleaner-unsubscribe.test.mjs`: mailbox one-click form POST through the actual endpoint.
- `tests/integration/partner-cleaner-email-browser.mjs`: actual rendered email on desktop/mobile plus public unsubscribe confirmation UI with mocked success/failure responses. The PGlite integration also executes the existing unsubscribe SQL and verifies suppression before dispatch, invalid/repeated tokens and audit history.
- This handoff.

API change: optional `address` on the existing partner cleaner POST payload; no endpoint or response shape change. No dependency/environment changes. Supabase CLI 2.54.11 was installed only in `/tmp/sc-cleaner-address-tools` to generate the migration; it is not a project dependency.

## Rollout and verification

Apply migration before deploying the application so a supplied address cannot be silently ignored by the previous function. It depends on the already released migration 20261108013312. Applying the new migration does not create leads or send anything.

Editing is complete and this combined patch is ready for SC Deploy release integration. Production and fetched main were rechecked on 9 November and still match `7858780590cab6332f1004a17813a37d606b6bd3` (Ready deployment aliased to securecleaning.com.au); recheck again at integration to preserve concurrent work.

Validation passed:
- `npm run type-check` and `npm run lint` (no lint warnings/errors).
- `npm test`: 817 passed, zero failed/skipped. Ran with loopback access for the existing local HTTP-server test; the sandbox-only attempt was blocked at its bind, not an application failure.
- `npm run build`: passed with synthetic Supabase/Resend credentials and `NODE_OPTIONS=--max-old-space-size=4096`. The initial run hit the local Node 2 GB heap limit; no project configuration was changed.
- Isolated PGlite: actual new migration applied twice after an existing intake; existing records preserved. Actual unsubscribe RPC checked for valid/repeated/invalid tokens, audit history and suppression before dispatch.
- Both local browser scripts passed: NSW/default/fallback/manual-selection checks, address and no-address submission, branded email desktop/mobile preview, and unsubscribe confirmation success/failure. All application API calls were intercepted; no live records or emails were used.
- `git diff --check` passed. React component review found no new shared state, permission bypass, missing field labels or mobile overflow.

Evidence: `/tmp/sc-cleaner-address-{types,lint,tests,build,db,browser,email-browser}.log`; production source check `/tmp/sc-cleaner-address-final-production.log`. Synthetic preview `/tmp/sc-partner-cleaner-email-preview.html`, desktop/mobile screenshots `/tmp/sc-partner-cleaner-email-{desktop,mobile}.png`. No live records, settings, bookings or emails have been changed.

Post-release: verify NSW selected and the optional street-address input while signed in, without submitting live data. New invitations use the updated email; already delivered messages cannot be restyled or gain a footer retroactively. No automatic resend/backfill is included. Layout is locally browser-verified; a real Gmail/Outlook delivery/render check has not been performed, to avoid sending anything. No environment/dependency change is required for unsubscribe: its database column and RPC were already deployed for cleaner broadcasts.
