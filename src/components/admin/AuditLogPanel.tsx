type AuditLogRow = {
  id: string
  entity_type: string
  entity_ref: string
  action: string
  details: Record<string, unknown>
  created_at: string
}

export default function AuditLogPanel({ logs }: { logs: AuditLogRow[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Recent audit log</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {logs.map((log) => (
          <div key={log.id} className="px-6 py-4">
            <div className="text-sm font-semibold text-gray-900">
              {log.entity_type} · {log.entity_ref} · {log.action}
            </div>
            <div className="text-xs text-gray-500 mt-1">{new Date(log.created_at).toLocaleString('en-AU')}</div>
          </div>
        ))}
        {logs.length === 0 ? <div className="px-6 py-4 text-sm text-gray-500">No audit events yet.</div> : null}
      </div>
    </div>
  )
}
