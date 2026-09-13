import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { CLEANER_PORTAL_COOKIE, createCleanerPortalToken, verifyCleanerPortalToken } from '@/lib/cleanerPortalAccess'
import { saveCleanerPortalProfile } from '@/lib/cleanerPortal'

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 32 * 1024) ?? rateLimit(request, { key: 'cleaner-portal-profile', limit: 20, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked
  const claims = verifyCleanerPortalToken(request.cookies.get(CLEANER_PORTAL_COOKIE)?.value)
  if (!claims) return NextResponse.json({ success: false, error: 'Your access link is invalid or has expired.' }, { status: 401 })

  try {
    const result = await saveCleanerPortalProfile(claims, await request.json())
    const response = NextResponse.json({ success: true, created: result.created, profile: result.profile })
    if (result.created) {
      const token = createCleanerPortalToken({ mode: 'update', email: claims.email, cleanerId: result.cleanerId })
      response.cookies.set(CLEANER_PORTAL_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 48 * 60 * 60 })
    }
    return response
  } catch (error) {
    console.error('[api/cleaner-portal/profile] Save failed:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to save your details.' }, { status: 400 })
  }
}
