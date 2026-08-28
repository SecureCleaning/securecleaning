import { getAdminSupabase } from '@/lib/supabase'
import { findMatchingZones, getAvailabilityConfig } from '@/lib/availability'
import { listStaffAccounts, type StaffAccount } from '@/lib/staffAccounts'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { normalizeCrmPhone } from '@/lib/clientCrmOpportunity'
import {
  buildContactSourceExplanation,
  canActorAccessAssignedOpportunity,
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
export type CrmSenderOption = Pick<StaffAccount, 'id' | 'displayName' | 'email' | 'jobTitle' | 'phone' | 'role' | 'availabilityAssigneeId' | 'active'>

export type CrmQuoteHistory = {
  id: string
  quoteRef: string
  status: string
  sequenceNumber: number
  createdAt: string
  hasFinalDocument: boolean
  finalDocumentVersion: number | null
  finalQuoteSentAt: string | null
}

export type CrmOpportunity = {
  id: string
  organisationId: string | null
  contactId: string | null
  siteId: string | null
  cycleNumber: number
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
  hasContactUnresolvedEmail: boolean
  productId: string | null
  productStatus: string | null
  quotes: CrmQuoteHistory[]
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
  opportunityId: string
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

function resolvePublicContactMatch(rows: Array<Record<string, unknown>>, input: {
  businessName: string
  contactName: string
  phone?: string
}) {
  if (rows.length === 0) return null
  const normalizedBusiness = input.businessName.trim().toLowerCase()
  const normalizedContact = input.contactName.trim().toLowerCase()
  const normalizedPhone = normalizeCrmPhone(input.phone)
  const matching = rows.filter((row) => {
    const savedPhone = normalizeCrmPhone(typeof row.phone === 'string' ? row.phone : null)
    return String(row.business_name ?? '').trim().toLowerCase() === normalizedBusiness
      && String(row.contact_name ?? '').trim().toLowerCase() === normalizedContact
      && (!savedPhone || !normalizedPhone || savedPhone === normalizedPhone)
  })
  if (matching.length !== 1) {
    throw new ClientCrmError('These contact details match more than one existing client record or conflict with the saved record. Please contact Secure Cleaning so we can reconcile the client before continuing.', 409)
  }
  return matching[0]
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
  const { data: existingRows, error: existingError } = await db.rpc('find_client_crm_contacts_by_email', { p_email: email })
  if (existingError) throw existingError
  const existing = resolvePublicContactMatch((existingRows ?? []) as Array<Record<string, unknown>>, input)
  if (existing?.id) return { id: String(existing.id), existing: true }

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

  const { data: racedRows, error: racedError } = await db.rpc('find_client_crm_contacts_by_email', { p_email: email })
  if (racedError) throw racedError
  const raced = resolvePublicContactMatch((racedRows ?? []) as Array<Record<string, unknown>>, input)
  if (!raced?.id) throw createError
  return { id: String(raced.id), existing: true }
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

async function getAllowedCrmSenders(actor: ClientCrmActor): Promise<CrmSenderOption[]> {
  if (actor.role === 'agent') return [actor]
  return (await listStaffAccounts())
    .filter((account) => account.active && ['owner', 'manager', 'agent'].includes(account.role))
    .map((account) => ({
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      jobTitle: account.jobTitle,
      phone: account.phone,
      role: account.role,
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
    opportunityId: String(row.opportunity_id),
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
  let opportunityQuery = db
    .from('crm_opportunities')
    .select('id, organisation_id, primary_contact_id, site_id, assigned_staff_id, stage, cycle_number, notes, next_follow_up_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (actor.role === 'agent') opportunityQuery = opportunityQuery.eq('assigned_staff_id', actor.id)

  const [opportunitiesResult, templatesResult, agents, senders] = await Promise.all([
    opportunityQuery,
    db.from('crm_email_templates')
      .select('id, name, description, category, purpose, visibility, status, subject, body, current_version, created_by_staff_id, updated_at')
      .neq('status', 'archived')
      .order('name', { ascending: true }),
    getAllowedCrmAgents(actor),
    getAllowedCrmSenders(actor),
  ])
  if (opportunitiesResult.error) throw opportunitiesResult.error
  if (templatesResult.error) throw templatesResult.error

  const opportunityRows = (opportunitiesResult.data ?? []) as Array<Record<string, unknown>>
  const opportunityIds = opportunityRows.map((row) => String(row.id))
  const contactIds = Array.from(new Set(opportunityRows.map((row) => String(row.primary_contact_id ?? '')).filter(Boolean)))
  const siteIds = Array.from(new Set(opportunityRows.map((row) => String(row.site_id ?? '')).filter(Boolean)))
  const [contacts, sites, intakeLinks, quoteLinks, emails, unresolvedEmails] = await Promise.all([
    contactIds.length > 0
      ? db.from('clients').select('id, business_name, contact_name, email, phone, city').in('id', contactIds)
      : Promise.resolve({ data: [], error: null }),
    siteIds.length > 0
      ? db.from('sites').select('id, address, suburb, postcode, city').in('id', siteIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
      ? db.from('crm_opportunity_intakes').select('opportunity_id, lead_id, linked_at').in('opportunity_id', opportunityIds).order('linked_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
      ? db.from('crm_opportunity_quotes').select('opportunity_id, quote_id, sequence_number').in('opportunity_id', opportunityIds).order('sequence_number', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
    ? await db.from('crm_communications')
      .select('id, opportunity_id, template_id, template_version, purpose, to_email, sender_name, subject_snapshot, status, sent_at, created_at')
      .in('opportunity_id', opportunityIds)
      .order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null }),
    contactIds.length > 0
      ? db.from('crm_communications').select('contact_id').in('contact_id', contactIds).in('status', ['sending', 'unknown'])
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [contacts, sites, intakeLinks, quoteLinks, emails, unresolvedEmails]) {
    if (result.error) throw result.error
  }

  const intakeIds = Array.from(new Set((intakeLinks.data ?? []).map((row) => String(row.lead_id))))
  const quoteIds = Array.from(new Set((quoteLinks.data ?? []).map((row) => String(row.quote_id))))
  const [intakes, quotes, products] = await Promise.all([
    intakeIds.length > 0
      ? db.from('leads').select('id, source, source_provider, source_explanation, contact_basis').in('id', intakeIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length > 0
      ? db.from('quotes').select('id, quote_ref, status, created_at, final_quote_document, final_quote_document_version, final_quote_sent_at').in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length > 0
      ? db.from('contract_products').select('id, opportunity_id, status').in('opportunity_id', opportunityIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (intakes.error) throw intakes.error
  if (quotes.error) throw quotes.error
  if (products.error) throw products.error

  const contactsById = new Map((contacts.data ?? []).map((row) => [String(row.id), row]))
  const sitesById = new Map((sites.data ?? []).map((row) => [String(row.id), row]))
  const intakesById = new Map((intakes.data ?? []).map((row) => [String(row.id), row]))
  const primaryIntakeByOpportunity = new Map<string, Record<string, unknown>>()
  for (const link of intakeLinks.data ?? []) {
    const opportunityId = String(link.opportunity_id)
    if (!primaryIntakeByOpportunity.has(opportunityId)) {
      const intake = intakesById.get(String(link.lead_id))
      if (intake) primaryIntakeByOpportunity.set(opportunityId, intake)
    }
  }
  const normalizedEmails = Array.from(new Set((contacts.data ?? []).map((row) => normalizeCrmEmail(row.email)).filter(Boolean)))
  const suppressions = normalizedEmails.length > 0
    ? await db.from('crm_email_suppressions').select('email_normalized').in('email_normalized', normalizedEmails)
    : { data: [], error: null }
  if (suppressions.error) throw suppressions.error
  const suppressedEmails = new Set((suppressions.data ?? []).map((row) => row.email_normalized))
  const unresolvedContactIds = new Set((unresolvedEmails.data ?? []).map((row) => String(row.contact_id)))
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.displayName]))
  const communicationsByOpportunity = new Map<string, CrmCommunication[]>()
  for (const row of (emails.data ?? []) as Array<Record<string, unknown>>) {
    const item = mapCommunication(row)
    communicationsByOpportunity.set(item.opportunityId, [...(communicationsByOpportunity.get(item.opportunityId) ?? []), item])
  }
  const quotesById = new Map((quotes.data ?? []).map((row) => [String(row.id), row]))
  const productsByOpportunity = new Map((products.data ?? []).map((row) => [String(row.opportunity_id), row]))
  const quotesByOpportunity = new Map<string, CrmQuoteHistory[]>()
  for (const link of quoteLinks.data ?? []) {
    const quote = quotesById.get(String(link.quote_id))
    if (!quote) continue
    const opportunityId = String(link.opportunity_id)
    quotesByOpportunity.set(opportunityId, [...(quotesByOpportunity.get(opportunityId) ?? []), {
      id: String(quote.id),
      quoteRef: String(quote.quote_ref ?? ''),
      status: String(quote.status ?? ''),
      sequenceNumber: Number(link.sequence_number),
      createdAt: String(quote.created_at ?? ''),
      hasFinalDocument: Boolean(quote.final_quote_document),
      finalDocumentVersion: typeof quote.final_quote_document_version === 'number' ? quote.final_quote_document_version : null,
      finalQuoteSentAt: typeof quote.final_quote_sent_at === 'string' ? quote.final_quote_sent_at : null,
    }])
  }

  const opportunities: CrmOpportunity[] = opportunityRows.map((row) => {
    const id = String(row.id)
    const contactId = String(row.primary_contact_id ?? '')
    const siteId = typeof row.site_id === 'string' ? row.site_id : null
    const contact = contactsById.get(contactId)
    const site = siteId ? sitesById.get(siteId) : null
    const intake = primaryIntakeByOpportunity.get(id)
    const assignedStaffId = typeof row.assigned_staff_id === 'string' ? row.assigned_staff_id : null
    const product = productsByOpportunity.get(id)
    return {
      id,
      organisationId: typeof row.organisation_id === 'string' ? row.organisation_id : null,
      contactId: contactId || null,
      siteId,
      cycleNumber: Number(row.cycle_number ?? 1),
      email: String(contact?.email ?? ''),
      businessName: String(contact?.business_name ?? ''),
      contactName: String(contact?.contact_name ?? ''),
      phone: String(contact?.phone ?? ''),
      address: String(site?.address ?? ''),
      suburb: String(site?.suburb ?? ''),
      postcode: String(site?.postcode ?? ''),
      city: cityFromInput(site?.city ?? contact?.city),
      state: (site?.city ?? contact?.city) === 'sydney' ? 'NSW' : 'VIC',
      sourceType: String(intake?.source ?? 'manual'),
      sourceProvider: String(intake?.source_provider ?? ''),
      sourceExplanation: String(intake?.source_explanation ?? ''),
      contactBasis: String(intake?.contact_basis ?? ''),
      stage: String(row.stage ?? 'new'),
      notes: String(row.notes ?? ''),
      nextFollowUpAt: typeof row.next_follow_up_at === 'string' ? row.next_follow_up_at : null,
      assignedStaffId,
      assignedStaffName: assignedStaffId ? agentNames.get(assignedStaffId) ?? null : null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? row.created_at ?? ''),
      suppressed: suppressedEmails.has(normalizeCrmEmail(contact?.email)),
      hasContactUnresolvedEmail: unresolvedContactIds.has(contactId),
      productId: product?.id ? String(product.id) : null,
      productStatus: product?.status ? String(product.status) : null,
      quotes: [...(quotesByOpportunity.get(id) ?? [])].sort((left, right) => (
        right.sequenceNumber - left.sequenceNumber
        || right.createdAt.localeCompare(left.createdAt)
      )),
      communications: communicationsByOpportunity.get(id) ?? [],
    }
  })

  const templates = ((templatesResult.data ?? []) as Array<Record<string, unknown>>)
    .map(mapTemplate)
    .filter((template) => (
      template.createdByStaffId === actor.id
      || template.visibility === 'shared'
    ))

  return { opportunities, templates, agents, senders, actor }
}

export async function createManualCrmOpportunity(actor: ClientCrmActor, input: Record<string, unknown>) {
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
    throw new ClientCrmError('Name the lead provider or public source before creating this opportunity.')
  }

  const candidates = await getCrmAssignmentCandidates({ address, suburb, postcode, city })
  let assignedStaffId: string | null = null
  let assignmentMethod = 'unassigned'
  if (actor.role === 'agent') {
    if (!candidates.some((candidate) => candidate.id === actor.id)) {
      throw new ClientCrmError('This postcode is outside your assigned service coverage. Ask an owner or manager to assign the opportunity.', 403)
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
  const { data: opportunityId, error: opportunityError } = await db.rpc('create_client_crm_opportunity', {
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
  if (opportunityError) {
    if (opportunityError.code === '23505') throw new ClientCrmError('An active opportunity already exists for this customer and site. Add future quotes to that opportunity, or close it before starting a new sales cycle.', 409)
    if (opportunityError.code === '42501') throw new ClientCrmError('This contact belongs to another agent. Ask an owner or manager to reconcile it.', 409)
    if (opportunityError.code === '23514') throw new ClientCrmError('The saved contact details differ from this entry. Reconcile the contact before starting another opportunity.', 409)
    throw opportunityError
  }
  return { id: String(opportunityId), candidates }
}

export async function updateCrmOpportunity(actor: ClientCrmActor, input: Record<string, unknown>) {
  const id = clean(input.id, 100)
  if (!id) throw new ClientCrmError('Opportunity ID is required.')
  const db = getAdminSupabase()
  const { data: current, error } = await db.from('crm_opportunities')
    .select('id, assigned_staff_id, assignment_method, stage, closed_at, notes, next_follow_up_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!current || !canActorAccessAssignedOpportunity(actor.role, actor.id, current.assigned_staff_id)) {
    throw new ClientCrmError('Opportunity not found.', 404)
  }

  const { data: intakeLink, error: intakeLinkError } = await db.from('crm_opportunity_intakes')
    .select('lead_id')
    .eq('opportunity_id', id)
    .order('linked_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (intakeLinkError) throw intakeLinkError
  const intake = intakeLink?.lead_id
    ? await db.from('leads').select('id, source, contact_basis, source_provider, source_explanation').eq('id', intakeLink.lead_id).maybeSingle()
    : { data: null, error: null }
  if (intake.error) throw intake.error

  const update: Record<string, unknown> = {}
  const intakeUpdate: Record<string, unknown> = {}
  const stage = input.stage === undefined ? undefined : normalizeCrmStage(input.stage)
  if (input.stage !== undefined && !stage) throw new ClientCrmError('Select a valid opportunity stage.')
  if (stage === 'won' && current.stage !== 'won') {
    throw new ClientCrmError('Use Close as won so the winning final quote and contract product are created together.', 409)
  }
  if (stage && current.closed_at && stage !== current.stage) {
    throw new ClientCrmError('Closed opportunities are retained as history. Start a new opportunity for a repeat sales cycle.', 409)
  }
  if (stage) {
    update.stage = stage
    if (['won', 'lost', 'cancelled'].includes(stage) && !current.closed_at) update.closed_at = new Date().toISOString()
  }
  if (input.notes !== undefined) update.notes = clean(input.notes, 5000) || null
  if (input.nextFollowUpAt !== undefined) {
    const date = clean(input.nextFollowUpAt, 100)
    if (date && Number.isNaN(new Date(date).getTime())) throw new ClientCrmError('Enter a valid follow-up date.')
    update.next_follow_up_at = date ? new Date(date).toISOString() : null
  }
  if (input.assignedStaffId !== undefined) {
    if (actor.role === 'agent') throw new ClientCrmError('Only an owner or manager can reassign an opportunity.', 403)
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
      ? normalizeCrmContactBasis(intake.data?.contact_basis)
      : normalizeCrmContactBasis(input.contactBasis)
    const sourceType = normalizeCrmSourceType(intake.data?.source) ?? 'manual'
    const sourceProvider = input.sourceProvider === undefined
      ? clean(intake.data?.source_provider, 200)
      : clean(input.sourceProvider, 200)
    const customExplanation = input.sourceExplanation === undefined
      ? clean(intake.data?.source_explanation, 500)
      : clean(input.sourceExplanation, 500)
    if (!contactBasis) throw new ClientCrmError('Select a valid contact basis.')
    if (requiresNamedSourceProvider(sourceType, contactBasis) && !sourceProvider) {
      throw new ClientCrmError('Name the lead provider or public source before enabling outreach.')
    }
    intakeUpdate.contact_basis = contactBasis
    intakeUpdate.source_provider = sourceProvider || null
    intakeUpdate.source_explanation = buildContactSourceExplanation({ sourceType, sourceProvider, customExplanation })
  }

  const resolved = (field: string, fallback: unknown) => Object.prototype.hasOwnProperty.call(update, field) ? update[field] : fallback
  const resolvedIntake = (field: string, fallback: unknown) => Object.prototype.hasOwnProperty.call(intakeUpdate, field) ? intakeUpdate[field] : fallback
  const { data, error: updateError } = await db.rpc('update_client_crm_opportunity', {
    p_opportunity_id: id,
    p_expected_updated_at: current.updated_at,
    p_stage: resolved('stage', current.stage),
    p_notes: resolved('notes', current.notes),
    p_next_follow_up_at: resolved('next_follow_up_at', current.next_follow_up_at),
    p_assigned_staff_id: resolved('assigned_staff_id', current.assigned_staff_id),
    p_assignment_method: resolved('assignment_method', current.assignment_method),
    p_contact_basis: resolvedIntake('contact_basis', intake.data?.contact_basis ?? null),
    p_source_provider: resolvedIntake('source_provider', intake.data?.source_provider ?? null),
    p_source_explanation: resolvedIntake('source_explanation', intake.data?.source_explanation ?? null),
    p_actor_id: actor.id,
    p_actor_role: actor.role,
  })
  if (updateError?.code === '40001') throw new ClientCrmError('This opportunity changed while you were editing it. Reload the CRM record and apply your update again.', 409)
  if (updateError) throw updateError
  return { id: String(data) }
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

export async function syncOnlineQuoteCrmOpportunity(input: {
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
  if (!input.clientId) throw new ClientCrmError('A saved contact is required before linking the quote to the CRM.', 409)
  const db = getAdminSupabase()
  const candidates = await getCrmAssignmentCandidates(input)
  const assignedStaffId = candidates[0]?.id ?? null
  const { data, error } = await db.rpc('sync_client_crm_opportunity', {
    p_quote_id: input.quoteId,
    p_booking_id: null,
    p_contact_id: input.clientId,
    p_site_id: null,
    p_address: input.address ?? '',
    p_suburb: input.suburb ?? '',
    p_postcode: input.postcode,
    p_city: input.city,
    p_source: 'online_quote',
    p_source_explanation: buildContactSourceExplanation({ sourceType: 'online_quote' }),
    p_assigned_staff_id: assignedStaffId,
    p_assignment_method: assignedStaffId ? 'postcode_auto' : 'unassigned',
  })
  if (error) throw error
  return { id: String(data) }
}

export async function syncBookingCrmOpportunity(input: {
  bookingId: string
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
  const sourceType = input.quoteId ? 'online_quote' : 'direct_booking'
  const { data, error } = await db.rpc('sync_client_crm_opportunity', {
    p_quote_id: input.quoteId,
    p_booking_id: input.bookingId,
    p_contact_id: input.clientId,
    p_site_id: input.siteId,
    p_address: input.address ?? '',
    p_suburb: input.suburb ?? '',
    p_postcode: input.postcode,
    p_city: input.city,
    p_source: sourceType,
    p_source_explanation: buildContactSourceExplanation({ sourceType }),
    p_assigned_staff_id: assignedStaffId,
    p_assignment_method: assignedStaffId ? 'booking_assignee' : 'unassigned',
  })
  if (error) throw error
  return { id: String(data) }
}
