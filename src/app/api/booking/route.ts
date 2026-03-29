import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase'
import { sendBookingConfirmationEmail } from '@/lib/email'
import { createBookingFollowUpEvent } from '@/lib/googleCalendar'
import type { BookingInputs } from '@/lib/types'
import { createSiteFromBooking, findMatchingSiteForBooking } from '@/lib/siteMatching'
import { createAdminNotification } from '@/lib/adminNotifications'

function generateBookingRef(): string {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BK-${ymd}-${rand}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const inputs = body as BookingInputs

    // ── Validate required fields ──────────────────────────────────────────
    const required: (keyof BookingInputs)[] = [
      'businessName',
      'contactName',
      'email',
      'phone',
      'address',
      'city',
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

    if (!['melbourne', 'sydney'].includes(inputs.city)) {
      return NextResponse.json(
        { success: false, error: 'City must be melbourne or sydney.' },
        { status: 400 }
      )
    }

    // ── Resolve client ────────────────────────────────────────────────────
    const db = getAdminSupabase()

    const { data: clientData, error: clientError } = await db
      .from('clients')
      .upsert(
        {
          business_name: inputs.businessName,
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
    let matchedSite = await findMatchingSiteForBooking(inputs, clientData.id)
    if (!matchedSite) {
      try {
        matchedSite = await createSiteFromBooking(inputs, clientData.id)
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
      inputs: inputs,
      status: 'pending',
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
      business_name: inputs.businessName,
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
      await sendBookingConfirmationEmail(bookingRef, inputs)
    } catch (err) {
      console.error('[booking] Email send failed:', err)
    }

    // ── Create Google Calendar follow-up event (non-blocking) ─────────────
    createBookingFollowUpEvent(bookingRef, inputs)
      .then((result) => {
        if (!result.created && result.reason) {
          console.warn('[booking] Calendar event not created:', result.reason)
        }
      })
      .catch((err) => {
        console.error('[booking] Calendar event failed:', err)
      })

    await createAdminNotification(
      'new_booking',
      `New booking ${bookingRef}`,
      `${inputs.businessName} in ${inputs.city} submitted a booking request.`
    )

    return NextResponse.json({
      success: true,
      bookingRef,
    })
  } catch (error) {
    console.error('[api/booking] Unhandled error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
