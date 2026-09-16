'use client'

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState } from 'react'
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
    id: '', slug: '', category: 'Other', supplierSku: '', title: '', description: '', packSize: '',
    supplierCostCents: 0, markupOverrideBps: null, finalPriceOverrideCents: null, imageUrl: '',
    supplierProductUrl: '', active: true, sortOrder, updatedAt: null,
  }
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export default function ConsumablesAdmin({ initialCatalog }: { initialCatalog: ConsumablesAdminCatalog }) {
  const [settings, setSettings] = useState(initialCatalog.settings)
  const [products, setProducts] = useState(initialCatalog.products)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ConsumableProduct>(() => blankProduct(initialCatalog.products.length * 10 + 10))
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
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

  async function uploadImage(file: File | undefined) {
    if (!file) return
    setBusy('image')
    setStatus(null)
    try {
      const form = new FormData()
      form.set('file', file)
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
    const headers = ['Title', 'Description', 'Category', 'Supplier SKU', 'Pack size', 'Supplier cost', 'Markup %', 'Final price', 'Image URL', 'Supplier product URL', 'Active']
    const rows = products.map((product) => [
      product.title, product.description, product.category, product.supplierSku, product.packSize,
      (product.supplierCostCents / 100).toFixed(2), product.markupOverrideBps === null ? '' : (product.markupOverrideBps / 100).toFixed(2),
      product.finalPriceOverrideCents === null ? '' : (product.finalPriceOverrideCents / 100).toFixed(2),
      product.imageUrl, product.supplierProductUrl, product.active ? 'Yes' : 'No',
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

      {status ? <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${status.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{status.message}</div> : null}
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
            <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900">{product.title}</div><div className="mt-1 text-sm text-gray-600">{product.category} · {product.packSize}</div><div className="mt-1 text-xs text-gray-500">Cost {dollars(product.supplierCostCents)} · Client {dollars(calculateConsumablePriceCents(product.supplierCostCents, settings.defaultMarkupBps, product.markupOverrideBps, product.finalPriceOverrideCents))}</div></div>
            <div className="flex gap-2"><button type="button" onClick={() => edit(product)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Edit</button><button type="button" onClick={() => void toggleArchived(product)} disabled={Boolean(busy)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">{product.active ? 'Archive' : 'Restore'}</button></div>
          </div>)}
        </div>
      </section>

      {editingId ? <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{editingId === 'new' ? 'Add product' : 'Edit product'}</h3><p className="mt-1 text-sm text-gray-600">Supplier cost and markup are visible only to managers and owners.</p></div><button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">Cancel</button></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Title<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value, slug: current.id ? current.slug : slugifyConsumable(event.target.value) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Category<input list="consumable-categories" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /><datalist id="consumable-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
          <label className="text-sm font-semibold">Supplier SKU<input value={draft.supplierSku} onChange={(event) => setDraft((current) => ({ ...current, supplierSku: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Pack / carton size<input value={draft.packSize} onChange={(event) => setDraft((current) => ({ ...current, packSize: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold md:col-span-2">Description<textarea rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Supplier cost (ex GST)<input type="number" min="0" step="0.01" value={(draft.supplierCostCents / 100).toFixed(2)} onChange={(event) => setDraft((current) => ({ ...current, supplierCostCents: Math.round(Number(event.target.value || 0) * 100) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Markup override %<input type="number" min="0" max="500" step="0.1" value={draft.markupOverrideBps === null ? '' : draft.markupOverrideBps / 100} placeholder={`${settings.defaultMarkupBps / 100}% default`} onChange={(event) => setDraft((current) => ({ ...current, markupOverrideBps: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Final price override<input type="number" min="0" step="0.01" value={draft.finalPriceOverrideCents === null ? '' : (draft.finalPriceOverrideCents / 100).toFixed(2)} placeholder="Calculated automatically" onChange={(event) => setDraft((current) => ({ ...current, finalPriceOverrideCents: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Display order<input type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold md:col-span-2">Supplier product URL<input type="url" value={draft.supplierProductUrl} onChange={(event) => setDraft((current) => ({ ...current, supplierProductUrl: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">Product image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === 'image' || !initialCatalog.storageReady} onChange={(event) => void uploadImage(event.target.files?.[0])} className="mt-1 block w-full text-sm font-normal" /></label>
          <div className="rounded-lg border border-teal-200 bg-white p-3 text-sm"><div className="text-gray-500">Calculated client price</div><div className="mt-1 text-xl font-bold text-teal-800">{dollars(calculateConsumablePriceCents(draft.supplierCostCents, settings.defaultMarkupBps, draft.markupOverrideBps, draft.finalPriceOverrideCents))}</div></div>
          {draft.imageUrl ? <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"><img src={draft.imageUrl} alt="Product preview" className="h-24 w-24 rounded object-contain" /><span className="break-all text-xs text-gray-500">{draft.imageUrl}</span></div> : null}
        </div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void saveProduct()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'product' ? 'Saving...' : 'Save product'}</button></div>
      </section> : null}

      {importPreview ? <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Review spreadsheet import</h3><p className="mt-1 text-sm text-gray-700">Nothing is saved until you apply this import.</p></div><button type="button" onClick={() => setImportPreview(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">Cancel</button></div>
        {importPreview.warnings.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">{importPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-amber-200 bg-white"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-gray-100"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Pack</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Client price</th></tr></thead><tbody>{importPreview.products.map((product) => <tr key={`${product.slug}-${product.sortOrder}`} className="border-t border-gray-100"><td className="px-3 py-2 font-medium">{product.title}</td><td className="px-3 py-2 text-gray-600">{product.packSize}</td><td className="px-3 py-2 text-right">{dollars(product.supplierCostCents)}</td><td className="px-3 py-2 text-right">{dollars(calculateConsumablePriceCents(product.supplierCostCents, settings.defaultMarkupBps, product.markupOverrideBps, product.finalPriceOverrideCents))}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void applyImport()} disabled={Boolean(busy)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'import-apply' ? 'Importing...' : `Apply ${importPreview.products.length} products`}</button></div>
      </section> : null}
    </details>
  )
}
