// Quote PostgREST filter values so punctuation stays literal rather than changing the query.
function filterValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function agentCleanerSearchFilter(search: string) {
  const literal = search.replace(/[\\%_*]/g, '\\$&')
  const filters = ['business_name', 'first_name', 'last_name', 'contact_name', 'email', 'suburb', 'postcode']
    .map((field) => `${field}.ilike.${filterValue(`%${literal}%`)}`)
  const digits = search.replace(/\D/g, '')
  if (digits && /^[\d\s()+.\-]+$/.test(search)) {
    // Only separators may occur between digits: never match a different intervening digit.
    const pattern = digits.split('').join('[^0-9]*')
    filters.push(...['phone', 'alternate_phone'].map((field) => `${field}.match.${filterValue(pattern)}`))
  }
  return filters.join(',')
}
