'use client'

import { useState } from 'react'

export default function CleanerAccessAdmin({ apiPath = '/api/admin/cleaner-access', state }: { apiPath?: string; state?: string }) {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<'update' | 'onboarding'>('onboarding')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null)
    try {
      const response = await fetch(apiPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, mode }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to send link.')
      setNotice({ type: 'success', message: result.message }); setEmail('')
    } catch (error) { setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send link.' }) }
    finally { setBusy(false) }
  }

  return <section id="cleaner-invitations" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold text-[#1a2744]">Invite or update a cleaner</h2><p className="mt-2 text-sm text-gray-600">Existing cleaners receive a profile-update link at their registered address. New cleaners receive an onboarding form and are created only as pending approval.{state ? ` Invitations and existing-cleaner matches are restricted to ${state}.` : ''}</p>{notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-lg border p-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-green-200 bg-green-50 text-green-900'}`}>{notice.message}</div> : null}<form onSubmit={send} className="mt-6 space-y-4"><fieldset><legend className="text-sm font-semibold text-gray-800">Link type</legend><div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="rounded-lg border border-gray-200 p-4"><input type="radio" name="mode" checked={mode === 'onboarding'} onChange={() => setMode('onboarding')} /> <span className="font-semibold">New cleaner registration</span><span className="mt-1 block text-sm text-gray-600">Creates a pending record after submission and notifies the regional agent and owner.</span></label><label className="rounded-lg border border-gray-200 p-4"><input type="radio" name="mode" checked={mode === 'update'} onChange={() => setMode('update')} /> <span className="font-semibold">Existing cleaner update</span><span className="mt-1 block text-sm text-gray-600">Requires an exact registered email match{state ? ` in ${state}` : ''}.</span></label></div></fieldset><label className="block text-sm font-semibold">Cleaner email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3" /></label><button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send secure link'}</button></form></section>
}
