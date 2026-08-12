# Admin Component Instructions

These instructions apply to admin UI components under `src/components/admin`.

## Ownership and architecture

- Admin components are operational tools for staff and regional agents. Optimize for clear scanning, safe editing, predictable navigation, and tablet usability.
- Reuse existing admin shell, navigation, form controls, panels, data helpers, and workflow components before creating duplicates.
- Keep one implementation owner for a vertical feature. Coordinate before editing shared components, especially `AdminDashboard.tsx`, `QuoteWorkflowEditor.tsx`, and `CleanersAdmin.tsx`.
- Do not treat UI visibility as permission enforcement. Every read and write must be protected by the corresponding server-side route.

## Data and permissions

- Do not render secrets, access codes, private tokens, service-role keys, or unnecessary customer/cleaner personal data.
- Regional-agent views must show only records permitted by their server-validated region and role. Admin views may show broader data only when the server authorizes it.
- Keep internal pricing breakdowns, staff comments, audit data, and operational notes clearly separated from customer-facing previews and emails.
- Preserve unsaved edits carefully, show loading/success/error states, and prevent duplicate submissions for email, database, calendar, and deployment actions.

## UI behavior

- Use labeled controls for editable fields, stable layouts, accessible buttons, keyboard-friendly disclosure controls, and clear disabled/loading states.
- Keep forms usable on desktop and tablet widths. Avoid introducing horizontal overflow or hiding important controls behind ambiguous interactions.
- For long directories, calendars, room lists, alerts, and workbench sections, provide deliberate expand/collapse, scrolling, filtering, and detail views.
- Preserve existing visual language and Secure Cleaning branding. Avoid changing public behavior or shared CSS for an admin-only need without review.

## Verification

- Test the changed admin workflow with the appropriate role(s), including unauthorized and out-of-region cases when relevant.
- Confirm browser-visible behavior manually for complex interactions such as accordions, calendars, quote editing, email composition, and save/reload flows when possible.
- Run the full repository validation suite and report files changed, API/migration effects, manual checks, and remaining risks.
