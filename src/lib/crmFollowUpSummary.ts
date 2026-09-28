import type { CrmEmailTemplate, CrmOpportunity } from '@/lib/clientCrmData'

// Legacy manual reminders have no explicit source link. Describe the latest
// recorded sales activity without copying the enquiry or internal notes.
export function followUpSummary(item: Pick<CrmOpportunity, 'communications' | 'quotes'>, templates: Pick<CrmEmailTemplate, 'id' | 'name'>[]) {
  const emails = item.communications.filter((email) => email.status === 'sent' && email.sentAt)
    .sort((a, b) => Date.parse(b.sentAt!) - Date.parse(a.sentAt!))
  const quotes = item.quotes.filter((quote) => quote.finalQuoteSentAt)
    .sort((a, b) => Date.parse(b.finalQuoteSentAt!) - Date.parse(a.finalQuoteSentAt!))
  if (quotes[0] && (!emails[0] || Date.parse(quotes[0].finalQuoteSentAt!) >= Date.parse(emails[0].sentAt!))) return 'Follow up sent quote'
  if (emails[0]) {
    const template = templates.find((entry) => entry.id === emails[0].templateId)
    return template ? `Follow up: ${template.name.slice(0, 100)}` : 'Follow up client email'
  }
  return 'Client follow-up'
}
