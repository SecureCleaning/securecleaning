import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAssigneeServiceZones, getAvailabilityAssignee, getAvailabilityConfig, locationMatchesServiceZones } from '@/lib/availability'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getStaffAccountById } from '@/lib/staffAccounts'
import { EmailProviderRejectedError, sendUpdatedQuoteEmail } from '@/lib/email'
import {
  completeFinalQuoteSend, createFinalQuoteSendAttempt,
  getPublicQuoteWorkflowByRef, getQuoteWorkflowByRef, recordFinalQuoteProviderAccepted, recordFinalQuoteSendFailure,
} from '@/lib/quoteWorkflowData'
import { getFinalQuoteReadiness } from '@/lib/quoteWorkflow'
import { getSendFailureDisposition, resolveFinalQuoteRecipient } from '@/lib/finalQuoteSendPolicy'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest, { params }: { params: { assigneeId: string; ref: string } }) {
  if (!(await isAuthorizedAvailabilityAgentRequest(request, params.assigneeId))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  let attemptId: string | null = null
  let providerAccepted = false
  let providerCallStarted = false
  try {
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, params.assigneeId)
    const quote = await getQuoteWorkflowByRef(params.ref)
    if (!assignee || !quote) return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
    const zones = getAssigneeServiceZones(config, params.assigneeId)
    const allowed = quote.inputs.city === assignee.city && (zones.length === 0 || locationMatchesServiceZones(quote.inputs, quote.inputs.city, zones))
    if (!allowed) return NextResponse.json({ success: false, error: 'This quote is outside your assigned service region.' }, { status: 403 })
    const readiness = getFinalQuoteReadiness(quote.firmQuoteDraft)
    if (!quote.workflowColumnsAvailable || !quote.finalDocument || !readiness.ready) {
      return NextResponse.json({ success: false, error: readiness.errors[0] ?? 'The final document is not ready.' }, { status: 409 })
    }
    const body = await request.json().catch(() => ({})) as { to?: unknown; subject?: unknown; message?: unknown }
    const recipient = resolveFinalQuoteRecipient(quote.finalDocument.inputs.email, body.to)
    if (!recipient.matches) {
      return NextResponse.json({ success: false, error: 'The recipient must match the reviewed final document.' }, { status: 400 })
    }
    const to = recipient.authoritative
    const subject = typeof body.subject === 'string' ? body.subject.trim() : undefined
    const message = typeof body.message === 'string' ? body.message.trim() : undefined
    if (to.length > 254 || !EMAIL_PATTERN.test(to)) return NextResponse.json({ success: false, error: 'Enter a valid customer email address.' }, { status: 400 })
    if (subject && subject.length > 180) return NextResponse.json({ success: false, error: 'The email subject is too long.' }, { status: 400 })
    if (message && message.length > 4000) return NextResponse.json({ success: false, error: 'The email message is too long.' }, { status: 400 })

    const sessionIdentity = getAdminSessionIdentityFromRequest(request)
    const staffAccount = sessionIdentity ? await getStaffAccountById(sessionIdentity.id) : null
    const actor = staffAccount?.active && staffAccount.role === 'agent' && staffAccount.availability_assignee_id === assignee.id
      ? { kind: 'staff_account' as const, id: staffAccount.id, name: staffAccount.display_name || staffAccount.username }
      : { kind: 'agent_session' as const, id: assignee.id, name: assignee.name }
    attemptId = randomUUID()
    if (!(await createFinalQuoteSendAttempt(params.ref, attemptId, actor, to, quote.finalDocument.version))) {
      return NextResponse.json({ success: false, error: 'This final quote already has a sent or unresolved delivery attempt.' }, { status: 409 })
    }
    const finalQuote = await getPublicQuoteWorkflowByRef(params.ref, 'final')
    if (!finalQuote) throw new Error('Final document unavailable after send claim.')
    providerCallStarted = true
    const providerResult = await sendUpdatedQuoteEmail(finalQuote.quoteRef, finalQuote.inputs, finalQuote.displayPrice, { to, subject, message })
    providerAccepted = true
    await recordFinalQuoteProviderAccepted(attemptId, typeof providerResult?.id === 'string' ? providerResult.id : null)
    const completed = await completeFinalQuoteSend(params.ref, attemptId, quote.finalDocument.version)
    attemptId = null
    return NextResponse.json({ success: true, status: 'sent', sentAt: completed.sentAt, recipient: to, documentVariant: 'final' })
  } catch (error) {
    const disposition = getSendFailureDisposition(providerCallStarted, providerAccepted, error instanceof EmailProviderRejectedError)
    if (attemptId && disposition.markFailed && disposition.failureStage) await recordFinalQuoteSendFailure(attemptId, disposition.failureStage)
    console.error('[api/availability-agent/quote-send] Failed to send final quote:', error)
    return NextResponse.json({
      success: false,
      error: disposition.error,
      reconciliationRequired: disposition.reconciliationRequired,
      providerAccepted: disposition.providerAccepted,
    }, { status: disposition.status })
  }
}
