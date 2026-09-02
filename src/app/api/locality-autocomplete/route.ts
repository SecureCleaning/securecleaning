import { NextRequest, NextResponse } from 'next/server'
import type { City } from '@/lib/types'
import { limitString, rateLimit } from '@/lib/abuseProtection'
import {
  australianStateNames,
  getAustralianLocalitySuggestions,
  getNominatimLocalitySuggestions,
  type AustralianLocalitySearchResult,
} from '@/lib/australianLocalities'

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

  const state = city === 'melbourne' ? 'VIC' : 'NSW'
  const localSuggestions = getAustralianLocalitySuggestions({ query, state, limit: 10 })
  const formatLocalSuggestions = () => localSuggestions.map((suggestion) => ({
    label: `${suggestion.suburb} ${suggestion.postcode}`,
    suburb: suggestion.suburb,
    postcode: suggestion.postcode,
    state: australianStateNames[suggestion.state] ?? suggestion.state,
  }))
  const boundedQuery = `${query}, ${australianStateNames[state]}, Australia`
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
      return NextResponse.json({ suggestions: formatLocalSuggestions() })
    }

    const remoteSuggestions = getNominatimLocalitySuggestions(
      (await response.json()) as AustralianLocalitySearchResult[],
      { query, state, limit: 10 },
    )
    const seen = new Set<string>()
    const suggestions = [...localSuggestions, ...remoteSuggestions]
      .filter((suggestion) => {
        const key = `${suggestion.suburb.toLowerCase()}|${suggestion.postcode}|${suggestion.state}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)
      .map((suggestion) => ({
        label: `${suggestion.suburb} ${suggestion.postcode}`,
        suburb: suggestion.suburb,
        postcode: suggestion.postcode,
        state: australianStateNames[suggestion.state] ?? suggestion.state,
      }))

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: formatLocalSuggestions() })
  }
}
