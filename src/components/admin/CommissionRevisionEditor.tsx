'use client'
import { useState } from 'react'
import type { CommissionRevisionPreview } from '@/lib/commissionRevision'

const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
const button = 'rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50'
export default function CommissionRevisionEditor({ saleId, saleCode, winBps, saleBps, agentName, onSaved, onCancel }: {
  saleId: string; saleCode: string; winBps: number; saleBps: number
  agentName: (id: string) => string; onSaved: () => Promise<void>; onCancel: () => void
}) {
  const [win, setWin] = useState(String(winBps / 100))
  const [sale, setSale] = useState(String(saleBps / 100))
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<CommissionRevisionPreview | null>(null)
  const [requestId, setRequestId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  function edit(set: (value: string) => void, value: string) { set(value); setPreview(null); setRequestId(''); setError('') }
  async function submit(confirm: boolean) {
    setBusy(true); setError('')
    try {
      if (!win.trim() || !sale.trim()) throw new Error('Enter both commission percentages.')
      const response = await fetch('/api/admin/commissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: confirm ? 'revise' : 'preview_revision', saleId, winBps: Math.round(Number(win) * 100), saleBps: Math.round(Number(sale) * 100), reason,
        ...(confirm ? { expected: preview, requestId } : {}),
      }) })
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 409) setPreview(null)
        throw new Error(result.error || 'Unable to revise commission.')
      }
      if (confirm) {
        setSaved(true)
        await onSaved()
      } else { setPreview(result.preview); setRequestId(crypto.randomUUID()) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to revise commission.') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="commission-revision-title">
    <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="commission-revision-title" className="text-xl font-bold">Revise commission - {saleCode}</h2>
      <p className="mt-2 text-sm text-gray-600">Change the rates for this sale only. Existing invoices and payments remain recorded. Nothing changes until you confirm.</p>
      {saved ? <p role="status" className="mt-3 text-green-800">Revised rates saved and locked. Close and refresh if the statement has not updated.</p> : null}
      <fieldset disabled={busy || saved} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>Site won %<input className="mt-1 w-full rounded-lg border p-2" type="number" min="0" max="100" step="0.01" value={win} onChange={e => edit(setWin, e.target.value)} /></label>
        <label>Sale %<input className="mt-1 w-full rounded-lg border p-2" type="number" min="0" max="100" step="0.01" value={sale} onChange={e => edit(setSale, e.target.value)} /></label>
        <label className="sm:col-span-2">Reason for revision<textarea className="mt-1 w-full rounded-lg border p-2" maxLength={1000} value={reason} onChange={e => edit(setReason, e.target.value)} /></label>
      </fieldset>
      {error ? <p role="alert" className="mt-3 text-red-700">{error}</p> : null}
      {preview ? <div className="mt-4">
        <p className="font-semibold">Site won: {preview.previousWinBps / 100}% to {preview.winBps / 100}% · Sale: {preview.previousSaleBps / 100}% to {preview.saleBps / 100}%</p>
        <p className="my-2 text-sm">Amounts exclude GST. The revised rates apply to confirmed eligible receipts and future payments for this sale.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Agent', 'Earned before', 'Earned after', 'Change', 'Invoiced', 'Paid', 'Revised unpaid'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>
          {preview.after.map(row => { const before = preview.before.find(item => item.agent_id === row.agent_id); return <tr key={row.agent_id} className="border-t">
            <td className="p-2">{agentName(row.agent_id)}</td><td className="p-2">{money(Number(before?.earned_cents || 0))}</td><td className="p-2">{money(Number(row.earned_cents))}</td><td className="p-2">{money(Number(row.earned_cents) - Number(before?.earned_cents || 0))}</td><td className="p-2">{money(Number(row.claimed_cents))}</td><td className="p-2">{money(Number(row.paid_cents))}</td><td className="p-2">{money(Number(row.earned_cents) - Number(row.paid_cents))}</td>
          </tr> })}
        </tbody></table></div>
        {preview.after.map(row => <div key={row.agent_id} className="mt-2 text-sm">
          <p>{agentName(row.agent_id)}: full-sale commission {money(Number(preview.before.find(item => item.agent_id === row.agent_id)?.potential_cents || 0))} to {money(Number(row.potential_cents))}.</p>
          {Number(row.claimed_cents) > Number(row.earned_cents) ? <p className="text-amber-800">Invoiced excess: {money(Number(row.claimed_cents) - Number(row.earned_cents))}. Reconcile the agent invoice separately; it will not be rewritten.</p> : null}
          {Number(row.paid_cents) > Number(row.earned_cents) ? <p className="text-red-700">Overpayment: {money(Number(row.paid_cents) - Number(row.earned_cents))}. Recovery or offset needs to be arranged separately.</p> : null}
        </div>)}
      </div> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className={button} disabled={busy} onClick={onCancel}>{saved ? 'Close' : 'Cancel'}</button>
        {!saved ? <button type="button" className={button} disabled={busy || !reason.trim()} onClick={() => void submit(false)}>Preview recalculation</button> : null}
        {!saved && preview ? <button type="button" className={button} disabled={busy} onClick={() => void submit(true)}>Confirm and lock revised rates</button> : null}
      </div>
    </section>
  </div>
}
