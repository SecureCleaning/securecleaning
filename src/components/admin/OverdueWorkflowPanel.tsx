'use client'

import type { AdminDashboardData } from './AdminDashboard'

type BookingItem = AdminDashboardData['bookings'][number]

export default function OverdueWorkflowPanel({ bookings }: { bookings: BookingItem[] }) {
  const now = Date.now()
  const overdue = bookings.filter((booking) => {
    if (booking.inspection_status !== 'scheduled' || !booking.inspection_scheduled_for) return false
    const scheduled = new Date(booking.inspection_scheduled_for).getTime()
    return Number.isFinite(scheduled) && scheduled < now
  })

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-amber-200">
        <h2 className="text-lg font-bold text-amber-900">Overdue inspection actions</h2>
      </div>
      <div className="divide-y divide-amber-200">
        {overdue.map((booking) => (
          <div key={booking.booking_ref} className="px-6 py-4">
            <div className="font-semibold text-amber-950">{booking.booking_ref} — {booking.inputs?.businessName ?? 'Unknown business'}</div>
            <div className="text-sm text-amber-900 mt-1">{booking.inputs?.address ?? 'No address recorded'}</div>
            <div className="text-xs text-amber-800 mt-1">Scheduled for: {booking.inspection_scheduled_for}</div>
          </div>
        ))}
        {overdue.length === 0 ? <div className="px-6 py-4 text-sm text-amber-800">No overdue inspections right now.</div> : null}
      </div>
    </div>
  )
}
