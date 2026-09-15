type ReportingSnapshot = {
  quoteCount: number
  bookingCount: number
  pendingBookings: number
  completedBookings: number
  activeOperators: number
  unassignedBookings: number
  scheduledInspections: number
  quoteFollowUpBreakdown: Record<string, number>
  leadFollowUpBreakdown: Record<string, number>
}

type ReportingDestination = 'quotes' | 'bookings'

export default function ReportingPanel({
  snapshot,
  onMetricClick,
}: {
  snapshot: ReportingSnapshot
  onMetricClick: (destination: ReportingDestination) => void
}) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 lg:grid-cols-4">
      <MetricCard label="All quotes" value={snapshot.quoteCount} onClick={() => onMetricClick('quotes')} />
      <MetricCard label="Pending bookings" value={snapshot.pendingBookings} onClick={() => onMetricClick('bookings')} />
      <MetricCard label="Unassigned" value={snapshot.unassignedBookings} onClick={() => onMetricClick('bookings')} />
      <MetricCard label="Inspections" value={snapshot.scheduledInspections} onClick={() => onMetricClick('bookings')} />
    </div>
  )
}

function MetricCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label}`}
      className="flex min-h-20 flex-col justify-center rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-green-300 hover:bg-green-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
    >
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-0.5 text-2xl font-bold leading-none" style={{ color: '#1a2744' }}>{value}</div>
    </button>
  )
}
