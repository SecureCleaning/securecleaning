import type { FirmQuoteDraft, FirmQuoteStatus } from '@/lib/quoteWorkflow'

export function isFirmQuoteStatus(value: unknown): value is FirmQuoteStatus {
  return value === 'draft' || value === 'reviewed' || value === 'sent' || value === 'accepted'
}

export function isEditableFirmQuoteStatus(value: unknown): value is 'draft' | 'reviewed' {
  return value === 'draft' || value === 'reviewed'
}

export function getFinalQuoteReadiness(draft: FirmQuoteDraft) {
  const errors: string[] = []
  if (draft.status !== 'reviewed') errors.push('The quote must be reviewed before sending.')
  if (!(Number(draft.finalPerVisit) > 0)) errors.push('A final per-visit price is required.')
  if (draft.roomItems.length === 0) errors.push('At least one scoped area is required.')
  if (!draft.revisedInputs.contactName?.trim()) errors.push('A customer contact is required.')
  if (!draft.revisedInputs.email?.trim()) errors.push('A customer email is required.')
  return { ready: errors.length === 0, errors }
}
