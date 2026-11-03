import { NextRequest } from 'next/server'
import { getPartnerActor } from '@/lib/partnerBookingAuth'
import { partnerAvailability } from '@/lib/partnerBookingAvailability'
import { partnerJson, partnerFailure } from '@/lib/partnerBookingHttp'
import { rateLimitValue } from '@/lib/abuseProtection'
export async function GET(request: NextRequest) {
  try {
    const actor = await getPartnerActor(request)
    const blocked = await rateLimitValue(actor.id, { key: 'partner:availability', limit: 30, windowMs: 60000 }); if (blocked) return blocked
    return partnerJson((await partnerAvailability(actor.company, Object.fromEntries(request.nextUrl.searchParams))).public)
  } catch (error) { return partnerFailure(error) }
}
