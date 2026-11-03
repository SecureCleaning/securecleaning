import { NextRequest } from 'next/server'
import { getPartnerActor } from '@/lib/partnerBookingAuth'
import { createPartnerBooking } from '@/lib/partnerBookingCreate'
import { partnerJson, partnerFailure } from '@/lib/partnerBookingHttp'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimitValue } from '@/lib/abuseProtection'
export const maxDuration = 60
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 12000); if (blocked) return blocked
  try {
    const actor = await getPartnerActor(request)
    const limited = await rateLimitValue(actor.id, { key: 'partner:book', limit: 20, windowMs: 60000 }); if (limited) return limited
    return partnerJson(await createPartnerBooking(actor, await request.json()))
  } catch (error) { return partnerFailure(error) }
}
