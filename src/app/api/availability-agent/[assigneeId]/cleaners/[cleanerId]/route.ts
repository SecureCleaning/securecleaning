import { NextRequest, NextResponse } from 'next/server'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { getCleanerDetailForState, updateCleanerForState } from '@/lib/cleaners'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'

export async function GET(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const detail = await getCleanerDetailForState(params.cleanerId, context.state)
    return NextResponse.json({ success: true, ...detail })
  } catch {
    return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 32 * 1024)
  if (blocked) return blocked
  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-update:${context.assignee.id}`, limit: 120, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const cleaner = await updateCleanerForState(params.cleanerId, await request.json(), context.state, context.actor)
    return NextResponse.json({ success: true, cleaner })
  } catch (error) {
    if (error instanceof Error && error.message === 'Cleaner not found.') {
      return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to update cleaner.' }, { status: 400 })
  }
}
