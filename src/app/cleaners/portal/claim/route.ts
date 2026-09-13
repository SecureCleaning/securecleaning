import { NextRequest, NextResponse } from 'next/server'
import { CLEANER_PORTAL_COOKIE, verifyCleanerPortalToken } from '@/lib/cleanerPortalAccess'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const claims = verifyCleanerPortalToken(token)
  if (!claims || !token) return NextResponse.redirect(new URL('/cleaners?error=invalid-link', request.url))

  const response = NextResponse.redirect(new URL('/cleaners/portal', request.url))
  response.cookies.set(CLEANER_PORTAL_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    maxAge: Math.max(1, claims.exp - Math.floor(Date.now() / 1000)),
  })
  return response
}
