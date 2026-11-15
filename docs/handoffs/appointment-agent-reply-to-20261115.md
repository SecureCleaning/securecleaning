# Appointment email replies follow the assigned agent

User request: client replies should go to the agent assigned to the appointment.

Source checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`.
Baseline: `bcbcca6936677bca7b24fc74b1c15aef5b711b0c`, independently verified against fetched main and Ready Vercel production deployment `dpl_HLgU5WLDGZ5LNymMFpgncauGyii4`, aliased to `securecleaning.com.au`, on 15 November 2026. Checkout was clean before this work. SC Deploy confirmed no overlapping ownership.

## Result and changed files

- `src/lib/email.ts`: client booking confirmation/request emails use the exact selected appointment agent's configured email as Reply-To. Covers partner, CRM manual and public bookings through the shared sender. The existing admin fallback remains when no usable assigned mailbox can be resolved. Mailbox validation rejects angle-bracket addresses.
- `src/lib/partnerAppointmentMessages.ts`: client alternative-time request, confirmation and decline messages use the server-resolved assigned agent's mailbox as Reply-To. The existing request workflow validates this mailbox before sending.
- `src/lib/bookingAppointmentNotifications.ts`: client reschedule and cancellation messages use the assigned agent's mailbox, with admin fallback for absent/invalid configuration.
- `tests/quote-email-cc.test.mjs`, `tests/partner-appointment-requests.test.mjs`, `tests/booking-appointment-notifications.test.mjs`: cover exact assignment across states and multiple agents, all affected message types, admin fallback, and preservation of staff recipients, sending mailbox, attachments and internal-note privacy.
- This handoff.

Assignment is taken from the appointment, not recalculated from state priority or the staff member processing it. The From mailbox and staff notification routing are preserved. Previously delivered messages cannot have their Reply-To changed retroactively. Calendar organizer/RSVP behavior is unchanged; this change concerns email replies.

## Validation

- Focused email/routing tests: 70 passed.
- Full `npm test`: 834 passed, zero failed/skipped. The sandbox-only run blocked the existing localhost mock server; rerunning with loopback access passed.
- `npm run type-check`: passed sequentially. An initial run overlapped the build regenerating `.next/types` and was rerun after that build finished.
- `npm run lint`: passed, no lint warnings/errors.
- `npm run build`: passed with `NODE_OPTIONS=--max-old-space-size=8192` and synthetic Supabase/Resend values. The first attempt compiled but exhausted the default 2 GB Node heap during type checking; no project configuration was changed to bypass checks.
- `git diff --check`: passed.

Read-only source review traced the booking, appointment-request creation/decision and reschedule/cancellation callers to their actual assigned agent. Local tests captured email payloads and exercised the provider adapter. No live email or mailbox delivery test was performed, and no production records, bookings or settings were changed.

## Release

No migration, backfill, environment, dependency, endpoint or data-contract change is required. No email resend is required or authorized by this request. Agent mailbox configuration must remain valid; normal booking/change emails retain admin fallback if it cannot be resolved.

Editing is complete and the patch is ready for SC Deploy. No deployment was requested in this turn; do not independently commit, push or deploy. Recheck current production/main and preserve concurrent edits during release integration. After release, newly generated client appointment emails should carry the assigned agent's Reply-To; verify a payload without sending real test messages unless separately authorized.
