import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase'
import { sendBookingConfirmationEmail } from '@/lib/email'
import { createBookingFollowUpEvent } from '@/lib/googleCalendar'
import { getAvailabilityAssignee, getAvailabilityCalendar, getAvailabilityConfig } from '@/lib/availability'
import { getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import type { BookingInputs } from '@/lib/types'
import { createSiteFromBooking, findMatchingSiteForBooking } from '@/lib/siteMatching'
import { verifyAddressCoordinates } from '@/lib/addressGeocoding'
import {
  limitString,
  rateLimit,
  rateLimitValue,
  rejectCrossOriginMutation,
  rejectLargePayload,
  validatePublicSubmission,
} from '@/lib/abuseProtection'

function generateBookingRef(): string {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BK-${ymd}-${rand}`
}

export async function POST(request: NextRequest) {
  try {
    const blocked =
      rejectCrossOriginMutation(request) ??
      rejectLargePayload(request, 64 * 1024) ??
      rateLimit(request, { key: 'booking:minute', limit: 2, windowMs: 60 * 1000 }) ??
      rateLimit(request, { key: 'booking:hour', limit: 4, windowMs: 60 * 60 * 1000 }) ??
      rateLimit(request, { key: 'booking:day', limit: 12, windowMs: 24 * 60 * 60 * 1000 })

    if (blocked) return blocked

    const body = await request.json()
    const bodyRecord = body as Record<string, unknown>
    const invalidSubmission = validatePublicSubmission(bodyRecord, {
      requireAcceptableUse: true,
      minElapsedMs: 3000,
    })
    if (invalidSubmission) return invalidSubmission

    if (
      limitString(bodyRecord.businessName, 120) ||
      limitString(bodyRecord.contactName, 120) ||
      limitString(bodyRecord.email, 254) ||
      limitString(bodyRecord.phone, 40) ||
      limitString(bodyRecord.address, 180) ||
      limitString(bodyRecord.suburb, 80) ||
      limitString(bodyRecord.postcode, 12) ||
      limitString(bodyRecord.notes, 1500)
    ) {
      return NextResponse.json({ success: false, error: 'One or more fields are too long.' }, { status: 400 })
    }

    const rawInputs = body as BookingInputs
    const { latitude: _browserLatitude, longitude: _browserLongitude, ...inputs } = rawInputs
    const businessLabel = inputs.businessName?.trim() || `${inputs.contactName?.trim() || 'Customer'} enquiry`
    const identityLimit =
      rateLimitValue(inputs.email, { key: 'booking:email:day', limit: 3, windowMs: 24 * 60 * 60 * 1000 }) ??
      rateLimitValue(inputs.phone, { key: 'booking:phone:day', limit: 3, windowMs: 24 * 60 * 60 * 1000 }) ??
      rateLimitValue(inputs.businessName, { key: 'booking:business:day', limit: 5, windowMs: 24 * 60 * 60 * 1000 })
    if (identityLimit) return identityLimit

    // ── Validate required fields ──────────────────────────────────────────
    const required: (keyof typeof inputs)[] = [
      'contactName',
      'email',
      'phone',
      'address',
      'city',
      'suburb',
      'postcode',
      'premisesType',
      'floorArea',
      'frequency',
      'timePreference',
      'preferredStartDate',
    ]

    const missing = required.filter((field) => !inputs[field])
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    if (inputs.frequency === 'once_off') {
      return NextResponse.json(
        { success: false, error: 'Secure Cleaning Aus provides recurring cleaning services only.' },
        { status: 400 }
      )
    }

    if (!['melbourne', 'sydney'].includes(inputs.city)) {
      return NextResponse.json(
        { success: false, error: 'City must be melbourne or sydney.' },
        { status: 400 }
      )
    }

    if (!/^\d{4}$/.test(inputs.postcode)) {
      return NextResponse.json(
        { success: false, error: 'Postcode must be a valid 4-digit Australian postcode.' },
        { status: 400 }
      )
    }

    // Re-check the selected inspection time immediately before saving.
    // The browser's availability response can become stale while the form is open.
    let bookingInputs: BookingInputs = { ...inputs }
    let inspectionStatus = 'pending'
    let inspectionScheduledFor: string | null = null
    let assignedOperatorId: string | null = null
    if (inputs.preferredInspectionSlotId && inputs.preferredInspectionSlotId !== 'contact_me') {
      const location = { address: inputs.address, suburb: inputs.suburb, postcode: inputs.postcode }
      let availability = await getAvailabilityCalendar(
        location,
        inputs.city,
        inputs.preferredStartDate,
      )
      if (!availability.suggestions.some((suggestion) => suggestion.slotId === inputs.preferredInspectionSlotId)) {
        const verifiedCoordinates = await verifyAddressCoordinates(
          inputs.address,
          inputs.suburb,
          inputs.postcode,
          inputs.city,
        )
        if (verifiedCoordinates) {
          availability = await getAvailabilityCalendar(
            { ...location, ...verifiedCoordinates },
            inputs.city,
            inputs.preferredStartDate,
          )
          bookingInputs = { ...bookingInputs, ...verifiedCoordinates }
        }
      }
      const selectedSuggestion = availability.suggestions.find(
        (suggestion) => suggestion.slotId === inputs.preferredInspectionSlotId,
      )

      if (!selectedSuggestion) {
        return NextResponse.json(
          { success: false, error: 'That inspection time is no longer available. Please choose the next available appointment.' },
          { status: 409 },
        )
      }

      bookingInputs = {
        ...inputs,
        preferredInspectionSlotLabel: selectedSuggestion.label,
        preferredInspectionDay: selectedSuggestion.day,
        preferredInspectionStartTime: selectedSuggestion.startTime,
        preferredInspectionEndTime: selectedSuggestion.endTime,
        preferredInspectionAssigneeId: selectedSuggestion.assigneeId,
        preferredInspectionAssigneeName: selectedSuggestion.assigneeName,
        preferredInspectionCalendarId: selectedSuggestion.calendarId,
      }
      const availabilityConfig = await getAvailabilityConfig()
      assignedOperatorId = getAvailabilityAssignee(availabilityConfig, selectedSuggestion.assigneeId)?.ownerOperatorId || null
      inspectionStatus = 'scheduled'
      inspectionScheduledFor = getDateTimeInTimeZone(
        inputs.preferredStartDate,
        selectedSuggestion.startTime,
        getCityTimeZone(inputs.city),
      ).toISOString()
    }

    // ── Resolve client ────────────────────────────────────────────────────
    const db = getAdminSupabase()

    const { data: clientData, error: clientError } = await db
      .from('clients')
      .upsert(
        {
          business_name: businessLabel,
          contact_name: inputs.contactName,
          email: inputs.email,
          phone: inputs.phone,
          address: inputs.address,
          city: inputs.city,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()

    if (clientError || !clientData?.id) {
      console.error('[booking] Client upsert failed:', clientError)
      return NextResponse.json(
        { success: false, error: 'Failed to save client record.' },
        { status: 500 }
      )
    }

    // ── Resolve quote ID if quoteRef provided ─────────────────────────────
    let quoteId: string | null = null
    if (inputs.quoteRef) {
      const { data: quoteData } = await db
        .from('quotes')
        .select('id')
        .eq('quote_ref', inputs.quoteRef)
        .single()
      quoteId = quoteData?.id ?? null

      // Mark quote as accepted
      if (quoteId) {
        await db.from('quotes').update({ status: 'accepted' }).eq('id', quoteId)
      }
    }

    // ── Match or create site ──────────────────────────────────────────────
    let matchedSite = await findMatchingSiteForBooking(bookingInputs, clientData.id)
    if (!matchedSite) {
      try {
        matchedSite = await createSiteFromBooking(bookingInputs, clientData.id)
      } catch (siteError) {
        console.error('[booking] Site auto-create failed:', siteError)
      }
    }

    // ── Insert booking ────────────────────────────────────────────────────
    const bookingRef = generateBookingRef()

    const { error: bookingError } = await db.from('bookings').insert({
      booking_ref: bookingRef,
      quote_id: quoteId,
      client_id: clientData.id,
      site_id: matchedSite?.id ?? null,
      assigned_operator_id: assignedOperatorId,
      inputs: bookingInputs,
      status: 'pending',
      inspection_status: inspectionStatus,
      inspection_scheduled_for: inspectionScheduledFor,
      first_clean_date: inputs.preferredStartDate,
      recurring_schedule: {
        frequency: inputs.frequency,
        timeStart: inputs.timePreference === 'after_hours' ? '18:00' : '08:00',
      },
    })

    if (bookingError) {
      console.error('[booking] Insert failed:', bookingError)
      return NextResponse.json(
        { success: false, error: 'Failed to save booking.' },
        { status: 500 }
      )
    }

    // ── Create lead record for CRM ────────────────────────────────────────
    const { error: leadInsertError } = await db.from('leads').insert({
      email: inputs.email,
      business_name: businessLabel,
      contact_name: inputs.contactName,
      phone: inputs.phone,
      city: inputs.city,
      source: inputs.quoteRef ? 'quote_flow' : 'direct_booking',
      converted_to_client_id: clientData.id,
    })

    if (leadInsertError) {
      console.error('[booking] Non-critical lead insert failed:', leadInsertError)
    }

    // ── Send confirmation emails ──────────────────────────────────────────
    try {
      await sendBookingConfirmationEmail(bookingRef, bookingInputs)
    } catch (err) {
      console.error('[booking] Email send failed:', err)
    }

    // ── Create Google Calendar follow-up event (non-blocking) ─────────────
    createBookingFollowUpEvent(bookingRef, bookingInputs)
      .then((result) => {
        if (!result.created && result.reason) {
          console.warn('[booking] Calendar event not created:', result.reason)
        }
      })
      .catch((err) => {
        console.error('[booking] Calendar event failed:', err)
      })

    return NextResponse.json({
      success: true,
      bookingRef,
      inputs: bookingInputs,
    })
  } catch (error) {
    console.error('[api/booking] Unhandled error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
