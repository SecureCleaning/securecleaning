'use client'

import { useState } from 'react'

type QuoteItem = {
  quote_ref: string
  follow_up_status?: string | null
  follow_up_notes?: string | null
  inputs?: { businessName?: string }
}

type LeadItem = {
  id: string
  business_name?: string | null
  email: string
  follow_up_status?: string | null
  follow_up_notes?: string | null
}

const statuses = ['new', 'contacted', 'qualified', 'won', 'lost']

export default function CrmFollowUpPanel({ quotes, leads }: { quotes: QuoteItem[]; leads: LeadItem[] }) {
  const [quoteRef, setQuoteRef] = useState(quotes[0]?.quote_ref ?? '')
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '')
  const selectedQuote = quotes.find((quote) => quote.quote_ref === quoteRef) ?? quotes[0]
  const selectedLead = leads.find((lead) => lead.id === leadId) ?? leads[0]
  const [quoteStatus, setQuoteStatus] = useState(selectedQuote?.follow_up_status ?? 'new')
  const [quoteNotes, setQuoteNotes] = useState(selectedQuote?.follow_up_notes ?? '')
  const [leadStatus, setLeadStatus] = useState(selectedLead?.follow_up_status ?? 'new')
  const [leadNotes, setLeadNotes] = useState(selectedLead?.follow_up_notes ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function saveQuote() {
    if (!selectedQuote) return
    setStatus(null)
    setError(null)
    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quote.followUp', quoteRef: selectedQuote.quote_ref, status: quoteStatus, notes: quoteNotes }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to save quote follow-up.')
      setStatus('Quote follow-up saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote follow-up.')
    }
  }

  async function saveLead() {
    if (!selectedLead) return
    setStatus(null)
    setError(null)
    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lead.followUp', leadId: selectedLead.id, status: leadStatus, notes: leadNotes }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to save lead follow-up.')
      setStatus('Lead follow-up saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead follow-up.')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Quote follow-up</h2>
        <select value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
          {quotes.map((quote) => <option key={quote.quote_ref} value={quote.quote_ref}>{quote.quote_ref} — {quote.inputs?.businessName ?? 'Unknown'}</option>)}
        </select>
        <select value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={4} placeholder="Quote follow-up notes" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        <button type="button" onClick={saveQuote} className="w-full rounded-lg px-4 py-3 font-semibold text-white" style={{ backgroundColor: '#1a2744' }}>Save quote follow-up</button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Lead follow-up</h2>
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.business_name ?? lead.email}</option>)}
        </select>
        <select value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <textarea value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} rows={4} placeholder="Lead follow-up notes" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        <button type="button" onClick={saveLead} className="w-full rounded-lg px-4 py-3 font-semibold text-white" style={{ backgroundColor: '#1a2744' }}>Save lead follow-up</button>
      </div>

      {status ? <div className="lg:col-span-2 text-sm text-green-600">{status}</div> : null}
      {error ? <div className="lg:col-span-2 text-sm text-red-600">{error}</div> : null}
    </div>
  )
}
