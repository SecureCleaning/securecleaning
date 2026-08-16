import type { BookingInputs, QuoteInputs } from '@/lib/types'

export function buildBookingPrefillFromQuoteInputs(quoteRef: string | undefined, quoteInputs: Partial<QuoteInputs>): Partial<BookingInputs> {
  return {
    quoteRef,
    businessName: quoteInputs.businessName,
    contactName: quoteInputs.contactName,
    email: quoteInputs.email,
    phone: quoteInputs.phone,
    address: quoteInputs.address,
    city: quoteInputs.city,
    suburb: quoteInputs.suburb,
    postcode: quoteInputs.postcode,
    premisesType: quoteInputs.premisesType,
    floorArea: quoteInputs.floorArea,
    frequency: quoteInputs.frequency,
    timePreference: quoteInputs.timePreference,
    addOns: quoteInputs.addOns,
    notes: quoteInputs.notes,
    preferredStartDate: quoteInputs.preferredStartDate,
  }
}
