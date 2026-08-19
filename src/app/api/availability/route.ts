import { NextRequest, NextResponse } from 'next/server'
import { getAvailabilityCalendar } from '@/lib/availability'
import type { City } from '@/lib/types'
import { limitString, rateLimit } from '@/lib/abuseProtection'

export async function GET(request: NextRequest) {
  const blocked =
    rateLimit(request, { key: 'availability:minute', limit: 20, windowMs: 60 * 1000 }) ??
    rateLimit(request, { key: 'availability:hour', limit: 120, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')?.trim() ?? ''
  const suburb = searchParams.get('suburb')?.trim() ?? ''
  const postcode = searchParams.get('postcode')?.trim() ?? ''
  const preferredDate = searchParams.get('preferredDate')?.trim() ?? ''
  const latitudeText = searchParams.get('latitude')?.trim() ?? ''
  const longitudeText = searchParams.get('longitude')?.trim() ?? ''
  const latitude = latitudeText ? Number(latitudeText) : undefined
  const longitude = longitudeText ? Number(longitudeText) : undefined
  const city = searchParams.get('city') as City | null

  if (!city || !['melbourne', 'sydney'].includes(city)) {
    return NextResponse.json({ error: 'City must be melbourne or sydney.' }, { status: 400 })
  }

  if (
    limitString(address, 180) ||
    limitString(suburb, 80) ||
    limitString(postcode, 12) ||
    limitString(preferredDate, 32)
  ) {
    return NextResponse.json({ error: 'Search value is too long.' }, { status: 400 })
  }

  if (
    (latitudeText && (!Number.isFinite(latitude) || latitude! < -44 || latitude! > -10))
    || (longitudeText && (!Number.isFinite(longitude) || longitude! < 112 || longitude! > 154))
    || Boolean(latitudeText) !== Boolean(longitudeText)
  ) {
    return NextResponse.json({ error: 'Coordinates are invalid.' }, { status: 400 })
  }

  if (!address && !suburb && !postcode) {
    return NextResponse.json({ suggestions: [], availableDates: [], zoneMatched: false, matchMethod: 'none', matchedZoneNames: [] })
  }

  const availability = await getAvailabilityCalendar(
    { address, suburb, postcode, latitude, longitude },
    city,
    preferredDate || undefined
  )
  return NextResponse.json(availability)
}
