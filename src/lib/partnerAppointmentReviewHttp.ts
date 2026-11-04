import { NextRequest } from 'next/server'
import { getAdminSessionIdentityFromRequest, isAuthorizedAdminRequest } from './adminAuth'
import { isAuthorizedAvailabilityAgentRequest } from './availabilityAgentAuth'
import { rejectCrossOriginMutation, rejectLargePayload, rateLimitValue } from './abuseProtection'
import { PartnerError } from './partnerBookingPolicy'
import { partnerFailure, partnerJson } from './partnerBookingHttp'
import { listPartnerAppointmentRequests, reviewPartnerAppointmentRequest } from './partnerAppointmentReview'

export async function partnerRequestReviewHttp(request:NextRequest,assigneeId?:string) {
  try {
    const admin=await isAuthorizedAdminRequest(request,'staff')
    if(!admin && (!assigneeId || !await isAuthorizedAvailabilityAgentRequest(request,assigneeId))) throw new PartnerError('Unauthorized',401)
    const identity=await getAdminSessionIdentityFromRequest(request)
    const actor={id:identity?.id || `agent:${assigneeId}`,assigneeId}
    if(request.method==='GET') return partnerJson(await listPartnerAppointmentRequests(actor))
    const blocked=rejectCrossOriginMutation(request) ?? await rejectLargePayload(request,4000)
    if(blocked) return blocked
    const limited=await rateLimitValue(actor.id,{key:'partner:review',limit:20,windowMs:60000}); if(limited) return limited
    return partnerJson(await reviewPartnerAppointmentRequest(actor,await request.json()))
  } catch(error) { return partnerFailure(error) }
}
