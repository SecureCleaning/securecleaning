export type CommissionRevisionBalance = {
  agent_id: string
  earned_cents: number
  potential_cents: number
  claimed_cents: number
  paid_cents: number
}
export type CommissionRevisionPreview = {
  saleId: string
  previousWinBps: number
  previousSaleBps: number
  winBps: number
  saleBps: number
  before: CommissionRevisionBalance[]
  after: CommissionRevisionBalance[]
}

export function validateCommissionRevision(input: Record<string, unknown>) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof input.saleId !== 'string' || !uuid.test(input.saleId)) throw new Error('Select a valid sale.')
  const { winBps, saleBps } = input
  if (typeof winBps !== 'number' || typeof saleBps !== 'number' || !Number.isInteger(winBps) || !Number.isInteger(saleBps)
    || winBps < 0 || saleBps < 0 || winBps + saleBps > 10000) throw new Error('Enter valid percentages totalling no more than 100%.')
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason || reason.length > 1000) throw new Error('Enter a reason of up to 1,000 characters.')
  if (input.action === 'revise' && (typeof input.requestId !== 'string' || !uuid.test(input.requestId) || !input.expected || typeof input.expected !== 'object' || Array.isArray(input.expected))) throw new Error('Preview the revision before confirming.')
  return { saleId: input.saleId, winBps, saleBps, reason }
}
