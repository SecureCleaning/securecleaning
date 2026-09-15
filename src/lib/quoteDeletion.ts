import { getAdminSupabase } from '@/lib/supabase'
import { isQuoteReference } from '@/lib/quoteReference'

export type QuoteDeletionPreview = {
  quoteRef: string
  status: string
  blocked: boolean
  blockers: string[]
  contractProducts: number
  contractSales: number
  linkedBookings: number
  opportunityLinksToRemove: number
  winningOpportunities: number
  providerConfirmedSendAttempts: number
  sendAttemptsToRemove: number
  documentVersionsToRemove: number
}

export class QuoteDeletionNotFoundError extends Error {}
export class QuoteDeletionBlockedError extends Error {}

function requireQuoteReference(quoteRef: string) {
  if (!isQuoteReference(quoteRef)) {
    throw new Error('Select a valid quote reference.')
  }
}

export async function getQuoteDeletionPreview(quoteRef: string): Promise<QuoteDeletionPreview> {
  requireQuoteReference(quoteRef)
  const db = getAdminSupabase()

  const { data: quote, error: quoteError } = await db
    .from('quotes')
    .select('id, quote_ref, status, final_quote_sent_at')
    .eq('quote_ref', quoteRef)
    .maybeSingle()

  if (quoteError) throw quoteError
  if (!quote) throw new QuoteDeletionNotFoundError('Quote not found.')

  const [products, sales, bookings, opportunityLinks, winningOpportunities, confirmedSendAttempts, sendAttempts, documentVersions] = await Promise.all([
    db.from('contract_products').select('id', { count: 'exact', head: true }).eq('source_quote_id', quote.id),
    db.from('contract_product_sales').select('id', { count: 'exact', head: true }).eq('source_quote_id', quote.id),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('quote_id', quote.id),
    db.from('crm_opportunity_quotes').select('quote_id', { count: 'exact', head: true }).eq('quote_id', quote.id),
    db.from('crm_opportunities').select('id', { count: 'exact', head: true }).eq('winning_quote_id', quote.id),
    db.from('quote_send_attempts').select('id', { count: 'exact', head: true }).eq('quote_ref', quote.quote_ref).in('status', ['provider_accepted', 'finalized']),
    db.from('quote_send_attempts').select('id', { count: 'exact', head: true }).eq('quote_ref', quote.quote_ref),
    db.from('quote_final_document_versions').select('quote_ref', { count: 'exact', head: true }).eq('quote_ref', quote.quote_ref),
  ])

  const firstError = [products, sales, bookings, opportunityLinks, winningOpportunities, confirmedSendAttempts, sendAttempts, documentVersions]
    .find((result) => result.error)?.error
  if (firstError) throw firstError

  const contractProducts = products.count ?? 0
  const contractSales = sales.count ?? 0
  const linkedBookings = bookings.count ?? 0
  const winningOpportunityCount = winningOpportunities.count ?? 0
  const providerConfirmedSendAttemptCount = confirmedSendAttempts.count ?? 0
  const blockers = [
    ...(quote.status === 'accepted' ? ['It has been accepted.'] : []),
    ...(quote.final_quote_sent_at ? ['Its final document has been sent.'] : []),
    ...(linkedBookings > 0 ? [`It is linked to ${linkedBookings} booking(s).`] : []),
    ...(winningOpportunityCount > 0 ? ['It is the winning quote for an opportunity.'] : []),
    ...(contractProducts > 0 ? [`It is linked to ${contractProducts} contract product(s).`] : []),
    ...(contractSales > 0 ? [`It is linked to ${contractSales} product sale(s).`] : []),
    ...(providerConfirmedSendAttemptCount > 0 ? ['Its final email has provider-confirmed delivery evidence.'] : []),
  ]

  return {
    quoteRef: quote.quote_ref,
    status: quote.status,
    blocked: blockers.length > 0,
    blockers,
    contractProducts,
    contractSales,
    linkedBookings,
    opportunityLinksToRemove: opportunityLinks.count ?? 0,
    winningOpportunities: winningOpportunityCount,
    providerConfirmedSendAttempts: providerConfirmedSendAttemptCount,
    sendAttemptsToRemove: sendAttempts.count ?? 0,
    documentVersionsToRemove: documentVersions.count ?? 0,
  }
}

export async function deleteQuoteByRef(
  quoteRef: string,
  confirmation: string,
  reason: string,
  actor: { id: string; name: string; role: 'owner' },
) {
  requireQuoteReference(quoteRef)
  if (confirmation !== quoteRef) {
    throw new Error('Type the exact quote reference to confirm deletion.')
  }
  const normalizedReason = reason.trim()
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    throw new Error('Enter a deletion reason between 10 and 500 characters.')
  }

  const db = getAdminSupabase()
  const { data, error } = await db.rpc('admin_delete_quote', {
    p_quote_ref: quoteRef,
    p_reason: normalizedReason,
    p_actor: actor,
  })

  if (error) {
    if (error.code === '23503') {
      throw new QuoteDeletionBlockedError('This quote is linked to a contract product or sale and cannot be deleted.')
    }
    if (error.code === 'P0002') throw new QuoteDeletionNotFoundError('Quote not found.')
    throw error
  }

  return data
}
