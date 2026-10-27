'use client'

/* eslint-disable @next/next/no-img-element */
import { csvCell } from '@/lib/csvCell'
import { useMemo, useRef, useState } from 'react'
import MoneyInput from '@/components/consumables/MoneyInput'
import ActionToast from '@/components/ActionToast'
import {
  calculateConsumablePriceCents,
  slugifyConsumable,
  type ConsumableCatalogSettings,
  type ConsumableProduct,
  type ConsumablesAdminCatalog,
} from '@/lib/consumablesShared'

type ImportPreview = { products: ConsumableProduct[]; warnings: string[] }

function dollars(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
}

function blankProduct(sortOrder: number): ConsumableProduct {
  return {
    variants: [], id: '', slug: '', category: 'Other', supplierSku: '', title: '', description: '', packSize: '',
    supplierCostCents: 0, markupOverrideBps: null, finalPriceOverrideCents: null, imageUrl: '',
    supplierProductUrl: '', active: true, sortOrder, updatedAt: null,
  }
}


export default function ConsumablesAdmin({ initialCatalog }: { initialCatalog: ConsumablesAdminCatalog }) {
  const [settings, setSettings] = useState(initialCatalog.settings)
  const [products, setProducts] = useState(initialCatalog.products)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ConsumableProduct>(() => blankProduct(initialCatalog.products.length * 10 + 10))
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const editor = useRef<HTMLElement | null>(null)
  const importInput = useRef<HTMLInputElement | null>(null)
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(), [products])

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/consumables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.error || 'Catalogue update failed.')
    return result
  }

  async function saveSettings() {
    setBusy('settings')
    setStatus(null)
    try {
      const result = await post({ action: 'settings.save', settings })
      setSettings(result.settings as ConsumableCatalogSettings)
      setStatus({ type: 'success', message: 'Consumables pricing settings saved.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save pricing settings.' })
    } finally {
      setBusy('')
    }
  }

  function edit(product?: ConsumableProduct) {
    const next = product ?? blankProduct((products.at(-1)?.sortOrder ?? 0) + 10)
    setEditingId(product?.id ?? 'new')
    setDraft({ ...next })
    setStatus(null)
  }

  async function saveProduct(product = draft) {
    if (product === draft && editor.current && [...editor.current.querySelectorAll('input')].some((input) => !input.reportValidity())) return
    setBusy('product')
    setStatus(null)
    try {
      const prepared = { ...product, slug: product.slug || slugifyConsumable(product.title) }
      const result = await post({ action: 'product.save', product: prepared })
      const saved = result.product as ConsumableProduct
      setProducts((current) => [...current.filter((item) => item.id !== saved.id), saved]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)))
      setEditingId(null)
      setDraft(blankProduct((products.at(-1)?.sortOrder ?? 0) + 10))
      setStatus({ type: 'success', message: `${saved.title} saved.` })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the product.' })
    } finally {
      setBusy('')
    }
  }

  async function toggleArchived(product: ConsumableProduct) {
    await saveProduct({ ...product, active: !product.active })
  }

  async function uploadImage(file: File | undefined, remoteUrl?: string) {
    if (!file && !remoteUrl) return
    setBusy('image')
    setStatus(null)
    try {
      const form = new FormData()
      if (file) form.set('file', file)
      else if (remoteUrl) form.set('url', remoteUrl)
      const response = await fetch('/api/admin/consumables/image', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Image upload failed.')
      setDraft((current) => ({ ...current, imageUrl: String(result.imageUrl) }))
      setStatus({ type: 'success', message: 'Image uploaded. Save the product to publish it.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to upload the image.' })
    } finally {
      setBusy('')
    }
  }

  async function previewSupplier() {
    setBusy('supplier')
    setStatus(null)
    try {
      const response = await fetch('/api/admin/consumables/supplier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: draft.supplierProductUrl }) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to read supplier details.')
      setDraft((current) => ({ ...result.product, id: current.id, slug: current.id ? current.slug : result.product.slug, sortOrder: current.sortOrder, active: current.active }))
      setStatus({ type: 'success', message: 'Supplier details loaded for review. Check sizes, prices and pack quantities before saving. Nothing has been published.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to read supplier details.' })
    } finally { setBusy('') }
  }

  async function previewImport(file: File | undefined) {
    if (!file) return
    setBusy('import-preview')
    setStatus(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch('/api/admin/consumables/import', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Spreadsheet import failed.')
      setImportPreview(result.preview as ImportPreview)
      setStatus({ type: 'success', message: `${result.preview.products.length} products are ready for review.` })
    } catch (error) {
      setImportPreview(null)
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to read the spreadsheet.' })
    } finally {
      if (importInput.current) importInput.current.value = ''
      setBusy('')
    }
  }

  async function applyImport() {
    if (!importPreview) return
    setBusy('import-apply')
    setStatus(null)
    try {
      const result = await post({ action: 'products.import', products: importPreview.products })
      const saved = result.products as ConsumableProduct[]
      setProducts((current) => {
        const byId = new Map(current.map((product) => [product.id, product]))
        saved.forEach((product) => byId.set(product.id, product))
        return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      })
      setImportPreview(null)
      setStatus({ type: 'success', message: `${saved.length} imported products saved.` })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to apply the import.' })
    } finally {
      setBusy('')
    }
  }

  function exportCsv() {
    const headers = ['Title', 'Description', 'Category', 'Supplier SKU', 'Pack size', 'Supplier cost', 'Markup %', 'Final price', 'Image URL', 'Supplier product URL', 'Active', 'Options JSON']
    const rows = products.map((product) => [
      product.title, product.description, product.category, product.supplierSku, product.packSize,
      (product.supplierCostCents / 100).toFixed(2), product.markupOverrideBps === null ? '' : (product.markupOverrideBps / 100).toFixed(2),
      product.finalPriceOverrideCents === null ? '' : (product.finalPriceOverrideCents / 100).toFixed(2),
      product.imageUrl, product.supplierProductUrl, product.active ? 'Yes' : 'No', JSON.stringify(product.variants ?? []),
    ])
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'secure-cleaning-consumables.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <details id="consumables" className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-bold text-gray-900">Consumables catalogue</summary>
      <p className="mt-2 text-sm text-gray-600">Manage the client-facing product catalogue. Supplier costs and markup remain private.</p>

      <ActionToast message={status?.message} tone={status?.type} onDismiss={() => setStatus(null)} />
      {!initialCatalog.storageReady ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The image storage bucket is not ready. Apply the consumables migration before uploading images.</div> : null}

      <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold text-gray-900">Pricing defaults</h3><p className="mt-1 text-sm text-gray-600">Final price = supplier cost plus markup, unless a product has an override.</p></div>
          <a href="/consumables" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800">Open public catalogue</a>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-gray-700">Default markup %<input type="number" min="0" max="500" step="0.1" value={settings.defaultMarkupBps / 100} onChange={(event) => setSettings((current) => ({ ...current, defaultMarkupBps: Math.round(Number(event.target.value || 0) * 100) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={settings.pricesExcludeGst} onChange={(event) => setSettings((current) => ({ ...current, pricesExcludeGst: event.target.checked }))} />Prices exclude GST</label>
          <button type="button" onClick={() => void saveSettings()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'settings' ? 'Saving...' : 'Save pricing settings'}</button>
        </div>
        <label className="mt-4 block text-sm font-semibold text-gray-700">Public availability note<textarea rows={2} value={settings.publicNote} onChange={(event) => setSettings((current) => ({ ...current, publicNote: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
      </section>

      <section className="mt-5 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-gray-900">Products</h3><p className="mt-1 text-sm text-gray-600">{products.length} products · {products.filter((product) => product.active).length} published</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => edit()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Add product</button><button type="button" onClick={exportCsv} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700">Export CSV</button><label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700">{busy === 'import-preview' ? 'Reading...' : 'Import Excel / CSV'}<input ref={importInput} type="file" accept=".xlsx,.csv" className="sr-only" disabled={Boolean(busy)} onChange={(event) => void previewImport(event.target.files?.[0])} /></label></div>
        </div>

        <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {products.map((product) => <div key={product.id} className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-center ${product.active ? '' : 'bg-gray-50 opacity-70'}`}>
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>}</div>
            <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900">{product.title}</div><div className="mt-1 text-sm text-gray-600">{product.category} · {product.packSize}</div><div className="mt-1 text-xs text-gray-500">{product.variants?.length ? `${product.variants.length} size options · Base cost` : 'Cost'} {dollars(product.supplierCostCents)} · {product.variants?.length ? 'Client from' : 'Client'} {dollars(product.variants?.length ? Math.min(...product.variants.map((variant) => calculateConsumablePriceCents(variant.supplierCostCents, settings.defaultMarkupBps, product.markupOverrideBps, variant.finalPriceOverrideCents))) : calculateConsumablePriceCents(product.supplierCostCents, settings.defaultMarkupBps, product.markupOverrideBps, product.finalPriceOverrideCents))}</div></div>
            <div className="flex gap-2"><button type="button" onClick={() => edit(product)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Edit</button><button type="button" onClick={() => void toggleArchived(product)} disabled={Boolean(busy)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">{product.active ? 'Archive' : 'Restore'}</button></div>
          </div>)}
        </div>
      </section>

      {editingId ? <section ref={editor} key={editingId} className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{editingId === 'new' ? 'Add product' : 'Edit product'}</h3><p className="mt-1 text-sm text-gray-600">Supplier cost and markup are visible only to managers and owners.</p></div><button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">Cancel</button></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Title<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value, slug: current.id ? current.slug : slugifyConsumable(event.target.value) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Category<input list="consumable-categories" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /><datalist id="consumable-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
          <label className="text-sm font-semibold">Supplier SKU<input value={draft.supplierSku} onChange={(event) => setDraft((current) => ({ ...current, supplierSku: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Pack / carton size<input value={draft.packSize} onChange={(event) => setDraft((current) => ({ ...current, packSize: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold md:col-span-2">Description<textarea rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">{draft.variants?.length ? 'Base supplier cost (options priced below)' : 'Supplier cost (ex GST)'}<MoneyInput value={draft.supplierCostCents} onChange={(value) => setDraft((current) => ({ ...current, supplierCostCents: value ?? 0 }))} /></label>
          <label className="text-sm font-semibold">Markup override %<input type="number" min="0" max="500" step="0.1" value={draft.markupOverrideBps === null ? '' : draft.markupOverrideBps / 100} placeholder={`${settings.defaultMarkupBps / 100}% default`} onChange={(event) => setDraft((current) => ({ ...current, markupOverrideBps: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          {!draft.variants?.length ? <label className="text-sm font-semibold">Final price override<MoneyInput optional value={draft.finalPriceOverrideCents} placeholder="Calculated automatically" onChange={(value) => setDraft((current) => ({ ...current, finalPriceOverrideCents: value }))} /></label> : null}
          <label className="text-sm font-semibold">Display order<input type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold md:col-span-2">Supplier product URL<input type="url" value={draft.supplierProductUrl} onChange={(event) => setDraft((current) => ({ ...current, supplierProductUrl: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <div className="md:col-span-2"><button type="button" disabled={Boolean(busy) || !draft.supplierProductUrl} onClick={() => void previewSupplier()} className="rounded-lg border border-teal-700 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy === 'supplier' ? 'Reading supplier...' : 'Fetch product details for review'}</button><p className="mt-1 text-xs text-gray-600">Supports Sydney Cleaning Supplies. Replaces the form details with the supplier data for review; save only after checking. Copy the image into the catalogue with Upload supplier image.</p></div>
          <label tabIndex={0} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy && initialCatalog.storageReady) void uploadImage(event.dataTransfer.files[0], event.dataTransfer.getData('text/uri-list').split('\n').find((line) => line && !line.startsWith('#'))) }} onPaste={(event) => { const file = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'))?.getAsFile(); if (file && !busy && initialCatalog.storageReady) { event.preventDefault(); void uploadImage(file) } }} className="rounded-lg border-2 border-dashed border-teal-300 p-3 text-sm font-semibold">Product image<span className="block text-xs font-normal text-gray-600">Drop an image file here, paste a copied image, or choose a file.</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === 'image' || !initialCatalog.storageReady} onChange={(event) => void uploadImage(event.target.files?.[0])} className="mt-1 block w-full text-sm font-normal" /></label>
          <div className="rounded-lg border border-teal-200 bg-white p-3 text-sm"><div className="text-gray-500">{draft.variants?.length ? 'Each option is priced below' : 'Calculated client price'}</div><div className="mt-1 text-xl font-bold text-teal-800">{dollars(calculateConsumablePriceCents(draft.supplierCostCents, settings.defaultMarkupBps, draft.markupOverrideBps, draft.finalPriceOverrideCents))}</div></div>
          {draft.imageUrl ? <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"><img src={draft.imageUrl} alt="Product preview" className="h-24 w-24 rounded object-contain" /><span className="break-all text-xs text-gray-500">{draft.imageUrl}</span>{draft.imageUrl.includes('sydneycleaningsupplies.com.au/') ? <button type="button" disabled={Boolean(busy) || !initialCatalog.storageReady} onClick={() => void uploadImage(undefined, draft.imageUrl)} className="rounded border px-3 py-2 text-sm">Upload supplier image</button> : null}</div> : null}
        </div>
        <fieldset className="mt-5 rounded-xl border border-teal-200 bg-white p-4">
          <legend className="px-2 font-semibold">Size / pack options</legend>
          <p className="text-sm text-gray-600">Options appear within this one product. Each has its own cost and optional final price; the product markup applies to all options.</p>
          {(draft.variants ?? []).map((variant, index) => <div key={index} className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-3">
            <label className="text-sm">Option name<input required value={variant.label} onChange={(event) => setDraft((current) => ({ ...current, variants: current.variants?.map((item, i) => i === index ? { ...item, label: event.target.value } : item) }))} className="mt-1 w-full rounded border p-2" /></label>
            <label className="text-sm">Pack size<input required value={variant.packSize} onChange={(event) => setDraft((current) => ({ ...current, variants: current.variants?.map((item, i) => i === index ? { ...item, packSize: event.target.value } : item) }))} className="mt-1 w-full rounded border p-2" /></label>
            <label className="text-sm">Supplier SKU<input value={variant.supplierSku} onChange={(event) => setDraft((current) => ({ ...current, variants: current.variants?.map((item, i) => i === index ? { ...item, supplierSku: event.target.value } : item) }))} className="mt-1 w-full rounded border p-2" /></label>
            <label className="text-sm">Supplier cost (ex GST)<MoneyInput value={variant.supplierCostCents} onChange={(value) => setDraft((current) => ({ ...current, variants: current.variants?.map((item, i) => i === index ? { ...item, supplierCostCents: value ?? 0 } : item) }))} /></label>
            <label className="text-sm">Final price override<MoneyInput optional value={variant.finalPriceOverrideCents} onChange={(value) => setDraft((current) => ({ ...current, variants: current.variants?.map((item, i) => i === index ? { ...item, finalPriceOverrideCents: value } : item) }))} /></label>
            <div className="text-sm">Client price: <strong>{dollars(calculateConsumablePriceCents(variant.supplierCostCents, settings.defaultMarkupBps, draft.markupOverrideBps, variant.finalPriceOverrideCents))}</strong><button type="button" className="ml-3 text-red-700 underline" onClick={() => setDraft((current) => ({ ...current, variants: current.variants?.filter((_, i) => i !== index) }))}>Remove option</button></div>
          </div>)}
          <button type="button" disabled={(draft.variants?.length ?? 0) >= 30} onClick={() => setDraft((current) => ({ ...current, variants: [...(current.variants ?? []), { label: '', packSize: current.packSize, supplierSku: '', supplierCostCents: current.supplierCostCents, finalPriceOverrideCents: null }] }))} className="mt-3 rounded border px-3 py-2 text-sm font-semibold">Add size / pack option</button>
        </fieldset>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void saveProduct()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'product' ? 'Saving...' : 'Save product'}</button></div>
      </section> : null}

      {importPreview ? <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Review spreadsheet import</h3><p className="mt-1 text-sm text-gray-700">Nothing is saved until you apply this import.</p></div><button type="button" onClick={() => setImportPreview(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">Cancel</button></div>
        {importPreview.warnings.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">{importPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-amber-200 bg-white"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-gray-100"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Pack</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Client price</th></tr></thead><tbody>{importPreview.products.map((product) => <tr key={`${product.slug}-${product.sortOrder}`} className="border-t border-gray-100"><td className="px-3 py-2 font-medium">{product.title}</td><td className="px-3 py-2 text-gray-600">{product.packSize}</td><td className="px-3 py-2 text-right">{dollars(product.supplierCostCents)}</td><td className="px-3 py-2 text-right">{dollars(product.variants?.length ? Math.min(...product.variants.map((variant) => calculateConsumablePriceCents(variant.supplierCostCents, settings.defaultMarkupBps, product.markupOverrideBps, variant.finalPriceOverrideCents))) : calculateConsumablePriceCents(product.supplierCostCents, settings.defaultMarkupBps, product.markupOverrideBps, product.finalPriceOverrideCents))}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void applyImport()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'import-apply' ? 'Importing...' : `Apply ${importPreview.products.length} products`}</button></div>
      </section> : null}
    </details>
  )
}
