import { NextRequest, NextResponse } from 'next/server'
import { getAvailabilitySuggestions } from '@/lib/availability'
import type { City } from '@/lib/types'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')?.trim() ?? ''
  const city = searchParams.get('city') as City | null

  if (!city || !['melbourne', 'sydney'].includes(city)) {
    return NextResponse.json({ error: 'City must be melbourne or sydney.' }, { status: 400 })
  }

  if (!address) {
    return NextResponse.json({ suggestions: [] })
  }

  const suggestions = await getAvailabilitySuggestions(address, city)
  return NextResponse.json({ suggestions })
}
