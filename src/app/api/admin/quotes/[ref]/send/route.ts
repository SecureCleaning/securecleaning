import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { EmailProviderRejectedError, sendUpdatedQuoteEmail } from '@/lib/email'
import {
  completeFinalQuoteSend, createFinalQuoteSendAttempt,
  getPublicQuoteWorkflowByRef, getQuoteWorkflowByRef, recordFinalQuoteProviderAccepted, recordFinalQuoteSendFailure,
} from '@/lib/quoteWorkflowData'
import { getFinalQuoteReadiness } from '@/lib/quoteWorkflow'
import { getSendFailureDisposition, resolveFinalQuoteRecipient } from '@/lib/finalQuoteSendPolicy'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  let attemptId: string | null = null
  let providerAccepted = false
  let providerCallStarted = false
  try {
    const quote = await getQuoteWorkflowByRef(params.ref)
    if (!quote) return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
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

    attemptId = randomUUID()
    const attempt = await createFinalQuoteSendAttempt(params.ref, attemptId, {
      kind: 'staff_account', id: identity.id, name: identity.username,
    }, to, quote.finalDocument.version)
    if (!attempt) {
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
    console.error('[api/admin/quotes/[ref]/send] Failed to send final quote:', error)
    return NextResponse.json({
      success: false,
      error: disposition.error,
      reconciliationRequired: disposition.reconciliationRequired,
      providerAccepted: disposition.providerAccepted,
    }, { status: disposition.status })
  }
}
