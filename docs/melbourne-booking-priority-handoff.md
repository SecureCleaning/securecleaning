# Melbourne booking priority and role guide — 29 October 2026

Baseline: cdca35204f6c573e9d5527558cdeb3f32aed7f80; live Ready deployment verified from Vercel metadata and build logs before editing. Work is complete locally; deployment has not been requested for this feature. No production records or settings were changed and no messages were sent.

## Behavior and setup

Availability Admin can opt into priority allocation. The suburb must first match the selected zones on each active Melbourne agent’s weekly window. Priority applies only among agents whose selected zones and available times overlap. No eligible area match means no offer. Each time is offered once, using the lowest-numbered eligible agent; an agent's existing booking or block-out allows the next available agent to be offered. Their separate weekly windows and calendars remain in use. Sydney and the default legacy allocation mode remain unchanged.

Before enabling: create/link the second regional staff profile if needed, configure its separate specific calendar ID and availability windows, set distinct integer priorities (1–999), then choose the selected-service-area priority mode and save. The administrator may change the priorities later. Server validation rejects duplicate priorities, shared calendars and missing/ambiguous primary calendar IDs. No second account was created: its identity and calendar have not been supplied.

Existing bookings retain their stored assignee/calendar and existing client assignments are not rewritten. New CRM assignment candidate ordering follows priority. An existing client's owner may differ from the backup agent attending a booking. Public booking submission already revalidates the selected time, so a stale selection is rejected rather than silently reassigned.

## Files and contracts

- src/lib/availabilityPriority.ts: allocation/validation helpers.
- src/lib/availability.ts: backwards-compatible config normalization, area-first eligibility and available-time ranking.
- src/lib/clientCrmData.ts: new CRM assignment candidate ordering.
- src/app/api/admin/availability/route.ts: server-side priority/calendar validation with existing owner/manager authorization.
- src/components/admin/AvailabilityAdmin.tsx: mode and priority controls.
- tests/availability-priority.test.mjs: nine synthetic-data regressions.
- output/pdf/secure-cleaning-role-access-guide.pdf: two-page role access chart and explanations, visually verified. Documentation artifact, not a public web asset.

Optional existing JSON configuration fields: settings.melbourneBookingMode ('zones' or 'priority') and assignees[].bookingPriority (integer). No database migration, dependency or environment changes required. Missing mode retains legacy behavior.

## Validation and limits

Passed: type-check, lint, full 683-test suite after area-first clarification, production build using synthetic credentials, git diff --check. Focused tests cover ranking, fallback, separate calendars, invalid configuration, inactive/wrong-city agents, legacy/Sydney behavior, limit ordering and preserving existing booking ownership. Both PDF pages rendered and visually checked.

No live browser booking, calendar write or account creation was performed. Admin browser interaction and actual two-agent calendar delivery remain release/setup smoke checks. External calendar appointments still need corresponding availability block-outs: this does not add Google free/busy integration. Existing reservation concurrency and conflict-loading behavior are unchanged. Role guide describes reviewed production permissions, not new permission grants; state-scoped cleaner/product/sale access can be shared by two Victorian agents.
