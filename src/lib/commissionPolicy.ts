export function commissionCents(totalIncGstCents: number, gstCents: number, paidCents: number, rateBps: number, activePlan: boolean) {
  if (![totalIncGstCents, gstCents, paidCents, rateBps].every(Number.isSafeInteger)
    || totalIncGstCents <= 0 || gstCents < 0 || gstCents > totalIncGstCents || paidCents < 0 || rateBps < 0 || rateBps > 10000) throw new Error('Invalid commission amounts.')
  const eligible = activePlan || paidCents >= totalIncGstCents ? Math.min(paidCents, totalIncGstCents) : 0
  // Round cumulative entitlement, not each receipt, so split payments preserve cents.
  const numerator = BigInt(totalIncGstCents - gstCents) * BigInt(rateBps) * BigInt(eligible)
  const denominator = BigInt(10000) * BigInt(totalIncGstCents)
  return Number((numerator + denominator / BigInt(2)) / denominator)
}

export function parsePlanInstalments(value: unknown, outstandingCents: number) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 24) throw new Error('Enter between 2 and 24 instalments.')
  let previous = ''
  const rows = value.map((entry, index) => {
    const dueOn = typeof entry?.dueOn === 'string' ? entry.dueOn : ''
    const amountCents = Number(entry?.amountCents)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || !Number.isFinite(Date.parse(dueOn)) || new Date(dueOn).toISOString().slice(0, 10) !== dueOn
      || dueOn < previous || !Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Use valid dates in order and positive instalment amounts.')
    previous = dueOn
    return { sequenceNumber: index + 1, dueOn, amountCents }
  })
  if (rows.reduce((sum, row) => sum + row.amountCents, 0) !== outstandingCents) throw new Error('Instalments must exactly equal the outstanding invoice balance.')
  return rows
}

export function commissionShares(totalIncGstCents: number, gstCents: number, paidCents: number, winBps: number, saleBps: number, activePlan: boolean) {
  if (![winBps, saleBps].every(Number.isSafeInteger) || winBps < 0 || saleBps < 0 || winBps + saleBps > 10000) throw new Error('Invalid commission rates.')
  const combined = commissionCents(totalIncGstCents, gstCents, paidCents, winBps + saleBps, activePlan)
  const totalRate = BigInt(winBps + saleBps)
  const win = totalRate === BigInt(0) ? 0 : Number((BigInt(combined) * BigInt(winBps) * BigInt(2) + totalRate) / (totalRate * BigInt(2)))
  return { win, sale: combined - win, combined }
}
