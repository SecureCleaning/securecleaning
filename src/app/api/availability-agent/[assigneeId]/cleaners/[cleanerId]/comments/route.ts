import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { addCleanerCommentForState } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024)
  if (blocked) return blocked

  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-comment:${context.assignee.id}`, limit: 60, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const body = await request.json()
    const comment = await addCleanerCommentForState(params.cleanerId, context.state, body?.comment, context.actor)
    return NextResponse.json({ success: true, comment })
  } catch (error) {
    if (error instanceof Error && error.message === 'Cleaner not found.') {
      return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to add comment.' }, { status: 400 })
  }
}
