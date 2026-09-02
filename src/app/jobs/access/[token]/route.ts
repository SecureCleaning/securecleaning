import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/abuseProtection'
import {
  CLEANER_JOBS_SESSION_COOKIE,
  CLEANER_JOBS_SESSION_MAX_AGE_SECONDS,
  createCleanerJobsSessionToken,
  verifyCleanerJobsAccessToken,
} from '@/lib/cleanerJobsAccess'
import { normalizeContractProductState } from '@/lib/contractProductPolicy'
import { getJobsAccessLink } from '@/lib/contractProducts'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(request, { key: 'cleaner-jobs-access', limit: 60, windowMs: 60 * 60 * 1000 })
  if (limited) return limited
  const accessLinkId = verifyCleanerJobsAccessToken(params.token)
  const accessLink = accessLinkId ? await getJobsAccessLink(accessLinkId) : null
  if (!accessLink) {
    return new NextResponse('This available-jobs link is not valid.', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  }
  const state = accessLink.state ?? normalizeContractProductState(request.nextUrl.searchParams.get('state'))
  const destination = new URL('/jobs', request.url)
  if (state) destination.searchParams.set('state', state)
  const response = NextResponse.redirect(destination)
  response.cookies.set({
    name: CLEANER_JOBS_SESSION_COOKIE,
    value: createCleanerJobsSessionToken(accessLink.id),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // The interest endpoint lives under /api, so this short-lived session must
    // be available to both the token-free jobs pages and that endpoint.
    path: '/',
    maxAge: CLEANER_JOBS_SESSION_MAX_AGE_SECONDS,
  })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return response
}
