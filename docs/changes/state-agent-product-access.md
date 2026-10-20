# Same-state agent product access

Baseline: verified production 8029fd7ccc3cd9813affdd84e5f797c29c3b63be (Ready dpl_AWPHUjWLhDR8gBsZ8xjSutq3t4pX).

Active agents can list/access products and manage the associated sale workflow in their configured state regardless of the original assigned staff account. This includes product refresh/publishing, sale creation and follow-through, notes, invoices and invoice deep links. Cross-state access remains denied. Owner/manager access is retained. Quote/CRM opportunity assignment and win permissions remain unchanged. Financial confirmation remains owner/manager-only.

Assigned staff and commission attribution are not rewritten. Sale creator and subsequent actions continue to identify the actual acting staff account. Existing lifecycle locks, one-active-sale rule, approved same-state cleaner requirement, payment and handover requirements remain intact.

## Files

Application: contractProductAccess.ts, contractProductPolicy.ts, contractProducts.ts, contractSalePolicy.ts, contractSales.ts, invoiceDirectory.ts, invoiceDirectoryPolicy.ts under src/lib. Tests updated for state access; new state-agent-product-access.test.mjs and integration/state-agent-products-postgres.mjs.

## Migration / rollout

Apply supabase/migrations/20261020071815_state_agent_product_access.sql before application deployment. It introduces a service-role-only state permission helper that checks active staff and active availability assignee configuration, and updates ten existing product/sale RPCs/triggers from their exact live definitions. State derives from the server's existing city mapping (Sydney/NSW, Melbourne/VIC); future supported cities need corresponding mappings in both application and helper. Anonymous/authenticated function execution remains revoked. No customer data updates, reassignments, new dependencies or environment variables. Existing API payloads unchanged; internal policy helper signature changed.

Do not apply old full migration files over this patch. Recheck live function definitions before integration in case another release changes them.

## Verification

618 automated tests, type-check, lint; production build and diff check. Isolated PGlite migration replay twice passed, including second NSW agent sale creation/update, original assignment retained, idempotency/reservation, VIC actor spoofing NSW rejected, inactive/role mismatch/anonymous rejected. No real customer sale, email, quote or product mutations; no live agent browser write test. Migration is not yet applied to production.

Integration command:
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/integration/state-agent-products-postgres.mjs

This feature task has no new deployment authorization; ready-work handoff goes to Release Coordinator.
