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
    postcode?: string
    suburb?: string
    town?: string
    city?: string
    state?: string
  }
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
    const label = result.display_name?.replace(/, Australia$/i, '').trim()
    if (!label) return []
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
