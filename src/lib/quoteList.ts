export const QUOTE_STATUS_ORDER = ['pending', 'sent', 'accepted', 'expired', 'declined'] as const

export type QuoteStatusSortDirection = 'priority' | 'reverse'

export type QuoteSearchFields = {
  businessName?: string | null
  contactName?: string | null
  suburb?: string | null
  postcode?: string | null
}

const quoteStatusRanks = new Map<string, number>(QUOTE_STATUS_ORDER.map((status, index) => [status, index]))

export function matchesQuoteSearch(fields: QuoteSearchFields, search: string) {
  const query = search.trim().toLocaleLowerCase('en-AU')
  if (!query) return true

  return [fields.businessName, fields.contactName, fields.suburb, fields.postcode]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('en-AU')
    .includes(query)
}

export function compareQuoteStatuses(
  leftStatus: string,
  rightStatus: string,
  direction: QuoteStatusSortDirection,
) {
  const unknownRank = QUOTE_STATUS_ORDER.length
  const leftRank = quoteStatusRanks.get(leftStatus) ?? unknownRank
  const rightRank = quoteStatusRanks.get(rightStatus) ?? unknownRank

  if (leftRank === unknownRank || rightRank === unknownRank) {
    if (leftRank !== rightRank) return leftRank - rightRank
    return leftStatus.localeCompare(rightStatus)
  }

  return direction === 'priority' ? leftRank - rightRank : rightRank - leftRank
}

export function getQuoteStatusOptions(statuses: string[]) {
  const uniqueStatuses = new Set(statuses)
  const additionalStatuses = Array.from(uniqueStatuses)
    .filter((status) => !quoteStatusRanks.has(status))
    .sort((left, right) => left.localeCompare(right))

  return [...QUOTE_STATUS_ORDER, ...additionalStatuses]
}

export function getQuoteStatusEditOptions(currentStatus: string) {
  return quoteStatusRanks.has(currentStatus)
    ? [...QUOTE_STATUS_ORDER]
    : [...QUOTE_STATUS_ORDER, currentStatus]
}
