export type AustralianLocality = {
  suburb: string
  postcode: string
  city: string
  state: string
}

export type AustralianLocalitySearchResult = {
  name?: string
  address?: {
    postcode?: string
    suburb?: string
    town?: string
    village?: string
    hamlet?: string
    locality?: string
    municipality?: string
    city?: string
    state?: string
    'ISO3166-2-lvl4'?: string
  }
}

export const australianStateNames: Record<string, string> = {
  ACT: 'Australian Capital Territory',
  NSW: 'New South Wales',
  NT: 'Northern Territory',
  QLD: 'Queensland',
  SA: 'South Australia',
  TAS: 'Tasmania',
  VIC: 'Victoria',
  WA: 'Western Australia',
}

export const australianLocalities: AustralianLocality[] = [
  { suburb: 'Adelaide', postcode: '5000', city: 'Adelaide', state: 'SA' },
  { suburb: 'Alexandria', postcode: '2015', city: 'Sydney', state: 'NSW' },
  { suburb: 'Blacktown', postcode: '2148', city: 'Sydney', state: 'NSW' },
  { suburb: 'Brisbane City', postcode: '4000', city: 'Brisbane', state: 'QLD' },
  { suburb: 'Canberra', postcode: '2600', city: 'Canberra', state: 'ACT' },
  { suburb: 'Carlton', postcode: '3053', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Clayton', postcode: '3168', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Collingwood', postcode: '3066', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Darwin City', postcode: '0800', city: 'Darwin', state: 'NT' },
  { suburb: 'Docklands', postcode: '3008', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Dandenong', postcode: '3175', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Fitzroy', postcode: '3065', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Geelong', postcode: '3220', city: 'Geelong', state: 'VIC' },
  { suburb: 'Glen Waverley', postcode: '3150', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Hobart', postcode: '7000', city: 'Hobart', state: 'TAS' },
  { suburb: 'Keysborough', postcode: '3173', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Macquarie Park', postcode: '2113', city: 'Sydney', state: 'NSW' },
  { suburb: 'Mascot', postcode: '2020', city: 'Sydney', state: 'NSW' },
  { suburb: 'Melbourne', postcode: '3000', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Melbourne', postcode: '3004', city: 'Melbourne', state: 'VIC' },
  { suburb: 'North Melbourne', postcode: '3051', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Parramatta', postcode: '2150', city: 'Sydney', state: 'NSW' },
  { suburb: 'Perth', postcode: '6000', city: 'Perth', state: 'WA' },
  { suburb: 'Richmond', postcode: '3121', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Richmond', postcode: '2753', city: 'Sydney', state: 'NSW' },
  { suburb: 'Richmond', postcode: '5033', city: 'Adelaide', state: 'SA' },
  { suburb: 'Richmond', postcode: '4740', city: 'Mackay', state: 'QLD' },
  { suburb: 'Richmond', postcode: '7025', city: 'Hobart', state: 'TAS' },
  { suburb: 'South Melbourne', postcode: '3205', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Southbank', postcode: '3006', city: 'Melbourne', state: 'VIC' },
  { suburb: 'South Yarra', postcode: '3141', city: 'Melbourne', state: 'VIC' },
  { suburb: 'St Kilda', postcode: '3182', city: 'Melbourne', state: 'VIC' },
  { suburb: 'Sydney', postcode: '2000', city: 'Sydney', state: 'NSW' },
  { suburb: 'West Melbourne', postcode: '3003', city: 'Melbourne', state: 'VIC' },
]

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function stateCodeFromResult(result: AustralianLocalitySearchResult) {
  const isoCode = result.address?.['ISO3166-2-lvl4']?.split('-').at(-1)?.toUpperCase()
  if (isoCode && australianStateNames[isoCode]) return isoCode

  const stateName = normalize(result.address?.state ?? '')
  return Object.entries(australianStateNames).find(([, name]) => normalize(name) === stateName)?.[0] ?? ''
}

function localityNameFromResult(result: AustralianLocalitySearchResult) {
  const address = result.address
  const explicitLocality =
    address?.suburb ??
    address?.town ??
    address?.village ??
    address?.hamlet ??
    address?.locality ??
    address?.municipality
  if (explicitLocality) return explicitLocality.trim()

  const namedPlace = result.name
    ?.replace(/^City of\s+/i, '')
    .replace(/\s+(?:City )?Council$/i, '')
    .trim()
  if (namedPlace && !/^\d{4}$/.test(namedPlace)) return namedPlace

  return ''
}

export function getNominatimLocalitySuggestions(
  results: AustralianLocalitySearchResult[],
  { query, state, limit = 10 }: { query: string; state: string; limit?: number },
) {
  const normalizedQuery = normalize(query)
  const normalizedState = state.trim().toUpperCase()
  const seen = new Set<string>()

  return results.flatMap((result) => {
    const suburb = localityNameFromResult(result)
    const postcode = result.address?.postcode?.match(/\b\d{4}\b/)?.[0] ?? ''
    const resultState = stateCodeFromResult(result)
    if (!suburb || !postcode || resultState !== normalizedState) return []

    const normalizedSuburb = normalize(suburb)
    if (!normalizedSuburb.includes(normalizedQuery) && !postcode.startsWith(normalizedQuery)) return []

    const key = `${normalizedSuburb}|${postcode}|${resultState}`
    if (seen.has(key)) return []
    seen.add(key)

    return [{ suburb, postcode, city: suburb, state: resultState }]
  }).slice(0, Math.min(Math.max(limit, 1), 20))
}

export function getAustralianLocalitySuggestions({
  query,
  state,
  limit = 8,
}: {
  query: string
  state?: string
  limit?: number
}) {
  const normalizedQuery = normalize(query)
  const normalizedState = state?.trim().toUpperCase()

  if (normalizedQuery.length < 2) {
    return []
  }

  return australianLocalities
    .filter((locality) => {
      if (normalizedState && locality.state !== normalizedState) return false

      const suburb = normalize(locality.suburb)
      return (
        locality.postcode.startsWith(normalizedQuery) ||
        suburb.startsWith(normalizedQuery) ||
        suburb.includes(normalizedQuery)
      )
    })
    .sort((left, right) => {
      const leftExact = normalize(left.suburb) === normalizedQuery ? 0 : 1
      const rightExact = normalize(right.suburb) === normalizedQuery ? 0 : 1
      if (leftExact !== rightExact) return leftExact - rightExact

      const leftStarts = normalize(left.suburb).startsWith(normalizedQuery) ? 0 : 1
      const rightStarts = normalize(right.suburb).startsWith(normalizedQuery) ? 0 : 1
      if (leftStarts !== rightStarts) return leftStarts - rightStarts

      return `${left.suburb} ${left.postcode}`.localeCompare(`${right.suburb} ${right.postcode}`)
    })
    .slice(0, limit)
}
