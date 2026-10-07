# Product pricing recalculation

Baseline: ee6636a. Apply supabase/migrations/20261007214453_contract_product_recalculation.sql before app deployment, after contract_product_timing_refresh_migration.sql. No dependencies change. Existing products default to calculated annual value; their saved money amounts are not changed by migration.

Changed files: ContractProductsWorkspace.tsx, contractProducts.ts, admin/contract-products/route.ts, the forward migration, focused service tests, disposable PostgreSQL integration tests and this handover.

Products > Service and financial details now offers Recalculate from winning quote and Annual value method (calculated/manual). The annual input is excluding GST; preview also shows GST-inclusive values. Save draft persists a manual annual amount; default 50% purchase price uses that value. Manual purchase price stays independent. Ordinary saves from older callers preserve a stored annual override.

Recalculate saves current quote rate, frequency/default annual visits, timing and privacy-safe scope atomically. It resets manual annual value to calculated; preserves the saved manual purchase price and saved listing wording. Unsaved heading/description and other nonpricing edits stay on screen. Unsaved pricing settings are replaced. Review prices embedded in the description before publishing. Draft/withdrawn products only; reserved/sold products remain protected. Linked sales, invoices and sent broadcasts are unchanged.

API: product.recalculate uses existing protected/rate-limited product endpoint and expectedUpdatedAt; server reads quote and supplies its timestamp and rate to the service-only RPC. Product response adds annualValueMethod; product.update accepts annualValueMethod and annualValueExGst. These internal fields are excluded from public listing projection. Existing public annual and purchase value fields continue to drive published jobs/broadcasts.

Database: adds annual_value_method, a pricing-change audit/locked-status trigger and recalculate_contract_product_from_quote. Existing scope function enforces active staff, assigned agent/region, snapshot fields and editable status. Product and source quote locks/timestamps prevent stale recalculation. Trigger records old/new prices in private audit. RPC also records actor/source in private audit. No automatic sends or production data changes during development.

Validation: full type-check, lint, npm test, build and whitespace checks required. Disposable PGlite integration loads real scope refresh and new migration twice, tests recalculation, manual purchase preservation, stale source/product, wrong rate, regional rejection, locked pricing and anonymous execute denial. Service tests cover manual/calculated annual value, legacy payload preservation, invalid amounts, locked status and assignment checks. Production and authenticated browser verification remain release tasks; no live record values were changed during development.
