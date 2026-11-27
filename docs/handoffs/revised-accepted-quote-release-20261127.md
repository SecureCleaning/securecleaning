# Revised accepted quote email release

Source: Quote Workflow 23c4, verified production/main baseline 16c85d81d44c06f8c840eaadc0d42574468214c6. Six feature files integrated; no other ready application changes.

Save accepted correction first, then edit and preview the saved version before manually sending. Accepted status is preserved. Expected document version prevents stale sends; existing duplicate and unresolved delivery protections remain. No environment or dependency changes.

Migration `20261127092236_revised_accepted_quote_email.sql` applied before application release as database history **20261127094315**, name `revised_accepted_quote_email`. Do not replay based on timestamp difference. Three SECURITY INVOKER delivery functions replaced; execute remains service_role-only, denied to anon/authenticated.

Before/after migration: all 31 quotes have identical full-row digest `9b966a9464deb55e07fa73d5f7d1ea22`; all 20 quote_send_attempts identical digest `20c1a46c9e84eec4c3674517ea244f63`. No customer data writes or email/SMS sends.

Coordinator validation passed type-check, lint, 938 tests, production build, diff check, and isolated PGlite tests of accepted preservation, unchanged document, stale/duplicate claims, ordinary reviewed sending, reconciliation and ACL. Browser verification is separate; Safari initially detected active user interaction, so no customer tab was changed.
