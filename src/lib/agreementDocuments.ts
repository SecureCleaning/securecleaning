import { randomUUID } from 'crypto'
import { getAdminSupabase } from '@/lib/supabase'
import { getAuthorizedSale } from '@/lib/contractSales'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { assertAgreementPdf, parseDocumentCorrection } from '@/lib/agreementDocumentPolicy'

function requireAdmin(actor: ContractProductActor) {
  if (!['owner', 'manager'].includes(actor.role)) throw new ContractProductError('Only an owner or manager can manage signed documents.', 403)
}
const evidence = (value: unknown) => (value ?? {}) as { file_name?: string; storage_path?: string }
export async function getAgreementDocuments(actor: ContractProductActor, saleId: string, agreementId: string) {
  requireAdmin(actor)
  const sale = await getAuthorizedSale(actor, saleId)
  const db = getAdminSupabase()
  const { data: agreements, error } = await db.from('contract_sale_agreements').select('id,version,status,signed_file_name,signed_storage_path,document_revision').eq('sale_id', saleId)
  const agreement = agreements?.find(row => row.id === agreementId)
  if (error || !agreement) throw new ContractProductError('Agreement not found.', 404)
  const { data: rows, error: historyError } = await db.from('contract_sale_agreement_document_events').select('id,agreement_id,action,reason,actor_name,target_id,before_evidence,after_evidence,created_at').eq('sale_id', saleId).order('created_at', { ascending: false })
  if (historyError) throw historyError
  const history = (rows ?? []).map(row => ({ id: row.id, agreementId: row.agreement_id, version: agreements?.find(agreement => agreement.id === row.agreement_id)?.version, action: row.action, reason: row.reason, actor: row.actor_name, targetId: row.target_id, createdAt: row.created_at, beforeName: evidence(row.before_evidence).file_name ?? null, afterName: evidence(row.after_evidence).file_name ?? null }))
  return { agreements: (agreements ?? []).map(row => ({ id: row.id, version: row.version, status: row.status })), revision: agreement.document_revision, currentName: agreement.signed_file_name, status: agreement.status, canReplace: agreement.status !== 'void' && Boolean(agreement.signed_storage_path || history.some(row => row.agreementId === agreementId && row.action === 'remove')), history, reviewRequired: !agreement.signed_storage_path && history.some(row => row.agreementId === agreementId && row.action === 'remove'), handoverCompleted: Boolean(sale.handover_at) }
}

export async function correctAgreementDocument(actor: ContractProductActor, form: FormData) {
  requireAdmin(actor)
  let parsed
  try { parsed = parseDocumentCorrection(form.get('action'), form.get('reason'), form.get('revision')) } catch (error) { throw new ContractProductError((error as Error).message) }
  const saleId = String(form.get('saleId') ?? '')
  const agreementId = String(form.get('agreementId') ?? '')
  await getAuthorizedSale(actor, saleId)
  const db = getAdminSupabase()
  const { data: agreement, error } = await db.from('contract_sale_agreements').select('signed_storage_path,document_revision').eq('id', agreementId).eq('sale_id', saleId).single()
  if (error || !agreement) throw new ContractProductError('Agreement not found.', 404)
  if (agreement.document_revision !== parsed.revision) throw new ContractProductError('Documents changed. Refresh and review before retrying.', 409)
  let path: string | null = null
  let name: string | null = null
  if (parsed.action === 'replace' || parsed.action === 'support') {
    const file = form.get('file')
    if (!(file instanceof File)) throw new ContractProductError('Choose a PDF to upload.')
    if (file.size > 10 * 1024 * 1024) throw new ContractProductError('Upload a PDF smaller than 10 MB.')
    const bytes = Buffer.from(await file.arrayBuffer())
    try { assertAgreementPdf(file, bytes) } catch (error) { throw new ContractProductError((error as Error).message) }
    name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'agreement.pdf'
    path = `${saleId}/${agreementId}/${randomUUID()}-${name}`
    const { error: uploadError } = await db.storage.from('contract-sale-agreements').upload(path, bytes, { contentType: 'application/pdf', upsert: false })
    if (uploadError) throw uploadError
  }
  // On an ambiguous network failure retain the private object: the transaction may have committed.
  const { data, error: correctionError } = await db.rpc('correct_contract_sale_agreement_document', {
    p_actor_id: actor.id, p_sale_id: saleId, p_agreement_id: agreementId, p_action: parsed.action, p_reason: parsed.reason,
    p_expected_revision: parsed.revision, p_expected_path: agreement.signed_storage_path,
    p_file_name: name, p_storage_path: path, p_target_id: form.get('targetId') || null,
  })
  if (correctionError) throw new ContractProductError(correctionError.code === '42501' ? 'Admin access required.' : 'Document change could not be confirmed. Refresh the document history before retrying.', correctionError.code === '42501' ? 403 : 409)
  return { id: data }
}

export async function downloadAgreementHistory(actor: ContractProductActor, saleId: string, agreementId: string, eventId: string, side: string) {
  requireAdmin(actor)
  await getAuthorizedSale(actor, saleId)
  if (!['before', 'after'].includes(side)) throw new ContractProductError('Invalid document selection.')
  const db = getAdminSupabase()
  const { data, error } = await db.from('contract_sale_agreement_document_events').select('before_evidence,after_evidence').eq('sale_id', saleId).eq('agreement_id', agreementId).eq('id', eventId).single()
  if (error || !data) throw new ContractProductError('Document not found.', 404)
  const doc = evidence(side === 'before' ? data.before_evidence : data.after_evidence)
  if (!doc.storage_path) throw new ContractProductError('Document not found.', 404)
  const { data: blob, error: downloadError } = await db.storage.from('contract-sale-agreements').download(doc.storage_path)
  if (downloadError) throw downloadError
  return { blob, name: (doc.file_name || 'agreement.pdf').replace(/[^a-zA-Z0-9._-]/g, '-') }
}
