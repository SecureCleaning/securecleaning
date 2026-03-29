import { getAdminSupabase } from '@/lib/supabase'
import type { AdminDashboardData } from '@/components/admin/AdminDashboard'
import { getSites } from '@/lib/sites'

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const db = getAdminSupabase()

  const [quotesRes, bookingsRes, clientsRes, leadsRes, operatorsRes, sites] = await Promise.all([
    db.from('quotes').select('id, quote_ref, status, valid_until, created_at, inputs, follow_up_status, follow_up_notes').order('created_at', { ascending: false }).limit(20),
    db.from('bookings').select('id, booking_ref, status, first_clean_date, created_at, inputs, site_id, assigned_operator_id, inspection_status, inspection_scheduled_for, inspection_completed_at, dispatch_notes').order('created_at', { ascending: false }).limit(20),
    db.from('clients').select('id, business_name, contact_name, email, city, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('leads').select('id, email, business_name, city, source, created_at, follow_up_status, follow_up_notes').order('created_at', { ascending: false }).limit(20),
    db.from('owner_operators').select('id, business_name, operator_name, city, is_verified, is_active, premises_types').order('created_at', { ascending: false }).limit(20),
    getSites(),
  ])

  if (quotesRes.error) console.error('[adminDashboard] quotes load failed:', quotesRes.error)
  if (bookingsRes.error) console.error('[adminDashboard] bookings load failed:', bookingsRes.error)
  if (clientsRes.error) console.error('[adminDashboard] clients load failed:', clientsRes.error)
  if (leadsRes.error) console.error('[adminDashboard] leads load failed:', leadsRes.error)
  if (operatorsRes.error) console.error('[adminDashboard] operators load failed:', operatorsRes.error)

  const quotes = quotesRes.data ?? []
  const bookings = bookingsRes.data ?? []
  const clients = clientsRes.data ?? []
  const leads = leadsRes.data ?? []
  const operators = operatorsRes.data ?? []

  return {
    stats: {
      quotesPending: quotes.filter((quote) => quote.status === 'pending').length,
      bookingsPending: bookings.filter((booking) => booking.status === 'pending').length,
      clientsTotal: clients.length,
      ownerOperatorsActive: operators.filter((operator) => operator.is_active).length,
      leadsTotal: leads.length,
    },
    quotes,
    bookings,
    clients,
    leads,
    operators,
    sites,
  }
}
