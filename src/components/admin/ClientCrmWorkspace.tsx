'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { applyCrmTemplateTokens, getMissingCrmSignatureFields, resolveDefaultCrmSenderId } from '@/lib/clientCrmPolicy'
import type { CrmAgentOption, CrmEmailTemplate, CrmOpportunity, CrmSenderOption } from '@/lib/clientCrmData'
import type { StaffAccount } from '@/lib/staffAccounts'

type WorkspaceData = {
  opportunities: CrmOpportunity[]
  templates: CrmEmailTemplate[]
  agents: CrmAgentOption[]
  senders: CrmSenderOption[]
  actor: StaffAccount
}

type Status = { type: 'success' | 'error'; message: string } | null

const sourceOptions = [
  ['manual', 'Manual entry'],
  ['purchased_lead', 'Purchased lead'],
  ['cold_outreach', 'Cold outreach'],
] as const

const basisOptions = [
  ['enquiry', 'Client enquiry'],
  ['purchased_lead', 'Purchased lead provider'],
  ['existing_relationship', 'Existing business relationship'],
  ['inferred_business_interest', 'Relevant published business contact'],
] as const

const stageOptions = ['new', 'contacted', 'qualified', 'inspection', 'quoting', 'proposal_sent', 'won', 'lost', 'cancelled']

function emptyLeadDraft() {
  return {
    businessName: '', contactName: '', email: '', phone: '', address: '', suburb: '', postcode: '',
    city: 'melbourne', sourceType: 'manual', sourceProvider: '', sourceReference: '',
    contactBasis: 'enquiry', sourceExplanation: '', assignedStaffId: '', notes: '',
  }
}

function emptyTemplateDraft(actorRole: string) {
  return {
    id: '', name: '', description: '', category: 'outreach', purpose: 'marketing',
    visibility: actorRole === 'agent' ? 'personal' : 'shared',
    status: actorRole === 'agent' ? 'draft' : 'published', subject: '', body: '',
  }
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

function melbourneToday() {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export default function ClientCrmWorkspace({
  portal = 'admin',
  initialOpportunityId = '',
}: {
  portal?: 'admin' | 'agent'
  initialOpportunityId?: string
}) {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [view, setView] = useState<'pipeline' | 'new' | 'templates'>('pipeline')
  const [leadDraft, setLeadDraft] = useState(emptyLeadDraft)
  const [templateDraft, setTemplateDraft] = useState(() => emptyTemplateDraft('owner'))
  const [compose, setCompose] = useState({ senderStaffId: '', templateId: '', subject: '', body: '' })
  const [leadEdit, setLeadEdit] = useState({ stage: 'new', notes: '', nextFollowUpAt: '', assignedStaffId: '', contactBasis: '', sourceProvider: '', sourceExplanation: '' })
  const [profileEdit, setProfileEdit] = useState({ businessName: '', firstName: '', lastName: '', positionTitle: '', email: '', phone: '', siteName: '', address: '', suburb: '', postcode: '' })
  const [noteDraft, setNoteDraft] = useState('')
  const [noteHistory, setNoteHistory] = useState<CrmOpportunity['internalNotes']>([])
  const [notesCursor, setNotesCursor] = useState<string | null>(null)
  const activeNotesOpportunityId = useRef('')
  const [wonOpen, setWonOpen] = useState(false)
  const [wonDraft, setWonDraft] = useState({ quoteId: '', acceptanceDate: melbourneToday(), acceptanceMethod: 'email', acceptanceNote: '' })
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')

  async function loadWorkspace(preferredLeadId?: string) {
    const response = await fetch('/api/admin/client-crm', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load the Client CRM.')
    const next = result as WorkspaceData
    setData(next)
    setTemplateDraft((current) => current.id || current.name ? current : emptyTemplateDraft(next.actor.role))
    const requestedLeadId = preferredLeadId || selectedLeadId || initialOpportunityId
    const nextLeadId = next.opportunities.some((opportunity) => opportunity.id === requestedLeadId)
      ? requestedLeadId
      : next.opportunities[0]?.id || ''
    setSelectedLeadId(nextLeadId)
  }

  useEffect(() => {
    loadWorkspace().catch((error) => setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load the Client CRM.' }))
    // The first load is intentionally isolated from selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    activeNotesOpportunityId.current = selectedLeadId
    if (!selectedLeadId) {
      setNoteHistory([])
      setNotesCursor(null)
      return
    }
    loadNotes(selectedLeadId).catch((error) => setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load internal notes.' }))
    // Notes are loaded independently so long histories do not crowd other clients out of the workspace response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId])

  const selectedLead = data?.opportunities.find((lead) => lead.id === selectedLeadId) ?? null
  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data?.opportunities ?? []
    return (data?.opportunities ?? []).filter((lead) => [lead.businessName, lead.contactName, lead.email, lead.postcode, lead.sourceProvider, lead.assignedStaffName].some((value) => value?.toLowerCase().includes(query)))
  }, [data?.opportunities, search])

  useEffect(() => {
    if (!selectedLead) return
    setLeadEdit({
      stage: selectedLead.stage || 'new',
      notes: selectedLead.notes || '',
      nextFollowUpAt: selectedLead.nextFollowUpAt ? selectedLead.nextFollowUpAt.slice(0, 16) : '',
      assignedStaffId: selectedLead.assignedStaffId || '',
      contactBasis: selectedLead.contactBasis || '',
      sourceProvider: selectedLead.sourceProvider || '',
      sourceExplanation: selectedLead.sourceExplanation || '',
    })
    setProfileEdit({
      businessName: selectedLead.businessName,
      firstName: selectedLead.firstName,
      lastName: selectedLead.lastName,
      positionTitle: selectedLead.positionTitle,
      email: selectedLead.email,
      phone: selectedLead.phone,
      siteName: selectedLead.siteName,
      address: selectedLead.address,
      suburb: selectedLead.suburb,
      postcode: selectedLead.postcode,
    })
    setNoteDraft('')
    const defaultSenderId = resolveDefaultCrmSenderId(
      data?.actor.id ?? '',
      selectedLead.assignedStaffId,
      data?.senders.map((sender) => sender.id) ?? [],
    )
    setCompose({ senderStaffId: defaultSenderId, templateId: '', subject: '', body: '' })
    setWonOpen(false)
    setWonDraft({
      quoteId: selectedLead.quotes.find((quote) => quote.hasFinalDocument)?.id ?? selectedLead.quotes[0]?.id ?? '',
      acceptanceDate: melbourneToday(),
      acceptanceMethod: 'email',
      acceptanceNote: '',
    })
  }, [data?.actor.id, data?.senders, selectedLead])

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/client-crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to complete this action.')
    return result
  }

  async function loadNotes(opportunityId: string, before?: string) {
    const params = new URLSearchParams({ notesFor: opportunityId })
    if (before) params.set('before', before)
    const response = await fetch(`/api/admin/client-crm?${params.toString()}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load internal notes.')
    if (activeNotesOpportunityId.current !== opportunityId) return
    setNoteHistory((current) => before ? [...current, ...(result.notes ?? [])] : (result.notes ?? []))
    setNotesCursor(typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null)
  }

  function chooseTemplate(templateId: string) {
    const template = data?.templates.find((item) => item.id === templateId)
    if (!template || !selectedLead) {
      setCompose((current) => ({ ...current, templateId: '', subject: '', body: '' }))
      return
    }
    const tokens = {
      business_name: selectedLead.businessName,
      contact_name: selectedLead.contactName,
      first_name: selectedLead.contactName.split(/\s+/)[0] || '',
      suburb: selectedLead.suburb,
      postcode: selectedLead.postcode,
      lead_source: selectedLead.sourceProvider || selectedLead.sourceType,
    }
    setCompose((current) => ({
      ...current,
      templateId,
      subject: applyCrmTemplateTokens(template.subject, tokens),
      body: applyCrmTemplateTokens(template.body, tokens),
    }))
  }

  async function createLead(event: React.FormEvent) {
    event.preventDefault()
    setBusy('lead')
    setStatus(null)
    try {
      const result = await post({ action: 'opportunity.create', ...leadDraft })
      setLeadDraft(emptyLeadDraft())
      setView('pipeline')
      await loadWorkspace(result.result?.id)
      setStatus({ type: 'success', message: 'Opportunity created and assigned using the selected agent or postcode coverage.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to create the opportunity.' })
    } finally {
      setBusy('')
    }
  }

  async function updateLead() {
    if (!selectedLead) return
    setBusy('lead-update')
    setStatus(null)
    try {
      await post({ action: 'opportunity.update', id: selectedLead.id, ...leadEdit })
      await loadWorkspace(selectedLead.id)
      setStatus({ type: 'success', message: 'Opportunity workflow updated.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update the opportunity.' })
    } finally {
      setBusy('')
    }
  }

  async function saveProfile() {
    if (!selectedLead) return
    setBusy('profile-update')
    setStatus(null)
    try {
      await post({
        action: 'client-record.update',
        opportunityId: selectedLead.id,
        city: selectedLead.city,
        expectedOpportunityUpdatedAt: selectedLead.updatedAt,
        expectedOrganisationUpdatedAt: selectedLead.organisationUpdatedAt,
        expectedContactUpdatedAt: selectedLead.contactUpdatedAt,
        expectedSiteUpdatedAt: selectedLead.siteUpdatedAt,
        ...profileEdit,
      })
      await loadWorkspace(selectedLead.id)
      setStatus({ type: 'success', message: 'Business, contact, and site details updated.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update the client details.' })
    } finally {
      setBusy('')
    }
  }

  async function addNote() {
    if (!selectedLead || !noteDraft.trim() || !globalThis.crypto?.randomUUID) return
    setBusy('note-add')
    setStatus(null)
    try {
      await post({
        action: 'opportunity-note.add',
        opportunityId: selectedLead.id,
        body: noteDraft,
        idempotencyKey: crypto.randomUUID(),
      })
      setNoteDraft('')
      await loadNotes(selectedLead.id)
      setStatus({ type: 'success', message: 'Internal CRM note added.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to add the note.' })
    } finally {
      setBusy('')
    }
  }

  async function closeWon() {
    if (!selectedLead) return
    setBusy('close-won')
    setStatus(null)
    try {
      const result = await post({
        action: 'opportunity.close-won',
        opportunityId: selectedLead.id,
        expectedUpdatedAt: selectedLead.updatedAt,
        ...wonDraft,
      })
      await loadWorkspace(selectedLead.id)
      setWonOpen(false)
      setStatus({ type: 'success', message: 'Opportunity closed as won and a draft contract product was created.' })
      const productId = result.result?.productId
      if (productId) {
        window.location.assign(portal === 'agent' && data?.actor.availabilityAssigneeId
          ? `/availability/products/${encodeURIComponent(data.actor.availabilityAssigneeId)}?product=${encodeURIComponent(productId)}`
          : `/admin/products?product=${encodeURIComponent(productId)}`)
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to close this opportunity as won.' })
    } finally {
      setBusy('')
    }
  }

  async function sendEmail() {
    if (!selectedLead || !globalThis.crypto?.randomUUID) return
    setBusy('email')
    setStatus(null)
    try {
      await post({
        action: 'email.send',
        opportunityId: selectedLead.id,
        senderStaffId: compose.senderStaffId,
        templateId: compose.templateId || null,
        subject: compose.subject,
        body: compose.body,
        idempotencyKey: crypto.randomUUID(),
      })
      await loadWorkspace(selectedLead.id)
      setStatus({ type: 'success', message: 'Email accepted by the provider and recorded in the opportunity history.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send the email.' })
    } finally {
      setBusy('')
    }
  }

  function editTemplate(template: CrmEmailTemplate) {
    setTemplateDraft({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      purpose: template.purpose,
      visibility: template.visibility,
      status: template.status,
      subject: template.subject,
      body: template.body,
    })
    setView('templates')
  }

  async function saveTemplate(event: React.FormEvent) {
    event.preventDefault()
    setBusy('template')
    setStatus(null)
    try {
      await post({ action: 'template.save', ...templateDraft })
      setTemplateDraft(emptyTemplateDraft(data?.actor.role ?? 'agent'))
      await loadWorkspace(selectedLeadId)
      setStatus({ type: 'success', message: 'Email template saved with a new audit version.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the template.' })
    } finally {
      setBusy('')
    }
  }

  if (!data) {
    return <div><AdminPageHeader title="Client CRM" description="Loading client records and outreach tools..." />{status ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{status.message}</p> : null}</div>
  }

  const canManageShared = data.actor.role === 'owner' || data.actor.role === 'manager'
  const selectedSender = data.senders.find((sender) => sender.id === compose.senderStaffId) ?? null
  const signatureMissing = selectedSender ? getMissingCrmSignatureFields(selectedSender) : ['sender']
  const hasUnresolvedEmail = selectedLead?.hasContactUnresolvedEmail ?? false
  const canSend = Boolean(selectedLead && selectedSender && !selectedLead.suppressed && !hasUnresolvedEmail && signatureMissing.length === 0 && compose.subject.trim() && compose.body.trim())

  return (
    <div>
      <AdminPageHeader
        title="Client CRM"
        description={portal === 'agent' ? 'Manage assigned opportunities, client follow-ups, quote history, and email activity.' : 'Capture enquiry intakes, assign regional agents, and keep each customer/site sales cycle connected to its full quote history.'}
        backHref={portal === 'agent' && data.actor.availabilityAssigneeId ? `/availability/quotes/${data.actor.availabilityAssigneeId}` : '/admin'}
        backLabel={portal === 'agent' ? 'Back to my quotes' : 'Back to overview'}
        actions={<div className="flex gap-2"><button type="button" onClick={() => setView('pipeline')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === 'pipeline' ? 'bg-teal-700 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>Pipeline</button><button type="button" onClick={() => setView('new')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === 'new' ? 'bg-teal-700 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>New opportunity</button><button type="button" onClick={() => setView('templates')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === 'templates' ? 'bg-teal-700 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>Templates</button></div>}
      />

      {status ? <div role={status.type === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl border p-4 text-sm ${status.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{status.message}</div> : null}
      {view === 'new' ? <form onSubmit={createLead} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">Create an opportunity</h2>
        <p className="mt-1 text-sm text-gray-600">One opportunity represents one customer/site sales cycle. The postcode suggests an agent automatically; an existing active opportunity for the same customer and site is reused by online quotes and cannot be duplicated manually.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">Business name<input required value={leadDraft.businessName} onChange={(event) => setLeadDraft({ ...leadDraft, businessName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Contact name<input required value={leadDraft.contactName} onChange={(event) => setLeadDraft({ ...leadDraft, contactName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Email<input required type="email" value={leadDraft.email} onChange={(event) => setLeadDraft({ ...leadDraft, email: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Phone<input value={leadDraft.phone} onChange={(event) => setLeadDraft({ ...leadDraft, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700 lg:col-span-2">Site address<input value={leadDraft.address} onChange={(event) => setLeadDraft({ ...leadDraft, address: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Suburb<input value={leadDraft.suburb} onChange={(event) => setLeadDraft({ ...leadDraft, suburb: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Postcode<input required inputMode="numeric" maxLength={4} value={leadDraft.postcode} onChange={(event) => setLeadDraft({ ...leadDraft, postcode: event.target.value.replace(/\D/g, '').slice(0, 4) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">City<select value={leadDraft.city} onChange={(event) => setLeadDraft({ ...leadDraft, city: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="melbourne">Melbourne</option><option value="sydney">Sydney</option></select></label>
          <label className="text-sm font-medium text-gray-700">Enquiry source<select value={leadDraft.sourceType} onChange={(event) => setLeadDraft({ ...leadDraft, sourceType: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">{sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-gray-700">Contact basis<select value={leadDraft.contactBasis} onChange={(event) => setLeadDraft({ ...leadDraft, contactBasis: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">{basisOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-gray-700">Provider or public source<input value={leadDraft.sourceProvider} onChange={(event) => setLeadDraft({ ...leadDraft, sourceProvider: event.target.value })} placeholder="Required for purchased/cold leads" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Provider reference<input value={leadDraft.sourceReference} onChange={(event) => setLeadDraft({ ...leadDraft, sourceReference: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          {canManageShared ? <label className="text-sm font-medium text-gray-700">Assigned regional agent<select value={leadDraft.assignedStaffId} onChange={(event) => setLeadDraft({ ...leadDraft, assignedStaffId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Automatic from postcode</option>{data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}</select></label> : null}
          <label className="text-sm font-medium text-gray-700 md:col-span-2 lg:col-span-3">Source explanation override<textarea rows={2} value={leadDraft.sourceExplanation} onChange={(event) => setLeadDraft({ ...leadDraft, sourceExplanation: event.target.value })} placeholder="Leave blank to generate the disclosure from the source fields." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700 md:col-span-2 lg:col-span-3">Internal notes<textarea rows={3} value={leadDraft.notes} onChange={(event) => setLeadDraft({ ...leadDraft, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        </div>
        <button type="submit" disabled={busy === 'lead'} className="mt-4 rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'lead' ? 'Creating...' : 'Create opportunity'}</button>
      </form> : null}

      {view === 'templates' ? <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><h2 className="font-bold text-gray-900">Stored templates</h2><div className="mt-3 space-y-2">{data.templates.map((template) => <button key={template.id} type="button" onClick={() => editTemplate(template)} className="block w-full rounded-xl border border-gray-200 p-3 text-left hover:border-teal-300"><span className="font-semibold text-gray-900">{template.name}</span><span className="mt-1 block text-xs text-gray-500">{template.visibility} - {template.status} - version {template.currentVersion}</span></button>)}</div></section>
        <form onSubmit={saveTemplate} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-gray-900">{templateDraft.id ? 'Edit template' : 'New template'}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">Name<input required value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Description<input value={templateDraft.description} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700">Purpose<span className="mt-1 block rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 font-normal">Client outreach</span><span className="mt-1 block text-xs font-normal text-gray-500">All CRM-composer emails respect marketing unsubscribe preferences.</span></label>
          <label className="text-sm font-medium text-gray-700">Visibility<select disabled={!canManageShared} value={templateDraft.visibility} onChange={(event) => setTemplateDraft({ ...templateDraft, visibility: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 disabled:bg-gray-100"><option value="shared">Shared</option><option value="personal">Personal</option></select></label>
          <label className="text-sm font-medium text-gray-700">Status<select disabled={!canManageShared} value={templateDraft.status} onChange={(event) => setTemplateDraft({ ...templateDraft, status: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 disabled:bg-gray-100"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
          <label className="text-sm font-medium text-gray-700 md:col-span-2">Subject<input required value={templateDraft.subject} onChange={(event) => setTemplateDraft({ ...templateDraft, subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-gray-700 md:col-span-2">Message<textarea required rows={10} value={templateDraft.body} onChange={(event) => setTemplateDraft({ ...templateDraft, body: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        </div><p className="mt-3 text-xs text-gray-500">Available fields: {'{{first_name}}'}, {'{{contact_name}}'}, {'{{business_name}}'}, {'{{suburb}}'}, {'{{postcode}}'}, {'{{lead_source}}'}. The agent signature and unsubscribe section are added automatically.</p><div className="mt-4 flex gap-3"><button type="submit" disabled={busy === 'template'} className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'template' ? 'Saving...' : 'Save template'}</button><button type="button" onClick={() => setTemplateDraft(emptyTemplateDraft(data.actor.role))} className="rounded-lg border border-gray-200 px-5 py-3 font-semibold text-gray-700">New template</button></div></form>
      </div> : null}

      {view === 'pipeline' ? <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business, contact, email or postcode" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /><div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">{filteredLeads.map((lead) => <button key={lead.id} type="button" onClick={() => setSelectedLeadId(lead.id)} className={`block w-full rounded-xl border p-3 text-left ${lead.id === selectedLeadId ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white'}`}><span className="block font-semibold text-gray-900">{lead.businessName || lead.email}</span><span className="block text-sm text-gray-600">{lead.contactName} - {lead.stage} - cycle {lead.cycleNumber}</span><span className="mt-1 block text-xs text-gray-500">{lead.assignedStaffName || 'Unassigned'} - {lead.postcode || 'Site to confirm'} - {lead.quotes.length} quote{lead.quotes.length === 1 ? '' : 's'}</span>{lead.suppressed ? <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Email suppressed</span> : null}</button>)}{filteredLeads.length === 0 ? <p className="p-3 text-sm text-gray-500">No matching opportunities.</p> : null}</div></section>
        {selectedLead ? <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-gray-900">Client and site details</h2><p className="mt-1 text-sm text-gray-600">Structured details used across this customer’s CRM records.</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-700">{selectedLead.sourceType.replaceAll('_', ' ')}</span></div>
            <fieldset disabled={!canManageShared} className="mt-5 grid gap-5 disabled:opacity-75 xl:grid-cols-3">
              <fieldset className="rounded-xl border border-gray-200 p-4"><legend className="px-1 text-sm font-bold text-gray-900">Business</legend><label className="mt-1 block text-sm font-medium text-gray-700">Business name<input value={profileEdit.businessName} onChange={(event) => setProfileEdit({ ...profileEdit, businessName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><p className="mt-2 text-xs text-gray-500">This name is shared across the organisation’s CRM records.</p></fieldset>
              <fieldset className="rounded-xl border border-gray-200 p-4"><legend className="px-1 text-sm font-bold text-gray-900">Primary contact</legend><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">First name<input value={profileEdit.firstName} onChange={(event) => setProfileEdit({ ...profileEdit, firstName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700">Last name<input value={profileEdit.lastName} onChange={(event) => setProfileEdit({ ...profileEdit, lastName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Position / title<input value={profileEdit.positionTitle} onChange={(event) => setProfileEdit({ ...profileEdit, positionTitle: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Email<input type="email" value={profileEdit.email} onChange={(event) => setProfileEdit({ ...profileEdit, email: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Phone<input type="tel" value={profileEdit.phone} onChange={(event) => setProfileEdit({ ...profileEdit, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div></fieldset>
              <fieldset className="rounded-xl border border-gray-200 p-4"><legend className="px-1 text-sm font-bold text-gray-900">Site</legend>{selectedLead.siteId ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700 sm:col-span-2">Site name<input value={profileEdit.siteName} onChange={(event) => setProfileEdit({ ...profileEdit, siteName: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Street address<input value={profileEdit.address} onChange={(event) => setProfileEdit({ ...profileEdit, address: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700">Suburb<input value={profileEdit.suburb} onChange={(event) => setProfileEdit({ ...profileEdit, suburb: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700">Postcode<input inputMode="numeric" maxLength={4} value={profileEdit.postcode} onChange={(event) => setProfileEdit({ ...profileEdit, postcode: event.target.value.replace(/\D/g, '').slice(0, 4) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">State / service region<span className="mt-1 block rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 font-normal">{selectedLead.state}</span></label></div> : <p className="text-sm text-gray-600">This opportunity does not yet have a confirmed site. Site details will become editable after inspection booking creates the canonical site record.</p>}</fieldset>
            </fieldset>
            {canManageShared ? <button type="button" onClick={() => void saveProfile()} disabled={busy === 'profile-update'} className="mt-4 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'profile-update' ? 'Saving details...' : 'Save client details'}</button> : <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Business, contact, and site details are shared across sales cycles. Ask an owner or manager to change them.</p>}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Opportunity workflow</h2>
            <p className="mt-1 text-sm text-gray-600">Manage this sales cycle without changing the customer’s identity or site details.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium text-gray-700">Stage<select value={leadEdit.stage} disabled={Boolean(selectedLead.productId)} onChange={(event) => { if (event.target.value === 'won') { setWonOpen(true); return } setLeadEdit({ ...leadEdit, stage: event.target.value }) }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 disabled:bg-gray-100">{stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
              <label className="text-sm font-medium text-gray-700">Next follow-up<input type="datetime-local" value={leadEdit.nextFollowUpAt} onChange={(event) => setLeadEdit({ ...leadEdit, nextFollowUpAt: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
              {canManageShared ? <label className="text-sm font-medium text-gray-700">Assigned agent<select value={leadEdit.assignedStaffId} onChange={(event) => setLeadEdit({ ...leadEdit, assignedStaffId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Unassigned</option>{data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}</select></label> : null}
              <label className="text-sm font-medium text-gray-700">Contact basis<select value={leadEdit.contactBasis} onChange={(event) => setLeadEdit({ ...leadEdit, contactBasis: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select basis</option>{basisOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm font-medium text-gray-700">Provider or public source<input value={leadEdit.sourceProvider} onChange={(event) => setLeadEdit({ ...leadEdit, sourceProvider: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
              <label id="crm-source-details" className="text-sm font-medium text-gray-700 md:col-span-2">Source explanation<textarea id="crm-source-explanation" rows={2} value={leadEdit.sourceExplanation} onChange={(event) => setLeadEdit({ ...leadEdit, sourceExplanation: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void updateLead()} disabled={busy === 'lead-update' || Boolean(selectedLead.productId)} className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'lead-update' ? 'Saving...' : 'Save workflow'}</button>{!selectedLead.productId && !['won', 'lost', 'cancelled'].includes(selectedLead.stage) ? <button type="button" onClick={() => setWonOpen(true)} className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white">Close as won & create product</button> : null}{selectedLead.productId ? <Link href={portal === 'agent' && data.actor.availabilityAssigneeId ? `/availability/products/${encodeURIComponent(data.actor.availabilityAssigneeId)}?product=${encodeURIComponent(selectedLead.productId)}` : `/admin/products?product=${encodeURIComponent(selectedLead.productId)}`} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">Open {selectedLead.productStatus} product</Link> : null}</div>
            {wonOpen ? <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4"><h3 className="font-bold text-green-950">Confirm the accepted contract</h3><p className="mt-1 text-sm text-green-900">This closes the opportunity and creates one editable draft product from the selected saved quote. The quote’s ordinary accepted status is not used because it can represent a site-inspection booking.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Winning saved quote<select value={wonDraft.quoteId} onChange={(event) => setWonDraft({ ...wonDraft, quoteId: event.target.value })} className="mt-1 w-full rounded-lg border border-green-200 bg-white px-3 py-2.5"><option value="">Select saved quote</option>{selectedLead.quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quoteRef} · {dateLabel(quote.createdAt)}{quote.finalQuoteSentAt ? ' · sent final' : quote.hasFinalDocument ? ' · reviewed final' : ' · saved quote'}</option>)}</select></label><label className="text-sm font-medium">Acceptance date<input type="date" max={melbourneToday()} value={wonDraft.acceptanceDate} onChange={(event) => setWonDraft({ ...wonDraft, acceptanceDate: event.target.value })} className="mt-1 w-full rounded-lg border border-green-200 px-3 py-2.5" /></label><label className="text-sm font-medium">Acceptance method<select value={wonDraft.acceptanceMethod} onChange={(event) => setWonDraft({ ...wonDraft, acceptanceMethod: event.target.value })} className="mt-1 w-full rounded-lg border border-green-200 bg-white px-3 py-2.5"><option value="email">Email</option><option value="signed_agreement">Signed agreement</option><option value="phone">Phone</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Acceptance evidence or note<input value={wonDraft.acceptanceNote} onChange={(event) => setWonDraft({ ...wonDraft, acceptanceNote: event.target.value })} placeholder="e.g. Accepted by email on 28 August" className="mt-1 w-full rounded-lg border border-green-200 px-3 py-2.5" /></label></div><div className="mt-4 flex gap-3"><button type="button" onClick={() => void closeWon()} disabled={busy === 'close-won' || !wonDraft.quoteId || wonDraft.acceptanceNote.trim().length < 3} className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'close-won' ? 'Creating product...' : 'Confirm win & create draft product'}</button><button type="button" onClick={() => setWonOpen(false)} className="rounded-lg border border-green-300 bg-white px-4 py-2.5 text-sm font-semibold text-green-900">Cancel</button></div>{selectedLead.quotes.length === 0 ? <p className="mt-3 text-sm font-semibold text-amber-800">Save a quote before closing this opportunity as won.</p> : null}</div> : null}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Internal CRM notes</h2>
            <p className="mt-1 text-sm text-gray-600">Add separate timestamped notes. These are internal only and never appear in client emails, quotes, or scopes.</p>
            <label className="mt-4 block text-sm font-medium text-gray-700">New note<textarea rows={3} maxLength={4000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Record a call, site detail, follow-up, or internal context" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
            <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-gray-500">{noteDraft.length}/4000 characters</span><button type="button" onClick={() => void addNote()} disabled={busy === 'note-add' || !noteDraft.trim()} className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'note-add' ? 'Adding note...' : 'Add note'}</button></div>
            <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">{noteHistory.map((note) => <article key={note.id} className="py-4"><p className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{note.body}</p><p className="mt-2 text-xs font-medium text-gray-500">{note.authorName} · {dateLabel(note.createdAt)}</p></article>)}{noteHistory.length === 0 ? <p className="py-4 text-sm text-gray-500">No internal notes have been added yet.</p> : null}</div>
            {notesCursor ? <button type="button" onClick={() => void loadNotes(selectedLead.id, notesCursor)} className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Load older notes</button> : null}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Email client</h2>
            <p className="mt-1 text-sm text-gray-600">To: <strong>{selectedLead.email}</strong>. Sender access, recipient details, contact source, signature, unsubscribe state, and unresolved sends are verified again when you send.</p>
            {selectedLead.suppressed ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This contact has unsubscribed or is suppressed. CRM outreach is disabled.</p> : null}
            {hasUnresolvedEmail ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A previous email has an unresolved delivery outcome. Reconcile it before sending again.</p> : null}
            {signatureMissing.length > 0 ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Sending as this person is disabled until Team Access has: {signatureMissing.join(', ')}.</p> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium text-gray-700">Send as
                {canManageShared ? <select value={compose.senderStaffId} onChange={(event) => setCompose({ ...compose, senderStaffId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                  {data.senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName} - {sender.jobTitle}</option>)}
                </select> : <span className="mt-1 block rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 font-normal">{selectedSender?.displayName ?? data.actor.displayName}</span>}
              </label>
              <label className="text-sm font-medium text-gray-700">Template<select value={compose.templateId} onChange={(event) => chooseTemplate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Custom marketing email</option>{data.templates.filter((template) => template.status === 'published' || template.createdByStaffId === data.actor.id).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label className="text-sm font-medium text-gray-700">Subject<input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
              <label className="text-sm font-medium text-gray-700 md:col-span-2 lg:col-span-3">Message<textarea rows={9} value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
            </div>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold text-gray-900">Email details</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { document.getElementById('crm-source-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('crm-source-explanation')?.focus() }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-teal-300 hover:text-teal-700">Edit source wording</button>
                  {data.actor.role === 'owner' && selectedSender ? <Link href={`/admin/staff?account=${encodeURIComponent(selectedSender.id)}&returnTo=${encodeURIComponent(`/admin/clients?opportunity=${selectedLead.id}`)}`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-teal-300 hover:text-teal-700">Edit sender details</Link> : null}
                </div>
              </div>
              <p className="mt-1 text-gray-600">Source: {selectedLead.sourceExplanation || 'Missing - sending blocked'}</p>
              {selectedSender ? <p className="mt-2 whitespace-pre-line text-gray-700">{`Kind regards,\n\n${selectedSender.displayName}\n${selectedSender.jobTitle}\nSecure Cleaning\n${selectedSender.phone}\n${selectedSender.email}\nsecurecleaning.com.au`}</p> : null}
              <p className="mt-2 text-xs text-gray-500">Source wording is saved with this client workflow. Sender details come from Team Access. The unsubscribe link and company footer are added automatically.</p>
            </div>
            <button type="button" onClick={() => void sendEmail()} disabled={!canSend || busy === 'email'} className="mt-4 rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'email' ? 'Sending...' : 'Send email'}</button>
            <p className="mt-2 text-xs text-gray-500">The system automatically checks sender permission, recipient consistency, contact source, unsubscribe status, signature completeness, and any unresolved prior send.</p>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Quote history</h2>
            <div className="mt-3 divide-y divide-gray-100">{selectedLead.quotes.map((quote) => {
              const opportunityQuery = `opportunity=${encodeURIComponent(selectedLead.id)}`
              const quoteHref = portal === 'agent' && data.actor.availabilityAssigneeId
                ? `/availability/quotes/${encodeURIComponent(data.actor.availabilityAssigneeId)}/${encodeURIComponent(quote.quoteRef)}?${opportunityQuery}`
                : `/admin/quotes/${encodeURIComponent(quote.quoteRef)}?${opportunityQuery}`
              return <div key={quote.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><Link href={quoteHref} className="font-semibold text-teal-700 hover:underline">#{quote.sequenceNumber} - {quote.quoteRef}</Link><p className="text-xs text-gray-500">{dateLabel(quote.createdAt)}</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">{quote.status}</span><Link href={quoteHref} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-teal-300 hover:text-teal-700">Open quote</Link></div></div>
            })}{selectedLead.quotes.length === 0 ? <p className="py-3 text-sm text-gray-500">No quotes are linked to this opportunity yet.</p> : null}</div>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-900">Activity</h2><div className="mt-3 divide-y divide-gray-100">{selectedLead.communications.map((item) => <div key={item.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-gray-900">{item.subject}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'sent' ? 'bg-green-100 text-green-700' : item.status === 'unknown' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{item.status}</span></div><p className="mt-1 text-xs text-gray-500">{item.senderName} - {dateLabel(item.sentAt || item.createdAt)}</p></div>)}{selectedLead.communications.length === 0 ? <p className="py-3 text-sm text-gray-500">No client emails have been sent from this opportunity.</p> : null}</div></section>
        </div> : <section className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600">Create or select an opportunity to begin.</section>}
      </div> : null}
    </div>
  )
}
