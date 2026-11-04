import type { City } from '@/lib/types'

export type AddressSuggestion = {
  label: string
  value: string
  streetAddress?: string
  postcode?: string | null
  suburb?: string | null
  state?: string | null
  latitude?: string | null
  longitude?: string | null
}

type NominatimResult = {
  display_name?: string
  lat?: string
  lon?: string
  address?: {
    house_number?: string
    road?: string
    postcode?: string
    suburb?: string
    town?: string
    city?: string
    state?: string
  }
}

function normalizeStreet(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(rd|rd\.)\b/g, 'road')
    .replace(/\b(st|st\.)\b/g, 'street')
    .replace(/\b(ave|ave\.)\b/g, 'avenue')
    .replace(/\b(hwy|hwy\.)\b/g, 'highway')
    .replace(/\b(pde|pde\.)\b/g, 'parade')
    .replace(/\b(dr|dr\.)\b/g, 'drive')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function preserveTypedStreetNumber(
  query: string,
  label: string,
  address?: Pick<NonNullable<NominatimResult['address']>, 'house_number' | 'road'>,
) {
  if (address?.house_number || /^\s*\d/.test(label)) return label

  const match = query.trim().match(/^(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)\s+(.+)$/i)
  if (!match) return label

  const [, streetNumber, typedStreet] = match
  const suggestedStreet = address?.road ?? label.split(',')[0] ?? ''
  const normalizedTypedStreet = normalizeStreet(typedStreet)
  const normalizedSuggestedStreet = normalizeStreet(suggestedStreet)
  const streetsMatch = normalizedTypedStreet.length >= 3
    && normalizedSuggestedStreet.length >= 3
    && (normalizedTypedStreet.startsWith(normalizedSuggestedStreet)
      || normalizedSuggestedStreet.startsWith(normalizedTypedStreet))

  return streetsMatch ? `${streetNumber.replace(/\s+/g, '')} ${label}` : label
}

export function matchesAddressLocality(suggestion: AddressSuggestion, locality: { suburb: string; postcode: string }, city: City) {
  const state = city === 'brisbane' ? 'Queensland' : city === 'melbourne' ? 'Victoria' : 'New South Wales'
  const code = city === 'brisbane' ? 'QLD' : city === 'melbourne' ? 'VIC' : 'NSW'
  return suggestion.postcode === locality.postcode
    && suggestion.suburb?.trim().toLowerCase() === locality.suburb.trim().toLowerCase()
    && [state.toLowerCase(), code.toLowerCase()].includes(suggestion.state?.trim().toLowerCase() || '')
}

export async function searchAustralianAddresses(query: string, city: City, limit = 5, locality?: { suburb: string; postcode: string }): Promise<AddressSuggestion[]> {
  const cityLabel = city === 'brisbane' ? 'Queensland' : city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const url = new URL(process.env.ADDRESS_LOOKUP_URL || 'https://nominatim.openstreetmap.org/search')
  const location = locality ? `${locality.suburb} ${locality.postcode}, ${cityLabel}` : cityLabel
  url.searchParams.set('q', `${query}, ${location}, Australia`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'au')
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 5)))

  // One shared server-side bucket covers all users and all address lookup callers.
  // Explicit searches and cacheable responses respect the public provider's limits.
  const { rateLimitValue } = await import('./abuseProtection')
  if (await rateLimitValue('address-provider', { key: 'address-provider:global', limit: 1, windowMs: 1100 })) {
    throw new Error('Address search is busy. Please wait a moment and try again.')
  }
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SecureCleaningAus/0.1 (explicit address lookup; https://securecleaning.com.au)',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
    cache: 'force-cache',
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return []

  const results = (await response.json()) as NominatimResult[]
  return results.flatMap((result) => {
    const providerLabel = result.display_name?.replace(/, Australia$/i, '').trim()
    if (!providerLabel) return []
    const label = preserveTypedStreetNumber(query, providerLabel, result.address)
    const suggestion: AddressSuggestion = {
      label,
      value: label,
      streetAddress: result.address?.road ? preserveTypedStreetNumber(query, [result.address.house_number, result.address.road].filter(Boolean).join(' '), result.address) : undefined,
      postcode: result.address?.postcode ?? null,
      suburb: result.address?.suburb ?? result.address?.town ?? result.address?.city ?? null,
      state: result.address?.state ?? null,
      latitude: result.lat ?? null,
      longitude: result.lon ?? null,
    }
    if (locality && (!suggestion.streetAddress || !matchesAddressLocality(suggestion, locality, city))) return []
    return [suggestion]
  })
}

export async function verifyAddressCoordinates(
  address: string,
  suburb: string,
  postcode: string,
  city: City,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const suggestions = await searchAustralianAddresses(`${address}, ${suburb} ${postcode}`, city, 5)
    const normalizedSuburb = suburb.trim().toLowerCase()
    const match = suggestions.find((suggestion) =>
      suggestion.postcode === postcode
      && (!suggestion.suburb || suggestion.suburb.trim().toLowerCase() === normalizedSuburb)
    ) ?? suggestions.find((suggestion) => suggestion.postcode === postcode)
    const latitude = Number(match?.latitude)
    const longitude = Number(match?.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
  } catch {
    return null
  }
}
