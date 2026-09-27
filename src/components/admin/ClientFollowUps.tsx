'use client'

import { useEffect, useState } from 'react'
import type { CrmOpportunity } from '@/lib/clientCrmData'
import { followUpGroup, followUpInput, followUpIso } from '@/lib/crmFollowUpTime'

type Workspace = { opportunities: CrmOpportunity[]; actor: { role: string; availabilityAssigneeId?: string | null } }
export default function ClientFollowUps({ refreshKey }: { refreshKey?: unknown }) {
  const [data, setData] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState('')
  const [when, setWhen] = useState('')
  const [now, setNow] = useState(new Date())
  async function load() {
    const response = await fetch('/api/admin/client-crm?followUps=1', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load follow-ups.')
    setData(result)
    setError('')
    setNow(new Date())
  }
  useEffect(() => {
    const refresh = () => { void load().catch((e) => setError(e.message)) }
    refresh()
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refreshKey])
  async function update(item: CrmOpportunity, value: string | null) {
    setBusy(item.id); setError('')
    try {
      const response = await fetch('/api/admin/client-crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'opportunity.update', id: item.id, nextFollowUpAt: value, expectedNextFollowUpAt: item.nextFollowUpAt }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update follow-up.')
      setEditing(''); await load()
      window.dispatchEvent(new Event('crm-followup-updated'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update follow-up.') }
    finally { setBusy('') }
  }
  const items = (data?.opportunities ?? []).filter((item) => item.nextFollowUpAt && !['won', 'lost', 'cancelled'].includes(item.stage)).sort((a, b) => Date.parse(a.nextFollowUpAt!) - Date.parse(b.nextFollowUpAt!))
  const base = data?.actor.role === 'agent' ? `/availability/clients/${encodeURIComponent(data.actor.availabilityAssigneeId || '')}` : '/admin/clients'
  return <section className="my-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Client follow-ups">
    <h2 className="text-xl font-bold text-[#1a2744]">Client follow-ups</h2>
    <p className="mt-1 text-sm text-gray-600">Assigned opportunity reminders. Times use your device timezone; this list refreshes every minute.</p>
    {error ? <p role="alert" className="mt-2 text-red-700">{error}</p> : null}
    {!data && !error ? <p>Loading follow-ups...</p> : null}
    {data && !items.length ? <p className="mt-3 text-gray-500">No outstanding follow-ups.</p> : null}
    <div className="mt-3 grid gap-4 lg:grid-cols-3">{(['Overdue', 'Today', 'Upcoming'] as const).map((group) => <div key={group}><h3 className="font-semibold">{group} ({items.filter((item) => followUpGroup(item.nextFollowUpAt!, now) === group).length})</h3><div className="max-h-96 overflow-auto">{items.filter((item) => followUpGroup(item.nextFollowUpAt!, now) === group).map((item) => <article key={item.id} className="mt-2 rounded-lg border p-3 text-sm">
      <a href={`${base}?opportunity=${encodeURIComponent(item.id)}`} className="font-bold text-teal-800 underline">{item.businessName || item.contactName || 'Client opportunity'}</a>
      <p>{item.assignedStaffName || 'Unassigned'} · {new Date(item.nextFollowUpAt!).toLocaleString('en-AU')}</p>
      <p className="whitespace-pre-wrap">{item.notes}</p>
      <div className="mt-2 flex gap-3"><button disabled={!!busy} onClick={() => void update(item, null)} className="font-semibold text-green-700">Complete</button><button disabled={!!busy} onClick={() => { setEditing(item.id); setWhen(followUpInput(item.nextFollowUpAt)) }} className="font-semibold text-teal-700">Reschedule</button></div>
      {editing === item.id ? <form className="mt-2" onSubmit={(e) => { e.preventDefault(); void update(item, followUpIso(when)) }}><input required aria-label="Reschedule follow-up" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full border p-2" /><button disabled={!!busy} className="mt-2 rounded bg-teal-700 p-2 text-white">Save reminder</button><button type="button" onClick={() => setEditing('')} className="p-2">Cancel</button></form> : null}
    </article>)}</div></div>)}</div>
  </section>
}
