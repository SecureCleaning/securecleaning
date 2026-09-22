'use client'

import { useState } from 'react'
import type { ClientCrmDeletionPreview } from '@/lib/clientCrmDeletion'

export default function DeleteClientCrmButton({ opportunityId, onDeleted }: { opportunityId: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<ClientCrmDeletionPreview | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [deleteBookings, setDeleteBookings] = useState(false)
  const [override, setOverride] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsOverride = Boolean(preview && (preview.bookings > 0 || preview.sentCommunications > 0))
  const optionsIncomplete = Boolean(preview && ((preview.bookings > 0 && !deleteBookings) || (needsOverride && !override)))

  async function inspectDeletion() {
    setOpen(true)
    setLoading(true)
    setError(null)
    setPreview(null)
    setConfirmation('')
    setReason('')
    setDeleteBookings(false)
    setOverride(false)
    try {
      const response = await fetch(`/api/admin/client-crm/${encodeURIComponent(opportunityId)}/deletion`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to check this CRM record.')
      setPreview(result.preview as ClientCrmDeletionPreview)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to check this CRM record.')
    } finally {
      setLoading(false)
    }
  }

  function closeDialog() {
    if (loading) return
    setOpen(false)
    setPreview(null)
    setError(null)
  }

  async function deleteRecord() {
    if (!preview || preview.blocked || optionsIncomplete || confirmation !== preview.confirmationValue) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/client-crm/${encodeURIComponent(opportunityId)}/deletion`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation, reason, deleteBookings, override, previewToken: preview.previewToken }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete this CRM record.')
      setOpen(false)
      setPreview(null)
      onDeleted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete this CRM record.')
    } finally {
      setLoading(false)
    }
  }

  return <>
    <button type="button" onClick={inspectDeletion} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:border-red-300">
      Delete client record
    </button>
    {open ? <div role="dialog" aria-modal="true" aria-labelledby="delete-client-crm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onKeyDown={(event) => { if (event.key === 'Escape') closeDialog() }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-left shadow-xl">
        <h2 id="delete-client-crm-title" className="text-xl font-bold text-gray-900">Delete this client and its sites?</h2>
        <p className="mt-2 text-sm text-gray-600">This permanently removes the customer’s CRM opportunities, contacts, sites, leads, notes, and email history. A restricted deletion archive keeps the removed data for audit purposes.</p>
        {loading && !preview ? <p className="mt-4 text-sm text-gray-600">Checking linked records…</p> : null}
        {preview ? <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{preview.displayName}</div>
            <div className="mt-1">{preview.opportunities} opportunity(s), {preview.contacts} contact(s), {preview.sites} site(s), {preview.leads} lead(s)</div>
            <div>{preview.communications} CRM email record(s), including {preview.sentCommunications} sent</div>
            <div>{preview.bookings} booking(s), including {preview.activeBookings} not cancelled</div>
          </div>
          {preview.blocked ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Delete the linked business records first:</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          </div> : <div className="space-y-3">
            {preview.bookings > 0 ? <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><input type="checkbox" checked={deleteBookings} disabled={loading} onChange={(event) => setDeleteBookings(event.target.checked)} className="mt-1" /><span>Also permanently delete the {preview.bookings} linked booking record(s). Their snapshots will remain in the restricted deletion archive.</span></label> : null}
            {needsOverride ? <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><input type="checkbox" checked={override} disabled={loading} onChange={(event) => setOverride(event.target.checked)} className="mt-1" /><span>I authorize the owner override for the linked booking and delivered-email history shown above.</span></label> : null}
            <label className="block text-sm font-semibold text-gray-800">Reason for deletion<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} rows={3} placeholder="For example: Internal test client and site records." className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-semibold text-gray-800">Type <span className="font-mono break-all">{preview.confirmationValue}</span> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm" /></label>
          </div>}
        </div> : null}
        {error ? <div role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={closeDialog} disabled={loading} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
          {preview && !preview.blocked ? <button type="button" onClick={deleteRecord} disabled={loading || optionsIncomplete || confirmation !== preview.confirmationValue || reason.trim().length < 10 || reason.trim().length > 500} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Deleting…' : 'Permanently delete client'}</button> : null}
        </div>
      </div>
    </div> : null}
  </>
}
