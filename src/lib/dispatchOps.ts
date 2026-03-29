import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'

export async function updateInspectionWorkflow(
  bookingRef: string,
  updates: {
    inspectionStatus?: string
    inspectionScheduledFor?: string | null
    inspectionCompletedAt?: string | null
    dispatchNotes?: string | null
  }
) {
  const db = getAdminSupabase()

  const payload = {
    inspection_status: updates.inspectionStatus,
    inspection_scheduled_for: updates.inspectionScheduledFor,
    inspection_completed_at: updates.inspectionCompletedAt,
    dispatch_notes: updates.dispatchNotes,
  }

  const { data, error } = await db
    .from('bookings')
    .update(payload)
    .eq('booking_ref', bookingRef)
    .select('booking_ref, inspection_status, inspection_scheduled_for, inspection_completed_at, dispatch_notes')
    .maybeSingle()

  if (error) throw error

  await writeAuditLog('booking', bookingRef, 'inspection_workflow_updated', updates)
  return data
}
