import { getAdminSupabase } from '@/lib/supabase'
import type { QuotePricingConfig } from '@/lib/pricing'
import type { CleaningFrequency } from '@/lib/types'

export type RoomMetricInputType = 'integer' | 'number' | 'boolean'
export type RoomTaskCadence = 'every_clean' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually'

export const ROOM_TASK_CADENCE_OPTIONS: Array<{ value: RoomTaskCadence; label: string }> = [
  { value: 'every_clean', label: 'Every clean' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
]

const ROOM_TASK_CADENCE_LABELS = Object.fromEntries(
  ROOM_TASK_CADENCE_OPTIONS.map((option) => [option.value, option.label])
) as Record<RoomTaskCadence, string>

const VISITS_PER_YEAR: Record<CleaningFrequency, number> = {
  daily: 260,
  '3x_week': 156,
  '2x_week': 104,
  weekly: 52,
  fortnightly: 26,
  once_off: 1,
}

const TASK_OCCURRENCES_PER_YEAR: Record<RoomTaskCadence, number> = {
  every_clean: 0,
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  annually: 1,
}

export type RoomMetricFieldConfig = {
  id: string
  label: string
  inputType: RoomMetricInputType
  defaultValue: number | boolean
  includedUnits?: number
  pricePerUnit?: number
  cadence?: RoomTaskCadence
  helpText?: string
}

export type RoomTypeConfig = {
  id: string
  label: string
  defaultLabel: string
  tracksSize: boolean
  defaultSize: number
  defaultMopping: boolean
  moppingCadence?: RoomTaskCadence
  scopeTasks: string[]
  scopeTaskCadences?: RoomTaskCadence[]
  scopeTaskPrices?: number[]
  pricingAdjustmentPercent: number
  fixedPricePerVisit: number
  fields: RoomMetricFieldConfig[]
}

export type QuoteRoomTypeConfig = {
  roomTypes: RoomTypeConfig[]
}

const BATHROOM_ROOM_TYPE_IDS = new Set(['bathroom', 'female_bathroom', 'male_bathroom', 'accessible_bathroom'])

function isRoomTaskCadence(value: unknown): value is RoomTaskCadence {
  return ROOM_TASK_CADENCE_OPTIONS.some((option) => option.value === value)
}

export function inferRoomTaskCadence(label: string): RoomTaskCadence {
  const normalized = label.trim().toLowerCase()
  if (normalized.includes('cobweb')) return 'monthly'
  if (normalized.includes('dust')) return 'weekly'
  return 'every_clean'
}

export function getRoomTaskCadenceLabel(cadence: RoomTaskCadence) {
  return ROOM_TASK_CADENCE_LABELS[cadence] ?? 'Every clean'
}

export function getRoomScopeTaskCadence(roomType: RoomTypeConfig, index: number) {
  const configured = roomType.scopeTaskCadences?.[index]
  return isRoomTaskCadence(configured)
    ? configured
    : inferRoomTaskCadence(roomType.scopeTasks[index] ?? '')
}

export function getRoomScopeTaskPrice(roomType: RoomTypeConfig, index: number) {
  const price = Number(roomType.scopeTaskPrices?.[index] ?? 0)
  return Number.isFinite(price) ? Math.max(0, price) : 0
}

export type RoomScopeTaskSchedule = {
  label: string
  cadence: RoomTaskCadence
}

export function getRoomScopeTaskSchedule(roomType: RoomTypeConfig): RoomScopeTaskSchedule[] {
  return roomType.scopeTasks.map((label, index) => ({
    label,
    cadence: getRoomScopeTaskCadence(roomType, index),
  }))
}

export function getRoomTaskAmortizationFactor(cadence: RoomTaskCadence, frequency: CleaningFrequency) {
  if (cadence === 'every_clean' || frequency === 'once_off') return 1
  const visits = VISITS_PER_YEAR[frequency] || 1
  return Math.min(1, TASK_OCCURRENCES_PER_YEAR[cadence] / visits)
}

function getDefaultMetricCharge(field: RoomMetricFieldConfig) {
  const pricePerUnit = Number(field.pricePerUnit ?? 0)
  if (field.inputType === 'boolean') {
    return field.defaultValue === true ? pricePerUnit : 0
  }

  const defaultValue = Math.max(0, Number(field.defaultValue ?? 0))
  const includedUnits = Math.max(0, Number(field.includedUnits ?? 0))
  return Math.max(0, defaultValue - includedUnits) * pricePerUnit
}

export function getRoomTypeDefaultDirectCharge(roomType: RoomTypeConfig, pricingConfig: QuotePricingConfig) {
  const pricingItemCode = BATHROOM_ROOM_TYPE_IDS.has(roomType.id)
    ? 'bathrooms'
    : roomType.id === 'kitchen' ? 'kitchens' : null
  const configuredRoomCharge = pricingItemCode
    ? pricingConfig.items.find((item) => item.code === pricingItemCode && item.active)?.rate ?? 0
    : 0
  const defaultMetricCharges = roomType.fields.reduce(
    (total, field) => total + getDefaultMetricCharge(field),
    0
  )

  return Math.max(0, roomType.fixedPricePerVisit) + configuredRoomCharge + defaultMetricCharges
}

const SUGGESTED_ROOM_PRICES: Record<string, number> = {
  office: 3,
  boardroom: 5.5,
  reception: 3,
  hallway: 4,
  bathroom: 7.5,
  female_bathroom: 7.5,
  male_bathroom: 7.5,
  accessible_bathroom: 10,
  kitchen: 14,
  breakout: 5.5,
  stairs: 4,
  storage: 3,
  warehouse: 8,
  medical_room: 8,
  other: 5,
}

function suggestedRoomPrice(roomType: RoomTypeConfig) {
  if (SUGGESTED_ROOM_PRICES[roomType.id] !== undefined) return SUGGESTED_ROOM_PRICES[roomType.id]
  const label = roomType.label.toLowerCase()
  if (label.includes('open') && label.includes('office')) return 4
  if (label.includes('childcare') && (label.includes('bath') || label.includes('toilet'))) return 10
  if (label.includes('bath') || label.includes('toilet')) return 7.5
  if (label.includes('kitchen')) return 14
  if (label.includes('office')) return 3
  return 5
}

function suggestedScopeCadence(roomType: RoomTypeConfig, task: string): RoomTaskCadence {
  const normalized = task.toLowerCase()
  if (normalized.includes('cobweb')) return 'monthly'
  if (normalized.includes('dust')) return 'weekly'
  const isWetArea = BATHROOM_ROOM_TYPE_IDS.has(roomType.id) || roomType.id === 'kitchen'
  if (!isWetArea && normalized.includes('wipe') && normalized.includes('surface')) return 'weekly'
  return 'every_clean'
}

function suggestedFieldPrice(field: RoomMetricFieldConfig) {
  const key = `${field.id} ${field.label}`.toLowerCase()
  if (key.includes('accessible') || key.includes('disabled')) return 4.5
  if (key.includes('sanitary')) return 1.5
  if (key.includes('shower')) return 2.75
  if (key.includes('toilet') || key.includes('urinal')) return 3
  if (key.includes('basin') || key.includes('mirror')) return 2
  if (key.includes('mop')) return 1.5
  if (key.includes('desk')) return 1
  if (key.includes('bin') || key.includes('door')) return 0.75
  return Math.max(0, Number(field.pricePerUnit ?? 0))
}

export function applySuggestedRoomTypePrices(
  config: QuoteRoomTypeConfig,
  pricingConfig: QuotePricingConfig
): QuoteRoomTypeConfig {
  return {
    roomTypes: config.roomTypes.map((roomType) => {
      const target = suggestedRoomPrice(roomType)
      const isWetArea = BATHROOM_ROOM_TYPE_IDS.has(roomType.id) || roomType.id === 'kitchen'
      const hasCobwebTask = roomType.scopeTasks.some((task) => task.toLowerCase().includes('cobweb'))
      const scopeTasks = !isWetArea && !hasCobwebTask
        ? ['Remove visible cobwebs from ceilings and corners', ...roomType.scopeTasks]
        : [...roomType.scopeTasks]
      const fields = roomType.fields.map((field) => ({
        ...field,
        pricePerUnit: suggestedFieldPrice(field),
        cadence: field.cadence ?? inferRoomTaskCadence(field.label),
        includedUnits: field.inputType === 'boolean'
          ? field.includedUnits
          : Math.max(Number(field.includedUnits ?? 0), Number(field.defaultValue ?? 0)),
      }))
      const withoutFixed = {
        ...roomType,
        fields,
        scopeTasks,
        scopeTaskCadences: scopeTasks.map((task) => suggestedScopeCadence(roomType, task)),
        scopeTaskPrices: scopeTasks.map((task) => {
          const existingIndex = roomType.scopeTasks.indexOf(task)
          return existingIndex >= 0 ? getRoomScopeTaskPrice(roomType, existingIndex) : 0
        }),
        fixedPricePerVisit: 0,
      }
      return {
        ...withoutFixed,
        fixedPricePerVisit: Math.max(0, Math.round((target - getRoomTypeDefaultDirectCharge(withoutFixed, pricingConfig)) * 100) / 100),
      }
    }),
  }
}

const ROOM_TYPE_CONTENT_KEY = 'quote_room_types.config'
const ROOM_TYPE_CONTENT_TITLE = 'Quote room type configuration'

export const DEFAULT_QUOTE_ROOM_TYPE_CONFIG: QuoteRoomTypeConfig = {
  roomTypes: [
    {
      id: 'office',
      label: 'Office',
      defaultLabel: 'Office area',
      tracksSize: true,
      defaultSize: 20,
      defaultMopping: false,
      scopeTasks: ['Vacuum carpeted areas', 'Mop hard floors', 'Wipe reachable surfaces', 'Empty bins', 'Clean high-touch points'],
      pricingAdjustmentPercent: 15,
      fixedPricePerVisit: 0,
      fields: [
        {
          id: 'bins',
          label: 'Bins',
          inputType: 'integer',
          defaultValue: 1,
          includedUnits: 1,
          pricePerUnit: 0.7,
          helpText: 'One bin is included; each additional bin adds $0.70 per visit.',
        },
      ],
    },
    {
      id: 'boardroom',
      label: 'Boardroom / Meeting Room',
      defaultLabel: 'Boardroom',
      tracksSize: true,
      defaultSize: 18,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop floors', 'Wipe tables and reachable surfaces', 'Empty bins', 'Clean high-touch points'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'reception',
      label: 'Reception / Waiting Area',
      defaultLabel: 'Reception',
      tracksSize: true,
      defaultSize: 25,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop entry and waiting areas', 'Wipe reception counters and reachable surfaces', 'Empty bins', 'Clean high-touch points'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'hallway',
      label: 'Hallway / Common Area',
      defaultLabel: 'Hallway',
      tracksSize: true,
      defaultSize: 12,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop circulation areas', 'Spot clean visible marks', 'Clean high-touch points'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'bathroom',
      label: 'Bathroom / Amenities',
      defaultLabel: 'Bathroom',
      tracksSize: false,
      defaultSize: 0,
      defaultMopping: true,
      scopeTasks: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [
        { id: 'toilets', label: 'Toilets', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 3, helpText: 'One toilet is included; each additional toilet adds $3.00 per visit.' },
        { id: 'basins', label: 'Basins', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One basin is included; each additional basin adds $2.00 per visit.' },
        { id: 'mirrors', label: 'Mirrors', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One mirror is included; each additional mirror adds $2.00 per visit.' },
        { id: 'urinals', label: 'Urinals', inputType: 'integer', defaultValue: 0, pricePerUnit: 2.5, helpText: 'Each urinal adds $2.50 per visit.' },
        { id: 'disabled_toilet', label: 'Disabled toilet', inputType: 'integer', defaultValue: 0, pricePerUnit: 4.5, helpText: 'Each disabled toilet adds $4.50 per visit.' },
      ],
    },
    {
      id: 'female_bathroom',
      label: 'Female Bathroom',
      defaultLabel: 'Female bathroom',
      tracksSize: false,
      defaultSize: 0,
      defaultMopping: true,
      scopeTasks: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [
        { id: 'toilets', label: 'Toilets', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 3, helpText: 'One toilet is included; each additional toilet adds $3.00 per visit.' },
        { id: 'basins', label: 'Basins', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One basin is included; each additional basin adds $2.00 per visit.' },
        { id: 'mirrors', label: 'Mirrors', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One mirror is included; each additional mirror adds $2.00 per visit.' },
        { id: 'urinals', label: 'Urinals', inputType: 'integer', defaultValue: 0, pricePerUnit: 2.5, helpText: 'Each urinal adds $2.50 per visit.' },
        { id: 'disabled_toilet', label: 'Disabled toilet', inputType: 'integer', defaultValue: 0, pricePerUnit: 4.5, helpText: 'Each disabled toilet adds $4.50 per visit.' },
      ],
    },
    {
      id: 'male_bathroom',
      label: 'Male Bathroom',
      defaultLabel: 'Male bathroom',
      tracksSize: false,
      defaultSize: 0,
      defaultMopping: true,
      scopeTasks: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [
        { id: 'toilets', label: 'Toilets', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 3, helpText: 'One toilet is included; each additional toilet adds $3.00 per visit.' },
        { id: 'basins', label: 'Basins', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One basin is included; each additional basin adds $2.00 per visit.' },
        { id: 'mirrors', label: 'Mirrors', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One mirror is included; each additional mirror adds $2.00 per visit.' },
        { id: 'urinals', label: 'Urinals', inputType: 'integer', defaultValue: 1, pricePerUnit: 2.5, helpText: 'Each urinal adds $2.50 per visit.' },
        { id: 'disabled_toilet', label: 'Disabled toilet', inputType: 'integer', defaultValue: 0, pricePerUnit: 4.5, helpText: 'Each disabled toilet adds $4.50 per visit.' },
      ],
    },
    {
      id: 'accessible_bathroom',
      label: 'Accessible / Disabled Bathroom',
      defaultLabel: 'Accessible bathroom',
      tracksSize: false,
      defaultSize: 0,
      defaultMopping: true,
      scopeTasks: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [
        { id: 'toilets', label: 'Toilets', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 3, helpText: 'One toilet is included; each additional toilet adds $3.00 per visit.' },
        { id: 'basins', label: 'Basins', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One basin is included; each additional basin adds $2.00 per visit.' },
        { id: 'mirrors', label: 'Mirrors', inputType: 'integer', defaultValue: 1, includedUnits: 1, pricePerUnit: 2, helpText: 'One mirror is included; each additional mirror adds $2.00 per visit.' },
        { id: 'urinals', label: 'Urinals', inputType: 'integer', defaultValue: 0, pricePerUnit: 2.5, helpText: 'Each urinal adds $2.50 per visit.' },
        { id: 'disabled_toilet', label: 'Disabled toilet', inputType: 'integer', defaultValue: 1, pricePerUnit: 4.5, helpText: 'Each disabled toilet adds $4.50 per visit.' },
      ],
    },
    {
      id: 'kitchen',
      label: 'Kitchen',
      defaultLabel: 'Kitchen / kitchenette',
      tracksSize: false,
      defaultSize: 0,
      defaultMopping: true,
      scopeTasks: ['Wipe benches, tables and splashbacks', 'Clean sinks and taps', 'Wipe appliance exteriors', 'Mop floors', 'Empty bins'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'breakout',
      label: 'Breakout / Staff Area',
      defaultLabel: 'Breakout area',
      tracksSize: true,
      defaultSize: 15,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop floors', 'Wipe tables, benches and reachable surfaces', 'Clean high-touch points', 'Empty bins'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'stairs',
      label: 'Stairs / Landing',
      defaultLabel: 'Stairs / landing',
      tracksSize: true,
      defaultSize: 8,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop steps and landings', 'Wipe reachable rails', 'Spot clean visible marks'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'storage',
      label: 'Storage / Utility',
      defaultLabel: 'Storage',
      tracksSize: true,
      defaultSize: 10,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop accessible floor areas', 'Wipe reachable surfaces', 'Empty bins where provided'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'warehouse',
      label: 'Warehouse / Open Area',
      defaultLabel: 'Warehouse area',
      tracksSize: true,
      defaultSize: 60,
      defaultMopping: false,
      scopeTasks: ['Sweep or mop accessible hard floors', 'Spot clean visible marks', 'Empty bins where provided'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'medical_room',
      label: 'Medical / Treatment Room',
      defaultLabel: 'Treatment room',
      tracksSize: true,
      defaultSize: 14,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop floors', 'Wipe reachable surfaces', 'Clean high-touch points', 'Empty bins where provided'],
      pricingAdjustmentPercent: 20,
      fixedPricePerVisit: 0,
      fields: [],
    },
    {
      id: 'other',
      label: 'Other',
      defaultLabel: 'Other area',
      tracksSize: true,
      defaultSize: 15,
      defaultMopping: false,
      scopeTasks: ['Vacuum or mop accessible floor areas', 'Wipe reachable surfaces', 'Clean high-touch points', 'Empty bins where provided'],
      pricingAdjustmentPercent: 0,
      fixedPricePerVisit: 0,
      fields: [],
    },
  ],
}

function cloneDefaultConfig(): QuoteRoomTypeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_QUOTE_ROOM_TYPE_CONFIG)) as QuoteRoomTypeConfig
}

function normalizeField(candidate: unknown, index: number): RoomMetricFieldConfig {
  const source = candidate && typeof candidate === 'object' ? candidate as Partial<RoomMetricFieldConfig> : {}
  const inputType = source.inputType === 'number' || source.inputType === 'boolean' ? source.inputType : 'integer'
  const defaultValue = inputType === 'boolean'
    ? Boolean(source.defaultValue)
    : Number.isFinite(Number(source.defaultValue)) ? Number(source.defaultValue) : 0

  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim().slice(0, 64) : `field_${index + 1}`,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim().slice(0, 100) : `Field ${index + 1}`,
    inputType,
    defaultValue,
    includedUnits: Number.isFinite(Number(source.includedUnits)) ? Math.max(0, Number(source.includedUnits)) : 0,
    pricePerUnit: Number.isFinite(Number(source.pricePerUnit)) ? Math.min(100_000, Math.max(0, Number(source.pricePerUnit))) : 0,
    cadence: isRoomTaskCadence(source.cadence) ? source.cadence : 'every_clean',
    helpText: typeof source.helpText === 'string' ? source.helpText.trim().slice(0, 120) : '',
  }
}

function normalizeRoomType(candidate: unknown, index: number): RoomTypeConfig {
  const defaults = cloneDefaultConfig().roomTypes
  const source = candidate && typeof candidate === 'object' ? candidate as Partial<RoomTypeConfig> : {}
  const sourceId = typeof source.id === 'string' ? source.id.trim() : ''
  const fallback = defaults.find((roomType) => roomType.id === sourceId) ?? defaults[index] ?? defaults.at(-1)!
  const scopeTasks = Array.isArray(source.scopeTasks)
    ? source.scopeTasks.slice(0, 80).filter((task): task is string => typeof task === 'string').map((task) => task.trim().slice(0, 240)).filter(Boolean)
    : fallback.scopeTasks
  const sourceCadences = Array.isArray(source.scopeTaskCadences) ? source.scopeTaskCadences : []
  const sourcePrices = Array.isArray(source.scopeTaskPrices) ? source.scopeTaskPrices : []
  const fallbackCadences = fallback.scopeTaskCadences ?? []
  const fallbackPrices = fallback.scopeTaskPrices ?? []

  return {
    id: sourceId || fallback.id,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim().slice(0, 100) : fallback.label,
    defaultLabel:
      typeof source.defaultLabel === 'string' && source.defaultLabel.trim() ? source.defaultLabel.trim().slice(0, 100) : fallback.defaultLabel,
    tracksSize: typeof source.tracksSize === 'boolean' ? source.tracksSize : fallback.tracksSize,
    defaultSize: Number.isFinite(Number(source.defaultSize)) ? Math.min(1_000_000, Math.max(0, Number(source.defaultSize))) : fallback.defaultSize,
    defaultMopping: typeof source.defaultMopping === 'boolean' ? source.defaultMopping : fallback.defaultMopping,
    moppingCadence: isRoomTaskCadence(source.moppingCadence) ? source.moppingCadence : fallback.moppingCadence ?? 'every_clean',
    scopeTasks,
    scopeTaskCadences: scopeTasks.map((task, taskIndex) => {
      const cadence = sourceCadences[taskIndex] ?? fallbackCadences[taskIndex]
      return isRoomTaskCadence(cadence) ? cadence : inferRoomTaskCadence(task)
    }),
    scopeTaskPrices: scopeTasks.map((_, taskIndex) => {
      const price = Number(sourcePrices[taskIndex] ?? fallbackPrices[taskIndex] ?? 0)
      return Number.isFinite(price) ? Math.min(100_000, Math.max(0, price)) : 0
    }),
    pricingAdjustmentPercent: Number.isFinite(Number(source.pricingAdjustmentPercent))
      ? Math.min(1_000, Math.max(-100, Number(source.pricingAdjustmentPercent)))
      : fallback.pricingAdjustmentPercent,
    fixedPricePerVisit: Number.isFinite(Number(source.fixedPricePerVisit))
      ? Math.max(0, Number(source.fixedPricePerVisit))
      : fallback.fixedPricePerVisit,
    fields: Array.isArray(source.fields) ? source.fields.slice(0, 50).map(normalizeField) : fallback.fields,
  }
}

function mergeConfig(candidate: unknown): QuoteRoomTypeConfig {
  const fallback = cloneDefaultConfig()

  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const source = candidate as Partial<QuoteRoomTypeConfig>
  if (!Array.isArray(source.roomTypes) || source.roomTypes.length === 0) {
    return fallback
  }

  const configuredIds = new Set(
    source.roomTypes.slice(0, 50)
      .map((roomType) => typeof roomType?.id === 'string' ? roomType.id.trim() : '')
      .filter(Boolean)
  )

  return {
    roomTypes: [
      ...source.roomTypes.slice(0, 50).map(normalizeRoomType),
      ...fallback.roomTypes.filter((roomType) => !configuredIds.has(roomType.id)),
    ],
  }
}

export function getRoomTypeConfigById(config: QuoteRoomTypeConfig, id: string) {
  return config.roomTypes.find((roomType) => roomType.id === id)
}

export async function getQuoteRoomTypeConfig(): Promise<QuoteRoomTypeConfig> {
  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('site_content')
      .select('content')
      .eq('key', ROOM_TYPE_CONTENT_KEY)
      .maybeSingle()

    if (error || !data?.content) {
      if (error) {
        console.error('[roomTypeConfig] Failed to load room type config:', error)
      }
      return cloneDefaultConfig()
    }

    return mergeConfig(JSON.parse(data.content))
  } catch (error) {
    console.error('[roomTypeConfig] Unexpected error loading room type config:', error)
    return cloneDefaultConfig()
  }
}

export async function saveQuoteRoomTypeConfig(config: QuoteRoomTypeConfig): Promise<QuoteRoomTypeConfig> {
  const db = getAdminSupabase()
  const merged = mergeConfig(config)

  const { error } = await db
    .from('site_content')
    .upsert({
      key: ROOM_TYPE_CONTENT_KEY,
      title: ROOM_TYPE_CONTENT_TITLE,
      content: JSON.stringify(merged),
      group_name: 'pricing',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) {
    throw error
  }

  return merged
}
