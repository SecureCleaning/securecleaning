import { NextRequest } from 'next/server'
import { getPartnerActor } from '@/lib/partnerBookingAuth'
import { createPartnerCleaner } from '@/lib/partnerCleanerCreate'
import { partnerJson, partnerFailure } from '@/lib/partnerBookingHttp'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimitValue } from '@/lib/abuseProtection'

export const maxDuration = 60
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 8000)
  if (blocked) return blocked
  try {
    const actor = await getPartnerActor(request)
    const limited = await rateLimitValue(actor.id, { key: 'partner:cleaner', limit: 10, windowMs: 60000 })
    if (limited) return limited
    return partnerJson(await createPartnerCleaner(actor, await request.json()))
  } catch (error) { return partnerFailure(error) }
}
