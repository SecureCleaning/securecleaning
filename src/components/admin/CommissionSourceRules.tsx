'use client'

import { useState } from 'react'
import type { CommissionSourceRule } from '@/lib/commissionSourcePolicy'

const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
const button = 'rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800 disabled:opacity-50'
type Draft = { id: string; name: string; agentId: string; percent: string; active: boolean; revision: number }

export default function CommissionSourceRules({ rules, agents, onSaved }: {
  rules: CommissionSourceRule[]
  agents: { id: string; display_name: string }[]
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const percent = draft?.percent.trim() ? Number(draft.percent) : NaN
  const valid = Boolean(draft?.name.trim() && draft.agentId && Number.isFinite(percent) && percent >= 0 && percent <= 100 && /^\d+(\.\d{1,2})?$/.test(draft.percent))
  async function save() {
    if (!draft || !valid || busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/commissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'source_rule.save', id: draft.id, name: draft.name, agentId: draft.agentId,
        agentBps: Math.round(percent * 100), active: draft.active, revision: draft.revision,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save the commission rule.')
      setDraft(null)
      await onSaved()
      setMessage('Rule saved for future sales. Existing sales and commissions are unchanged.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save the rule.') }
    finally { setBusy(false) }
  }
  return <details className="rounded-xl border bg-white p-5">
    <summary className="cursor-pointer font-bold">Enquiry-source commission rules</summary>
    <p className="mt-3 text-sm text-gray-600">These rules replace the standard combined commission for the selected enquiry source. The linked agent receives the total agent share. Rates and recipients are saved when a new sale is created; existing sales keep their saved split.</p>
    <div className="mt-4 space-y-3">{rules.map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div><strong>{rule.name}</strong><p className="text-sm">{agents.find(agent => agent.id === rule.agent_id)?.display_name || 'Linked agent unavailable'}: {rule.agent_bps / 100}% · Secure Cleaning: {(10000 - rule.agent_bps) / 100}%</p><p className="text-xs text-gray-500">{rule.active ? 'Available for new enquiries' : 'Hidden from new enquiries'}</p></div>
      <button className={button} disabled={busy} onClick={() => { setMessage(''); setDraft({ id: rule.id, name: rule.name, agentId: rule.agent_id, percent: String(rule.agent_bps / 100), active: rule.active, revision: rule.revision }) }}>Edit rule</button>
    </div>)}</div>
    {!draft ? <button className={`${button} mt-4`} onClick={() => { setMessage(''); setDraft({ id: crypto.randomUUID(), name: '', agentId: '', percent: '60', active: true, revision: 0 }) }}>Add enquiry source</button> : <form className="mt-4 rounded-lg bg-gray-50 p-4" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <label>Enquiry source name<input className={field} maxLength={120} required disabled={busy} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Commission recipient<select className={field} required disabled={busy} value={draft.agentId} onChange={event => setDraft({ ...draft, agentId: event.target.value })}><option value="">Select agent</option>{draft.agentId && !agents.some(agent => agent.id === draft.agentId) ? <option value={draft.agentId}>Linked agent unavailable</option> : null}{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}</select></label>
        <label>Total agent share %<input className={field} type="number" min="0" max="100" step="0.01" required disabled={busy} value={draft.percent} onChange={event => setDraft({ ...draft, percent: event.target.value })} /></label>
      </div>
      <p className="my-3">Secure Cleaning share: {valid ? `${Number((100 - percent).toFixed(2))}%` : 'Enter a valid percentage'}</p>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />Show this source for new enquiries</label>
      <p className="my-3 text-sm text-gray-600">Hiding a source does not remove it from existing enquiries. Their future sales still use its rule. Each change is recorded in the admin history.</p>
      <div className="flex gap-3"><button type="submit" className={button} disabled={busy || !valid}>{busy ? 'Saving...' : 'Save rule for future sales'}</button><button type="button" className={button} disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
  </details>
}
