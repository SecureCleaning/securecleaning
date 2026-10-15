import { getAdminSupabase } from './supabase'
import { getDashboardQuotes } from './dashboardQuotes'
import { getReportingSnapshot } from './reporting'
import { getAdminAlerts } from './alerts'

export async function getAdminDashboardRefresh(tab: 'quotes' | 'bookings' | 'leads', includeAlerts: boolean) {
  const db=getAdminSupabase()
  const [list, reporting, alerts] = await Promise.all([
    tab==='quotes' ? getDashboardQuotes(db, true) : tab==='bookings'
      ? db.from('bookings').select('id,booking_ref,status,first_clean_date,created_at,inputs,site_id,assigned_operator_id,inspection_status,inspection_scheduled_for,inspection_completed_at,dispatch_notes').order('created_at',{ascending:false})
      : db.from('leads').select('id,email,business_name,city,source,created_at,follow_up_status,follow_up_notes').order('created_at',{ascending:false}).limit(20),
    getReportingSnapshot(),
    includeAlerts ? getAdminAlerts() : Promise.resolve(undefined),
  ])
  if (list.error) throw list.error
  return { tab, rows: list.data ?? [], reporting, alerts }
}
