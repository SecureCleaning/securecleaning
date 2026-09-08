import { writeAuditLog } from '@/lib/auditLog'
import { actorCanAccessOpportunity, type ClientCrmActor } from '@/lib/clientCrmAuth'
import { ClientCrmError } from '@/lib/clientCrmData'
import { buildCrmQuoteDraftInputs } from '@/lib/clientCrmQuoteDraft'
import { calculateQuote } from '@/lib/quoteEngine'
import { getQuotePricingConfig } from '@/lib/pricing'
import { getAdminSupabase } from '@/lib/supabase'
import type { BookingInputs } from '@/lib/types'

function clean(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function quoteReference(idempotencyKey: string, city: 'melbourne' | 'sydney') {
  const timeZone = city === 'sydney' ? 'Australia/Sydney' : 'Australia/Melbourne'
  const dateParts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const date = Object.fromEntries(dateParts.map((part) => [part.type, part.value]))
  return `SC-${date.year}${date.month}${date.day}-${idempotencyKey.replaceAll('-', '').slice(0, 8).toUpperCase()}`
}

async function linkQuoteToOpportunity(opportunityId: string, quoteId: string) {
  const db = getAdminSupabase()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: existing, error: existingError } = await db.from('crm_opportunity_quotes')
      .select('opportunity_id, sequence_number')
      .eq('quote_id', quoteId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      if (String(existing.opportunity_id) !== opportunityId) {
        throw new ClientCrmError('This quote is already linked to another opportunity.', 409)
      }
      return Number(existing.sequence_number)
    }

    const { data: latest, error: latestError } = await db.from('crm_opportunity_quotes')
      .select('sequence_number')
      .eq('opportunity_id', opportunityId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError
    const sequenceNumber = Number(latest?.sequence_number ?? 0) + 1
    const { error } = await db.from('crm_opportunity_quotes').insert({
      opportunity_id: opportunityId,
      quote_id: quoteId,
      sequence_number: sequenceNumber,
      link_source: 'crm_manual',
    })
    if (!error) return sequenceNumber
    if (error.code !== '23505' || attempt === 2) throw error
  }
  throw new Error('Unable to link the quote to its CRM opportunity.')
}

export async function createCrmQuoteDraft(actor: ClientCrmActor, input: Record<string, unknown>) {
  const opportunityId = clean(input.opportunityId, 100)
  const idempotencyKey = clean(input.idempotencyKey, 100)
  if (!isUuid(opportunityId)) throw new ClientCrmError('Select a valid CRM opportunity.')
  if (!isUuid(idempotencyKey)) throw new ClientCrmError('A valid quote request ID is required.')

  const db = getAdminSupabase()
  const { data: opportunity, error: opportunityError } = await db.from('crm_opportunities')
    .select('id, organisation_id, primary_contact_id, site_id, assigned_staff_id, stage, closed_at')
    .eq('id', opportunityId)
    .maybeSingle()
  if (opportunityError) throw opportunityError
  if (!opportunity || !actorCanAccessOpportunity(actor, opportunity.assigned_staff_id)) {
    throw new ClientCrmError('Opportunity not found.', 404)
  }
  if (opportunity.closed_at || ['won', 'lost', 'cancelled'].includes(String(opportunity.stage ?? ''))) {
    throw new ClientCrmError('Closed opportunities cannot receive a new quote.', 409)
  }
  if (opportunity.stage !== 'quoting') {
    throw new ClientCrmError('Move the opportunity to Quoting before creating a quote.', 409)
  }
  if (!opportunity.organisation_id || !opportunity.primary_contact_id || !opportunity.site_id) {
    throw new ClientCrmError('Save the business, primary contact, and site before creating a quote.', 409)
  }

  const [organisationResult, contactResult, siteResult, bookingResult] = await Promise.all([
    db.from('crm_organisations').select('id, business_name').eq('id', opportunity.organisation_id).maybeSingle(),
    db.from('clients').select('id, business_name, contact_name, email, phone').eq('id', opportunity.primary_contact_id).maybeSingle(),
    db.from('sites').select('id, site_name, address, suburb, postcode, city').eq('id', opportunity.site_id).maybeSingle(),
    db.from('bookings').select('booking_ref, inputs, created_at').eq('opportunity_id', opportunityId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  for (const result of [organisationResult, contactResult, siteResult, bookingResult]) {
    if (result.error) throw result.error
  }
  const organisation = organisationResult.data
  const contact = contactResult.data
  const site = siteResult.data
  if (!organisation || !contact || !site) throw new ClientCrmError('The saved client or site record is incomplete.', 409)

  const city = site.city === 'melbourne' || site.city === 'sydney' ? site.city : null
  const businessName = String(organisation.business_name ?? contact.business_name ?? site.site_name ?? '').trim()
  const contactName = String(contact.contact_name ?? '').trim()
  const email = String(contact.email ?? '').trim()
  const phone = String(contact.phone ?? '').trim()
  const address = String(site.address ?? '').trim()
  const suburb = String(site.suburb ?? '').trim()
  const postcode = String(site.postcode ?? '').replace(/[^0-9]/g, '')
  if (!city || !businessName || !contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !address || !suburb || !/^\d{4}$/.test(postcode)) {
    throw new ClientCrmError('Complete the client name, email, phone, street address, suburb, postcode, and state before creating a quote.', 409)
  }

  const quoteRef = quoteReference(idempotencyKey, city)
  const { data: existingQuote, error: existingQuoteError } = await db.from('quotes')
    .select('id, quote_ref')
    .eq('quote_ref', quoteRef)
    .maybeSingle()
  if (existingQuoteError) throw existingQuoteError
  if (existingQuote) {
    const { data: existingLink, error: existingLinkError } = await db.from('crm_opportunity_quotes')
      .select('opportunity_id')
      .eq('quote_id', existingQuote.id)
      .maybeSingle()
    if (existingLinkError) throw existingLinkError
    if (String(existingLink?.opportunity_id ?? '') !== opportunityId) {
      throw new ClientCrmError('This quote request conflicts with another CRM record.', 409)
    }
    return { quoteRef, created: false }
  }

  const bookingInputs = bookingResult.data?.inputs && typeof bookingResult.data.inputs === 'object'
    ? bookingResult.data.inputs as Partial<BookingInputs>
    : null
  const quoteInputs = buildCrmQuoteDraftInputs({
    businessName,
    contactName,
    email,
    phone,
    address,
    suburb,
    postcode,
    city,
    bookingInputs,
  })
  const result = calculateQuote(quoteInputs, await getQuotePricingConfig())
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 30)

  const { data: quote, error: quoteError } = await db.from('quotes').insert({
    quote_ref: quoteRef,
    client_id: contact.id,
    inputs: quoteInputs,
    result,
    status: 'pending',
    valid_until: validUntil.toISOString(),
  }).select('id').single()
  if (quoteError || !quote) throw quoteError ?? new Error('Quote creation did not return a quote.')

  try {
    await linkQuoteToOpportunity(opportunityId, String(quote.id))
  } catch (error) {
    const { error: cleanupError } = await db.from('quotes').delete().eq('id', quote.id)
    if (cleanupError) console.error('[clientCrmQuotes] Failed to clean up an unlinked quote:', cleanupError)
    throw error
  }

  await writeAuditLog('quote', quoteRef, 'crm.quote.created', {
    opportunityId,
    actorId: actor.id,
    actorRole: actor.role,
    sourceBookingRef: bookingResult.data?.booking_ref ?? null,
  })
  return { quoteRef, created: true }
}
