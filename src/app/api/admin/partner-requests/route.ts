import { NextRequest } from 'next/server'
import { partnerRequestReviewHttp } from '@/lib/partnerAppointmentReviewHttp'
export const maxDuration=60
export const GET=(request:NextRequest)=>partnerRequestReviewHttp(request)
export const PATCH=GET
