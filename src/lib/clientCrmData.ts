import { getAdminSupabase } from '@/lib/supabase'
import { findMatchingZones, getAvailabilityConfig } from '@/lib/availability'
import { listStaffAccounts, type StaffAccount } from '@/lib/staffAccounts'
import { writeAuditLog } from '@/lib/auditLog'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import {
  buildContactSourceExplanation,
  canActorAccessAssignedLead,
  isValidCrmEmail,
  normalizeCrmContactBasis,
  normalizeCrmEmail,
  normalizeCrmPostcode,
  normalizeCrmSourceType,
  normalizeCrmStage,
  requiresNamedSourceProvider,
  type CrmContactBasis,
  type CrmSourceType,
} from '@/lib/clientCrmPolicy'

export type CrmAgentOption = Pick<StaffAccount, 'id' | 'displayName' | 'email' | 'jobTitle' | 'phone' | 'availabilityAssigneeId' | 'active'>

export type CrmLead = {
  id: string
  organisationId: string | null
  contactId: string | null
  siteId: string | null
  quoteId: string | null
  email: string
  businessName: string
  contactName: string
  phone: string
  address: string
  suburb: string
  postcode: string
  city: 'melbourne' | 'sydney' | null
  state: string
  sourceType: CrmSourceType | string
  sourceProvider: string
  sourceExplanation: string
  contactBasis: CrmContactBasis | string
  stage: string
  notes: string
  nextFollowUpAt: string | null
  assignedStaffId: string | null
  assignedStaffName: string | null
  createdAt: string
  updatedAt: string
  suppressed: boolean
  communications: CrmCommunication[]
}

export type CrmEmailTemplate = {
  id: string
  name: string
  description: string
  category: string
  purpose: 'marketing' | 'transactional'
  visibility: 'shared' | 'personal'
  status: 'draft' | 'published' | 'archived'
  subject: string
  body: string
  currentVersion: number
  createdByStaffId: string | null
  updatedAt: string
}

export type CrmCommunication = {
  id: string
  leadId: string
  templateId: string | null
  templateVersion: number | null
  purpose: 'marketing' | 'transactional'
  toEmail: string
  senderName: string
  subject: string
  status: 'sending' | 'sent' | 'rejected' | 'unknown'
  sentAt: string | null
  createdAt: string
}

export class ClientCrmError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function clean(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cityFromInput(value: unknown): 'melbourne' | 'sydney' | null {
  return value === 'melbourne' || value === 'sydney' ? value : null
}

function stateForCity(city: 'melbourne' | 'sydney') {
  return city === 'sydney' ? 'NSW' : 'VIC'
}

export async function resolvePublicSubmissionClient(input: {
  businessName: string
  contactName: string
  email: string
  phone?: string
  address?: string
  city: 'melbourne' | 'sydney'
}) {
  const db = getAdminSupabase()
  const email = normalizeCrmEmail(input.email)
  const { data: existing, error: existingError } = await db.from('clients')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.id) return { id: existing.id, existing: true }

  const { data: created, error: createError } = await db.from('clients').insert({
    business_name: input.businessName,
    contact_name: input.contactName,
    email,
    phone: input.phone || null,
    address: input.address || null,
    city: input.city,
  }).select('id').single()
  if (!createError && created?.id) return { id: created.id, existing: false }
  if (createError?.code !== '23505') throw createError

  const { data: raced, error: racedError } = await db.from('clients')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .single()
  if (racedError) throw racedError
  return { id: raced.id, existing: true }
}

export async function getCrmAssignmentCandidates(input: {
  address?: string
  suburb?: string
  postcode?: string
  city: 'melbourne' | 'sydney'
}) {
  const [config, staff] = await Promise.all([
    getAvailabilityConfig(),
    listStaffAccounts(),
  ])
  const searchText = [input.address, input.suburb, input.postcode].filter(Boolean).join(' ')
  const matchingZoneIds = new Set(findMatchingZones(searchText, input.city, config).map((zone) => zone.id))
  const assigneeIds = new Set(config.weeklySlots
    .filter((slot) => slot.active && slot.city === input.city && slot.zoneIds.some((zoneId) => matchingZoneIds.has(zoneId)))
    .map((slot) => slot.assigneeId))
  return staff
    .filter((account) => account.active && account.role === 'agent' && account.availabilityAssigneeId && assigneeIds.has(account.availabilityAssigneeId))
    .map((account) => ({
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      jobTitle: account.jobTitle,
      phone: account.phone,
      availabilityAssigneeId: account.availabilityAssigneeId,
      active: account.active,
    }))
}

async function getAllowedCrmAgents(actor: ClientCrmActor) {
  if (actor.role === 'agent') {
    return [{
      id: actor.id,
      displayName: actor.displayName,
      email: actor.email,
      jobTitle: actor.jobTitle,
      phone: actor.phone,
      availabilityAssigneeId: actor.availabilityAssigneeId,
      active: actor.active,
    }]
  }
  return (await listStaffAccounts())
    .filter((account) => account.active && account.role === 'agent')
    .map((account) => ({
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      jobTitle: account.jobTitle,
      phone: account.phone,
      availabilityAssigneeId: account.availabilityAssigneeId,
      active: account.active,
    }))
}

function mapTemplate(row: Record<string, unknown>): CrmEmailTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    category: String(row.category ?? ''),
    purpose: row.purpose === 'transactional' ? 'transactional' : 'marketing',
    visibility: row.visibility === 'personal' ? 'personal' : 'shared',
    status: row.status === 'draft' || row.status === 'archived' ? row.status : 'published',
    subject: String(row.subject ?? ''),
    body: String(row.body ?? ''),
    currentVersion: Number(row.current_version ?? 1),
    createdByStaffId: typeof row.created_by_staff_id === 'string' ? row.created_by_staff_id : null,
    updatedAt: String(row.updated_at ?? ''),
  }
}

function mapCommunication(row: Record<string, unknown>): CrmCommunication {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    templateId: typeof row.template_id === 'string' ? row.template_id : null,
    templateVersion: typeof row.template_version === 'number' ? row.template_version : null,
    purpose: row.purpose === 'transactional' ? 'transactional' : 'marketing',
    toEmail: String(row.to_email ?? ''),
    senderName: String(row.sender_name ?? ''),
    subject: String(row.subject_snapshot ?? ''),
    status: row.status === 'sent' || row.status === 'rejected' || row.status === 'unknown' ? row.status : 'sending',
    sentAt: typeof row.sent_at === 'string' ? row.sent_at : null,
    createdAt: String(row.created_at ?? ''),
  }
}

export async function getClientCrmWorkspace(actor: ClientCrmActor) {
  const db = getAdminSupabase()
  let leadQuery = db
    .from('leads')
    .select('id, organisation_id, contact_id, site_id, quote_id, email, business_name, contact_name, phone, address, suburb, postcode, city, state, source, source_provider, source_explanation, contact_basis, follow_up_status, follow_up_notes, next_follow_up_at, assigned_staff_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (actor.role === 'agent') leadQuery = leadQuery.eq('assigned_staff_id', actor.id)

  const [leadsResult, templatesResult, agents] = await Promise.all([
    leadQuery,
    db.from('crm_email_templates')
      .select('id, name, description, category, purpose, visibility, status, subject, body, current_version, created_by_staff_id, updated_at')
      .neq('status', 'archived')
      .order('name', { ascending: true }),
    getAllowedCrmAgents(actor),
  ])
  if (leadsResult.error) throw leadsResult.error
  if (templatesResult.error) throw templatesResult.error

  const leadRows = (leadsResult.data ?? []) as Array<Record<string, unknown>>
  const leadIds = leadRows.map((row) => String(row.id))
  const emails = leadIds.length > 0
    ? await db.from('crm_communications')
      .select('id, lead_id, template_id, template_version, purpose, to_email, sender_name, subject_snapshot, status, sent_at, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (emails.error) throw emails.error

  const normalizedEmails = Array.from(new Set(leadRows.map((row) => normalizeCrmEmail(row.email)).filter(Boolean)))
  const suppressions = normalizedEmails.length > 0
    ? await db.from('crm_email_suppressions').select('email_normalized').in('email_normalized', normalizedEmails)
    : { data: [], error: null }
  if (suppressions.error) throw suppressions.error
  const suppressedEmails = new Set((suppressions.data ?? []).map((row) => row.email_normalized))
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.displayName]))
  const communicationsByLead = new Map<string, CrmCommunication[]>()
  for (const row of (emails.data ?? []) as Array<Record<string, unknown>>) {
    const item = mapCommunication(row)
    communicationsByLead.set(item.leadId, [...(communicationsByLead.get(item.leadId) ?? []), item])
  }

  const leads: CrmLead[] = leadRows.map((row) => {
    const id = String(row.id)
    const assignedStaffId = typeof row.assigned_staff_id === 'string' ? row.assigned_staff_id : null
    return {
      id,
      organisationId: typeof row.organisation_id === 'string' ? row.organisation_id : null,
      contactId: typeof row.contact_id === 'string' ? row.contact_id : null,
      siteId: typeof row.site_id === 'string' ? row.site_id : null,
      quoteId: typeof row.quote_id === 'string' ? row.quote_id : null,
      email: String(row.email ?? ''),
      businessName: String(row.business_name ?? ''),
      contactName: String(row.contact_name ?? ''),
      phone: String(row.phone ?? ''),
      address: String(row.address ?? ''),
      suburb: String(row.suburb ?? ''),
      postcode: String(row.postcode ?? ''),
      city: cityFromInput(row.city),
      state: String(row.state ?? ''),
      sourceType: String(row.source ?? 'manual'),
      sourceProvider: String(row.source_provider ?? ''),
      sourceExplanation: String(row.source_explanation ?? ''),
      contactBasis: String(row.contact_basis ?? ''),
      stage: String(row.follow_up_status ?? 'new'),
      notes: String(row.follow_up_notes ?? ''),
      nextFollowUpAt: typeof row.next_follow_up_at === 'string' ? row.next_follow_up_at : null,
      assignedStaffId,
      assignedStaffName: assignedStaffId ? agentNames.get(assignedStaffId) ?? null : null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? row.created_at ?? ''),
      suppressed: suppressedEmails.has(normalizeCrmEmail(row.email)),
      communications: communicationsByLead.get(id) ?? [],
    }
  })

  const templates = ((templatesResult.data ?? []) as Array<Record<string, unknown>>)
    .map(mapTemplate)
    .filter((template) => (
      template.createdByStaffId === actor.id
      || (template.visibility === 'shared' && (actor.role !== 'agent' || template.status === 'published'))
    ))

  return { leads, templates, agents, actor }
}

export async function createManualCrmLead(actor: ClientCrmActor, input: Record<string, unknown>) {
  const businessName = clean(input.businessName, 200)
  const contactName = clean(input.contactName, 200)
  const email = normalizeCrmEmail(input.email)
  const phone = clean(input.phone, 40)
  const address = clean(input.address, 300)
  const suburb = clean(input.suburb, 120)
  const postcode = normalizeCrmPostcode(input.postcode)
  const city = cityFromInput(input.city)
  const sourceType = normalizeCrmSourceType(input.sourceType) ?? 'manual'
  const contactBasis = normalizeCrmContactBasis(input.contactBasis)
  const sourceProvider = clean(input.sourceProvider, 200)
  const sourceReference = clean(input.sourceReference, 200)
  const customExplanation = clean(input.sourceExplanation, 500)
  const notes = clean(input.notes, 5000)
  const requestedAssigneeId = clean(input.assignedStaffId, 100)

  if (!businessName || !contactName || !isValidCrmEmail(email) || !city || !postcode || !contactBasis) {
    throw new ClientCrmError('Provide the business, contact, valid email, city, postcode, and contact basis.')
  }
  if (requiresNamedSourceProvider(sourceType, contactBasis) && !sourceProvider) {
    throw new ClientCrmError('Name the lead provider or public source before creating this outreach record.')
  }

  const candidates = await getCrmAssignmentCandidates({ address, suburb, postcode, city })
  let assignedStaffId: string | null = null
  let assignmentMethod = 'unassigned'
  if (actor.role === 'agent') {
    if (!candidates.some((candidate) => candidate.id === actor.id)) {
      throw new ClientCrmError('This postcode is outside your assigned service coverage. Ask an owner or manager to assign the lead.', 403)
    }
    assignedStaffId = actor.id
    assignmentMethod = 'agent_self'
  } else if (requestedAssigneeId) {
    const allowed = (await getAllowedCrmAgents(actor)).some((agent) => agent.id === requestedAssigneeId)
    if (!allowed) throw new ClientCrmError('Select an active regional agent.')
    assignedStaffId = requestedAssigneeId
    assignmentMethod = 'manual_override'
  } else if (candidates[0]) {
    assignedStaffId = candidates[0].id
    assignmentMethod = 'postcode_auto'
  }

  const db = getAdminSupabase()
  const sourceExplanation = buildContactSourceExplanation({ sourceType, sourceProvider, customExplanation })
  const { data: leadId, error: leadError } = await db.rpc('create_client_crm_lead', {
    p_business_name: businessName,
    p_contact_name: contactName,
    p_email: email,
    p_phone: phone,
    p_address: address,
    p_suburb: suburb,
    p_postcode: postcode,
    p_city: city,
    p_source: sourceType,
    p_source_provider: sourceProvider,
    p_source_reference: sourceReference,
    p_source_explanation: sourceExplanation,
    p_contact_basis: contactBasis,
    p_assigned_staff_id: assignedStaffId,
    p_assignment_method: assignmentMethod,
    p_notes: notes,
    p_actor_id: actor.id,
    p_actor_role: actor.role,
  })
  if (leadError) {
    if (leadError.code === '23505') throw new ClientCrmError('An active lead already exists for this email address.', 409)
    if (leadError.code === '42501') throw new ClientCrmError('This email already belongs to another client record. Ask an owner or manager to reconcile it.', 409)
    if (leadError.code === '23514') throw new ClientCrmError('The saved contact details differ from this lead. Reconcile the client record before adding another lead.', 409)
    throw leadError
  }
  return { id: String(leadId), candidates }
}

export async function updateCrmLead(actor: ClientCrmActor, input: Record<string, unknown>) {
  const id = clean(input.id, 100)
  if (!id) throw new ClientCrmError('Lead ID is required.')
  const db = getAdminSupabase()
  const { data: current, error } = await db.from('leads').select('id, assigned_staff_id, source, contact_basis, source_provider, source_explanation').eq('id', id).maybeSingle()
  if (error) throw error
  if (!current || !canActorAccessAssignedLead(actor.role, actor.id, current.assigned_staff_id)) {
    throw new ClientCrmError('Lead not found.', 404)
  }

  const update: Record<string, unknown> = {}
  const stage = input.stage === undefined ? undefined : normalizeCrmStage(input.stage)
  if (input.stage !== undefined && !stage) throw new ClientCrmError('Select a valid lead stage.')
  if (stage) update.follow_up_status = stage
  if (input.notes !== undefined) update.follow_up_notes = clean(input.notes, 5000) || null
  if (input.nextFollowUpAt !== undefined) {
    const date = clean(input.nextFollowUpAt, 100)
    if (date && Number.isNaN(new Date(date).getTime())) throw new ClientCrmError('Enter a valid follow-up date.')
    update.next_follow_up_at = date ? new Date(date).toISOString() : null
  }
  if (input.assignedStaffId !== undefined) {
    if (actor.role === 'agent') throw new ClientCrmError('Only an owner or manager can reassign a lead.', 403)
    const assignedStaffId = clean(input.assignedStaffId, 100) || null
    if (assignedStaffId) {
      const allowed = (await getAllowedCrmAgents(actor)).some((agent) => agent.id === assignedStaffId)
      if (!allowed) throw new ClientCrmError('Select an active regional agent.')
    }
    update.assigned_staff_id = assignedStaffId
    update.assignment_method = 'manual_override'
  }
  if (input.contactBasis !== undefined || input.sourceProvider !== undefined || input.sourceExplanation !== undefined) {
    const contactBasis = input.contactBasis === undefined
      ? normalizeCrmContactBasis(current.contact_basis)
      : normalizeCrmContactBasis(input.contactBasis)
    const sourceType = normalizeCrmSourceType(current.source) ?? 'manual'
    const sourceProvider = input.sourceProvider === undefined
      ? clean(current.source_provider, 200)
      : clean(input.sourceProvider, 200)
    const customExplanation = input.sourceExplanation === undefined
      ? clean(current.source_explanation, 500)
      : clean(input.sourceExplanation, 500)
    if (!contactBasis) throw new ClientCrmError('Select a valid contact basis.')
    if (requiresNamedSourceProvider(sourceType, contactBasis) && !sourceProvider) {
      throw new ClientCrmError('Name the lead provider or public source before enabling outreach.')
    }
    update.contact_basis = contactBasis
    update.source_provider = sourceProvider || null
    update.source_explanation = buildContactSourceExplanation({ sourceType, sourceProvider, customExplanation })
  }

  const { data, error: updateError } = await db.from('leads').update(update).eq('id', id).select('id').single()
  if (updateError) throw updateError
  await writeAuditLog('lead', id, 'crm.lead.updated', { actorId: actor.id, actorRole: actor.role, fields: Object.keys(update) })
  return data
}

export async function saveCrmTemplate(actor: ClientCrmActor, input: Record<string, unknown>) {
  const id = clean(input.id, 100)
  const name = clean(input.name, 160)
  const description = clean(input.description, 500)
  const category = clean(input.category, 80) || 'outreach'
  const visibility = input.visibility === 'personal' ? 'personal' : 'shared'
  const status = input.status === 'draft' || input.status === 'archived' ? input.status : 'published'
  const subject = clean(input.subject, 240)
  const body = clean(input.body, 10000)
  if (!name || !subject || !body) throw new ClientCrmError('Template name, subject, and message are required.')
  if ((visibility === 'shared' || status === 'published') && actor.role === 'agent') {
    throw new ClientCrmError('Regional agents can save personal draft templates. An owner or manager publishes shared templates.', 403)
  }

  const db = getAdminSupabase()
  const { data, error } = await db.rpc('save_client_crm_template', {
    p_template_id: id || null,
    p_name: name,
    p_description: description,
    p_category: category,
    p_visibility: visibility,
    p_status: status,
    p_subject: subject,
    p_body: body,
    p_actor_id: actor.id,
    p_actor_role: actor.role,
  })
  if (error) {
    if (error.code === '42501') {
      throw new ClientCrmError('Regional agents can only edit their own personal draft templates.', 403)
    }
    throw error
  }
  const saved = Array.isArray(data) ? data[0] : data
  if (!saved?.template_id) throw new Error('Template save did not return an ID.')
  return { id: String(saved.template_id), version: Number(saved.template_version) }
}

export async function upsertOnlineQuoteCrmLead(input: {
  quoteId: string
  clientId: string | null
  businessName: string
  contactName: string
  email: string
  phone?: string
  address?: string
  suburb?: string
  postcode: string
  city: 'melbourne' | 'sydney'
}) {
  const db = getAdminSupabase()
  const candidates = await getCrmAssignmentCandidates(input)
  const assignedStaffId = candidates[0]?.id ?? null

  let organisationId: string | null = null
  let canonicalContact: { business_name: string; contact_name: string; email: string; phone: string | null } | null = null
  if (input.clientId) {
    const { data: contact } = await db.from('clients')
      .select('organisation_id, business_name, contact_name, email, phone')
      .eq('id', input.clientId)
      .maybeSingle()
    organisationId = contact?.organisation_id ?? null
    canonicalContact = contact ?? null
  }
  if (!organisationId) {
    const { data: organisation, error } = await db.from('crm_organisations').insert({ business_name: input.businessName }).select('id').single()
    if (error) throw error
    organisationId = organisation.id
    if (input.clientId) {
      await db.from('clients').update({ organisation_id: organisationId }).eq('id', input.clientId)
    }
  }

  const payload = {
    email: normalizeCrmEmail(canonicalContact?.email ?? input.email),
    business_name: canonicalContact?.business_name ?? input.businessName,
    contact_name: canonicalContact?.contact_name ?? input.contactName,
    phone: canonicalContact?.phone ?? input.phone ?? null,
    city: input.city,
    source: 'online_quote',
    converted_to_client_id: input.clientId,
    organisation_id: organisationId,
    contact_id: input.clientId,
    quote_id: input.quoteId,
    assigned_staff_id: assignedStaffId,
    address: input.address || null,
    suburb: input.suburb || null,
    postcode: input.postcode,
    state: stateForCity(input.city),
    source_explanation: buildContactSourceExplanation({ sourceType: 'online_quote' }),
    source_obtained_at: new Date().toISOString(),
    contact_basis: 'enquiry',
    assignment_method: assignedStaffId ? 'postcode_auto' : 'unassigned',
    follow_up_status: 'new',
  }
  const { data, error } = await db.from('leads').upsert(payload, { onConflict: 'quote_id' }).select('id').single()
  if (error) throw error
  return data
}

export async function syncBookingCrmLead(input: {
  quoteId: string | null
  clientId: string
  siteId: string | null
  businessName: string
  contactName: string
  email: string
  phone?: string
  address?: string
  suburb?: string
  postcode: string
  city: 'melbourne' | 'sydney'
  availabilityAssigneeId?: string | null
}) {
  const db = getAdminSupabase()
  const staff = await listStaffAccounts()
  const linkedAgent = input.availabilityAssigneeId
    ? staff.find((account) => account.active && account.role === 'agent' && account.availabilityAssigneeId === input.availabilityAssigneeId)
    : null
  const candidates = linkedAgent ? [linkedAgent] : await getCrmAssignmentCandidates(input)
  const assignedStaffId = candidates[0]?.id ?? null
  const { data: contact } = await db.from('clients')
    .select('organisation_id, business_name, contact_name, email, phone')
    .eq('id', input.clientId)
    .maybeSingle()
  let organisationId = contact?.organisation_id ?? null
  if (!organisationId) {
    const { data: organisation, error } = await db.from('crm_organisations').insert({ business_name: input.businessName }).select('id').single()
    if (error) throw error
    organisationId = organisation.id
    await db.from('clients').update({ organisation_id: organisationId }).eq('id', input.clientId)
  }

  const values = {
    email: normalizeCrmEmail(contact?.email ?? input.email),
    business_name: contact?.business_name ?? input.businessName,
    contact_name: contact?.contact_name ?? input.contactName,
    phone: contact?.phone ?? input.phone ?? null,
    city: input.city,
    converted_to_client_id: input.clientId,
    organisation_id: organisationId,
    contact_id: input.clientId,
    site_id: input.siteId,
    assigned_staff_id: assignedStaffId,
    address: input.address || null,
    suburb: input.suburb || null,
    postcode: input.postcode,
    state: stateForCity(input.city),
    contact_basis: 'enquiry',
    assignment_method: assignedStaffId ? 'booking_assignee' : 'unassigned',
    follow_up_status: 'qualified',
  }

  if (input.quoteId) {
    const { data: updated, error } = await db.from('leads').update(values).eq('quote_id', input.quoteId).select('id').maybeSingle()
    if (error) throw error
    if (updated) return updated
  }

  const { data, error } = await db.from('leads').insert({
    ...values,
    quote_id: input.quoteId,
    source: input.quoteId ? 'online_quote' : 'direct_booking',
    source_explanation: buildContactSourceExplanation({ sourceType: input.quoteId ? 'online_quote' : 'direct_booking' }),
    source_obtained_at: new Date().toISOString(),
  }).select('id').single()
  if (error) throw error
  return data
}
