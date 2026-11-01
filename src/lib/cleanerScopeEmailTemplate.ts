import { applyEmailMergeFields, type EmailMergeField } from '@/lib/emailMergeFields'
import { escapeEmailHtml } from '@/lib/richEmailContent'

export type CleanerScopeEmailTemplate = {
  subject: string
  bodyText: string
  bodyHtml: string
  bodyDocument: Record<string, unknown> | null
  updatedAt: string | null
}
export const CLEANER_SCOPE_EMAIL_FIELDS: readonly EmailMergeField[] = [
  { key: 'product_code', token: '<<product_code>>', label: 'Product code', description: 'Product reference without customer details' },
  { key: 'cleaner_first_name', token: '<<cleaner_first_name>>', label: 'Cleaner first name', description: 'Cleaner contact first name' },
  { key: 'sender_name', token: '<<sender_name>>', label: 'Sender name', description: 'Sending staff member' },
]
export const DEFAULT_CLEANER_SCOPE_EMAIL_TEMPLATE: CleanerScopeEmailTemplate = {
  subject: 'Secure Cleaning scope of works - <<product_code>>',
  bodyText: 'Hello <<cleaner_first_name>>,\n\nPlease find attached the cleaner scope of works for product <<product_code>>. It lists the rooms, cleaning tasks and frequencies.\n\nPlease reply if you have any questions.\n\nKind regards,\n<<sender_name>>\nSecure Cleaning',
  bodyHtml: '', bodyDocument: null, updatedAt: null,
}
export function cleanerScopeEmailDraft(template: CleanerScopeEmailTemplate, values: Record<string, string>) {
  const htmlValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeEmailHtml(value)]))
  return {
    subject: applyEmailMergeFields(template.subject, values).replace(/[\r\n]/g, ' '),
    body: applyEmailMergeFields(template.bodyText, values),
    bodyHtml: applyEmailMergeFields(template.bodyHtml, htmlValues),
    bodyDocument: null,
  }
}
