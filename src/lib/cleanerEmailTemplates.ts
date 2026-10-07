import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import { writeAuditLog } from '@/lib/auditLog'
import type { AdminSessionIdentity } from '@/lib/adminAuth'
import type { CleanerEmailTemplate } from '@/lib/cleaners'
import { parseRichEmailContent } from '@/lib/richEmailServer'
import { CLEANER_EMAIL_MERGE_FIELD_KEYS, findUnsupportedEmailMergeFields } from '@/lib/emailMergeFields'

const columns = 'id, name, description, subject, body, body_html, body_document, is_active, created_at, updated_at'

export function parseCleanerTemplate(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid template.')
  const value = input as Record<string, unknown>
  const read = (key: string, max: number, required = true) => {
    const text = typeof value[key] === 'string' ? value[key].trim() : ''
    if ((required && !text) || text.length > max) throw new Error(`Enter a valid ${key} (up to ${max} characters).`)
    return text
  }
  const id = read('id', 36, false)
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid template ID.')
  const name = read('name', 120)
  const description = read('description', 500, false)
  const subject = read('subject', 240)
  if (/[\r\n]/.test(subject)) throw new Error('Subject must be a single line.')
  if (typeof value.is_active !== 'boolean') throw new Error('Choose an active or archived status.')
  for (const [key, max] of [['body', 20000], ['bodyHtml', 120000]] as const) {
    if (typeof value[key] === 'string' && value[key].length > max) throw new Error('Message content is too large.')
  }
  const content = parseRichEmailContent(value)
  const unsupported = findUnsupportedEmailMergeFields(CLEANER_EMAIL_MERGE_FIELD_KEYS, subject, content.text, content.html)
  if (unsupported.length) throw new Error(`Unsupported database fields: ${unsupported.join(', ')}`)
  return { id, row: { name, description, subject, body: content.text, body_html: content.html, body_document: content.document, is_active: value.is_active } }
}

export async function listCleanerEmailTemplates() {
  const { data, error } = await getAdminSupabase().from('cleaner_email_templates').select(columns).order('name')
  if (error) throw new Error('Unable to load cleaner templates. Check the cleaner email migrations have been applied.')
  return (data ?? []) as CleanerEmailTemplate[]
}

export async function saveCleanerEmailTemplate(input: unknown, actor: AdminSessionIdentity) {
  const { id, row } = parseCleanerTemplate(input)
  const table = getAdminSupabase().from('cleaner_email_templates')
  const { data, error } = await (id ? table.update(row).eq('id', id) : table.insert(row)).select(columns).single()
  if (error || !data) throw new Error(error?.code === '23505' ? 'A template with this name already exists. Choose another name.' : 'Unable to save template. Reload and check the cleaner email migrations have been applied.')
  await writeAuditLog('cleaner_email_template', data.id, id ? 'updated' : 'created', { actorId: actor.id, actorUsername: actor.username, isActive: row.is_active })
  return data as CleanerEmailTemplate
}
