# Consumables options, pricing entry and supplier preview

## State and ownership

Implemented in b3b0 on verified production/main commit `1605cd394ebc09a2d77c231714a48d9e74c644b9`.
Live alias verified via Vercel metadata as Ready deployment `dpl_5bHtxZjKR33uLmM6GjCr7uwhTvVG`.
The user subsequently authorized migration and deployment through the release coordinator on 27 October 2026. Integration also includes the independently reviewed main-checkout dependency fixes: Next.js/eslint-config-next 15.5.28 and sanitize-html 2.18.1 (with launder 1.7.2). No environment additions.

## Changes

- `src/components/consumables/MoneyInput.tsx`: retains typed decimal text until blur; fixes immediate two-decimal reformatting while typing.
- `src/components/admin/ConsumablesAdmin.tsx`: editable size/pack options, option price previews, CSV options round-trip, image file drop/paste, supplier-image URL drop/upload and product URL preview.
- `src/components/consumables/ProductOptions.tsx` and `src/app/consumables/page.tsx`: one public card per product, size selector with independent selling price.
- `src/lib/consumablesShared.ts`, `consumables.ts`, `consumablesImport.ts`: validated optional variants, persistence, older payload/CSV preservation and public price-only mapping.
- `src/lib/consumablesSupplier.ts` and `src/app/api/admin/consumables/supplier/route.ts`: manager-only bounded Sydney Cleaning Supplies product preview; HTTPS allowlist, no credentials, redirects rejected, 15-second timeout, 3 MB HTML maximum. Supplier price must explicitly exclude GST. Preview does not write data.
- Existing image route accepts an allowlisted supplier image URL as well as a file; existing image signature/size checks, manager authorization and audit remain.
- Three supplier pictures in `public/images/consumables/` and two test files.

## Migration and product data

Apply `supabase/migrations/20261027010530_consumable_product_options.sql` BEFORE deploying application code. Adds `variants` JSONB to the existing manager-only table, preserving RLS/grants. No dependency or environment additions.

The same migration adds the three requested products, without overwriting a matching slug, supplier URL or SKU:

- 73L Heavy Duty Garbage Bags: 250/carton, cost $30 ex GST, SKU LDBIN73H.
- Office & Kitchen Tidy Liners - Black: one product, 18L/27L/36L options; 1,000/carton; costs $30/$35/$40; SKUs KTSB/KTMB/KTLB.
- Office & Kitchen Tidy Liners - White: one product, same sizes, packs and costs; SKUs KTS/KTM/KTL.

Supplier prices independently checked on 27 October 2026. Existing default markup applies (20% yields $36/$42/$48). Verify whether any equivalent products were manually added during this task before releasing; matching rows are deliberately preserved rather than overwritten. If a match exists, review its price/options separately.

## Validation

- Full npm test: 643/643 pass (requires loopback permission for existing transport tests).
- Subsequent focused catalogue/options tests: 13/13 pass, including two additional tests for public data privacy and preservation of old save/import payloads.
- Type-check, lint, build and git diff --check pass. Build used synthetic environment placeholders because this checkout has no local environment file; no production services accessed.
- PGlite isolated migration test: existing row retained, three products inserted, six option records with correct costs, malformed JSON object rejected, anon/authenticated table grants remain denied.
- Actual React components in local synthetic browser harness: 36L selection displays $48; typed cost $30.15 displays $36.18; synthetic save/reopen retains $30.15; one catalogue record has all three sizes.
- Supplier parser tested on the actual HTML of all three supplied URLs. Product images are valid JPEGs.
- No live save/upload tests. Supplier preview is intentionally limited to Sydney Cleaning Supplies; other sites require manual entry. The external source's HTML may change, in which case the UI reports failure and allows manual entry.

## Release verification

Coordinator should reverify current main/live baseline, integrate only these owned changes, apply migration, then deploy. Confirm three catalogue listings, black/white each with all three size choices, $36/$42/$48 at 20% markup, and no supplier costs/SKUs in the public payload. Check supplier previews and actual image uploads only with appropriate test data/authorization.
