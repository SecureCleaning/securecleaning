import { getGlobalRoomTaskRates, inferRoomTaskCadence, type QuoteRoomTypeConfig, type RoomMetricFieldConfig } from './roomTypeConfig'
import type { WorkflowRoomItem } from './quoteWorkflow'

export function appendSavedQuoteField(room: WorkflowRoomItem, field: RoomMetricFieldConfig, id: string): Partial<WorkflowRoomItem> {
  if ((room.customMetricFields ?? []).length >= 20) throw new Error('Extra-field limit reached')
  if (!/^saved_[a-zA-Z0-9_-]+$/.test(id) || id.length > 64 || Object.prototype.hasOwnProperty.call(room.metrics ?? {}, id)) throw new Error('Invalid or duplicate field identifier')
  return {
    fieldSourceIds: { ...room.fieldSourceIds, [id]: field.id },
    customMetricFields: [...(room.customMetricFields ?? []), { ...field, id }],
    metrics: { ...(room.metrics ?? {}), [id]: field.defaultValue },
  }
}

/** Override an included default without duplicating its charge or changing its input key. */
export function overrideIncludedQuoteField(room: WorkflowRoomItem, field: RoomMetricFieldConfig, patch: Partial<RoomMetricFieldConfig>): Partial<WorkflowRoomItem> {
  if ((room.customMetricFields ?? []).length >= 20) throw new Error('Extra-field limit reached')
  if (new Set([...(room.excludedMetricFieldIds ?? []), field.id]).size > 30) throw new Error('Excluded-field limit reached')
  if ((room.customMetricFields ?? []).some(item => item.id === field.id)) throw new Error('Field already overridden')
  return {
    customMetricFields: [...(room.customMetricFields ?? []), { ...field, ...patch, id: field.id }],
    metrics: { ...(room.metrics ?? {}), [field.id]: room.metrics?.[field.id] ?? field.defaultValue },
    excludedMetricFieldIds: [...new Set([...(room.excludedMetricFieldIds ?? []), field.id])],
  }
}

/** The picker includes both saved room fields and the independent global task catalogue. */
export function getSavedQuoteOptions(config: QuoteRoomTypeConfig) {
  const fields = new Map<string, RoomMetricFieldConfig>()
  config.roomTypes.forEach(room => room.fields.forEach(field => {
    if (!fields.has(field.id)) fields.set(field.id, field)
  }))
  return [
    ...[...fields.values()].map(field => ({ value: `field:${field.id}`, label: field.label, field, rate: undefined })),
    ...getGlobalRoomTaskRates(config).map(rate => ({ value: `task:${rate.code}`, label: rate.label, field: undefined, rate })),
  ].sort((a, b) => a.label.localeCompare(b.label, 'en-AU', { sensitivity: 'base', numeric: true }))
}

export function appendGlobalQuoteTask(room: WorkflowRoomItem, config: QuoteRoomTypeConfig, code: string, id: string): Partial<WorkflowRoomItem> {
  const rate = getGlobalRoomTaskRates(config).find(item => item.code === code)
  if (!rate) throw new Error('Saved task is no longer available')
  if ((room.quoteTasks ?? []).length >= 100) throw new Error('Task limit reached')
  return { taskDefaultPrices: { ...room.taskDefaultPrices, [id]: true }, taskSourceCodes: { ...room.taskSourceCodes, [id]: code }, quoteTasks: [...(room.quoteTasks ?? []), {
    id, label: rate.label, price: rate.pricePerRoom, minutesPerSqm: rate.minutesPerSqm,
    pricingMode: rate.pricingMode, defaultSelected: true, cadence: /as (required|needed)/i.test(rate.label) ? 'as_needed' : inferRoomTaskCadence(rate.label),
  }] }
}
