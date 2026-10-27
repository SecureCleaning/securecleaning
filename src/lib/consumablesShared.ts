export const DEFAULT_CONSUMABLE_MARKUP_BPS = 2000
export const MAX_CONSUMABLE_PRODUCTS = 200

export type ConsumableCatalogSettings = {
  defaultMarkupBps: number
  pricesExcludeGst: boolean
  publicNote: string
  updatedAt: string | null
}

export type ConsumableVariant = {
  label: string
  supplierSku: string
  packSize: string
  supplierCostCents: number
  finalPriceOverrideCents: number | null
}

export type ConsumableProduct = {
  variants?: ConsumableVariant[]
  id: string
  slug: string
  category: string
  supplierSku: string
  title: string
  description: string
  packSize: string
  supplierCostCents: number
  markupOverrideBps: number | null
  finalPriceOverrideCents: number | null
  imageUrl: string
  supplierProductUrl: string
  active: boolean
  sortOrder: number
  updatedAt: string | null
}

export type PublicConsumableProduct = Pick<ConsumableProduct,
  'id' | 'slug' | 'category' | 'title' | 'description' | 'packSize' | 'imageUrl' | 'sortOrder'
> & {
  priceCents: number
  variants?: Array<{ label: string; packSize: string; priceCents: number }>
}

export type ConsumablesAdminCatalog = {
  settings: ConsumableCatalogSettings
  products: ConsumableProduct[]
  storageReady: boolean
}

export type PublicConsumablesCatalog = {
  products: PublicConsumableProduct[]
  pricesExcludeGst: boolean
  publicNote: string
  updatedAt: string | null
}

export function slugifyConsumable(value: unknown) {
  return (typeof value === 'string' ? value.trim().slice(0, 120) : '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

export function calculateConsumablePriceCents(
  supplierCostCents: number,
  defaultMarkupBps: number,
  markupOverrideBps?: number | null,
  finalPriceOverrideCents?: number | null,
) {
  if (typeof finalPriceOverrideCents === 'number' && finalPriceOverrideCents >= 0) {
    return Math.round(finalPriceOverrideCents)
  }
  const cost = Number.isFinite(supplierCostCents) ? Math.max(0, Math.round(supplierCostCents)) : 0
  const selectedMarkup = markupOverrideBps ?? defaultMarkupBps
  const markup = Number.isFinite(selectedMarkup) ? Math.min(50_000, Math.max(0, Math.round(selectedMarkup))) : 0
  return Math.round(cost * (10_000 + markup) / 10_000)
}

export function parseConsumableVariants(value: unknown): ConsumableVariant[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 30) throw new Error('Use at most 30 product options.')
  const labels = new Set<string>()
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid product option.')
    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    const packSize = typeof entry.packSize === 'string' ? entry.packSize.trim() : ''
    const cost = entry.supplierCostCents
    const override = entry.finalPriceOverrideCents ?? null
    if (!label || label.length > 120 || !packSize || packSize.length > 240) throw new Error('Each option needs a name and pack size.')
    if (labels.has(label.toLowerCase())) throw new Error('Option names must be unique.')
    labels.add(label.toLowerCase())
    if (!Number.isSafeInteger(cost) || cost < 0 || cost > 100_000_000 ||
        (override !== null && (!Number.isSafeInteger(override) || override < 0 || override > 100_000_000))) {
      throw new Error('Option prices must be valid non-negative amounts.')
    }
    return { label, packSize, supplierCostCents: cost, finalPriceOverrideCents: override,
      supplierSku: typeof entry.supplierSku === 'string' ? entry.supplierSku.trim().slice(0, 120) : '' }
  })
}
