import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectLargePayload } from '@/lib/abuseProtection'
import { unsubscribeCleanerBroadcast } from '@/lib/contractProducts'

export async function POST(request: NextRequest) {
  const blocked = rejectLargePayload(request, 2 * 1024)
    ?? rateLimit(request, { key: 'cleaner-broadcast-unsubscribe', limit: 20, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked

  try {
    const contentType = request.headers.get('content-type') ?? ''
    let token = request.nextUrl.searchParams.get('token') ?? ''
    if (!token && contentType.includes('application/json')) {
      const body = await request.json()
      token = typeof body?.token === 'string' ? body.token : ''
    }
    const updated = await unsubscribeCleanerBroadcast(token)
    if (!updated) return NextResponse.json({ success: false, error: 'This unsubscribe link is not valid.' }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[api/cleaner-email-preferences/unsubscribe] Failed:', error)
    return NextResponse.json({ success: false, error: 'Unable to update cleaner email preferences.' }, { status: 500 })
  }
}
