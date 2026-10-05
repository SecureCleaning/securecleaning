import { NextRequest, NextResponse } from 'next/server'
import { getPublicQuoteDocumentByRef } from '@/lib/quoteWorkflowData'
import { rateLimit } from '@/lib/abuseProtection'
import { isQuoteReference } from '@/lib/quoteReference'

export async function GET(request: NextRequest, props: { params: Promise<{ ref: string }> }) {
  const params = await props.params
  const blocked = await rateLimit(request, { key: 'quote-lookup:hour', limit: 30, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  const quoteRef = params.ref?.trim()

  if (!isQuoteReference(quoteRef)) {
    return NextResponse.json({ success: false, error: 'Quote reference is required.' }, { status: 400 })
  }

  const variant = request.nextUrl.searchParams.get('variant') === 'final' ? 'final' : 'remote_review'
  const quote = await getPublicQuoteDocumentByRef(quoteRef, variant, request.nextUrl.searchParams.get('access') ?? undefined)

  if (!quote) {
    return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, quote }, { headers: { 'Cache-Control': 'private, no-store' } })
}
