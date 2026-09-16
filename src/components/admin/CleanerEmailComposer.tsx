'use client'

import { useEffect, useState } from 'react'
import RichEmailComposer from '@/components/admin/RichEmailComposer'
import { createRichEmailContent } from '@/lib/richEmailContent'
import { CLEANER_EMAIL_MERGE_FIELDS } from '@/lib/emailMergeFields'
import type { CleanerEmailTemplate, CleanerRecord } from '@/lib/cleaners'
import type { CleanerEmailPreview, CleanerEmailResult } from '@/lib/cleanerEmailPolicy'
import { getAdminHeaders } from '@/lib/useAdminHeaders'

const defaultBody = 'Hi {{first_name}},\n\nWe are updating availability across our cleaner network.\n\nPlease reply with your current availability, preferred locations and the types of cleaning work you are interested in.\n\nThank you for keeping your details up to date.'
const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm'
export default function CleanerEmailComposer({ cleaners, templates, onClose }: { cleaners: CleanerRecord[]; templates: CleanerEmailTemplate[]; onClose: () => void }) {
  const [mode, setMode] = useState<'single' | 'multiple'>('single')
  const [emails, setEmails] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('Your availability with Secure Cleaning')
  const [body, setBody] = useState(defaultBody)
  const [bodyHtml, setBodyHtml] = useState('')
  const [bodyDocument, setBodyDocument] = useState<Record<string, unknown> | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [preview, setPreview] = useState<CleanerEmailPreview | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [result, setResult] = useState<CleanerEmailResult | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => { const saved = sessionStorage.getItem('cleaner-email-request'); if (saved) setRequestId(saved) }, [])
  const locked = Boolean(requestId)
  const invalidate = () => { setPreview(null); setConfirmed(false); setError('') }
  async function api(action: string) {
    const response = await fetch('/api/admin/cleaners/email', { method: 'POST', headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ action, emails, subject, body, bodyHtml, bodyDocument, templateId: templateId || null, fingerprint: preview?.fingerprint, requestId }) })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to complete email request.')
    return data
  }
  async function makePreview() {
    setBusy('preview'); setError('')
    try {
      if (mode === 'single' && emails.split(/[,;\n]+/).filter(value => value.trim()).length !== 1) throw new Error('Enter one email address, or choose Multiple cleaners.')
      const data = await api('preview')
      setPreview(data.preview); setPreviewIndex(0); setConfirmed(false)
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Unable to preview.') }
    finally { setBusy('') }
  }
  async function send() {
    if (!preview || !confirmed || requestId || busy) return
    const id = crypto.randomUUID()
    sessionStorage.setItem('cleaner-email-request', id)
    setRequestId(id); setBusy('send'); setError('')
    try {
      const response = await fetch('/api/admin/cleaners/email', { method: 'POST', headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', emails, subject, body, bodyHtml, bodyDocument, templateId: templateId || null, fingerprint: preview.fingerprint, requestId: id }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'The send result could not be confirmed.')
      setResult(data.result)
    } catch (issue) { setError(`${issue instanceof Error ? issue.message : 'The send result could not be confirmed.'} Use Check delivery status before sending another copy.`) }
    finally { setBusy('') }
  }
  async function checkStatus() {
    setBusy('status'); setError('')
    try { setResult((await api('status')).result) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Unable to check status.') }
    finally { setBusy('') }
  }
  function startNew() {
    if (!window.confirm('Start a separate email? This does not retry or cancel the previous send. Check any unknown or pending deliveries first to avoid duplicate emails.')) return
    sessionStorage.removeItem('cleaner-email-request')
    setRequestId(null); setResult(null); invalidate()
  }
  function close() {
    if (busy || (locked && !window.confirm('Close this email? Keep the request reference if any delivery is pending or unknown. Check email history before sending another copy.'))) return
    onClose()
  }
  const selected = preview?.recipients[previewIndex]
  return (
    <section aria-label="Email cleaners" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-[#1a2744] px-6 py-5 text-white">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-[#dec16e]">Secure Cleaning</p><h2 className="mt-1 text-xl font-bold">Email your cleaner network</h2><p className="mt-1 text-sm text-slate-200">A personal email to one cleaner, or separate copies to a selected group.</p></div>
        <button type="button" disabled={Boolean(busy)} onClick={close} className="rounded-lg border border-white/40 px-3 py-2 text-sm disabled:opacity-50">Close email</button>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <fieldset disabled={Boolean(busy) || locked} className="space-y-4 disabled:opacity-70">
            <legend className="mb-3 font-bold text-slate-900">1. Choose recipients</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="cleaner-email-mode" checked={mode === 'single'} onChange={() => { setMode('single'); setEmails(''); invalidate() }} /> One cleaner</label>
              <label className="flex items-center gap-2"><input type="radio" name="cleaner-email-mode" checked={mode === 'multiple'} onChange={() => { setMode('multiple'); invalidate() }} /> Multiple cleaners</label>
            </div>
            <label className="block text-sm font-medium">{mode === 'single' ? 'Cleaner email address' : 'Cleaner email addresses (up to 50)'}
              {mode === 'single' ? <><input type="email" list="cleaner-email-options" value={emails} onChange={event => { setEmails(event.target.value); invalidate() }} className={inputClass} placeholder="Select or enter a registered cleaner email" /><datalist id="cleaner-email-options">{cleaners.filter(cleaner => cleaner.status === 'approved').map(cleaner => <option key={cleaner.id} value={cleaner.email}>{cleaner.contact_name}</option>)}</datalist></> : <textarea rows={4} value={emails} onChange={event => { setEmails(event.target.value); invalidate() }} className={inputClass} placeholder="One email per line, or separated by commas" />}
            </label>
            {mode === 'multiple' ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEmails([...new Set([...emails.split(/[,;\n]+/).map(value => value.trim().toLowerCase()).filter(Boolean), ...cleaners.filter(cleaner => cleaner.status === 'approved').map(cleaner => cleaner.email.toLowerCase())])].join('\n')); invalidate() }} className="rounded-lg border px-3 py-2 text-xs font-semibold">Add approved cleaners on this page</button><button type="button" onClick={() => { setEmails(''); invalidate() }} className="px-3 py-2 text-xs text-slate-600">Clear recipients</button></div> : null}
            <p className="text-xs leading-relaxed text-slate-500">Only approved, subscribed cleaner records can receive this email. Rejected cleaners are excluded. Recipients never see each other&apos;s addresses. Page selections do not include other directory pages.</p>
          </fieldset>
          <fieldset disabled={Boolean(busy) || locked} className="space-y-4 disabled:opacity-70">
            <legend className="mb-3 font-bold text-slate-900">2. Write your message</legend>
            <label className="block text-sm font-medium">Email template<select value={templateId} onChange={event => { const id = event.target.value; setTemplateId(id); const template = templates.find(item => item.id === id); if (template) { setSubject(template.subject); setBody(template.body); setBodyHtml(template.body_html || ''); setBodyDocument(template.body_document || null); setEditorKey(key => key + 1) } invalidate() }} className={inputClass}><option value="">Custom / availability update</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
            <label className="block text-sm font-medium">Subject<input maxLength={240} value={subject} onChange={event => { setSubject(event.target.value); invalidate() }} className={inputClass} /></label>
            <RichEmailComposer value={createRichEmailContent({ text: body, html: bodyHtml, document: bodyDocument })} resetKey={`batch-${editorKey}`} disabled={Boolean(busy) || locked} mergeFields={CLEANER_EMAIL_MERGE_FIELDS.filter(field => ['first_name','last_name','name','company','city','suburb','state'].includes(field.key))} onChange={message => { setBody(message.text); setBodyHtml(message.html); setBodyDocument(message.document); invalidate() }} />
            <p className="text-xs text-slate-500">Personalise with {'{{first_name}}'}, {'{{contact_name}}'} or {'{{business_name}}'}. Your Team Access signature and an unsubscribe link are included automatically.</p>
            <button type="button" onClick={() => void makePreview()} disabled={!emails.trim() || !subject.trim() || !body.trim()} className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === 'preview' ? 'Checking recipients...' : 'Check recipients & preview'}</button>
          </fieldset>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {locked ? <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="break-all text-xs text-slate-600">Email request: {requestId}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void checkStatus()} className="rounded-lg border bg-white px-3 py-2 text-sm">Check delivery status</button><button type="button" disabled={Boolean(busy)} onClick={startNew} className="rounded-lg border bg-white px-3 py-2 text-sm">Start a new email</button></div><p className="text-xs text-slate-500">Pending or unknown deliveries are never resent automatically. Check provider history before trying a new send.</p></div> : null}
          {result ? <div role="status" className="space-y-2"><h3 className="font-bold">Delivery results</h3><p className="text-xs text-slate-500">Sent means accepted by the email provider, not confirmed inbox delivery.</p><ul className="max-h-64 overflow-auto divide-y rounded-lg border">{result.recipients.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm"><span className="break-all">{item.to_email}</span><strong>{({ sent: 'Sent', failed: 'Failed', skipped: 'Skipped', unknown: 'Unknown - check provider', sending: 'Pending - check provider', queued: 'Pending - not sent' } as Record<string, string>)[item.delivery_outcome] || 'Unknown'}</strong></li>)}</ul></div> : null}
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-bold text-slate-900">3. Review & send</h3>
          {preview && selected ? <><p className="mt-2 text-sm text-slate-600">{preview.recipients.length} eligible recipient{preview.recipients.length === 1 ? '' : 's'}. Replies go to {preview.sender.email}.</p><label className="mt-4 block text-sm font-medium">Preview recipient<select value={previewIndex} onChange={event => setPreviewIndex(Number(event.target.value))} className={inputClass}>{preview.recipients.map((recipient,index) => <option key={recipient.id} value={index}>{recipient.name} - {recipient.email}</option>)}</select></label><p className="my-3 break-words text-sm"><strong>Subject:</strong> {selected.subject}</p><iframe title="Cleaner email preview" sandbox="" srcDoc={selected.html} className="h-[580px] w-full rounded-lg border bg-white" /><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={locked || Boolean(busy)} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I have checked the content and recipient list.</label><button type="button" onClick={() => void send()} disabled={!confirmed || locked || Boolean(busy)} className="mt-3 w-full rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy === 'send' ? 'Sending separate emails...' : `Send to ${preview.recipients.length} cleaner${preview.recipients.length === 1 ? '' : 's'}`}</button></> : <div className="flex min-h-80 flex-col items-center justify-center text-center text-slate-500"><div className="mb-4 rounded-xl bg-white px-6 py-4 text-xl font-bold text-[#1a2744]">SECURE CLEANING <span className="text-[#b28a29]">AUS</span></div><p className="max-w-xs text-sm">Your personalised email preview will appear here after the recipients are checked.</p></div>}
        </div>
      </div>
    </section>
  )
}
