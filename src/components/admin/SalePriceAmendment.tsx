'use client'

import { useState } from 'react'
import type { ContractSale } from '@/lib/contractSales'
import { parseAmendedPrice, remainingPlanRows } from '@/lib/saleAmendmentPolicy'
import { parsePlanInstalments } from '@/lib/commissionPolicy'

const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
const buttonClass = 'rounded-lg border border-teal-700 px-3 py-2 font-semibold text-teal-800 disabled:opacity-50'

export default function SalePriceAmendment({ sale, busy, onSave }: {
  sale: ContractSale; busy: boolean; onSave: (input: Record<string, unknown>) => Promise<void>
}) {
  const invoice = sale.invoices.find(row => row.invoiceType === 'sale' && row.status !== 'void')
  const paid = invoice?.paidCents ?? 0
  const plan = sale.paymentPlan && ['active', 'awaiting_acceptance', 'defaulted'].includes(sale.paymentPlan.status) ? sale.paymentPlan : null
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState((sale.agreedPurchasePriceIncGstCents / 100).toFixed(2))
  const [reason, setReason] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState(() => remainingPlanRows(plan?.instalments ?? [], paid, plan?.openingPaidCents ?? 0).map(row => ({ dueOn: row.dueOn, amount: (row.amountCents / 100).toFixed(2) })))
  let newPrice = 0
  let validation = ''
  try { newPrice = parseAmendedPrice(price, sale.depositIncGstCents, paid) } catch (e) { validation = e instanceof Error ? e.message : 'Invalid price.' }
  const outstanding = newPrice - paid
  let instalments: ReturnType<typeof parsePlanInstalments> | null = null
  if (!validation && plan && outstanding > 0) {
    try { instalments = parsePlanInstalments(rows.map(row => ({ dueOn: row.dueOn, amountCents: Math.round(Number(row.amount) * 100) })), outstanding) }
    catch (e) { validation = e instanceof Error ? e.message : 'Invalid schedule.' }
  }
  const blocked = sale.handoverAt || ['completed', 'cancelled'].includes(sale.status)
    ? 'Price amendments are available before handover. Completed or cancelled sales need a separate accounting adjustment.'
    : !invoice ? 'Prepare the full sale tax invoice before using an amendment. Draft prices can be edited above.' : ''
  async function save() {
    setError('')
    try {
      await onSave({ newPrice: price, reason, requestId, expectedPriceCents: sale.agreedPurchasePriceIncGstCents, expectedPaidCents: paid, expectedPlanId: plan?.id ?? null, instalments })
      setEditing(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to amend this sale.') }
  }
  const history = sale.activity.filter(item => item.action === 'contract_sale.price.amended')
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <h3 className="text-lg font-bold">Amend purchase price</h3>
    <p className="mt-2 text-sm text-gray-600">Owner only. Keep this sale, invoice reference and confirmed payments. A revised invoice and purchase agreement will be prepared for you to review and send.</p>
    {blocked ? <p className="mt-3 text-sm text-gray-600">{blocked}</p> : !editing ? <button type="button" className={`${buttonClass} mt-3`} disabled={busy} onClick={() => setEditing(true)}>Amend sale price</button> : <div className="mt-4 space-y-4" onChange={() => setReviewed(false)}>
      <label className="block">New purchase price (including GST)<input className={inputClass} type="number" min="500.01" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
      <label className="block">Reason for amendment<textarea className={inputClass} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>
      <div className="rounded-lg bg-teal-50 p-3 text-sm"><p>Current price: {money(sale.agreedPurchasePriceIncGstCents)}</p><p>Confirmed payments retained: {money(paid)}</p>{newPrice > 0 ? <><p>Revised price: {money(newPrice)}</p><p>Revised outstanding balance: {money(outstanding)}</p></> : null}</div>
      {plan && outstanding > 0 ? <fieldset className="space-y-3"><legend className="font-semibold">Replacement payment plan</legend><p className="text-sm text-gray-600">Adjust the unpaid instalments to equal the revised outstanding balance. Paid amounts are not included again.</p>
        {rows.map((row, index) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label>Instalment {index + 1} due<input className={inputClass} type="date" value={row.dueOn} onChange={event => setRows(rows.map((item, n) => n === index ? { ...item, dueOn: event.target.value } : item))} /></label><label>Amount including GST<input className={inputClass} type="number" min="0.01" step="0.01" value={row.amount} onChange={event => setRows(rows.map((item, n) => n === index ? { ...item, amount: event.target.value } : item))} /></label><button type="button" className={`${buttonClass} self-end`} disabled={busy || rows.length <= 1} onClick={() => { setRows(rows.filter((_, n) => n !== index)); setReviewed(false) }}>Remove instalment</button></div>)}
        <p>Scheduled: {money(rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0))} / {money(outstanding)}</p>
        <button type="button" className={buttonClass} disabled={busy || rows.length >= 24} onClick={() => { setRows([...rows, { dueOn: '', amount: '' }]); setReviewed(false) }}>Add instalment</button>
      </fieldset> : null}
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">This supersedes the previous purchase agreement{plan ? ' and payment plan' : ''}. The revised agreement needs signed acceptance. Unclaimed commissions recalculate using the amended amount and payment eligibility; amendments are blocked if commission has already been invoiced or paid. Saving sends no email.</p>
      {validation ? <p role="alert" className="text-sm text-red-700">{validation}</p> : null}
      <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={event => { event.stopPropagation(); setReviewed(event.target.checked) }} />I have reviewed the revised price, balance and document replacement.</label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-3"><button type="button" className={buttonClass} disabled={busy || !reviewed || Boolean(validation) || reason.trim().length < 5 || newPrice === sale.agreedPurchasePriceIncGstCents} onClick={() => void save()}>Save amendment and prepare documents</button><button type="button" className={buttonClass} disabled={busy} onClick={() => { setEditing(false); setReviewed(false); setError('') }}>Cancel editing</button></div>
    </div>}
    {history.length ? <details className="mt-4"><summary className="cursor-pointer font-semibold">Price amendment history</summary>{history.map(item => <p key={item.id} className="mt-2 text-sm">{new Date(item.createdAt).toLocaleDateString('en-AU')}: {money(Number(item.details.oldPriceCents))} to {money(Number(item.details.newPriceCents))} — {String(item.details.reason ?? '')}</p>)}
      {(sale.agreementHistory ?? []).filter(item => item.signedFileName).map(item => <a key={item.id} className="mt-2 block text-sm text-teal-700 underline" href={`/api/admin/contract-sales/agreements?saleId=${sale.id}&agreementId=${item.id}`}>Download signed purchase agreement version {item.version} ({item.status === 'void' ? 'superseded' : item.status})</a>)}
    </details> : null}
  </section>
}
