import { getAdminSupabase } from '@/lib/supabase'
import type { AdminDashboardData } from '@/components/admin/AdminDashboard'
import { getSites } from '@/lib/sites'
import { getAdminOverviewData } from '@/lib/adminOverview'
import { getAvailabilityConfig } from '@/lib/availability'

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const db = getAdminSupabase()

  const [
    quotesRes,
    bookingsRes,
    clientsRes,
    leadsRes,
    operatorsRes,
    pendingQuotesCountRes,
    pendingBookingsCountRes,
    clientsCountRes,
    leadsCountRes,
    activeOperatorsCountRes,
    sites,
    overview,
    availabilityConfig,
  ] = await Promise.all([
    db.from('quotes').select('id, quote_ref, status, valid_until, created_at, inputs, follow_up_status, follow_up_notes').order('created_at', { ascending: false }).limit(20),
    db.from('bookings').select('id, booking_ref, status, first_clean_date, created_at, inputs, site_id, assigned_operator_id, inspection_status, inspection_scheduled_for, inspection_completed_at, dispatch_notes').order('created_at', { ascending: false }).limit(20),
    db.from('clients').select('id, business_name, contact_name, email, city, created_at').order('created_at', { ascending: false }).limit(20),
    db.from('leads').select('id, email, business_name, city, source, created_at, follow_up_status, follow_up_notes').order('created_at', { ascending: false }).limit(20),
    db.from('owner_operators').select('id, business_name, operator_name, city, is_verified, is_active, premises_types').order('created_at', { ascending: false }).limit(20),
    db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('clients').select('*', { count: 'exact', head: true }),
    db.from('leads').select('*', { count: 'exact', head: true }),
    db.from('owner_operators').select('*', { count: 'exact', head: true }).eq('is_active', true),
    getSites(),
    getAdminOverviewData(),
    getAvailabilityConfig(),
  ])

  if (quotesRes.error) console.error('[adminDashboard] quotes load failed:', quotesRes.error)
  if (bookingsRes.error) console.error('[adminDashboard] bookings load failed:', bookingsRes.error)
  if (clientsRes.error) console.error('[adminDashboard] clients load failed:', clientsRes.error)
  if (leadsRes.error) console.error('[adminDashboard] leads load failed:', leadsRes.error)
  if (operatorsRes.error) console.error('[adminDashboard] operators load failed:', operatorsRes.error)

  const quotes = quotesRes.data ?? []
  const rawBookings = bookingsRes.data ?? []
  const clients = clientsRes.data ?? []
  const leads = leadsRes.data ?? []
  const availabilityAssigneeIdByOperatorId = new Map(
    availabilityConfig.assignees
      .filter((assignee) => assignee.ownerOperatorId)
      .map((assignee) => [assignee.ownerOperatorId as string, assignee.id]),
  )
  const operators = (operatorsRes.data ?? []).map((operator) => ({
    ...operator,
    availabilityAssigneeId: availabilityAssigneeIdByOperatorId.get(operator.id) ?? null,
  }))
  const availabilityAssigneeById = new Map(availabilityConfig.assignees.map((assignee) => [assignee.id, assignee]))
  const availabilityAssigneeByOperatorId = new Map(
    availabilityConfig.assignees
      .filter((assignee) => assignee.ownerOperatorId)
      .map((assignee) => [assignee.ownerOperatorId as string, assignee]),
  )
  const bookings = rawBookings.map((booking) => {
    const inputAssignee = booking.inputs?.preferredInspectionAssigneeId
      ? availabilityAssigneeById.get(booking.inputs.preferredInspectionAssigneeId)
      : undefined
    const operatorAssignee = booking.assigned_operator_id
      ? availabilityAssigneeByOperatorId.get(booking.assigned_operator_id)
      : undefined
    const linkedAgent = inputAssignee ?? operatorAssignee

    return {
      ...booking,
      linkedAgentId: linkedAgent?.id ?? null,
      linkedOperatorId: booking.assigned_operator_id ? null : linkedAgent?.ownerOperatorId ?? null,
    }
  })

  return {
    stats: {
      quotesPending: pendingQuotesCountRes.count ?? 0,
      bookingsPending: pendingBookingsCountRes.count ?? 0,
      clientsTotal: clientsCountRes.count ?? 0,
      ownerOperatorsActive: activeOperatorsCountRes.count ?? 0,
      leadsTotal: leadsCountRes.count ?? 0,
    },
    quotes,
    bookings,
    clients,
    leads,
    operators,
    sites,
    overview,
  }
}
