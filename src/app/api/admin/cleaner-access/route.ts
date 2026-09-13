import { NextRequest, NextResponse } from 'next/server'
import { authorizeCleanerAdminRequest } from '@/lib/cleanerAdminAuth'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { sendCleanerPortalLink } from '@/lib/cleanerPortal'

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 4 * 1024)
  if (blocked) return blocked
  const authorization = authorizeCleanerAdminRequest(request, 'mutate')
  if (!authorization.identity) return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status })
  const throttled = rateLimit(request, { key: `admin-cleaner-access:${authorization.identity.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (throttled) return throttled
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const mode = body?.mode === 'onboarding' ? 'onboarding' : body?.mode === 'update' ? 'update' : null
    if (!mode) throw new Error('Select an invitation type.')
    const sent = await sendCleanerPortalLink(email, mode)
    if (!sent) throw new Error('No cleaner record matches that email address.')
    return NextResponse.json({ success: true, message: mode === 'onboarding' ? 'Registration invitation sent.' : 'Cleaner update link sent.' })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to send cleaner access link.' }, { status: 400 })
  }
}
