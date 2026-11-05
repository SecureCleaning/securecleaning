import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLogStrict } from '@/lib/auditLog'
import { rankAdminAlerts } from '@/lib/adminAlertRanking.mjs'
import { isValidAdminAlertId } from '@/lib/adminAlertId'
import { adminAlertClientLabel } from '@/lib/adminAlertClientLabel'
import { needsBookingAssignment } from '@/lib/bookingWorkflow'

export { isValidAdminAlertId } from '@/lib/adminAlertId'

export interface AdminAlert {
  id: string
  entity_ref: string
  kind: 'new_quote' | 'new_booking' | 'overdue_inspection' | 'unassigned_booking' | 'email_failure'
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
}

type TimedAlert = AdminAlert & {
  happenedAt: number
}

async function getDismissedAlertIds() {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_audit_log')
    .select('entity_ref')
    .eq('entity_type', 'alert')
    .eq('action', 'dismissed')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[alerts] Failed to read dismissed alerts:', error)
    return new Set<string>()
  }

  return new Set((data ?? []).map((item) => item.entity_ref).filter(Boolean))
}

export async function dismissAdminAlert(alertId: string) {
  if (!isValidAdminAlertId(alertId)) {
    throw new Error('Select a valid alert.')
  }

  try {
    await writeAuditLogStrict('alert', alertId, 'dismissed')
  } catch (error) {
    console.error('[alerts] Failed to dismiss alert:', error)
    throw new Error('Unable to dismiss alert.')
  }
  return { alertId }
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const db = getAdminSupabase()
  const nowIso = new Date().toISOString()

  const [quotesRes, pendingBookingsRes, overdueBookingsRes, unassignedBookingsRes, emailAlertsRes] = await Promise.all([
    db.from('quotes').select('quote_ref, created_at, inputs').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    db.from('bookings').select('booking_ref, created_at, status, inputs').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    db.from('bookings')
      .select('booking_ref, created_at, status, inspection_status, inspection_scheduled_for, inputs')
      .eq('inspection_status', 'scheduled')
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .not('inspection_scheduled_for', 'is', null)
      .lt('inspection_scheduled_for', nowIso)
      .order('inspection_scheduled_for', { ascending: true })
      .limit(100),
    db.from('bookings')
      .select('booking_ref, created_at, status, assigned_operator_id, site_id, inputs')
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(100),
    db.from('email_failure_alerts').select('id', { count: 'exact', head: true }).in('status', ['pending', 'review']),
  ])

  const alertsById = new Map<string, TimedAlert>()
  if (emailAlertsRes.error || (emailAlertsRes.count ?? 0) > 0) {
    alertsById.set('email-failure-delivery', {
      id: 'email-failure-delivery', entity_ref: '', kind: 'email_failure', severity: 'critical', happenedAt: 0,
      title: emailAlertsRes.error ? 'Owner email alert monitoring unavailable' : 'Owner email alerts awaiting delivery',
      description: emailAlertsRes.error ? 'Email failure monitoring could not be checked. Ask the administrator to review the notification connection.' : `${emailAlertsRes.count} email failure alert(s) are queued or need delivery review. Check Resend and the owner notification settings. Check original delivery before resending any message.`,
    })
  }

  for (const quote of quotesRes.data ?? []) {
    const happenedAt = new Date(quote.created_at ?? '').getTime()
      alertsById.set(`quote-${quote.quote_ref}`, {
        id: `quote-${quote.quote_ref}`,
        entity_ref: quote.quote_ref,
        kind: 'new_quote',
        title: `${adminAlertClientLabel(quote.inputs, quote.quote_ref)} - pending quote`,
        description: 'Quote still pending review or follow-up.',
        severity: 'info',
        happenedAt: Number.isFinite(happenedAt) ? happenedAt : 0,
      })
  }

  for (const booking of pendingBookingsRes.data ?? []) {
    const happenedAt = new Date(booking.created_at ?? '').getTime()
    alertsById.set(`booking-${booking.booking_ref}`, {
      id: `booking-${booking.booking_ref}`,
      entity_ref: booking.booking_ref,
      kind: 'new_booking',
        title: `${adminAlertClientLabel(booking.inputs, booking.booking_ref)} - pending booking`,
        description: 'Booking requires review or triage.',
        severity: 'info',
        happenedAt: Number.isFinite(happenedAt) ? happenedAt : 0,
      })
  }

  for (const booking of unassignedBookingsRes.data ?? []) {
    if (!needsBookingAssignment(booking)) continue

    const happenedAt = new Date(booking.created_at ?? '').getTime()
    alertsById.set(`booking-unassigned-${booking.booking_ref}`, {
      id: `booking-unassigned-${booking.booking_ref}`,
      entity_ref: booking.booking_ref,
      kind: 'unassigned_booking',
      title: `${adminAlertClientLabel(booking.inputs, booking.booking_ref)} - assignment needed`,
      description: 'Missing site and/or operator assignment.',
      severity: 'warning',
      happenedAt: Number.isFinite(happenedAt) ? happenedAt : 0,
    })
  }

  for (const booking of overdueBookingsRes.data ?? []) {
    const happenedAt = new Date(booking.inspection_scheduled_for ?? booking.created_at ?? '').getTime()
    alertsById.set(`booking-overdue-${booking.booking_ref}`, {
      id: `booking-overdue-${booking.booking_ref}`,
      entity_ref: booking.booking_ref,
      kind: 'overdue_inspection',
      title: `${adminAlertClientLabel(booking.inputs, booking.booking_ref)} - inspection overdue`,
      description: 'Scheduled inspection time has already passed.',
      severity: 'critical',
      happenedAt: Number.isFinite(happenedAt) ? happenedAt : 0,
    })
  }

  const dismissedAlertIds = await getDismissedAlertIds()

  return rankAdminAlerts([...alertsById.values()])
    .filter((alert) => !dismissedAlertIds.has(alert.id))
    .map(({ happenedAt: _happenedAt, ...alert }) => alert)
}
