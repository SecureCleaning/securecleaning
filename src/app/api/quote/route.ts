import { NextRequest, NextResponse } from 'next/server'
import { calculateQuote, formatPriceRange, generateQuoteRef } from '@/lib/quoteEngine'
import { getAdminSupabase } from '@/lib/supabase'
import { sendQuoteEmail } from '@/lib/email'
import { getQuotePricingConfig } from '@/lib/pricing'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import {
  applyFirmQuoteDisplayPrice,
  buildFirmQuotePreview,
  createDefaultFirmQuoteDraft,
  getFirmQuoteDisplayPrice,
} from '@/lib/quoteWorkflow'
import { deriveQuoteAddOnCountsFromRoomScope, isBathroomRoomScopeType, mergeRoomScopeIntoAddOns, sanitizePublicRoomScope, summarizePublicRoomScope } from '@/lib/publicRoomScope'
import type { QuoteInputs } from '@/lib/types'
import { createAdminNotification } from '@/lib/adminNotifications'
import {
  limitString,
  rateLimit,
  rateLimitValue,
  rejectCrossOriginMutation,
  rejectLargePayload,
  validatePublicSubmission,
} from '@/lib/abuseProtection'

export async function POST(request: NextRequest) {
  try {
    const blocked =
      rejectCrossOriginMutation(request) ??
      rejectLargePayload(request, 64 * 1024) ??
      rateLimit(request, { key: 'quote:minute', limit: 3, windowMs: 60 * 1000 }) ??
      rateLimit(request, { key: 'quote:hour', limit: 8, windowMs: 60 * 60 * 1000 }) ??
      rateLimit(request, { key: 'quote:day', limit: 20, windowMs: 24 * 60 * 60 * 1000 })

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
      limitString(bodyRecord.suburb, 80) ||
      limitString(bodyRecord.postcode, 12) ||
      limitString(bodyRecord.notes, 1500)
    ) {
      return NextResponse.json({ success: false, error: 'One or more fields are too long.' }, { status: 400 })
    }

    const untrustedInputs = body as QuoteInputs
    const { latitude: _browserLatitude, longitude: _browserLongitude, ...rawInputs } = untrustedInputs
    const identityLimit =
      rateLimitValue(rawInputs.email, { key: 'quote:email:day', limit: 3, windowMs: 24 * 60 * 60 * 1000 }) ??
      rateLimitValue(rawInputs.phone, { key: 'quote:phone:day', limit: 3, windowMs: 24 * 60 * 60 * 1000 }) ??
      rateLimitValue(rawInputs.businessName, { key: 'quote:business:day', limit: 5, windowMs: 24 * 60 * 60 * 1000 })
    if (identityLimit) return identityLimit

    const roomScope = sanitizePublicRoomScope(rawInputs.roomScope ?? [])
    if (roomScope.length > 40) {
      return NextResponse.json({ success: false, error: 'Too many room entries.' }, { status: 400 })
    }

    const derivedCounts = deriveQuoteAddOnCountsFromRoomScope(roomScope)
    const inputs: QuoteInputs = {
      ...rawInputs,
      roomScope,
      meetingRooms: derivedCounts.meetingRooms,
      addOns: mergeRoomScopeIntoAddOns(roomScope, rawInputs.addOns),
    }
    const businessLabel = inputs.businessName?.trim() || `${inputs.contactName?.trim() || 'Customer'} enquiry`

    if (inputs.frequency === 'once_off' || inputs.isSpringClean) {
      return NextResponse.json(
        { success: false, error: 'Secure Cleaning Aus provides recurring cleaning services only.' },
        { status: 400 }
      )
    }

    if (
      !inputs.email ||
      !inputs.city ||
      !inputs.suburb?.trim() ||
      !inputs.postcode?.trim() ||
      !inputs.premisesType ||
      !inputs.floorArea
    ) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    if (!['melbourne', 'sydney'].includes(inputs.city)) {
      return NextResponse.json(
        { success: false, error: 'City must be melbourne or sydney.' },
        { status: 400 }
      )
    }

    if (inputs.floorArea <= 0) {
      return NextResponse.json(
        { success: false, error: 'Floor area must be greater than 0 sqm.' },
        { status: 400 }
      )
    }

    if (!/^\d{4}$/.test(inputs.postcode)) {
      return NextResponse.json(
        { success: false, error: 'Postcode must be a valid 4-digit Australian postcode.' },
        { status: 400 }
      )
    }

    const pricingConfig = await getQuotePricingConfig()
    const result = calculateQuote(inputs, pricingConfig)
    const roomTypeConfig = await getQuoteRoomTypeConfig()
    const initialFirmQuoteDraft = createDefaultFirmQuoteDraft(inputs, roomTypeConfig)
    const initialPricingPreview = buildFirmQuotePreview(initialFirmQuoteDraft, pricingConfig, roomTypeConfig)
    const displayPrice = getFirmQuoteDisplayPrice(initialFirmQuoteDraft, initialPricingPreview)
    const customerResult = applyFirmQuoteDisplayPrice(result, displayPrice)
    const quoteRef = generateQuoteRef()

    const db = getAdminSupabase()

    const { data: clientData } = await db
      .from('clients')
      .upsert(
        {
          business_name: businessLabel,
          contact_name: inputs.contactName,
          email: inputs.email,
          phone: inputs.phone,
          city: inputs.city,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()

    const clientId = clientData?.id

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 30)

    const { error: quoteError } = await db.from('quotes').insert({
      quote_ref: quoteRef,
      client_id: clientId ?? null,
      inputs: inputs,
      result: result,
      status: 'pending',
      valid_until: validUntil.toISOString(),
    })

    if (quoteError) {
      console.error('[quote] Supabase insert error:', quoteError)
    }

    let emailSent = false
    let emailError: string | null = null

    try {
      await sendQuoteEmail(quoteRef, inputs, result, displayPrice)
      emailSent = true
    } catch (err) {
      console.error('[quote] Email send failed:', err)
      emailError = err instanceof Error ? err.message : 'Unable to send quote email.'
    }

    const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
    const selectedRooms = sanitizePublicRoomScope(inputs.roomScope)
    const bathroomSummary = summarizePublicRoomScope(selectedRooms.filter((room) => isBathroomRoomScopeType(room.type)))
    const roomScopeSummary = summarizePublicRoomScope(selectedRooms.filter((room) => !isBathroomRoomScopeType(room.type) && room.type !== 'kitchen'))
    const adminSubject = `[New Quote] ${quoteRef} — ${businessLabel} (${cityLabel})`
    const adminMessage = `${businessLabel} in ${inputs.suburb} ${inputs.postcode} (${inputs.city}) requested a quote. ${formatPriceRange(displayPrice.low, displayPrice.high)} per visit.`
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <p><strong>New quote generated:</strong> ${quoteRef}</p>
        <p>Business: ${businessLabel}<br>
        Contact: ${inputs.contactName}<br>
        Email: ${inputs.email}<br>
        Phone: ${inputs.phone}<br>
        City: ${cityLabel}<br>
        Locality: ${inputs.suburb} ${inputs.postcode}<br>
        Premises: ${inputs.premisesType} — ${inputs.floorArea} sqm<br>
        Frequency: ${inputs.frequency}<br>
        ${inputs.addOns.bathrooms > 0 ? `Bathrooms / amenities: ${inputs.addOns.bathrooms}<br>` : ''}
        ${bathroomSummary.length > 0 ? `Bathroom areas: ${bathroomSummary.join(', ')}<br>` : ''}
        ${inputs.addOns.kitchens > 0 ? `Kitchens / kitchenettes: ${inputs.addOns.kitchens}<br>` : ''}
        ${roomScopeSummary.length > 0 ? `Other scoped areas: ${roomScopeSummary.join(', ')}<br>` : ''}
        Estimate: ${formatPriceRange(displayPrice.low, displayPrice.high)} per visit</p>
      </div>
    `

    await createAdminNotification('new_quote', adminSubject, adminMessage, adminHtml)

    return NextResponse.json({
      success: true,
      quoteRef,
      result: customerResult,
      emailSent,
      emailError,
    })
  } catch (error) {
    console.error('[api/quote] Unhandled error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
