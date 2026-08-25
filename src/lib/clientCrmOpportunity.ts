export type CrmOpportunityIdentityInput = {
  organisationId: string
  contactId: string
  siteIdentity: string | null
}

export type CrmOpportunityCycle = CrmOpportunityIdentityInput & {
  id: string
  cycleNumber: number
  closed: boolean
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeCrmPhone(value: string | null | undefined) {
  return value?.replace(/[^0-9]/g, '') || null
}

export function buildCrmSiteIdentity(input: {
  address?: string | null
  suburb?: string | null
  postcode?: string | null
  city?: 'melbourne' | 'sydney' | null
}) {
  const address = normalizeText(input.address ?? '')
  const postcode = (input.postcode ?? '').replace(/[^0-9]/g, '')
  if (!address || !postcode || !input.city) return null
  return [address, normalizeText(input.suburb ?? ''), postcode, input.city].join('|')
}

export function buildCrmOpportunityIdentity(input: CrmOpportunityIdentityInput) {
  return input.siteIdentity
    ? `${input.organisationId}|site:${input.siteIdentity}`
    : `${input.organisationId}|contact:${input.contactId}|site:unconfirmed`
}

export function resolveCrmOpportunityCycle(
  existing: CrmOpportunityCycle[],
  identity: CrmOpportunityIdentityInput,
) {
  const identityKey = buildCrmOpportunityIdentity(identity)
  const matching = existing
    .filter((item) => buildCrmOpportunityIdentity(item) === identityKey)
    .sort((left, right) => left.cycleNumber - right.cycleNumber || left.id.localeCompare(right.id))
  const open = matching.find((item) => !item.closed)
  if (open) return { action: 'reuse' as const, opportunityId: open.id, cycleNumber: open.cycleNumber }
  const previous = matching.at(-1)
  return {
    action: 'create' as const,
    opportunityId: null,
    cycleNumber: (previous?.cycleNumber ?? 0) + 1,
    previousOpportunityId: previous?.id ?? null,
  }
}

export function linkCrmQuoteHistory(
  existing: Array<{ quoteId: string; sequenceNumber: number }>,
  quoteId: string,
) {
  const linked = existing.find((item) => item.quoteId === quoteId)
  if (linked) return { created: false, link: linked }
  const link = {
    quoteId,
    sequenceNumber: Math.max(0, ...existing.map((item) => item.sequenceNumber)) + 1,
  }
  return { created: true, link }
}

export function resolveCrmProvisionalPromotion(
  existing: CrmOpportunityCycle[],
  provisionalId: string,
  siteIdentity: string,
) {
  const provisional = existing.find((item) => item.id === provisionalId)
  if (!provisional || provisional.closed || provisional.siteIdentity) return { action: 'unchanged' as const, opportunityId: provisionalId }
  const siteCycles = existing
    .filter((item) => item.organisationId === provisional.organisationId && item.siteIdentity === siteIdentity)
    .sort((left, right) => left.cycleNumber - right.cycleNumber || left.id.localeCompare(right.id))
  const active = siteCycles.find((item) => !item.closed)
  if (active) return { action: 'merge' as const, opportunityId: active.id, cancelledOpportunityId: provisionalId }
  const previous = siteCycles.at(-1)
  return {
    action: 'promote' as const,
    opportunityId: provisionalId,
    cycleNumber: (previous?.cycleNumber ?? 0) + 1,
    previousOpportunityId: previous?.id ?? null,
  }
}

export function resolveCrmSyncLink(quoteOpportunityId: string | null, bookingOpportunityId: string | null) {
  if (quoteOpportunityId && bookingOpportunityId && quoteOpportunityId !== bookingOpportunityId) {
    return { action: 'conflict' as const, opportunityId: null }
  }
  return { action: 'reuse' as const, opportunityId: quoteOpportunityId ?? bookingOpportunityId }
}
