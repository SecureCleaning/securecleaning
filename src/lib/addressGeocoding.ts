import type { City } from '@/lib/types'

export type AddressSuggestion = {
  label: string
  value: string
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

export async function searchAustralianAddresses(query: string, city: City, limit = 5): Promise<AddressSuggestion[]> {
  const cityLabel = city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${query}, ${cityLabel}, Australia`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'au')
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 5)))

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SecureCleaningAus/0.1 (address autocomplete)',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
    cache: 'no-store',
  })
  if (!response.ok) return []

  const results = (await response.json()) as NominatimResult[]
  return results.flatMap((result) => {
    const providerLabel = result.display_name?.replace(/, Australia$/i, '').trim()
    if (!providerLabel) return []
    const label = preserveTypedStreetNumber(query, providerLabel, result.address)
    return [{
      label,
      value: label,
      postcode: result.address?.postcode ?? null,
      suburb: result.address?.suburb ?? result.address?.town ?? result.address?.city ?? null,
      state: result.address?.state ?? null,
      latitude: result.lat ?? null,
      longitude: result.lon ?? null,
    }]
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
