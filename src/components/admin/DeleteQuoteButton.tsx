'use client'

import { useState } from 'react'
import type { QuoteDeletionPreview } from '@/lib/quoteDeletion'

type Props = {
  quoteRef: string
  onDeleted: (quoteRef: string) => void
}

function retentionLabel(type: string) {
  const labels: Record<string, string> = {
    contract_sale_invoices: 'Invoices', contract_sale_payments: 'Payments',
    contract_sale_payment_allocations: 'Payment allocations', contract_sale_payment_plans: 'Payment plans',
    contract_sale_inspections: 'Inspections', contract_sale_agreements: 'Agreements and document references',
    contract_commission_assignments: 'Commission records', contract_sale_site_assignments: 'Site handovers',
  }
  return labels[type] ?? 'Linked history'
}

export default function DeleteQuoteButton({ quoteRef, onDeleted }: Props) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<QuoteDeletionPreview | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [linkedRecords, setLinkedRecords] = useState<'' | 'keep' | 'delete'>('')
  const [override, setOverride] = useState(false)
  const hasLinks = Boolean(preview && (preview.contractProducts || preview.contractSales))
  const needsOverride = Boolean(preview && (hasLinks || preview.status === 'accepted' || preview.finalDocumentSent || preview.linkedBookings || preview.winningOpportunities || preview.providerConfirmedSendAttempts))
  const retentionBlocked = linkedRecords === 'delete' && Boolean(preview?.retentionReasons.length)
  const optionsIncomplete = (hasLinks && !linkedRecords) || (needsOverride && !override) || retentionBlocked
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function inspectDeletion() {
    setOpen(true)
    setLoading(true)
    setError(null)
    setPreview(null)
    setConfirmation('')
    setReason('')
    setLinkedRecords('')
    setOverride(false)

    try {
      const response = await fetch(`/api/admin/quotes/${encodeURIComponent(quoteRef)}/deletion`)
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to check this quote.')
      setPreview(result.preview as QuoteDeletionPreview)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to check this quote.')
    } finally {
      setLoading(false)
    }
  }

  function closeDialog() {
    if (loading) return
    setOpen(false)
    setPreview(null)
    setConfirmation('')
    setReason('')
    setLinkedRecords('')
    setOverride(false)
    setError(null)
  }

  async function deleteQuote() {
    if (!preview || preview.blocked || optionsIncomplete || confirmation !== quoteRef) return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/quotes/${encodeURIComponent(quoteRef)}/deletion`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation, reason, linkedRecords: linkedRecords || 'keep', override, previewToken: preview.previewToken }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete this quote.')
      onDeleted(quoteRef)
      setLoading(false)
      setOpen(false)
      setPreview(null)
      setConfirmation('')
      setReason('')
    setLinkedRecords('')
    setOverride(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete this quote.')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={inspectDeletion}
        className="whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:border-red-300"
      >
        Delete quote
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-quote-title-${quoteRef}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeDialog()
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-left shadow-xl">
            <h2 id={`delete-quote-title-${quoteRef}`} className="text-xl font-bold text-gray-900">Delete {quoteRef}?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This removes the quote from all owner and agent views. Clients, bookings and CRM opportunities remain.
              Uploaded documents are kept. A restricted deletion archive retains the quote and its history.
            </p>

            {loading && !preview ? <p className="mt-4 text-sm text-gray-600">Checking linked records…</p> : null}

            {preview ? (
              <div className="mt-4 space-y-3">
                {preview.blocked ? (
                  <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold">This quote cannot be deleted:</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    <div>{preview.opportunityLinksToRemove} CRM quote link(s) will be removed; the opportunities remain.</div>
                    <div>{preview.sendAttemptsToRemove} email delivery record(s) and {preview.documentVersionsToRemove} saved document version(s) will be retained in the deletion archive.</div>
                    {preview.linkedBookings > 0 ? <div>{preview.linkedBookings} booking(s) will remain, with their quote link removed.</div> : null}
                    {preview.winningOpportunities > 0 ? <div>{preview.winningOpportunities} won opportunity record(s) will remain, with their winning quote link removed.</div> : null}
                  </div>
                )}

                {!preview.blocked ? (
                  <div className="space-y-3">
                    {hasLinks ? <label className="block text-sm font-semibold text-gray-800">
                      Linked records: {preview.contractProducts} product(s), {preview.contractSales} sale(s)
                      <select value={linkedRecords} disabled={loading} onChange={(event) => setLinkedRecords(event.target.value as '' | 'keep' | 'delete')} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2">
                        <option value="">Choose what to do with linked records</option>
                        <option value="keep">Keep product and sale records</option>
                        <option value="delete">Delete product and sale records too</option>
                      </select>
                      <span className="mt-2 block font-normal text-gray-600">Uploaded documents are kept with either choice.</span>
                    </label> : null}
                    {retentionBlocked ? <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      These sale records have history that must remain. Choose “Keep product and sale records” to delete only the quote.
                      <ul className="mt-2 list-disc pl-5">{preview.retentionReasons.map((item) => <li key={item.type}>{retentionLabel(item.type)}: {item.count}</li>)}</ul>
                    </div> : null}
                    {needsOverride ? <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                      <input type="checkbox" checked={override} disabled={loading} onChange={(event) => setOverride(event.target.checked)} className="mt-1" />
                      <span>I authorize the owner override for this {preview.status} quote and the linked-record choice above. Any previously delivered quote email cannot be recalled.</span>
                    </label> : null}
                    <label className="block text-sm font-semibold text-gray-800">
                      Reason for deletion
                      <textarea
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        minLength={10}
                        maxLength={500}
                        rows={3}
                        placeholder="For example: Internal sample quote created for testing."
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-gray-800">
                      Type <span className="font-mono">{quoteRef}</span> to confirm
                      <input
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        autoComplete="off"
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <div role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</div> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDialog} disabled={loading} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">
                Cancel
              </button>
              {preview && !preview.blocked ? (
                <button
                  type="button"
                  onClick={deleteQuote}
                  disabled={loading || optionsIncomplete || confirmation !== quoteRef || reason.trim().length < 10 || reason.trim().length > 500}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Deleting…' : 'Permanently delete quote'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
