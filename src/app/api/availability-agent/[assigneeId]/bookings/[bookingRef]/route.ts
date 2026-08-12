import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'

const INSPECTION_DURATION_MINUTES = 10
const TRAVEL_RESERVATION_MINUTES = 50

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function endTimeFor(startTime: string) {
  const [hours, minutes] = startTime.split(':').map(Number)
  const total = hours * 60 + minutes + INSPECTION_DURATION_MINUTES
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function isAuthorized(request: NextRequest, assigneeId: string) {
  return isAuthorizedAdminRequest(request) || await isAuthorizedAvailabilityAgentRequest(request, assigneeId)
}

async function getAssignedBooking(assigneeId: string, bookingRef: string) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('bookings')
    .select('booking_ref, status, inspection_status, inspection_scheduled_for, inputs')
    .eq('booking_ref', bookingRef)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const inputs = data.inputs && typeof data.inputs === 'object' ? data.inputs as Record<string, unknown> : {}
  return inputs.preferredInspectionAssigneeId === assigneeId ? { ...data, inputs } : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { assigneeId: string; bookingRef: string } },
) {
  if (!await isAuthorized(request, params.assigneeId)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, params.assigneeId)
    if (!assignee) return NextResponse.json({ success: false, error: 'Agent not found.' }, { status: 404 })

    const booking = await getAssignedBooking(params.assigneeId, params.bookingRef)
    if (!booking) return NextResponse.json({ success: false, error: 'Assigned booking not found.' }, { status: 404 })
    if (booking.status === 'cancelled' || booking.inspection_status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'Cancelled appointments cannot be moved.' }, { status: 409 })
    }

    const body = await request.json()
    const preferredStartDate = body?.preferredStartDate
    const preferredInspectionStartTime = body?.preferredInspectionStartTime
    if (!isValidDate(preferredStartDate) || !isValidTime(preferredInspectionStartTime)) {
      return NextResponse.json({ success: false, error: 'Choose a valid inspection date and start time.' }, { status: 400 })
    }

    const preferredInspectionEndTime = endTimeFor(preferredInspectionStartTime)
    const scheduledFor = getDateTimeInTimeZone(preferredStartDate, preferredInspectionStartTime, getCityTimeZone(assignee.city))
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: 'Inspection appointments must be scheduled in the future.' }, { status: 400 })
    }

    const db = getAdminSupabase()
    const { data: reservations, error: reservationError } = await db
      .from('bookings')
      .select('booking_ref, status, inspection_status, inspection_scheduled_for, inputs')
      .not('inspection_scheduled_for', 'is', null)
      .neq('booking_ref', params.bookingRef)
      .limit(1000)
    if (reservationError) throw reservationError

    const proposedStart = scheduledFor.getTime()
    const conflicts = (reservations ?? []).some((row) => {
      if (row.status === 'cancelled' || row.inspection_status === 'cancelled') return false
      const rowInputs = row.inputs && typeof row.inputs === 'object' ? row.inputs as Record<string, unknown> : {}
      if (rowInputs.preferredInspectionAssigneeId !== params.assigneeId) return false
      const otherStart = new Date(String(row.inspection_scheduled_for ?? '')).getTime()
      return Number.isFinite(otherStart) && Math.abs(otherStart - proposedStart) < (INSPECTION_DURATION_MINUTES + TRAVEL_RESERVATION_MINUTES) * 60 * 1000
    })
    if (conflicts) {
      return NextResponse.json({ success: false, error: 'That time is already protected for another appointment or travel. Choose another hourly start.' }, { status: 409 })
    }

    const nextInputs = {
      ...booking.inputs,
      preferredStartDate,
      preferredInspectionStartTime,
      preferredInspectionEndTime,
      preferredInspectionDay: new Intl.DateTimeFormat('en-AU', { timeZone: getCityTimeZone(assignee.city), weekday: 'long' }).format(scheduledFor).toLowerCase(),
      preferredInspectionSlotLabel: `${new Intl.DateTimeFormat('en-AU', { timeZone: getCityTimeZone(assignee.city), weekday: 'long' }).format(scheduledFor)} ${preferredInspectionStartTime}`,
      preferredInspectionAssigneeId: params.assigneeId,
      preferredInspectionAssigneeName: assignee.name,
    }
    const { data, error } = await db
      .from('bookings')
      .update({ inputs: nextInputs, inspection_status: 'scheduled', inspection_scheduled_for: scheduledFor.toISOString() })
      .eq('booking_ref', params.bookingRef)
      .select('booking_ref, status, inspection_status, inspection_scheduled_for, inputs')
      .single()
    if (error) throw error

    await writeAuditLog('booking', params.bookingRef, 'agent_booking_rescheduled', {
      assignee_id: params.assigneeId,
      inspection_scheduled_for: scheduledFor.toISOString(),
    })
    return NextResponse.json({ success: true, booking: data })
  } catch (error) {
    console.error('[api/availability-agent/bookings] Failed to reschedule booking:', error)
    return NextResponse.json({ success: false, error: 'Failed to update inspection appointment.' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { assigneeId: string; bookingRef: string } },
) {
  if (!await isAuthorized(request, params.assigneeId)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const booking = await getAssignedBooking(params.assigneeId, params.bookingRef)
    if (!booking) return NextResponse.json({ success: false, error: 'Assigned booking not found.' }, { status: 404 })
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('bookings')
      .update({ status: 'cancelled', inspection_status: 'cancelled' })
      .eq('booking_ref', params.bookingRef)
      .select('booking_ref, status, inspection_status')
      .single()
    if (error) throw error

    await writeAuditLog('booking', params.bookingRef, 'agent_booking_cancelled', { assignee_id: params.assigneeId })
    return NextResponse.json({ success: true, booking: data })
  } catch (error) {
    console.error('[api/availability-agent/bookings] Failed to cancel booking:', error)
    return NextResponse.json({ success: false, error: 'Failed to cancel inspection appointment.' }, { status: 500 })
  }
}
