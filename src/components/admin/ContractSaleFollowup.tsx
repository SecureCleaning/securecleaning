'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContractSale } from '@/lib/contractSales'
import { FOLLOWUP_TEMPLATES, followupDraft, type FollowupAudience } from '@/lib/contractSaleFollowupTemplates'
import { createRichEmailContent } from '@/lib/richEmailContent'
import RichEmailEditor from '@/components/admin/RichEmailComposer'
import EmailPreviewModal from '@/components/admin/EmailPreviewModal'

type Preview = { subject: string; html: string; to: string; from: string; fingerprint?: string }
type History = { id: string; audience: string; recipient: string; subject: string; html: string; sender_name: string; status: string; created_at: string }

export default function ContractSaleFollowup({ sale }: { sale: ContractSale }) {
  const [audience, setAudience] = useState<FollowupAudience>('client')
  const [templateId, setTemplateId] = useState('first-clean')
  const initial = followupDraft('first-clean', sale.clientName, sale.siteAddress)
  const [subject, setSubject] = useState<string>(initial.subject)
  const [content, setContent] = useState(() => createRichEmailContent({ text: initial.body }))
  const [editorKey, setEditorKey] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [history, setHistory] = useState<History[]>([])
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const [message, setMessage] = useState('')
  const [historyReady, setHistoryReady] = useState(false)
  const enabled = sale.inspection?.status === 'completed' && sale.status !== 'cancelled'
  const unresolved = history.some((item) => item.audience === audience && ['pending', 'unknown'].includes(item.status))
  const recipient = audience === 'client' ? sale.clientEmail : sale.cleanerEmail

  const request = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch('/api/admin/contract-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, saleId: sale.id, ...payload }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to complete the follow-up.')
    return result.result
  }, [sale.id])

  const loadHistory = useCallback(async () => {
    const result = await request('followup.history')
    setHistory(result.history); setHistoryReady(true)
  }, [request])
  useEffect(() => { void loadHistory().catch(() => setMessage('Email history could not be loaded. Reload the tab before sending.')) }, [loadHistory])

  function chooseTemplate(id: string, target = audience) {
    const draft = followupDraft(id, target === 'client' ? sale.clientName : sale.cleanerName, sale.siteAddress)
    setTemplateId(id); setSubject(draft.subject); setContent(createRichEmailContent({ text: draft.body })); setEditorKey((value) => value + 1); setPreview(null)
    requestId.current = crypto.randomUUID()
  }

  async function prepare() {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try { setPreview(await request('followup.preview', { audience, subject, body: content.text, bodyHtml: content.html })) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview email.') }
    finally { lock.current = false; setBusy(false) }
  }

  async function send() {
    if (!preview?.fingerprint || lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      await request('followup.send', { audience, subject, body: content.text, bodyHtml: content.html, fingerprint: preview.fingerprint, requestId: requestId.current })
      setPreview(null); setMessage('Follow-up email sent.'); requestId.current = crypto.randomUUID()
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Unable to send email.') }
    finally {
      try { await loadHistory() } catch { setHistoryReady(false); setMessage((value) => `${value} Email history could not be refreshed. Reload before sending again.`) }
      lock.current = false; setBusy(false)
    }
  }

  return <section className="space-y-5">
    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
      <div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-bold text-teal-950">Stay in touch</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-800">Optional</span></div>
      <p className="mt-2 text-sm text-teal-900">Check in after the first clean, follow up on a concern, or share feedback with your cleaner. Follow-ups never affect handover completion.</p>
    </div>
    {!enabled ? <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{sale.status === 'cancelled' ? 'This sale is cancelled. Previous follow-ups remain available below.' : 'Complete the inspection to start sending follow-ups. You can prepare your message below.'}</p> : null}
    {message ? <p role="status" className="rounded-lg border border-gray-200 bg-white p-3 text-sm">{message}</p> : null}
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold">Compose follow-up</h3>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        <legend className="sr-only">Follow-up email</legend>
        <div className="grid gap-3 sm:grid-cols-2">{(['client', 'cleaner'] as const).map((target) => <button key={target} type="button" aria-pressed={audience === target} onClick={() => { if (target !== audience && window.confirm('Switch recipient and replace this draft with a matching template?')) { setAudience(target); chooseTemplate(target === 'client' ? 'first-clean' : 'cleaner-performance', target) } }} className={`rounded-xl border p-4 text-left ${audience === target ? 'border-teal-600 bg-teal-50' : 'border-gray-200'}`}><strong className="block capitalize">Email {target}</strong><span className="mt-1 block break-all text-sm text-gray-600">{target === 'client' ? sale.clientEmail || 'No client email saved' : sale.cleanerEmail || 'No cleaner email saved'}</span></button>)}</div>
        <label className="block text-sm font-medium">Template<select value={templateId} onChange={(event) => { if (window.confirm('Replace the current draft with this template?')) chooseTemplate(event.target.value) }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">{FOLLOWUP_TEMPLATES.filter((item) => item.audience === audience).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p className="text-sm text-gray-500">{FOLLOWUP_TEMPLATES.find((item) => item.id === templateId)?.description} Edit the wording to suit this visit before sending.</p>
        <label className="block text-sm font-medium">Subject<input maxLength={200} value={subject} onChange={(event) => { setSubject(event.target.value); setPreview(null) }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
        <RichEmailEditor disabled={busy} value={content} resetKey={`followup-${editorKey}`} onChange={(value) => { setContent(value); setPreview(null) }} />
        <p className="text-xs text-gray-500">Your staff signature is added automatically. This message goes only to the selected recipient. Keep follow-ups about the cleaning service; use the client outreach tools for marketing.</p>
        {unresolved ? <p className="text-sm text-amber-800">A previous email has an uncertain delivery outcome. Check provider activity before sending another message to this recipient.</p> : null}
        <button type="button" onClick={() => void prepare()} disabled={!enabled || !historyReady || unresolved || !recipient || !subject.trim() || !content.text.trim()} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Working...' : 'Preview email'}</button>
      </fieldset>
    </div>
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Follow-up history</h3><p className="mt-1 text-sm text-gray-500">Client and cleaner touch points for this product sale.</p><div className="mt-3 divide-y divide-gray-100">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><strong className="text-sm">{item.subject}</strong><p className="mt-1 break-all text-sm text-gray-600">{item.audience === 'client' ? 'Client' : 'Cleaner'}: {item.recipient}</p><p className="mt-1 text-xs text-gray-500">{new Date(item.created_at).toLocaleString('en-AU')} - {item.sender_name} - {item.status === 'sent' ? 'Sent to email provider' : item.status}</p></div><button type="button" disabled={busy} onClick={() => setPreview({ subject: item.subject, html: item.html, to: item.recipient, from: item.sender_name })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">View email</button></div>)}{historyReady && !history.length ? <p className="py-5 text-sm text-gray-500">No follow-ups yet. Start with a first-clean check-in when you are ready.</p> : null}</div></div>
    <EmailPreviewModal open={Boolean(preview)} title={preview?.fingerprint ? 'Follow-up preview' : 'Follow-up email'} subject={preview?.subject ?? ''} html={preview?.html ?? ''} to={preview?.to} from={preview?.from} sending={busy} onClose={() => { if (!busy) setPreview(null) }} onSend={preview?.fingerprint ? () => void send() : undefined} />
  </section>
}
