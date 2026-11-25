import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { findCleanerMatches } from '@/lib/cleanerDuplicateLookup'
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 32 * 1024)
  if (blocked) return blocked
  const auth = await authorizeCleanerAdminRequest(request, 'mutate')
  if (!auth.identity) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const throttled = await rateLimit(request, { key: `cleaner-matches:${auth.identity.id}`, limit: 60, windowMs: 60000 })
  if (throttled) return throttled
  try { return NextResponse.json({ matches: await findCleanerMatches(await request.json()) }) }
  catch { return NextResponse.json({ error: 'Unable to check existing cleaners. Please try again.' }, { status: 400 }) }
}
