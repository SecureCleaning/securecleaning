import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/abuseProtection'
import { verifyQuoteBookingHandoffToken } from '@/lib/quoteBookingAccess'
import { buildBookingPrefillFromQuoteInputs } from '@/lib/quoteBookingPrefill'
import { getQuoteByRef } from '@/lib/quoteData'

export async function GET(request: NextRequest, { params }: { params: { ref: string } }) {
  const blocked = rateLimit(request, { key: 'quote-booking-prefill:hour', limit: 20, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const quoteRef = params.ref?.trim()
  const handoff = request.nextUrl.searchParams.get('handoff')
  if (!quoteRef || !/^SC-\d{8}-[A-Z0-9]{4}$/.test(quoteRef) || !verifyQuoteBookingHandoffToken(quoteRef, handoff)) {
    return NextResponse.json({ success: false, error: 'Quote booking details are unavailable.' }, { status: 404 })
  }

  const quote = await getQuoteByRef(quoteRef)
  if (!quote) {
    return NextResponse.json({ success: false, error: 'Quote booking details are unavailable.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, prefill: buildBookingPrefillFromQuoteInputs(quoteRef, quote.inputs) })
}
