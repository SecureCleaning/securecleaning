# Completed appointment request display

User reported that a declined partner request remained on the dashboard with history unchecked and zero requests awaiting approval. The screenshot shows `decision_status=declined`, `decision_email_status=sent`, `decision_calendar_status=not_required`, but historical `email_status=review_required`.

Verified production and main baseline: `bc19903410a32cc6f99e97bdad06eaef33b074fd`, Ready at `securecleaning.com.au`. Source checkout: `/Users/lyle/.codex/worktrees/b3b0/securecleaning-codex-handoff-20260331-144602`, initially clean. The user subsequently requested "deploy" on 4 November 2026, authorizing the project-wide release through SC Deploy.

## Change

The old display rule treated all initial and decision delivery flags as current unfinished work. The shared admin/agent component now uses phase-aware display logic:

- Pending requests use their initial email/calendar statuses and always remain in the active list.
- Confirmed/declined requests use their decision email/calendar statuses for current delivery warnings. Earlier notification failures remain history.
- A successful decision moves the card out of the default list and clears the stale delivery banner. The existing record will follow this rule without a data repair, repeat decision, resend or calendar change.
- Actual current decision delivery failures/processing states remain visible with a warning. Independent client-detail review flags also remain visible.
- Selecting "Show recent decisions and delivery status" displays earlier email and calendar statuses with historical wording, rather than making an old failure look like current unfinished work.

## Files and contracts

- `src/components/partner/PartnerAppointmentReview.tsx`: active card filtering, banner count and historical delivery detail.
- `src/lib/partnerAppointmentDisplay.ts`: pure phase-aware visibility and attention rules.
- `tests/partner-appointment-display.test.mjs`: regression coverage for successful/failed decisions, pending work, separate contact checks and rendered admin/agent views.
- This handoff document.

No migrations, API/data-contract changes, dependencies, environment changes or live record modifications. Existing notification sending, approval, calendar collision checks, permission checks and stored audit statuses are unchanged. Editing is complete.

## Validation

- Focused partner request tests: 25 passed.
- Full suite: 787 tests passed.
- Type-check, lint and `git diff --check`: passed.
- Production build: passed using harmless database placeholders.
- Rendered component tests reproduced the screenshot's state using synthetic data for both admin and agent views, verified hidden card/stale banner and history visibility, and confirmed real current delivery failures remain visible.
- No authenticated live browser check, email/SMS sends, calendar calls, booking decisions or database writes were performed. No database repair is needed for the screenshot's record.

Coordinator should reverify main/live baseline, integrate only these files, run release checks and publish when the user requests deployment. After deployment, a read-only page refresh should hide the declined card and stale banner unless history is checked or a separate current issue exists.
