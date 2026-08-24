'use client'

import { useState } from 'react'

export default function DismissAlertButton({ alertId, onDismissed }: { alertId: string; onDismissed?: (alertId: string) => void }) {
  const [state, setState] = useState<'idle' | 'saving' | 'dismissed' | 'error'>('idle')

  async function dismiss() {
    setState('saving')
    try {
      const response = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'alert.dismiss', alertId }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to dismiss reminder.')
      setState('dismissed')
      onDismissed?.(alertId)
    } catch {
      setState('error')
    }
  }

  if (state === 'dismissed') {
    return <span className="inline-flex min-h-10 items-center rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">Reminder dismissed</span>
  }

  return <div className="flex flex-col items-end gap-1">
    <button type="button" onClick={dismiss} disabled={state === 'saving'} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-400 disabled:opacity-60">
      {state === 'saving' ? 'Dismissing…' : 'Dismiss reminder'}
    </button>
    {state === 'error' ? <span className="text-xs font-medium text-red-600">Unable to dismiss reminder. Try again.</span> : null}
  </div>
}
