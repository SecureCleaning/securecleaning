'use client'

import { useEffect, useRef, useState } from 'react'

type Preview = {
  to: string; from: string; replyTo: string; subject: string; html: string; fingerprint: string
  attachment: { filename: string; content: string }
}

export default function ContractSaleScopeEmail({ saleId, cancelled }: { saleId: string; cancelled: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const requestId = useRef('')
  useEffect(() => {
    if (!preview) { setPdfUrl(''); return }
    const bytes = Uint8Array.from(atob(preview.attachment.content), char => char.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [preview])

  async function request(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch('/api/admin/contract-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, saleId, ...extra }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to prepare the cleaner scope email.')
    return data.result
  }
  async function prepare() {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      const result = await request('scope-email.preview')
      requestId.current = crypto.randomUUID()
      setPreview(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview scope email.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function send() {
    if (!preview || lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      await request('scope-email.send', { fingerprint: preview.fingerprint, requestId: requestId.current })
      setMessage('Cleaner scope PDF sent to the email provider. Recorded in Follow Up history.')
      setPreview(null)
    } catch (error) {
      setPreview(null)
      setMessage(error instanceof Error ? error.message : 'Unable to send scope email. Check Follow Up history before trying again.')
    } finally { lock.current = false; setBusy(false) }
  }
  return <div className="mt-3">
    <button type="button" disabled={busy || cancelled} onClick={() => void prepare()} className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-700 disabled:opacity-50">{busy ? 'Working...' : 'Email cleaner scope PDF'}</button>
    {message ? <p role="status" className="mt-2 rounded-lg bg-gray-50 p-3 text-sm">{message}</p> : null}
    {preview ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="cleaner-scope-email-title">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b p-4"><h2 id="cleaner-scope-email-title" className="text-xl font-bold">Preview cleaner scope email</h2><button type="button" disabled={busy} onClick={() => setPreview(null)} className="rounded-lg border px-3 py-2">Close</button></header>
        <div className="overflow-y-auto p-4">
          <dl className="space-y-1 break-words text-sm"><div><dt className="inline font-bold">To: </dt><dd className="inline">{preview.to}</dd></div><div><dt className="inline font-bold">From: </dt><dd className="inline">{preview.from}</dd></div><div><dt className="inline font-bold">Reply to: </dt><dd className="inline">{preview.replyTo}</dd></div><div><dt className="inline font-bold">Subject: </dt><dd className="inline">{preview.subject}</dd></div></dl>
          <iframe title="Cleaner scope email message" sandbox="" srcDoc={preview.html} className="mt-3 h-52 w-full rounded-lg border" />
          <p className="my-3 text-sm"><strong>PDF attachment: </strong>{preview.attachment.filename} {pdfUrl ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-teal-700 underline">Open PDF preview</a> : null}</p>
          {pdfUrl ? <iframe title="Cleaner scope PDF attachment" src={pdfUrl} className="h-[42vh] w-full rounded-lg border" /> : null}
          <p className="mt-2 text-xs text-gray-600">The attached product scope excludes customer identity, contact details, street address and prices. This sends only to the cleaner shown above.</p>
        </div>
        <footer className="flex justify-end gap-3 border-t p-4"><button type="button" disabled={busy} onClick={() => setPreview(null)} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" disabled={busy || !pdfUrl} onClick={() => void send()} className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Sending...' : 'Confirm & send PDF'}</button></footer>
      </div>
    </div> : null}
  </div>
}
