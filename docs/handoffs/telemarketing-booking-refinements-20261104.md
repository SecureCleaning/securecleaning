> Historical first-stage handoff. Superseded by `telemarketing-appointment-requests-20261104.md`, which includes these refinements plus the required proposal migration and the current deployment authorization.

# Telemarketing booking refinements - 4 November 2026

Status: implementation and local verification complete. No deployment requested for this follow-up. Send through SC Deploy when the user authorizes release. No commit, push, migration, live booking, settings change or outbound message performed.

Source: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`
Branch: `codex/client-deletion-booking-lineage-20260924`
Baseline: `dfd893672fe5bfc5f4c40c2634966682db7a1ab9`, clean at start. Independently verified Ready production deployment `dpl_AQhVeP89Mn2B6q8i7XUdBgxDEYXV`, aliased to securecleaning.com.au; build logs show dfd8936. origin/main matched. Recheck production/main before integration.

## Requested behaviour

- Find next appointment scrolls to and focuses the calendar beneath the sticky header.
- Choosing either a calendar time or the Next available button scrolls to appointment details and focuses Business name.
- Five Monday-Friday columns stay on one row (horizontal scrolling on narrow screens). Previous/next week bounds come from the server. The initial search opens the week containing the earliest available appointment.
- Weekend dates are excluded from availability and rejected during booking validation even if an agent has weekend availability configured. Existing bookings, calendars and priorities are not changed.
- Street-address lookup is scoped to the selected suburb, postcode and state. Selected results populate the street only; changing location clears the previous street address. No match/provider failure leaves manual entry available, with guidance to confirm the number/unit with the customer.
- Internal notes appear in the admin/selected-agent booking notification, escaped as text with preserved line breaks. Customer confirmation HTML and its ICS attachment exclude notes. Internal Google Calendar event notes remain intact; that event has no customer attendees.

## Changed files

- `src/components/partner/PartnerBookingPortal.tsx`: scroll/focus, weekday layout/navigation, address lookup and internal-notes label.
- `src/lib/partnerBookingDates.ts` (new): timezone-independent date-only week helpers.
- `src/lib/partnerBookingAvailability.ts`: Monday-Friday result windows, next weekday search and navigation bounds.
- `src/lib/partnerBookingPolicy.ts`: server-side weekend rejection.
- `src/components/booking/AddressAutocomplete.tsx`: explicit Find address interaction, scoped searches, disabled/review handling and manual fallback.
- `src/lib/addressGeocoding.ts`: locality match filtering, separate streetAddress result, timeout/cache and shared address-provider rate bucket.
- `src/app/api/address-autocomplete/route.ts`: optional suburb/postcode validation and safe provider-failure response.
- `src/lib/calendarInvite.ts`: omit notes from customer booking ICS.
- `src/lib/email.ts`: add notes only to internal notification.
- Tests: `tests/partner-booking.test.mjs`, `tests/address-geocoding.test.mjs`, `tests/email-provider-routing.test.mjs`, `tests/quote-email-cc.test.mjs`.

Shared-file ownership was acknowledged by SC Deploy before edits. No other task files were changed.

## Integration and rollout

No schema changes, migrations, new dependencies or required environment variables. Reuses the deployed `consume_public_rate_limit` mechanism. Optional server-only `ADDRESS_LOOKUP_URL` selects a compatible Nominatim endpoint; default remains the current OpenStreetMap endpoint.

API additions: availability returns `weekStart`, nullable `previousWeek` and `nextWeek`, and five weekday `days`. Address lookup accepts optional `suburb` and `postcode` together and returns `streetAddress` alongside existing fields. A provider error returns a safe 503 instead of an empty successful result.

The shared address component is also used by the public booking form. It now uses an explicit Find address button there too. This avoids introducing more type-ahead traffic to the existing Nominatim provider (its policy prohibits autocomplete). Address lookups use a global one-request-per-1.1-second bucket, 8-second timeout and 24-hour fetch caching, and show OpenStreetMap attribution. Source policy reviewed: https://operations.osmfoundation.org/policies/nominatim/ . Existing separate public/admin *suburb* lookup routes still have legacy remote autocomplete code; those were outside this patch and should be reviewed separately before claiming provider compliance for the whole application.

Customer booking ICS notes are removed for all callers of the shared builder, including public/manual bookings. Already-delivered messages/invitations cannot be changed by this release. No historical bookings are rewritten.

## Validation

- `npm run type-check`: passed.
- `npm run lint`: passed, no ESLint warnings/errors (Next's existing command-deprecation notice only).
- `npm test`: 729 passed, zero failures/skips. Run with loopback permission for existing local transport-server tests; initial sandbox-only attempt was blocked from binding a local listener.
- `npm run build`: passed with synthetic NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and SERVICE_ROLE_KEY. Initial invocation without environment failed on missing existing Supabase variables; no credentials used to resolve it.
- `git diff --check`: passed.
- Focused tests cover weekday/date limits and year boundaries, skipping weekend availability, unchanged agent priority/privacy, scoped address filtering/number preservation/provider throttling, actual provider-payload customer ICS decoding with no notes, and escaped internal notes addressed to admin plus selected agent.
- React skill checklist reviewed: focus accessibility, reduced-motion preference, aborting stale lookup requests, disabled review fields and stale-location reset.

Local browser verification used the actual production build behind a temporary localhost fixture proxy. All API responses were synthetic, every mutation was blocked, and unknown API routes were blocked. Verified suburb selection, calendar auto-scroll/focus, five same-row weekday headings, appointment selection focusing Business name, scoped Find address result, street-only selection, review state, no-match/manual fallback, next-week navigation and removal of the previous selected appointment form. Request log contains GETs only. No live address-provider accuracy, live booking submission or outbound delivery test was performed. Unit tests capture email payloads without sending.

Temporary browser tab and local servers were closed. Fixture script/logs and check logs remain in `/tmp/sc-partner-*` only, outside the release patch.
