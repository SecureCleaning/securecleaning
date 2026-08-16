import type { QuoteInputs, QuoteResult } from '@/lib/types'
import type { QuoteDocumentVariant, PublicQuoteWorkflowRecord } from '@/lib/quoteWorkflowData'

export type PublicQuoteDisplayInputs = Pick<QuoteInputs,
  'businessName' | 'city' | 'premisesType' | 'floorArea' | 'floors' | 'frequency' | 'timePreference' | 'roomScope'
> & {
  addOns: Pick<QuoteInputs['addOns'],
    'bathrooms' | 'kitchens' | 'glassCleaningRequired' | 'highTouchDisinfection' | 'carpetSteam' | 'consumables'
  >
}

export type PublicQuoteDocument = {
  quoteRef: string
  variant: QuoteDocumentVariant
  inputs: PublicQuoteDisplayInputs
  result: Pick<QuoteResult, 'totalLow' | 'totalHigh' | 'carpetSteamSeparate'>
}

export function toPublicQuoteDocument(record: PublicQuoteWorkflowRecord, variant: QuoteDocumentVariant): PublicQuoteDocument {
  const source = record.inputs
  return {
    quoteRef: record.quoteRef,
    variant,
    inputs: {
      businessName: source.businessName,
      city: source.city,
      premisesType: source.premisesType,
      floorArea: source.floorArea,
      floors: source.floors,
      frequency: source.frequency,
      timePreference: source.timePreference,
      roomScope: source.roomScope,
      addOns: {
        bathrooms: source.addOns.bathrooms,
        kitchens: source.addOns.kitchens,
        glassCleaningRequired: source.addOns.glassCleaningRequired,
        highTouchDisinfection: source.addOns.highTouchDisinfection,
        carpetSteam: source.addOns.carpetSteam,
        consumables: source.addOns.consumables,
      },
    },
    result: {
      totalLow: record.result.totalLow,
      totalHigh: record.result.totalHigh,
      carpetSteamSeparate: record.result.carpetSteamSeparate,
    },
  }
}
