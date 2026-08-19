import { NextRequest, NextResponse } from 'next/server'
import type { City } from '@/lib/types'
import { limitString, rateLimit } from '@/lib/abuseProtection'
import { searchAustralianAddresses } from '@/lib/addressGeocoding'

export async function GET(request: NextRequest) {
  const blocked =
    rateLimit(request, { key: 'address-autocomplete:minute', limit: 20, windowMs: 60 * 1000 }) ??
    rateLimit(request, { key: 'address-autocomplete:hour', limit: 120, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() ?? ''
  const city = searchParams.get('city') as City | null

  if (!city || !['melbourne', 'sydney'].includes(city)) {
    return NextResponse.json({ error: 'City must be melbourne or sydney.' }, { status: 400 })
  }

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  if (limitString(query, 120)) {
    return NextResponse.json({ error: 'Search value is too long.' }, { status: 400 })
  }

  try {
    return NextResponse.json({ suggestions: await searchAustralianAddresses(query, city) })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
