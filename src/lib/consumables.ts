import { randomUUID } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'
import {
  DEFAULT_CONSUMABLE_MARKUP_BPS,
  MAX_CONSUMABLE_PRODUCTS,
  calculateConsumablePriceCents,
  slugifyConsumable,
  type ConsumableCatalogSettings,
  type ConsumableProduct,
  type ConsumablesAdminCatalog,
  type PublicConsumablesCatalog,
} from '@/lib/consumablesShared'

export {
  DEFAULT_CONSUMABLE_MARKUP_BPS,
  MAX_CONSUMABLE_PRODUCTS,
  calculateConsumablePriceCents,
  slugifyConsumable,
}
export type {
  ConsumableCatalogSettings,
  ConsumableProduct,
  ConsumablesAdminCatalog,
  PublicConsumablesCatalog,
} from '@/lib/consumablesShared'

export const CONSUMABLE_IMAGE_BUCKET = 'consumable-product-images'

export type ConsumableProductInput = Omit<ConsumableProduct, 'updatedAt'>

const DEFAULT_SETTINGS: ConsumableCatalogSettings = {
  defaultMarkupBps: DEFAULT_CONSUMABLE_MARKUP_BPS,
  pricesExcludeGst: true,
  publicNote: 'Supply is subject to availability and confirmation through your cleaner.',
  updatedAt: null,
}

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function integer(value: unknown, minimum: number, maximum: number, fallback = minimum) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, Math.round(numeric))) : fallback
}

function optionalInteger(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, Math.round(numeric))) : null
}

function safeUrl(value: unknown, options?: { allowLocal?: boolean }) {
  const candidate = text(value, 1000)
  if (!candidate) return ''
  if (options?.allowLocal && candidate.startsWith('/') && !candidate.startsWith('//')) return candidate
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

export function parseConsumableSettings(value: unknown): ConsumableCatalogSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    defaultMarkupBps: integer(source.defaultMarkupBps ?? source.default_markup_bps, 0, 50_000, DEFAULT_CONSUMABLE_MARKUP_BPS),
    pricesExcludeGst: source.pricesExcludeGst === false || source.prices_exclude_gst === false ? false : true,
    publicNote: text(source.publicNote ?? source.public_note, 500) || DEFAULT_SETTINGS.publicNote,
    updatedAt: text(source.updatedAt ?? source.updated_at, 80) || null,
  }
}

export function parseConsumableProduct(value: unknown, index = 0): ConsumableProduct {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const title = text(source.title, 160)
  const slug = slugifyConsumable(source.slug || title) || `product-${index + 1}`
  return {
    id: text(source.id, 80),
    slug,
    category: text(source.category, 80) || 'Other',
    supplierSku: text(source.supplierSku ?? source.supplier_sku, 120),
    title,
    description: text(source.description, 4000),
    packSize: text(source.packSize ?? source.pack_size, 240),
    supplierCostCents: integer(source.supplierCostCents ?? source.supplier_cost_cents, 0, 100_000_000),
    markupOverrideBps: optionalInteger(source.markupOverrideBps ?? source.markup_override_bps, 0, 50_000),
    finalPriceOverrideCents: optionalInteger(source.finalPriceOverrideCents ?? source.final_price_override_cents, 0, 100_000_000),
    imageUrl: safeUrl(source.imageUrl ?? source.image_url, { allowLocal: true }),
    supplierProductUrl: safeUrl(source.supplierProductUrl ?? source.supplier_product_url),
    active: source.active !== false,
    sortOrder: integer(source.sortOrder ?? source.sort_order, 0, 10_000, index),
    updatedAt: text(source.updatedAt ?? source.updated_at, 80) || null,
  }
}

export function validateConsumableProduct(value: unknown, index = 0): ConsumableProduct {
  const product = parseConsumableProduct(value, index)
  if (!product.title) throw new Error(`Product ${index + 1} needs a title.`)
  if (!product.description) throw new Error(`${product.title} needs a description.`)
  if (!product.packSize) throw new Error(`${product.title} needs a pack or carton size.`)
  if (product.supplierCostCents < 0) throw new Error(`${product.title} has an invalid supplier cost.`)
  return product
}

function mapSettingsRow(row: Record<string, unknown> | null | undefined) {
  return parseConsumableSettings(row ?? DEFAULT_SETTINGS)
}

function mapProductRows(rows: Record<string, unknown>[] | null | undefined) {
  return (rows ?? []).map((row, index) => parseConsumableProduct(row, index))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
}

export async function getConsumablesAdminCatalog(): Promise<ConsumablesAdminCatalog> {
  const db = getAdminSupabase()
  const [settingsResult, productsResult, bucketResult] = await Promise.all([
    db.from('consumable_catalog_settings').select('*').eq('id', true).maybeSingle(),
    db.from('consumable_products').select('*').order('sort_order').order('title'),
    db.storage.getBucket(CONSUMABLE_IMAGE_BUCKET),
  ])
  if (settingsResult.error) throw settingsResult.error
  if (productsResult.error) throw productsResult.error
  return {
    settings: mapSettingsRow(settingsResult.data as Record<string, unknown> | null),
    products: mapProductRows(productsResult.data as Record<string, unknown>[] | null),
    storageReady: !bucketResult.error,
  }
}

export async function getPublicConsumablesCatalog(): Promise<PublicConsumablesCatalog> {
  const db = getAdminSupabase()
  const [settingsResult, productsResult] = await Promise.all([
    db.from('consumable_catalog_settings').select('*').eq('id', true).maybeSingle(),
    db.from('consumable_products').select('*').eq('active', true).order('sort_order').order('title'),
  ])
  if (settingsResult.error) throw settingsResult.error
  if (productsResult.error) throw productsResult.error
  const settings = mapSettingsRow(settingsResult.data as Record<string, unknown> | null)
  const products = mapProductRows(productsResult.data as Record<string, unknown>[] | null)
  const updatedAt = [settings.updatedAt, ...products.map((product) => product.updatedAt)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
  return {
    pricesExcludeGst: settings.pricesExcludeGst,
    publicNote: settings.publicNote,
    updatedAt,
    products: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      category: product.category,
      title: product.title,
      description: product.description,
      packSize: product.packSize,
      imageUrl: product.imageUrl,
      sortOrder: product.sortOrder,
      priceCents: calculateConsumablePriceCents(
        product.supplierCostCents,
        settings.defaultMarkupBps,
        product.markupOverrideBps,
        product.finalPriceOverrideCents,
      ),
    })),
  }
}

async function auditConsumables(action: string, actorId: string, details: Record<string, unknown>) {
  const { error } = await getAdminSupabase().from('admin_audit_log').insert({
    entity_type: 'consumables_catalogue',
    entity_ref: 'catalogue',
    action,
    details: { actorId, ...details },
  })
  if (error) throw error
}

export async function saveConsumableSettings(value: unknown, actorId: string) {
  const settings = parseConsumableSettings(value)
  const updatedAt = new Date().toISOString()
  const { error } = await getAdminSupabase().from('consumable_catalog_settings').upsert({
    id: true,
    default_markup_bps: settings.defaultMarkupBps,
    prices_exclude_gst: settings.pricesExcludeGst,
    public_note: settings.publicNote,
    updated_at: updatedAt,
  })
  if (error) throw error
  await auditConsumables('consumables.settings.updated', actorId, { defaultMarkupBps: settings.defaultMarkupBps })
  return { ...settings, updatedAt }
}

function productDbPayload(product: ConsumableProduct, updatedAt: string) {
  return {
    ...(product.id ? { id: product.id } : {}),
    slug: product.slug,
    category: product.category,
    supplier_sku: product.supplierSku || null,
    title: product.title,
    description: product.description,
    pack_size: product.packSize,
    supplier_cost_cents: product.supplierCostCents,
    markup_override_bps: product.markupOverrideBps,
    final_price_override_cents: product.finalPriceOverrideCents,
    image_url: product.imageUrl || null,
    supplier_product_url: product.supplierProductUrl || null,
    active: product.active,
    sort_order: product.sortOrder,
    archived_at: product.active ? null : updatedAt,
    updated_at: updatedAt,
  }
}

export async function saveConsumableProduct(value: unknown, actorId: string) {
  const product = validateConsumableProduct(value)
  const updatedAt = new Date().toISOString()
  const { data, error } = await getAdminSupabase().from('consumable_products')
    .upsert(productDbPayload(product, updatedAt), { onConflict: product.id ? 'id' : 'slug' })
    .select('*').single()
  if (error) throw error
  const saved = parseConsumableProduct(data as Record<string, unknown>)
  await auditConsumables('consumables.product.saved', actorId, { productId: saved.id, active: saved.active })
  return saved
}

export async function importConsumableProducts(values: unknown, actorId: string) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('The import does not contain any products.')
  if (values.length > MAX_CONSUMABLE_PRODUCTS) throw new Error(`Imports are limited to ${MAX_CONSUMABLE_PRODUCTS} products.`)
  const products = values.map((value, index) => validateConsumableProduct(value, index))
  const existing = await getConsumablesAdminCatalog()
  const bySku = new Map(existing.products.filter((product) => product.supplierSku).map((product) => [product.supplierSku.toLowerCase(), product]))
  const bySlug = new Map(existing.products.map((product) => [product.slug, product]))
  const updatedAt = new Date().toISOString()
  const payload = products.map((product, index) => {
    const matched = (product.supplierSku ? bySku.get(product.supplierSku.toLowerCase()) : null) ?? bySlug.get(product.slug)
    return productDbPayload({
      ...product,
      id: matched?.id ?? randomUUID(),
      category: product.category === 'Other' && matched ? matched.category : product.category,
      imageUrl: product.imageUrl || matched?.imageUrl || '',
      supplierProductUrl: product.supplierProductUrl || matched?.supplierProductUrl || '',
      sortOrder: Number.isFinite(product.sortOrder) ? product.sortOrder : index,
    }, updatedAt)
  })
  const { data, error } = await getAdminSupabase().from('consumable_products')
    .upsert(payload, { onConflict: 'id' }).select('*')
  if (error) throw error
  await auditConsumables('consumables.products.imported', actorId, { count: payload.length })
  return mapProductRows(data as Record<string, unknown>[] | null)
}
