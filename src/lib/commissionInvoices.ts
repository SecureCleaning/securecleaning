import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { invoiceFileType, validateCommissionInvoice } from '@/lib/commissionInvoiceInput'
const bucket = 'commission-invoices'
export async function receiveCommissionInvoice(actor: ClientCrmActor, form: FormData) {
  if (actor.role !== 'owner') throw new ContractProductError('Only the owner can record an invoice received.', 403)
  let input
  try { input = validateCommissionInvoice(JSON.parse(String(form.get('invoice') || '{}'))) }
  catch (error) { throw new ContractProductError(error instanceof Error ? error.message : 'Invalid invoice details.') }
  const file = form.get('file')
  let storagePath: string | null = null
  let contentType: string | null = null
  const db = getAdminSupabase()
  if (file instanceof File && file.size) {
    if (file.size > 3 * 1024 * 1024) throw new ContractProductError('Invoice attachment must be 3 MB or smaller.')
    const bytes = Buffer.from(await file.arrayBuffer())
    let format
    try { format = invoiceFileType(bytes) } catch { throw new ContractProductError('Upload a PDF, PNG or JPEG invoice.') }
    contentType = format.type
    storagePath = `${input.agentId}/${input.requestId}/${createHash('sha256').update(bytes).digest('hex')}.${format.extension}`
    const { error } = await db.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: false })
    // Content-addressed immutable uploads allow a safe retry after a lost response.
    if (error && !['409', 'Duplicate'].includes(String((error as { statusCode?: string }).statusCode)) && !/already exists|duplicate/i.test(error.message)) throw new ContractProductError('Unable to upload invoice. Please retry.', 503)
  }
  const { data, error } = await db.rpc('record_received_commission_invoice', { p_actor_id: actor.id, p_input: { ...input, storagePath, contentType } })
  // Keep an upload on uncertain outcomes; deleting could remove a committed invoice attachment.
  if (error) throw new ContractProductError(error.code === '42501' ? 'Owner access required.' : 'Invoice not recorded: check for an existing reference, refresh available balances and retry.', error.code === '42501' ? 403 : 409)
  return data
}
export async function downloadCommissionInvoice(actor: ClientCrmActor, id: string) {
  if (!['owner', 'agent'].includes(actor.role)) throw new ContractProductError('Commission access required.', 403)
  const db = getAdminSupabase()
  let query = db.from('contract_commission_received_invoices').select('agent_id,storage_path,content_type').eq('id', id)
  if (actor.role === 'agent') query = query.eq('agent_id', actor.id)
  const { data, error } = await query.maybeSingle()
  if (error || !data?.storage_path) throw new ContractProductError('Invoice attachment not found.', 404)
  const result = await db.storage.from(bucket).download(data.storage_path)
  if (result.error || !result.data) throw new ContractProductError('Unable to download invoice.', 503)
  return { blob: result.data, type: String(data.content_type), extension: data.content_type === 'application/pdf' ? 'pdf' : data.content_type === 'image/png' ? 'png' : 'jpg' }
}
