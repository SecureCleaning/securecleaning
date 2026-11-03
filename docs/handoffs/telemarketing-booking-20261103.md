# Telemarketing booking portal - implementation handoff

## Authorization and baseline

- User approved implementation of restricted third-party appointment booking. This turn does **not** authorize production migration, deployment, account creation, live bookings, or test messages.
- Source checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
- Branch: `codex/client-deletion-booking-lineage-20260924`.
- Verified production baseline: `5356a727c737bcec8b51b0bb30d8cdfb42227695`.
- Ready deployment: `dpl_2uZUsRufYzWWPc6SxxCBHLNdef59`, aliased to `https://securecleaning.com.au`. Source commit verified from build logs at startup; the same deployment was rechecked before handoff on 3 November 2026.
- Editing complete. Changes remain uncommitted for SC Deploy review and release coordination.

## Delivered behavior

- `/partner-booking`: individual caller login, allowed state and exact suburb/postcode selection, next appointment and weekly alternatives, generic unavailable times, customer details, review and confirmation receipt.
- `/admin/telemarketing`: owner-only company access controls, state and calendar inclusion/exclusion, optional company expiry, caller creation/reset/disable, and recent booking/delivery activity. Added to Settings, including saved menu upgrades.
- Permission filtering occurs before existing suburb coverage, availability, block-out, travel buffer and priority selection. A caller cannot choose an excluded calendar or override allocation by posting different agent details.
- VIC, NSW and QLD reuse existing region configuration and localities. QLD uses Brisbane timezone, including Gold Coast and Sunshine Coast coverage from existing zones.
- Appointments are available from tomorrow through 90 days ahead, matching the existing public lead-time convention.
- Confirming atomically creates the booking, CRM relationship and audit entry. Existing CRM assignment is preserved by the current sync routine; new opportunities use the selected calendar's active regional agent where available.
- Booking is visible in the normal agent calendar through the existing booking data. The existing email helper sends the customer confirmation/ICS and internal notification. Google Calendar write targets the selected configured calendar only, with no owner-calendar fallback. Profiles without a configured Google connection use the internal Secure Cleaning calendar.
- Partner bookings use confirmed wording in email, ICS and Google event description.
- Callers cannot browse existing clients or appointments, see event names/notes/customer details, manage other bookings, or access internal accounts, payments or settings. No cancel/reschedule interface is included in this first version.

## Authentication and data contracts

- Separate partner tables/session cookie, independent of staff/admin roles and cookies. Opaque 8-hour tokens stored only as SHA-256 hashes; existing scrypt password helper reused.
- Every protected request checks current caller status, session revision, company status and expiry. State/calendar permissions are rechecked during confirmation in the database. Saving a caller account revokes existing sessions.
- Routes: `GET/POST/DELETE /api/partner-booking/session`, `GET /api/partner-booking/availability`, `POST /api/partner-booking/bookings`, and owner-only `GET/POST /api/admin/telemarketing`.
- Availability returns a strict allowlist of date/time, display agent and opaque slot selector; private calendar IDs and event contents are excluded. Google is queried for free/busy only.
- The browser does not submit trusted calendar IDs, assignee IDs, override flags or booking statuses. The server resolves these from current permitted availability.
- Booking POST requires a UUID idempotency key and customer-confirmed checkbox. Replay returns the existing receipt without resending or recreating events.
- Requests have payload limits, same-origin mutation checks, login/account and per-caller rate limits. Protected responses are uncached and noindex.
- `BookingInputs.inspectionBookingSource` now permits `partner`. Existing enum values and behavior remain supported.

## Migration and rollout

Required forward migration: `supabase/migrations/20261103101314_partner_booking_portal.sql`.

Creates four private tables (`partner_booking_companies`, `partner_booking_users`, `partner_booking_sessions`, `partner_booking_requests`), a nullable booking request reference and indexes, service-only functions, and booking/inspection conflict guards. RLS is enabled; PUBLIC, anon and authenticated grants are revoked; service-role grants are explicit. No accounts, allowed states or calendars are enabled, and no existing rows are rewritten.

The booking transaction locks current permissions and the exact availability configuration checked by the server. Common conflict guards serialize booking and sale-inspection writes and reject collisions involving a partner appointment, including the existing 50-minute reservation buffer. Existing internal/manual overlaps that do not involve partner appointments are unaffected.

Release order, when authorized:

1. Recheck live release and concurrent work; review the migration and integrate only this intended patch.
2. Apply the migration through SC Deploy before publishing code.
3. Deploy and verify the exact live commit.
4. Verify owner access and the anonymous partner login/API denials without creating bookings.
5. Owner sets up the company, explicitly enables states/calendars and creates individual callers. All companies are disabled by default. Share credentials directly; account setup does not email them.
6. Before enabling a real marketing company, exercise the authenticated workflow in a staging/synthetic environment and verify configured calendar access. An actual production appointment or delivery test needs explicit authorization.

No new repository dependency or environment variable is required. Existing Supabase, Resend and optional Google Calendar OAuth settings are reused. If Google is partially configured or any permitted connected calendar cannot be checked, availability fails closed. No calendar data is inferred from a failed lookup.

## Delivery and operational limits

- Booking creation succeeds independently of subsequent external delivery. Queued/sending/review-required states are shown to the owner; the caller is told the appointment was saved and not to book it again.
- Network side effects are claimed once before sending. Uncertain email/Google outcomes are not automatically retried. An owner must check provider delivery/event history before any manual resend or repair.
- Google free/busy is rechecked at confirmation, but Google does not participate in the database transaction. A simultaneous direct edit in Google can still race the final write. Database-origin booking collisions are serialized.
- Ambiguous contact matches are stopped for team review; existing client details are never overwritten by an external caller. An existing assigned client stays assigned to that staff member even if a different permitted calendar receives the appointment.
- The availability query caps internal reservations at 1,000 per lookup and fails closed if exceeded. Expired session rows are harmless but can be purged by a later retention maintenance task.

## Changed files

New implementation:

- `src/app/partner-booking/page.tsx`
- `src/app/admin/telemarketing/page.tsx`
- `src/app/api/partner-booking/session/route.ts`
- `src/app/api/partner-booking/availability/route.ts`
- `src/app/api/partner-booking/bookings/route.ts`
- `src/app/api/admin/telemarketing/route.ts`
- `src/components/partner/PartnerBookingPortal.tsx`
- `src/components/admin/TelemarketingAdmin.tsx`
- `src/lib/partnerBookingPolicy.ts`
- `src/lib/partnerBookingAuth.ts`
- `src/lib/partnerBookingHttp.ts`
- `src/lib/partnerBookingAvailability.ts`
- `src/lib/partnerBookingCreate.ts`

Narrow shared changes:

- `src/lib/types.ts`: partner booking source.
- `src/lib/email.ts`: partner confirmation wording.
- `src/lib/calendarInvite.ts`: partner confirmed ICS wording.
- `src/lib/googleCalendar.ts`: export existing OAuth helper and partner confirmed description.
- `src/lib/menuConfiguration.ts`: owner-only destination and saved-menu upgrade.

Migration, validation and handoff:

- `supabase/migrations/20261103101314_partner_booking_portal.sql`
- `tests/partner-booking.test.mjs`
- `scripts/test-partner-booking-migration.mjs`
- `docs/handoffs/telemarketing-booking-20261103.md`

## Validation

- `npm run type-check`: passed.
- `npm run lint`: passed, no warnings/errors from source lint.
- `npm test`: 723 passed, zero failures.
- Focused partner tests: 10 passed. Covers permission scoping, suburb/priority/busy selection, dates/timezones, response privacy, menu access, session revocation, database/provider failures, receipt replay, successful/mock-failed delivery and confirmed ICS wording.
- Isolated PostgreSQL migration test: passed, including execution as service_role, anonymous/authenticated denial, atomic booking/replay, collisions across booking/sale-inspection writers, cancellation, revoked/expired access, state/calendar restrictions, stale configuration and CRM-failure rollback.
- `npm run build`: passed with synthetic environment credentials.
- `git diff --check`: passed.
- Manual local browser: sign-in form renders correctly. Local HTTP checks: availability and booking reject anonymous requests with 401, admin management rejects anonymous requests with 403, foreign Origin booking POST rejects with 403.
- No authenticated browser walkthrough against the real database or live email/Google delivery was performed. Booking-service delivery tests mock both providers. The migration fixture uses a stub of the existing CRM sync routine to test atomicity; it does not replace the existing application regression coverage of that routine.
- No live records, settings, customer messages, payment records or calendar events were changed.

The database fixture uses a temporary external test runtime, not an application dependency: `@electric-sql/pglite@0.3.14` installed with `--ignore-scripts` under `/tmp/sc-partner-db-test`. Run `node scripts/test-partner-booking-migration.mjs`; override `PGLITE_MODULE_PATH` if installed elsewhere.
