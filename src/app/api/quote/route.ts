import { NextRequest, NextResponse } from 'next/server'
import { calculateQuote, generateQuoteRef } from '@/lib/quoteEngine'
import { getAdminSupabase } from '@/lib/supabase'
import { sendQuoteEmail } from '@/lib/email'
import { getQuotePricingConfig } from '@/lib/pricing'
import type { QuoteInputs } from '@/lib/types'
import { createAdminNotification } from '@/lib/adminNotifications'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const inputs = body as QuoteInputs

    if (!inputs.email || !inputs.businessName || !inputs.city || !inputs.premisesType || !inputs.floorArea) {
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

    if (inputs.floorArea < 50 || inputs.floorArea > 400) {
      return NextResponse.json(
        { success: false, error: 'Floor area must be between 50 and 400 sqm.' },
        { status: 400 }
      )
    }

    const pricingConfig = await getQuotePricingConfig()
    const result = calculateQuote(inputs, pricingConfig)
    const quoteRef = generateQuoteRef()

    const db = getAdminSupabase()

    const { data: clientData } = await db
      .from('clients')
      .upsert(
        {
          business_name: inputs.businessName,
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
      await sendQuoteEmail(quoteRef, inputs, result)
      emailSent = true
    } catch (err) {
      console.error('[quote] Email send failed:', err)
      emailError = err instanceof Error ? err.message : 'Unable to send quote email.'
    }

    await createAdminNotification(
      'new_quote',
      `New quote ${quoteRef}`,
      `${inputs.businessName} in ${inputs.city} requested a quote.`
    )

    return NextResponse.json({
      success: true,
      quoteRef,
      result,
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
