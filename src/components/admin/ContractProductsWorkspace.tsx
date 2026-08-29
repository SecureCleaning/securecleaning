'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { CONTRACT_PRODUCT_STATES } from '@/lib/contractProductPolicy'
import { getContractProductStartDateDraft, resolveContractProductStartDate } from '@/lib/contractProductListingDetails'
import type { ContractProduct } from '@/lib/contractProducts'

type WorkspaceData = {
  products: ContractProduct[]
  broadcasts: Array<{ id: string; state: string; subject: string; status: string; recipientCount: number; sentCount: number; failedCount: number; skippedCount: number; createdAt: string }>
  actor: { id: string; role: string; state: string | null; displayName: string }
  jobsUrl: string
}

type ProductDraft = {
  heading: string
  description: string
  startDate: string
  startDateTbc: boolean
  annualVisits: string
  estimatedHoursPerVisit: string
  keyedJob: ContractProduct['keyedJob']
  formalContract: boolean
  freeInitialClean: boolean
  purchasePriceExGst: string
  pricingMethod: ContractProduct['pricingMethod']
  pricingNote: string
}

function draftFromProduct(product: ContractProduct): ProductDraft {
  return {
    heading: product.heading,
    description: product.description,
    ...getContractProductStartDateDraft(product.startDate),
    annualVisits: String(product.annualVisits),
    estimatedHoursPerVisit: product.estimatedHoursPerVisit,
    keyedJob: product.keyedJob,
    formalContract: product.formalContract,
    freeInitialClean: product.freeInitialClean,
    purchasePriceExGst: (product.purchasePriceExGstCents / 100).toFixed(2),
    pricingMethod: product.pricingMethod,
    pricingNote: product.pricingNote,
  }
}

function productUpdatePayload(draft: ProductDraft) {
  const { startDateTbc, ...fields } = draft
  return {
    ...fields,
    startDate: resolveContractProductStartDate(draft.startDate, startDateTbc),
  }
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(cents / 100)
}

function statusClass(status: string) {
  if (status === 'available') return 'bg-green-100 text-green-800'
  if (status === 'sold') return 'bg-blue-100 text-blue-800'
  if (status === 'reserved') return 'bg-amber-100 text-amber-800'
  if (status === 'withdrawn') return 'bg-gray-200 text-gray-700'
  return 'bg-purple-100 text-purple-800'
}

export default function ContractProductsWorkspace({ portal = 'admin', initialProductId = '', assigneeId = '' }: { portal?: 'admin' | 'agent'; initialProductId?: string; assigneeId?: string }) {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedId, setSelectedId] = useState(initialProductId)
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [view, setView] = useState<'products' | 'broadcasts'>('products')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [broadcastState, setBroadcastState] = useState('VIC')
  const [broadcastProducts, setBroadcastProducts] = useState<string[]>([])
  const [broadcastSubject, setBroadcastSubject] = useState('')
  const [broadcastIntro, setBroadcastIntro] = useState('')
  const [broadcastPreview, setBroadcastPreview] = useState<{ recipientCount: number; consideredCount: number; excluded: Record<string, number> } | null>(null)
  const [broadcastRequestId, setBroadcastRequestId] = useState('')

  const load = useCallback(async (preferredId = '') => {
    const response = await fetch('/api/admin/contract-products', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load contract products.')
    const next = result as WorkspaceData & { success: boolean }
    setData(next)
    const id = next.products.some((product) => product.id === preferredId) ? preferredId : next.products[0]?.id ?? ''
    setSelectedId(id)
    const selected = next.products.find((product) => product.id === id)
    setDraft(selected ? draftFromProduct(selected) : null)
    const state = next.actor.state ?? next.products.find((product) => product.status === 'available')?.state ?? 'VIC'
    setBroadcastState(state)
  }, [])

  useEffect(() => { void load(initialProductId).catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load.')) }, [initialProductId, load])
  const selected = data?.products.find((product) => product.id === selectedId) ?? null
  const previewAnnualValue = selected && draft
    ? selected.clientPricePerVisitExGstCents * Math.max(0, Math.round(Number(draft.annualVisits) || 0)) : 0
  const previewPurchasePrice = draft?.pricingMethod === 'manual'
    ? Math.max(0, Math.round((Number(draft.purchasePriceExGst) || 0) * 100))
    : Math.round(previewAnnualValue * 0.5)
  const filtered = useMemo(() => (data?.products ?? []).filter((product) => filter === 'all' || product.status === filter), [data, filter])
  const stateProducts = (data?.products ?? []).filter((product) => product.state === broadcastState && product.status === 'available')

  function selectProduct(id: string) {
    setSelectedId(id)
    const product = data?.products.find((item) => item.id === id)
    setDraft(product ? draftFromProduct(product) : null)
    setMessage('')
  }

  async function action(actionName: string, payload: Record<string, unknown>) {
    setBusy(actionName)
    setMessage('')
    try {
      const response = await fetch('/api/admin/contract-products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, ...payload }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The action could not be completed.')
      return result.result
    } finally {
      setBusy('')
    }
  }

  async function save() {
    if (!selected || !draft) return
    try {
      await action('product.update', {
        productId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        ...productUpdatePayload(draft),
      })
      setMessage('Product saved.')
      await load(selected.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save product.') }
  }

  async function publish() {
    if (!selected || !draft) return
    try {
      const saved = await action('product.update', {
        productId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        ...productUpdatePayload(draft),
      }) as ContractProduct
      await action('product.publish', { productId: selected.id, expectedUpdatedAt: saved.updatedAt })
      setMessage('Product published to the available-jobs directory.')
      await load(selected.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to publish product.') }
  }

  async function withdraw() {
    if (!selected || !window.confirm('Remove this product from the available-jobs directory?')) return
    try {
      await action('product.withdraw', { productId: selected.id, expectedUpdatedAt: selected.updatedAt })
      setMessage('Product withdrawn.')
      await load(selected.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to withdraw product.') }
  }

  async function previewBroadcast() {
    try {
      const result = await action('broadcast.preview', { state: broadcastState, productIds: broadcastProducts })
      setBroadcastPreview(result)
      if (!broadcastSubject) setBroadcastSubject(result.defaultSubject)
      if (!broadcastIntro) setBroadcastIntro(result.defaultIntro)
      setBroadcastRequestId('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview broadcast.') }
  }

  async function sendBroadcast() {
    if (!broadcastPreview || !window.confirm(`Send this broadcast to ${broadcastPreview.recipientCount} eligible cleaners?`)) return
    try {
      const requestId = broadcastRequestId || crypto.randomUUID()
      setBroadcastRequestId(requestId)
      const result = await action('broadcast.send', {
        state: broadcastState, productIds: broadcastProducts, subject: broadcastSubject, intro: broadcastIntro,
        idempotencyKey: requestId,
      })
      if (result.inProgress) {
        setMessage('This broadcast is still being processed. Keep this page open and retry in a few minutes; the same send request will resume safely.')
        return
      }
      setMessage(`Broadcast completed: ${result.sentCount ?? 0} sent, ${result.failedCount ?? 0} unresolved or failed.`)
      setBroadcastPreview(null)
      setBroadcastRequestId('')
      await load(selectedId)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send broadcast.') }
  }

  if (!data) return <div className="rounded-xl border border-gray-200 bg-white p-6">{message || 'Loading contract products...'}</div>
  const backHref = portal === 'agent' ? '/agent' : '/admin'

  return <div>
    <AdminPageHeader title="Contract Products" description="Turn won client opportunities into editable cleaner-facing contract listings." backHref={backHref} backLabel={portal === 'agent' ? 'Back to agent portal' : 'Back to overview'} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50 p-4">
      <div className="flex gap-2"><button type="button" onClick={() => setView('products')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'products' ? 'bg-teal-700 text-white' : 'bg-white text-gray-700'}`}>Products</button><button type="button" onClick={() => setView('broadcasts')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === 'broadcasts' ? 'bg-teal-700 text-white' : 'bg-white text-gray-700'}`}>Broadcasts</button></div>
      <div className="flex flex-wrap gap-2">{data.jobsUrl ? <><a href={data.jobsUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800">Preview available jobs</a><button type="button" onClick={() => void navigator.clipboard.writeText(data.jobsUrl)} className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800">Copy reusable link</button></> : <span className="text-sm text-amber-800">Reusable jobs link is not configured.</span>}</div>
    </div>
    {message ? <p role="status" className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">{message}</p> : null}

    {view === 'products' ? <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">{['all', 'draft', 'available', 'reserved', 'sold', 'withdrawn'].map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>{status}</button>)}</div>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">{filtered.map((product) => <button key={product.id} type="button" onClick={() => selectProduct(product.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === product.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}><span className="block font-semibold">{product.productCode} · {product.suburb}, {product.state}</span><span className="mt-1 block text-sm text-gray-600">{product.heading}</span><span className="mt-2 flex items-center justify-between text-xs"><span className={`rounded-full px-2 py-1 font-semibold ${statusClass(product.status)}`}>{product.status}</span><span>{money(Math.round(product.purchasePriceExGstCents * 1.1))} inc GST</span></span></button>)}{filtered.length === 0 ? <p className="p-3 text-sm text-gray-500">No products in this status.</p> : null}</div>
      </aside>
      {selected && draft ? <main className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-sm font-semibold text-teal-700">{selected.productCode}</p><h2 className="mt-1 text-xl font-bold text-gray-900">{selected.heading}</h2><p className="mt-1 text-sm text-gray-600">{selected.suburb}, {selected.state} · {selected.status} · {selected.interestCount} interest{selected.interestCount === 1 ? '' : 's'}</p></div><div className="flex flex-wrap gap-2"><Link href={portal === 'agent' ? `/availability/clients/${encodeURIComponent(assigneeId)}?opportunity=${selected.opportunityId}` : `/admin/clients?opportunity=${selected.opportunityId}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Client record</Link>{selected.sourceQuoteRef ? <Link href={portal === 'agent' ? `/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(selected.sourceQuoteRef)}?opportunity=${encodeURIComponent(selected.opportunityId)}` : `/admin/quotes/${encodeURIComponent(selected.sourceQuoteRef)}?opportunity=${encodeURIComponent(selected.opportunityId)}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Winning quote</Link> : null}</div></div></section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Listing details</h3><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium md:col-span-2">Heading<input value={draft.heading} onChange={(event) => setDraft({ ...draft, heading: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium md:col-span-2">Cleaner-facing description<textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><div><div className="flex items-center justify-between gap-3 text-sm"><label htmlFor="product-start-date" className="font-medium">Proposed start date</label><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={draft.startDateTbc} onChange={(event) => setDraft({ ...draft, startDateTbc: event.target.checked })} /> TBC</label></div><input id="product-start-date" type="date" value={draft.startDateTbc ? '' : draft.startDate} disabled={draft.startDateTbc} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 disabled:bg-gray-100" /><span className="mt-1 block text-xs text-gray-500">{draft.startDateTbc ? 'The cleaner listing will show TBC.' : 'Tick TBC if the commencement date is not confirmed.'}</span></div><label className="text-sm font-medium">Estimated hours per visit<input type="text" inputMode="decimal" maxLength={40} value={draft.estimatedHoursPerVisit} onChange={(event) => setDraft({ ...draft, estimatedHoursPerVisit: event.target.value })} placeholder="e.g. 1.5 - 2 hours" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /><span className="mt-1 block text-xs font-normal text-gray-500">Enter one duration or a range. Leave blank to show TBC.</span></label><label className="text-sm font-medium">Keyed job<select value={draft.keyedJob} onChange={(event) => setDraft({ ...draft, keyedJob: event.target.value as ProductDraft['keyedJob'] })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="unknown">To confirm</option><option value="keyed">Keyed</option><option value="not_keyed">Not keyed</option></select></label><div className="flex flex-col justify-end gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.formalContract} onChange={(event) => setDraft({ ...draft, formalContract: event.target.checked })} /> Formal contract</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.freeInitialClean} onChange={(event) => setDraft({ ...draft, freeInitialClean: event.target.checked })} /> Free initial clean</label></div></div></section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Service and financial details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs font-semibold uppercase text-gray-500">Client rate / visit</p><p className="mt-1 font-semibold">{money(selected.clientPricePerVisitExGstCents)} ex GST</p></div><div><p className="text-xs font-semibold uppercase text-gray-500">Annual value preview</p><p className="mt-1 font-semibold">{money(previewAnnualValue)} ex GST</p><p className="text-xs text-gray-500">{money(Math.round(previewAnnualValue * 1.1))} inc GST</p></div><div><p className="text-xs font-semibold uppercase text-gray-500">Purchase price preview</p><p className="mt-1 font-semibold">{money(previewPurchasePrice)} ex GST</p><p className="text-xs text-gray-500">{money(Math.round(previewPurchasePrice * 1.1))} inc GST</p></div><div><p className="text-xs font-semibold uppercase text-gray-500">Schedule</p><p className="mt-1 font-semibold">{selected.frequency.replaceAll('_', ' ')} · {selected.timePreference.replaceAll('_', ' ')}</p></div><label className="text-sm font-medium">Annual visits<input type="number" min="1" max="366" value={draft.annualVisits} onChange={(event) => setDraft({ ...draft, annualVisits: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium">Purchase pricing<select value={draft.pricingMethod} onChange={(event) => setDraft({ ...draft, pricingMethod: event.target.value as ProductDraft['pricingMethod'] })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="default_50_percent">Default 50%</option><option value="manual">Manual override</option></select></label><label className="text-sm font-medium">Purchase price ex GST<input type="number" min="1" step="0.01" value={draft.purchasePriceExGst} disabled={draft.pricingMethod !== 'manual'} onChange={(event) => setDraft({ ...draft, purchasePriceExGst: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 disabled:bg-gray-100" /><span className="mt-1 block text-xs font-normal text-gray-500">The preview above is the amount that will be published.</span></label><label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Internal pricing note<textarea rows={2} value={draft.pricingNote} onChange={(event) => setDraft({ ...draft, pricingNote: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div></section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Cleaner scope preview</h3><p className="mt-1 text-sm text-gray-600">This independent snapshot excludes the client identity, exact address, postcode, quote reference, pricing calculations, and security notes.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{selected.cleanerScopeSnapshot.rooms.map((room, index) => <div key={`${room.type}-${index}`} className="rounded-xl border border-gray-200 p-4"><h4 className="font-semibold">{room.label} · Qty {room.quantity}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{room.tasks.map((task) => <li key={task}>{task}</li>)}</ul></div>)}</div></section>
        <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg">{selected.status === 'available' ? <><span className="mr-auto text-sm text-gray-600">Withdraw this listing before editing or publishing a new version.</span><button type="button" onClick={() => void withdraw()} disabled={Boolean(busy)} className="rounded-lg border border-red-200 px-5 py-3 font-semibold text-red-700">Withdraw</button></> : selected.status === 'draft' || selected.status === 'withdrawn' ? <><button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy === 'product.update' ? 'Saving...' : 'Save draft'}</button><button type="button" onClick={() => void publish()} disabled={Boolean(busy)} className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">Publish</button></> : <span className="text-sm text-gray-600">This product is locked while {selected.status}.</span>}</div>
      </main> : <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">Close a CRM opportunity as won to create the first product.</div>}
    </div> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Broadcast available jobs</h2><p className="mt-1 text-sm text-gray-600">Send one privacy-safe digest to approved, non-suppressed cleaners in the selected state.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">State<select value={broadcastState} disabled={data.actor.role === 'agent'} onChange={(event) => { setBroadcastState(event.target.value); setBroadcastProducts([]); setBroadcastPreview(null) }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">{CONTRACT_PRODUCT_STATES.map((state) => <option key={state}>{state}</option>)}</select></label><div><p className="text-sm font-medium">Products</p><p className="mt-1 text-xs text-gray-500">Leave all unticked to include every available product in this state.</p></div><div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">{stateProducts.map((product) => <label key={product.id} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm"><input type="checkbox" checked={broadcastProducts.includes(product.id)} onChange={(event) => setBroadcastProducts(event.target.checked ? [...broadcastProducts, product.id] : broadcastProducts.filter((id) => id !== product.id))} /><span><strong>{product.productCode}</strong> · {product.suburb}<span className="block text-xs text-gray-500">{product.heading}</span></span></label>)}{stateProducts.length === 0 ? <p className="text-sm text-gray-500">No available products in this state.</p> : null}</div><label className="text-sm font-medium sm:col-span-2">Subject<input value={broadcastSubject} onChange={(event) => setBroadcastSubject(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><label className="text-sm font-medium sm:col-span-2">Introduction<textarea rows={4} value={broadcastIntro} onChange={(event) => setBroadcastIntro(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void previewBroadcast()} disabled={Boolean(busy)} className="rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white disabled:opacity-60">Preview eligibility</button>{broadcastPreview ? <button type="button" onClick={() => void sendBroadcast()} disabled={Boolean(busy) || broadcastPreview.recipientCount === 0} className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-60">Send to {broadcastPreview.recipientCount} cleaners</button> : null}</div>{broadcastPreview ? <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm"><strong>{broadcastPreview.recipientCount} eligible</strong> from {broadcastPreview.consideredCount} approved cleaner records.<p className="mt-1 text-gray-600">Excluded: {broadcastPreview.excluded.suppressed ?? 0} suppressed, {broadcastPreview.excluded.invalidEmail ?? 0} invalid email, {broadcastPreview.excluded.duplicateEmail ?? 0} duplicate email.</p></div> : null}</section>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Broadcast history</h2><div className="mt-3 divide-y divide-gray-100">{data.broadcasts.map((campaign) => <div key={campaign.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><strong>{campaign.state} · {campaign.subject}</strong><span className="text-xs uppercase text-gray-500">{campaign.status}</span></div><p className="mt-1 text-xs text-gray-500">{new Date(campaign.createdAt).toLocaleString('en-AU')} · {campaign.sentCount}/{campaign.recipientCount} sent · {campaign.failedCount} unresolved/failed</p></div>)}{data.broadcasts.length === 0 ? <p className="py-3 text-sm text-gray-500">No broadcasts sent yet.</p> : null}</div></section>
    </div>}
  </div>
}
