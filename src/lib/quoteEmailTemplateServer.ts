import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { parseRichEmailContent } from '@/lib/richEmailServer'
import { findUnsupportedEmailMergeFields } from '@/lib/emailMergeFields'
import { QUOTE_EMAIL_FIELDS, DEFAULT_QUOTE_EMAIL_TEMPLATE, type QuoteEmailTemplate } from '@/lib/quoteEmailTemplate'
import { writeAuditLogStrict } from '@/lib/auditLog'

export function parseQuoteMessage(input: Record<string, unknown>) {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  if (!subject || subject.length > 180 || /[\r\n]/.test(subject)) throw new ContractProductError('Enter a subject of up to 180 characters without line breaks.')
  if ((typeof input.body === 'string' && input.body.length > 4000) || (typeof input.bodyHtml === 'string' && input.bodyHtml.length > 120000)) throw new ContractProductError('Keep the message within 4,000 characters and its formatting within 120,000 characters.')
  try { return { subject, ...parseRichEmailContent(input, { maxText: 4000 }) } }
  catch { throw new ContractProductError('Enter a valid email message.') }
}
function mapTemplate(row: Record<string, unknown> | null): QuoteEmailTemplate {
  if (!row) return { ...DEFAULT_QUOTE_EMAIL_TEMPLATE }
  return { subject: String(row.subject_template), bodyText: String(row.body_text), bodyHtml: String(row.body_html || ''), bodyDocument: row.body_document as Record<string, unknown> | null, updatedAt: String(row.updated_at) }
}
export async function loadQuoteEmailTemplate() {
  const { data, error } = await getAdminSupabase().from('quote_email_templates').select('*').eq('id', 'default').maybeSingle()
  if (error) throw error
  return mapTemplate(data)
}
export async function manageQuoteEmailTemplate(actor: ContractProductActor, input: Record<string, unknown>) {
  if (actor.role !== 'owner' && actor.role !== 'manager') throw new ContractProductError('Only an owner or manager can edit the quote email template.', 403)
  if (input.action === 'quote-email-template.get') return { template: await loadQuoteEmailTemplate() }
  if (input.action !== 'quote-email-template.update') throw new ContractProductError('Select a valid template action.')
  const content = parseQuoteMessage({ ...input, body: input.bodyText })
  const unsupported = findUnsupportedEmailMergeFields(new Set(QUOTE_EMAIL_FIELDS.map(field => field.key)), content.subject, content.text, content.html)
  if (unsupported.length) throw new ContractProductError(`Remove unsupported quote email fields: ${unsupported.join(', ')}.`)
  const { data, error } = await getAdminSupabase().from('quote_email_templates').upsert({
    id: 'default', subject_template: content.subject, body_text: content.text, body_html: content.html, body_document: content.document,
    updated_by_staff_id: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  await writeAuditLogStrict('quote_email_template', 'default', 'quote_email_template.updated', { actorId: actor.id })
  return { template: mapTemplate(data) }
}
