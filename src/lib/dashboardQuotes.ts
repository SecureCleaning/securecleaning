import type { getAdminSupabase } from './supabase'

// Fetch successive pages rather than silently hiding older quotes at a fixed cap.
// Call only after dashboard authorization; these rows contain customer information.
export async function getDashboardQuotes(db: ReturnType<typeof getAdminSupabase>) {
  const pageSize = 500
  const first = await db.from('quotes')
    .select('id, quote_ref, status, valid_until, created_at, inputs, follow_up_status, follow_up_notes')
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(0, pageSize - 1)
  if (first.error) return first
  const data = [...(first.data ?? [])]
  let page = first.data ?? []
  while (page.length === pageSize) {
    const next = await db.from('quotes')
      .select('id, quote_ref, status, valid_until, created_at, inputs, follow_up_status, follow_up_notes')
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(data.length, data.length + pageSize - 1)
    if (next.error) return { ...next, data: null }
    page = next.data ?? []
    data.push(...page)
  }
  return { ...first, data }
}
