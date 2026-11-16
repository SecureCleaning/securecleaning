'use client'

import { useRef, useState } from 'react'
import RichEmailEditor from '@/components/admin/RichEmailEditor'
import EmailMergeFieldPicker from '@/components/admin/EmailMergeFieldPicker'
import { appendEmailMergeField } from '@/lib/emailMergeFields'
import { createRichEmailContent } from '@/lib/richEmailContent'
import { QUOTE_EMAIL_FIELDS, type QuoteEmailTemplate } from '@/lib/quoteEmailTemplate'

export default function QuoteEmailTemplateEditor() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<QuoteEmailTemplate | null>(null)
  const [saved, setSaved] = useState<QuoteEmailTemplate | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const lock = useRef(false)
  async function request(action: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/quote-email-template', { method: action.endsWith('update') ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: action.endsWith('update') ? JSON.stringify(draft) : undefined })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load or save the quote email template.')
      setDraft(data.template); setSaved(data.template); setResetKey(key => key + 1)
      if (action.endsWith('update')) setMessage('Quote email template saved for future drafts.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save template.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
    <button type="button" aria-expanded={open} disabled={busy} onClick={() => { setOpen(!open); if (!open && !draft) void request('quote-email-template.get') }} className="flex w-full items-center justify-between gap-4 p-5 text-left"><span><strong className="block text-lg">Quote email template</strong><span className="text-sm text-gray-600">Edit the default subject and message sent with the quote links and terms PDF.</span></span><span className="text-sm font-semibold text-teal-700">{open ? 'Close' : 'Edit template'}</span></button>
    {open ? <div className="space-y-4 border-t p-5">
      <p className="text-sm text-gray-600">Admins and agents can personalise each email before previewing and sending it. Saving this template changes future drafts only.</p>
      {message ? <p role="status" className="rounded-lg bg-gray-50 p-3 text-sm">{message}</p> : null}
      {draft ? <>
        <label className="block text-sm font-medium">Template subject<input value={draft.subject} maxLength={180} disabled={busy} onChange={event => setDraft({ ...draft, subject: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <EmailMergeFieldPicker fields={QUOTE_EMAIL_FIELDS} onInsert={token => setDraft({ ...draft, subject: appendEmailMergeField(draft.subject, token) })} />
        <RichEmailEditor label="Template message" value={createRichEmailContent({ text: draft.bodyText, html: draft.bodyHtml, document: draft.bodyDocument })} resetKey={`scope-template-${resetKey}`} disabled={busy} mergeFields={QUOTE_EMAIL_FIELDS} onChange={content => setDraft({ ...draft, bodyText: content.text, bodyHtml: content.html, bodyDocument: content.document })} />
        <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => void request('quote-email-template.update')} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Save quote email template</button><button type="button" disabled={busy} onClick={() => { setDraft(saved); setResetKey(key => key + 1); setMessage('') }} className="rounded-lg border px-4 py-2">Discard edits</button></div>
      </> : <button type="button" disabled={busy} onClick={() => void request('quote-email-template.get')} className="rounded-lg border px-3 py-2">{busy ? 'Loading...' : 'Retry loading template'}</button>}
    </div> : null}
  </section>
}
