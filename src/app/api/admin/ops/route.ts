import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import {
  resendBookingEmailByRef,
  resendQuoteEmailByRef,
  updateBookingStatus,
  updateQuoteStatus,
} from '@/lib/adminOperations'
import { assignBookingOperator, assignBookingSite } from '@/lib/bookingOps'
import { updateInspectionWorkflow } from '@/lib/dispatchOps'
import { updateLeadFollowUp, updateQuoteFollowUp } from '@/lib/crmOps'

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const action = typeof body?.action === 'string' ? body.action : ''

    switch (action) {
      case 'quote.status': {
        const quoteRef = typeof body?.quoteRef === 'string' ? body.quoteRef : ''
        const status = typeof body?.status === 'string' ? body.status : ''
        const result = await updateQuoteStatus(quoteRef, status)
        return NextResponse.json({ success: true, result })
      }

      case 'booking.status': {
        const bookingRef = typeof body?.bookingRef === 'string' ? body.bookingRef : ''
        const status = typeof body?.status === 'string' ? body.status : ''
        const result = await updateBookingStatus(bookingRef, status)
        return NextResponse.json({ success: true, result })
      }

      case 'quote.resend': {
        const quoteRef = typeof body?.quoteRef === 'string' ? body.quoteRef : ''
        const result = await resendQuoteEmailByRef(quoteRef)
        return NextResponse.json({ success: true, result })
      }

      case 'booking.resend': {
        const bookingRef = typeof body?.bookingRef === 'string' ? body.bookingRef : ''
        const result = await resendBookingEmailByRef(bookingRef)
        return NextResponse.json({ success: true, result })
      }

      case 'booking.assignSite': {
        const bookingRef = typeof body?.bookingRef === 'string' ? body.bookingRef : ''
        const siteId = typeof body?.siteId === 'string' && body.siteId.length > 0 ? body.siteId : null
        const result = await assignBookingSite(bookingRef, siteId)
        return NextResponse.json({ success: true, result })
      }

      case 'booking.assignOperator': {
        const bookingRef = typeof body?.bookingRef === 'string' ? body.bookingRef : ''
        const operatorId = typeof body?.operatorId === 'string' && body.operatorId.length > 0 ? body.operatorId : null
        const result = await assignBookingOperator(bookingRef, operatorId)
        return NextResponse.json({ success: true, result })
      }

      case 'booking.inspectionWorkflow': {
        const bookingRef = typeof body?.bookingRef === 'string' ? body.bookingRef : ''
        const result = await updateInspectionWorkflow(bookingRef, {
          inspectionStatus: typeof body?.inspectionStatus === 'string' ? body.inspectionStatus : undefined,
          inspectionScheduledFor: typeof body?.inspectionScheduledFor === 'string' ? body.inspectionScheduledFor : null,
          inspectionCompletedAt: typeof body?.inspectionCompletedAt === 'string' ? body.inspectionCompletedAt : null,
          dispatchNotes: typeof body?.dispatchNotes === 'string' ? body.dispatchNotes : null,
        })
        return NextResponse.json({ success: true, result })
      }

      case 'quote.followUp': {
        const quoteRef = typeof body?.quoteRef === 'string' ? body.quoteRef : ''
        const status = typeof body?.status === 'string' ? body.status : 'new'
        const notes = typeof body?.notes === 'string' ? body.notes : ''
        const result = await updateQuoteFollowUp(quoteRef, status, notes)
        return NextResponse.json({ success: true, result })
      }

      case 'lead.followUp': {
        const leadId = typeof body?.leadId === 'string' ? body.leadId : ''
        const status = typeof body?.status === 'string' ? body.status : 'new'
        const notes = typeof body?.notes === 'string' ? body.notes : ''
        const result = await updateLeadFollowUp(leadId, status, notes)
        return NextResponse.json({ success: true, result })
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown admin action.' }, { status: 400 })
    }
  } catch (error) {
    console.error('[api/admin/ops] Failed operation:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Operation failed.' },
      { status: 500 }
    )
  }
}
