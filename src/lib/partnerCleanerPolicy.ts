import { companyEnabled, partnerLocation, PARTNER_REGIONS, PartnerError, textField, type PartnerCompany } from './partnerBookingPolicy'

export function partnerCleanerDetails(value: unknown, company: PartnerCompany) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PartnerError('Enter the cleaner details.')
  const input = value as Record<string, unknown>
  const location = partnerLocation(input)
  if (!companyEnabled(company) || !company.cities.includes(location.city)) throw new PartnerError('This state is not available for your account.', 403)
  const email = textField(input.email, 'email address', 254).toLowerCase()
  const phone = textField(input.phone, 'phone number', 40)
  const address = textField(input.address, 'street address', 240, false)
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) throw new PartnerError('Enter one valid email address.')
  if (!/^[+()\d .-]+$/.test(phone) || phone.replace(/\D/g, '').length < 8 || phone.replace(/\D/g, '').length > 15) throw new PartnerError('Enter a valid phone number.')
  if (input.emailConsent !== true) throw new PartnerError('Confirm that the cleaner agreed to receive the details email.')
  const idempotencyKey = textField(input.idempotencyKey, 'submission reference', 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new PartnerError('Refresh the page before adding a cleaner.')
  return {
    idempotencyKey, businessName: textField(input.businessName, 'business name', 160),
    firstName: textField(input.firstName, 'first name', 80, false) || 'Manager',
    lastName: textField(input.lastName, 'surname', 80, false), email, phone,
    // Omit an empty optional field to preserve fingerprints for earlier submissions.
    ...(address ? { address } : {}),
    city: location.city, state: PARTNER_REGIONS[location.city], suburb: location.suburb, postcode: location.postcode,
    ...(input.welcomeEmailConsent === true ? { welcomeEmailConsent: true } : {}),
    notes: textField(input.notes, 'internal notes', 1500, false), emailConsent: true,
  }
}

export type PartnerCleanerDetails = ReturnType<typeof partnerCleanerDetails>
export type PartnerCleanerReceipt = { reference: string; emailStatus: 'sent' | 'team_review'; replay: boolean; welcomeEmailStatus?: 'sent' | 'team_review' | 'not_required' }

// Never return a cleaner ID, existing record details, or the private profile link to a caller.
export function partnerCleanerReceipt(reference: string, emailStatus: string, replay: boolean, welcomeEmailStatus?: string): PartnerCleanerReceipt {
  return { reference, emailStatus: emailStatus === 'sent' ? 'sent' : 'team_review', replay, ...(welcomeEmailStatus === undefined ? {} : { welcomeEmailStatus: welcomeEmailStatus === 'sent' ? 'sent' : welcomeEmailStatus === 'not_required' ? 'not_required' : 'team_review' }) }
}
