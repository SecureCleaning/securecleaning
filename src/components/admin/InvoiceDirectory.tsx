'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { invoiceWorkspaceHref, type InvoiceDirectoryRow } from '@/lib/invoiceDirectoryPolicy'

const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
const button = 'inline-flex min-h-10 items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-green-700 disabled:opacity-40'
export default function InvoiceDirectory({ assigneeId = '' }: { assigneeId?: string }) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<{ invoices: InvoiceDirectoryRow[]; hasMore: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setData(null)
    const params = new URLSearchParams({ q: search, status, page: String(page) })
    void fetch(`/api/admin/invoices?${params}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load invoices.')
      if (assigneeId && result.assigneeId !== assigneeId) throw new Error('Sign in to your own agent account to view invoices.')
      if (!controller.signal.aborted) setData(result)
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load invoices.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [assigneeId, search, status, page, refresh])
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-gray-900">Invoices</h1><p className="mt-1 text-sm text-gray-600">Find contract sale invoices and open their payment records.{assigneeId ? ' Only your assigned sales in your region are shown.' : ''}</p></div>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(0) }}>
      <label className="min-w-0 flex-1 text-sm font-semibold text-gray-700">Invoice number or purchaser<input className="mt-1 block min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Search invoices" /></label>
      <label className="text-sm font-semibold text-gray-700">Status<select className="mt-1 block min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" value={status} onChange={event => { setStatus(event.target.value); setPage(0) }}><option value="all">All invoices</option><option value="outstanding">Outstanding</option><option value="issued">Unpaid</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option></select></label>
      <button className={button}>Search</button><button type="button" className={button} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </form>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error} <button className={button} onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    <div aria-busy={loading} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      {loading ? <p role="status">Loading invoices...</p> : data?.invoices.length === 0 ? <p role="status" className="py-8 text-center text-gray-600">No invoices match this search.</p> : data ? <ul className="divide-y divide-gray-200">{data.invoices.map(invoice => <li key={invoice.id} className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
        <div className="min-w-0"><h2 className="break-words font-semibold text-gray-900">{invoice.invoiceNumber}</h2><p className="break-words text-sm text-gray-700">{invoice.purchaser}</p><p className="text-xs text-gray-500">{invoice.saleCode} | {invoice.status.replaceAll('_', ' ')}{invoice.dueOn ? ` | Due ${invoice.dueOn}` : ''}</p></div>
        <div className="text-sm tabular-nums"><p className="font-semibold text-gray-900">{invoice.status === 'void' ? 'Void invoice' : `${money(Math.max(0, invoice.totalCents - invoice.paidCents))} outstanding`}</p><p className="text-gray-600">Total {money(invoice.totalCents)} | Paid {money(invoice.paidCents)}</p></div>
        <Link className={button} href={invoiceWorkspaceHref(invoice.saleId, invoice.id, assigneeId)} aria-label={`Open invoice and payments for ${invoice.invoiceNumber}`}>Invoice &amp; payments</Link>
      </li>)}</ul> : null}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><span aria-live="polite" className="text-sm text-gray-600">Page {page + 1}{data ? ` - ${data.invoices.length} invoices` : ''}</span><div className="flex gap-2"><button type="button" className={button} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" className={button} disabled={loading || !data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
  </div>
}
