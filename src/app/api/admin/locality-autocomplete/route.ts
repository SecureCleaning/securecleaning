import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { limitString, rateLimit } from '@/lib/abuseProtection'
import { getAustralianLocalitySuggestions } from '@/lib/australianLocalities'

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

const stateNames: Record<string, string> = {
  ACT: 'Australian Capital Territory',
  NSW: 'New South Wales',
  NT: 'Northern Territory',
  QLD: 'Queensland',
  SA: 'South Australia',
  TAS: 'Tasmania',
  VIC: 'Victoria',
  WA: 'Western Australia',
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function toSuggestion(locality: { suburb: string; postcode: string; city: string; state: string }) {
  return {
    label: `${locality.suburb} ${locality.postcode} ${locality.state}`,
    suburb: locality.suburb,
    postcode: locality.postcode,
    city: locality.city,
    state: locality.state,
  }
}

function stateCodeFromName(value?: string | null) {
  if (!value) return null
  const normalized = normalizeText(value)
  const matched = Object.entries(stateNames).find(([, name]) => normalizeText(name) === normalized)
  return matched?.[0] ?? null
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const blocked =
    rateLimit(request, { key: 'admin-locality-autocomplete:minute', limit: 30, windowMs: 60 * 1000 }) ??
    rateLimit(request, { key: 'admin-locality-autocomplete:hour', limit: 180, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const { searchParams } = request.nextUrl
  const query = searchParams.get('query')?.trim() ?? ''
  const state = searchParams.get('state')?.trim().toUpperCase() ?? ''
  const city = searchParams.get('city')?.trim() ?? ''

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  if (limitString(query, 120) || limitString(city, 80)) {
    return NextResponse.json({ error: 'Search value is too long.' }, { status: 400 })
  }

  const localSuggestions = getAustralianLocalitySuggestions({ query, state, limit: 8 }).map(toSuggestion)
  if (localSuggestions.length > 0) {
    return NextResponse.json({ suggestions: localSuggestions })
  }

  const boundedQuery = [query, stateNames[state] ?? state, 'Australia'].filter(Boolean).join(', ')
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', boundedQuery)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'au')
  url.searchParams.set('limit', '10')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SecureCleaningAus/0.1 (admin cleaner locality autocomplete)',
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
          result.address?.village ??
          result.address?.hamlet ??
          ''
        const postcode = result.address?.postcode ?? ''
        const resultState = stateCodeFromName(result.address?.state) ?? state
        const resultCity = result.address?.city ?? result.address?.town ?? city

        if (!suburb || !postcode) return null
        if (!normalizeText(suburb).includes(normalizeText(query)) && !postcode.startsWith(query)) return null
        if (state && resultState && resultState !== state) return null

        const key = `${normalizeText(suburb)}|${postcode}|${resultState}`
        if (seen.has(key)) return null
        seen.add(key)

        return {
          label: `${suburb} ${postcode}${resultState ? ` ${resultState}` : ''}`,
          suburb,
          postcode,
          city: resultCity,
          state: resultState,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
