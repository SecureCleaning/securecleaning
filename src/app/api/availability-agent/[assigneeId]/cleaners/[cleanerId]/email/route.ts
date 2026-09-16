import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getCleanerAgentContext } from '@/lib/cleanerAgentAccess'
import { previewCleanerEmail, sendCleanerEmailForState } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; cleanerId: string } },
) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 512 * 1024)
  if (blocked) return blocked

  const context = await getCleanerAgentContext(request, params.assigneeId)
  if (!context) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const throttled = rateLimit(request, { key: `agent-cleaner-email:${context.assignee.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled

  try {
    const body = await request.json()
    const common = {
      cleanerId: params.cleanerId,
      state: context.state,
      templateId: typeof body?.templateId === 'string' ? body.templateId.trim() || null : null,
      subject: body?.subject,
      body: body?.body,
      bodyHtml: body?.bodyHtml,
      bodyDocument: body?.bodyDocument,
      previewFingerprint: body?.previewFingerprint,
      actor: context.actor,
    }
    if (body?.action === 'preview') {
      return NextResponse.json({ success: true, preview: await previewCleanerEmail(common) })
    }
    const email = await sendCleanerEmailForState({
      ...common,
    })
    return NextResponse.json({ success: true, email })
  } catch (error) {
    if (error instanceof Error && error.message === 'Cleaner not found.') {
      return NextResponse.json({ success: false, error: 'Cleaner not found.' }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to send email.' }, { status: 400 })
  }
}
