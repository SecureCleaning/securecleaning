type AdminAlert = {
  id: string
  kind: string
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
}

const severityStyles: Record<AdminAlert['severity'], string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  critical: 'border-red-200 bg-red-50 text-red-900',
}

export default function AlertsPanel({ alerts }: { alerts: AdminAlert[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Action needed</h2>
      </div>
      <div className="p-4 space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className={`rounded-xl border p-4 ${severityStyles[alert.severity]}`}>
            <div className="font-semibold">{alert.title}</div>
            <div className="text-sm mt-1">{alert.description}</div>
          </div>
        ))}
        {alerts.length === 0 ? <div className="text-sm text-gray-500">No current alerts.</div> : null}
      </div>
    </div>
  )
}
