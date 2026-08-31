'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import type { ContractProduct } from '@/lib/contractProducts'
import type { ContractSale, ContractSaleCleanerOption } from '@/lib/contractSales'

type Data = {
  products: ContractProduct[]
  sales: ContractSale[]
  cleaners: ContractSaleCleanerOption[]
  actor: { id: string; role: string; state: string | null; displayName: string }
}

type SaleTab = 'overview' | 'inspection' | 'agreement' | 'invoices' | 'activity'

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function statusTone(status: string) {
  if (['completed', 'paid', 'signed'].includes(status)) return 'bg-green-100 text-green-800'
  if (['cancelled', 'void', 'rejected', 'failed'].includes(status)) return 'bg-red-100 text-red-800'
  if (['deposit_due', 'balance_due', 'pending', 'agreement_pending'].includes(status)) return 'bg-amber-100 text-amber-800'
  return 'bg-blue-100 text-blue-800'
}

function formatInspectionDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
}

export default function ContractSalesWorkspace({ portal = 'admin', assigneeId = '', initialProductId = '' }: {
  portal?: 'admin' | 'agent'
  assigneeId?: string
  initialProductId?: string
}) {
  const [data, setData] = useState<Data | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState('')
  const [creatingSale, setCreatingSale] = useState(Boolean(initialProductId))
  const [selectedProductId, setSelectedProductId] = useState(initialProductId)
  const [selectedCleanerId, setSelectedCleanerId] = useState('')
  const [tab, setTab] = useState<SaleTab>('overview')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [newCleaner, setNewCleaner] = useState({ businessName: '', firstName: '', lastName: '', email: '', phone: '', suburb: '' })
  const [saleDraft, setSaleDraft] = useState({ commencementDate: '', notes: '' })
  const [inspection, setInspection] = useState({ date: '', time: '10:00', durationMinutes: '60', location: '', notes: '' })
  const [payment, setPayment] = useState({ invoiceId: '', amount: '', receivedOn: today(), method: 'bank_transfer', reference: '', evidenceNote: '' })
  const [paymentRequestId, setPaymentRequestId] = useState(() => crypto.randomUUID())
  const [plan, setPlan] = useState({ count: '3', firstDueOn: today() })
  const [balanceDueOn, setBalanceDueOn] = useState('')
  const [handoverDate, setHandoverDate] = useState(today())
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async (preferredSaleId = '') => {
    const response = await fetch('/api/admin/contract-sales', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load product sales.')
    const next = result as Data
    setData(next)
    const matchingSale = next.sales.find((sale) => sale.id === preferredSaleId)
      ?? next.sales.find((sale) => sale.productId === initialProductId)
      ?? (initialProductId || creatingSale ? undefined : next.sales[0])
    setSelectedSaleId(matchingSale?.id ?? '')
    if (matchingSale) {
      setSelectedProductId(matchingSale.productId)
      setSaleDraft({ commencementDate: matchingSale.commencementDate, notes: matchingSale.notes })
      setInspection((current) => ({ ...current, location: matchingSale.siteAddress }))
    } else if (!next.products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(next.products.find((product) => product.status === 'available')?.id ?? '')
    }
  }, [creatingSale, initialProductId, selectedProductId])

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load.')) }, [load])
  const sale = data?.sales.find((item) => item.id === selectedSaleId) ?? null
  const product = data?.products.find((item) => item.id === (sale?.productId ?? selectedProductId)) ?? null
  const stateCleaners = useMemo(() => (data?.cleaners ?? []).filter((cleaner) => !product || cleaner.state === product.state), [data, product])
  const selectedCleaner = stateCleaners.find((cleaner) => cleaner.id === selectedCleanerId) ?? null
  const activeSaleProductIds = new Set((data?.sales ?? []).filter((item) => item.status !== 'cancelled').map((item) => item.productId))
  const availableProducts = (data?.products ?? []).filter((item) => item.status === 'available' && !activeSaleProductIds.has(item.id))

  async function action(actionName: string, payload: Record<string, unknown>, preferredSaleId = selectedSaleId) {
    setBusy(actionName); setMessage('')
    try {
      const response = await fetch('/api/admin/contract-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionName, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to complete this action.')
      const id = result.result?.saleId ?? preferredSaleId
      await load(id)
      return result.result
    } finally { setBusy('') }
  }

  async function startSale() {
    try {
      const result = await action('sale.create', { productId: selectedProductId, cleanerId: selectedCleanerId }, '')
      setCreatingSale(false); setSelectedSaleId(result.saleId); setMessage('Product reserved and product sale created.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to start sale.') }
  }

  async function createCleaner() {
    if (!product) return
    try {
      const result = await action('cleaner.create', { ...newCleaner, state: product.state }, '')
      setMessage('Cleaner created as pending approval. Approve the cleaner record before starting the sale.')
      setSelectedCleanerId(result.cleanerId)
      setNewCleaner({ businessName: '', firstName: '', lastName: '', email: '', phone: '', suburb: '' })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create cleaner.') }
  }

  async function run(actionName: string, payload: Record<string, unknown>, success: string) {
    if (!sale) return
    try {
      await action(actionName, { saleId: sale.id, ...payload })
      if (actionName === 'payment.record') {
        setPayment({ invoiceId: '', amount: '', receivedOn: today(), method: 'bank_transfer', reference: '', evidenceNote: '' })
        setPaymentRequestId(crypto.randomUUID())
      }
      setMessage(success)
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to complete this action.') }
  }

  async function uploadAgreement(file: File | null) {
    if (!sale?.agreement || !file) return
    setBusy('agreement.upload'); setMessage('')
    try {
      const form = new FormData(); form.set('saleId', sale.id); form.set('agreementId', sale.agreement.id); form.set('file', file)
      const response = await fetch('/api/admin/contract-sales/agreements', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload agreement.')
      await load(sale.id); setMessage('Signed agreement uploaded.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to upload agreement.') }
    finally { setBusy('') }
  }

  if (!data) return <div className="rounded-xl border border-gray-200 bg-white p-6">{message || 'Loading product sales...'}</div>
  const base = portal === 'agent' ? `/availability` : '/admin'
  const productsHref = portal === 'agent' ? `/availability/products/${encodeURIComponent(assigneeId)}` : '/admin/products'
  const clientsHref = sale ? (portal === 'agent' ? `/availability/clients/${encodeURIComponent(assigneeId)}?opportunity=${sale.opportunityId}` : `/admin/clients?opportunity=${sale.opportunityId}`) : ''
  const quoteHref = sale?.sourceQuoteRef ? (portal === 'agent' ? `/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(sale.sourceQuoteRef)}?opportunity=${sale.opportunityId}` : `/admin/quotes/${encodeURIComponent(sale.sourceQuoteRef)}?opportunity=${sale.opportunityId}`) : ''
  const deposit = sale?.invoices.find((invoice) => invoice.invoiceType === 'deposit' && invoice.status !== 'void')
  const balance = sale?.invoices.find((invoice) => invoice.invoiceType === 'balance' && invoice.status !== 'void')

  return <div>
    <AdminPageHeader title="Product Sales" description="Reserve a product, collect the deposit, coordinate the inspection, document the agreement, and complete the cleaner handover." backHref={portal === 'agent' ? '/agent' : '/admin'} backLabel={portal === 'agent' ? 'Back to agent portal' : 'Back to overview'} />
    {message ? <p role="status" className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm">{message}</p> : null}

    <div className="mb-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Product sales</h2><button type="button" onClick={() => { setCreatingSale(true); setSelectedSaleId(''); setSelectedProductId(availableProducts[0]?.id ?? ''); setSelectedCleanerId('') }} className="rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800">New sale</button></div>
        <div className="mt-3 max-h-[64vh] space-y-2 overflow-y-auto">
          {data.sales.map((item) => <button key={item.id} type="button" onClick={() => { setCreatingSale(false); setSelectedSaleId(item.id); setSelectedProductId(item.productId); setSaleDraft({ commencementDate: item.commencementDate, notes: item.notes }); setInspection((current) => ({ ...current, location: item.siteAddress })) }} className={`w-full rounded-xl border p-3 text-left ${selectedSaleId === item.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}><strong className="block">{item.saleCode}</strong><span className="block text-sm">{item.productCode} · {item.cleanerBusiness}</span><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{item.status.replaceAll('_', ' ')}</span></button>)}
          {data.sales.length === 0 ? <p className="text-sm text-gray-500">No product sales yet.</p> : null}
        </div>
      </aside>

      <main className="min-w-0 space-y-5">
        {!sale ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Start a product sale</h2>
          <p className="mt-1 text-sm text-gray-600">Only approved cleaners can reserve a product and receive the $500 deposit invoice. <Link href={portal === 'agent' ? `/availability/cleaners/${encodeURIComponent(assigneeId)}` : '/admin/cleaners'} className="font-semibold text-teal-700 underline">Open cleaner records</Link> to approve a newly added cleaner.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Available product<select value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setSelectedCleanerId('') }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select product</option>{availableProducts.map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.suburb}, {item.state}</option>)}</select></label>
            <label className="text-sm font-medium">Approved cleaner<select value={selectedCleanerId} onChange={(event) => setSelectedCleanerId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Select cleaner</option>{stateCleaners.map((cleaner) => <option key={cleaner.id} value={cleaner.id} disabled={cleaner.status !== 'approved'}>{cleaner.businessName} · {cleaner.status.replaceAll('_', ' ')} · compliance {cleaner.complianceStatus.replaceAll('_', ' ')}</option>)}</select>{selectedCleaner && selectedCleaner.complianceStatus !== 'current' ? <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-normal text-amber-900">Compliance is recorded as {selectedCleaner.complianceStatus.replaceAll('_', ' ')}. This is a warning only; the approved cleaner status controls sale eligibility.</span> : <span className="mt-1 block text-xs font-normal text-gray-500">Compliance is shown for review but does not block an approved cleaner from being selected.</span>}</label>
          </div>
          <button type="button" onClick={() => void startSale()} disabled={!selectedProductId || !selectedCleanerId || Boolean(busy)} className="mt-4 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Reserve product &amp; start sale</button>
          <details className="mt-6 rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer font-semibold">Add a new cleaner</summary><p className="mt-2 text-sm text-gray-600">The new record starts as pending approval and cannot receive an invoice until approved.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(['businessName', 'firstName', 'lastName', 'email', 'phone', 'suburb'] as const).map((field) => <label key={field} className="text-sm font-medium">{field.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}<input type={field === 'email' ? 'email' : 'text'} value={newCleaner[field]} onChange={(event) => setNewCleaner({ ...newCleaner, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>)}</div><button type="button" onClick={() => void createCleaner()} disabled={!product || Boolean(busy)} className="mt-4 rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800">Create pending cleaner</button></details>
        </section> : <>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-sm font-semibold text-teal-700">{sale.saleCode}</p><h2 className="text-xl font-bold">{sale.productCode} · {sale.cleanerBusiness}</h2><p className="text-sm text-gray-600">{sale.suburb}, {sale.state} · {money(sale.agreedPurchasePriceIncGstCents)} inc GST</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusTone(sale.status)}`}>{sale.status.replaceAll('_', ' ')}</span></div>
            <nav aria-label="Connected records" className="mt-5 flex flex-wrap gap-2"><Link href={quoteHref} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Quote</Link><Link href={clientsHref} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Client</Link><Link href={`${productsHref}?product=${encodeURIComponent(sale.productId)}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Product</Link><span className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Product sale</span></nav>
          </section>

          <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{[
            ['Cleaner', true], ['Deposit', deposit?.status === 'paid'], ['Inspection', sale.inspection?.status === 'completed'], ['Agreement', sale.agreement?.status === 'signed'], ['Balance', balance?.status === 'paid' || sale.paymentPlan?.status === 'active'], ['Handover', Boolean(sale.handoverAt)],
          ].map(([label, done], index) => <div key={String(label)} className={`rounded-xl border p-3 text-sm ${done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}><span className="block text-xs font-bold uppercase text-gray-500">{index + 1}</span><strong>{String(label)}</strong><span className="block text-xs">{done ? 'Complete' : 'Pending'}</span></div>)}</section>

          <div className="flex flex-wrap gap-2 border-b border-gray-200">{(['overview', 'inspection', 'agreement', 'invoices', 'activity'] as SaleTab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`px-4 py-3 text-sm font-semibold capitalize ${tab === item ? 'border-b-2 border-teal-700 text-teal-800' : 'text-gray-600'}`}>{item === 'invoices' ? 'Invoices & payments' : item}</button>)}</div>

          {tab === 'overview' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Sale overview</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><span className="text-xs font-bold uppercase text-gray-500">Cleaner</span><p className="font-semibold">{sale.cleanerName}<br />{sale.cleanerEmail}</p></div><div><span className="text-xs font-bold uppercase text-gray-500">Client</span><p className="font-semibold">{sale.clientName}<br />{sale.clientEmail}</p></div><div><span className="text-xs font-bold uppercase text-gray-500">Site</span><p className="font-semibold">{sale.siteAddress || `${sale.suburb}, ${sale.state}`}</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Commencement date<input type="date" value={saleDraft.commencementDate} onChange={(event) => setSaleDraft({ ...saleDraft, commencementDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Internal notes<textarea rows={3} value={saleDraft.notes} onChange={(event) => setSaleDraft({ ...saleDraft, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><button type="button" onClick={() => void run('sale.update', saleDraft, 'Sale details saved.')} disabled={Boolean(busy)} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white">Save overview</button>
            {!sale.handoverAt && sale.status !== 'cancelled' ? <details className="mt-6 border-t border-gray-200 pt-4"><summary className="cursor-pointer text-sm font-semibold text-red-700">Cancel this sale</summary><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Required cancellation reason" className="mt-3 w-full rounded-lg border border-red-200 p-3" /><button type="button" onClick={() => window.confirm('Cancel this product sale and release the product?') && void run('sale.cancel', { reason: cancelReason }, 'Sale cancelled and product released.')} className="mt-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Cancel sale</button></details> : null}</section> : null}

          {tab === 'inspection' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Three-party site inspection</h3><p className="mt-1 text-sm text-gray-600">The deposit must be confirmed before invitations are sent to the client, cleaner and Secure Cleaning representative.</p>{sale.inspection ? <div className="mt-4 rounded-xl bg-gray-50 p-4"><strong>{formatInspectionDate(sale.inspection.startsAt, sale.inspection.timeZone)}</strong><p>{sale.inspection.location}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(sale.inspection.status)}`}>{sale.inspection.status}</span></div> : null}<div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Date<input type="date" value={inspection.date} onChange={(event) => setInspection({ ...inspection, date: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Time<input type="time" value={inspection.time} onChange={(event) => setInspection({ ...inspection, time: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Duration minutes<input type="number" min="15" max="480" value={inspection.durationMinutes} onChange={(event) => setInspection({ ...inspection, durationMinutes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Location<input value={inspection.location} onChange={(event) => setInspection({ ...inspection, location: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium md:col-span-2">Inspection notes<textarea rows={3} value={inspection.notes} onChange={(event) => setInspection({ ...inspection, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void run('inspection.schedule', inspection, 'Inspection saved and invitations sent.')} disabled={deposit?.status !== 'paid' || Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Schedule &amp; send invites</button>{sale.inspection?.status === 'scheduled' ? <button type="button" onClick={() => void run('inspection.complete', { notes: inspection.notes }, 'Inspection marked complete.')} className="rounded-lg border border-green-600 px-4 py-2 font-semibold text-green-700">Mark completed</button> : null}</div></section> : null}

          {tab === 'agreement' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Sale agreement</h3><p className="mt-1 text-sm text-gray-600">Generate a versioned agreement, email it to the cleaner, then upload the returned signed PDF.</p>{sale.agreement ? <><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">{sale.agreement.content}</pre><div className="mt-3 flex flex-wrap items-center gap-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(sale.agreement.status)}`}>Version {sale.agreement.version} · {sale.agreement.status}</span>{sale.agreement.status === 'draft' ? <button type="button" onClick={() => void run('agreement.send', { agreementId: sale.agreement!.id }, 'Agreement sent to cleaner.')} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800">Send agreement</button> : null}{sale.agreement.signedFileName ? <a href={`/api/admin/contract-sales/agreements?saleId=${sale.id}&agreementId=${sale.agreement.id}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Download signed PDF</a> : <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Upload signed PDF<input type="file" accept="application/pdf" className="sr-only" onChange={(event) => void uploadAgreement(event.target.files?.[0] ?? null)} /></label>}{sale.paymentPlan && sale.agreement.type !== 'payment_plan' ? <button type="button" onClick={() => void run('agreement.create', {}, 'Payment-plan agreement version created.')} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">Create payment-plan agreement</button> : sale.agreement.status === 'sent' ? <button type="button" onClick={() => void run('agreement.create', {}, 'New agreement version created for a deliberate resend.')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Create new version</button> : null}</div></> : <button type="button" onClick={() => void run('agreement.create', {}, 'Agreement draft created.')} disabled={sale.inspection?.status !== 'completed'} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Create agreement draft</button>}</section> : null}

          {tab === 'invoices' ? <section className="space-y-5"><div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Invoices</h3><p className="text-sm text-gray-600">The deposit is exactly $500 including GST and is due on receipt.</p></div>{!deposit ? <button type="button" onClick={() => void run('invoice.issue', { invoiceType: 'deposit', idempotencyKey: crypto.randomUUID() }, 'Deposit invoice issued and emailed.')} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Issue $500 deposit</button> : !balance ? <div className="flex gap-2"><input type="date" value={balanceDueOn} onChange={(event) => setBalanceDueOn(event.target.value)} aria-label="Balance due date" className="rounded-lg border border-gray-300 px-3 py-2" /><button type="button" onClick={() => void run('invoice.issue', { invoiceType: 'balance', dueOn: balanceDueOn, idempotencyKey: crypto.randomUUID() }, 'Balance invoice issued and emailed.')} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Issue balance</button></div> : null}</div><div className="mt-4 space-y-2">{sale.invoices.map((invoice) => <div key={invoice.id} className="grid gap-2 rounded-xl border border-gray-200 p-4 text-sm sm:grid-cols-[1fr_auto_auto_auto]"><div><strong>{invoice.invoiceNumber}</strong><p>{invoice.invoiceType} · {invoice.paymentTerms}</p><p className="text-gray-500">Delivery: {invoice.deliveryStatus}</p></div><div className="font-semibold">{money(invoice.totalIncGstCents)}<span className="block text-xs text-gray-500">Paid {money(invoice.paidCents)}</span></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${statusTone(invoice.status)}`}>{invoice.status}</span><button type="button" onClick={() => void run('invoice.resend', { invoiceId: invoice.id }, 'Invoice email resent without creating a duplicate.')} className="h-fit rounded-lg border border-gray-300 px-3 py-2 font-semibold">Resend</button></div>)}</div></div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Record payment evidence</h3><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Invoice<select value={payment.invoiceId} onChange={(event) => setPayment({ ...payment, invoiceId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="">Select invoice</option>{sale.invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {money(invoice.totalIncGstCents - invoice.paidCents)} outstanding</option>)}</select></label><label className="text-sm font-medium">Amount<input type="number" step="0.01" min="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Received on<input type="date" value={payment.receivedOn} onChange={(event) => setPayment({ ...payment, receivedOn: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Method<select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Reference<input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Evidence note<input value={payment.evidenceNote} onChange={(event) => setPayment({ ...payment, evidenceNote: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label></div><button type="button" disabled={Boolean(busy)} onClick={() => void run('payment.record', { ...payment, idempotencyKey: paymentRequestId }, 'Payment evidence recorded for confirmation.')} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Record payment</button><div className="mt-4 space-y-2">{sale.payments.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 text-sm"><span><strong>{money(item.amountCents)}</strong> · {item.receivedOn} · {item.reference}</span><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{item.status}</span>{item.status === 'pending' && item.invoiceId && ['owner', 'manager'].includes(data.actor.role) ? <button type="button" onClick={() => void run('payment.confirm', { paymentId: item.id, invoiceId: item.invoiceId }, 'Payment confirmed.')} className="rounded-lg border border-green-600 px-3 py-1.5 font-semibold text-green-700">Confirm cleared</button> : null}</div></div>)}</div></div>
            {balance && balance.status !== 'paid' && !sale.paymentPlan ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="text-lg font-bold">Approve payment plan</h3><p className="text-sm">Agents, managers and owners may approve a monthly instalment plan. A new agreement version must then be signed.</p><div className="mt-4 flex flex-wrap gap-3"><label className="text-sm font-medium">Instalments<input type="number" min="2" max="24" value={plan.count} onChange={(event) => setPlan({ ...plan, count: event.target.value })} className="ml-2 rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">First due<input type="date" value={plan.firstDueOn} onChange={(event) => setPlan({ ...plan, firstDueOn: event.target.value })} className="ml-2 rounded-lg border border-gray-300 px-3 py-2" /></label><button type="button" onClick={() => void run('payment-plan.create', plan, 'Payment plan approved. Create a new payment-plan agreement version for signature.')} className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white">Approve plan</button></div></div> : null}
            {sale.paymentPlan ? <div className="rounded-2xl border border-gray-200 bg-white p-5"><h3 className="font-bold">Payment plan · {sale.paymentPlan.status}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{sale.paymentPlan.instalments.map((item) => <div key={item.sequenceNumber} className="rounded-lg bg-gray-50 p-3 text-sm">#{item.sequenceNumber} · {item.dueOn}<strong className="float-right">{money(item.amountCents)}</strong></div>)}</div></div> : null}
          </section> : null}

          {tab === 'activity' ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Activity</h3><div className="mt-4 divide-y divide-gray-100">{sale.activity.map((item) => <div key={item.id} className="py-3 text-sm"><strong>{item.action.replaceAll('.', ' ')}</strong><span className="ml-2 text-gray-500">{new Date(item.createdAt).toLocaleString('en-AU')}</span></div>)}{sale.activity.length === 0 ? <p className="text-sm text-gray-500">No activity recorded.</p> : null}</div></section> : null}

            {!sale.handoverAt && sale.status !== 'cancelled' ? <section className="sticky bottom-4 rounded-2xl border border-green-200 bg-green-50 p-4 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Operational handover</strong><p className="text-sm text-gray-700">Requires confirmed deposit, completed inspection, signed agreement, and either paid balance or an active payment plan.</p></div><div className="flex flex-wrap gap-2"><input type="date" value={handoverDate} onChange={(event) => setHandoverDate(event.target.value)} aria-label="Commencement date" className="min-w-0 rounded-lg border border-green-300 px-3 py-2" /><button type="button" onClick={() => window.confirm('Complete the cleaner handover and link this cleaner to the client site?') && void run('handover.complete', { commencedOn: handoverDate }, 'Operational handover completed.')} className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white">Complete handover</button></div></div></section> : null}
        </>}
      </main>
    </div>
  </div>
}
