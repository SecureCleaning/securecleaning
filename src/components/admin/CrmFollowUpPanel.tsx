'use client'

import { useEffect, useState } from 'react'

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

export default function CrmFollowUpPanel({
  quotes,
  leads,
  onQuoteUpdated,
  onLeadUpdated,
}: {
  quotes: QuoteItem[]
  leads: LeadItem[]
  onQuoteUpdated?: (quoteRef: string, updates: Pick<QuoteItem, 'follow_up_status' | 'follow_up_notes'>) => void
  onLeadUpdated?: (leadId: string, updates: Pick<LeadItem, 'follow_up_status' | 'follow_up_notes'>) => void
}) {
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
  const [savingTarget, setSavingTarget] = useState<'quote' | 'lead' | null>(null)
  const quoteHasChanges = Boolean(
    selectedQuote && (
      quoteStatus !== (selectedQuote.follow_up_status ?? 'new') ||
      quoteNotes !== (selectedQuote.follow_up_notes ?? '')
    )
  )
  const leadHasChanges = Boolean(
    selectedLead && (
      leadStatus !== (selectedLead.follow_up_status ?? 'new') ||
      leadNotes !== (selectedLead.follow_up_notes ?? '')
    )
  )

  useEffect(() => {
    setQuoteStatus(selectedQuote?.follow_up_status ?? 'new')
    setQuoteNotes(selectedQuote?.follow_up_notes ?? '')
  }, [selectedQuote?.quote_ref, selectedQuote?.follow_up_notes, selectedQuote?.follow_up_status])

  useEffect(() => {
    setLeadStatus(selectedLead?.follow_up_status ?? 'new')
    setLeadNotes(selectedLead?.follow_up_notes ?? '')
  }, [selectedLead?.id, selectedLead?.follow_up_notes, selectedLead?.follow_up_status])

  async function saveQuote() {
    if (!selectedQuote) return
    setSavingTarget('quote')
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
      onQuoteUpdated?.(selectedQuote.quote_ref, {
        follow_up_status: quoteStatus,
        follow_up_notes: quoteNotes,
      })
      setStatus('Quote follow-up saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote follow-up.')
    } finally {
      setSavingTarget(null)
    }
  }

  async function saveLead() {
    if (!selectedLead) return
    setSavingTarget('lead')
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
      onLeadUpdated?.(selectedLead.id, {
        follow_up_status: leadStatus,
        follow_up_notes: leadNotes,
      })
      setStatus('Lead follow-up saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead follow-up.')
    } finally {
      setSavingTarget(null)
    }
  }

  function resetQuote() {
    setQuoteStatus(selectedQuote?.follow_up_status ?? 'new')
    setQuoteNotes(selectedQuote?.follow_up_notes ?? '')
    setStatus(null)
    setError(null)
  }

  function resetLead() {
    setLeadStatus(selectedLead?.follow_up_status ?? 'new')
    setLeadNotes(selectedLead?.follow_up_notes ?? '')
    setStatus(null)
    setError(null)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Quote follow-up</h2>
          <p className="mt-1 text-sm text-gray-600">Keep sales follow-up notes current so the dashboard reflects real pipeline movement.</p>
        </div>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Quote</span>
          <select value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} disabled={savingTarget === 'quote'} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500">
          {quotes.map((quote) => <option key={quote.quote_ref} value={quote.quote_ref}>{quote.quote_ref} — {quote.inputs?.businessName ?? 'Unknown'}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Follow-up status</span>
          <select value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value)} disabled={savingTarget === 'quote'} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500">
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={4} disabled={savingTarget === 'quote'} placeholder="Quote follow-up notes" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
          <div className="text-sm text-gray-600">{quoteHasChanges ? 'Quote changes are ready to save.' : 'No quote changes yet.'}</div>
          <button type="button" onClick={resetQuote} disabled={!quoteHasChanges || savingTarget === 'quote'} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Reset</button>
        </div>
        <button type="button" onClick={saveQuote} disabled={!quoteHasChanges || savingTarget !== null} className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#1a2744' }}>{savingTarget === 'quote' ? 'Saving quote follow-up…' : quoteHasChanges ? 'Save quote follow-up' : 'No changes to save'}</button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Lead follow-up</h2>
          <p className="mt-1 text-sm text-gray-600">Keep lead triage tight so new enquiries do not sit in the dashboard untouched.</p>
        </div>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Lead</span>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={savingTarget === 'lead'} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500">
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.business_name ?? lead.email}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Follow-up status</span>
          <select value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} disabled={savingTarget === 'lead'} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500">
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} rows={4} disabled={savingTarget === 'lead'} placeholder="Lead follow-up notes" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
          <div className="text-sm text-gray-600">{leadHasChanges ? 'Lead changes are ready to save.' : 'No lead changes yet.'}</div>
          <button type="button" onClick={resetLead} disabled={!leadHasChanges || savingTarget === 'lead'} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Reset</button>
        </div>
        <button type="button" onClick={saveLead} disabled={!leadHasChanges || savingTarget !== null} className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#1a2744' }}>{savingTarget === 'lead' ? 'Saving lead follow-up…' : leadHasChanges ? 'Save lead follow-up' : 'No changes to save'}</button>
      </div>

      {status ? <div className="lg:col-span-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{status}</div> : null}
      {error ? <div className="lg:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    </div>
  )
}
