export type ScheduleRow = { dueOn: string; amountCents: number }

/** Carry only unpaid amounts forward, without changing their agreed due dates. */
export function remainingPlanRows(rows: ScheduleRow[], paidCents: number, openingPaidCents: number) {
  let available = Math.max(0, paidCents - openingPaidCents)
  return rows.flatMap(row => {
    const received = Math.min(available, row.amountCents)
    available -= received
    return received === row.amountCents ? [] : [{ dueOn: row.dueOn, amountCents: row.amountCents - received }]
  })
}

export function parseAmendedPrice(value: unknown, depositCents: number, paidCents: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a price with no more than two decimal places.')
  const cents = Math.round(Number(text) * 100)
  if (!Number.isSafeInteger(cents) || cents > 2147483647 || cents <= depositCents) throw new Error('The purchase price must be greater than the deposit.')
  if (cents < paidCents) throw new Error('The price cannot be below confirmed payments. Handle any refund or credit separately.')
  return cents
}
