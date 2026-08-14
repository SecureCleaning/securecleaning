'use client'

import { useState } from 'react'
import { getAgentCleanerPageCount } from '@/lib/cleanerAgentPolicy'
import type { AgentCleanerDetail, AgentCleanerEmailHistory, AgentCleanerRecord, AgentCleanerSummary, CleanerComment, CleanerEmailTemplate } from '@/lib/cleaners'

type Props = { assigneeId: string; agentName: string; state: string; initialCleaners: AgentCleanerSummary[]; initialTemplates: CleanerEmailTemplate[]; initialTotal: number }
type Notice = { type: 'success' | 'error'; message: string } | null

const nameOf = (cleaner: AgentCleanerSummary | AgentCleanerRecord) => [cleaner.first_name, cleaner.last_name].filter(Boolean).join(' ') || cleaner.contact_name
const dateOf = (value?: string | null) => value ? new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
function applyTokens(value: string, cleaner: AgentCleanerRecord) {
  return value.replaceAll('{{first_name}}', cleaner.first_name ?? cleaner.contact_name.split(' ')[0] ?? '').replaceAll('{{last_name}}', cleaner.last_name ?? '').replaceAll('{{contact_name}}', cleaner.contact_name).replaceAll('{{business_name}}', cleaner.business_name).replaceAll('{{city}}', cleaner.city ?? '').replaceAll('{{suburb}}', cleaner.suburb ?? '').replaceAll('{{state}}', cleaner.state ?? '')
}

export default function AgentCleaners({ assigneeId, agentName, state, initialCleaners, initialTemplates, initialTotal }: Props) {
  const [cleaners, setCleaners] = useState(initialCleaners)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [selected, setSelected] = useState<AgentCleanerDetail | null>(null)
  const [tab, setTab] = useState<'details' | 'comments' | 'email'>('details')
  const [comment, setComment] = useState('')
  const [templateId, setTemplateId] = useState(initialTemplates[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const pageCount = getAgentCleanerPageCount(total, pageSize)

  function chooseTemplate(id: string, cleaner: AgentCleanerRecord) {
    const template = initialTemplates.find((item) => item.id === id)
    setTemplateId(id); setSubject(applyTokens(template?.subject ?? '', cleaner)); setMessage(applyTokens(template?.body ?? '', cleaner))
  }
  async function loadPage(targetPage: number, submittedQuery = appliedQuery) {
    setBusy(true); setNotice(null)
    try {
      const params = new URLSearchParams({ query: submittedQuery, page: String(targetPage), pageSize: String(pageSize) })
      const response = await fetch(`/api/availability-agent/${assigneeId}/cleaners?${params}`); const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to search cleaners.')
      setCleaners(result.cleaners as AgentCleanerSummary[]); setTotal(Number(result.total ?? 0)); setPage(Number(result.page ?? targetPage))
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to search cleaners.' }) } finally { setBusy(false) }
  }
  async function search(event: React.FormEvent) { event.preventDefault(); setAppliedQuery(query); await loadPage(1, query) }
  async function openCleaner(cleanerId: string) {
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/availability-agent/${assigneeId}/cleaners/${cleanerId}`); const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load cleaner.')
      const detail = result as AgentCleanerDetail; setSelected(detail); setTab('details'); chooseTemplate(initialTemplates[0]?.id ?? '', detail.cleaner)
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load cleaner.' }) } finally { setBusy(false) }
  }
  async function addComment() {
    if (!selected || !comment.trim()) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/availability-agent/${assigneeId}/cleaners/${selected.cleaner.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) }); const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to add comment.')
      setSelected({ ...selected, comments: [result.comment as CleanerComment, ...selected.comments] }); setComment(''); setNotice({ type: 'success', message: 'Comment added.' })
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to add comment.' }) } finally { setBusy(false) }
  }
  async function sendEmail() {
    if (!selected || !subject.trim() || !message.trim()) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/availability-agent/${assigneeId}/cleaners/${selected.cleaner.id}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: templateId || null, subject, body: message }) }); const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to send email.')
      setSelected({ ...selected, emails: [result.email as AgentCleanerEmailHistory, ...selected.emails] }); setNotice({ type: 'success', message: 'Email sent and logged.' })
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send email.' }) } finally { setBusy(false) }
  }
  const noticeBox = notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{notice.message}</div> : null

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-[#1a2744]">{state} Cleaner Database</h1><p className="mt-2 text-gray-600">{agentName} can view and contact cleaners based in {state}. Cleaner records and email templates are read-only.</p></div>
    <form onSubmit={search} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row"><label className="sr-only" htmlFor="agent-cleaner-search">Search cleaners</label><input id="agent-cleaner-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, business, suburb, postcode or email" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-3" /><button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-60">Search</button></form>
    {!selected ? noticeBox : null}
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-100 px-5 py-4 text-sm text-gray-600">{total} cleaners in {state}</div><div className="divide-y divide-gray-100">{cleaners.map((cleaner) => <button key={cleaner.id} type="button" onClick={() => void openCleaner(cleaner.id)} className="grid w-full gap-2 px-5 py-4 text-left hover:bg-gray-50 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"><span><span className="block font-semibold text-gray-900">{nameOf(cleaner)}</span><span className="block text-sm text-gray-500">{cleaner.business_name}</span></span><span className="text-sm text-gray-600">{[cleaner.suburb, cleaner.state].filter(Boolean).join(', ')}<span className="block">{cleaner.email}</span></span><span className="self-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{cleaner.status.replaceAll('_', ' ')}</span></button>)}{cleaners.length === 0 ? <div className="px-5 py-10 text-center text-gray-500">No cleaners found in {state}.</div> : null}</div><div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 text-sm"><button type="button" disabled={busy || page <= 1} onClick={() => void loadPage(page - 1)} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40">Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={busy || page >= pageCount} onClick={() => void loadPage(page + 1)} className="rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-40">Next</button></div></section>
    {selected ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={`${nameOf(selected.cleaner)} cleaner record`}><div className="mx-auto my-6 max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-start justify-between border-b border-gray-200 p-5"><div><h2 className="text-xl font-bold text-[#1a2744]">{nameOf(selected.cleaner)}</h2><p className="text-sm text-gray-600">{selected.cleaner.business_name}</p></div><button type="button" onClick={() => { setSelected(null); setNotice(null) }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Close</button></div><div className="flex gap-2 border-b border-gray-200 px-5 py-3">{(['details', 'comments', 'email'] as const).map((value) => <button key={value} type="button" onClick={() => { setTab(value); setNotice(null) }} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === value ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-700'}`}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="space-y-4 p-5">{noticeBox}{tab === 'details' ? <dl className="grid gap-4 sm:grid-cols-2">{[['Email', selected.cleaner.email], ['Phone', selected.cleaner.phone], ['Address', [selected.cleaner.address, selected.cleaner.suburb, selected.cleaner.postcode, selected.cleaner.state].filter(Boolean).join(', ')], ['Services', selected.cleaner.services.join(', ')], ['Service areas', selected.cleaner.service_areas.join(', ')], ['Preferred work', selected.cleaner.preferred_work], ['Compliance', selected.cleaner.compliance_status], ['Internal notes', selected.cleaner.notes]].map(([label, value]) => <div key={label ?? ''}><dt className="text-xs font-bold uppercase text-gray-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{value || '—'}</dd></div>)}</dl> : null}
        {tab === 'comments' ? <div className="space-y-4"><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} maxLength={2000} placeholder="Add an internal comment" className="w-full rounded-lg border border-gray-300 p-3" /><button type="button" disabled={busy || !comment.trim()} onClick={() => void addComment()} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">Add comment</button><div className="space-y-3">{selected.comments.map((item) => <div key={item.id} className="rounded-lg bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-500">{item.author_name} · {dateOf(item.created_at)}</div><p className="mt-1 whitespace-pre-wrap text-sm">{item.comment}</p></div>)}{selected.comments.length === 0 ? <p className="text-sm text-gray-500">No comments yet.</p> : null}</div></div> : null}
        {tab === 'email' ? <div className="space-y-4"><p className="text-sm text-gray-600">To: <strong>{selected.cleaner.email}</strong>. Template edits apply only to this email.</p><label className="block text-sm font-semibold">Template<select value={templateId} onChange={(event) => chooseTemplate(event.target.value, selected.cleaner)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3"><option value="">Custom email</option>{initialTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="block text-sm font-semibold">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border border-gray-300 p-3" /></label><label className="block text-sm font-semibold">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={9} className="mt-1 w-full rounded-lg border border-gray-300 p-3" /></label><button type="button" disabled={busy || !subject.trim() || !message.trim()} onClick={() => void sendEmail()} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send email'}</button><div className="divide-y divide-gray-100">{selected.emails.map((email) => <div key={email.id} className="py-3 text-sm"><div className="font-semibold">{email.subject}</div><div className="text-xs text-gray-500">{dateOf(email.sent_at || email.created_at)} · {email.template_name || 'Custom email'} · {email.status}</div></div>)}{selected.emails.length === 0 ? <p className="py-3 text-sm text-gray-500">No emails sent yet.</p> : null}</div></div> : null}</div>
    </div></div> : null}
  </div>
}
