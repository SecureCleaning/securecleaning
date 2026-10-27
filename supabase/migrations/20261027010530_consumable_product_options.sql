-- Add options without changing existing catalogue data or access policies.
BEGIN;
ALTER TABLE public.consumable_products ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.consumable_products ADD CONSTRAINT consumable_products_variants_array
  CHECK (jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) <= 30 AND octet_length(variants::text) <= 40000);
COMMENT ON COLUMN public.consumable_products.variants IS 'Manager-only size/pack options with supplier costs. Public API returns labels, pack sizes and calculated selling prices only.';


-- Supplier prices checked 27 October 2026. Preserve any manually created equivalent.
INSERT INTO public.consumable_products(slug, title, category, description, supplier_sku, pack_size, supplier_cost_cents, image_url, supplier_product_url, variants, sort_order)
SELECT '73l-heavy-duty-garbage-bags-250-carton', '73L Heavy Duty Garbage Bags', 'Bags / bin liners', 'Black LDPE garbage bags for commercial bins. 920 x 760 mm; 250 bags per carton.', 'LDBIN73H', '250 per carton', 3000, '/images/consumables/73l-garbage-bags.jpg', 'https://sydneycleaningsupplies.com.au/shop/bags-liners/garbage-bags-strong-hdpe/', '[]'::jsonb, 100
WHERE NOT EXISTS (SELECT 1 FROM public.consumable_products WHERE slug = '73l-heavy-duty-garbage-bags-250-carton' OR supplier_product_url = 'https://sydneycleaningsupplies.com.au/shop/bags-liners/garbage-bags-strong-hdpe/' OR lower(supplier_sku) = lower('LDBIN73H'))
ON CONFLICT DO NOTHING;

-- Supplier prices checked 27 October 2026. Preserve any manually created equivalent.
INSERT INTO public.consumable_products(slug, title, category, description, supplier_sku, pack_size, supplier_cost_cents, image_url, supplier_product_url, variants, sort_order)
SELECT 'office-kitchen-tidy-liners-black', 'Office & Kitchen Tidy Liners - Black', 'Bags / bin liners', 'Black HDPE bin liners for offices, kitchens and washrooms. Choose 18L (540 x 450 mm), 27L (650 x 510 mm), or 36L (700 x 590 mm). Each carton contains 1,000 bags.', NULL, '1000 Per Carton', 3000, '/images/consumables/black-kitchen-liners.jpg', 'https://sydneycleaningsupplies.com.au/shop/bags-liners/office-kitchen-tidy-bin-liners/', '[{"label":"18L SMALL","packSize":"1000 Per Carton","supplierCostCents":3000,"finalPriceOverrideCents":null,"supplierSku":"KTSB"},{"label":"27L MEDIUM","packSize":"1000 Per Carton","supplierCostCents":3500,"finalPriceOverrideCents":null,"supplierSku":"KTMB"},{"label":"36L LARGE","packSize":"1000 Per Carton","supplierCostCents":4000,"finalPriceOverrideCents":null,"supplierSku":"KTLB"}]'::jsonb, 110
WHERE NOT EXISTS (SELECT 1 FROM public.consumable_products WHERE slug = 'office-kitchen-tidy-liners-black' OR supplier_product_url = 'https://sydneycleaningsupplies.com.au/shop/bags-liners/office-kitchen-tidy-bin-liners/' )
ON CONFLICT DO NOTHING;

-- Supplier prices checked 27 October 2026. Preserve any manually created equivalent.
INSERT INTO public.consumable_products(slug, title, category, description, supplier_sku, pack_size, supplier_cost_cents, image_url, supplier_product_url, variants, sort_order)
SELECT 'office-kitchen-tidy-liners-white', 'Office & Kitchen Tidy Liners - White', 'Bags / bin liners', 'White HDPE bin liners for offices, kitchens and washrooms. Choose 18L (540 x 450 mm), 27L (650 x 510 mm), or 36L (700 x 590 mm). Each carton contains 1,000 bags.', NULL, '1000 Per Carton', 3000, '/images/consumables/white-kitchen-liners.jpg', 'https://sydneycleaningsupplies.com.au/shop/bags-liners/office-kitchen-tidy-bin-liners-roll-white/', '[{"label":"18L SMALL","packSize":"1000 Per Carton","supplierCostCents":3000,"finalPriceOverrideCents":null,"supplierSku":"KTS"},{"label":"27L MED","packSize":"1000 Per Carton","supplierCostCents":3500,"finalPriceOverrideCents":null,"supplierSku":"KTM"},{"label":"36L LARGE","packSize":"1000 Per Carton","supplierCostCents":4000,"finalPriceOverrideCents":null,"supplierSku":"KTL"}]'::jsonb, 120
WHERE NOT EXISTS (SELECT 1 FROM public.consumable_products WHERE slug = 'office-kitchen-tidy-liners-white' OR supplier_product_url = 'https://sydneycleaningsupplies.com.au/shop/bags-liners/office-kitchen-tidy-bin-liners-roll-white/' )
ON CONFLICT DO NOTHING;

COMMIT;
