# API Route Instructions

These instructions apply to all route handlers under `src/app/api`.

## Route design

- Inspect the existing route, its callers, shared types, data helpers, and related migrations before editing.
- Keep route handlers thin: validate input, authorize the request, call the existing domain/data helper, handle errors, and return the established response shape.
- Reuse existing auth, availability, quote, email, calendar, Supabase, abuse-protection, and audit-log helpers before adding new ones.
- Keep browser-safe data separate from service-role data. Never import server-only secrets or service-role clients into client components.

## Authorization and validation

- Enforce authentication and authorization server-side on every protected route and mutation.
- For admin routes, use the existing admin authorization/session pattern.
- For availability-agent routes, validate the assignee session and re-check city, service-region, and record ownership server-side.
- Validate all request bodies, query parameters, path parameters, identifiers, email addresses, dates, numeric ranges, and enumerated values. Reject malformed or unexpected input safely.
- Do not trust client-provided prices, roles, regions, recipients, quote ownership, booking ownership, or status transitions. Recalculate or verify sensitive values on the server.
- Avoid leaking whether protected records exist to unauthorized callers where that distinction is sensitive.

## Side effects and responses

- Email, database, calendar, upload, and external API operations must be intentional, auditable where appropriate, and safe against duplicate submissions.
- Check third-party responses and surface a useful, non-sensitive error. Do not return provider credentials, stack traces, SQL details, or private record contents.
- Keep customer-facing output free of internal room values, staff notes, service-region metadata, and other admin-only fields.
- Preserve existing status codes and response contracts unless all callers are updated and the change is documented.
- Add rate limiting and abuse protection to public or costly endpoints, especially quote, booking, chat, address lookup, email, and upload operations.
- Use structured logging without customer secrets or full sensitive payloads.

## Verification

- Add focused tests for changed authorization, validation, pricing, data selection, and side-effect behavior.
- Run the full repository validation suite before reporting completion. If a live integration or manual browser flow was not tested, record that gap.
