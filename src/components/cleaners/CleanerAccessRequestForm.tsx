'use client'

import { useState } from 'react'

export default function CleanerAccessRequestForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/cleaner-portal/request-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to request access.')
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to request access.')
    } finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-semibold text-gray-800">Registered email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3" /></label><button disabled={busy} className="w-full rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Email my access link'}</button>{message ? <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p> : null}</form>
}
