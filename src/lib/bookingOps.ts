import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'

export async function assignBookingSite(bookingRef: string, siteId: string | null) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('bookings')
    .update({ site_id: siteId })
    .eq('booking_ref', bookingRef)
    .select('booking_ref, site_id')
    .maybeSingle()

  if (error) throw error
  await writeAuditLog('booking', bookingRef, 'site_assigned', { siteId })
  return data
}

export async function assignBookingOperator(bookingRef: string, operatorId: string | null) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('bookings')
    .update({ assigned_operator_id: operatorId })
    .eq('booking_ref', bookingRef)
    .select('booking_ref, assigned_operator_id')
    .maybeSingle()

  if (error) throw error
  await writeAuditLog('booking', bookingRef, 'operator_assigned', { operatorId })
  return data
}
