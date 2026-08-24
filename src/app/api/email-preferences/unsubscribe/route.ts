import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectLargePayload } from '@/lib/abuseProtection'
import { unsubscribeCrmContact } from '@/lib/clientCrmEmail'

export async function POST(request: NextRequest) {
  const blocked = rejectLargePayload(request, 2 * 1024)
    ?? rateLimit(request, { key: 'crm-unsubscribe', limit: 20, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  try {
    const contentType = request.headers.get('content-type') ?? ''
    let token = request.nextUrl.searchParams.get('token') ?? ''
    if (!token && contentType.includes('application/json')) {
      const body = await request.json()
      token = typeof body?.token === 'string' ? body.token : ''
    }
    const updated = await unsubscribeCrmContact(token)
    if (!updated) return NextResponse.json({ success: false, error: 'This unsubscribe link is not valid.' }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/email-preferences/unsubscribe] Failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to update email preferences.' }, { status: 500 })
  }
}
