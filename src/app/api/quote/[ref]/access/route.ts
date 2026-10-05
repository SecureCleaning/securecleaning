import { NextRequest, NextResponse } from 'next/server'
import { canStaffAccessQuote } from '@/lib/quoteStaffAccess'
import { createQuoteCapability } from '@/lib/quoteBookingAccess'
import { getQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { isQuoteReference } from '@/lib/quoteReference'

export async function POST(request: NextRequest, props: { params: Promise<{ ref: string }> }) {
  const params = await props.params
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 1024)
    ?? (await rateLimit(request, { key: 'quote-share:hour', limit: 30, windowMs: 3600000 }))
  if (blocked) return blocked
  if (!isQuoteReference(params.ref) || !await canStaffAccessQuote(params.ref, true))
    return NextResponse.json({ success: false, error: 'Quote unavailable.' }, { status: 404 })
  try {
    const body = await request.json()
    const variant = body.variant === 'final' ? 'final' : 'remote_review'
    const quote = await getQuoteWorkflowByRef(params.ref)
    if (!quote || (variant === 'final' && (!quote.sentAt || !quote.reviewedAt || Date.parse(quote.sentAt) < Date.parse(quote.reviewedAt))))
      return NextResponse.json({ success: false, error: 'Send the reviewed quote before sharing this link.' }, { status: 409 })
    const token = await createQuoteCapability(params.ref, 'document', variant)
    return NextResponse.json({ success: true, token }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to create the link.' }, { status: 503 })
  }
}
