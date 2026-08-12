import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getCanonicalSiteUrl, LEGACY_SITE_HOSTS } from '@/lib/siteUrl'

export function middleware(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.next()
  }

  const host = request.headers.get('host')?.toLowerCase()
  if (!host || !LEGACY_SITE_HOSTS.has(host)) {
    return NextResponse.next()
  }

  const canonicalUrl = getCanonicalSiteUrl()
  if (host === canonicalUrl.host) {
    return NextResponse.next()
  }

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.protocol = canonicalUrl.protocol
  redirectUrl.host = canonicalUrl.host

  return NextResponse.redirect(redirectUrl, 308)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
