-- Secure Cleaning - manually managed client consumables catalogue.
-- Apply before deploying the matching application release.

BEGIN;

CREATE TABLE IF NOT EXISTS public.consumable_catalog_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  default_markup_bps INTEGER NOT NULL DEFAULT 2000 CHECK (default_markup_bps BETWEEN 0 AND 50000),
  prices_exclude_gst BOOLEAN NOT NULL DEFAULT TRUE,
  public_note TEXT NOT NULL DEFAULT 'Supply is subject to availability and confirmation through your cleaner.' CHECK (char_length(public_note) <= 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consumable_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  category TEXT NOT NULL DEFAULT 'Other' CHECK (char_length(category) BETWEEN 1 AND 80),
  supplier_sku TEXT CHECK (supplier_sku IS NULL OR char_length(supplier_sku) <= 120),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  pack_size TEXT NOT NULL CHECK (char_length(pack_size) BETWEEN 1 AND 240),
  supplier_cost_cents INTEGER NOT NULL CHECK (supplier_cost_cents BETWEEN 0 AND 100000000),
  markup_override_bps INTEGER CHECK (markup_override_bps IS NULL OR markup_override_bps BETWEEN 0 AND 50000),
  final_price_override_cents INTEGER CHECK (final_price_override_cents IS NULL OR final_price_override_cents BETWEEN 0 AND 100000000),
  image_url TEXT CHECK (image_url IS NULL OR char_length(image_url) <= 1000),
  supplier_product_url TEXT CHECK (supplier_product_url IS NULL OR char_length(supplier_product_url) <= 1000),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS consumable_products_supplier_sku_unique
  ON public.consumable_products (LOWER(supplier_sku))
  WHERE supplier_sku IS NOT NULL AND BTRIM(supplier_sku) <> '';

CREATE INDEX IF NOT EXISTS consumable_products_public_order
  ON public.consumable_products (active, sort_order, title);

ALTER TABLE public.consumable_catalog_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumable_products ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.consumable_catalog_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.consumable_products FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.consumable_catalog_settings TO service_role;
GRANT ALL ON TABLE public.consumable_products TO service_role;

INSERT INTO public.consumable_catalog_settings(id, default_markup_bps, prices_exclude_gst, public_note)
VALUES (TRUE, 2000, TRUE, 'Supply is subject to availability and confirmation through your cleaner.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consumable_products(
  id, slug, category, title, description, pack_size, supplier_cost_cents,
  markup_override_bps, image_url, active, sort_order
) VALUES
  (
    '2da6dc8b-c67c-4a25-b045-4fe896e68f01', 'essentials-2ply-300m-jumbo-toilet-tissue', 'Toilet paper',
    'Essentials 2 Ply 300m Jumbo Toilet Tissue',
    E'Strong and absorbent. Jumbo sized for convenience. Made from independently certified, sustainable fibre.',
    '8 rolls per carton - 91mm sheet width - 300m per roll', 4000, 2000,
    '/images/consumables/jumbo-toilet-tissue.jpeg', TRUE, 10
  ),
  (
    'a1699ae5-4d34-40f6-818a-8d91e6efaf02', 'essentials-2ply-700sheets-toilet-paper', 'Toilet paper',
    'Essentials 2 Ply 700 Sheet Toilet Paper',
    'Individually wrapped for hygiene, comfort and convenience. Soft, strong, absorbent and hypoallergenic.',
    '48 rolls per carton - 700 sheets per roll', 5500, 2000,
    '/images/consumables/essentials-700-sheet-toilet-paper.png', TRUE, 20
  ),
  (
    '377e044f-8269-43ab-b400-c80469688803', 'everyday-2ply-700sheets-toilet-paper', 'Toilet paper',
    'Everyday 2 Ply 700 Sheet Toilet Paper',
    'Individually wrapped for hygiene. Long lasting for everyday use and made from PEFC-certified virgin fibre.',
    '48 rolls per carton - 700 sheets per roll', 5000, 2000,
    '/images/consumables/everyday-700-sheet-toilet-paper.png', TRUE, 30
  ),
  (
    '385caa33-b7e1-4010-88af-da6201080604', 'kleenex-toilet-paper', 'Toilet paper',
    'Kleenex Toilet Paper',
    'Kleenex Toilet Tissue 4735. Soft, dependable two-ply toilet tissue for workplace washrooms.',
    '48 rolls per carton - 400 sheets per roll - 19,200 sheets total', 8000, 2000,
    '/images/consumables/kleenex-toilet-paper.jpeg', TRUE, 40
  ),
  (
    '29d736bb-9455-4752-a4f8-68e8296e2405', 'everyday-ultraslim-hand-towel-1ply', 'Hand towel',
    'Everyday Ultraslim Hand Towel 1 Ply',
    'Embossed for extra absorbency with single-sheet dispensing. Suitable for modern workplace washrooms.',
    '16 packs per carton - 150 sheets per pack - 230mm x 240mm', 3500, 2000,
    '/images/consumables/everyday-ultraslim-hand-towel.png', TRUE, 50
  ),
  (
    'e66a8020-30ca-4775-a37f-1322749baf06', 'sorbent-ultraslim-tad-towel', 'Hand towel',
    'Sorbent Ultraslim TAD Hand Towel',
    'Super-absorbent TAD paper that remains strong when wet or dry.',
    '16 packs per carton - 150 sheets per pack - 230mm x 240mm', 4500, 2000,
    '/images/consumables/sorbent-ultraslim-towel.png', TRUE, 60
  ),
  (
    'd156bc66-82ad-4a94-ad20-464219f5e507', 'ultimate-3d-urinal-screen', 'Washroom care',
    'Ultimate 3D Urinal Screen',
    'Soft EVA urinal screen with double-sided bristles, anti-splash protection and 30 to 60 days of freshness.',
    'Individually packed', 900, 2000,
    '/images/consumables/ultimate-urinal-screen.jpeg', TRUE, 70
  ),
  (
    '33a435f3-0010-4f9b-9afc-96e9f77ef708', 'the-earth-edition-plant-base-hand-body-wash-12', 'Soap and wash',
    'Earth Edition Plant-Based Hand & Body Wash',
    'Plant-based hand and body wash with a rich lather. Suitable for pump bottles, mounted fixtures and food-handling environments.',
    'Carton of 12', 10800, 2000,
    '/images/consumables/earth-edition-hand-body-wash.png', TRUE, 80
  ),
  (
    '25b3dac4-b880-4f7e-8626-b13574acc909', 'soft-care-blue-hand-soap-5l', 'Soap and wash',
    'Soft Care Blue Hand Soap 5L',
    'General-use liquid hand soap with a rich lather and delicate fragrance. Suitable for public and staff washrooms.',
    '5 litre container', 3480, 2000,
    '/images/consumables/soft-care-blue-hand-soap.jpeg', TRUE, 90
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'consumable-product-images',
  'consumable-product-images',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
