import type { AdminDashboardData } from '@/components/admin/AdminDashboard'
type QuoteProjection = AdminDashboardData['quotes'][number] & Partial<Record<'businessName' | 'contactName' | 'city' | 'suburb' | 'postcode' | 'email' | 'premisesType' | 'frequency', string>>
import type { getAdminSupabase } from './supabase'

// Fetch successive pages rather than silently hiding older quotes at a fixed cap.
// Call only after dashboard authorization; these rows contain customer information.
export async function getDashboardQuotes(db: ReturnType<typeof getAdminSupabase>, summaryOnly = false) {
  const fields = summaryOnly
    ? 'id, quote_ref, status, valid_until, created_at, follow_up_status, follow_up_notes, businessName:inputs->>businessName, contactName:inputs->>contactName, city:inputs->>city, suburb:inputs->>suburb, postcode:inputs->>postcode, email:inputs->>email, premisesType:inputs->>premisesType, frequency:inputs->>frequency'
    : 'id, quote_ref, status, valid_until, created_at, inputs, follow_up_status, follow_up_notes'
  const pageSize = 500
  const first = await db.from('quotes')
    .select(fields).returns<QuoteProjection[]>()
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(0, pageSize - 1)
  if (first.error) return first
  const data = [...(first.data ?? [])]
  let page = first.data ?? []
  while (page.length === pageSize) {
    const next = await db.from('quotes')
      .select(fields).returns<QuoteProjection[]>()
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(data.length, data.length + pageSize - 1)
    if (next.error) return { ...next, data: null }
    page = next.data ?? []
    data.push(...page)
  }
  return { ...first, data: summaryOnly ? data.map(row => {
    const { businessName, contactName, city, suburb, postcode, email, premisesType, frequency, ...rest } = row
    return { ...rest, inputs: { businessName, contactName, city, suburb, postcode, email, premisesType, frequency } }
  }) : data }
}
