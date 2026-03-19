import type {
  QuoteInputs,
  QuoteResult,
  QuoteBreakdown,
  AddOnsDetail,
  PremisesType,
  CleaningFrequency,
  City,
} from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURLY_RATE = 55 // AUD per hour
const MINIMUM_INVOICE = 165 // AUD minimum per visit

const PREMISES_MULTIPLIERS: Record<PremisesType, number> = {
  office: 1.0,
  medical: 1.4,
  industrial: 1.2,
  childcare: 1.3,
  retail: 1.15,
  gym: 1.15,
  warehouse: 1.2,
  other: 1.0,
}

const FREQUENCY_MULTIPLIERS: Record<CleaningFrequency, number> = {
  daily: 1.0,
  '3x_week': 1.0,
  '2x_week': 1.0,
  weekly: 1.05,
  fortnightly: 1.1,
  once_off: 1.25,
}

const CITY_MULTIPLIERS: Record<City, number> = {
  sydney: 1.1,
  melbourne: 1.08,
}

const AFTER_HOURS_MULTIPLIER = 1.25
const WEEKEND_MULTIPLIER = 1.5
const MULTI_FLOOR_BASE = 1.0
const MULTI_FLOOR_PER_EXTRA = 0.1

// Add-on rates
const BATHROOM_RATE = 30    // per bathroom per visit
const KITCHEN_RATE = 50     // per kitchen per visit
const WINDOW_RATE = 15      // per external window per visit
const CONSUMABLES_FLAT = 25 // flat per visit
const HIGH_TOUCH_RATE = 0.04 // per sqm per visit

// Spring clean multipliers
const SPRING_CLEAN_LOW = 2.0
const SPRING_CLEAN_HIGH = 3.0

// Price range factors
const RANGE_LOW = 0.9
const RANGE_HIGH = 1.1

// ─── Core Calculation ─────────────────────────────────────────────────────────

export function calculateQuote(inputs: QuoteInputs): QuoteResult {
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

  // 1. Base time & labour
  const baseTime = floorArea / 400
  const baseLabour = baseTime * HOURLY_RATE

  // 2. Premises multiplier
  const premisesMultiplier = PREMISES_MULTIPLIERS[premisesType] ?? 1.0

  // 3. Multi-floor multiplier
  const extraFloors = Math.max(0, (floors ?? 1) - 1)
  const floorsMultiplier = MULTI_FLOOR_BASE + extraFloors * MULTI_FLOOR_PER_EXTRA

  // 4. Time-of-day multiplier
  let timeMultiplier = 1.0
  if (timePreference === 'weekend') {
    timeMultiplier = WEEKEND_MULTIPLIER
  } else if (timePreference === 'after_hours') {
    timeMultiplier = AFTER_HOURS_MULTIPLIER
  }

  // 5. Frequency multiplier
  const frequencyMultiplier = FREQUENCY_MULTIPLIERS[frequency] ?? 1.0

  // 6. City multiplier
  const cityMultiplier = CITY_MULTIPLIERS[city] ?? 1.0

  // 7. Compute base (before add-ons)
  const baseLaborAdjusted =
    baseLabour *
    premisesMultiplier *
    floorsMultiplier *
    timeMultiplier *
    frequencyMultiplier *
    cityMultiplier

  // 8. Add-ons
  const bathroomsTotal = (addOns.bathrooms ?? 0) * BATHROOM_RATE
  const kitchensTotal = (addOns.kitchens ?? 0) * KITCHEN_RATE
  const windowsTotal = (addOns.windows ?? 0) * WINDOW_RATE
  const consumablesTotal = addOns.consumables ? CONSUMABLES_FLAT : 0
  const highTouchTotal = addOns.highTouchDisinfection ? floorArea * HIGH_TOUCH_RATE : 0
  const carpetSteam = addOns.carpetSteam === true

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

  // 9. Total per visit (base + add-ons), before spring clean
  const rawTotal = baseLaborAdjusted + addOnsTotal

  // 10. Spring clean override
  let perVisitLow: number
  let perVisitHigh: number

  if (isSpringClean) {
    perVisitLow = rawTotal * SPRING_CLEAN_LOW
    perVisitHigh = rawTotal * SPRING_CLEAN_HIGH
  } else {
    perVisitLow = rawTotal * RANGE_LOW
    perVisitHigh = rawTotal * RANGE_HIGH
  }

  // 11. Apply minimum
  perVisitLow = Math.max(perVisitLow, MINIMUM_INVOICE)
  perVisitHigh = Math.max(perVisitHigh, MINIMUM_INVOICE)

  // Round to 2dp
  perVisitLow = Math.round(perVisitLow * 100) / 100
  perVisitHigh = Math.round(perVisitHigh * 100) / 100

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
    baseLow: Math.round(baseLaborAdjusted * RANGE_LOW * 100) / 100,
    baseHigh: Math.round(baseLaborAdjusted * RANGE_HIGH * 100) / 100,
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

// ─── Helper: Format currency ──────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── Helper: Generate quote reference ────────────────────────────────────────

export function generateQuoteRef(): string {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `SC-${ymd}-${rand}`
}
