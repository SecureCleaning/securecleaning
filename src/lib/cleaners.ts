import { getAdminSupabase } from '@/lib/supabase'
import { sendEmailWithResult } from '@/lib/email'
import { writeAuditLog } from '@/lib/auditLog'
import type { AdminSessionIdentity } from '@/lib/adminAuth'

export type CleanerStatus = 'lead' | 'pending_approval' | 'approved' | 'paused' | 'rejected' | 'inactive'
export type CleanerEmailStatus = 'draft' | 'sent' | 'failed' | 'delivered' | 'opened' | 'clicked' | 'bounced'
export type CleanerDocumentType = 'insurance' | 'police_check' | 'induction' | 'contract' | 'other'

export interface CleanerRecord {
  id: string
  business_name: string
  first_name?: string | null
  last_name?: string | null
  contact_name: string
  email: string
  phone?: string | null
  alternate_phone?: string | null
  address?: string | null
  suburb?: string | null
  postcode?: string | null
  city?: string | null
  state?: string | null
  abn?: string | null
  status: CleanerStatus
  services: string[]
  service_areas: string[]
  preferred_work?: string | null
  compliance_status?: string | null
  insurance_expiry?: string | null
  police_check_expiry?: string | null
  induction_expiry?: string | null
  working_with_children_check?: boolean | null
  internal_owner?: string | null
  rating?: number | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface CleanerComment {
  id: string
  cleaner_id: string
  author_name: string
  comment: string
  created_at: string
}

export interface CleanerEmailTemplate {
  id: string
  name: string
  description?: string | null
  subject: string
  body: string
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface CleanerEmail {
  id: string
  cleaner_id: string
  template_id?: string | null
  template_name?: string | null
  to_email: string
  subject: string
  body: string
  status: CleanerEmailStatus
  provider_message_id?: string | null
  error_message?: string | null
  sent_by?: string | null
  sent_at?: string | null
  delivered_at?: string | null
  opened_at?: string | null
  clicked_at?: string | null
  created_at?: string | null
}

export interface CleanerDocument {
  id: string
  cleaner_id: string
  document_type: CleanerDocumentType
  file_name: string
  storage_path: string
  content_type?: string | null
  size_bytes?: number | null
  expiry_date?: string | null
  notes?: string | null
  uploaded_by?: string | null
  created_at?: string | null
}

export interface CleanerPayload {
  businessName: string
  firstName?: string | null
  lastName?: string | null
  contactName: string
  email: string
  phone?: string | null
  alternatePhone?: string | null
  address?: string | null
  suburb?: string | null
  postcode?: string | null
  city?: string | null
  state?: string | null
  abn?: string | null
  status?: CleanerStatus
  services?: string[]
  serviceAreas?: string[]
  preferredWork?: string | null
  complianceStatus?: string | null
  insuranceExpiry?: string | null
  policeCheckExpiry?: string | null
  inductionExpiry?: string | null
  workingWithChildrenCheck?: boolean | null
  internalOwner?: string | null
  rating?: number | null
  notes?: string | null
}

export interface CleanerImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export interface CleanerFilters {
  query?: string
  city?: string
  state?: string
  status?: string
  service?: string
  compliance?: string
  wwcc?: string
  expiry?: string
  limit?: number
  page?: number
  pageSize?: number
}

export interface CleanerSearchResult {
  cleaners: CleanerRecord[]
  total: number
  page: number
  pageSize: number
}

export type CleanerAuditActor = Pick<AdminSessionIdentity, 'id' | 'username' | 'role'>

const CLEANER_SELECT =
  'id, business_name, first_name, last_name, contact_name, email, phone, alternate_phone, address, suburb, postcode, city, state, abn, status, services, service_areas, preferred_work, compliance_status, insurance_expiry, police_check_expiry, induction_expiry, working_with_children_check, internal_owner, rating, notes, created_at, updated_at'

const COMMENT_SELECT = 'id, cleaner_id, author_name, comment, created_at'
const TEMPLATE_SELECT = 'id, name, description, subject, body, is_active, created_at, updated_at'
const EMAIL_SELECT =
  'id, cleaner_id, template_id, template_name, to_email, subject, body, status, provider_message_id, error_message, sent_by, sent_at, delivered_at, opened_at, clicked_at, created_at'
const DOCUMENT_SELECT =
  'id, cleaner_id, document_type, file_name, storage_path, content_type, size_bytes, expiry_date, notes, uploaded_by, created_at'
const CLEANER_DOCUMENT_BUCKET = 'cleaner-documents'
const CLEANER_CSV_COLUMNS: Array<{ key: keyof CleanerRecord; label: string }> = [
  { key: 'business_name', label: 'business_name' },
  { key: 'first_name', label: 'first_name' },
  { key: 'last_name', label: 'last_name' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'alternate_phone', label: 'alternate_phone' },
  { key: 'address', label: 'address' },
  { key: 'suburb', label: 'suburb' },
  { key: 'postcode', label: 'postcode' },
  { key: 'city', label: 'city' },
  { key: 'state', label: 'state' },
  { key: 'abn', label: 'abn' },
  { key: 'status', label: 'status' },
  { key: 'services', label: 'services' },
  { key: 'service_areas', label: 'service_areas' },
  { key: 'preferred_work', label: 'preferred_work' },
  { key: 'compliance_status', label: 'compliance_status' },
  { key: 'insurance_expiry', label: 'insurance_expiry' },
  { key: 'police_check_expiry', label: 'police_check_expiry' },
  { key: 'induction_expiry', label: 'induction_expiry' },
  { key: 'working_with_children_check', label: 'working_with_children_check' },
  { key: 'internal_owner', label: 'internal_owner' },
  { key: 'rating', label: 'rating' },
  { key: 'notes', label: 'notes' },
]

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function withActorDetails(actor: CleanerAuditActor, details: Record<string, unknown> = {}) {
  return {
    ...details,
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
  }
}

function nullableString(value: unknown, maxLength = 500) {
  const cleaned = cleanString(value, maxLength)
  return cleaned || null
}

function cleanArray(value: unknown, maxItems = 30, maxLength = 80) {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => cleanString(item, maxLength))
        .filter(Boolean)
    )
  ).slice(0, maxItems)
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function isCleanerStatus(value: unknown): value is CleanerStatus {
  return ['lead', 'pending_approval', 'approved', 'paused', 'rejected', 'inactive'].includes(String(value))
}

function isCleanerDocumentType(value: unknown): value is CleanerDocumentType {
  return ['insurance', 'police_check', 'induction', 'contract', 'other'].includes(String(value))
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toDbPayload(payload: Partial<CleanerPayload>) {
  const status = isCleanerStatus(payload.status) ? payload.status : undefined
  const firstName = payload.firstName !== undefined ? cleanString(payload.firstName, 80) : undefined
  const lastName = payload.lastName !== undefined ? cleanString(payload.lastName, 80) : undefined
  const joinedName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const contactName = payload.contactName !== undefined
    ? cleanString(payload.contactName, 160)
    : joinedName || undefined

  return {
    business_name: payload.businessName !== undefined ? cleanString(payload.businessName, 160) : undefined,
    first_name: firstName,
    last_name: lastName,
    contact_name: contactName,
    email: payload.email !== undefined ? cleanString(payload.email, 254).toLowerCase() : undefined,
    phone: payload.phone !== undefined ? nullableString(payload.phone, 40) : undefined,
    alternate_phone: payload.alternatePhone !== undefined ? nullableString(payload.alternatePhone, 40) : undefined,
    address: payload.address !== undefined ? nullableString(payload.address, 240) : undefined,
    suburb: payload.suburb !== undefined ? nullableString(payload.suburb, 80) : undefined,
    postcode: payload.postcode !== undefined ? nullableString(payload.postcode, 12) : undefined,
    city: payload.city !== undefined ? nullableString(payload.city, 40) : undefined,
    state: payload.state !== undefined ? nullableString(payload.state, 8)?.toUpperCase() ?? null : undefined,
    abn: payload.abn !== undefined ? nullableString(payload.abn, 40) : undefined,
    status,
    services: payload.services !== undefined ? cleanArray(payload.services) : undefined,
    service_areas: payload.serviceAreas !== undefined ? cleanArray(payload.serviceAreas) : undefined,
    preferred_work: payload.preferredWork !== undefined ? nullableString(payload.preferredWork, 800) : undefined,
    compliance_status: payload.complianceStatus !== undefined ? nullableString(payload.complianceStatus, 80) : undefined,
    insurance_expiry: payload.insuranceExpiry || null,
    police_check_expiry: payload.policeCheckExpiry || null,
    induction_expiry: payload.inductionExpiry || null,
    working_with_children_check: payload.workingWithChildrenCheck !== undefined ? Boolean(payload.workingWithChildrenCheck) : undefined,
    internal_owner: payload.internalOwner !== undefined ? nullableString(payload.internalOwner, 120) : undefined,
    rating: typeof payload.rating === 'number' ? payload.rating : null,
    notes: payload.notes !== undefined ? nullableString(payload.notes, 2000) : undefined,
  }
}

function normaliseCleanerImportPayload(record: Partial<CleanerPayload>): CleanerPayload {
  const firstName = cleanString(record.firstName, 80)
  const lastName = cleanString(record.lastName, 80)
  return {
    businessName: cleanString(record.businessName, 160),
    firstName,
    lastName,
    contactName: cleanString(record.contactName, 160) || [firstName, lastName].filter(Boolean).join(' '),
    email: cleanString(record.email, 254).toLowerCase(),
    phone: nullableString(record.phone, 40),
    alternatePhone: nullableString(record.alternatePhone, 40),
    address: nullableString(record.address, 240),
    suburb: nullableString(record.suburb, 80),
    postcode: nullableString(record.postcode, 12),
    city: nullableString(record.city, 40),
    state: nullableString(record.state, 8),
    abn: nullableString(record.abn, 40),
    status: isCleanerStatus(record.status) ? record.status : 'lead',
    services: cleanArray(record.services),
    serviceAreas: cleanArray(record.serviceAreas),
    preferredWork: nullableString(record.preferredWork, 800),
    complianceStatus: nullableString(record.complianceStatus, 80),
    insuranceExpiry: record.insuranceExpiry || null,
    policeCheckExpiry: record.policeCheckExpiry || null,
    inductionExpiry: record.inductionExpiry || null,
    workingWithChildrenCheck: Boolean(record.workingWithChildrenCheck),
    internalOwner: nullableString(record.internalOwner, 120),
    rating: typeof record.rating === 'number' ? record.rating : null,
    notes: nullableString(record.notes, 2000),
  }
}

function assertCleanerPayload(payload: Partial<CleanerPayload>) {
  if (!cleanString(payload.businessName, 160)) {
    throw new Error('Business name is required.')
  }
  if (!cleanString(payload.firstName, 80)) {
    throw new Error('First name is required.')
  }
  if (!cleanString(payload.lastName, 80)) {
    throw new Error('Surname is required.')
  }
  const email = cleanString(payload.email, 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email is required.')
  }
}

export async function searchCleanerPage(filters: CleanerFilters = {}): Promise<CleanerSearchResult> {
  const db = getAdminSupabase()
  const pageSize = Math.min(Math.max(filters.pageSize ?? filters.limit ?? 80, 1), 200)
  const page = Math.max(filters.page ?? 1, 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayDate = formatDateOnly(today)
  const soon = new Date(today)
  soon.setDate(soon.getDate() + 30)
  const soonDate = formatDateOnly(soon)
  let query = db
    .from('cleaners')
    .select(CLEANER_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })

  const search = cleanString(filters.query, 120)
  if (search) {
    const escaped = search.replace(/[%_]/g, '\\$&')
    query = query.or(
      [
        `business_name.ilike.%${escaped}%`,
        `first_name.ilike.%${escaped}%`,
        `last_name.ilike.%${escaped}%`,
        `contact_name.ilike.%${escaped}%`,
        `email.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
        `alternate_phone.ilike.%${escaped}%`,
        `suburb.ilike.%${escaped}%`,
        `postcode.ilike.%${escaped}%`,
        `city.ilike.%${escaped}%`,
        `state.ilike.%${escaped}%`,
        `abn.ilike.%${escaped}%`,
      ].join(',')
    )
  }

  if (filters.city && filters.city !== 'all') {
    query = query.eq('city', filters.city)
  }
  if (filters.state && filters.state !== 'all') {
    query = query.eq('state', filters.state)
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.service && filters.service !== 'all') {
    query = query.contains('services', [filters.service])
  }
  if (filters.compliance && filters.compliance !== 'all') {
    query = query.eq('compliance_status', filters.compliance)
  }
  if (filters.wwcc === 'checked') {
    query = query.eq('working_with_children_check', true)
  }
  if (filters.wwcc === 'missing') {
    query = query.eq('working_with_children_check', false)
  }
  if (filters.expiry === 'any_expired') {
    query = query.or(`insurance_expiry.lte.${todayDate},police_check_expiry.lte.${todayDate},induction_expiry.lte.${todayDate}`)
  }
  if (filters.expiry === 'any_expiring_30') {
    query = query.or([
      `and(insurance_expiry.gte.${todayDate},insurance_expiry.lte.${soonDate})`,
      `and(police_check_expiry.gte.${todayDate},police_check_expiry.lte.${soonDate})`,
      `and(induction_expiry.gte.${todayDate},induction_expiry.lte.${soonDate})`,
    ].join(','))
  }
  if (filters.expiry === 'insurance_expired') {
    query = query.lte('insurance_expiry', todayDate)
  }
  if (filters.expiry === 'police_expired') {
    query = query.lte('police_check_expiry', todayDate)
  }
  if (filters.expiry === 'induction_expired') {
    query = query.lte('induction_expiry', todayDate)
  }

  const { data, error, count } = await query.range(from, to)
  if (error) {
    console.error('[cleaners] Failed to search cleaners:', error)
    return { cleaners: [], total: 0, page, pageSize }
  }

  return {
    cleaners: (data ?? []) as CleanerRecord[],
    total: count ?? data?.length ?? 0,
    page,
    pageSize,
  }
}

export async function searchCleaners(filters: CleanerFilters = {}) {
  const result = await searchCleanerPage(filters)
  return result.cleaners
}

export async function getCleanerTemplates() {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('cleaner_email_templates')
    .select(TEMPLATE_SELECT)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('[cleaners] Failed to load templates:', error)
    return [] as CleanerEmailTemplate[]
  }

  return (data ?? []) as CleanerEmailTemplate[]
}

export async function getCleanerDetail(cleanerId: string) {
  const db = getAdminSupabase()
  const [{ data: cleaner, error: cleanerError }, { data: comments }, { data: emails }, { data: documents }] = await Promise.all([
    db.from('cleaners').select(CLEANER_SELECT).eq('id', cleanerId).single(),
    db.from('cleaner_comments').select(COMMENT_SELECT).eq('cleaner_id', cleanerId).order('created_at', { ascending: false }).limit(30),
    db.from('cleaner_emails').select(EMAIL_SELECT).eq('cleaner_id', cleanerId).order('created_at', { ascending: false }).limit(30),
    db.from('cleaner_documents').select(DOCUMENT_SELECT).eq('cleaner_id', cleanerId).order('created_at', { ascending: false }).limit(50),
  ])

  if (cleanerError) {
    throw cleanerError
  }

  return {
    cleaner: cleaner as CleanerRecord,
    comments: (comments ?? []) as CleanerComment[],
    emails: (emails ?? []) as CleanerEmail[],
    documents: (documents ?? []) as CleanerDocument[],
  }
}

export async function getCleanerAdminData() {
  const [cleanerPage, templates] = await Promise.all([
    searchCleanerPage({ page: 1, pageSize: 50 }),
    getCleanerTemplates(),
  ])
  const cleaners = cleanerPage.cleaners

  let selected = null as Awaited<ReturnType<typeof getCleanerDetail>> | null
  if (cleaners[0]?.id) {
    try {
      selected = await getCleanerDetail(cleaners[0].id)
    } catch (error) {
      console.error('[cleaners] Failed to load selected cleaner:', error)
    }
  }

  return { cleaners, templates, selected, total: cleanerPage.total, page: cleanerPage.page, pageSize: cleanerPage.pageSize }
}

export async function deleteSampleCleaners(actor: CleanerAuditActor) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('cleaners')
    .delete()
    .ilike('email', 'sample.cleaner.%@example.com')
    .select('id')

  if (error) {
    throw error
  }

  const deletedCount = data?.length ?? 0
  await writeAuditLog('cleaner', 'sample-cleaners', 'cleaner.sample_data.deleted', withActorDetails(actor, { deletedCount }))
  return deletedCount
}

function csvCell(value: unknown) {
  const normalised = Array.isArray(value)
    ? value.join('; ')
    : typeof value === 'boolean'
      ? value ? 'yes' : 'no'
      : value == null
        ? ''
        : String(value)
  return `"${normalised.replace(/"/g, '""')}"`
}

export async function exportCleanersCsv(actor: CleanerAuditActor) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('cleaners')
    .select(CLEANER_SELECT)
    .order('updated_at', { ascending: false })
    .limit(5000)

  if (error) {
    throw error
  }

  const header = CLEANER_CSV_COLUMNS.map((column) => csvCell(column.label)).join(',')
  const cleanerRows = (data ?? []) as CleanerRecord[]
  const rows = cleanerRows.map((cleaner) =>
    CLEANER_CSV_COLUMNS.map((column) => csvCell(cleaner[column.key])).join(',')
  )

  await writeAuditLog('cleaner', 'bulk-export', 'cleaner.exported', withActorDetails(actor, { count: cleanerRows.length }))
  return [header, ...rows].join('\n')
}

export async function importCleaners(
  records: Array<Partial<CleanerPayload>>,
  actor: CleanerAuditActor,
): Promise<CleanerImportResult> {
  if (!Array.isArray(records)) {
    throw new Error('Cleaner import must be an array of records.')
  }

  const result: CleanerImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }
  const prepared: CleanerPayload[] = []
  const seenEmails = new Set<string>()

  records.slice(0, 4000).forEach((record, index) => {
    try {
      const payload = normaliseCleanerImportPayload(record)
      assertCleanerPayload(payload)
      if (seenEmails.has(payload.email)) {
        result.skipped += 1
        result.errors.push(`Row ${index + 2}: duplicate email in CSV (${payload.email}).`)
        return
      }
      seenEmails.add(payload.email)
      prepared.push(payload)
    } catch (error) {
      result.skipped += 1
      result.errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid cleaner record.'}`)
    }
  })

  if (prepared.length === 0) {
    return result
  }

  const db = getAdminSupabase()
  const emails = prepared.map((record) => record.email)
  const { data: existingRows, error: existingError } = await db
    .from('cleaners')
    .select('id, email')
    .in('email', emails)

  if (existingError) {
    throw existingError
  }

  const existingByEmail = new Map((existingRows ?? []).map((row) => [String(row.email).toLowerCase(), String(row.id)]))
  const inserts = prepared.filter((record) => !existingByEmail.has(record.email)).map((record) => ({
    ...toDbPayload(record),
    status: record.status ?? 'lead',
    services: record.services ?? [],
    service_areas: record.serviceAreas ?? [],
  }))
  const updates = prepared.filter((record) => existingByEmail.has(record.email))

  for (const chunk of chunkArray(inserts, 500)) {
    const { error } = await db.from('cleaners').insert(chunk)
    if (error) {
      throw error
    }
    result.created += chunk.length
  }

  for (const record of updates) {
    const cleanerId = existingByEmail.get(record.email)
    if (!cleanerId) continue
    const { error } = await db
      .from('cleaners')
      .update(toDbPayload(record))
      .eq('id', cleanerId)
    if (error) {
      result.skipped += 1
      result.errors.push(`${record.email}: ${error.message}`)
      continue
    }
    result.updated += 1
  }

  await writeAuditLog('cleaner', 'bulk-import', 'cleaner.imported', withActorDetails(actor, {
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
  }))

  return result
}

export async function createCleaner(payload: CleanerPayload, actor: CleanerAuditActor) {
  assertCleanerPayload(payload)
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('cleaners')
    .insert({
      ...toDbPayload(payload),
      status: payload.status ?? 'lead',
      services: payload.services ?? [],
      service_areas: payload.serviceAreas ?? [],
    })
    .select(CLEANER_SELECT)
    .single()

  if (error) throw error
  await writeAuditLog('cleaner', data.id, 'cleaner.created', withActorDetails(actor, { email: data.email }))
  return data as CleanerRecord
}

export async function updateCleaner(cleanerId: string, payload: Partial<CleanerPayload>, actor: CleanerAuditActor) {
  const updatePayload = toDbPayload(payload)
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('cleaners')
    .update(updatePayload)
    .eq('id', cleanerId)
    .select(CLEANER_SELECT)
    .single()

  if (error) throw error
  await writeAuditLog('cleaner', cleanerId, 'cleaner.updated', withActorDetails(actor, {
    fields: Object.keys(updatePayload).filter((key) => updatePayload[key as keyof typeof updatePayload] !== undefined),
  }))
  return data as CleanerRecord
}

export async function addCleanerComment(cleanerId: string, comment: string, actor: CleanerAuditActor) {
  const cleaned = cleanString(comment, 2000)
  if (!cleaned) {
    throw new Error('Comment is required.')
  }

  const db = getAdminSupabase()
  const { data, error } = await db
    .from('cleaner_comments')
    .insert({
      cleaner_id: cleanerId,
      author_name: actor.username,
      comment: cleaned,
    })
    .select(COMMENT_SELECT)
    .single()

  if (error) throw error
  await writeAuditLog('cleaner', cleanerId, 'cleaner.comment.created', withActorDetails(actor, { commentId: data.id }))
  return data as CleanerComment
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'document'
}

export async function uploadCleanerDocument(payload: {
  cleanerId: string
  documentType: unknown
  fileName: string
  contentType?: string | null
  sizeBytes: number
  data: Buffer
  expiryDate?: string | null
  notes?: string | null
  actor: CleanerAuditActor
}) {
  const documentType = isCleanerDocumentType(payload.documentType) ? payload.documentType : 'other'
  const fileName = sanitizeFileName(payload.fileName)
  const contentType = cleanString(payload.contentType, 120) || 'application/octet-stream'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const storagePath = `${payload.cleanerId}/${timestamp}-${fileName}`
  const db = getAdminSupabase()

  const { error: uploadError } = await db.storage
    .from(CLEANER_DOCUMENT_BUCKET)
    .upload(storagePath, payload.data, {
      contentType,
      upsert: false,
    })

  if (uploadError) {
    throw uploadError
  }

  const { data, error } = await db
    .from('cleaner_documents')
    .insert({
      cleaner_id: payload.cleanerId,
      document_type: documentType,
      file_name: fileName,
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: payload.sizeBytes,
      expiry_date: payload.expiryDate || null,
      notes: nullableString(payload.notes, 500),
      uploaded_by: payload.actor.username,
    })
    .select(DOCUMENT_SELECT)
    .single()

  if (error) {
    await db.storage.from(CLEANER_DOCUMENT_BUCKET).remove([storagePath])
    throw error
  }

  await writeAuditLog('cleaner', payload.cleanerId, 'cleaner.document.uploaded', withActorDetails(payload.actor, {
    documentId: data.id,
    documentType,
    fileName,
  }))

  return data as CleanerDocument
}

export async function downloadCleanerDocument(cleanerId: string, documentId: string) {
  const db = getAdminSupabase()
  const { data: document, error } = await db
    .from('cleaner_documents')
    .select(DOCUMENT_SELECT)
    .eq('cleaner_id', cleanerId)
    .eq('id', documentId)
    .single()

  if (error) {
    throw error
  }

  const { data: file, error: downloadError } = await db.storage
    .from(CLEANER_DOCUMENT_BUCKET)
    .download(document.storage_path)

  if (downloadError) {
    throw downloadError
  }

  return {
    document: document as CleanerDocument,
    file,
  }
}

export async function deleteCleanerDocument(cleanerId: string, documentId: string, actor: CleanerAuditActor) {
  const db = getAdminSupabase()
  const { data: document, error } = await db
    .from('cleaner_documents')
    .select(DOCUMENT_SELECT)
    .eq('cleaner_id', cleanerId)
    .eq('id', documentId)
    .single()

  if (error) {
    throw error
  }

  const { error: storageError } = await db.storage
    .from(CLEANER_DOCUMENT_BUCKET)
    .remove([document.storage_path])

  if (storageError) {
    throw storageError
  }

  const { error: deleteError } = await db
    .from('cleaner_documents')
    .delete()
    .eq('cleaner_id', cleanerId)
    .eq('id', documentId)

  if (deleteError) {
    throw deleteError
  }

  await writeAuditLog('cleaner', cleanerId, 'cleaner.document.deleted', withActorDetails(actor, {
    documentId,
    documentType: document.document_type,
    fileName: document.file_name,
  }))

  return document as CleanerDocument
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function applyTemplateTokens(value: string, cleaner: CleanerRecord) {
  return value
    .replaceAll('{{first_name}}', cleaner.first_name ?? cleaner.contact_name.split(' ')[0] ?? '')
    .replaceAll('{{last_name}}', cleaner.last_name ?? '')
    .replaceAll('{{contact_name}}', cleaner.contact_name)
    .replaceAll('{{business_name}}', cleaner.business_name)
    .replaceAll('{{city}}', cleaner.city ?? '')
    .replaceAll('{{suburb}}', cleaner.suburb ?? '')
}

function getProviderMessageId(response: unknown) {
  if (!response || typeof response !== 'object') return null
  const record = response as Record<string, unknown>
  return typeof record.id === 'string' ? record.id : null
}

export async function sendCleanerEmail(payload: {
  cleanerId: string
  templateId?: string | null
  templateName?: string | null
  subject: string
  body: string
  actor: CleanerAuditActor
}) {
  const detail = await getCleanerDetail(payload.cleanerId)
  const cleaner = detail.cleaner
  const subject = applyTemplateTokens(cleanString(payload.subject, 240), cleaner)
  const body = applyTemplateTokens(cleanString(payload.body, 5000), cleaner)

  if (!subject || !body) {
    throw new Error('Subject and message are required.')
  }

  const db = getAdminSupabase()

  const { data: emailRow, error: insertError } = await db
    .from('cleaner_emails')
    .insert({
      cleaner_id: cleaner.id,
      template_id: payload.templateId || null,
      template_name: payload.templateName || null,
      to_email: cleaner.email,
      subject,
      body,
      status: 'draft',
      sent_by: payload.actor.username,
    })
    .select(EMAIL_SELECT)
    .single()

  if (insertError) throw insertError

  try {
    const response = await sendEmailWithResult({
      from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au',
      to: cleaner.email,
      replyTo: process.env.ADMIN_EMAIL ?? 'info@securecleaning.com.au',
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
          <div style="background: #1a2744; padding: 22px 24px;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Secure Cleaning</h1>
          </div>
          <div style="padding: 24px;">
            ${textToHtml(body)}
          </div>
        </div>
      `,
    })

    const providerMessageId = getProviderMessageId(response)
    const { data: sentRow, error: updateError } = await db
      .from('cleaner_emails')
      .update({
        status: 'sent',
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', emailRow.id)
      .select(EMAIL_SELECT)
      .single()

    if (updateError) throw updateError
    await writeAuditLog('cleaner', cleaner.id, 'cleaner.email.sent', withActorDetails(payload.actor, { emailId: sentRow.id, providerMessageId }))
    return sentRow as CleanerEmail
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email send failed.'
    await db
      .from('cleaner_emails')
      .update({
        status: 'failed',
        error_message: message,
      })
      .eq('id', emailRow.id)

    await writeAuditLog('cleaner', cleaner.id, 'cleaner.email.failed', withActorDetails(payload.actor, { emailId: emailRow.id, error: message }))
    throw error
  }
}
