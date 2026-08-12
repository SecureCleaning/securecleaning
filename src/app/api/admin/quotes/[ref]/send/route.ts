import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { sendUpdatedQuoteEmail } from '@/lib/email'
import { getPublicQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { writeAuditLog } from '@/lib/auditLog'

export async function POST(
  request: NextRequest,
  { params }: { params: { ref: string } },
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const quote = await getPublicQuoteWorkflowByRef(params.ref)
    if (!quote) return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as { to?: unknown; subject?: unknown; message?: unknown }
    const to = typeof body.to === 'string' ? body.to.trim() : quote.inputs.email.trim()
    const subject = typeof body.subject === 'string' ? body.subject.trim() : undefined
    const message = typeof body.message === 'string' ? body.message.trim() : undefined
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ success: false, error: 'Enter a valid customer email address.' }, { status: 400 })
    }
    if (subject && subject.length > 180) {
      return NextResponse.json({ success: false, error: 'The email subject is too long.' }, { status: 400 })
    }
    if (message && message.length > 4000) {
      return NextResponse.json({ success: false, error: 'The email message is too long.' }, { status: 400 })
    }

    await sendUpdatedQuoteEmail(quote.quoteRef, quote.inputs, quote.displayPrice, { to, subject, message })
    await writeAuditLog('quote', params.ref, 'updated_quote_emailed', { to, subject })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/admin/quotes/[ref]/send] Failed to email updated quote:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to email updated quote.' }, { status: 500 })
  }
}
