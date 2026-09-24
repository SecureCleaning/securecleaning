export type BookingWorkflowRecord = {
  status?: string | null
  site_id?: string | null
  assigned_operator_id?: string | null
  inspection_status?: string | null
  inputs?: Record<string, unknown> | null
}

export type BookingQueue = 'active' | 'pending' | 'unassigned' | 'inspections' | 'closed' | 'all'

export function isClosedBooking(booking: BookingWorkflowRecord) {
  return booking.status === 'completed' || booking.status === 'cancelled'
}

export function isActiveBooking(booking: BookingWorkflowRecord) {
  return !isClosedBooking(booking)
}

export function getInspectionAssigneeId(booking: BookingWorkflowRecord) {
  const value = booking.inputs?.preferredInspectionAssigneeId
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function needsBookingAssignment(booking: BookingWorkflowRecord) {
  if (!isActiveBooking(booking)) return false
  return !booking.site_id || (!booking.assigned_operator_id && !getInspectionAssigneeId(booking))
}

export function needsInspectionAction(booking: BookingWorkflowRecord) {
  if (!isActiveBooking(booking)) return false
  const status = booking.inspection_status ?? 'pending'
  return status === 'pending' || status === 'scheduled'
}

export function matchesBookingQueue(booking: BookingWorkflowRecord, queue: BookingQueue) {
  if (queue === 'all') return true
  if (queue === 'closed') return isClosedBooking(booking)
  if (queue === 'pending') return isActiveBooking(booking) && booking.status === 'pending'
  if (queue === 'unassigned') return needsBookingAssignment(booking)
  if (queue === 'inspections') return needsInspectionAction(booking)
  return isActiveBooking(booking)
}
