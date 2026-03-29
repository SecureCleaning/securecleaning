'use client'

export default function ReportingTrendNotes() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
      <h2 className="text-lg font-bold mb-3" style={{ color: '#1a2744' }}>Reporting notes</h2>
      <ul className="list-disc ml-5 text-sm text-gray-700 space-y-2">
        <li>Use quote follow-up breakdown to spot slow sales handling.</li>
        <li>Use unassigned bookings count to spot dispatch bottlenecks.</li>
        <li>Use scheduled inspections count to track current field workload.</li>
        <li>Use completed bookings trend as the basis for later revenue reporting.</li>
      </ul>
    </div>
  )
}
