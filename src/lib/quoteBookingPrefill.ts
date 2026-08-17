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

export function buildQuoteEditPrefillFromQuoteInputs(quoteInputs: Partial<QuoteInputs>): Partial<QuoteInputs> {
  return {
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
    floors: quoteInputs.floors,
    flooringType: quoteInputs.flooringType,
    meetingRooms: quoteInputs.meetingRooms,
    roomScope: quoteInputs.roomScope,
    frequency: quoteInputs.frequency,
    timePreference: quoteInputs.timePreference,
    isSpringClean: quoteInputs.isSpringClean,
    addOns: quoteInputs.addOns,
    notes: quoteInputs.notes,
    heardAboutUs: quoteInputs.heardAboutUs,
    preferredStartDate: quoteInputs.preferredStartDate,
  }
}
