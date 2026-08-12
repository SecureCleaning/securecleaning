import { formatPriceRange } from '@/lib/quoteEngine'
import type { QuoteInputs, QuoteResult } from '@/lib/types'
import {
  getFirmQuoteDisplayPrice,
  getRoomAreaAllocations,
  type FirmQuoteDraft,
  type FirmQuotePreview,
  type WorkflowRoomItem,
  type WorkflowRoomType,
} from '@/lib/quoteWorkflow'
import { getRoomTypeConfigById, type QuoteRoomTypeConfig } from '@/lib/roomTypeConfig'

export type ClientScopeRoom = {
  id: string
  label: string
  description?: string
  typeLabel: string
  quantity: number
  size?: number
  floor: number
  tasks: string[]
  selectedOptions: string[]
}

export type ClientScopeReport = {
  quoteRef: string
  businessName: string
  contactName: string
  location: string
  premisesLabel: string
  frequencyLabel: string
  timePreferenceLabel: string
  rooms: ClientScopeRoom[]
  selectedOptions: string[]
  summary: string
  inclusions: string
  exclusions: string
  displayedPrice: string
  priceLabel: string
  validUntil?: string | null
  createdAt?: string | null
  isFirmQuote: boolean
}

const FALLBACK_TASKS_BY_ROOM_TYPE: Record<WorkflowRoomType, string[]> = {
  office: ['Vacuum carpeted areas', 'Mop hard floors', 'Wipe reachable surfaces', 'Empty bins', 'Clean high-touch points'],
  boardroom: ['Vacuum or mop floors', 'Wipe tables and reachable surfaces', 'Empty bins', 'Clean high-touch points'],
  reception: ['Vacuum or mop entry and waiting areas', 'Wipe reception counters and reachable surfaces', 'Empty bins', 'Clean high-touch points'],
  hallway: ['Vacuum or mop circulation areas', 'Spot clean visible marks', 'Clean high-touch points'],
  bathroom: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
  female_bathroom: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
  male_bathroom: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
  accessible_bathroom: ['Clean and disinfect toilets, basins and fixtures', 'Wipe mirrors and reachable surfaces', 'Mop floors', 'Empty sanitary and general waste bins'],
  kitchen: ['Wipe benches, tables and splashbacks', 'Clean sinks and taps', 'Wipe appliance exteriors', 'Mop floors', 'Empty bins'],
  breakout: ['Vacuum or mop floors', 'Wipe tables, benches and reachable surfaces', 'Clean high-touch points', 'Empty bins'],
  stairs: ['Vacuum or mop steps and landings', 'Wipe reachable rails', 'Spot clean visible marks'],
  storage: ['Vacuum or mop accessible floor areas', 'Wipe reachable surfaces', 'Empty bins where provided'],
  warehouse: ['Sweep or mop accessible hard floors', 'Spot clean visible marks', 'Empty bins where provided'],
  medical_room: ['Vacuum or mop floors', 'Wipe reachable surfaces', 'Clean high-touch points', 'Empty bins where provided'],
  other: ['Vacuum or mop accessible floor areas', 'Wipe reachable surfaces', 'Clean high-touch points', 'Empty bins where provided'],
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  '3x_week': '3 times per week',
  '2x_week': '2 times per week',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  once_off: 'Recurring service',
}

const TIME_LABELS: Record<string, string> = {
  business_hours: 'Business hours',
  after_hours: 'After hours',
  weekend: 'Weekend',
}

const PREMISES_LABELS: Record<string, string> = {
  office: 'Office',
  medical: 'Medical / healthcare',
  childcare: 'Childcare centre',
  industrial: 'Industrial',
  retail: 'Retail',
  gym: 'Gym / fitness',
  warehouse: 'Warehouse',
  other: 'Commercial premises',
}

const STANDARD_MOPPING_ROOM_TYPES = new Set<WorkflowRoomType>(['bathroom', 'female_bathroom', 'male_bathroom', 'accessible_bathroom', 'kitchen'])

function labelForRoomType(room: WorkflowRoomItem, roomTypeConfig: QuoteRoomTypeConfig) {
  return getRoomTypeConfigById(roomTypeConfig, room.type)?.label ?? room.type
}

function formatMetricValue(value: number | boolean) {
  return typeof value === 'number' && Number.isInteger(value) ? String(value) : String(value)
}

function getRoomSelectedOptions(room: WorkflowRoomItem, roomTypeConfig: QuoteRoomTypeConfig) {
  const typeConfig = getRoomTypeConfigById(roomTypeConfig, room.type)
  const options: string[] = []

  if (room.moppingEnabled && !STANDARD_MOPPING_ROOM_TYPES.has(room.type)) {
    options.push('Mopping included')
  }

  for (const field of typeConfig?.fields ?? []) {
    const value = room.metrics?.[field.id]
    if (field.inputType === 'boolean' && value === true) {
      options.push(field.label)
    } else if (field.inputType !== 'boolean' && Number(value ?? 0) > 0) {
      options.push(`${field.label}: ${formatMetricValue(Number(value))}`)
    }
  }

  return options
}

function getGlobalSelectedOptions(inputs: QuoteInputs) {
  const options: string[] = []

  if (inputs.addOns.glassCleaningRequired) options.push('Glass cleaning requested - quoted separately')
  if (inputs.addOns.highTouchDisinfection) options.push('High-touch disinfection')
  if (inputs.addOns.carpetSteam) options.push('Carpet steam cleaning requested - quoted separately')
  if (inputs.addOns.consumables) options.push('Consumables supply')
  return options
}

function buildRoomScope(room: WorkflowRoomItem, roomTypeConfig: QuoteRoomTypeConfig, allocatedArea?: number): ClientScopeRoom {
  const typeConfig = getRoomTypeConfigById(roomTypeConfig, room.type)

  return {
    id: room.id,
    label: room.label,
    description: room.description?.trim() || undefined,
    typeLabel: labelForRoomType(room, roomTypeConfig),
    quantity: room.quantity,
    size: typeConfig?.tracksSize && (allocatedArea ?? 0) > 0
      ? Math.round(((allocatedArea ?? 0) / Math.max(1, room.quantity)) * 10) / 10
      : undefined,
    floor: room.floor,
    tasks: typeConfig?.scopeTasks ?? FALLBACK_TASKS_BY_ROOM_TYPE[room.type] ?? FALLBACK_TASKS_BY_ROOM_TYPE.other,
    selectedOptions: getRoomSelectedOptions(room, roomTypeConfig),
  }
}

function displayPrice(
  draft: FirmQuoteDraft,
  result: QuoteResult,
  pricingPreview?: Pick<FirmQuotePreview, 'adjustedLow' | 'adjustedHigh'>
) {
  const price = getFirmQuoteDisplayPrice(draft, pricingPreview ?? {
    adjustedLow: result.totalLow,
    adjustedHigh: result.totalHigh,
  })

  return {
    value: formatPriceRange(price.low, price.high),
    label: price.isFirm ? 'Confirmed price per visit' : 'Estimated price per visit',
    isFirm: price.isFirm,
  }
}

export function buildClientScopeReport(
  quoteRef: string,
  inputs: QuoteInputs,
  result: QuoteResult,
  draft: FirmQuoteDraft,
  roomTypeConfig: QuoteRoomTypeConfig,
  validUntil?: string | null,
  createdAt?: string | null,
  pricingPreview?: Pick<FirmQuotePreview, 'adjustedLow' | 'adjustedHigh'>
): ClientScopeReport {
  const price = displayPrice(draft, result, pricingPreview)
  const globalOptions = getGlobalSelectedOptions(draft.revisedInputs)
  const roomAreas = getRoomAreaAllocations(draft)

  return {
    quoteRef,
    businessName: draft.revisedInputs.businessName?.trim() || inputs.businessName?.trim() || draft.revisedInputs.contactName?.trim() || inputs.contactName?.trim() || 'Customer premises',
    contactName: draft.revisedInputs.contactName || inputs.contactName,
    location: [draft.revisedInputs.suburb || inputs.suburb, draft.revisedInputs.postcode || inputs.postcode].filter(Boolean).join(' '),
    premisesLabel: PREMISES_LABELS[draft.revisedInputs.premisesType] ?? 'Commercial premises',
    frequencyLabel: FREQUENCY_LABELS[draft.revisedInputs.frequency] ?? draft.revisedInputs.frequency,
    timePreferenceLabel: TIME_LABELS[draft.revisedInputs.timePreference] ?? draft.revisedInputs.timePreference,
    rooms: draft.roomItems.map((room) => buildRoomScope(room, roomTypeConfig, roomAreas.get(room.id))),
    selectedOptions: globalOptions,
    summary: draft.scopeSummary.trim() || 'Regular cleaning of the listed areas, completed to the agreed frequency and service requirements.',
    inclusions: draft.inclusions.trim(),
    exclusions: draft.exclusions.trim() || 'Final scope and pricing remain subject to confirmation of site conditions and access requirements.',
    displayedPrice: price.value,
    priceLabel: price.label,
    validUntil,
    createdAt,
    isFirmQuote: price.isFirm,
  }
}
