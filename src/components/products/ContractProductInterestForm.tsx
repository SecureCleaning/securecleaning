'use client'

import { useState } from 'react'

export default function ContractProductInterestForm({ productCode }: { productCode: string }) {
  const [form, setForm] = useState({ email: '', note: '' })
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('saving')
    try {
      const response = await fetch('/api/jobs/interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productCode, ...form }),
      })
      setStatus(response.ok ? 'done' : 'error')
    } catch { setStatus('error') }
  }

  if (status === 'done') return <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">Thank you. If your details match an approved cleaner profile for this state, Secure Cleaning will contact you about this opportunity.</p>
  return <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold text-gray-900">Register interest</h2><p className="mt-1 text-sm text-gray-600">Use the email recorded in your Secure Cleaning cleaner profile. Your saved contact details will be used for follow-up.</p><div className="mt-4 grid gap-4"><label className="text-sm font-medium">Cleaner profile email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Note (optional)<textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><button type="submit" disabled={status === 'saving'} className="mt-4 rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{status === 'saving' ? 'Submitting...' : 'Register interest'}</button>{status === 'error' ? <p role="alert" className="mt-3 text-sm text-red-700">Your request could not be processed. Please try again.</p> : null}</form>
}
