'use client'

import { useEffect, useState } from 'react'

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

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/admin/alerts')
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load alerts.')
        }
        setAlerts(result.alerts as AdminAlert[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load alerts.')
      }
    }

    load()
  }, [])

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
  }

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
