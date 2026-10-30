import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'

export type CommissionReviewRow = {
  id: string
  sale_code: string
  status: string
  reason: string
  suggestedWinAgentId: string | null
  suggestedSaleAgentId: string | null
}

// Caller must be owner, or supply only sale IDs already authorised for that actor.
// Never return beneficiary identities to the product-sale client; only the reason.
export async function getCommissionReviewRows(authorizedSaleIds?: string[]): Promise<CommissionReviewRow[]> {
  if (authorizedSaleIds?.length === 0) return []
  const db = getAdminSupabase()
  const groups = authorizedSaleIds
    ? Array.from({ length: Math.ceil(authorizedSaleIds.length / 100) }, (_, i) => authorizedSaleIds.slice(i * 100, i * 100 + 100))
    : [null]
  const rows: CommissionReviewRow[] = []
  for (const ids of groups) {
    for (let offset = 0; ; offset += 500) {
      let query = db.from('contract_commission_attribution_status')
        .select('sale_id,sale_code,status,win_agent_id,sale_agent_id,review_reason')
        .eq('has_assignment', false).neq('status', 'cancelled')
      if (ids) query = query.in('sale_id', ids)
      const { data, error } = await query.order('sale_id').range(offset, offset + 499)
      if (error) throw error
      for (const row of data ?? []) rows.push({
        id: String(row.sale_id), sale_code: String(row.sale_code), status: String(row.status),
        reason: String(row.review_reason),
        suggestedWinAgentId: row.win_agent_id ? String(row.win_agent_id) : null,
        suggestedSaleAgentId: row.sale_agent_id ? String(row.sale_agent_id) : null,
      })
      if (!data || data.length < 500) break
    }
  }
  return rows.sort((a, b) => Number(b.status === 'completed' || b.status === 'active_payment_plan') - Number(a.status === 'completed' || a.status === 'active_payment_plan') || a.sale_code.localeCompare(b.sale_code))
}
