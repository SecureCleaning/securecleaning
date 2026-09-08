export type QuoteCustomerJourney = 'online_enquiry' | 'agent_created'

export function getQuoteCustomerJourney(linkSource: unknown): QuoteCustomerJourney {
  return linkSource === 'crm_manual' ? 'agent_created' : 'online_enquiry'
}

export function isSelfServiceQuoteJourney(journey: QuoteCustomerJourney) {
  return journey === 'online_enquiry'
}
