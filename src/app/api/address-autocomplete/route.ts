import { NextRequest, NextResponse } from 'next/server'
import type { City } from '@/lib/types'

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
    road?: string
    house_number?: string
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() ?? ''
  const city = searchParams.get('city') as City | null

  if (!city || !['melbourne', 'sydney'].includes(city)) {
    return NextResponse.json({ error: 'City must be melbourne or sydney.' }, { status: 400 })
  }

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  const cityLabel = city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const boundedQuery = `${query}, ${cityLabel}, Australia`
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', boundedQuery)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'au')
  url.searchParams.set('limit', '5')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SecureCleaningAus/0.1 (address autocomplete)',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ suggestions: [] })
    }

    const results = (await response.json()) as NominatimResult[]

    const suggestions = results
      .map((result) => {
        const label = result.display_name?.replace(/, Australia$/i, '').trim()
        if (!label) return null

        return {
          label,
          value: label,
          postcode: result.address?.postcode ?? null,
          suburb: result.address?.suburb ?? result.address?.town ?? result.address?.city ?? null,
          state: result.address?.state ?? null,
          latitude: result.lat ?? null,
          longitude: result.lon ?? null,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
