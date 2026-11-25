import { NextRequest, NextResponse } from 'next/server'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { findCleanerMatches } from '@/lib/cleanerDuplicateLookup'
export async function POST(request: NextRequest, props: { params: Promise<{ assigneeId: string }> }) {
  const blocked = rejectCrossOriginMutation(request) ?? await rejectLargePayload(request, 32 * 1024)
  if (blocked) return blocked
  const context = await getCleanerAgentContext(request, (await props.params).assigneeId)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const throttled = await rateLimit(request, { key: `agent-cleaner-matches:${context.assignee.id}`, limit: 60, windowMs: 60000 })
  if (throttled) return throttled
  try { return NextResponse.json({ matches: await findCleanerMatches(await request.json(), context.state) }) }
  catch { return NextResponse.json({ error: 'Unable to check existing cleaners. Please try again.' }, { status: 400 }) }
}
