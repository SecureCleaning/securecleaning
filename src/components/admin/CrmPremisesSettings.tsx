'use client'
import { useState } from 'react'
import type { PremisesOption } from '@/lib/premisesCatalog'
import ActionToast from '@/components/ActionToast'
export default function CrmPremisesSettings({ options, reload }: { options: PremisesOption[]; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ code: '', label: '', active: true, expectedUpdatedAt: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  async function save() {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/client-crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'premises.save', ...draft }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error)
      await reload(); setDraft({ code: '', label: '', active: true, expectedUpdatedAt: '' }); setMessage('Premises list saved.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save list.') } finally { setBusy(false) }
  }
  return <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Industry / premises types</h2><p className="my-2 text-sm text-gray-600">Edit a name or deactivate a choice. Existing records keep their selection. Other remains available for individual descriptions.</p><div className="flex flex-wrap gap-2">{options.map(option => <button type="button" key={option.code} onClick={() => setDraft({ ...option, expectedUpdatedAt: option.updated_at || '' })} className="rounded border px-3 py-2 text-sm">{option.label}{!option.active ? ' (inactive)' : ''}</button>)}</div><div className="mt-4 flex flex-wrap items-end gap-3"><label>Code<input disabled={!!draft.expectedUpdatedAt} value={draft.code} maxLength={60} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="education" className="block rounded border p-2" /></label><label>Name<input value={draft.label} maxLength={100} onChange={e => setDraft({ ...draft, label: e.target.value })} className="block rounded border p-2" /></label><label><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Available</label><button type="button" disabled={busy || !draft.code || !draft.label} onClick={() => void save()} className="rounded bg-teal-700 px-3 py-2 text-white disabled:opacity-50">Save choice</button><button type="button" onClick={() => setDraft({ code: '', label: '', active: true, expectedUpdatedAt: '' })} className="rounded border p-2">New choice</button></div><ActionToast message={error || message} tone={error ? 'error' : 'success'} onDismiss={() => { setError(''); setMessage('') }} /></section>
}
