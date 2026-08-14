# Database source convention

`schema.sql` is the clean-database baseline. Applied environments must then run additive migration files in repository order; migrations are never copied backward into historical files or replaced by ad-hoc production SQL.

For the final quote workflow, apply:

1. `audit_log_migration.sql`
2. `quote_workflow_migration.sql`
3. `final_quote_scope_workflow_migration.sql`

The final migration is authoritative for the service-role-only claim, finalization, and privileged reconciliation RPCs because those functions depend on the audit table created by the first migration. The baseline schema includes the tables, constraints, indexes, RLS, and immutable-document trigger needed before those RPCs are installed.
