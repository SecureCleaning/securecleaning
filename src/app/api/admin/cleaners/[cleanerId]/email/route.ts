import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { previewCleanerEmail, sendCleanerEmail } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 512 * 1024)
  if (blocked) return blocked
  const authorization = authorizeCleanerAdminRequest(request, 'email')
  if (!authorization.identity) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  }

  try {
    const body = await request.json()
    const payload = {
      cleanerId: params.cleanerId,
      templateId: typeof body?.templateId === 'string' ? body.templateId : null,
      templateName: typeof body?.templateName === 'string' ? body.templateName : null,
      subject: body?.subject,
      body: body?.body,
      bodyHtml: body?.bodyHtml,
      bodyDocument: body?.bodyDocument,
      previewFingerprint: body?.previewFingerprint,
      actor: authorization.identity,
    }
    if (body?.action === 'preview') {
      return NextResponse.json({ success: true, preview: await previewCleanerEmail(payload) })
    }
    const email = await sendCleanerEmail(payload)

    return NextResponse.json({ success: true, email })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/email] Failed to send email:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send email.' },
      { status: 400 }
    )
  }
}
