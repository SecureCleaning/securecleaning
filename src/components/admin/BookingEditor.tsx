'use client'

import { useEffect, useState } from 'react'
import type { AdminDashboardData } from './AdminDashboard'

type BookingItem = AdminDashboardData['bookings'][number]

export default function BookingEditor({
  bookings,
  onBookingUpdated,
}: {
  bookings: BookingItem[]
  onBookingUpdated: (booking: BookingItem) => void
}) {
  const [selectedRef, setSelectedRef] = useState<string>(bookings[0]?.booking_ref ?? '')
  const selected = bookings.find((booking) => booking.booking_ref === selectedRef) ?? bookings[0]
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!selected) return
    setBusinessName(selected.inputs?.businessName ?? '')
    setContactName(selected.inputs?.contactName ?? '')
    setEmail(selected.inputs?.email ?? '')
    setPhone(selected.inputs?.phone ?? '')
    setAddress(selected.inputs?.address ?? '')
    setPreferredDate(selected.first_clean_date ?? selected.inputs?.preferredStartDate ?? '')
    setNotes(selected.inputs?.notes ?? '')
    setStatus(null)
    setError(null)
  }, [selectedRef, selected])

  if (!selected) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No bookings available.</div>
  }

  async function handleSave() {
    setIsSaving(true)
    setStatus(null)
    setError(null)

    try {
      const updatedInputs = {
        ...selected.inputs,
        businessName,
        contactName,
        email,
        phone,
        address,
        preferredStartDate: preferredDate,
        notes,
      }

      const response = await fetch(`/api/admin/bookings/${selected.booking_ref}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            inputs: updatedInputs,
            first_clean_date: preferredDate,
            status: selected.status,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update booking.')
      }

      onBookingUpdated(result.booking as BookingItem)
      setStatus('Booking updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Booking editor</h2>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-gray-300 px-4 py-3 text-sm" />
      </div>

      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
        placeholder="Service address"
      />

      <input
        type="date"
        value={preferredDate}
        onChange={(e) => setPreferredDate(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="Internal / booking notes"
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
      />

      {status ? <div className="text-sm text-green-600">{status}</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: '#22c55e' }}
      >
        {isSaving ? 'Saving…' : 'Save booking changes'}
      </button>
    </div>
  )
}
