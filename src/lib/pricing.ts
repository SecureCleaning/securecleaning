import { getAdminSupabase } from '@/lib/supabase'
import type { City, CleaningFrequency, PremisesType, TimePreference } from '@/lib/types'

export type PricingItemUnit = 'fixed' | 'count' | 'sqm' | 'flag'

export type PricingItem = {
  id: string
  code: string
  name: string
  unitType: PricingItemUnit
  rate: number
  active: boolean
  notes?: string
}

export type QuotePricingConfig = {
  settings: {
    hourlyRate: number
    minimumInvoice: number
    multiFloorBase: number
    multiFloorPerExtra: number
    springCleanLow: number
    springCleanHigh: number
    rangeLow: number
    rangeHigh: number
  }
  multipliers: {
    premisesType: Record<PremisesType, number>
    frequency: Record<CleaningFrequency, number>
    city: Record<City, number>
    timePreference: Record<TimePreference, number>
  }
  items: PricingItem[]
}

export const DEFAULT_QUOTE_PRICING_CONFIG: QuotePricingConfig = {
  settings: {
    hourlyRate: 55,
    minimumInvoice: 165,
    multiFloorBase: 1,
    multiFloorPerExtra: 0.1,
    springCleanLow: 2,
    springCleanHigh: 3,
    rangeLow: 0.9,
    rangeHigh: 1.1,
  },
  multipliers: {
    premisesType: {
      office: 1,
      medical: 1.4,
      industrial: 1.2,
      childcare: 1.3,
      retail: 1.15,
      gym: 1.15,
      warehouse: 1.2,
      other: 1,
    },
    frequency: {
      daily: 1,
      '3x_week': 1,
      '2x_week': 1,
      weekly: 1.05,
      fortnightly: 1.1,
      once_off: 1.25,
    },
    city: {
      melbourne: 1.08,
      sydney: 1.1,
    },
    timePreference: {
      business_hours: 1,
      after_hours: 1.25,
      weekend: 1.5,
    },
  },
  items: [
    { id: 'bathrooms', code: 'bathrooms', name: 'Bathrooms', unitType: 'count', rate: 30, active: true, notes: 'Per bathroom per visit' },
    { id: 'kitchens', code: 'kitchens', name: 'Kitchens / kitchenettes', unitType: 'count', rate: 50, active: true, notes: 'Per kitchen per visit' },
    { id: 'windows', code: 'windows', name: 'External windows', unitType: 'count', rate: 15, active: true, notes: 'Per window per visit' },
    { id: 'consumables', code: 'consumables', name: 'Consumables supply', unitType: 'fixed', rate: 25, active: false, notes: 'Handled separately outside public quote flow' },
    { id: 'highTouchDisinfection', code: 'highTouchDisinfection', name: 'High-touch disinfection', unitType: 'sqm', rate: 0.04, active: true, notes: 'Per sqm per visit when selected' },
    { id: 'carpetSteam', code: 'carpetSteam', name: 'Carpet steam cleaning', unitType: 'flag', rate: 0, active: true, notes: 'Quoted separately — informational only' },
  ],
}

const PRICING_CONTENT_KEY = 'pricing.config'
const PRICING_CONTENT_TITLE = 'Quote pricing configuration'

function cloneDefaultConfig(): QuotePricingConfig {
  return JSON.parse(JSON.stringify(DEFAULT_QUOTE_PRICING_CONFIG)) as QuotePricingConfig
}

function mergeConfig(candidate: unknown): QuotePricingConfig {
  const fallback = cloneDefaultConfig()

  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const source = candidate as Partial<QuotePricingConfig>

  return {
    settings: {
      hourlyRate: Number(source.settings?.hourlyRate ?? fallback.settings.hourlyRate),
      minimumInvoice: Number(source.settings?.minimumInvoice ?? fallback.settings.minimumInvoice),
      multiFloorBase: Number(source.settings?.multiFloorBase ?? fallback.settings.multiFloorBase),
      multiFloorPerExtra: Number(source.settings?.multiFloorPerExtra ?? fallback.settings.multiFloorPerExtra),
      springCleanLow: Number(source.settings?.springCleanLow ?? fallback.settings.springCleanLow),
      springCleanHigh: Number(source.settings?.springCleanHigh ?? fallback.settings.springCleanHigh),
      rangeLow: Number(source.settings?.rangeLow ?? fallback.settings.rangeLow),
      rangeHigh: Number(source.settings?.rangeHigh ?? fallback.settings.rangeHigh),
    },
    multipliers: {
      premisesType: {
        ...fallback.multipliers.premisesType,
        ...(source.multipliers?.premisesType ?? {}),
      },
      frequency: {
        ...fallback.multipliers.frequency,
        ...(source.multipliers?.frequency ?? {}),
      },
      city: {
        ...fallback.multipliers.city,
        ...(source.multipliers?.city ?? {}),
      },
      timePreference: {
        ...fallback.multipliers.timePreference,
        ...(source.multipliers?.timePreference ?? {}),
      },
    },
    items: Array.isArray(source.items)
      ? source.items.map((item, index) => ({
          id: String(item?.id ?? item?.code ?? `item-${index + 1}`),
          code: String(item?.code ?? `item_${index + 1}`),
          name: String(item?.name ?? `Item ${index + 1}`),
          unitType: ['fixed', 'count', 'sqm', 'flag'].includes(String(item?.unitType))
            ? (String(item?.unitType) as PricingItemUnit)
            : 'fixed',
          rate: Number(item?.rate ?? 0),
          active: Boolean(item?.active ?? true),
          notes: typeof item?.notes === 'string' ? item.notes : '',
        }))
      : fallback.items,
  }
}

export async function getQuotePricingConfig(): Promise<QuotePricingConfig> {
  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('site_content')
      .select('content')
      .eq('key', PRICING_CONTENT_KEY)
      .maybeSingle()

    if (error || !data?.content) {
      if (error) {
        console.error('[pricing] Failed to load pricing config:', error)
      }
      return cloneDefaultConfig()
    }

    return mergeConfig(JSON.parse(data.content))
  } catch (error) {
    console.error('[pricing] Unexpected error loading pricing config:', error)
    return cloneDefaultConfig()
  }
}

export async function saveQuotePricingConfig(config: QuotePricingConfig): Promise<QuotePricingConfig> {
  const db = getAdminSupabase()
  const merged = mergeConfig(config)

  const { error } = await db
    .from('site_content')
    .upsert({
      key: PRICING_CONTENT_KEY,
      title: PRICING_CONTENT_TITLE,
      content: JSON.stringify(merged),
      group_name: 'pricing',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) {
    throw error
  }

  return merged
}
