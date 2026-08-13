'use client'

import type { AdminDashboardData } from './AdminDashboard'

type BookingItem = AdminDashboardData['bookings'][number]

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-AU')
}

export default function UpcomingInspectionsPanel({ bookings }: { bookings: BookingItem[] }) {
  const upcoming = bookings
    .filter((booking) => booking.inspection_status === 'scheduled' && booking.inspection_scheduled_for)
    .sort((a, b) => (a.inspection_scheduled_for ?? '').localeCompare(b.inspection_scheduled_for ?? ''))
    .slice(0, 10)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Upcoming inspections</h2>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
          {upcoming.length} scheduled
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {upcoming.map((booking) => (
          <div key={booking.booking_ref} className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-gray-900">{booking.booking_ref} — {booking.inputs?.businessName ?? 'Unknown business'}</div>
              <div className="flex flex-wrap gap-1">
                {!booking.site_id ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">Missing site</span> : null}
                {!booking.assigned_operator_id && !booking.linkedOperatorId ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">Missing operator</span> : null}
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-1">{booking.inputs?.address ?? 'No address recorded'}</div>
            <div className="text-xs text-gray-500 mt-1">{formatDateTime(booking.inspection_scheduled_for)}</div>
          </div>
        ))}
        {upcoming.length === 0 ? <div className="px-6 py-4 text-sm text-gray-500">No scheduled inspections yet.</div> : null}
      </div>
    </div>
  )
}
