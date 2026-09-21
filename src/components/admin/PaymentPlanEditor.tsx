'use client'
import { useState } from 'react'
import type { ContractSale } from '@/lib/contractSales'
import { parsePlanInstalments } from '@/lib/commissionPolicy'
import { buildMonthlyInstalments } from '@/lib/contractSalePolicy'
const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
export default function PaymentPlanEditor({ sale, busy, onSave }: { sale: ContractSale; busy: boolean; onSave: (rows: Array<{ sequenceNumber: number; dueOn: string; amountCents: number }>) => Promise<void> }) {
  const currentInvoice = sale.invoices.find(i => i.invoiceType === 'sale' && i.status !== 'void')
  const invoice = currentInvoice?.status === 'paid' ? null : currentInvoice
  const outstanding = invoice ? invoice.totalIncGstCents - invoice.paidCents : sale.agreedPurchasePriceIncGstCents
  const [enabled, setEnabled] = useState(Boolean(sale.paymentPlan))
  const [editing, setEditing] = useState(!sale.paymentPlan)
  const [rows, setRows] = useState(() => sale.paymentPlan?.instalments.map(row => ({ dueOn: row.dueOn, amount: (row.amountCents / 100).toFixed(2) })) ?? [{ dueOn: new Date().toISOString().slice(0, 10), amount: (Math.min(Math.max(0, sale.depositIncGstCents - (invoice?.paidCents ?? 0)), outstanding) / 100).toFixed(2) }, { dueOn: '', amount: ((outstanding - Math.min(Math.max(0, sale.depositIncGstCents - (invoice?.paidCents ?? 0)), outstanding)) / 100).toFixed(2) }])
  const [count, setCount] = useState('3')
  const [first, setFirst] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const total = rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0)
  let schedulePaid = Math.max(0, (currentInvoice?.paidCents ?? 0) - (sale.paymentPlan?.openingPaidCents ?? 0))
  const progress = (sale.paymentPlan?.instalments ?? []).map(row => { const received = Math.min(row.amountCents, schedulePaid); schedulePaid -= received; return { ...row, received } })
  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
  const buttonClass = 'rounded-lg border border-teal-700 px-3 py-2 font-semibold text-teal-800 disabled:opacity-50'
  async function save() {
    setError('')
    try { await onSave(parsePlanInstalments(rows.map(row => ({ dueOn: row.dueOn, amountCents: Math.round(Number(row.amount) * 100) })), outstanding)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save plan.') }
  }
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <h3 className="text-lg font-bold">Payment plan</h3><label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={Boolean(sale.paymentPlan)} onChange={e => setEnabled(e.target.checked)} />Use an agreed payment plan</label>
    {enabled ? <>
      <p className="mt-2 text-sm text-gray-600">Agents may approve plans for their assigned sales. The plan becomes active when its signed agreement is uploaded. Secure Cleaning retains the contract and assignment rights until payment IN FULL.</p>
      {sale.paymentPlan ? <div className="my-3 rounded-lg bg-teal-50 p-3"><strong>Status: {sale.paymentPlan.status.replaceAll('_', ' ')}</strong><p className="whitespace-pre-line text-sm">{sale.paymentPlan.terms}</p><div className="mt-3 space-y-1">{progress.map(row => <p key={row.sequenceNumber} className="text-sm">#{row.sequenceNumber} due {row.dueOn} · {money(row.amountCents)} · Remaining {money(row.amountCents - row.received)}{row.received < row.amountCents && row.dueOn < new Date().toISOString().slice(0, 10) ? ' · Overdue' : ''}</p>)}</div><button className={`${buttonClass} mt-3`} disabled={busy || !invoice} onClick={() => { setEditing(true); setRows([{ dueOn: first, amount: (outstanding / 100).toFixed(2) }, { dueOn: '', amount: '0.00' }]) }}>Prepare replacement schedule</button></div> : null}
      {editing ? <>
        <p className="my-3 font-medium">Outstanding to schedule: {money(outstanding)} · Already confirmed: {money(invoice?.paidCents ?? 0)}</p>
        <div className="mb-4 flex flex-wrap items-end gap-3"><label>Equal instalments<input className={inputClass} type="number" min="2" max="24" value={count} onChange={e => setCount(e.target.value)} /></label><label>First due<input className={inputClass} type="date" value={first} onChange={e => setFirst(e.target.value)} /></label><button className={buttonClass} disabled={busy} onClick={() => { try { setRows(buildMonthlyInstalments({ balanceCents: outstanding, count: Number(count), firstDueOn: first }).map(row => ({ dueOn: row.dueOn, amount: (row.amountCents / 100).toFixed(2) }))); setError('') } catch { setError('Select a valid first date and 2 to 24 instalments.') } }}>Generate monthly schedule</button></div>
        <div className="space-y-3">{rows.map((row, index) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label>Payment {index + 1} due<input className={inputClass} type="date" value={row.dueOn} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, dueOn: e.target.value } : r))} /></label><label>Amount including GST<input className={inputClass} type="number" min="0.01" step="0.01" value={row.amount} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, amount: e.target.value } : r))} /></label><button className={`${buttonClass} self-end`} disabled={busy || rows.length <= 2} onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove</button></div>)}</div>
        <p className="my-3">Scheduled {money(total)} · Difference {money(outstanding - total)}</p><div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={busy || rows.length >= 24} onClick={() => setRows([...rows, { dueOn: '', amount: '' }])}>Add instalment</button><button className={buttonClass} disabled={busy || !invoice || total !== outstanding} onClick={() => void save()}>Approve schedule for cleaner acceptance</button></div>
        {!invoice ? <p className="mt-2 text-sm text-amber-800">Prepare the full tax invoice above before approving this schedule.</p> : null}
      </> : null}
      <p className="mt-3 text-sm text-gray-600">Next: create the payment-plan agreement in the Agreement tab, preview both documents, and send them together. A replacement does not supersede an active plan until accepted.</p>
    </> : null}
    {error ? <p role="alert" className="mt-3 text-red-700">{error}</p> : null}
  </section>
}
