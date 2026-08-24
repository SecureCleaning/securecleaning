'use client'

import { useEffect, useState } from 'react'
import type { AdminDashboardData } from './AdminDashboard'
import { bookingStatuses } from '@/lib/bookingStatus'
import DismissAlertButton from './DismissAlertButton'

type BookingItem = AdminDashboardData['bookings'][number]

export default function BookingEditor({
  bookings,
  selectedBookingRef,
  onSelectedBookingRefChange,
  onBookingUpdated,
  selectedAlertId,
  onAlertDismissed,
}: {
  bookings: BookingItem[]
  selectedBookingRef: string
  onSelectedBookingRefChange: (bookingRef: string) => void
  onBookingUpdated: (booking: BookingItem) => void
  selectedAlertId?: string | null
  onAlertDismissed?: (alertId: string) => void
}) {
  const selected = bookings.find((booking) => booking.booking_ref === selectedBookingRef) ?? bookings[0]
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [suburb, setSuburb] = useState('')
  const [postcode, setPostcode] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [notes, setNotes] = useState('')
  const [bookingStatus, setBookingStatus] = useState('pending')

  const originalBusinessName = selected?.inputs?.businessName ?? ''
  const originalContactName = selected?.inputs?.contactName ?? ''
  const originalEmail = selected?.inputs?.email ?? ''
  const originalPhone = selected?.inputs?.phone ?? ''
  const originalAddress = selected?.inputs?.address ?? ''
  const originalSuburb = selected?.inputs?.suburb ?? ''
  const originalPostcode = selected?.inputs?.postcode ?? ''
  const originalPreferredDate = selected?.first_clean_date ?? selected?.inputs?.preferredStartDate ?? ''
  const originalNotes = selected?.inputs?.notes ?? ''
  const hasChanges = Boolean(
    selected && (
      businessName !== originalBusinessName ||
      contactName !== originalContactName ||
      email !== originalEmail ||
      phone !== originalPhone ||
      address !== originalAddress ||
      suburb !== originalSuburb ||
      postcode !== originalPostcode ||
      preferredDate !== originalPreferredDate ||
      notes !== originalNotes ||
      bookingStatus !== (selected?.status ?? 'pending')
    )
  )

  useEffect(() => {
    if (!selected) return
    setBusinessName(selected.inputs?.businessName ?? '')
    setContactName(selected.inputs?.contactName ?? '')
    setEmail(selected.inputs?.email ?? '')
    setPhone(selected.inputs?.phone ?? '')
    setAddress(selected.inputs?.address ?? '')
    setSuburb(selected.inputs?.suburb ?? '')
    setPostcode(selected.inputs?.postcode ?? '')
    setPreferredDate(selected.first_clean_date ?? selected.inputs?.preferredStartDate ?? '')
    setNotes(selected.inputs?.notes ?? '')
    setBookingStatus(selected.status ?? 'pending')
    setStatus(null)
    setError(null)
  }, [selectedBookingRef, selected])

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
        suburb,
        postcode,
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
            status: bookingStatus,
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

  function resetForm() {
    if (!selected) return
    setBusinessName(originalBusinessName)
    setContactName(originalContactName)
    setEmail(originalEmail)
    setPhone(originalPhone)
    setAddress(originalAddress)
    setSuburb(originalSuburb)
    setPostcode(originalPostcode)
    setPreferredDate(originalPreferredDate)
    setNotes(originalNotes)
    setBookingStatus(selected.status)
    setStatus(null)
    setError(null)
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Booking editor</h2>
          <p className="mt-1 text-sm text-gray-600">Update customer-facing booking details and first-clean timing without leaving the dashboard.</p>
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
          {bookingStatus.replace(/_/g, ' ')}
        </div>
      </div>

      {selectedAlertId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-900">This booking was opened from an Action needed reminder.</p>
          <DismissAlertButton alertId={selectedAlertId} onDismissed={onAlertDismissed} />
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">Booking to edit</span>
        <select
          value={selected?.booking_ref ?? ''}
          onChange={(e) => onSelectedBookingRefChange(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
        >
          {bookings.map((booking) => (
            <option key={booking.booking_ref} value={booking.booking_ref}>
              {booking.booking_ref} — {booking.inputs?.businessName ?? 'Unknown'}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Booking ref</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">{selected.booking_ref}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current first clean</div>
          <div className="mt-1 text-sm text-gray-900">{originalPreferredDate || 'Not scheduled'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Service city</div>
          <div className="mt-1 text-sm text-gray-900 capitalize">{selected.inputs?.city ?? 'Unknown'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned quoter</div>
          <div className="mt-1 text-sm text-gray-900">{selected.inputs?.preferredInspectionAssigneeName ?? 'Not assigned from availability yet'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Booking status</span>
          <select
            value={bookingStatus}
            onChange={(e) => setBookingStatus(e.target.value)}
            disabled={isSaving}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
          >
            {bookingStatuses.map((value) => (
              <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <span className="block text-xs text-gray-500">Changing this status updates the booking queue and related alerts.</span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Business name</span>
          <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={isSaving} placeholder="Business name" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Contact name</span>
          <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={isSaving} placeholder="Contact name" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSaving} placeholder="Email" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Phone</span>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSaving} placeholder="Phone" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500" />
        </label>
      </div>

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">Service address</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
          placeholder="Service address"
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Suburb</span>
          <input
            type="text"
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            disabled={isSaving}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            placeholder="Suburb"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Postcode</span>
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            disabled={isSaving}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            placeholder="Postcode"
          />
        </label>
      </div>

      {selected.inputs?.preferredInspectionSlotLabel ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <div className="font-semibold">Requested inspection window</div>
          <div className="mt-1">{selected.inputs.preferredInspectionSlotLabel}</div>
        </div>
      ) : null}

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">First clean date</span>
        <input
          type="date"
          value={preferredDate}
          onChange={(e) => setPreferredDate(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium text-gray-700">Booking notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          disabled={isSaving}
          placeholder="Internal / booking notes"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100 disabled:text-gray-500"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
        <div className="text-sm text-gray-600">
          {hasChanges ? 'Unsaved changes are ready to publish to the live booking record.' : 'No unsaved changes yet.'}
        </div>
        <button
          type="button"
          onClick={resetForm}
          disabled={!hasChanges || isSaving}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          Reset changes
        </button>
      </div>

      {status ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{status}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || !hasChanges}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: '#22c55e' }}
      >
        {isSaving ? 'Saving booking…' : hasChanges ? 'Save booking changes' : 'No changes to save'}
      </button>
    </div>
  )
}
