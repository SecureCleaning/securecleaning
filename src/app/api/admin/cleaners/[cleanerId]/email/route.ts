import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { sendCleanerEmail } from '@/lib/cleaners'

export async function POST(
  request: NextRequest,
  { params }: { params: { cleanerId: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const email = await sendCleanerEmail({
      cleanerId: params.cleanerId,
      templateId: typeof body?.templateId === 'string' ? body.templateId : null,
      templateName: typeof body?.templateName === 'string' ? body.templateName : null,
      subject: body?.subject,
      body: body?.body,
      sentBy: body?.sentBy,
    })

    return NextResponse.json({ success: true, email })
  } catch (error) {
    console.error('[api/admin/cleaners/:id/email] Failed to send email:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send email.' },
      { status: 400 }
    )
  }
}
