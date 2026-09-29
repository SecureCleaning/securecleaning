import { getAdminSupabase } from '@/lib/supabase'
import { isQuoteReference } from '@/lib/quoteReference'

export type QuoteDeletionPreview = {
  quoteRef: string
  status: string
  blocked: boolean
  blockers: string[]
  previewToken: string
  finalDocumentSent: boolean
  retentionReasons: Array<{ type: string; count: number }>
  contractProducts: number
  contractSales: number
  linkedBookings: number
  opportunityLinksToRemove: number
  winningOpportunities: number
  providerConfirmedSendAttempts: number
  sendAttemptsToRemove: number
  documentVersionsToRemove: number
}

export class QuoteDeletionAuthorizationError extends Error {}
export class QuoteDeletionNotFoundError extends Error {}
export class QuoteDeletionBlockedError extends Error {}

function requireQuoteReference(quoteRef: string) {
  if (!isQuoteReference(quoteRef)) {
    throw new Error('Select a valid quote reference.')
  }
}

export async function getQuoteDeletionPreview(quoteRef: string): Promise<QuoteDeletionPreview> {
  requireQuoteReference(quoteRef)
  const { data, error } = await getAdminSupabase().rpc('admin_preview_quote_deletion', { p_quote_ref: quoteRef })
  if (error?.code === 'P0002') throw new QuoteDeletionNotFoundError('Quote not found.')
  if (error) throw error
  const preview = data as QuoteDeletionPreview
  return { ...preview, blockers: preview.blocked ? ['An email send is still being processed. Resolve it before deleting this quote.'] : [] }
}

export async function deleteQuoteByRef(
  quoteRef: string,
  confirmation: string,
  reason: string,
  actor: { id: string; name: string; role: 'owner' },
  options: { linkedRecords: 'keep' | 'delete'; override: boolean; previewToken: string },
) {
  requireQuoteReference(quoteRef)
  if (confirmation !== quoteRef) {
    throw new Error('Type the exact quote reference to confirm deletion.')
  }
  const normalizedReason = reason.trim()
  if (normalizedReason.length < 10 || normalizedReason.length > 500) {
    throw new Error('Enter a deletion reason between 10 and 500 characters.')
  }

  if (!options || !['keep', 'delete'].includes(options.linkedRecords) || typeof options.override !== 'boolean' || !/^[a-f0-9]{32}$/.test(options.previewToken)) {
    throw new Error('Review the deletion options before confirming.')
  }
  const db = getAdminSupabase()
  const { data, error } = await db.rpc('admin_delete_quote_with_override', {
    p_quote_ref: quoteRef,
    p_reason: normalizedReason,
    p_actor: actor,
    p_linked_records: options.linkedRecords,
    p_override: options.override,
    p_preview_token: options.previewToken,
  })

  if (error) {
    if (error.code === '28000') throw new QuoteDeletionAuthorizationError('Active owner access required. Sign in again.')
    if (error.code === '23503') {
      throw new QuoteDeletionBlockedError('Linked records have retained history. Choose to keep product/sale records, or refresh the preview.')
    }
    if (error.code === '40001') throw new QuoteDeletionBlockedError('The quote or its links changed. Close and reopen this dialog to review them again.')
    if (error.code === '42501') throw new QuoteDeletionBlockedError('Confirm the owner override to delete this linked or previously sent quote.')
    if (error.code === '55000') throw new QuoteDeletionBlockedError('An email send is still being processed. Resolve it before deleting the quote.')
    if (error.code === 'P0002') throw new QuoteDeletionNotFoundError('Quote not found.')
    throw error
  }

  return data
}
