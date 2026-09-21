'use client'
import { useCallback, useEffect, useState } from 'react'
import type { getCommissionWorkspace } from '@/lib/commissions'
import { commissionCents } from '@/lib/commissionPolicy'

type Data = Awaited<ReturnType<typeof getCommissionWorkspace>>
const money = (value: unknown) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value || 0) / 100)
const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
const button = 'rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800 disabled:opacity-50'
export default function CommissionsWorkspace() {
  const [data, setData] = useState<Data | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [rates, setRates] = useState({ win: '25', sale: '25' })
  const [price, setPrice] = useState('5500')
  const [assignment, setAssignment] = useState({ saleId: '', winAgentId: '', saleAgentId: '' })
  const [entry, setEntry] = useState({ saleId: '', agentId: '', amount: '', reference: '', paidOn: new Date().toISOString().slice(0, 10), requestId: '' })
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/commissions', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load commissions.')
    setData(result)
    if (result.settings) setRates({ win: String(result.settings.win_bps / 100), sale: String(result.settings.sale_bps / 100) })
  }, [])
  useEffect(() => { void load().catch(error => setMessage(error.message)) }, [load])
  async function save(payload: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/commissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save.')
      setEntry(current => ({ ...current, saleId: '', requestId: '' })); await load(); setMessage('Saved. Commission balances updated.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save.') }
    finally { setBusy(false) }
  }
  if (!data) return <p role="status">{message || 'Loading commissions...'}</p>
  const owner = data.role === 'owner'
  const due = data.balances.reduce((sum, row) => sum + Math.max(0, Number(row.earned_cents) - Number(row.claimed_cents)), 0)
  const awaiting = data.balances.reduce((sum, row) => sum + Math.max(0, Math.min(Number(row.earned_cents), Number(row.claimed_cents)) - Number(row.paid_cents)), 0)
  const pending = data.balances.reduce((sum, row) => sum + Math.max(0, Number(row.potential_cents) - Number(row.earned_cents)), 0)
  const paid = data.balances.reduce((sum, row) => sum + Number(row.paid_cents), 0)
  const gross = Math.round(Number(price) * 100)
  const rate = Math.round(Number(rates.win) * 100) + Math.round(Number(rates.sale) * 100)
  const estimate = gross > 0 && Number.isSafeInteger(gross) && rate >= 0 && rate <= 10000 ? commissionCents(gross, Math.round(gross / 11), gross, rate, false) : null
  function statement() {
    const lines = [['Sale', 'Agent ID', 'Commission earned excl GST', 'Commission paid excl GST', 'Unpaid excl GST'], ...data!.balances.map(row => [row.sale_code, row.agent_id, money(row.earned_cents), money(row.paid_cents), money(Number(row.earned_cents) - Number(row.paid_cents))])]
    const csv = lines.map(row => row.map(value => '"' + String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"').join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'commission-statement.csv'; a.click(); URL.revokeObjectURL(url)
  }
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">{owner ? 'Agent commissions' : 'My commissions'}</h1><p className="text-sm text-gray-600">Commission excludes GST. Only confirmed cleared funds count. Without an active agreed plan, the invoice must be paid in full.</p></div>
    {message ? <p role="status" className="rounded-lg bg-blue-50 p-3">{message}</p> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Available to invoice', due], ['Invoiced / awaiting payment', awaiting], ['Not yet available', pending], ['Commission paid', paid]].map(([label, amount]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><span className="text-sm text-gray-600">{label}</span><strong className="block text-2xl">{money(amount)}</strong></div>)}</div>
    {owner ? <>
      <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Owner settings and calculator</h2><div className="mt-3 grid gap-4 sm:grid-cols-3"><label>Site won %<input className={field} type="number" min="0" max="100" step="0.01" value={rates.win} onChange={e => setRates({ ...rates, win: e.target.value })} /></label><label>Sale %<input className={field} type="number" min="0" max="100" step="0.01" value={rates.sale} onChange={e => setRates({ ...rates, sale: e.target.value })} /></label><label>Sale price including GST<input className={field} type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label></div><p className="my-3">Combined {rate / 100}% · Estimated commission {estimate === null ? 'Enter valid amounts' : money(estimate)}</p><button disabled={busy || estimate === null} className={button} onClick={() => void save({ action: 'settings', winBps: Math.round(Number(rates.win) * 100), saleBps: Math.round(Number(rates.sale) * 100) })}>Save defaults for future assignments</button><p className="mt-2 text-sm text-gray-600">Existing assignments retain their locked rates.</p></section>
      <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Assign and lock sale commissions</h2><p className="text-sm text-gray-600">Review historical sales before assigning. Confirmed historical payments may make commission available immediately. Assignments and rates lock when saved.</p><div className="my-3 grid gap-4 sm:grid-cols-3"><label>Sale<select className={field} value={assignment.saleId} onChange={e => setAssignment({ ...assignment, saleId: e.target.value })}><option value="">Select sale</option>{data.sales.map(row => <option key={row.id} value={row.id}>{row.sale_code}</option>)}</select></label>{(['winAgentId', 'saleAgentId'] as const).map((key, i) => <label key={key}>{i ? 'Selling agent' : 'Site-winning agent'}<select className={field} value={assignment[key]} onChange={e => setAssignment({ ...assignment, [key]: e.target.value })}><option value="">Select agent</option>{data.agents?.map(row => <option key={row.id} value={row.id}>{row.display_name}</option>)}</select></label>)}</div><button disabled={busy || !assignment.saleId || !assignment.winAgentId || !assignment.saleAgentId} className={button} onClick={() => void save({ action: 'assign', ...assignment, expectedWinBps: data.settings?.win_bps, expectedSaleBps: data.settings?.sale_bps })}>Lock agents and current rates</button></section>
    </> : null}
    <section className="rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">Commission statement</h2><button className={button} onClick={statement}>Download statement CSV</button></div><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Sale / agent', 'Allocations', 'Earned', 'Invoiced', 'Paid', 'Unpaid', 'Action'].map(x => <th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{data.balances.map(row => {
      const outstanding = Number(row.earned_cents) - Number(row.paid_cents)
      const available = owner ? Math.min(Number(row.earned_cents), Number(row.claimed_cents)) - Number(row.paid_cents) : Number(row.earned_cents) - Number(row.claimed_cents)
      return <tr key={`${row.sale_id}-${row.agent_id}`} className="border-t"><td className="p-2">{String(row.sale_code)}{owner ? <span className="block">{data.agents?.find(a => a.id === row.agent_id)?.display_name || String(row.agent_id)}</span> : null}</td><td className="p-2">{data.components.filter(c => c.saleId === row.sale_id && c.agentId === row.agent_id).map(c => `${c.component} ${Number(c.rateBps) / 100}%`).join(' + ')}</td><td className="p-2">{money(row.earned_cents)}</td><td className="p-2">{money(row.claimed_cents)}</td><td className="p-2">{money(row.paid_cents)}</td><td className="p-2">{money(outstanding)}{outstanding < 0 ? ' adjustment / recovery required' : ''}</td><td className="p-2"><button disabled={busy || available <= 0} className={button} onClick={() => setEntry({ ...entry, saleId: String(row.sale_id), agentId: String(row.agent_id), amount: (available / 100).toFixed(2), reference: '', requestId: crypto.randomUUID() })}>{owner ? 'Record payment' : 'Submit invoice'}</button></td></tr>
    })}</tbody></table></div>{!data.balances.length ? <p className="mt-3">No commissions assigned yet.</p> : null}</section>
    {entry.saleId ? <section className="rounded-xl border border-teal-300 bg-white p-5"><h2 className="font-bold">{owner ? 'Record commission paid' : 'Submit invoice reference'}</h2><p className="text-sm text-gray-600">Enter the commission amount excluding any GST on the agent invoice. Payments can only be recorded against commission invoiced by the agent.</p><div className="my-3 grid gap-4 sm:grid-cols-3"><label>Commission amount<input className={field} type="number" min="0.01" step="0.01" value={entry.amount} onChange={e => setEntry({ ...entry, amount: e.target.value })} /></label><label>{owner ? 'Bank reference' : 'Agent invoice reference'}<input className={field} maxLength={160} value={entry.reference} onChange={e => setEntry({ ...entry, reference: e.target.value })} /></label>{owner ? <label>Paid on<input className={field} type="date" value={entry.paidOn} onChange={e => setEntry({ ...entry, paidOn: e.target.value })} /></label> : null}</div><button disabled={busy || !entry.reference.trim()} className={button} onClick={() => void save({ ...entry, action: owner ? 'payout' : 'claim', amountCents: Math.round(Number(entry.amount) * 100) })}>{owner ? 'Confirm payment recorded' : 'Submit for payment'}</button></section> : null}
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Invoice and payment history</h2>{[...data.claims.map(row => ({ ...row, kind: 'Invoice submitted', reference: row.invoice_reference })), ...data.payouts.map(row => ({ ...row, kind: 'Commission paid' }))].map((row: Record<string, unknown>) => <p key={String(row.id)} className="border-b py-2 text-sm">{String(row.kind)} · {String(data.balances.find(b => b.sale_id === row.sale_id)?.sale_code ?? '')}{owner ? ` / ${data.agents?.find(a => a.id === row.agent_id)?.display_name ?? String(row.agent_id)}` : ''} · {String(row.reference)} · {money(row.amount_cents)} · {String(row.paid_on || row.created_at).slice(0, 10)}</p>)}</section>
  </div>
}
