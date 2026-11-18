import { createHash, randomUUID } from 'node:crypto'
import { writeAuditLogStrict } from '@/lib/auditLog'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { ClientCrmError } from '@/lib/clientCrmErrors'
import { validateDocumentContent } from '@/lib/documentContent'
import { getAdminSupabase } from '@/lib/supabase'

export const CRM_TEMPLATE_DOCUMENT_BUCKET = 'crm-template-attachments'
export const CRM_TEMPLATE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const CRM_TEMPLATE_DOCUMENT_MAX_COUNT = 3
export const CRM_TEMPLATE_DOCUMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024

export type CrmTemplateDocument = {
  id: string
  fileName: string
  sizeBytes: number
  sha256: string
  createdAt: string
}

export type CrmTemplateDocumentRecord = CrmTemplateDocument & {
  storagePath: string
  contentType: 'application/pdf'
  status: 'active' | 'archived'
}

function requireDocumentManager(actor: ClientCrmActor) {
  if (actor.role !== 'owner' && actor.role !== 'manager') {
    throw new ClientCrmError('Only an owner or manager can manage template documents.', 403)
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function safePdfName(value: unknown) {
  const cleaned = clean(value, 160)
  const stem = cleaned.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140)
  return `${stem || 'document'}.pdf`
}

function mapDocument(row: Record<string, unknown>): CrmTemplateDocument {
  return {
    id: String(row.id),
    fileName: String(row.file_name ?? ''),
    sizeBytes: Number(row.size_bytes ?? 0),
    sha256: String(row.sha256 ?? ''),
    createdAt: String(row.created_at ?? ''),
  }
}

function mapDocumentRecord(row: Record<string, unknown>): CrmTemplateDocumentRecord {
  return {
    ...mapDocument(row),
    storagePath: String(row.storage_path ?? ''),
    contentType: 'application/pdf',
    status: row.status === 'archived' ? 'archived' : 'active',
  }
}

export function normalizeCrmTemplateDocumentIds(value: unknown) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new ClientCrmError('Choose valid template documents.')
  const ids = value.map((item) => clean(item, 100))
  if (ids.length > CRM_TEMPLATE_DOCUMENT_MAX_COUNT || ids.some((id) => !isUuid(id)) || new Set(ids).size !== ids.length) {
    throw new ClientCrmError(`Choose up to ${CRM_TEMPLATE_DOCUMENT_MAX_COUNT} unique template documents.`)
  }
  return ids
}

export async function createCrmTemplateDocumentUpload(actor: ClientCrmActor, input: Record<string, unknown>) {
  requireDocumentManager(actor)
  const fileName = safePdfName(input.fileName)
  const contentType = clean(input.contentType, 100)
  const sizeBytes = Number(input.sizeBytes)
  if (contentType !== 'application/pdf' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > CRM_TEMPLATE_DOCUMENT_MAX_BYTES) {
    throw new ClientCrmError('Choose a PDF no larger than 10 MB.')
  }

  const documentId = randomUUID()
  const storagePath = `${documentId}/${randomUUID()}-${fileName}`
  const db = getAdminSupabase()
  const { error: insertError } = await db.from('crm_email_template_documents').insert({
    id: documentId,
    file_name: fileName,
    storage_path: storagePath,
    content_type: contentType,
    size_bytes: sizeBytes,
    status: 'pending',
    uploaded_by_staff_id: actor.id,
  })
  if (insertError) throw insertError

  const signed = await db.storage.from(CRM_TEMPLATE_DOCUMENT_BUCKET).createSignedUploadUrl(storagePath, { upsert: false })
  if (signed.error || !signed.data?.token) {
    await db.from('crm_email_template_documents').delete().eq('id', documentId).eq('status', 'pending')
    throw signed.error ?? new Error('Unable to create the private upload URL.')
  }
  return {
    documentId,
    bucket: CRM_TEMPLATE_DOCUMENT_BUCKET,
    path: signed.data.path,
    token: signed.data.token,
  }
}

async function discardPendingDocument(documentId: string, storagePath: string) {
  const db = getAdminSupabase()
  await db.storage.from(CRM_TEMPLATE_DOCUMENT_BUCKET).remove([storagePath])
  await db.from('crm_email_template_documents').delete().eq('id', documentId).eq('status', 'pending')
}

export async function finalizeCrmTemplateDocumentUpload(actor: ClientCrmActor, input: Record<string, unknown>) {
  requireDocumentManager(actor)
  const documentId = clean(input.documentId, 100)
  if (!isUuid(documentId)) throw new ClientCrmError('Invalid template document reference.')
  const db = getAdminSupabase()
  const { data: document, error } = await db.from('crm_email_template_documents')
    .select('id,file_name,storage_path,content_type,size_bytes,sha256,status,created_at,uploaded_by_staff_id')
    .eq('id', documentId)
    .eq('uploaded_by_staff_id', actor.id)
    .maybeSingle()
  if (error) throw error
  if (!document) throw new ClientCrmError('Template document upload not found.', 404)
  if (document.status === 'active' && document.sha256) return mapDocument(document)
  if (document.status !== 'pending') throw new ClientCrmError('Template document upload is no longer available.', 409)

  const download = await db.storage.from(CRM_TEMPLATE_DOCUMENT_BUCKET).download(document.storage_path)
  if (download.error || !download.data) throw new ClientCrmError('Finish uploading the PDF before saving it.', 409)
  const bytes = Buffer.from(await download.data.arrayBuffer())
  let validated: ReturnType<typeof validateDocumentContent>
  try {
    validated = validateDocumentContent(bytes, document.file_name, document.content_type)
    if (validated.contentType !== 'application/pdf' || validated.sizeBytes !== Number(document.size_bytes)) {
      throw new Error('The uploaded file did not match the selected PDF.')
    }
  } catch (validationError) {
    await discardPendingDocument(documentId, document.storage_path)
    throw new ClientCrmError(validationError instanceof Error ? validationError.message : 'Upload a valid PDF no larger than 10 MB.')
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data: finalized, error: updateError } = await db.from('crm_email_template_documents').update({
    file_name: validated.fileName,
    content_type: validated.contentType,
    size_bytes: validated.sizeBytes,
    sha256,
    status: 'active',
    finalized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', documentId).eq('status', 'pending').select('id,file_name,size_bytes,sha256,created_at').single()
  if (updateError) throw updateError
  await writeAuditLogStrict('crm_email_template_document', documentId, 'crm.template_document.uploaded', {
    actorId: actor.id,
    fileName: validated.fileName,
    sizeBytes: validated.sizeBytes,
    sha256,
  })
  return mapDocument(finalized)
}

export async function getCrmTemplateDocumentsForVersion(templateId: string, templateVersion: number) {
  const db = getAdminSupabase()
  const links = await db.from('crm_email_template_version_documents')
    .select('document_id,position')
    .eq('template_id', templateId)
    .eq('template_version', templateVersion)
    .order('position', { ascending: true })
  if (links.error) throw links.error
  const documentIds = (links.data ?? []).map((link) => String(link.document_id))
  if (documentIds.length === 0) return []
  const documents = await db.from('crm_email_template_documents')
    .select('id,file_name,storage_path,content_type,size_bytes,sha256,status,created_at')
    .in('id', documentIds)
    .in('status', ['active', 'archived'])
  if (documents.error) throw documents.error
  const byId = new Map((documents.data ?? []).map((document) => [String(document.id), mapDocumentRecord(document)]))
  const ordered = documentIds.map((id) => byId.get(id)).filter((document): document is CrmTemplateDocumentRecord => Boolean(document?.sha256))
  if (ordered.length !== documentIds.length) throw new ClientCrmError('One or more automatic template attachments are unavailable.', 409)
  return ordered
}

export async function loadCrmTemplateDocumentContents(documents: CrmTemplateDocumentRecord[]) {
  const db = getAdminSupabase()
  const loaded = []
  for (const document of documents) {
    const download = await db.storage.from(CRM_TEMPLATE_DOCUMENT_BUCKET).download(document.storagePath)
    if (download.error || !download.data) throw new ClientCrmError(`The attachment ${document.fileName} is unavailable.`, 409)
    const content = Buffer.from(await download.data.arrayBuffer())
    const sha256 = createHash('sha256').update(content).digest('hex')
    if (content.length !== document.sizeBytes || sha256 !== document.sha256) {
      throw new ClientCrmError(`The attachment ${document.fileName} changed after it was approved. Upload a new version before sending.`, 409)
    }
    loaded.push({
      documentId: document.id,
      filename: document.fileName,
      content,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
    })
  }
  return loaded
}

export async function downloadCrmTemplateDocument(actor: ClientCrmActor, input: {
  documentId: string
  templateId: string
  templateVersion: number
}) {
  if (!isUuid(input.documentId) || !isUuid(input.templateId) || !Number.isSafeInteger(input.templateVersion) || input.templateVersion < 1) {
    throw new ClientCrmError('Invalid template attachment reference.')
  }
  const db = getAdminSupabase()
  const template = await db.from('crm_email_templates')
    .select('id,visibility,created_by_staff_id')
    .eq('id', input.templateId)
    .maybeSingle()
  if (template.error) throw template.error
  if (!template.data || (template.data.visibility === 'personal' && template.data.created_by_staff_id !== actor.id)) {
    throw new ClientCrmError('Template attachment not found.', 404)
  }
  const link = await db.from('crm_email_template_version_documents')
    .select('document_id')
    .eq('template_id', input.templateId)
    .eq('template_version', input.templateVersion)
    .eq('document_id', input.documentId)
    .maybeSingle()
  if (link.error) throw link.error
  if (!link.data) throw new ClientCrmError('Template attachment not found.', 404)
  const documents = await getCrmTemplateDocumentsForVersion(input.templateId, input.templateVersion)
  const document = documents.find((item) => item.id === input.documentId)
  if (!document) throw new ClientCrmError('Template attachment not found.', 404)
  const [loaded] = await loadCrmTemplateDocumentContents([document])
  return loaded
}
