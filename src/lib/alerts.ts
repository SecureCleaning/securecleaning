import { getAdminSupabase } from '@/lib/supabase'

export interface AdminAlert {
  id: string
  kind: 'new_quote' | 'new_booking' | 'overdue_inspection' | 'unassigned_booking'
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const db = getAdminSupabase()

  const [quotesRes, bookingsRes] = await Promise.all([
    db.from('quotes').select('quote_ref, created_at, status').order('created_at', { ascending: false }).limit(10),
    db.from('bookings').select('booking_ref, created_at, status, inspection_status, inspection_scheduled_for, assigned_operator_id, site_id, inputs').order('created_at', { ascending: false }).limit(20),
  ])

  const alerts: AdminAlert[] = []

  for (const quote of quotesRes.data ?? []) {
    if (quote.status === 'pending') {
      alerts.push({
        id: `quote-${quote.quote_ref}`,
        kind: 'new_quote',
        title: `New/pending quote ${quote.quote_ref}`,
        description: 'Quote still pending review or follow-up.',
        severity: 'info',
      })
    }
  }

  const now = Date.now()

  for (const booking of bookingsRes.data ?? []) {
    if (booking.status === 'pending') {
      alerts.push({
        id: `booking-${booking.booking_ref}`,
        kind: 'new_booking',
        title: `New/pending booking ${booking.booking_ref}`,
        description: 'Booking requires review or triage.',
        severity: 'info',
      })
    }

    if (!booking.assigned_operator_id || !booking.site_id) {
      alerts.push({
        id: `booking-unassigned-${booking.booking_ref}`,
        kind: 'unassigned_booking',
        title: `Booking ${booking.booking_ref} still needs assignment`,
        description: 'Missing site and/or operator assignment.',
        severity: 'warning',
      })
    }

    if (booking.inspection_status === 'scheduled' && booking.inspection_scheduled_for) {
      const scheduledTime = new Date(booking.inspection_scheduled_for).getTime()
      if (Number.isFinite(scheduledTime) && scheduledTime < now) {
        alerts.push({
          id: `booking-overdue-${booking.booking_ref}`,
          kind: 'overdue_inspection',
          title: `Inspection overdue for ${booking.booking_ref}`,
          description: 'Scheduled inspection time has already passed.',
          severity: 'critical',
        })
      }
    }
  }

  return alerts.slice(0, 20)
}
