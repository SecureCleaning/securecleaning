import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { parseRichEmailContent } from '@/lib/richEmailServer'
import { findUnsupportedEmailMergeFields } from '@/lib/emailMergeFields'
import { CLEANER_SCOPE_EMAIL_FIELDS, DEFAULT_CLEANER_SCOPE_EMAIL_TEMPLATE, type CleanerScopeEmailTemplate } from '@/lib/cleanerScopeEmailTemplate'
import { writeAuditLogStrict } from '@/lib/auditLog'

export function parseCleanerScopeMessage(input: Record<string, unknown>) {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new ContractProductError('Enter a subject of up to 200 characters without line breaks.')
  if ((typeof input.body === 'string' && input.body.length > 10000) || (typeof input.bodyHtml === 'string' && input.bodyHtml.length > 120000)) throw new ContractProductError('Keep the message within 10,000 characters and its formatting within 120,000 characters.')
  try { return { subject, ...parseRichEmailContent(input, { maxText: 10000 }) } }
  catch { throw new ContractProductError('Enter a valid email message.') }
}
function mapTemplate(row: Record<string, unknown> | null): CleanerScopeEmailTemplate {
  if (!row) return { ...DEFAULT_CLEANER_SCOPE_EMAIL_TEMPLATE }
  return { subject: String(row.subject_template), bodyText: String(row.body_text), bodyHtml: String(row.body_html || ''), bodyDocument: row.body_document as Record<string, unknown> | null, updatedAt: String(row.updated_at) }
}
export async function loadCleanerScopeEmailTemplate() {
  const { data, error } = await getAdminSupabase().from('contract_sale_scope_email_templates').select('*').eq('id', 'default').maybeSingle()
  if (error) throw error
  return mapTemplate(data)
}
export async function manageCleanerScopeEmailTemplate(actor: ContractProductActor, input: Record<string, unknown>) {
  if (actor.role !== 'owner' && actor.role !== 'manager') throw new ContractProductError('Only an owner or manager can edit the cleaner scope email template.', 403)
  if (input.action === 'scope-email-template.get') return { template: await loadCleanerScopeEmailTemplate() }
  if (input.action !== 'scope-email-template.update') throw new ContractProductError('Select a valid template action.')
  const content = parseCleanerScopeMessage({ ...input, body: input.bodyText })
  const unsupported = findUnsupportedEmailMergeFields(new Set(CLEANER_SCOPE_EMAIL_FIELDS.map(field => field.key)), content.subject, content.text, content.html)
  if (unsupported.length) throw new ContractProductError(`Remove unsupported scope email fields: ${unsupported.join(', ')}.`)
  const { data, error } = await getAdminSupabase().from('contract_sale_scope_email_templates').upsert({
    id: 'default', subject_template: content.subject, body_text: content.text, body_html: content.html, body_document: content.document,
    updated_by_staff_id: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  await writeAuditLogStrict('contract_sale_scope_email_template', 'default', 'contract_sale.scope_email_template.updated', { actorId: actor.id })
  return { template: mapTemplate(data) }
}
