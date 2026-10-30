'use client'
import { useEffect, useRef, useState } from 'react'
const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2'
const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value / 100)
export default function CommissionInvoiceReceived({ agents, balances, onSaved, onCancel }: {
  agents: { id: string; name: string }[]; balances: Record<string, unknown>[]; onSaved: () => Promise<void>; onCancel: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const [agentId, setAgentId] = useState('')
  const [reference, setReference] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [amount, setAmount] = useState('')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [requestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rows = balances.filter(row => row.agent_id === agentId && Number(row.earned_cents) > Number(row.claimed_cents))
  const chosen = rows.map(row => ({ saleId: String(row.sale_id), amountCents: Math.round(Number(allocations[String(row.sale_id)] || 0) * 100) })).filter(row => row.amountCents > 0)
  const total = chosen.reduce((sum, row) => sum + row.amountCents, 0)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (file && file.size > 3 * 1024 * 1024) throw new Error('Invoice attachment must be 3 MB or smaller.')
      const form = new FormData()
      form.set('invoice', JSON.stringify({ agentId, reference, invoiceDate, amountCents: Math.round(Number(amount) * 100), allocations: chosen, requestId }))
      if (file) form.set('file', file)
      const response = await fetch('/api/admin/commissions/invoices', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to record invoice.')
      await onSaved()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to record invoice.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-xl border border-teal-300 bg-white p-5" aria-label="Record invoice received">
    <h2 ref={heading} tabIndex={-1} className="scroll-mt-28 font-bold">Record agent invoice received</h2>
    <p className="mt-2 text-sm text-gray-600">Record an invoice received outside the system. Allocate the commission amount excluding GST to the sales below. This enables payment recording; it does not mark commission paid or transfer money.</p>
    <form onSubmit={event => void submit(event)}><fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Agent<select required className={field} value={agentId} onChange={event => { setAgentId(event.target.value); setAllocations({}) }}><option value="">Select agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <label>Invoice reference<input required className={field} maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label>Invoice date<input required type="date" className={field} value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} /></label>
        <label>Commission invoice amount excluding GST<input required type="number" min="0.01" step="0.01" className={field} value={amount} onChange={event => setAmount(event.target.value)} /></label>
      </div>
      <label className="block">Invoice attachment (optional)<input className={field} type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] || null)} /><span className="text-sm text-gray-600">PDF, PNG or JPEG, up to 3 MB. You can record receipt using the reference alone.</span></label>
      <div><h3 className="font-semibold">Allocate to sales</h3>{rows.map(row => <label key={String(row.sale_id)} className="my-2 block rounded-lg border p-3">{String(row.sale_code)} · {String(row.client_business || 'Client business not recorded')} · available {money(Number(row.earned_cents) - Number(row.claimed_cents))}<input aria-label={`Allocate ${String(row.sale_code)}`} className={field} type="number" min="0" max={(Number(row.earned_cents) - Number(row.claimed_cents)) / 100} step="0.01" value={allocations[String(row.sale_id)] || ''} placeholder="0.00" onChange={event => setAllocations(current => ({ ...current, [String(row.sale_id)]: event.target.value }))} /></label>)}{agentId && !rows.length ? <p>No commission available to invoice for this agent.</p> : null}<p>Allocated {money(total)} of {money(Math.round(Number(amount || 0) * 100))}. Amounts must match.</p></div>
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      <div className="flex gap-3"><button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!agentId || !reference.trim() || !invoiceDate || total <= 0 || total !== Math.round(Number(amount) * 100)}>Record invoice received</button><button type="button" className="rounded-lg border px-4 py-2" onClick={onCancel}>Cancel</button></div>
    </fieldset></form>
  </section>
}
