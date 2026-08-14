# Availability-agent cleaner access handover

## Objective

Give every active availability agent a cleaner directory scoped to the agent's state. Agents can search and view cleaner records and history, add internal comments, and send one-off emails using active templates. They cannot change cleaner records, documents, templates, imports, exports, or deletions.

## Commit and integration

- Branch: `feature/agent-schedule-links`
- Commit: to be recorded by the integration owner.
- Integrate by cherry-picking the resulting commit into the main Secure Cleaning project after review, then run the full validation suite with the target environment configured.

## Permissions

| Capability | Availability agent |
| --- | --- |
| List/search cleaners | Own state only |
| View cleaner details, comments and email history | Own state only |
| Add comments | Own state only |
| Send email | Own state only; recipient derived from cleaner record |
| Use active email templates | Read-only; one-off subject/body edits allowed |
| Create/update cleaner records | No |
| Upload/delete documents | No |
| Import/export/delete | No |
| Create/update/delete templates | No |

State is derived from the signed, active availability-agent identity: `melbourne` maps to `VIC`; `sydney` maps to `NSW`. Unsupported cities fail closed. Client-supplied state is ignored. Every record-specific route checks both cleaner ID and state, returning the same 404 for missing and out-of-state records.

## API contracts

- `GET /api/availability-agent/:assigneeId/cleaners`: paginated same-state cleaner summaries plus active read-only templates. Returns `total`, `page`, and `pageSize`; search and page are preserved when navigating results.
- `GET /api/availability-agent/:assigneeId/cleaners/:cleanerId`: same-state cleaner details, comments, and email history.
- `POST /api/availability-agent/:assigneeId/cleaners/:cleanerId/comments`: `{ comment }`.
- `POST /api/availability-agent/:assigneeId/cleaners/:cleanerId/email`: `{ templateId?, subject, body }`. Recipient and template name are resolved server-side.

All endpoints require the existing active availability-agent session bound to `assigneeId`.

## Delivery notes

- Migrations: none.
- Dependencies: none.
- External data changes: none during implementation.
- Template contract: no template mutation API was added.
- Risk: cleaner rows with missing or non-canonical state values remain hidden (fail closed). Future cities outside Melbourne/Sydney require an explicit city-to-state mapping update.
- Concurrency risk: comments and emails perform an immediate second state check before inserting their comment or draft email row. Without a database transaction a state change racing that check is not fully atomic. No schema or RPC was added; the residual window is narrow and fails closed on normal requests.
- Validation: `npm run type-check` passed; `npm run lint` passed; `npm test` passed (49/49); `npm run build` passed using local placeholder environment values; `git diff --check` passed.
- Manual verification: route and UI wiring reviewed locally. No live database, email, or authenticated browser mutation was performed.
- Test scope: pure policy and normalization behavior plus precise route/security wiring are executable. Live database-backed route integration remains untested because adding full Supabase and email mocks would require invasive test-only architecture.
