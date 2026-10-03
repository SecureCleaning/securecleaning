import { CLEANER_PORTAL_COOKIE, verifyCleanerPortalToken } from '@/lib/cleanerPortalAccess'
import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimit } from '@/lib/abuseProtection'
import { CLEANER_JOBS_SESSION_COOKIE, verifyCleanerJobsSessionToken } from '@/lib/cleanerJobsAccess'
import { isActiveJobsAccessLink } from '@/lib/contractProducts'
import { registerContractProductInterest } from '@/lib/contractProductInterest'

const ACCEPTED_MESSAGE = 'Your submission has been received. Verified cleaner interest receives a confirmation email; other enquiries are sent to the responsible agent for verification.'

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 8 * 1024)
    ?? await rateLimit(request, { key: 'contract-product-interest', limit: 10, windowMs: 60 * 60 * 1000 })
  if (blocked) return blocked
  const accessLinkId = verifyCleanerJobsSessionToken(request.cookies.get(CLEANER_JOBS_SESSION_COOKIE)?.value)
  if (!accessLinkId || !(await isActiveJobsAccessLink(accessLinkId))) {
    return NextResponse.json({ success: false, error: 'Available-jobs access required.' }, { status: 403 })
  }
  try {
    const body = await request.json()
    await registerContractProductInterest({
      identity: verifyCleanerPortalToken(request.cookies.get(CLEANER_PORTAL_COOKIE)?.value),
      productCode: typeof body?.productCode === 'string' ? body.productCode : '',
      accessLinkId,
      email: typeof body?.email === 'string' ? body.email : '',
      note: typeof body?.note === 'string' ? body.note : '',
    })
    return NextResponse.json({ success: true, message: ACCEPTED_MESSAGE }, { status: 202 })
  } catch (error) {
    console.error('[api/jobs/interest] Failed:', error)
    return NextResponse.json({ success: false, error: 'Your interest could not be recorded. Please try again.' }, { status: 503 })
  }
}
