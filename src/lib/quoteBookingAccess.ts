import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'

type Purpose = 'document' | 'booking'
type Variant = 'remote_review' | 'final'
export function isQuoteBookingHandoffToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}
export function quoteCapabilityHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
function documentFingerprint(quote: Record<string, unknown>, variant: Variant) {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    return value
  }
  return createHash('sha256').update(JSON.stringify(canonical(variant === 'final'
    ? [quote.final_quote_document_version] : [quote.inputs, quote.result, quote.firm_quote_workflow]))).digest('hex')
}
export async function createQuoteCapability(quoteRef: string, purpose: Purpose, variant: Variant = 'remote_review') {
  const db = getAdminSupabase()
  const { data: quote, error } = await db.from('quotes').select('id, inputs, result, firm_quote_workflow, final_quote_document_version').eq('quote_ref', quoteRef).single()
  if (error || !quote) throw new Error('Quote access could not be issued.')
  const token = randomBytes(32).toString('base64url')
  const { error: insertError } = await db.from('quote_capabilities').insert({
    token_hash: quoteCapabilityHash(token), quote_id: quote.id, purpose, variant,
    document_fingerprint: purpose === 'document' ? documentFingerprint(quote, variant) : null,
    document_version: variant === 'final' ? quote.final_quote_document_version : 0,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  })
  if (insertError) throw new Error('Quote access could not be issued.')
  return token
}
export async function resolveQuoteCapability(quoteRef: string, token: unknown, purpose: Purpose, variant: Variant = 'remote_review') {
  if (!isQuoteBookingHandoffToken(token)) return null
  try {
    const db = getAdminSupabase()
    const { data: access, error } = await db.from('quote_capabilities').select('quote_id, document_version, document_fingerprint, consumed_booking_id, consumed_at')
      .eq('token_hash', quoteCapabilityHash(token)).eq('purpose', purpose).eq('variant', variant)
      .is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
    if (error || !access || (access.consumed_at && !access.consumed_booking_id)) return null
    const { data: quote, error: quoteError } = await db.from('quotes')
      .select('id, quote_ref, client_id, inputs, result, firm_quote_workflow, final_quote_document_version, final_quote_sent_at, final_quote_reviewed_at')
      .eq('id', access.quote_id).eq('quote_ref', quoteRef).maybeSingle()
    if (quoteError || !quote) return null
    if (purpose === 'document' && access.document_fingerprint !== documentFingerprint(quote, variant)) return null
    if (variant === 'final' && (!quote.final_quote_sent_at || !quote.final_quote_reviewed_at ||
      !(Date.parse(quote.final_quote_sent_at) >= Date.parse(quote.final_quote_reviewed_at)) ||
      quote.final_quote_document_version !== access.document_version)) return null
    return { ...access, quote }
  } catch { return null }
}
export async function createQuoteBookingHandoffToken(quoteRef: string) {
  return createQuoteCapability(quoteRef, 'booking')
}
export async function verifyQuoteBookingHandoffToken(quoteRef: string, token: unknown) {
  return Boolean(await resolveQuoteCapability(quoteRef, token, 'booking'))
}
