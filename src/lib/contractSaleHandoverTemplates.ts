import type { EmailMergeField } from '@/lib/emailMergeFields'
import { applyEmailMergeFields } from '@/lib/emailMergeFields'
import { escapeEmailHtml } from '@/lib/richEmailContent'
import type { FollowupAudience } from '@/lib/contractSaleFollowupTemplates'

type Party = { contact_name?: string | null; business_name?: string | null; email?: string | null; phone?: string | null }
type Details = {
  client: Party | null; cleaner: Party
  site: { site_name?: string | null; address?: string | null; suburb?: string | null; postcode?: string | null } | null
  product: { frequency?: string | null; client_price_per_visit_ex_gst_cents?: number | null }
  commencedOn: string | null
}

export type ContractSaleHandoverEmailTemplate = {
  id: `handover-${FollowupAudience}`
  audience: FollowupAudience
  subject: string
  bodyText: string
  bodyHtml: string
  bodyDocument?: Record<string, unknown> | null
  updatedAt: string | null
}

const frequencies: Record<string, string> = { daily: '5 days per week', '7x_week': '7 days per week', '3x_week': '3 times per week', '2x_week': '2 times per week', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', once_off: 'Once off' }
const value = (text?: string | null) => text?.trim() && !/^(not provided|n\/a|null|undefined)$/i.test(text.trim()) ? text.trim() : ''
const name = (text?: string | null) => value(text).replace(/\bnot provided\b/ig, '').trim()
const firstName = (text?: string | null) => value(text).split(/\s+/)[0] || 'there'
const line = (label: string, text?: string | null) => value(text) ? `${label}: ${value(text)}` : ''
const mergeField = (key: string, label: string, description: string, source = 'Product sale'): EmailMergeField => ({ key, token: `<<${key}>>`, label, description, source })

export const HANDOVER_EMAIL_MERGE_FIELDS = [
  mergeField('recipient_first_name', 'Recipient first name', "Selected recipient's first name"),
  mergeField('counterparty_heading', 'Contact heading', 'Your cleaner or Your client'),
  mergeField('counterparty_details', 'Contact details block', 'Available business, contact, phone and email details'),
  mergeField('counterparty_business', 'Contact business', 'Other party business name'),
  mergeField('counterparty_name', 'Contact name', 'Other party contact name'),
  mergeField('counterparty_phone', 'Contact phone', 'Other party phone number'),
  mergeField('counterparty_email', 'Contact email', 'Other party email address'),
  mergeField('service_details', 'Service details block', 'Available site, address, frequency, commencement date and price'),
  mergeField('service_place', 'Site name or address', 'Site name, falling back to its address'),
  mergeField('site_name', 'Site name', 'Saved client site name'),
  mergeField('site_address', 'Site address', 'Saved street, suburb and postcode'),
  mergeField('frequency', 'Frequency', 'Saved service frequency'),
  mergeField('commencement_date', 'Commencement date', 'Saved product sale commencement date'),
  mergeField('service_price', 'Service price', 'Client price per visit excluding GST'),
  mergeField('billing_guidance', 'Billing guidance', 'Audience-specific invoicing and agreement guidance'),
] as const satisfies readonly EmailMergeField[]

export const HANDOVER_EMAIL_MERGE_FIELD_KEYS = new Set(HANDOVER_EMAIL_MERGE_FIELDS.map((field) => field.key))

const clientBody = `Hi <<recipient_first_name>>,

Thank you for choosing Secure Cleaning. The handover for your cleaning service is complete. Below are the direct contact details for your cleaner, so you can coordinate access, day-to-day requirements and service feedback.

<<counterparty_heading>>
<<counterparty_details>>

Service details
<<service_details>>

<<billing_guidance>>

Please contact each other directly for routine service matters. If an issue cannot be resolved together, reply to this email and Secure Cleaning will help coordinate the next steps.`

const cleanerBody = `Hi <<recipient_first_name>>,

Thank you for working with Secure Cleaning. The sale and handover are complete. Below are the client contact and service details to help you coordinate the ongoing cleaning service.

<<counterparty_heading>>
<<counterparty_details>>

Service details
<<service_details>>

<<billing_guidance>>

Please contact each other directly for routine service matters. If an issue cannot be resolved together, reply to this email and Secure Cleaning will help coordinate the next steps.`

export const DEFAULT_CONTRACT_SALE_HANDOVER_EMAIL_TEMPLATES: Record<FollowupAudience, ContractSaleHandoverEmailTemplate> = {
  client: { id: 'handover-client', audience: 'client', subject: 'Secure Cleaning - Your cleaner details - <<service_place>>', bodyText: clientBody, bodyHtml: '', bodyDocument: null, updatedAt: null },
  cleaner: { id: 'handover-cleaner', audience: 'cleaner', subject: 'Secure Cleaning - Your client details - <<service_place>>', bodyText: cleanerBody, bodyHtml: '', bodyDocument: null, updatedAt: null },
}

export const isHandoverTemplate = (id: unknown) => id === 'handover-client' || id === 'handover-cleaner'

function templateValues(audience: FollowupAudience, details: Details) {
  const { client, cleaner, site, product } = details
  const recipient = audience === 'client' ? client : cleaner
  const other = audience === 'client' ? cleaner : client
  const address = [site?.address, site?.suburb, site?.postcode].map(value).filter(Boolean).join(', ')
  const place = value(site?.site_name) || address || 'your cleaning service'
  const contact = [line('Business', other?.business_name), line('Contact', name(other?.contact_name)), line('Phone', other?.phone), line('Email', other?.email)].filter(Boolean).join('\n')
    || 'Please contact Secure Cleaning to confirm contact details.'
  const frequency = product.frequency ? frequencies[product.frequency] ?? product.frequency.replace(/_/g, ' ') : ''
  const price = product.client_price_per_visit_ex_gst_cents
  const servicePrice = typeof price === 'number' && Number.isFinite(price) && price > 0
    ? `${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(price / 100)} excluding GST`
    : ''
  const service = [line('Site', site?.site_name), line('Address', address), line('Frequency', frequency), line('Commencement date', details.commencedOn), servicePrice ? `Service price per visit: ${servicePrice}` : ''].filter(Boolean).join('\n')
    || 'Please refer to the signed service agreement.'
  const billing = audience === 'client'
    ? 'Please share these details with your accounts team where required. Invoicing arrangements, payment terms and the cleaning scope remain as set out in your signed service agreement. Please confirm any accounts contact or purchase order requirements with your cleaner.'
    : 'Please confirm the client\'s accounts contact and any purchase order requirements before issuing invoices, and follow the invoicing arrangements and payment terms in the signed agreements.'
  return {
    recipient_first_name: firstName(recipient?.contact_name), counterparty_heading: audience === 'client' ? 'Your cleaner' : 'Your client',
    counterparty_details: contact, counterparty_business: value(other?.business_name), counterparty_name: name(other?.contact_name),
    counterparty_phone: value(other?.phone), counterparty_email: value(other?.email), service_details: service, service_place: place,
    site_name: value(site?.site_name), site_address: address, frequency, commencement_date: value(details.commencedOn), service_price: servicePrice,
    billing_guidance: billing,
  }
}

export function handoverDraft(audience: FollowupAudience, details: Details, template = DEFAULT_CONTRACT_SALE_HANDOVER_EMAIL_TEMPLATES[audience]) {
  const values = templateValues(audience, details)
  const htmlValues = Object.fromEntries(Object.entries(values).map(([key, text]) => [key, escapeEmailHtml(text).replace(/\n/g, '<br>')]))
  return {
    subject: applyEmailMergeFields(template.subject, values).slice(0, 200).replace(/[\r\n]/g, ' '),
    body: applyEmailMergeFields(template.bodyText, values),
    bodyHtml: template.bodyHtml ? applyEmailMergeFields(template.bodyHtml, htmlValues) : '',
    // Reopen the merged HTML, not the master document containing unresolved fields.
    bodyDocument: null,
  }
}
