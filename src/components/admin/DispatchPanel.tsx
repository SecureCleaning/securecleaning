'use client'

import { useEffect, useState } from 'react'
import type { AdminDashboardData } from './AdminDashboard'

type BookingItem = AdminDashboardData['bookings'][number]

const inspectionStatuses = ['pending', 'scheduled', 'completed', 'cancelled']

export default function DispatchPanel({
  bookings,
  onBookingUpdated,
}: {
  bookings: BookingItem[]
  onBookingUpdated: (bookingRef: string, updates: Partial<BookingItem>) => void
}) {
  const [selectedRef, setSelectedRef] = useState<string>(bookings[0]?.booking_ref ?? '')
  const selected = bookings.find((booking) => booking.booking_ref === selectedRef) ?? bookings[0]
  const [inspectionStatus, setInspectionStatus] = useState('pending')
  const [inspectionScheduledFor, setInspectionScheduledFor] = useState('')
  const [inspectionCompletedAt, setInspectionCompletedAt] = useState('')
  const [dispatchNotes, setDispatchNotes] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!selected) return
    setInspectionStatus(selected.inspection_status ?? 'pending')
    setInspectionScheduledFor(selected.inspection_scheduled_for ?? '')
    setInspectionCompletedAt(selected.inspection_completed_at ?? '')
    setDispatchNotes(selected.dispatch_notes ?? '')
    setStatus(null)
    setError(null)
  }, [selectedRef, selected])

  if (!selected) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No bookings available for dispatch.</div>
  }

  async function handleSave() {
    setIsSaving(true)
    setStatus(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'booking.inspectionWorkflow',
          bookingRef: selected.booking_ref,
          inspectionStatus,
          inspectionScheduledFor,
          inspectionCompletedAt,
          dispatchNotes,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update inspection workflow.')
      }

      onBookingUpdated(selected.booking_ref, {
        inspection_status: inspectionStatus,
        inspection_scheduled_for: inspectionScheduledFor,
        inspection_completed_at: inspectionCompletedAt,
        dispatch_notes: dispatchNotes,
      })
      setStatus('Inspection workflow updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update inspection workflow.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Dispatch / inspection workflow</h2>

      <select
        value={selectedRef}
        onChange={(e) => setSelectedRef(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white"
      >
        {bookings.map((booking) => (
          <option key={booking.booking_ref} value={booking.booking_ref}>
            {booking.booking_ref} — {booking.inputs?.businessName ?? 'Unknown'}
          </option>
        ))}
      </select>

      <select
        value={inspectionStatus}
        onChange={(e) => setInspectionStatus(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white"
      >
        {inspectionStatuses.map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>

      <input
        type="datetime-local"
        value={inspectionScheduledFor}
        onChange={(e) => setInspectionScheduledFor(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
      />

      <input
        type="datetime-local"
        value={inspectionCompletedAt}
        onChange={(e) => setInspectionCompletedAt(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
      />

      <textarea
        value={dispatchNotes}
        onChange={(e) => setDispatchNotes(e.target.value)}
        rows={5}
        placeholder="Dispatch notes"
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
      />

      {status ? <div className="text-sm text-green-600">{status}</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: '#1a2744' }}
      >
        {isSaving ? 'Saving…' : 'Save dispatch workflow'}
      </button>
    </div>
  )
}
