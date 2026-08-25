'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { applyCrmTemplateTokens, getMissingCrmSignatureFields } from '@/lib/clientCrmPolicy'
import type { CrmAgentOption, CrmEmailTemplate, CrmOpportunity } from '@/lib/clientCrmData'
import type { StaffAccount } from '@/lib/staffAccounts'

type WorkspaceData = {
  opportunities: CrmOpportunity[]
  templates: CrmEmailTemplate[]
  agents: CrmAgentOption[]
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

export default function ClientCrmWorkspace({ portal = 'admin' }: { portal?: 'admin' | 'agent' }) {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [view, setView] = useState<'pipeline' | 'new' | 'templates'>('pipeline')
  const [leadDraft, setLeadDraft] = useState(emptyLeadDraft)
  const [templateDraft, setTemplateDraft] = useState(() => emptyTemplateDraft('owner'))
  const [compose, setCompose] = useState({ templateId: '', subject: '', body: '' })
  const [leadEdit, setLeadEdit] = useState({ stage: 'new', notes: '', nextFollowUpAt: '', assignedStaffId: '', contactBasis: '', sourceProvider: '', sourceExplanation: '' })
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
    const nextLeadId = preferredLeadId || selectedLeadId || next.opportunities[0]?.id || ''
    setSelectedLeadId(nextLeadId)
  }

  useEffect(() => {
    loadWorkspace().catch((error) => setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load the Client CRM.' }))
    // The first load is intentionally isolated from selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setCompose({ templateId: '', subject: '', body: '' })
  }, [selectedLead])

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

  function chooseTemplate(templateId: string) {
    const template = data?.templates.find((item) => item.id === templateId)
    if (!template || !selectedLead) {
      setCompose({ templateId: '', subject: '', body: '' })
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
    setCompose({
      templateId,
      subject: applyCrmTemplateTokens(template.subject, tokens),
      body: applyCrmTemplateTokens(template.body, tokens),
    })
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

  async function sendEmail() {
    if (!selectedLead || !globalThis.crypto?.randomUUID) return
    setBusy('email')
    setStatus(null)
    try {
      await post({
        action: 'email.send',
        opportunityId: selectedLead.id,
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
  const signatureMissing = getMissingCrmSignatureFields(data.actor)
  const hasUnresolvedEmail = selectedLead?.hasContactUnresolvedEmail ?? false
  const canSend = Boolean(selectedLead && !selectedLead.suppressed && !hasUnresolvedEmail && signatureMissing.length === 0 && compose.subject.trim() && compose.body.trim())

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
      {signatureMissing.length > 0 ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Client-email sending is disabled until Team Access has: {signatureMissing.join(', ')}.</div> : null}

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
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-gray-900">{selectedLead.businessName}</h2><p className="text-sm text-gray-600">{selectedLead.contactName} - {selectedLead.email} - {selectedLead.phone || 'No phone'}</p><p className="mt-1 text-sm text-gray-500">{[selectedLead.address, selectedLead.suburb, selectedLead.postcode, selectedLead.state].filter(Boolean).join(', ')}</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase text-gray-700">{selectedLead.sourceType.replaceAll('_', ' ')}</span></div><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium text-gray-700">Stage<select value={leadEdit.stage} onChange={(event) => setLeadEdit({ ...leadEdit, stage: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">{stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Next follow-up<input type="datetime-local" value={leadEdit.nextFollowUpAt} onChange={(event) => setLeadEdit({ ...leadEdit, nextFollowUpAt: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>{canManageShared ? <label className="text-sm font-medium text-gray-700">Assigned agent<select value={leadEdit.assignedStaffId} onChange={(event) => setLeadEdit({ ...leadEdit, assignedStaffId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Unassigned</option>{data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}</select></label> : null}<label className={`text-sm font-medium text-gray-700 ${canManageShared ? '' : 'md:col-span-2'}`}>Internal notes<textarea rows={2} value={leadEdit.notes} onChange={(event) => setLeadEdit({ ...leadEdit, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700">Contact basis<select value={leadEdit.contactBasis} onChange={(event) => setLeadEdit({ ...leadEdit, contactBasis: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select basis</option>{basisOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Provider or public source<input value={leadEdit.sourceProvider} onChange={(event) => setLeadEdit({ ...leadEdit, sourceProvider: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 md:col-span-2">Source explanation<textarea rows={2} value={leadEdit.sourceExplanation} onChange={(event) => setLeadEdit({ ...leadEdit, sourceExplanation: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><button type="button" onClick={() => void updateLead()} disabled={busy === 'lead-update'} className="mt-4 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'lead-update' ? 'Saving...' : 'Save workflow'}</button></section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-900">Email client</h2><p className="mt-1 text-sm text-gray-600">To: <strong>{selectedLead.email}</strong>. The saved contact, sender, Reply-To, source disclosure, signature, unsubscribe state, and footer are verified again on the server.</p>{selectedLead.suppressed ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This contact has unsubscribed or is suppressed. CRM outreach is disabled.</p> : null}{hasUnresolvedEmail ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A previous email has an unresolved delivery outcome. Reconcile it before sending again.</p> : null}<div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-gray-700">Template<select value={compose.templateId} onChange={(event) => chooseTemplate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Custom marketing email</option>{data.templates.filter((template) => template.status === 'published' || template.createdByStaffId === data.actor.id).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Subject<input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium text-gray-700 md:col-span-2">Message<textarea rows={9} value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"><div className="font-semibold text-gray-900">Fixed email details</div><p className="mt-1 text-gray-600">Source: {selectedLead.sourceExplanation || 'Missing - sending blocked'}</p><p className="mt-2 whitespace-pre-line text-gray-700">{`Kind regards,\n\n${data.actor.displayName}\n${data.actor.jobTitle}\nSecure Cleaning Aus\n${data.actor.phone}\n${data.actor.email}\nsecurecleaning.com.au\nABN 81 674 121 825`}</p><p className="mt-2 text-xs text-gray-500">The unsubscribe link and company footer are appended after this signature.</p></div><button type="button" onClick={() => void sendEmail()} disabled={!canSend || busy === 'email'} className="mt-4 rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'email' ? 'Sending...' : 'Check eligibility and send'}</button></section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-900">Quote history</h2><div className="mt-3 divide-y divide-gray-100">{selectedLead.quotes.map((quote) => <div key={quote.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><span className="font-semibold text-gray-900">#{quote.sequenceNumber} - {quote.quoteRef}</span><p className="text-xs text-gray-500">{dateLabel(quote.createdAt)}</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">{quote.status}</span></div>)}{selectedLead.quotes.length === 0 ? <p className="py-3 text-sm text-gray-500">No quotes are linked to this opportunity yet.</p> : null}</div></section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-900">Activity</h2><div className="mt-3 divide-y divide-gray-100">{selectedLead.communications.map((item) => <div key={item.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-gray-900">{item.subject}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'sent' ? 'bg-green-100 text-green-700' : item.status === 'unknown' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{item.status}</span></div><p className="mt-1 text-xs text-gray-500">{item.senderName} - {dateLabel(item.sentAt || item.createdAt)}</p></div>)}{selectedLead.communications.length === 0 ? <p className="py-3 text-sm text-gray-500">No client emails have been sent from this opportunity.</p> : null}</div></section>
        </div> : <section className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600">Create or select an opportunity to begin.</section>}
      </div> : null}
    </div>
  )
}
