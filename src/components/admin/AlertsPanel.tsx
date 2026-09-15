type AdminAlert = {
  id: string
  entity_ref: string
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

const severityLabels: Record<AdminAlert['severity'], string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

const kindLabels: Record<string, string> = {
  new_quote: 'Quote',
  new_booking: 'Booking',
  overdue_inspection: 'Inspection',
  unassigned_booking: 'Dispatch',
}

export default function AlertsPanel({
  alerts,
  onOpenAlert,
  onDismissAlert,
}: {
  alerts: AdminAlert[]
  onOpenAlert: (alert: AdminAlert) => void
  onDismissAlert: (alert: AdminAlert) => void
}) {
  const counts = alerts.reduce(
    (summary, alert) => {
      summary[alert.severity] += 1
      return summary
    },
    { info: 0, warning: 0, critical: 0 } as Record<AdminAlert['severity'], number>
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <h2 className="text-base font-bold" style={{ color: '#1a2744' }}>Action needed</h2>
        <div className="flex flex-wrap gap-1.5">
          {(['critical', 'warning', 'info'] as const).map((severity) => (
            <div
              key={severity}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityStyles[severity]}`}
            >
              {severityLabels[severity]}: {counts[severity]}
            </div>
          ))}
        </div>
      </div>
      <div className="p-2.5">
        <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <div key={alert.id} className={`rounded-xl border p-2.5 ${severityStyles[alert.severity]}`}>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                  {kindLabels[alert.kind] ?? alert.kind.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                  {severityLabels[alert.severity]}
                </span>
              </div>
              <div className="text-sm font-semibold leading-snug">{alert.title}</div>
              <div className="mt-1 text-xs leading-relaxed opacity-90">{alert.description}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenAlert(alert)}
                  className="rounded-lg border border-current/25 bg-white/60 px-2.5 py-1.5 text-xs font-semibold hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => onDismissAlert(alert)}
                  className="rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-semibold opacity-80 hover:bg-white/60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
          {alerts.length === 0 ? <div className="text-sm text-gray-500">No current alerts.</div> : null}
        </div>
      </div>
    </div>
  )
}
