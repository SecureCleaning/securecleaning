'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CrmAssignedQuoteOpportunityContext } from '@/lib/clientCrmQuoteAccess'

type Status = { type: 'error'; message: string } | null

function melbourneToday() {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export default function AgentQuoteWinAction({
  assigneeId,
  quoteId,
  quoteRef,
  opportunity,
}: {
  assigneeId: string
  quoteId: string
  quoteRef: string
  opportunity: CrmAssignedQuoteOpportunityContext | null
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [acceptanceDate, setAcceptanceDate] = useState(melbourneToday)
  const [acceptanceMethod, setAcceptanceMethod] = useState('email')
  const [acceptanceNote, setAcceptanceNote] = useState('')
  const clientsPath = `/availability/clients/${encodeURIComponent(assigneeId)}`

  if (!opportunity) {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">This quote is not linked to an assigned client opportunity.</p>
        <p className="mt-1">Link or assign the client record before recording a win.</p>
        <Link href={clientsPath} className="mt-3 inline-flex font-semibold underline underline-offset-2">Open My Clients</Link>
      </div>
    )
  }

  const productPath = opportunity.productId
    ? `/availability/products/${encodeURIComponent(assigneeId)}?product=${encodeURIComponent(opportunity.productId)}`
    : null
  if (productPath) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
        <div>
          <p className="font-semibold">This opportunity is won.</p>
          <p className="mt-1">The {opportunity.productStatus || 'draft'} contract product has already been created.</p>
        </div>
        <Link href={productPath} className="rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white">Open contract product</Link>
      </div>
    )
  }

  if (['won', 'lost', 'cancelled'].includes(opportunity.stage)) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">This client opportunity is {opportunity.stage}.</p>
        <p className="mt-1">Open the client record to review its closed workflow.</p>
        <Link href={`${clientsPath}?opportunity=${encodeURIComponent(opportunity.id)}`} className="mt-3 inline-flex font-semibold text-teal-700 underline underline-offset-2">Open client record</Link>
      </div>
    )
  }

  async function closeAsWon() {
    if (!opportunity || acceptanceNote.trim().length < 3) return
    setBusy(true)
    setStatus(null)
    try {
      const response = await fetch('/api/admin/client-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'opportunity.close-won',
          opportunityId: opportunity.id,
          quoteId,
          expectedUpdatedAt: opportunity.updatedAt,
          acceptanceDate,
          acceptanceMethod,
          acceptanceNote: acceptanceNote.trim(),
        }),
      })
      const result = await response.json() as { success?: boolean; error?: string; result?: { productId?: string } }
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to mark this quote as won.')
      if (!result.result?.productId) throw new Error('The opportunity was updated, but no contract product was returned. Reload before trying again.')
      window.location.assign(`/availability/products/${encodeURIComponent(assigneeId)}?product=${encodeURIComponent(result.result.productId)}`)
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to mark this quote as won.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Has the client accepted {quoteRef}?</p>
          <p className="mt-1">Record the win from the latest saved quote version. This closes the client opportunity and creates one editable draft contract product.</p>
        </div>
        {!open ? <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white">Mark quote as won</button> : null}
      </div>
      {open ? (
        <div className="mt-4 border-t border-green-200 pt-4">
          <p className="mb-4 text-green-900">Quote status and a sales win are separate: this confirmation records how the client accepted the latest saved quote version.</p>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="font-medium">Acceptance date<input type="date" max={melbourneToday()} value={acceptanceDate} onChange={(event) => setAcceptanceDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-green-200 bg-white px-3 py-2.5" /></label>
            <label className="font-medium">Acceptance method<select value={acceptanceMethod} onChange={(event) => setAcceptanceMethod(event.target.value)} className="mt-1 block w-full rounded-lg border border-green-200 bg-white px-3 py-2.5"><option value="email">Email</option><option value="signed_agreement">Signed agreement</option><option value="phone">Phone</option><option value="other">Other</option></select></label>
            <label className="font-medium">Acceptance evidence or note<input value={acceptanceNote} onChange={(event) => setAcceptanceNote(event.target.value)} placeholder="e.g. Accepted by email today" className="mt-1 block w-full rounded-lg border border-green-200 bg-white px-3 py-2.5" /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void closeAsWon()} disabled={busy || !acceptanceDate || acceptanceNote.trim().length < 3} className="rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{busy ? 'Creating product…' : 'Confirm win & create draft product'}</button>
            <button type="button" onClick={() => { setOpen(false); setStatus(null) }} disabled={busy} className="rounded-lg border border-green-300 bg-white px-4 py-2.5 font-semibold text-green-950 disabled:opacity-60">Cancel</button>
          </div>
          {status ? <p role="alert" className="mt-3 font-semibold text-red-700">{status.message}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
