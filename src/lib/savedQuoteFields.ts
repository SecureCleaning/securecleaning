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
