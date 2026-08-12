import { getAdminSupabase } from '@/lib/supabase'

export type RoomMetricInputType = 'integer' | 'number' | 'boolean'

export type RoomMetricFieldConfig = {
  id: string
  label: string
  inputType: RoomMetricInputType
  defaultValue: number | boolean
  includedUnits?: number
  pricePerUnit?: number
  helpText?: string
}

export type RoomTypeConfig = {
  id: string
  label: string
  defaultLabel: string
  tracksSize: boolean
  defaultSize: number
  defaultMopping: boolean
  scopeTasks: string[]
  pricingAdjustmentPercent: number
  fixedPricePerVisit: number
  fields: RoomMetricFieldConfig[]
}

export type QuoteRoomTypeConfig = {
  roomTypes: RoomTypeConfig[]
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
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `field_${index + 1}`,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : `Field ${index + 1}`,
    inputType,
    defaultValue,
    includedUnits: Number.isFinite(Number(source.includedUnits)) ? Math.max(0, Number(source.includedUnits)) : 0,
    pricePerUnit: Number.isFinite(Number(source.pricePerUnit)) ? Number(source.pricePerUnit) : 0,
    helpText: typeof source.helpText === 'string' ? source.helpText : '',
  }
}

function normalizeRoomType(candidate: unknown, index: number): RoomTypeConfig {
  const defaults = cloneDefaultConfig().roomTypes
  const source = candidate && typeof candidate === 'object' ? candidate as Partial<RoomTypeConfig> : {}
  const sourceId = typeof source.id === 'string' ? source.id.trim() : ''
  const fallback = defaults.find((roomType) => roomType.id === sourceId) ?? defaults[index] ?? defaults.at(-1)!
  const scopeTasks = Array.isArray(source.scopeTasks)
    ? source.scopeTasks.filter((task): task is string => typeof task === 'string').map((task) => task.trim()).filter(Boolean)
    : fallback.scopeTasks

  return {
    id: sourceId || fallback.id,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallback.label,
    defaultLabel:
      typeof source.defaultLabel === 'string' && source.defaultLabel.trim() ? source.defaultLabel.trim() : fallback.defaultLabel,
    tracksSize: typeof source.tracksSize === 'boolean' ? source.tracksSize : fallback.tracksSize,
    defaultSize: Number.isFinite(Number(source.defaultSize)) ? Number(source.defaultSize) : fallback.defaultSize,
    defaultMopping: typeof source.defaultMopping === 'boolean' ? source.defaultMopping : fallback.defaultMopping,
    scopeTasks,
    pricingAdjustmentPercent: Number.isFinite(Number(source.pricingAdjustmentPercent))
      ? Number(source.pricingAdjustmentPercent)
      : fallback.pricingAdjustmentPercent,
    fixedPricePerVisit: Number.isFinite(Number(source.fixedPricePerVisit))
      ? Math.max(0, Number(source.fixedPricePerVisit))
      : fallback.fixedPricePerVisit,
    fields: Array.isArray(source.fields) ? source.fields.map(normalizeField) : fallback.fields,
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
    source.roomTypes
      .map((roomType) => typeof roomType?.id === 'string' ? roomType.id.trim() : '')
      .filter(Boolean)
  )

  return {
    roomTypes: [
      ...source.roomTypes.map(normalizeRoomType),
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
