import 'server-only'

import { getAdminSupabase } from '@/lib/supabase'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError, getAuthorizedProduct } from '@/lib/contractProducts'
import { getAuthorizedSale } from '@/lib/contractSales'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseNoteTarget(input: Record<string, unknown>) {
  if (input.kind !== 'product' && input.kind !== 'sale') throw new ContractProductError('Select a product or sale.')
  if (typeof input.recordId !== 'string' || !uuid.test(input.recordId)) throw new ContractProductError('A valid record is required.')
  return { kind: input.kind, recordId: input.recordId } as { kind: 'product' | 'sale'; recordId: string }
}

export function parseNote(input: Record<string, unknown>) {
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (!text || text.length > 5000) throw new ContractProductError('Enter a note between 1 and 5,000 characters.')
  if (typeof input.requestId !== 'string' || !uuid.test(input.requestId)) throw new ContractProductError('A valid note request is required.')
  return { text, requestId: input.requestId }
}

async function authorize(actor: ContractProductActor, target: ReturnType<typeof parseNoteTarget>) {
  if (target.kind === 'product') await getAuthorizedProduct(actor, target.recordId)
  else await getAuthorizedSale(actor, target.recordId)
}

function mapNote(row: Record<string, unknown>) {
  const details = row.details as Record<string, unknown>
  return { id: String(row.id), text: String(details.text ?? ''), author: String(details.author ?? 'Staff'), createdAt: String(row.created_at) }
}

export async function getContractNotes(actor: ContractProductActor, input: Record<string, unknown>) {
  const target = parseNoteTarget(input)
  await authorize(actor, target)
  const offset = Number(input.offset ?? 0)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ContractProductError('Invalid notes page.')
  const { data, error } = await getAdminSupabase().from('admin_audit_log').select('id, details, created_at')
    .eq('entity_type', `contract_${target.kind}_note`).eq('entity_ref', target.recordId).eq('action', 'note.added')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 49)
  if (error) throw error
  return (data ?? []).map(mapNote)
}

export async function addContractNote(actor: ContractProductActor, input: Record<string, unknown>) {
  const target = parseNoteTarget(input)
  const note = parseNote(input)
  await authorize(actor, target)
  const db = getAdminSupabase()
  const { data, error } = await db.from('admin_audit_log').insert({
    id: note.requestId, entity_type: `contract_${target.kind}_note`, entity_ref: target.recordId, action: 'note.added',
    details: { text: note.text, author: actor.displayName || actor.username, actorId: actor.id, actorRole: actor.role },
  }).select('id, details, created_at').single()
  if (error?.code === '23505') {
    // A retry after a lost response must not create a second note.
    const existing = await db.from('admin_audit_log').select('id, details, created_at')
      .eq('id', note.requestId).eq('entity_type', `contract_${target.kind}_note`).eq('entity_ref', target.recordId).eq('action', 'note.added').maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data?.details?.actorId === actor.id && existing.data.details.text === note.text) return mapNote(existing.data)
    throw new ContractProductError('This note request has already been used. Reload and try again.', 409)
  }
  if (error) throw error
  return mapNote(data)
}
