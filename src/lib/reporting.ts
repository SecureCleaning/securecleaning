import { getAdminSupabase } from '@/lib/supabase'

export interface ReportingSnapshot {
  quoteCount: number
  bookingCount: number
  pendingBookings: number
  completedBookings: number
  activeOperators: number
  unassignedBookings: number
  scheduledInspections: number
  quoteFollowUpBreakdown: Record<string, number>
  leadFollowUpBreakdown: Record<string, number>
}

function tally(values: Array<string | null | undefined>, fallback = 'unknown') {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value && value.trim().length > 0 ? value : fallback
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

export async function getReportingSnapshot(): Promise<ReportingSnapshot> {
  const db = getAdminSupabase()

  const [quotesRes, bookingsRes, leadsRes, operatorsRes] = await Promise.all([
    db.from('quotes').select('status, follow_up_status'),
    db.from('bookings').select('status, assigned_operator_id, site_id, inspection_status'),
    db.from('leads').select('follow_up_status'),
    db.from('owner_operators').select('is_active'),
  ])

  const quotes = quotesRes.data ?? []
  const bookings = bookingsRes.data ?? []
  const leads = leadsRes.data ?? []
  const operators = operatorsRes.data ?? []

  return {
    quoteCount: quotes.length,
    bookingCount: bookings.length,
    pendingBookings: bookings.filter((item) => item.status === 'pending').length,
    completedBookings: bookings.filter((item) => item.status === 'completed').length,
    activeOperators: operators.filter((item) => item.is_active).length,
    unassignedBookings: bookings.filter((item) => !item.assigned_operator_id || !item.site_id).length,
    scheduledInspections: bookings.filter((item) => item.inspection_status === 'scheduled').length,
    quoteFollowUpBreakdown: tally(quotes.map((item) => item.follow_up_status), 'new'),
    leadFollowUpBreakdown: tally(leads.map((item) => item.follow_up_status), 'new'),
  }
}
