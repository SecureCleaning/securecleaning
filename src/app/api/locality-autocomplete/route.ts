import { NextRequest, NextResponse } from 'next/server'
import type { City } from '@/lib/types'
import { limitString, rateLimit } from '@/lib/abuseProtection'

type NominatimResult = {
  address?: {
    postcode?: string
    suburb?: string
    town?: string
    city?: string
    village?: string
    hamlet?: string
    state?: string
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

export async function GET(request: NextRequest) {
  const blocked =
    rateLimit(request, { key: 'locality-autocomplete:minute', limit: 20, windowMs: 60 * 1000 }) ??
    rateLimit(request, { key: 'locality-autocomplete:hour', limit: 120, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() ?? ''
  const city = searchParams.get('city') as City | null

  if (!city || !['melbourne', 'sydney'].includes(city)) {
    return NextResponse.json({ error: 'City must be melbourne or sydney.' }, { status: 400 })
  }

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  if (limitString(query, 120)) {
    return NextResponse.json({ error: 'Search value is too long.' }, { status: 400 })
  }

  const cityLabel = city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const boundedQuery = `${query}, ${cityLabel}, Australia`
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', boundedQuery)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'au')
  url.searchParams.set('limit', '10')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SecureCleaningAus/0.1 (locality autocomplete)',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ suggestions: [] })
    }

    const results = (await response.json()) as NominatimResult[]
    const seen = new Set<string>()

    const suggestions = results
      .map((result) => {
        const suburb =
          result.address?.suburb ??
          result.address?.town ??
          result.address?.city ??
          result.address?.village ??
          result.address?.hamlet ??
          ''
        const postcode = result.address?.postcode ?? ''
        const state = result.address?.state ?? null

        if (!suburb || !postcode) return null

        const key = `${normalizeText(suburb)}|${postcode}`
        if (seen.has(key)) return null
        seen.add(key)

        return {
          label: `${suburb} ${postcode}`,
          suburb,
          postcode,
          state,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
