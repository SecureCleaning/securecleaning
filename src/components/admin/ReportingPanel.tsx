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
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Quotes" value={snapshot.quoteCount} onClick={() => onMetricClick('quotes')} />
        <MetricCard label="Pending bookings" value={snapshot.pendingBookings} onClick={() => onMetricClick('bookings')} />
        <MetricCard label="Unassigned bookings" value={snapshot.unassignedBookings} onClick={() => onMetricClick('bookings')} />
        <MetricCard label="Scheduled inspections" value={snapshot.scheduledInspections} onClick={() => onMetricClick('bookings')} />
      </div>
    </div>
  )
}

function MetricCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label}`}
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-green-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: '#1a2744' }}>{value}</div>
    </button>
  )
}
