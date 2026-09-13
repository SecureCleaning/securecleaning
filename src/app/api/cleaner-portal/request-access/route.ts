import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitValue, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { sendCleanerPortalLink } from '@/lib/cleanerPortal'

const genericMessage = 'If that email matches a cleaner record, a private access link has been sent.'

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024) ?? rateLimit(request, { key: 'cleaner-portal-access', limit: 10, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const throttled = rateLimitValue(email, { key: 'cleaner-portal-email', limit: 3, windowMs: 60 * 60 * 1000 })
    if (throttled) return throttled
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) await sendCleanerPortalLink(email, 'update')
  } catch (error) {
    console.error('[api/cleaner-portal/request-access] Request failed:', error instanceof Error ? error.message : 'unknown')
  }
  return NextResponse.json({ success: true, message: genericMessage }, { status: 202 })
}
