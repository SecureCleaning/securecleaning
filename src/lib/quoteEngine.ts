import type {
  QuoteInputs,
  QuoteResult,
  QuoteBreakdown,
  AddOnsDetail,
} from './types'
import type { QuotePricingConfig } from './pricing'
import { DEFAULT_QUOTE_PRICING_CONFIG } from './pricing'

function getPricingItemRate(config: QuotePricingConfig, code: string) {
  const item = config.items.find((entry) => entry.code === code && entry.active)
  return item?.rate ?? 0
}

export function calculateQuote(
  inputs: QuoteInputs,
  pricingConfig: QuotePricingConfig = DEFAULT_QUOTE_PRICING_CONFIG
): QuoteResult {
  const {
    floorArea,
    floors,
    premisesType,
    timePreference,
    frequency,
    city,
    addOns,
    isSpringClean = false,
  } = inputs

  const settings = pricingConfig.settings

  const baseTime = floorArea / 400
  const baseLabour = baseTime * settings.hourlyRate

  const premisesMultiplier = pricingConfig.multipliers.premisesType[premisesType] ?? 1.0
  const extraFloors = Math.max(0, (floors ?? 1) - 1)
  const floorsMultiplier = settings.multiFloorBase + extraFloors * settings.multiFloorPerExtra
  const timeMultiplier = pricingConfig.multipliers.timePreference[timePreference] ?? 1.0
  const frequencyMultiplier = pricingConfig.multipliers.frequency[frequency] ?? 1.0
  const cityMultiplier = pricingConfig.multipliers.city[city] ?? 1.0

  const baseLaborAdjusted =
    baseLabour *
    premisesMultiplier *
    floorsMultiplier *
    timeMultiplier *
    frequencyMultiplier *
    cityMultiplier

  const bathroomsTotal = (addOns.bathrooms ?? 0) * getPricingItemRate(pricingConfig, 'bathrooms')
  const kitchensTotal = (addOns.kitchens ?? 0) * getPricingItemRate(pricingConfig, 'kitchens')
  const windowsTotal = (addOns.windows ?? 0) * getPricingItemRate(pricingConfig, 'windows')
  const consumablesTotal = addOns.consumables ? getPricingItemRate(pricingConfig, 'consumables') : 0
  const highTouchRate = getPricingItemRate(pricingConfig, 'highTouchDisinfection')
  const highTouchTotal = addOns.highTouchDisinfection ? floorArea * highTouchRate : 0
  const carpetSteamActive = pricingConfig.items.some((item) => item.code === 'carpetSteam' && item.active)
  const carpetSteam = carpetSteamActive && addOns.carpetSteam === true

  const addOnsTotal =
    bathroomsTotal + kitchensTotal + windowsTotal + consumablesTotal + highTouchTotal

  const addOnsDetail: AddOnsDetail = {
    bathroomsTotal,
    kitchensTotal,
    windowsTotal,
    consumablesTotal,
    highTouchTotal,
    carpetSteam,
  }

  const rawTotal = baseLaborAdjusted + addOnsTotal

  let perVisitLow: number
  let perVisitHigh: number

  if (isSpringClean) {
    perVisitLow = rawTotal * settings.springCleanLow
    perVisitHigh = rawTotal * settings.springCleanHigh
  } else {
    perVisitLow = rawTotal * settings.rangeLow
    perVisitHigh = rawTotal * settings.rangeHigh
  }

  perVisitLow = Math.max(perVisitLow, settings.minimumInvoice)
  perVisitHigh = Math.max(perVisitHigh, settings.minimumInvoice)

  perVisitLow = Math.round(perVisitLow * 100) / 100
  perVisitHigh = Math.round(perVisitHigh * 100) / 100

  const rangeLow = settings.rangeLow
  const rangeHigh = settings.rangeHigh

  const breakdown: QuoteBreakdown = {
    baseTime,
    baseLabour,
    premisesMultiplier,
    floorsMultiplier,
    timeMultiplier,
    frequencyMultiplier,
    cityMultiplier,
    addOnsDetail,
  }

  return {
    baseLow: Math.round(baseLaborAdjusted * rangeLow * 100) / 100,
    baseHigh: Math.round(baseLaborAdjusted * rangeHigh * 100) / 100,
    perVisitLow,
    perVisitHigh,
    addOnsTotal: Math.round(addOnsTotal * 100) / 100,
    totalLow: perVisitLow,
    totalHigh: perVisitHigh,
    isSpringClean,
    carpetSteamSeparate: carpetSteam,
    estimatedHours: Math.round(baseTime * floorsMultiplier * 10) / 10,
    breakdown,
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function generateQuoteRef(): string {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `SC-${ymd}-${rand}`
}
