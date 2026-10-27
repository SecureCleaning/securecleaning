'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import ActionToast from '@/components/ActionToast'
import type { DocumentAction } from '@/lib/agreementDocumentPolicy'

type Event = { id: string; agreementId: string; version: number; action: DocumentAction; reason: string; actor: string; targetId: string | null; createdAt: string; beforeName: string | null; afterName: string | null }
type Documents = { agreements: { id: string; version: number; status: string }[]; revision: number; currentName: string | null; status: string; canReplace: boolean; reviewRequired: boolean; handoverCompleted: boolean; history: Event[] }
const labels = { replace: 'Replace incorrect upload', remove: 'Remove incorrect upload', support: 'Add supporting document', remove_support: 'Remove supporting document' }
const button = 'rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50'
export default function AgreementDocuments({ saleId, agreementId, onRefresh }: { saleId: string; agreementId: string; onRefresh: () => Promise<void> }) {
  const [selectedAgreementId, setSelectedAgreementId] = useState(agreementId)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Documents | null>(null)
  const [action, setAction] = useState<DocumentAction>('replace')
  const [target, setTarget] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [reason, setReason] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const url = `/api/admin/contract-sales/agreement-documents?saleId=${saleId}&agreementId=${selectedAgreementId}`
  const currentUrl = useRef(url)
  currentUrl.current = url
  const load = useCallback(async () => {
    const response = await fetch(url, { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Unable to load documents.')
    if (currentUrl.current === url) setData(body.result)
  }, [url])
  useEffect(() => { if (open) void load().catch(e => setError(e.message)) }, [open, load])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  const removed = new Set(data?.history.filter(row => row.action === 'remove_support').map(row => row.targetId))
  const support = data?.history.filter(row => row.agreementId === selectedAgreementId && row.action === 'support' && !removed.has(row.id)) ?? []
  const needsFile = action === 'replace' || action === 'support'
  async function save() {
    if (!data) return
    setBusy(true); setError(''); setMessage('')
    try {
      const form = new FormData()
      Object.entries({ saleId, agreementId: selectedAgreementId, action, reason, revision: String(data.revision), targetId: target }).forEach(([key, value]) => form.set(key, value))
      if (file) form.set('file', file)
      const response = await fetch('/api/admin/contract-sales/agreement-documents', { method: 'POST', body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to save document change.')
      setFile(null); setReason(''); setReviewed(false)
      setMessage('Document change saved with its history. No email was sent.')
      await load(); await onRefresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save document change.'); await load().catch(() => {}); setReviewed(false) }
    finally { setBusy(false) }
  }
  return <section className="mt-4 rounded-xl border border-gray-200 p-4">
    <button type="button" className={button} onClick={() => setOpen(!open)}>Manage signed documents</button>
    {open && <div className="mt-4 space-y-4">
      <p className="text-sm text-gray-600">Correct the uploaded PDF or add supporting pages. Previous files remain in restricted admin history. This does not change the contract terms.</p>
      {!data ? <p>Loading documents...</p> : <>
        <label className="block text-sm font-semibold">Agreement version<select value={selectedAgreementId} className="ml-2 rounded border p-2" disabled={busy} onChange={e => { setSelectedAgreementId(e.target.value); setData(null); setFile(null); setReason(''); setReviewed(false) }}>{data.agreements.map(row => <option key={row.id} value={row.id}>Version {row.version} - {row.status}</option>)}</select></label>
        <p><strong>Current signed PDF:</strong> {data.currentName || 'Signed agreement required'}</p>
        {data.reviewRequired && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-950">Signed agreement required. Upload the correct replacement before further handover approval. Any existing payment plan or completed handover needs admin review; payments and completed handovers have not been reversed.</p>}
        <label className="block text-sm font-semibold">Document action<select className="mt-1 w-full rounded-lg border p-2" value={action} onChange={e => { setAction(e.target.value as DocumentAction); setReviewed(false); setFile(null); setTarget('') }}>
          <option value="replace" disabled={!data.canReplace}>Replace incorrect upload</option>
          <option value="support">Add supporting document</option>
          <option value="remove" disabled={!data.currentName || data.status === 'void'}>Remove incorrect upload</option>
          <option value="remove_support" disabled={!support.length}>Remove supporting document</option>
        </select></label>
        {action === 'remove_support' && <label className="block">Supporting document<select value={target} onChange={e => { setTarget(e.target.value); setReviewed(false) }} className="ml-2 rounded border p-2"><option value="">Choose document</option>{support.map(row => <option key={row.id} value={row.id}>{row.afterName}</option>)}</select></label>}
        {needsFile && <label className="block">PDF (maximum 10 MB)<input key={`${action}-${data.revision}`} type="file" accept="application/pdf" className="mt-1 block" onChange={e => { setFile(e.target.files?.[0] ?? null); setReviewed(false) }} /></label>}
        {preview && <a href={preview} target="_blank" rel="noopener noreferrer" className={button}>Preview selected PDF</a>}
        <label className="block text-sm font-semibold">Reason for this change<textarea maxLength={1000} value={reason} onChange={e => { setReason(e.target.value); setReviewed(false) }} className="mt-1 w-full rounded-lg border p-2" /></label>
        {(action === 'remove' || action === 'replace') && <p className="text-sm text-amber-900">Confirm the file belongs to this sale and the correct cleaner. Removing the signed PDF makes this agreement unsigned. Existing payments and payment schedules remain unchanged.</p>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I have reviewed the selected document and this correction.</label>
        <button type="button" className={button} disabled={busy || !reviewed || reason.trim().length < 5 || (needsFile && !file) || (action === 'replace' && !data.canReplace) || (action === 'remove' && (!data.currentName || data.status === 'void')) || (action === 'remove_support' && !target)} onClick={() => void save()}>{busy ? 'Saving...' : labels[action]}</button>
        <h4 className="font-bold">Supporting documents</h4>
        {support.length ? support.map(row => <p key={row.id}><a className="text-teal-800 underline" href={`/api/admin/contract-sales/agreement-documents?saleId=${saleId}&agreementId=${row.agreementId}&eventId=${row.id}&side=after`}>{row.afterName}</a></p>) : <p className="text-sm text-gray-500">No supporting documents.</p>}
        <h4 className="font-bold">Document history</h4>
        {!data.history.length && <p className="text-sm text-gray-500">No corrections recorded.</p>}
        {data.history.map(row => <div key={row.id} className="rounded-lg bg-gray-50 p-3 text-sm"><strong>Agreement version {row.version} · {labels[row.action]}</strong><p>{new Date(row.createdAt).toLocaleString('en-AU')} · {row.actor}</p><p>{row.reason}</p>{row.beforeName && <p>Previous / removed: <a className="text-teal-800 underline" href={`/api/admin/contract-sales/agreement-documents?saleId=${saleId}&agreementId=${row.agreementId}&eventId=${row.id}&side=before`}>{row.beforeName}</a></p>}{row.afterName && <p>Uploaded: <a className="text-teal-800 underline" href={`/api/admin/contract-sales/agreement-documents?saleId=${saleId}&agreementId=${row.agreementId}&eventId=${row.id}&side=after`}>{row.afterName}</a></p>}</div>)}
      </>}
    </div>}
    {error && <ActionToast message={error} tone="error" onDismiss={() => setError('')} />}
    {message && <ActionToast message={message} tone="success" onDismiss={() => setMessage('')} />}
  </section>
}
