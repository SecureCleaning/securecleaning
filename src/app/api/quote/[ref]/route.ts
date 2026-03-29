import { NextResponse } from 'next/server'
import { getQuoteByRef } from '@/lib/quoteData'

export async function GET(
  _request: Request,
  { params }: { params: { ref: string } }
) {
  const quoteRef = params.ref?.trim()

  if (!quoteRef) {
    return NextResponse.json({ success: false, error: 'Quote reference is required.' }, { status: 400 })
  }

  const quote = await getQuoteByRef(quoteRef)

  if (!quote) {
    return NextResponse.json({ success: false, error: 'Quote not found.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, quote })
}
