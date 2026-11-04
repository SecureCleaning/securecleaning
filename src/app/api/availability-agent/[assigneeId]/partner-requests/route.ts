import { NextRequest } from 'next/server'
import { partnerRequestReviewHttp } from '@/lib/partnerAppointmentReviewHttp'
export const maxDuration=60
export async function GET(request:NextRequest,{params}:{params:Promise<{assigneeId:string}>}) {
 return partnerRequestReviewHttp(request,(await params).assigneeId)
}
export const PATCH=GET
