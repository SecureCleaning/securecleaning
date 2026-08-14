import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { sendCleanerEmailForState } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 12 * 1024)
  if (blocked) return blocked

  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-email:${context.assignee.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const body = await request.json()
    const email = await sendCleanerEmailForState({
      cleanerId: params.cleanerId,
      state: context.state,
      templateId: typeof body?.templateId === 'string' ? body.templateId.trim() || null : null,
      subject: body?.subject,
      body: body?.body,
      actor: context.actor,
    })
    return NextResponse.json({ success: true, email })
  } catch (error) {
    if (error instanceof Error && error.message === 'Cleaner not found.') {
      return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to send email.' }, { status: 400 })
  }
}
