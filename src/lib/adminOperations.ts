import { getAdminSupabase } from '@/lib/supabase'
import { sendBookingConfirmationEmail, sendQuoteEmail, sendScopeOfWorksEmail } from '@/lib/email'
import type { BookingInputs, QuoteInputs } from '@/lib/types'
import { writeAuditLog } from '@/lib/auditLog'
import { getPublicQuoteWorkflowByRef } from '@/lib/quoteWorkflowData'

export async function updateQuoteStatus(quoteRef: string, status: string) {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('quotes')
    .update({ status })
    .eq('quote_ref', quoteRef)
    .select('quote_ref, status')
    .maybeSingle()

  if (error) throw error
  await writeAuditLog('quote', quoteRef, 'status_updated', { status })
  return data
}

export async function updateBookingStatus(bookingRef: string, status: string) {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('bookings')
    .update({ status })
    .eq('booking_ref', bookingRef)
    .select('booking_ref, status')
    .maybeSingle()

  if (error) throw error
  await writeAuditLog('booking', bookingRef, 'status_updated', { status })
  return data
}

export async function resendQuoteEmailByRef(quoteRef: string) {
  const quote = await getPublicQuoteWorkflowByRef(quoteRef)
  if (!quote) throw new Error('Quote not found.')

  await sendQuoteEmail(quote.quoteRef, quote.inputs, quote.result, quote.displayPrice)
  await writeAuditLog('quote', quoteRef, 'email_resent')
  return { success: true }
}

export async function resendScopeOfWorksEmailByRef(quoteRef: string) {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('quotes')
    .select('quote_ref, inputs')
    .eq('quote_ref', quoteRef)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Quote not found.')

  await sendScopeOfWorksEmail(data.quote_ref, data.inputs as QuoteInputs)
  await writeAuditLog('quote', quoteRef, 'scope_email_resent')
  return { success: true }
}

export async function resendBookingEmailByRef(bookingRef: string) {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('bookings')
    .select('booking_ref, inputs')
    .eq('booking_ref', bookingRef)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Booking not found.')

  await sendBookingConfirmationEmail(data.booking_ref, data.inputs as BookingInputs)
  await writeAuditLog('booking', bookingRef, 'email_resent')
  return { success: true }
}
