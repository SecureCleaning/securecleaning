import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'
import { isBookingStatus } from '@/lib/bookingStatus'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { ref: string } }
) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const updates = body?.updates

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid updates payload.' }, { status: 400 })
    }

    if (typeof updates.status !== 'string' || !isBookingStatus(updates.status)) {
      return NextResponse.json({ success: false, error: 'Select a valid booking status.' }, { status: 400 })
    }

    const db = getAdminSupabase()

    const { data, error } = await db
      .from('bookings')
      .update({
        inputs: updates.inputs,
        first_clean_date: updates.first_clean_date,
        status: updates.status,
      })
      .eq('booking_ref', params.ref)
      .select(
        'id, booking_ref, status, first_clean_date, created_at, inputs, site_id, assigned_operator_id, inspection_status, inspection_scheduled_for, inspection_completed_at, dispatch_notes'
      )
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ success: false, error: 'Booking not found.' }, { status: 404 })
    }

    await writeAuditLog('booking', params.ref, 'booking_updated', {
      first_clean_date: updates.first_clean_date,
      status: updates.status,
      inputs: updates.inputs,
    })

    return NextResponse.json({ success: true, booking: data })
  } catch (error) {
    console.error('[api/admin/bookings/[ref]] Failed to update booking:', error)
    return NextResponse.json({ success: false, error: 'Failed to update booking.' }, { status: 500 })
  }
}
