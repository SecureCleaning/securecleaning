import { applyEmailMergeFields, type EmailMergeField } from '@/lib/emailMergeFields'
import { escapeEmailHtml } from '@/lib/richEmailContent'

export type QuoteEmailTemplate = {
  subject: string
  bodyText: string
  bodyHtml: string
  bodyDocument: Record<string, unknown> | null
  updatedAt: string | null
}
export const QUOTE_EMAIL_FIELDS: readonly EmailMergeField[] = [
  { key: 'quote_ref', token: '<<quote_ref>>', label: 'Quote reference', description: 'Current quote reference' },
  { key: 'business_name', token: '<<business_name>>', label: 'Business name', description: 'Client business name' },
]
export const DEFAULT_QUOTE_EMAIL_TEMPLATE: QuoteEmailTemplate = {
  subject: 'Your updated Secure Cleaning quote - <<quote_ref>>',
  bodyText: 'Following our review of your requirements, your updated quote is ready to view online.',
  bodyHtml: '', bodyDocument: null, updatedAt: null,
}
export function quoteEmailDraft(template: QuoteEmailTemplate, values: Record<string, string>) {
  const htmlValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeEmailHtml(value)]))
  return {
    subject: applyEmailMergeFields(template.subject, values).replace(/[\r\n]/g, ' '),
    body: applyEmailMergeFields(template.bodyText, values),
    bodyHtml: applyEmailMergeFields(template.bodyHtml, htmlValues),
    bodyDocument: null,
  }
}
