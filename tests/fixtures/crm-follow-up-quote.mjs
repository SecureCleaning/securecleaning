import { DEFAULT_QUOTE_ROOM_TYPE_CONFIG } from '../../src/lib/roomTypeConfig.ts'
export const quoteInputs = {
  businessName: 'Example Business', contactName: 'Test Manager', email: 'client@example.test',
  phone: '0400000000', city: 'melbourne', suburb: 'Richmond', postcode: '3121',
  premisesType: 'office', floorArea: 200, floors: 1, flooringType: 'mixed',
  frequency: 'weekly', timePreference: 'after_hours',
  addOns: { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false },
}
export function savedQuoteDocument() {
  return {
    version: 2, inputs: quoteInputs, result: { totalLow: 500, totalHigh: 600, privateCost: 'PRIVATE-COST' },
    firmQuoteDraft: {
      status: 'reviewed', revisedInputs: quoteInputs,
      roomItems: [{ id: 'room1', type: 'office', label: 'Main office', quantity: 1, size: 200, floor: 1 }],
      targetPrice: '', finalPerVisit: '345', scopeSummary: 'Clean all agreed areas.',
      inclusions: 'Equipment and materials included.', exclusions: 'External windows excluded.',
      serviceCommentary: 'PRIVATE-STAFF-NOTE',
    },
    roomTypeConfig: DEFAULT_QUOTE_ROOM_TYPE_CONFIG, reviewedAt: '2026-10-20T01:00:00Z',
    pricingPreview: { adjustedLow: 500, adjustedHigh: 600 },
  }
}
