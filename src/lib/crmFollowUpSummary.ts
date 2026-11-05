import type { CrmEmailTemplate, CrmCommunication, CrmQuoteHistory } from '@/lib/clientCrmData'

// Legacy manual reminders have no explicit source link. Describe the latest
// recorded sales activity without copying the enquiry or internal notes.
export function followUpSummary(item: { followUpSource?: string | null; followUpSourceId?: string | null; communications: (Pick<CrmCommunication, 'status' | 'sentAt' | 'templateId'> & { id?: string })[]; quotes: Pick<CrmQuoteHistory, 'finalQuoteSentAt'>[] }, templates: Pick<CrmEmailTemplate, 'id' | 'name'>[]) {
  if (item.followUpSource === 'inspection') return 'Follow up after inspection'
  if (item.followUpSource === 'inspection_cancelled') return 'Rebook cancelled inspection'
  if (item.followUpSource === 'quote') return 'Follow up sent quote'
  if (item.followUpSource === 'manual') return 'Client follow-up (manually scheduled)'
  const emails = item.communications.filter((email) => email.status === 'sent' && email.sentAt && (item.followUpSource !== 'email' || email.id === item.followUpSourceId))
    .sort((a, b) => Date.parse(b.sentAt!) - Date.parse(a.sentAt!))
  const quotes = item.quotes.filter((quote) => quote.finalQuoteSentAt)
    .sort((a, b) => Date.parse(b.finalQuoteSentAt!) - Date.parse(a.finalQuoteSentAt!))
  if (item.followUpSource !== 'email' && quotes[0] && (!emails[0] || Date.parse(quotes[0].finalQuoteSentAt!) >= Date.parse(emails[0].sentAt!))) return 'Follow up sent quote'
  if (emails[0]) {
    const template = templates.find((entry) => entry.id === emails[0].templateId)
    return template ? `Follow up: ${template.name.slice(0, 100)}` : 'Follow up client email'
  }
  return item.followUpSource === 'email' ? 'Follow up client email' : 'Client follow-up'
}
