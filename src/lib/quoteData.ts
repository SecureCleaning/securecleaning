import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs, QuoteResult } from '@/lib/types'

export type StoredQuoteRecord = {
  quoteRef: string
  inputs: QuoteInputs
  result: QuoteResult
  validUntil?: string | null
  createdAt?: string | null
  status?: string | null
}

export async function getQuoteByRef(quoteRef: string): Promise<StoredQuoteRecord | null> {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('quotes')
    .select('quote_ref, inputs, result, valid_until, created_at, status')
    .eq('quote_ref', quoteRef)
    .maybeSingle()

  if (error) {
    console.error('[quoteData] Failed to load quote by ref:', error)
    return null
  }

  if (!data) return null

  return {
    quoteRef: data.quote_ref,
    inputs: data.inputs as QuoteInputs,
    result: data.result as QuoteResult,
    validUntil: data.valid_until,
    createdAt: data.created_at,
    status: data.status,
  }
}
