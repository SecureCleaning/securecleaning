# Secure Cleaning 2 Agent Instructions

## Mission and ownership

- This repository is the Secure Cleaning 2 application. Preserve the existing customer, admin, regional-agent, quote, booking, cleaner, calendar, email, and Secure Bot workflows unless the task explicitly changes them.
- The main/lead agent owns architecture, cross-cutting decisions, integration, release coordination, and final validation.
- Before implementing a significant feature, use read-only discovery to inspect the relevant routes, components, services, data model, migrations, tests, and existing documentation.
- A vertical feature normally has one implementation owner. Other agents may review, test, or perform read-only discovery, but must not edit the same feature concurrently without explicit coordination.
- Do not allow multiple agents to modify overlapping files simultaneously.
- Keep existing uncommitted work. Never reset, discard, overwrite, or revert changes that were not made by the current task owner.

## Shared and high-conflict areas

These files and directories require a designated single writer and extra review before changes:

- `src/lib/types.ts`
- `src/lib/email.ts`
- `src/lib/supabase.ts`
- `src/lib/availability.ts`
- `src/lib/content.ts`
- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/QuoteWorkflowEditor.tsx`
- `src/components/admin/CleanersAdmin.tsx`
- `src/components/booking/BookingForm.tsx`
- `src/app/globals.css`
- `supabase/**`
- `package.json`
- `package-lock.json`
- Build configuration, including `next.config.js`, `tsconfig.json`, `tailwind.config.js`, and PostCSS configuration.

Before editing a shared area, inspect current changes, identify the owner, and coordinate integration. Keep shared-file changes narrowly scoped.

## Security and data handling

- Authentication and regional authorization must be enforced server-side. Client-side hiding is not authorization.
- Validate ownership, region, role, and record access again in every protected API route and mutation.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, private calendar credentials, Resend credentials, admin secrets, access-code hashes, or other secrets to browser code, rendered HTML, logs, or customer emails.
- Treat customer, cleaner, contact, address, quote, booking, inspection, and email-history data as sensitive. Return and display only what the current audience needs.
- Preserve abuse protection, rate limits, validation, audit logging, and safe error handling when changing public or admin endpoints.
- Do not include internal pricing calculations, staff notes, regional details, or operational metadata in customer-facing quote, scope, or email output unless explicitly required.

## Integrations and side effects

- Database changes require migration review. Add a forward migration, check dependent code and RLS assumptions, and document rollout/order requirements. Do not edit production data through ad hoc destructive SQL.
- Email, database writes, calendar events, calendar feeds, file uploads, external APIs, and deployment are side effects. Review recipients, permissions, idempotency, failure handling, and audit implications before changing them.
- Reuse existing components, data access helpers, auth helpers, email helpers, calendar helpers, and services before creating duplicates.
- Prefer structured parsers and typed APIs over string-based or duplicated implementations.
- Keep API contracts backwards compatible where practical and update all callers when a contract must change.

## Workflow and validation

- Inspect `git status` and existing diffs before starting. Do not clean unrelated work.
- For significant work, report the intended file ownership and integration points before implementation.
- Every completed implementation must run the full validation suite:
  - `npm run type-check`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `git diff --check`
- Add or update focused tests for changed business logic and security-sensitive behavior. If an end-to-end or manual check cannot be run, say so explicitly.
- Before deployment, confirm environment and migration prerequisites and identify external side effects. Do not claim production readiness from a local build alone.
- Every completion report must state:
  - files changed;
  - migrations added or required;
  - API or data-contract changes;
  - dependencies changed;
  - unresolved risks or follow-up work;
  - manual verification performed;
  - validation results.

## Repository conventions

- Use npm and the existing scripts in `package.json`.
- Follow the existing Next.js App Router, TypeScript, React, Tailwind, Supabase, Resend, and calendar integration patterns.
- Keep edits ASCII by default and add comments only where they explain non-obvious reasoning.
- Keep customer-facing language branded as Secure Cleaning / Secure Cleaning Aus and avoid exposing internal implementation terminology.
- Do not commit, create worktrees, or deploy unless the task explicitly authorizes that action.
