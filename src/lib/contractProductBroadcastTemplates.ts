import 'server-only'

import type { ContractProductActor } from '@/lib/contractProductAuth'
import { findUnsupportedContractProductBroadcastTemplateFields } from '@/lib/contractProductBroadcastTemplateTokens'
import { ContractProductError } from '@/lib/contractProducts'
import { getAdminSupabase } from '@/lib/supabase'
import { parseRichEmailContent } from '@/lib/richEmailServer'

export type ContractProductBroadcastTemplate = {
  id: string
  name: string
  subject: string
  message: string
  messageHtml: string
  messageDocument: Record<string, unknown> | null
  updatedAt: string
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function mapTemplate(row: Record<string, unknown>): ContractProductBroadcastTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    subject: String(row.subject),
    message: String(row.message),
    messageHtml: String(row.message_html ?? ''),
    messageDocument: row.message_document && typeof row.message_document === 'object' ? row.message_document as Record<string, unknown> : null,
    updatedAt: String(row.updated_at),
  }
}

export async function getContractProductBroadcastTemplates() {
  const { data, error } = await getAdminSupabase().from('cleaner_broadcast_templates')
    .select('id, name, subject, message, message_html, message_document, updated_at')
    .eq('status', 'active')
    .order('name')
  if (error) throw error
  return (data ?? []).map((row) => mapTemplate(row as Record<string, unknown>))
}

export async function saveContractProductBroadcastTemplate(
  actor: ContractProductActor,
  input: Record<string, unknown>,
) {
  if (actor.role !== 'owner') {
    throw new ContractProductError('Only the owner can save broadcast templates.', 403)
  }
  const templateId = clean(input.templateId, 80)
  const name = clean(input.name, 80)
  const subject = clean(input.subject, 240)
  let richMessage
  try {
    richMessage = parseRichEmailContent(input, { text: 'message', html: 'messageHtml', document: 'messageDocument', maxText: 20_000, maxHtml: 120_000 })
  } catch (error) {
    throw new ContractProductError(error instanceof Error ? error.message : 'Template message is required.')
  }
  const message = richMessage.text
  if (!name || !subject || !message) {
    throw new ContractProductError('Template name, subject, and message are required.')
  }
  const unsupportedFields = findUnsupportedContractProductBroadcastTemplateFields(subject, message, richMessage.html)
  if (unsupportedFields.length > 0) {
    throw new ContractProductError(`Remove or correct unsupported template fields: ${unsupportedFields.join(', ')}`)
  }

  const db = getAdminSupabase()
  if (templateId) {
    const { data, error } = await db.from('cleaner_broadcast_templates').update({
      name,
      subject,
      message,
      message_html: richMessage.html,
      message_document: richMessage.document,
      updated_by_staff_id: actor.id,
    }).eq('id', templateId).eq('status', 'active')
      .select('id, name, subject, message, message_html, message_document, updated_at').maybeSingle()
    if (error) {
      if (error.code === '23505') throw new ContractProductError('A template with this name already exists.', 409)
      throw error
    }
    if (!data) throw new ContractProductError('The selected template is no longer available.', 404)
    return mapTemplate(data as Record<string, unknown>)
  }

  const { data, error } = await db.from('cleaner_broadcast_templates').insert({
    name,
    subject,
    message,
    message_html: richMessage.html,
    message_document: richMessage.document,
    created_by_staff_id: actor.id,
    updated_by_staff_id: actor.id,
  }).select('id, name, subject, message, message_html, message_document, updated_at').single()
  if (error) {
    if (error.code === '23505') throw new ContractProductError('A template with this name already exists.', 409)
    throw error
  }
  return mapTemplate(data as Record<string, unknown>)
}

export async function archiveContractProductBroadcastTemplate(
  actor: ContractProductActor,
  input: Record<string, unknown>,
) {
  if (actor.role !== 'owner') {
    throw new ContractProductError('Only the owner can archive broadcast templates.', 403)
  }
  const templateId = clean(input.templateId, 80)
  if (!templateId) throw new ContractProductError('Select a template to archive.')
  const { data, error } = await getAdminSupabase().from('cleaner_broadcast_templates').update({
    status: 'archived',
    updated_by_staff_id: actor.id,
  }).eq('id', templateId).eq('status', 'active').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ContractProductError('The selected template is no longer available.', 404)
  return { templateId }
}
