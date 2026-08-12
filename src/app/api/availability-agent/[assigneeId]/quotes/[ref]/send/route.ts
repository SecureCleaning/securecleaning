import { NextRequest, NextResponse } from 'next/server'
import { getAssigneeServiceZones, getAvailabilityAssignee, getAvailabilityConfig, locationMatchesServiceZones } from '@/lib/availability'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { writeAuditLog } from '@/lib/auditLog'
import { sendUpdatedQuoteEmail } from '@/lib/email'
import { getPublicQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'

export async function POST(
  request: NextRequest,
  { params }: { params: { assigneeId: string; ref: string } },
) {
  if (!(await isAuthorizedAvailabilityAgentRequest(request, params.assigneeId))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, params.assigneeId)
    const quote = await getPublicQuoteWorkflowByRef(params.ref)
    if (!assignee || !quote) return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })

    const serviceZones = getAssigneeServiceZones(config, params.assigneeId)
    const allowed = quote.inputs.city === assignee.city && (
      serviceZones.length === 0 || locationMatchesServiceZones(quote.inputs, quote.inputs.city, serviceZones)
    )
    if (!allowed) return NextResponse.json({ success: false, error: 'This quote is outside your assigned service region.' }, { status: 403 })

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
    await writeAuditLog('quote', params.ref, 'updated_quote_emailed', { to, subject, assigneeId: params.assigneeId })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/availability-agent/quote-send] Failed to email updated quote:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to email updated quote.' }, { status: 500 })
  }
}
