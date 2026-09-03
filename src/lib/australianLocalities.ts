import { australianPostcodeRows } from '@/data/australianPostcodes20260527'

export type AustralianLocality = {
  suburb: string
  postcode: string
  city: string
  state: string
  latitude?: number
  longitude?: number
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

function formatSuburbName(value: string) {
  return value
    .toLocaleLowerCase('en-AU')
    .replace(/(^|[\s'(-])([a-z])/g, (_, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`)
    .replace(/\bMc([a-z])/g, (_, letter: string) => `Mc${letter.toUpperCase()}`)
}

export const australianLocalities: AustralianLocality[] = australianPostcodeRows.map(
  ([postcode, suburb, state, latitude, longitude]) => ({
    suburb: formatSuburbName(suburb),
    postcode,
    city: state === 'VIC' ? 'Melbourne' : 'Sydney',
    state,
    ...(latitude === null ? {} : { latitude }),
    ...(longitude === null ? {} : { longitude }),
  }),
)

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
): AustralianLocality[] {
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
