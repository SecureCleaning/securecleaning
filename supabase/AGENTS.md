# Supabase and Migration Instructions

These instructions apply to `supabase/**`.

## Migration discipline

- Treat database schema, RLS, indexes, functions, triggers, and data migrations as shared high-conflict work with one designated writer.
- Inspect `schema.sql`, all relevant migrations, current application queries, server routes, and existing uncommitted SQL before editing.
- Add forward, repeatable, clearly named migrations for schema changes. Do not rewrite or reorder migrations that may already have been applied.
- Review migration ordering, dependencies, nullability, defaults, indexes, constraints, rollback/recovery implications, and compatibility with existing rows.
- Never run destructive or data-changing SQL against a connected project without explicit confirmation and a clear understanding of the affected data. Prefer additive, reversible changes.
- Do not put secrets, production credentials, or real customer data in SQL files, fixtures, logs, or documentation.

## Security

- Row-level security must support the server-side authorization model. Do not weaken RLS to make a UI work.
- Service-role access belongs only in trusted server code. Public/anon access must be narrowly scoped and reviewed.
- Review policies for admin, agent-region, customer-facing, cleaner, quote, booking, inspection, email-history, and document access as applicable.
- Protect personal information and uploaded documents with least-privilege policies, constrained storage access, and appropriate audit coverage.

## Integration and verification

- For every schema change, search all reads/writes and TypeScript types that depend on the affected table or column.
- Keep migrations and application changes coordinated; document any required deployment order or manual SQL step.
- Validate SQL syntax and, where available, apply it in a safe non-production environment before release.
- Run the full repository validation suite after application integration. Report migration names, affected tables/policies, data risks, manual database verification, and unresolved issues.
