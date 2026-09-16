export const DEFAULT_CONSUMABLE_MARKUP_BPS = 2000
export const MAX_CONSUMABLE_PRODUCTS = 200

export type ConsumableCatalogSettings = {
  defaultMarkupBps: number
  pricesExcludeGst: boolean
  publicNote: string
  updatedAt: string | null
}

export type ConsumableProduct = {
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
