import { NextRequest, NextResponse } from 'next/server'
import { calculateQuote, generateQuoteRef } from '@/lib/quoteEngine'
import { getAdminSupabase } from '@/lib/supabase'
import { sendQuoteEmail } from '@/lib/email'
import type { QuoteInputs } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const inputs = body as QuoteInputs

    // ── Validate required fields ──────────────────────────────────────────
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

    if (inputs.floorArea <= 0 || inputs.floorArea > 100000) {
      return NextResponse.json(
        { success: false, error: 'Floor area must be between 1 and 100,000 sqm.' },
        { status: 400 }
      )
    }

    // ── Calculate quote ───────────────────────────────────────────────────
    const result = calculateQuote(inputs)
    const quoteRef = generateQuoteRef()

    // ── Save to Supabase ──────────────────────────────────────────────────
    const db = getAdminSupabase()

    // Upsert client record
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

    // Insert quote record
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
      // Don't fail the request — still return the quote
    }

    // ── Send emails (non-blocking) ────────────────────────────────────────
    sendQuoteEmail(quoteRef, inputs, result).catch((err) => {
      console.error('[quote] Email send failed:', err)
    })

    return NextResponse.json({
      success: true,
      quoteRef,
      result,
    })
  } catch (error) {
    console.error('[api/quote] Unhandled error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
