'use client'

import { useMemo, useState } from 'react'

export type AgentQuoteRow = {
  quoteRef: string
  status: string
  createdAt?: string | null
  businessName: string
  contactName: string
  city: string
  suburb: string
  postcode: string
  premisesType?: string
  frequency?: string
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AgentQuoteDashboard({
  assigneeId,
  assigneeName,
  city,
  quotes,
}: {
  assigneeId: string
  assigneeName: string
  city: string
  quotes: AgentQuoteRow[]
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const filteredQuotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    return quotes.filter((quote) => {
      if (status !== 'all' && quote.status !== status) return false
      if (!query) return true
      return [quote.quoteRef, quote.businessName, quote.contactName, quote.suburb, quote.postcode]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [quotes, search, status])

  const statuses = Array.from(new Set(quotes.map((quote) => quote.status))).sort()

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1a2744' }}>My regional quotes</h1>
            <p className="mt-2 text-gray-600">Quotes assigned to {assigneeName} in the {city} service region.</p>
          </div>
          <a href="/quote" target="_blank" rel="noreferrer" className="inline-flex rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
            + Create new quote
          </a>
        </div>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-medium text-gray-700">Search quotes</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, company, suburb or postcode" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="sm:w-48">
              <span className="mb-1 block text-sm font-medium text-gray-700">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="all">All statuses</option>
                {statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5 overflow-x-auto">
            {filteredQuotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-600">No quotes are currently assigned to this region.</div>
            ) : (
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-3">Quote</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Service</th>
                    <th className="px-3 py-3">Received</th>
                    <th className="px-3 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => (
                    <tr key={quote.quoteRef} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-4 align-top">
                        <div className="font-semibold text-gray-900">{quote.quoteRef}</div>
                        <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold capitalize text-gray-700">{quote.status.replaceAll('_', ' ')}</span>
                      </td>
                      <td className="px-3 py-4 align-top"><div className="font-semibold text-gray-900">{quote.businessName || 'Private customer'}</div><div className="text-gray-600">{quote.contactName || '—'}</div></td>
                      <td className="px-3 py-4 align-top text-gray-700">{quote.suburb || '—'} {quote.postcode}</td>
                      <td className="px-3 py-4 align-top capitalize text-gray-700">{quote.premisesType?.replaceAll('_', ' ') || '—'}<div className="text-xs text-gray-500">{quote.frequency?.replaceAll('_', ' ') || ''}</div></td>
                      <td className="px-3 py-4 align-top whitespace-nowrap text-gray-700">{formatDate(quote.createdAt)}</td>
                      <td className="px-3 py-4 text-right align-top"><a href={`/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(quote.quoteRef)}`} className="inline-flex rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700">Edit quote</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-4 text-xs text-gray-500">Showing {filteredQuotes.length} of {quotes.length} regional quote{quotes.length === 1 ? '' : 's'}.</p>
        </section>
      </div>
    </main>
  )
}
