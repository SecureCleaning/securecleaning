'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { CleanerEmailTemplate } from '@/lib/cleaners'
import { getAdminHeaders } from '@/lib/useAdminHeaders'
import EmailMergeFieldPicker from '@/components/admin/EmailMergeFieldPicker'
import { appendEmailMergeField, CLEANER_EMAIL_MERGE_FIELDS } from '@/lib/emailMergeFields'
import { createRichEmailContent } from '@/lib/richEmailContent'

const RichEmailEditor = dynamic(() => import('@/components/admin/RichEmailEditor'), { ssr: false })
const starters = [
  { name: 'Availability check', description: 'Check current capacity and preferred work.', subject: 'Your cleaning availability', body: 'Hi {{first_name}},\n\nWe are updating availability across the Secure Cleaning network. Please reply with your available days and times, preferred locations, team capacity and the types of cleaning work you are interested in.\n\nPlease also let us know how much notice you need before starting a new site.\n\nThank you for keeping your details up to date.' },
  { name: 'Cleaner network update', description: 'Invite cleaners to update their business and service details.', subject: 'Secure Cleaning network update', body: 'Hi {{first_name}},\n\nThank you for being part of the Secure Cleaning network. We are reviewing our cleaner records so we can contact you about suitable opportunities.\n\nPlease let us know if your contact details, service areas, services or team availability have changed. If everything is current, a quick reply confirming this would be appreciated.\n\nThank you for your continued support.' },
  { name: 'Document renewal', description: 'Request current compliance documents.', subject: 'Please review your cleaning compliance documents', body: 'Hi {{first_name}},\n\nWe are reviewing compliance records for {{business_name}}. Please check that your insurance, police checks and any required induction documents are current.\n\nPlease reply with updated copies of any renewed documents, including the expiry dates, or let us know when you expect to receive them.\n\nThank you for helping us keep your records up to date.' },
  { name: 'New site introduction', description: 'Start a discussion about a suitable cleaning opportunity.', subject: 'New cleaning opportunity with Secure Cleaning', body: 'Hi {{first_name}},\n\nWe have a cleaning opportunity that may suit {{business_name}}.\n\nPlease let us know whether you would like to discuss the site, scope of work, schedule and inspection arrangements. We will confirm those details with you before any work is agreed.\n\nPlease reply with a suitable time to call and your current availability.\n\nThank you.' },
  { name: 'Performance follow-up', description: 'Arrange a constructive service review.', subject: 'Cleaning service follow-up', body: 'Hi {{first_name}},\n\nWe would like to arrange a follow-up discussion about the cleaning service and any support your team may need.\n\nPlease reply with a suitable time to speak and any questions or updates you would like us to cover. We can then agree on the next steps and confirm them in writing.\n\nThank you for working with us to maintain a consistent service.' },
]
const blank = () => ({ id: '', name: '', description: '', subject: '', body: '', bodyHtml: '', bodyDocument: null as Record<string, unknown> | null, is_active: true })
const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5'

export default function CleanerEmailTemplates({ onSaved }: { onSaved: (template: CleanerEmailTemplate) => void }) {
  const [templates, setTemplates] = useState<CleanerEmailTemplate[]>([])
  const [draft, setDraft] = useState(blank)
  const [editorKey, setEditorKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/cleaners/templates', { headers: getAdminHeaders() }).then(async (response) => {
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load templates.')
      if (!cancelled) setTemplates(result.templates)
    }).catch((error) => { if (!cancelled) setMessage(error.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function replaceDraft(next: ReturnType<typeof blank>) {
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    setDraft(next)
    setDirty(false)
    setEditorKey((current) => current + 1)
    setMessage('')
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/cleaners/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAdminHeaders() }, body: JSON.stringify(draft) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save template.')
      const saved = result.template as CleanerEmailTemplate
      setTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
      setDraft((current) => ({ ...current, id: saved.id }))
      setDirty(false)
      onSaved(saved)
      setMessage('Template saved. Active templates are available when you next choose an email template.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save template.')
    } finally { setBusy(false) }
  }

  return <details className="rounded-xl border border-gray-200 bg-white p-5">
    <summary className="cursor-pointer text-lg font-bold text-gray-900">Email templates</summary>
    <p className="mt-2 text-sm text-gray-600">Create reusable cleaner emails or edit a saved template. Templates are shared with staff and regional agents. Saving a template does not send an email. Do not add a fixed staff signature here: the selected sender&apos;s Team Access signature is appended automatically when you preview and send.</p>
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
      <section><h2 className="font-bold text-gray-900">Stored templates</h2>
        {loading ? <p className="mt-3 text-sm">Loading templates...</p> : !templates.length ? <p className="mt-3 text-sm text-gray-500">No templates found. Create one using the form or a starter below.</p> : null}
        <div className="mt-3 space-y-2">{templates.map((template) => <button type="button" key={template.id} disabled={busy} onClick={() => replaceDraft({ id: template.id, name: template.name, description: template.description || '', subject: template.subject, body: template.body, bodyHtml: template.body_html || '', bodyDocument: template.body_document || null, is_active: template.is_active })} className={`block w-full rounded-xl border p-3 text-left ${draft.id === template.id ? 'border-teal-600 bg-teal-50' : 'border-gray-200'}`}><span className="font-semibold">{template.name}</span><span className="mt-1 block text-xs text-gray-500">{template.is_active ? 'Active' : 'Archived'}{template.description ? ` - ${template.description}` : ''}</span></button>)}</div>
        <h3 className="mt-5 font-semibold">Start from suggested wording</h3><p className="mt-1 text-xs text-gray-500">Choose a starter, review the wording, then save it with a unique name.</p>
        <div className="mt-2 flex flex-wrap gap-2">{starters.map((starter) => <button type="button" key={starter.name} disabled={busy} onClick={() => replaceDraft({ ...blank(), ...starter })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">{starter.name}</button>)}</div>
      </section>
      <form onSubmit={save}><fieldset disabled={busy} className="space-y-4"><legend className="mb-3 font-bold">{draft.id ? 'Edit template' : 'New template'}</legend>
        <label className="block text-sm font-medium">Name<input required maxLength={120} className={inputClass} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setDirty(true) }} /></label>
        <label className="block text-sm font-medium">Description<input maxLength={500} className={inputClass} value={draft.description} onChange={(event) => { setDraft({ ...draft, description: event.target.value }); setDirty(true) }} /></label>
        <label className="block text-sm font-medium">Status<select className={inputClass} value={draft.is_active ? 'active' : 'archived'} onChange={(event) => { setDraft({ ...draft, is_active: event.target.value === 'active' }); setDirty(true) }}><option value="active">Active</option><option value="archived">Archived</option></select></label>
        <label className="block text-sm font-medium">Subject<input required maxLength={240} className={inputClass} value={draft.subject} onChange={(event) => { setDraft({ ...draft, subject: event.target.value }); setDirty(true) }} /></label>
        <EmailMergeFieldPicker fields={CLEANER_EMAIL_MERGE_FIELDS} onInsert={(token) => { setDraft((current) => ({ ...current, subject: appendEmailMergeField(current.subject, token) })); setDirty(true) }} />
        <RichEmailEditor disabled={busy} value={createRichEmailContent({ text: draft.body, html: draft.bodyHtml, document: draft.bodyDocument })} resetKey={`cleaner-template-${editorKey}`} mergeFields={CLEANER_EMAIL_MERGE_FIELDS} onChange={(content) => { setDraft((current) => ({ ...current, body: content.text, bodyHtml: content.html, bodyDocument: content.document })); setDirty(true) }} />
        <p className="text-xs text-gray-500">Database fields use the selected cleaner&apos;s saved details during email preview. The network composer supports name, company and city/suburb/state fields; other fields require an individual cleaner email. Suburb and address refer to the cleaner, so enter new job details yourself. Preview each email before sending. Archiving removes a template from future selections and keeps email history.</p>
        <div className="flex gap-3"><button type="submit" className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Saving...' : 'Save template'}</button><button type="button" onClick={() => replaceDraft(blank())} className="rounded-lg border border-gray-300 px-5 py-3 font-semibold">New template</button></div>
      </fieldset></form>
    </div>
    {message ? <p role="status" className="mt-4 rounded-lg bg-gray-100 p-3 text-sm">{message}</p> : null}
  </details>
}
