import { NextRequest, NextResponse } from 'next/server'
import { getPublicQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'
import { rateLimit } from '@/lib/abuseProtection'

export async function GET(
  request: NextRequest,
  { params }: { params: { ref: string } }
) {
  const blocked = rateLimit(request, { key: 'quote-lookup:hour', limit: 30, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const quoteRef = params.ref?.trim()

  if (!quoteRef || !/^SC-\d{8}-[A-Z0-9]{4}$/.test(quoteRef)) {
    return NextResponse.json({ success: false, error: 'Quote reference is required.' }, { status: 400 })
  }

  const quote = await getPublicQuoteWorkflowByRef(quoteRef)

  if (!quote) {
    return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, quote })
}
