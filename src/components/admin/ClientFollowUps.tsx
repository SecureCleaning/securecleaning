'use client'

import { useEffect, useState } from 'react'
import styles from './ClientFollowUps.module.css'
import { followUpSummary } from '@/lib/crmFollowUpSummary'
import type { CrmEmailTemplate, CrmOpportunity } from '@/lib/clientCrmData'
import { followUpGroup, followUpInput, followUpIso } from '@/lib/crmFollowUpTime'

type Workspace = { opportunities: CrmOpportunity[]; templates: CrmEmailTemplate[]; actor: { role: string; availabilityAssigneeId?: string | null } }
export default function ClientFollowUps({ refreshKey, compact = false }: { refreshKey?: unknown; compact?: boolean }) {
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
  return <section className={`${styles.panel} ${compact ? '' : 'my-5'} min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm`} aria-label="Client follow-ups">
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
      <h2 className="text-lg font-bold text-[#1a2744]">Client follow-ups</h2>
      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">{items.length}</span>
    </div>
    {error ? <p role="alert" className="px-5 py-3 text-red-700">{error}</p> : null}
    {!data && !error ? <p className="px-5 py-4 text-sm text-gray-500">Loading follow-ups...</p> : null}
    {data && !items.length ? <p className="px-5 py-6 text-sm text-gray-500">No outstanding follow-ups.</p> : null}
    <div className="max-h-60 divide-y divide-gray-100 overflow-y-auto">{items.map((item) => {
      const group = followUpGroup(item.nextFollowUpAt!, now)
      const tone = group === 'Overdue' ? 'bg-red-50 text-red-700' : group === 'Today' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'
      return <article key={item.id} className={`${styles.row} px-5 py-2.5 text-sm`}>
          <a href={`${base}?opportunity=${encodeURIComponent(item.id)}`} title={item.businessName || item.contactName || 'Client opportunity'} className={`${styles.client} min-w-0 font-bold text-gray-900 hover:text-teal-700 hover:underline`}>{item.businessName || item.contactName || 'Client opportunity'}</a>
          <span className={`${styles.status} shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{group}</span>
        <p className={`${styles.date} text-xs text-gray-500`}>{new Date(item.nextFollowUpAt!).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
        <details className={styles.details}>
          <summary className="cursor-pointer text-sm text-teal-800" title={followUpSummary(item, data?.templates ?? [])}>{followUpSummary(item, data?.templates ?? [])}</summary>
          <p className="mt-2 text-xs text-gray-500">Assigned to {item.assignedStaffName || 'Unassigned'}</p>
          <a href={`${base}?opportunity=${encodeURIComponent(item.id)}`} className="mt-2 inline-block text-teal-700 underline">Open client activity</a>
          <div className="mt-3 flex gap-4"><button disabled={!!busy} onClick={() => void update(item, null)} className="font-semibold text-green-700 disabled:opacity-50">Complete</button><button disabled={!!busy} onClick={() => { setEditing(item.id); setWhen(followUpInput(item.nextFollowUpAt)) }} className="font-semibold text-teal-700 disabled:opacity-50">Reschedule</button></div>
          {editing === item.id ? <form className="mt-2" onSubmit={(e) => { e.preventDefault(); void update(item, followUpIso(when)) }}><input required aria-label="Reschedule follow-up" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded border p-2" /><button disabled={!!busy} className="mt-2 rounded bg-teal-700 p-2 text-white">Save reminder</button><button type="button" onClick={() => setEditing('')} className="p-2">Cancel</button></form> : null}
        </details>
      </article>
    })}</div>
  </section>
}
