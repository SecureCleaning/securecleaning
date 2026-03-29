'use client'

import type { BookingInputs, QuoteInputs, QuoteResult } from '@/lib/types'

const QUOTE_RESULT_KEY = 'quoteResult'
const QUOTE_DRAFT_KEY = 'quoteDraft'

export interface StoredQuoteResult {
  quoteRef: string
  result: QuoteResult
  inputs: QuoteInputs
}

export function saveQuoteDraft(inputs: Partial<QuoteInputs>) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(QUOTE_DRAFT_KEY, JSON.stringify(inputs))
}

export function getQuoteDraft(): Partial<QuoteInputs> | null {
  if (typeof window === 'undefined') return null

  const raw = sessionStorage.getItem(QUOTE_DRAFT_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as Partial<QuoteInputs>
  } catch {
    return null
  }
}

export function saveQuoteResult(payload: StoredQuoteResult) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(QUOTE_RESULT_KEY, JSON.stringify(payload))
  saveQuoteDraft(payload.inputs)
}

export function getQuoteResult(): StoredQuoteResult | null {
  if (typeof window === 'undefined') return null

  const raw = sessionStorage.getItem(QUOTE_RESULT_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as StoredQuoteResult
  } catch {
    return null
  }
}

export function getBookingPrefillFromQuote(quoteRef?: string): Partial<BookingInputs> | null {
  const storedResult = getQuoteResult()
  const storedDraft = getQuoteDraft()

  const quoteInputs = storedResult?.inputs ?? storedDraft
  if (!quoteInputs) return null

  if (quoteRef && storedResult?.quoteRef && storedResult.quoteRef !== quoteRef) {
    return null
  }

  return {
    quoteRef: quoteRef ?? storedResult?.quoteRef,
    businessName: quoteInputs.businessName,
    contactName: quoteInputs.contactName,
    email: quoteInputs.email,
    phone: quoteInputs.phone,
    address: quoteInputs.address,
    city: quoteInputs.city,
    premisesType: quoteInputs.premisesType,
    floorArea: quoteInputs.floorArea,
    frequency: quoteInputs.frequency,
    timePreference: quoteInputs.timePreference,
    addOns: quoteInputs.addOns,
    notes: quoteInputs.notes,
    preferredStartDate: quoteInputs.preferredStartDate,
  }
}
