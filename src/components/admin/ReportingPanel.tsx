import ReportingTrendNotes from './ReportingTrendNotes'

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

type ReportingDestination = 'quotes' | 'bookings' | 'operators'

export default function ReportingPanel({
  snapshot,
  onMetricClick,
}: {
  snapshot: ReportingSnapshot
  onMetricClick: (destination: ReportingDestination) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <MetricCard label="Quotes" value={snapshot.quoteCount} onClick={() => onMetricClick('quotes')} />
        <MetricCard label="Bookings" value={snapshot.bookingCount} onClick={() => onMetricClick('bookings')} />
        <MetricCard label="Pending bookings" value={snapshot.pendingBookings} onClick={() => onMetricClick('bookings')} />
        <MetricCard label="Completed bookings" value={snapshot.completedBookings} onClick={() => onMetricClick('bookings')} />
        <MetricCard label="Active operators" value={snapshot.activeOperators} onClick={() => onMetricClick('operators')} />
        <MetricCard label="Unassigned bookings" value={snapshot.unassignedBookings} onClick={() => onMetricClick('bookings')} />
        <MetricCard label="Scheduled inspections" value={snapshot.scheduledInspections} onClick={() => onMetricClick('bookings')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownCard title="Quote follow-up breakdown" data={snapshot.quoteFollowUpBreakdown} />
        <BreakdownCard title="Lead follow-up breakdown" data={snapshot.leadFollowUpBreakdown} />
        <ReportingTrendNotes />
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
      className="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold" style={{ color: '#1a2744' }}>{value}</div>
    </button>
  )
}

function BreakdownCard({ title, data }: { title: string; data: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>{title}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-700 capitalize">{key.replace(/_/g, ' ')}</div>
            <div className="font-semibold text-gray-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
