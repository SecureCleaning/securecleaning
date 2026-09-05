import { calculateQuote } from '@/lib/quoteEngine'
import type { QuotePricingConfig } from '@/lib/pricing'
import { isBathroomRoomScopeType, sanitizePublicRoomScope } from '@/lib/publicRoomScope'
import type { CleaningFrequency, QuoteInputs, QuoteResult, PremisesType, TimePreference } from '@/lib/types'
import {
  DEFAULT_QUOTE_ROOM_TYPE_CONFIG,
  getRoomScopeTaskCadence,
  getRoomScopeTaskPrice,
  getRoomTaskAmortizationFactor,
  getRoomTypeConfigById,
  type QuoteRoomTypeConfig,
  type RoomMetricFieldConfig,
  type RoomTaskCadence,
} from '@/lib/roomTypeConfig'
import { isFirmQuoteStatus } from '@/lib/finalQuoteWorkflow'
export { getFinalQuoteReadiness, isEditableFirmQuoteStatus, isFirmQuoteStatus } from '@/lib/finalQuoteWorkflow'

export type WorkflowRoomType =
  | 'office'
  | 'boardroom'
  | 'reception'
  | 'hallway'
  | 'bathroom'
  | 'female_bathroom'
  | 'male_bathroom'
  | 'accessible_bathroom'
  | 'kitchen'
  | 'breakout'
  | 'stairs'
  | 'storage'
  | 'warehouse'
  | 'medical_room'
  | 'other'

export type WorkflowRoomItem = {
  id: string
  type: WorkflowRoomType
  label: string
  description?: string
  quantity: number
  size: number
  floor: number
  metrics?: Record<string, number | boolean>
  customMetricFields?: RoomMetricFieldConfig[]
  excludedMetricFieldIds?: string[]
  moppingEnabled?: boolean
  moppingMinutesPerSqm?: number
  pricingOverride?: boolean
  pricingAdjustmentPercent?: number
  fixedPricePerVisit?: number
}

export const WORKFLOW_ROOM_TYPE_LABELS: Record<WorkflowRoomType, string> = Object.fromEntries(
  DEFAULT_QUOTE_ROOM_TYPE_CONFIG.roomTypes.map((roomType) => [roomType.id, roomType.label])
) as Record<WorkflowRoomType, string>

export type InspectionReport = {
  inspectorName: string
  inspectedAt: string
  siteContact: string
  accessNotes: string
  parkingNotes: string
  alarmNotes: string
  summary: string
  recommendedFrequency: CleaningFrequency
  recommendedStartDate: string
  exclusions: string
  riskNotes: string
  followUpActions: string
}

export type FirmQuoteStatus = 'draft' | 'reviewed' | 'sent' | 'accepted'


export type FirmQuoteDraft = {
  status: FirmQuoteStatus
  revisedInputs: QuoteInputs
  roomItems: WorkflowRoomItem[]
  moppingMinutesPerSqm: number
  pricingAdjustmentPercent: number
  targetPrice: string
  finalPerVisit: string
  scopeSummary: string
  inclusions: string
  exclusions: string
  serviceCommentary: string
}

export type FirmQuotePreview = {
  calculated: QuoteResult
  calculatedLow: number
  calculatedHigh: number
  adjustedLow: number
  adjustedHigh: number
  suggestedPrice: number | null
  roomFieldExtraTotal: number
  scheduledTaskExtraTotal: number
  moppingExtraTotal: number
  roomPricingExtraLow: number
  roomPricingExtraHigh: number
}

export type FirmQuoteDisplayPrice = {
  low: number
  high: number
  isFirm: boolean
}

export const DEFAULT_MOPPING_MINUTES_PER_SQM = 0.25

function safePositiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback
}

function safePositiveNumber(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
}

function getMetricExtra(
  field: { inputType: string; pricePerUnit?: number; includedUnits?: number; cadence?: RoomTaskCadence },
  value: unknown,
  frequency: CleaningFrequency
) {
  const cadenceFactor = getRoomTaskAmortizationFactor(field.cadence ?? 'every_clean', frequency)
  if (field.inputType === 'boolean') {
    return value === true ? (field.pricePerUnit ?? 0) * cadenceFactor : 0
  }

  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return 0

  const includedUnits = Math.max(0, Number(field.includedUnits ?? 0))
  return Math.max(0, numericValue - includedUnits) * (field.pricePerUnit ?? 0) * cadenceFactor
}

function createRoomId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`
}

function buildDefaultMetrics(roomTypeId: WorkflowRoomType, roomTypeConfig: QuoteRoomTypeConfig) {
  const roomType = getRoomTypeConfigById(roomTypeConfig, roomTypeId)
  return Object.fromEntries((roomType?.fields ?? []).map((field) => [field.id, field.defaultValue]))
}

export function getWorkflowRoomMetricFields(room: WorkflowRoomItem, roomTypeConfig: QuoteRoomTypeConfig) {
  const excluded = new Set(room.excludedMetricFieldIds ?? [])
  const systemFields = (getRoomTypeConfigById(roomTypeConfig, room.type)?.fields ?? []).filter((field) => !excluded.has(field.id))
  return [...systemFields, ...(room.customMetricFields ?? [])].slice(0, 30)
}

function sanitizeCustomMetricFields(value: unknown): RoomMetricFieldConfig[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return []
    const source = candidate as Partial<RoomMetricFieldConfig>
    const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim().slice(0, 64) : `custom_${index + 1}`
    const inputType = source.inputType === 'boolean' || source.inputType === 'number' ? source.inputType : 'integer'
    return [{
      id,
      label: typeof source.label === 'string' && source.label.trim() ? source.label.trim().slice(0, 80) : `Custom field ${index + 1}`,
      inputType,
      defaultValue: inputType === 'boolean' ? Boolean(source.defaultValue) : safePositiveNumber(source.defaultValue, 0),
      includedUnits: safePositiveNumber(source.includedUnits, 0),
      pricePerUnit: safePositiveNumber(source.pricePerUnit, 0),
      cadence: ['every_clean', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'].includes(String(source.cadence))
        ? source.cadence as RoomTaskCadence
        : 'every_clean',
      helpText: typeof source.helpText === 'string' ? source.helpText.trim().slice(0, 120) : '',
    }]
  })
}

function buildPublicBathroomMetrics(scopeType: string, metrics: Record<string, number | boolean>) {
  if (scopeType === 'female_bathroom') {
    return { ...metrics, toilets: 1, basins: 1, urinals: 0, disabled_toilet: 0 }
  }

  if (scopeType === 'male_bathroom') {
    return { ...metrics, toilets: 1, basins: 1, urinals: 1, disabled_toilet: 0 }
  }

  if (scopeType === 'accessible_bathroom') {
    return { ...metrics, toilets: 1, basins: 1, urinals: 0, disabled_toilet: 1 }
  }

  return metrics
}

export function createRoomItem(
  type: WorkflowRoomType,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): WorkflowRoomItem {
  const roomType = getRoomTypeConfigById(roomTypeConfig, type)
  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: roomType?.defaultLabel ?? roomType?.label ?? WORKFLOW_ROOM_TYPE_LABELS[type],
    description: '',
    quantity: 1,
    size: roomType?.defaultSize ?? (type === 'bathroom' || type === 'kitchen' ? 0 : 20),
    floor: 1,
    metrics: buildDefaultMetrics(type, roomTypeConfig),
    customMetricFields: [],
    excludedMetricFieldIds: [],
    moppingEnabled: roomType?.defaultMopping ?? false,
    moppingMinutesPerSqm: DEFAULT_MOPPING_MINUTES_PER_SQM,
    pricingOverride: false,
    pricingAdjustmentPercent: roomType?.pricingAdjustmentPercent ?? 0,
    fixedPricePerVisit: roomType?.fixedPricePerVisit ?? 0,
  }
}

function createSeedRoomItems(inputs: QuoteInputs, roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG): WorkflowRoomItem[] {
  const rooms: WorkflowRoomItem[] = []
  const roomScope = sanitizePublicRoomScope(inputs.roomScope ?? [])

  // When the client supplies a room breakdown, those selected rooms replace the generic main area.
  // The client floor area remains the single pricing total and is allocated across these rooms below.
  if (roomScope.length > 0) {
    const roomTypeMap: Record<string, WorkflowRoomType> = {
      bathroom: 'bathroom',
      female_bathroom: 'female_bathroom',
      male_bathroom: 'male_bathroom',
      accessible_bathroom: 'accessible_bathroom',
      kitchen: 'kitchen',
      meeting_room: 'boardroom',
      reception: 'reception',
      hallway: 'hallway',
      breakout: 'breakout',
      warehouse: 'warehouse',
      other: 'other',
    }

    roomScope.forEach((room, index) => {
      const mappedType = roomTypeMap[room.type] ?? 'other'
      const roomType = getRoomTypeConfigById(roomTypeConfig, mappedType)
      const metrics = buildDefaultMetrics(mappedType, roomTypeConfig)
      rooms.push({
        id: createRoomId('room', rooms.length + index),
        type: mappedType,
        label: room.label,
        description: '',
        quantity: room.quantity,
        size: roomType?.defaultSize ?? 0,
        floor: 1,
        metrics: isBathroomRoomScopeType(room.type)
          ? buildPublicBathroomMetrics(room.type, metrics)
          : metrics,
        moppingEnabled: room.moppingRequired ?? roomType?.defaultMopping ?? false,
        moppingMinutesPerSqm: DEFAULT_MOPPING_MINUTES_PER_SQM,
        pricingOverride: false,
        pricingAdjustmentPercent: roomType?.pricingAdjustmentPercent ?? 0,
        fixedPricePerVisit: roomType?.fixedPricePerVisit ?? 0,
      })
    })

    return rooms
  }

  const mainType = inputs.premisesType === 'medical' ? 'medical_room' : inputs.premisesType === 'warehouse' ? 'warehouse' : 'office'
  const mainRoomType = getRoomTypeConfigById(roomTypeConfig, mainType)
  const mainAreaLabel = inputs.businessName?.trim() ? `${inputs.businessName.trim()} main area` : 'Main area'
  rooms.push({
    id: createRoomId('room', 0),
    type: mainType,
    label: mainAreaLabel,
    description: '',
    quantity: 1,
    size: inputs.floorArea,
    floor: 1,
    metrics: buildDefaultMetrics(mainType, roomTypeConfig),
    moppingEnabled: mainRoomType?.defaultMopping ?? false,
    moppingMinutesPerSqm: DEFAULT_MOPPING_MINUTES_PER_SQM,
    pricingOverride: false,
    pricingAdjustmentPercent: mainRoomType?.pricingAdjustmentPercent ?? 0,
    fixedPricePerVisit: mainRoomType?.fixedPricePerVisit ?? 0,
  })

  let offset = rooms.length

  if ((inputs.addOns.bathrooms ?? 0) > 0) {
    rooms.push({
      id: createRoomId('room', offset++),
      type: 'bathroom',
      label: 'Bathrooms / amenities',
      description: '',
      quantity: inputs.addOns.bathrooms,
      size: 0,
      floor: 1,
      metrics: buildDefaultMetrics('bathroom', roomTypeConfig),
      moppingEnabled: getRoomTypeConfigById(roomTypeConfig, 'bathroom')?.defaultMopping ?? false,
      moppingMinutesPerSqm: DEFAULT_MOPPING_MINUTES_PER_SQM,
      pricingOverride: false,
      pricingAdjustmentPercent: getRoomTypeConfigById(roomTypeConfig, 'bathroom')?.pricingAdjustmentPercent ?? 0,
      fixedPricePerVisit: getRoomTypeConfigById(roomTypeConfig, 'bathroom')?.fixedPricePerVisit ?? 0,
    })
  }

  if ((inputs.addOns.kitchens ?? 0) > 0) {
    rooms.push({
      id: createRoomId('room', offset++),
      type: 'kitchen',
      label: 'Kitchen / kitchenette',
      description: '',
      quantity: inputs.addOns.kitchens,
      size: 0,
      floor: 1,
      metrics: buildDefaultMetrics('kitchen', roomTypeConfig),
      moppingEnabled: getRoomTypeConfigById(roomTypeConfig, 'kitchen')?.defaultMopping ?? false,
      moppingMinutesPerSqm: DEFAULT_MOPPING_MINUTES_PER_SQM,
      pricingOverride: false,
      pricingAdjustmentPercent: getRoomTypeConfigById(roomTypeConfig, 'kitchen')?.pricingAdjustmentPercent ?? 0,
      fixedPricePerVisit: getRoomTypeConfigById(roomTypeConfig, 'kitchen')?.fixedPricePerVisit ?? 0,
    })
  }

  return rooms
}

function mergeRoomItems(candidate: unknown, inputs: QuoteInputs, roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG): WorkflowRoomItem[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return createSeedRoomItems(inputs, roomTypeConfig)
  }

  const rooms = candidate
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const source = item as Partial<WorkflowRoomItem>
      const type = typeof source.type === 'string' && source.type in WORKFLOW_ROOM_TYPE_LABELS
        ? (source.type as WorkflowRoomType)
        : 'other'

      const metrics = {
        ...buildDefaultMetrics(type, roomTypeConfig),
        ...(source.metrics && typeof source.metrics === 'object' ? source.metrics as Record<string, number | boolean> : {}),
      }
      // A generic bathroom is not a male bathroom. Use the dedicated male type
      // when a urinal should be included in the room schedule.
      if (type === 'bathroom') metrics.urinals = 0

      return {
        id: typeof source.id === 'string' && source.id.trim() ? source.id : createRoomId('room', index),
        type,
        label: typeof source.label === 'string' && source.label.trim()
          ? source.label
          : getRoomTypeConfigById(roomTypeConfig, type)?.defaultLabel ?? WORKFLOW_ROOM_TYPE_LABELS[type],
        description: typeof source.description === 'string' ? source.description : '',
        quantity: safePositiveInteger(source.quantity, 1),
        size: safePositiveNumber(source.size, 0),
        floor: safePositiveInteger(source.floor, 1),
        metrics,
        customMetricFields: sanitizeCustomMetricFields(source.customMetricFields),
        excludedMetricFieldIds: Array.isArray(source.excludedMetricFieldIds)
          ? source.excludedMetricFieldIds.filter((id): id is string => typeof id === 'string').map((id) => id.slice(0, 64)).slice(0, 30)
          : [],
        moppingEnabled: typeof source.moppingEnabled === 'boolean'
          ? source.moppingEnabled
          : getRoomTypeConfigById(roomTypeConfig, type)?.defaultMopping ?? false,
        moppingMinutesPerSqm: safePositiveNumber(source.moppingMinutesPerSqm, DEFAULT_MOPPING_MINUTES_PER_SQM),
        pricingOverride: source.pricingOverride === true,
        pricingAdjustmentPercent: Number.isFinite(Number(source.pricingAdjustmentPercent))
          ? Number(source.pricingAdjustmentPercent)
          : getRoomTypeConfigById(roomTypeConfig, type)?.pricingAdjustmentPercent ?? 0,
        fixedPricePerVisit: Number.isFinite(Number(source.fixedPricePerVisit))
          ? Math.max(0, Number(source.fixedPricePerVisit))
          : getRoomTypeConfigById(roomTypeConfig, type)?.fixedPricePerVisit ?? 0,
      }
    })

  const roomScope = sanitizePublicRoomScope(inputs.roomScope ?? [])
  const mainType = inputs.premisesType === 'medical' ? 'medical_room' : inputs.premisesType === 'warehouse' ? 'warehouse' : 'office'
  const mainAreaLabel = inputs.businessName?.trim() ? `${inputs.businessName.trim()} main area` : 'Main area'
  const isLegacyGenericMain = roomScope.length > 0 && rooms.length > 1 && rooms[0]?.type === mainType && (rooms[0]?.label === mainAreaLabel || rooms[0]?.label === `${inputs.businessName} main area`)

  return isLegacyGenericMain ? rooms.slice(1) : rooms
}

export function createDefaultInspectionReport(inputs: QuoteInputs): InspectionReport {
  return {
    inspectorName: '',
    inspectedAt: '',
    siteContact: inputs.contactName ?? '',
    accessNotes: '',
    parkingNotes: '',
    alarmNotes: '',
    summary: '',
    recommendedFrequency: inputs.frequency,
    recommendedStartDate: inputs.preferredStartDate ?? '',
    exclusions: '',
    riskNotes: '',
    followUpActions: '',
  }
}

export function createDefaultFirmQuoteDraft(
  inputs: QuoteInputs,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): FirmQuoteDraft {
  return {
    status: 'draft',
    revisedInputs: JSON.parse(JSON.stringify(inputs)) as QuoteInputs,
    roomItems: createSeedRoomItems(inputs, roomTypeConfig),
    moppingMinutesPerSqm: DEFAULT_MOPPING_MINUTES_PER_SQM,
    pricingAdjustmentPercent: 0,
    targetPrice: '',
    finalPerVisit: '',
    scopeSummary: '',
    inclusions: '',
    exclusions: '',
    serviceCommentary: '',
  }
}

export function parseInspectionReport(candidate: unknown, inputs: QuoteInputs): InspectionReport {
  const fallback = createDefaultInspectionReport(inputs)

  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const source = candidate as Partial<InspectionReport>

  return {
    inspectorName: typeof source.inspectorName === 'string' ? source.inspectorName : fallback.inspectorName,
    inspectedAt: typeof source.inspectedAt === 'string' ? source.inspectedAt : fallback.inspectedAt,
    siteContact: typeof source.siteContact === 'string' ? source.siteContact : fallback.siteContact,
    accessNotes: typeof source.accessNotes === 'string' ? source.accessNotes : fallback.accessNotes,
    parkingNotes: typeof source.parkingNotes === 'string' ? source.parkingNotes : fallback.parkingNotes,
    alarmNotes: typeof source.alarmNotes === 'string' ? source.alarmNotes : fallback.alarmNotes,
    summary: typeof source.summary === 'string' ? source.summary : fallback.summary,
    recommendedFrequency:
      typeof source.recommendedFrequency === 'string' ? (source.recommendedFrequency as CleaningFrequency) : fallback.recommendedFrequency,
    recommendedStartDate:
      typeof source.recommendedStartDate === 'string' ? source.recommendedStartDate : fallback.recommendedStartDate,
    exclusions: typeof source.exclusions === 'string' ? source.exclusions : fallback.exclusions,
    riskNotes: typeof source.riskNotes === 'string' ? source.riskNotes : fallback.riskNotes,
    followUpActions: typeof source.followUpActions === 'string' ? source.followUpActions : fallback.followUpActions,
  }
}

function mergeQuoteInputs(base: QuoteInputs, candidate: unknown): QuoteInputs {
  if (!candidate || typeof candidate !== 'object') {
    return JSON.parse(JSON.stringify(base)) as QuoteInputs
  }

  const source = candidate as Partial<QuoteInputs>
  return {
    ...base,
    ...source,
    addOns: {
      ...base.addOns,
      ...(source.addOns ?? {}),
    },
  }
}

export function parseFirmQuoteDraft(
  candidate: unknown,
  inputs: QuoteInputs,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): FirmQuoteDraft {
  const fallback = createDefaultFirmQuoteDraft(inputs, roomTypeConfig)

  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const source = candidate as Partial<FirmQuoteDraft>
  const legacyMoppingRate = source.roomItems?.find((room) => Number.isFinite(Number(room.moppingMinutesPerSqm)))?.moppingMinutesPerSqm

  return {
    status: isFirmQuoteStatus(source.status) ? source.status : fallback.status,
    revisedInputs: mergeQuoteInputs(inputs, source.revisedInputs),
    roomItems: mergeRoomItems(source.roomItems, inputs, roomTypeConfig),
    moppingMinutesPerSqm: safePositiveNumber(
      source.moppingMinutesPerSqm,
      safePositiveNumber(legacyMoppingRate, fallback.moppingMinutesPerSqm)
    ),
    pricingAdjustmentPercent:
      typeof source.pricingAdjustmentPercent === 'number' && Number.isFinite(source.pricingAdjustmentPercent)
        ? source.pricingAdjustmentPercent
        : fallback.pricingAdjustmentPercent,
    targetPrice: typeof source.targetPrice === 'string' ? source.targetPrice : fallback.targetPrice,
    finalPerVisit: typeof source.finalPerVisit === 'string' ? source.finalPerVisit : fallback.finalPerVisit,
    scopeSummary: typeof source.scopeSummary === 'string' ? source.scopeSummary : fallback.scopeSummary,
    inclusions: typeof source.inclusions === 'string' ? source.inclusions : fallback.inclusions,
    exclusions: typeof source.exclusions === 'string' ? source.exclusions : fallback.exclusions,
    serviceCommentary: typeof source.serviceCommentary === 'string' ? source.serviceCommentary : fallback.serviceCommentary,
  }
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100
}

export function deriveQuoteInputsFromRooms(
  draft: FirmQuoteDraft,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
) {
  const floorAreaFromRooms = draft.roomItems.reduce((sum, room) => sum + (room.size > 0 ? room.size * room.quantity : 0), 0)
  const bathrooms = draft.roomItems
    .filter((room) => room.type === 'bathroom' || room.type === 'female_bathroom' || room.type === 'male_bathroom' || room.type === 'accessible_bathroom')
    .reduce((sum, room) => sum + room.quantity, 0)
  const kitchens = draft.roomItems
    .filter((room) => room.type === 'kitchen' || room.type === 'breakout')
    .reduce((sum, room) => sum + room.quantity, 0)
  const floors = draft.roomItems.reduce((max, room) => Math.max(max, room.floor), 1)

  return {
    ...draft.revisedInputs,
    // The client-entered total is a reference for the later site inspection.
    // Working pricing is based only on the room areas selected in this draft.
    floorArea: floorAreaFromRooms > 0 ? roundCurrency(floorAreaFromRooms) : 0,
    floors: floors > 0 ? floors : draft.revisedInputs.floors,
    addOns: {
      ...draft.revisedInputs.addOns,
      bathrooms,
      kitchens,
    },
  }
}

export function getRoomAreaAllocationTotal(
  draft: FirmQuoteDraft,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
) {
  return roundCurrency(draft.roomItems.reduce((sum, room) => sum + Math.max(0, room.size) * Math.max(0, room.quantity), 0))
}

export function getRoomAreaAllocations(
  draft: FirmQuoteDraft,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
) {
  const rawTotal = getRoomAreaAllocationTotal(draft, roomTypeConfig)

  return new Map(draft.roomItems.map((room) => [
    room.id,
    rawTotal > 0
      ? Math.max(0, room.size) * Math.max(0, room.quantity)
      : Math.max(0, room.quantity),
  ]))
}

export function getRoomMetricExtraTotal(draft: FirmQuoteDraft, roomTypeConfig: QuoteRoomTypeConfig) {
  const frequency = draft.revisedInputs?.frequency ?? 'weekly'
  return draft.roomItems.reduce((sum, room) => {
    const fields = getWorkflowRoomMetricFields(room, roomTypeConfig)
    if (!fields.length) return sum

    const roomTotal = fields.reduce((fieldSum, field) => {
      const value = room.metrics?.[field.id]
      return fieldSum + getMetricExtra(field, value ?? field.defaultValue, frequency)
    }, 0)

    return sum + roomTotal * room.quantity
  }, 0)
}

export function getRoomScheduledTaskExtraTotal(draft: FirmQuoteDraft, roomTypeConfig: QuoteRoomTypeConfig) {
  const frequency = draft.revisedInputs?.frequency ?? 'weekly'
  return draft.roomItems.reduce((total, room) => {
    const roomType = getRoomTypeConfigById(roomTypeConfig, room.type)
    if (!roomType) return total
    const perRoom = roomType.scopeTasks.reduce((taskTotal, _, taskIndex) => (
      taskTotal + getRoomScopeTaskPrice(roomType, taskIndex) * getRoomTaskAmortizationFactor(
        getRoomScopeTaskCadence(roomType, taskIndex),
        frequency
      )
    ), 0)
    return total + perRoom * Math.max(0, room.quantity)
  }, 0)
}

export function getRoomMoppingExtraTotal(
  draft: FirmQuoteDraft,
  pricingConfig: QuotePricingConfig,
  roomTypeConfig: QuoteRoomTypeConfig
) {
  const roomAreas = getRoomAreaAllocations(draft, roomTypeConfig)
  return draft.roomItems.reduce((sum, room) => {
    const roomType = getRoomTypeConfigById(roomTypeConfig, room.type)
    const roomArea = roomAreas.get(room.id) ?? 0
    if (!room.moppingEnabled || !roomType?.tracksSize || roomArea <= 0 || room.quantity <= 0) {
      return sum
    }

    const minutesPerSqm = safePositiveNumber(draft.moppingMinutesPerSqm, DEFAULT_MOPPING_MINUTES_PER_SQM)
    const roomMinutes = roomArea * minutesPerSqm
    const roomCost = (roomMinutes / 60) * pricingConfig.settings.hourlyRate
    const cadenceFactor = getRoomTaskAmortizationFactor(roomType.moppingCadence ?? 'every_clean', draft.revisedInputs.frequency)
    return sum + roomCost * cadenceFactor
  }, 0)
}

function getRoomPricingRule(room: WorkflowRoomItem, roomTypeConfig: QuoteRoomTypeConfig) {
  const roomType = getRoomTypeConfigById(roomTypeConfig, room.type)
  return {
    adjustmentPercent: room.pricingOverride
      ? Number.isFinite(Number(room.pricingAdjustmentPercent)) ? Number(room.pricingAdjustmentPercent) : 0
      : roomType?.pricingAdjustmentPercent ?? 0,
    fixedPricePerVisit: room.pricingOverride
      ? Number.isFinite(Number(room.fixedPricePerVisit)) ? Math.max(0, Number(room.fixedPricePerVisit)) : 0
      : roomType?.fixedPricePerVisit ?? 0,
  }
}

export function getRoomPricingExtraTotal(
  draft: FirmQuoteDraft,
  calculated: QuoteResult,
  roomTypeConfig: QuoteRoomTypeConfig
) {
  const roomAreas = getRoomAreaAllocations(draft, roomTypeConfig)
  const totalRoomArea = [...roomAreas.values()].reduce((sum, roomArea) => sum + roomArea, 0)
  const totalRoomQuantity = draft.roomItems.reduce((sum, room) => sum + Math.max(0, room.quantity), 0)

  return draft.roomItems.reduce(
    (totals, room) => {
      const rule = getRoomPricingRule(room, roomTypeConfig)
      const roomArea = roomAreas.get(room.id) ?? 0
      const roomShare = totalRoomArea > 0
        ? roomArea / totalRoomArea
        : totalRoomQuantity > 0 ? Math.max(0, room.quantity) / totalRoomQuantity : 0
      const roomFixed = rule.fixedPricePerVisit * Math.max(0, room.quantity)
      const roomPercentLow = calculated.baseLow * roomShare * (rule.adjustmentPercent / 100)
      const roomPercentHigh = calculated.baseHigh * roomShare * (rule.adjustmentPercent / 100)

      return {
        low: totals.low + roomPercentLow + roomFixed,
        high: totals.high + roomPercentHigh + roomFixed,
      }
    },
    { low: 0, high: 0 }
  )
}

export type RoomPricingBreakdown = Record<string, { low: number; high: number }>

export function getRoomPricingBreakdown(
  draft: FirmQuoteDraft,
  pricingConfig: QuotePricingConfig,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): RoomPricingBreakdown {
  const calculated = calculateQuote(deriveQuoteInputsFromRooms(draft, roomTypeConfig), pricingConfig)
  const roomAreas = getRoomAreaAllocations(draft, roomTypeConfig)
  const totalRoomArea = [...roomAreas.values()].reduce((sum, roomArea) => sum + roomArea, 0)
  const totalRoomQuantity = draft.roomItems.reduce((sum, room) => sum + Math.max(0, room.quantity), 0)
  const factor = 1 + (draft.pricingAdjustmentPercent || 0) / 100

  return Object.fromEntries(draft.roomItems.map((room) => {
    const roomType = getRoomTypeConfigById(roomTypeConfig, room.type)
    const roomArea = roomAreas.get(room.id) ?? 0
    const roomShare = totalRoomArea > 0
      ? roomArea / totalRoomArea
      : totalRoomQuantity > 0 ? Math.max(0, room.quantity) / totalRoomQuantity : 0
    const rule = getRoomPricingRule(room, roomTypeConfig)
    const roomMetricExtra = (roomType?.fields ?? []).reduce((sum, field) => {
      const value = room.metrics?.[field.id]
      return sum + getMetricExtra(field, value ?? field.defaultValue, draft.revisedInputs.frequency)
    }, 0) * Math.max(0, room.quantity)
    const roomScheduledTaskExtra = roomType
      ? roomType.scopeTasks.reduce((sum, _, taskIndex) => (
          sum + getRoomScopeTaskPrice(roomType, taskIndex) * getRoomTaskAmortizationFactor(
            getRoomScopeTaskCadence(roomType, taskIndex),
            draft.revisedInputs.frequency
          )
        ), 0) * Math.max(0, room.quantity)
      : 0
    const roomMoppingExtra = room.moppingEnabled && roomType?.tracksSize
      ? (roomArea * safePositiveNumber(draft.moppingMinutesPerSqm, DEFAULT_MOPPING_MINUTES_PER_SQM) / 60) * pricingConfig.settings.hourlyRate *
        getRoomTaskAmortizationFactor(roomType.moppingCadence ?? 'every_clean', draft.revisedInputs.frequency)
      : 0
    const roomPricingItemCode = ['bathroom', 'female_bathroom', 'male_bathroom', 'accessible_bathroom'].includes(room.type)
      ? 'bathrooms'
      : room.type === 'kitchen'
        ? 'kitchens'
        : null
    const roomPricingItemExtra = roomPricingItemCode
      ? (pricingConfig.items.find((item) => item.code === roomPricingItemCode && item.active)?.rate ?? 0) * Math.max(0, room.quantity)
      : 0
    const roomAdjustmentLow = calculated.baseLow * roomShare * (rule.adjustmentPercent / 100)
    const roomAdjustmentHigh = calculated.baseHigh * roomShare * (rule.adjustmentPercent / 100)
    const roomFixed = rule.fixedPricePerVisit * Math.max(0, room.quantity)

    return [room.id, {
      // Allocate base labour to rooms; add only charges that belong to this room.
      // Global add-ons and minimum call-out remain in the overall working range.
      low: roundCurrency((calculated.baseLow * roomShare + roomAdjustmentLow + roomFixed + roomMetricExtra + roomScheduledTaskExtra + roomMoppingExtra + roomPricingItemExtra) * factor),
      high: roundCurrency((calculated.baseHigh * roomShare + roomAdjustmentHigh + roomFixed + roomMetricExtra + roomScheduledTaskExtra + roomMoppingExtra + roomPricingItemExtra) * factor),
    }]
  }))
}

export function buildFirmQuotePreview(
  draft: FirmQuoteDraft,
  pricingConfig: QuotePricingConfig,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): FirmQuotePreview {
  const calculated = calculateQuote(deriveQuoteInputsFromRooms(draft, roomTypeConfig), pricingConfig)
  const roomFieldExtra = getRoomMetricExtraTotal(draft, roomTypeConfig)
  const scheduledTaskExtra = getRoomScheduledTaskExtraTotal(draft, roomTypeConfig)
  const moppingExtra = getRoomMoppingExtraTotal(draft, pricingConfig, roomTypeConfig)
  const roomPricingExtra = getRoomPricingExtraTotal(draft, calculated, roomTypeConfig)
  const factor = 1 + (draft.pricingAdjustmentPercent || 0) / 100
  const rangeLow = calculated.isSpringClean ? pricingConfig.settings.springCleanLow : pricingConfig.settings.rangeLow
  const rangeHigh = calculated.isSpringClean ? pricingConfig.settings.springCleanHigh : pricingConfig.settings.rangeHigh
  const baseLabourAdjusted = calculated.breakdown.baseLabour *
    calculated.breakdown.premisesMultiplier *
    calculated.breakdown.floorsMultiplier *
    calculated.breakdown.timeMultiplier *
    calculated.breakdown.frequencyMultiplier *
    calculated.breakdown.cityMultiplier
  const rawLow = roundCurrency(
    (baseLabourAdjusted + calculated.addOnsTotal) * rangeLow + roomFieldExtra + scheduledTaskExtra + moppingExtra + roomPricingExtra.low
  )
  const rawHigh = roundCurrency(
    (baseLabourAdjusted + calculated.addOnsTotal) * rangeHigh + roomFieldExtra + scheduledTaskExtra + moppingExtra + roomPricingExtra.high
  )
  // Assess the complete job against the minimum only after every charge is included.
  const calculatedLow = roundCurrency(rawLow * factor)
  const calculatedHigh = roundCurrency(rawHigh * factor)
  const frequencyAdjustedMinimum = pricingConfig.settings.minimumInvoice * calculated.breakdown.frequencyMultiplier
  const adjustedLow = roundCurrency(Math.max(frequencyAdjustedMinimum, calculatedLow))
  const adjustedHigh = roundCurrency(Math.max(frequencyAdjustedMinimum, calculatedHigh))
  const finalPerVisit = Number(draft.finalPerVisit)
  const targetPrice = Number(draft.targetPrice)

  return {
    calculated: {
      ...calculated,
      addOnsTotal: roundCurrency(calculated.addOnsTotal + roomFieldExtra + scheduledTaskExtra + moppingExtra),
      totalLow: roundCurrency(calculated.totalLow + roomFieldExtra + scheduledTaskExtra + moppingExtra),
      totalHigh: roundCurrency(calculated.totalHigh + roomFieldExtra + scheduledTaskExtra + moppingExtra),
      perVisitLow: roundCurrency(calculated.perVisitLow + roomFieldExtra + scheduledTaskExtra + moppingExtra),
      perVisitHigh: roundCurrency(calculated.perVisitHigh + roomFieldExtra + scheduledTaskExtra + moppingExtra),
    },
    calculatedLow,
    calculatedHigh,
    adjustedLow,
    adjustedHigh,
    roomFieldExtraTotal: roundCurrency(roomFieldExtra),
    scheduledTaskExtraTotal: roundCurrency(scheduledTaskExtra),
    moppingExtraTotal: roundCurrency(moppingExtra),
    roomPricingExtraLow: roundCurrency(roomPricingExtra.low),
    roomPricingExtraHigh: roundCurrency(roomPricingExtra.high),
    suggestedPrice: Number.isFinite(finalPerVisit) && finalPerVisit > 0
      ? finalPerVisit
      : Number.isFinite(targetPrice) && targetPrice > 0
        ? targetPrice
        : null,
  }
}

export function getFirmQuoteDisplayPrice(
  draft: FirmQuoteDraft,
  pricingPreview: Pick<FirmQuotePreview, 'adjustedLow' | 'adjustedHigh'>
): FirmQuoteDisplayPrice {
  const finalPerVisit = Number(draft.finalPerVisit)
  if (Number.isFinite(finalPerVisit) && finalPerVisit > 0) {
    return { low: finalPerVisit, high: finalPerVisit, isFirm: true }
  }

  return {
    low: pricingPreview.adjustedLow,
    high: pricingPreview.adjustedHigh,
    isFirm: false,
  }
}

export function applyFirmQuoteDisplayPrice(result: QuoteResult, price: FirmQuoteDisplayPrice): QuoteResult {
  return {
    ...result,
    perVisitLow: price.low,
    perVisitHigh: price.high,
    totalLow: price.low,
    totalHigh: price.high,
  }
}
