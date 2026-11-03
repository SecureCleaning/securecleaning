import { NextResponse } from 'next/server'
import { PartnerError } from './partnerBookingPolicy'
export function partnerJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } }) }
export function partnerFailure(error: unknown) {
  if (error instanceof PartnerError) return partnerJson({ error: error.message }, error.status)
  console.error('[partner-booking] Request failed', error instanceof Error ? error.name : 'Service error')
  return partnerJson({ error: 'Unable to complete this request. Please try again or contact Secure Cleaning.' }, 503)
}
