'use client'

import type { AdminDashboardData } from './AdminDashboard'

type BookingItem = AdminDashboardData['bookings'][number]

const columns = [
  { key: 'pending', label: 'Pending inspection' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-AU')
}

export default function DispatchBoard({ bookings }: { bookings: BookingItem[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {columns.map((column) => {
        const items = bookings.filter((booking) => (booking.inspection_status ?? 'pending') === column.key)
        return (
          <div key={column.key} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-bold" style={{ color: '#1a2744' }}>{column.label}</h3>
            </div>
            <div className="p-3 space-y-3 min-h-[220px]">
              {items.map((booking) => (
                <div key={booking.booking_ref} className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <div className="font-semibold text-sm text-gray-900">{booking.booking_ref}</div>
                  <div className="text-sm text-gray-700 mt-1">{booking.inputs?.businessName ?? 'Unknown business'}</div>
                  <div className="text-xs text-gray-500 mt-1">{booking.inputs?.address ?? 'No address'}</div>
                  <div className="text-xs text-gray-500 mt-2">
                    Scheduled: {formatDate(booking.inspection_scheduled_for)}
                  </div>
                  {booking.dispatch_notes ? (
                    <div className="text-xs text-gray-600 mt-2 line-clamp-3">{booking.dispatch_notes}</div>
                  ) : null}
                </div>
              ))}
              {items.length === 0 ? <div className="text-sm text-gray-400">No bookings</div> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
