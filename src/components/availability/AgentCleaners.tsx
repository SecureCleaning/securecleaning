'use client'

import { useState } from 'react'
import { getAgentCleanerPageCount } from '@/lib/cleanerAgentPolicy'
import type { AgentCleanerDetail, AgentCleanerEmailHistory, AgentCleanerRecord, AgentCleanerSummary, CleanerComment, CleanerDocument, CleanerEmailTemplate, CleanerStatus } from '@/lib/cleaners'

type Props = { assigneeId: string; agentName: string; state: string; initialCleaners: AgentCleanerSummary[]; initialTemplates: CleanerEmailTemplate[]; initialTotal: number }
type Notice = { type: 'success' | 'error'; message: string } | null
type Tab = 'details' | 'documents' | 'comments' | 'email'
type CleanerForm = {
  businessName: string; firstName: string; lastName: string; email: string; phone: string; alternatePhone: string; address: string; suburb: string; postcode: string; city: string; state: string; abn: string; status: CleanerStatus; services: string; serviceAreas: string; preferredWork: string; complianceStatus: string; insuranceExpiry: string; policeCheckExpiry: string; inductionExpiry: string; workingWithChildrenCheck: boolean; internalOwner: string; rating: string; notes: string
}

const statuses: CleanerStatus[] = ['lead', 'pending_approval', 'approved', 'paused', 'rejected', 'inactive']
const nameOf = (cleaner: AgentCleanerSummary | AgentCleanerRecord) => [cleaner.first_name, cleaner.last_name].filter(Boolean).join(' ') || cleaner.contact_name
const dateOf = (value?: string | null) => value ? new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const csv = (values?: string[] | null) => values?.join(', ') ?? ''
const list = (value: string) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean)

function blankForm(state: string): CleanerForm {
  return { businessName: '', firstName: '', lastName: '', email: '', phone: '', alternatePhone: '', address: '', suburb: '', postcode: '', city: state === 'NSW' ? 'Sydney' : state === 'VIC' ? 'Melbourne' : '', state, abn: '', status: 'lead', services: '', serviceAreas: '', preferredWork: '', complianceStatus: 'not_checked', insuranceExpiry: '', policeCheckExpiry: '', inductionExpiry: '', workingWithChildrenCheck: false, internalOwner: '', rating: '', notes: '' }
}

function formOf(cleaner: AgentCleanerRecord): CleanerForm {
  return { businessName: cleaner.business_name ?? '', firstName: cleaner.first_name ?? '', lastName: cleaner.last_name ?? '', email: cleaner.email ?? '', phone: cleaner.phone ?? '', alternatePhone: cleaner.alternate_phone ?? '', address: cleaner.address ?? '', suburb: cleaner.suburb ?? '', postcode: cleaner.postcode ?? '', city: cleaner.city ?? '', state: cleaner.state ?? '', abn: cleaner.abn ?? '', status: cleaner.status, services: csv(cleaner.services), serviceAreas: csv(cleaner.service_areas), preferredWork: cleaner.preferred_work ?? '', complianceStatus: cleaner.compliance_status ?? 'not_checked', insuranceExpiry: cleaner.insurance_expiry ?? '', policeCheckExpiry: cleaner.police_check_expiry ?? '', inductionExpiry: cleaner.induction_expiry ?? '', workingWithChildrenCheck: Boolean(cleaner.working_with_children_check), internalOwner: cleaner.internal_owner ?? '', rating: cleaner.rating == null ? '' : String(cleaner.rating), notes: cleaner.notes ?? '' }
}

function applyTokens(value: string, cleaner: AgentCleanerRecord) {
  return value.replaceAll('{{first_name}}', cleaner.first_name ?? cleaner.contact_name.split(' ')[0] ?? '').replaceAll('{{last_name}}', cleaner.last_name ?? '').replaceAll('{{contact_name}}', cleaner.contact_name).replaceAll('{{business_name}}', cleaner.business_name).replaceAll('{{city}}', cleaner.city ?? '').replaceAll('{{suburb}}', cleaner.suburb ?? '').replaceAll('{{state}}', cleaner.state ?? '')
}

export default function AgentCleaners({ assigneeId, agentName, state, initialCleaners, initialTemplates, initialTotal }: Props) {
  const apiBase = `/api/availability-agent/${assigneeId}/cleaners`
  const [cleaners, setCleaners] = useState(initialCleaners)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [selected, setSelected] = useState<AgentCleanerDetail | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CleanerForm>(() => blankForm(state))
  const [tab, setTab] = useState<Tab>('details')
  const [comment, setComment] = useState('')
  const [templateId, setTemplateId] = useState(initialTemplates[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [documentType, setDocumentType] = useState('other')
  const [documentExpiry, setDocumentExpiry] = useState('')
  const [documentNotes, setDocumentNotes] = useState('')
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const pageCount = getAgentCleanerPageCount(total, pageSize)
  const modalOpen = creating || Boolean(selected)

  function chooseTemplate(id: string, cleaner: AgentCleanerRecord) {
    const template = initialTemplates.find((item) => item.id === id)
    setTemplateId(id); setSubject(applyTokens(template?.subject ?? '', cleaner)); setMessage(applyTokens(template?.body ?? '', cleaner))
  }
  async function loadPage(targetPage: number, submittedQuery = appliedQuery) {
    setBusy(true); setNotice(null)
    try {
      const params = new URLSearchParams({ query: submittedQuery, page: String(targetPage), pageSize: String(pageSize) })
      const response = await fetch(`${apiBase}?${params}`); const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to search cleaners.')
      setCleaners(result.cleaners as AgentCleanerSummary[]); setTotal(Number(result.total ?? 0)); setPage(Number(result.page ?? targetPage))
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to search cleaners.' }) } finally { setBusy(false) }
  }
  async function search(event: React.FormEvent) { event.preventDefault(); setAppliedQuery(query); await loadPage(1, query) }
  function startCreate() { setCreating(true); setSelected(null); setForm(blankForm(state)); setTab('details'); setNotice(null) }
  async function openCleaner(cleanerId: string) {
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`${apiBase}/${cleanerId}`); const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load cleaner.')
      const detail = result as AgentCleanerDetail; setSelected(detail); setCreating(false); setForm(formOf(detail.cleaner)); setTab('details'); chooseTemplate(initialTemplates[0]?.id ?? '', detail.cleaner)
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load cleaner.' }) } finally { setBusy(false) }
  }
  async function saveCleaner(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null)
    const payload = { ...form, contactName: [form.firstName, form.lastName].filter(Boolean).join(' '), services: list(form.services), serviceAreas: list(form.serviceAreas), insuranceExpiry: form.insuranceExpiry || null, policeCheckExpiry: form.policeCheckExpiry || null, inductionExpiry: form.inductionExpiry || null, rating: form.rating ? Number(form.rating) : null }
    try {
      const response = await fetch(creating ? apiBase : `${apiBase}/${selected?.cleaner.id}`, { method: creating ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to save cleaner.')
      const cleaner = result.cleaner as AgentCleanerRecord
      setCleaners((current) => current.some((item) => item.id === cleaner.id) ? current.map((item) => item.id === cleaner.id ? cleaner : item) : [cleaner, ...current])
      if (creating) setTotal((current) => current + 1)
      setSelected((current) => ({ cleaner, comments: current?.comments ?? [], emails: current?.emails ?? [], documents: current?.documents ?? [] }))
      setCreating(false); setForm(formOf(cleaner)); setNotice({ type: 'success', message: 'Cleaner record saved.' })
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save cleaner.' }) } finally { setBusy(false) }
  }
  async function addComment() {
    if (!selected || !comment.trim()) return
    setBusy(true); setNotice(null)
    try { const response = await fetch(`${apiBase}/${selected.cleaner.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to add comment.'); setSelected({ ...selected, comments: [result.comment as CleanerComment, ...selected.comments] }); setComment(''); setNotice({ type: 'success', message: 'Comment added.' }) }
    catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to add comment.' }) } finally { setBusy(false) }
  }
  async function uploadDocument() {
    if (!selected || !documentFile) return
    setBusy(true); setNotice(null)
    try { const data = new FormData(); data.set('file', documentFile); data.set('documentType', documentType); data.set('expiryDate', documentExpiry); data.set('notes', documentNotes); const response = await fetch(`${apiBase}/${selected.cleaner.id}/documents`, { method: 'POST', body: data }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to upload document.'); setSelected({ ...selected, documents: [result.document as CleanerDocument, ...selected.documents] }); setDocumentFile(null); setDocumentExpiry(''); setDocumentNotes(''); setNotice({ type: 'success', message: 'Document uploaded.' }) }
    catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to upload document.' }) } finally { setBusy(false) }
  }
  async function deleteDocument(document: CleanerDocument) {
    if (!selected || !window.confirm(`Delete ${document.file_name}?`)) return
    setBusy(true); setNotice(null)
    try { const response = await fetch(`${apiBase}/${selected.cleaner.id}/documents/${document.id}`, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to delete document.'); setSelected({ ...selected, documents: selected.documents.filter((item) => item.id !== document.id) }); setNotice({ type: 'success', message: 'Document deleted.' }) }
    catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to delete document.' }) } finally { setBusy(false) }
  }
  async function sendEmail() {
    if (!selected || !subject.trim() || !message.trim()) return
    setBusy(true); setNotice(null)
    try { const response = await fetch(`${apiBase}/${selected.cleaner.id}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: templateId || null, subject, body: message }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to send email.'); setSelected({ ...selected, emails: [result.email as AgentCleanerEmailHistory, ...selected.emails] }); setNotice({ type: 'success', message: 'Email sent and logged.' }) }
    catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send email.' }) } finally { setBusy(false) }
  }

  const noticeBox = notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{notice.message}</div> : null
  const field = (key: keyof CleanerForm, label: string, options?: { type?: string; wide?: boolean; readOnly?: boolean }) => <label className={`text-sm ${options?.wide ? 'sm:col-span-2' : ''}`}><span className="mb-1 block font-medium text-gray-700">{label}</span><input type={options?.type ?? 'text'} value={String(form[key] ?? '')} readOnly={options?.readOnly} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 read-only:bg-gray-100" /></label>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-[#1a2744]">{state} Cleaner Database</h1><p className="mt-2 text-gray-600">{agentName} can create and manage all cleaner record details for {state}. Access is enforced to this region.</p></div><button type="button" onClick={startCreate} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white">Add cleaner</button></div>
    <form onSubmit={search} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row"><label className="sr-only" htmlFor="agent-cleaner-search">Search cleaners</label><input id="agent-cleaner-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, business, suburb, postcode or email" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-3" /><button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-60">Search</button></form>
    {!modalOpen ? noticeBox : null}
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-100 px-5 py-4 text-sm text-gray-600">{total} cleaners in {state}</div><div className="divide-y divide-gray-100">{cleaners.map((cleaner) => <button key={cleaner.id} type="button" onClick={() => void openCleaner(cleaner.id)} className="grid w-full gap-2 px-5 py-4 text-left hover:bg-gray-50 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"><span><span className="block font-semibold text-gray-900">{nameOf(cleaner)}</span><span className="block text-sm text-gray-500">{cleaner.business_name}</span></span><span className="text-sm text-gray-600">{[cleaner.suburb, cleaner.state].filter(Boolean).join(', ')}<span className="block">{cleaner.email}</span></span><span className="self-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{cleaner.status.replaceAll('_', ' ')}</span></button>)}{cleaners.length === 0 ? <div className="px-5 py-10 text-center text-gray-500">No cleaners found in {state}.</div> : null}</div><div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 text-sm"><button type="button" disabled={busy || page <= 1} onClick={() => void loadPage(page - 1)} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40">Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={busy || page >= pageCount} onClick={() => void loadPage(page + 1)} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40">Next</button></div></section>
    {modalOpen ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Cleaner record"><div className="mx-auto my-6 max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-start justify-between border-b border-gray-200 p-5"><div><h2 className="text-xl font-bold text-[#1a2744]">{creating ? 'Add cleaner' : nameOf(selected!.cleaner)}</h2><p className="text-sm text-gray-600">{creating ? `New ${state} cleaner record` : selected!.cleaner.business_name}</p></div><button type="button" onClick={() => { setSelected(null); setCreating(false); setNotice(null) }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Close</button></div><div className="flex flex-wrap gap-2 border-b border-gray-200 px-5 py-3">{(['details', 'documents', 'comments', 'email'] as Tab[]).map((value) => <button key={value} type="button" disabled={creating && value !== 'details'} onClick={() => { setTab(value); setNotice(null) }} className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40 ${tab === value ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-700'}`}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="space-y-4 p-5">{noticeBox}{tab === 'details' ? <form onSubmit={saveCleaner} className="grid gap-4 sm:grid-cols-2">{field('businessName', 'Business name')}{field('abn', 'ABN')}{field('firstName', 'First name')}{field('lastName', 'Surname')}{field('email', 'Email', { type: 'email' })}{field('phone', 'Phone')}{field('alternatePhone', 'Alternate phone')}{field('address', 'Street address')}{field('suburb', 'Suburb')}{field('postcode', 'Postcode')}{field('city', 'City')}{field('state', 'State', { readOnly: true })}<label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CleanerStatus })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2">{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>{field('complianceStatus', 'Compliance status')}{field('services', 'Services (comma separated)', { wide: true })}{field('serviceAreas', 'Service areas (comma separated)', { wide: true })}{field('preferredWork', 'Preferred work', { wide: true })}{field('insuranceExpiry', 'Insurance expiry', { type: 'date' })}{field('policeCheckExpiry', 'Police check expiry', { type: 'date' })}{field('inductionExpiry', 'Induction expiry', { type: 'date' })}{field('internalOwner', 'Internal owner')}{field('rating', 'Internal rating', { type: 'number' })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.workingWithChildrenCheck} onChange={(event) => setForm({ ...form, workingWithChildrenCheck: event.target.checked })} /> Working with children check</label><label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-gray-700">Internal notes</span><textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full rounded-lg border border-gray-300 p-3" /></label><div className="sm:col-span-2"><button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save cleaner'}</button></div></form> : null}
        {tab === 'documents' && selected ? <div className="space-y-4"><div className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><label className="text-sm font-semibold">Document type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3">{['insurance', 'police_check', 'induction', 'contract', 'other'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-sm font-semibold">Expiry date<input type="date" value={documentExpiry} onChange={(event) => setDocumentExpiry(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-3" /></label><label className="text-sm font-semibold sm:col-span-2">Notes<input value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-3" /></label><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} className="text-sm" /><button type="button" disabled={busy || !documentFile} onClick={() => void uploadDocument()} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">Upload document</button></div><div className="divide-y divide-gray-100">{selected.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><div className="font-semibold">{document.file_name}</div><div className="text-xs text-gray-500">{document.document_type.replaceAll('_', ' ')} · expiry {document.expiry_date || 'not set'}</div></div><div className="flex gap-2"><a href={`${apiBase}/${selected.cleaner.id}/documents/${document.id}`} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold">Download</a><button type="button" onClick={() => void deleteDocument(document)} className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700">Delete</button></div></div>)}{selected.documents.length === 0 ? <p className="text-sm text-gray-500">No documents uploaded.</p> : null}</div></div> : null}
        {tab === 'comments' && selected ? <div className="space-y-4"><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} maxLength={2000} placeholder="Add an internal comment" className="w-full rounded-lg border border-gray-300 p-3" /><button type="button" disabled={busy || !comment.trim()} onClick={() => void addComment()} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">Add comment</button><div className="space-y-3">{selected.comments.map((item) => <div key={item.id} className="rounded-lg bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-500">{item.author_name} · {dateOf(item.created_at)}</div><p className="mt-1 whitespace-pre-wrap text-sm">{item.comment}</p></div>)}{selected.comments.length === 0 ? <p className="text-sm text-gray-500">No comments yet.</p> : null}</div></div> : null}
        {tab === 'email' && selected ? <div className="space-y-4"><p className="text-sm text-gray-600">To: <strong>{selected.cleaner.email}</strong>. Template edits apply only to this email.</p><label className="block text-sm font-semibold">Template<select value={templateId} onChange={(event) => chooseTemplate(event.target.value, selected.cleaner)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3"><option value="">Custom email</option>{initialTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="block text-sm font-semibold">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border border-gray-300 p-3" /></label><label className="block text-sm font-semibold">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={9} className="mt-1 w-full rounded-lg border border-gray-300 p-3" /></label><button type="button" disabled={busy || !subject.trim() || !message.trim()} onClick={() => void sendEmail()} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send email'}</button><div className="divide-y divide-gray-100">{selected.emails.map((email) => <div key={email.id} className="py-3 text-sm"><div className="font-semibold">{email.subject}</div><div className="text-xs text-gray-500">{dateOf(email.sent_at || email.created_at)} · {email.template_name || 'Custom email'} · {email.status}</div></div>)}{selected.emails.length === 0 ? <p className="py-3 text-sm text-gray-500">No emails sent yet.</p> : null}</div></div> : null}</div>
    </div></div> : null}
  </div>
}
