export function getContractProductStartDateDraft(startDate: string) {
  const normalized = startDate.trim()
  return { startDate: normalized, startDateTbc: normalized.length === 0 }
}

export function resolveContractProductStartDate(startDate: string, startDateTbc: boolean) {
  return startDateTbc ? '' : startDate.trim()
}

export function formatContractProductStartDate(startDate: string) {
  return startDate.trim() || 'TBC'
}

export function normalizeContractProductHours(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim().replace(/\s+/g, ' ').slice(0, 40)
}

export function isValidContractProductHours(value: string) {
  if (!value) return true
  const match = value.replace(/[–—]/g, '-').match(
    /^(\d+(?:\.\d{1,2})?)(?:\s*(?:-|to)\s*(\d+(?:\.\d{1,2})?))?\s*(?:hours?|hrs?)?$/i,
  )
  if (!match) return false
  const minimum = Number(match[1])
  const maximum = Number(match[2] ?? match[1])
  return minimum >= 0.25 && maximum <= 168 && minimum <= maximum
}

export function formatContractProductHours(value: string) {
  const normalized = normalizeContractProductHours(value)
  if (!normalized) return 'TBC'
  return /(?:hours?|hrs?)$/i.test(normalized) ? normalized : `${normalized} hours`
}
