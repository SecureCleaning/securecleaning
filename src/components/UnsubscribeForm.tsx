'use client'

import { useState } from 'react'

export default function UnsubscribeForm({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  async function unsubscribe() {
    setStatus('saving')
    try {
      const response = await fetch('/api/email-preferences/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setStatus(response.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">You have been unsubscribed from Secure Cleaning Aus marketing emails. Necessary quote or booking messages may still be sent when you request them.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-700">Confirm that you no longer want to receive marketing emails from Secure Cleaning Aus.</p>
      <button type="button" onClick={() => void unsubscribe()} disabled={!token || status === 'saving'} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-60">
        {status === 'saving' ? 'Updating...' : 'Unsubscribe'}
      </button>
      {status === 'error' ? <p role="alert" className="text-sm text-red-700">This link could not be processed. Please contact Secure Cleaning Aus if you need help.</p> : null}
    </div>
  )
}
