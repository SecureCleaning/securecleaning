import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'
import { rankAdminAlerts } from '@/lib/adminAlertRanking.mjs'

export interface AdminAlert {
  id: string
  entity_ref: string
  kind: 'new_quote' | 'new_booking' | 'overdue_inspection' | 'unassigned_booking'
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
  if (!alertId || !/^[a-z0-9_-]+$/.test(alertId)) {
    throw new Error('Select a valid alert.')
  }

  await writeAuditLog('alert', alertId, 'dismissed')
  return { alertId }
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const db = getAdminSupabase()
  const nowIso = new Date().toISOString()

  const [quotesRes, pendingBookingsRes, overdueBookingsRes, unassignedBookingsRes] = await Promise.all([
    db.from('quotes').select('quote_ref, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    db.from('bookings').select('booking_ref, created_at, status').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    db.from('bookings')
      .select('booking_ref, created_at, inspection_status, inspection_scheduled_for')
      .eq('inspection_status', 'scheduled')
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
  ])

  const alertsById = new Map<string, TimedAlert>()

  for (const quote of quotesRes.data ?? []) {
    const happenedAt = new Date(quote.created_at ?? '').getTime()
      alertsById.set(`quote-${quote.quote_ref}`, {
        id: `quote-${quote.quote_ref}`,
        entity_ref: quote.quote_ref,
        kind: 'new_quote',
        title: `New/pending quote ${quote.quote_ref}`,
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
        title: `New/pending booking ${booking.booking_ref}`,
        description: 'Booking requires review or triage.',
        severity: 'info',
        happenedAt: Number.isFinite(happenedAt) ? happenedAt : 0,
      })
  }

  for (const booking of unassignedBookingsRes.data ?? []) {
    const assignedAgent = booking.inputs && typeof booking.inputs === 'object'
      ? (booking.inputs as Record<string, unknown>).preferredInspectionAssigneeId
      : null
    if (booking.assigned_operator_id || assignedAgent) continue

    const happenedAt = new Date(booking.created_at ?? '').getTime()
    alertsById.set(`booking-unassigned-${booking.booking_ref}`, {
      id: `booking-unassigned-${booking.booking_ref}`,
      entity_ref: booking.booking_ref,
      kind: 'unassigned_booking',
      title: `Booking ${booking.booking_ref} still needs assignment`,
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
      title: `Inspection overdue for ${booking.booking_ref}`,
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
