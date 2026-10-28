'use client'
import { useEffect, useState } from 'react'
import type { VisibleAgreementDocuments } from '@/lib/agreementDocumentVisibility'
const date = (value: string | null) => value ? new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not recorded'
export default function AgreementDocumentSummary({ saleId, refreshKey }: { saleId: string; refreshKey: string }) {
  const [data, setData] = useState<VisibleAgreementDocuments | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const url = `/api/admin/contract-sales/agreement-documents?view=current&saleId=${saleId}`
  useEffect(() => {
    let cancelled = false
    setError('')
    void fetch(url, { cache: 'no-store' }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to load agreement documents.')
      if (!cancelled) setData(body.result)
    }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [url, refreshKey, refresh])
  return <section className="rounded-xl border border-teal-200 bg-teal-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Current agreement documents</h3><button type="button" className="text-sm font-semibold text-teal-800 underline" onClick={() => setRefresh(value => value + 1)}>Refresh documents</button></div>
    {error ? <p role="alert" className="mt-2 text-red-700">{error}</p> : !data ? <p className="mt-2 text-sm">Loading documents...</p> : <div className="mt-3 space-y-3">
      {data.updatedAt && <p className="text-sm font-semibold">Documents last updated: {date(data.updatedAt)}</p>}
      {data.signed ? <div><p className="font-semibold">{data.signed.replaced ? 'Updated signed agreement' : 'Signed agreement'} - version {data.signed.version}</p><a className="text-teal-800 underline" href={`/api/admin/contract-sales/agreements?saleId=${saleId}&agreementId=${data.signed.agreementId}`}>{data.signed.fileName}</a><p className="text-sm">Agreement updated: {date(data.signed.updatedAt)}</p></div> : <p className="text-sm">{data.correctionPending ? 'The incorrect signed upload was removed. A replacement signed agreement is required.' : 'No signed agreement has been uploaded for the current version.'}</p>}
      <div><h4 className="font-semibold">Supporting documents</h4>{data.supporting.length ? <ul className="mt-2 space-y-2">{data.supporting.map(row => <li key={row.id}><a className="text-teal-800 underline" href={`${url}&eventId=${row.id}`}>{row.fileName}</a><p className="text-sm">Uploaded {date(row.uploadedAt)} · Agreement version {row.version}</p></li>)}</ul> : <p className="text-sm">No supporting documents.</p>}</div>
    </div>}
  </section>
}
