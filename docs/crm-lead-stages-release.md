# CRM lead stages and shading

User authorized implementation and deployment through Release Coordinator. Source: /Users/lyle/.codex/worktrees/23c4/securecleaning-codex-handoff-20260331-144602. Verified production baseline18b18a7a678af1fcd30710aee5023ac44eac7de1, Ready deployment dpl_66Eje8EidWS8GH1SmiAv7wvnNLT8.

## Changes
- ClientCrmWorkspace.tsx and new crmLeadStages.ts: replace lead-card cycle text with readable stage badges and light orange/green/blue/purple/yellow/stronger green/grey backgrounds. Selected card retains stage shading with a teal focus ring. Source separate, overdue badge excludes closed stages. Cycle remains in workflow details. Workflow select uses readable labels; legacy qualified stays Contacted, cancelled stays Not proceeding.
- Calls/visits recorded by selecting Contacted and Save workflow. Existing won action continues requiring the linked quote/product workflow; no shortcut bypass.
- New migration20261029003131_crm_automatic_lead_stages.sql: service-only invoker helper and event triggers advance open opportunities following successfully sent outreach, scheduled inspection, manual quote linkage or saved firm draft, and final quote sent timestamp. Each advance audited. Only higher ranked stages; closed won/lost/cancelled preserved. Failed/unknown email and untouched online instant estimate do not count as contact or draft preparation.
- Existing sync_client_crm_opportunity receives exactly two stage-assignment changes: incoming bookings start new instead of qualified and do not mark an existing opportunity qualified. All other transaction logic preserved and service-only grants restated.
- Migration reconciles open historical opportunities upward using existing sent-email, scheduled-inspection and draft/sent-quote evidence. This intentionally changes stage and updated_at, adds audit entries; leaves identity, cycle, assignments, quotes, products, payments unchanged. Existing qualified records are not guessed/reset, because they may have been manually qualified.
- tests/crm-lead-stages.test.mjs and tests/integration/crm-lead-stages-postgres.mjs cover labels/colours/overdue, unchanged sync transaction except2assignments, actual migration event triggers/backfill/closed protections/idempotent audit/roles. PGlite fixture compiles the sync function; exact-source comparison guards its two-line modification (full historical sync flow not repeated in minimal fixture).

## Validation and release
662/662 full tests pass. Type-check, lint, diff check passed. Isolated migration execution passed using temporary PGlite. Production build passed.
Apply migration before app. No dependencies, environment or public API contract changes. No customer messages or manual test records created. Browser walkthrough not yet performed; verify cards/colours and labels in an authorized separate tab after release. Automatic transitions verified against isolated SQL events; do not send customer emails or create customer appointments to smoke test.
