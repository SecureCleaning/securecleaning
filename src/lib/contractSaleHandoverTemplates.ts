import type { FollowupAudience } from '@/lib/contractSaleFollowupTemplates'

type Party = { contact_name?: string | null; business_name?: string | null; email?: string | null; phone?: string | null }
type Details = {
  client: Party | null; cleaner: Party
  site: { site_name?: string | null; address?: string | null; suburb?: string | null; postcode?: string | null } | null
  product: { frequency?: string | null; client_price_per_visit_ex_gst_cents?: number | null }
  commencedOn: string | null
}
const frequencies: Record<string, string> = { daily: '5 days per week', '7x_week': '7 days per week', '3x_week': '3 times per week', '2x_week': '2 times per week', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', once_off: 'Once off' }
const value = (text?: string | null) => text?.trim() && !/^(not provided|n\/a|null|undefined)$/i.test(text.trim()) ? text.trim() : ''
const name = (text?: string | null) => value(text).replace(/\bnot provided\b/ig, '').trim()
const firstName = (name?: string | null) => value(name).split(/\s+/)[0] || 'there'
const line = (label: string, text?: string | null) => value(text) ? `${label}: ${value(text)}` : ''
export const isHandoverTemplate = (id: unknown) => id === 'handover-client' || id === 'handover-cleaner'

export function handoverDraft(audience: FollowupAudience, details: Details) {
  const { client, cleaner, site, product } = details
  const recipient = audience === 'client' ? client : cleaner
  const other = audience === 'client' ? cleaner : client
  const address = [site?.address, site?.suburb, site?.postcode].map(value).filter(Boolean).join(', ')
  const place = value(site?.site_name) || address || 'your cleaning service'
  const contact = [line('Business', other?.business_name), line('Contact', name(other?.contact_name)), line('Phone', other?.phone), line('Email', other?.email)].filter(Boolean).join('\n')
  const price = product.client_price_per_visit_ex_gst_cents
  const service = [line('Site', site?.site_name), line('Address', address), line('Frequency', product.frequency ? frequencies[product.frequency] ?? product.frequency.replace(/_/g, ' ') : ''), line('Commencement date', details.commencedOn),
    typeof price === 'number' && Number.isFinite(price) && price > 0 ? `Service price per visit: ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(price / 100)} excluding GST` : '',
  ].filter(Boolean).join('\n')
  const intro = audience === 'client'
    ? 'Thank you for choosing Secure Cleaning. The handover for your cleaning service is complete. Below are the direct contact details for your cleaner, so you can coordinate access, day-to-day requirements and service feedback.'
    : 'Thank you for working with Secure Cleaning. The sale and handover are complete. Below are the client contact and service details to help you coordinate the ongoing cleaning service.'
  const billing = audience === 'client'
    ? 'Please share these details with your accounts team where required. Invoicing arrangements, payment terms and the cleaning scope remain as set out in your signed service agreement. Please confirm any accounts contact or purchase order requirements with your cleaner.'
    : 'Please confirm the client\'s accounts contact and any purchase order requirements before issuing invoices, and follow the invoicing arrangements and payment terms in the signed agreements.'
  return { subject: `Secure Cleaning - ${audience === 'client' ? 'Your cleaner details' : 'Your client details'} - ${place}`.slice(0, 200).replace(/[\r\n]/g, ' '),
    body: `Hi ${firstName(recipient?.contact_name)},\n\n${intro}\n\n${audience === 'client' ? 'Your cleaner' : 'Your client'}\n${contact || 'Please contact Secure Cleaning to confirm contact details.'}\n\nService details\n${service || 'Please refer to the signed service agreement.'}\n\n${billing}\n\nPlease contact each other directly for routine service matters. If an issue cannot be resolved together, reply to this email and Secure Cleaning will help coordinate the next steps.` }
}
