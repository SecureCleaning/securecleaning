import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'

export async function updateQuoteFollowUp(quoteRef: string, status: string, notes: string) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('quotes')
    .update({ follow_up_status: status, follow_up_notes: notes })
    .eq('quote_ref', quoteRef)
    .select('quote_ref, follow_up_status, follow_up_notes')
    .maybeSingle()

  if (error) throw error
  await writeAuditLog('quote', quoteRef, 'follow_up_updated', { status, notes })
  return data
}

export async function updateLeadFollowUp(leadId: string, status: string, notes: string) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('leads')
    .update({ follow_up_status: status, follow_up_notes: notes })
    .eq('id', leadId)
    .select('id, follow_up_status, follow_up_notes')
    .maybeSingle()

  if (error) throw error
  await writeAuditLog('lead', leadId, 'follow_up_updated', { status, notes })
  return data
}
