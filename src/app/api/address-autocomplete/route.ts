import { NextRequest, NextResponse } from 'next/server'
import type { City } from '@/lib/types'
import { limitString, rateLimit } from '@/lib/abuseProtection'
import { searchAustralianAddresses } from '@/lib/addressGeocoding'

export async function GET(request: NextRequest) {
  const blocked =
    await rateLimit(request, { key: 'address-autocomplete:minute', limit: 20, windowMs: 60 * 1000 }) ??
    await rateLimit(request, { key: 'address-autocomplete:hour', limit: 120, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() ?? ''
  const city = searchParams.get('city') as City | null
  const suburb = searchParams.get('suburb')?.trim() || ''
  const postcode = searchParams.get('postcode')?.trim() || ''

  if (!city || !['melbourne', 'sydney', 'brisbane'].includes(city)) {
    return NextResponse.json({ error: 'Choose a supported service region.' }, { status: 400 })
  }

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  if ((suburb || postcode) && (!suburb || suburb.length > 80 || !/^\d{4}$/.test(postcode))) {
    return NextResponse.json({ error: 'Choose a suburb and postcode before searching addresses.' }, { status: 400 })
  }

  if (limitString(query, 180)) {
    return NextResponse.json({ error: 'Search value is too long.' }, { status: 400 })
  }

  try {
    return NextResponse.json({ suggestions: await searchAustralianAddresses(query, city, 5, suburb ? { suburb, postcode } : undefined) })
  } catch {
    return NextResponse.json({ error: 'Address search is temporarily unavailable. Please try again, or confirm and enter the address manually.' }, { status: 503 })
  }
}
