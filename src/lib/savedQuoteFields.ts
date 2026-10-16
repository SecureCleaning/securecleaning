import type { RoomMetricFieldConfig } from './roomTypeConfig'
import type { WorkflowRoomItem } from './quoteWorkflow'

export function appendSavedQuoteField(room: WorkflowRoomItem, field: RoomMetricFieldConfig, id: string): Partial<WorkflowRoomItem> {
  if ((room.customMetricFields ?? []).length >= 20) throw new Error('Extra-field limit reached')
  if (!/^saved_[a-zA-Z0-9_-]+$/.test(id) || id.length > 64 || Object.prototype.hasOwnProperty.call(room.metrics ?? {}, id)) throw new Error('Invalid or duplicate field identifier')
  return {
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
