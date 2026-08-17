'use client'

import type { BookingInputs, QuoteInputs, QuoteResult } from '@/lib/types'
import { buildBookingPrefillFromQuoteInputs } from '@/lib/quoteBookingPrefill'

export { buildBookingPrefillFromQuoteInputs } from '@/lib/quoteBookingPrefill'

const QUOTE_RESULT_KEY = 'quoteResult'
const QUOTE_DRAFT_KEY = 'quoteDraft'

export interface StoredQuoteResult {
  quoteRef: string
  result: QuoteResult
  inputs: QuoteInputs
  emailSent?: boolean
  emailError?: string | null
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

  if (quoteRef && storedResult?.quoteRef !== quoteRef) {
    return null
  }

  const quoteInputs = storedResult?.inputs ?? (quoteRef ? null : storedDraft)
  if (!quoteInputs) return null

  return buildBookingPrefillFromQuoteInputs(quoteRef ?? storedResult?.quoteRef, quoteInputs)
}
