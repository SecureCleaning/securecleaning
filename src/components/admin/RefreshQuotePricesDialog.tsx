'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildFirmQuotePreview, getFirmQuoteDisplayPrice, type FirmQuoteDraft } from '@/lib/quoteWorkflow'
import type { QuotePricingConfig } from '@/lib/pricing'
import type { QuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import { refreshQuotePrices } from '@/lib/refreshQuotePrices'
import { formatPriceRange } from '@/lib/quoteEngine'

type Configs = { pricingConfig: QuotePricingConfig; roomTypeConfig: QuoteRoomTypeConfig }
export default function RefreshQuotePricesDialog({ draft, pricingConfig, roomTypeConfig, apiPath, onClose, onApply }: Configs & {
  draft: FirmQuoteDraft; apiPath: string; onClose: () => void; onApply: (draft: FirmQuoteDraft, configs: Configs) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [latest, setLatest] = useState<Configs | null>(null)
  const [error, setError] = useState('')
  const [replaceCustom, setReplaceCustom] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(apiPath, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok || !data.success || !data.pricingConfig || !data.roomTypeConfig) throw new Error(data.error || 'Could not load current admin prices.')
        setLatest({ pricingConfig: data.pricingConfig, roomTypeConfig: data.roomTypeConfig })
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load prices.')
      }
    }
    void load()
    return () => controller.abort()
  }, [apiPath])
  const before = useMemo(() => buildFirmQuotePreview(draft, pricingConfig, roomTypeConfig), [draft, pricingConfig, roomTypeConfig])
  const refreshed = useMemo(() => latest ? refreshQuotePrices(draft, latest.roomTypeConfig, replaceCustom, roomTypeConfig) : null, [draft, latest, replaceCustom, roomTypeConfig])
  const after = useMemo(() => latest && refreshed ? buildFirmQuotePreview(refreshed.draft, latest.pricingConfig, latest.roomTypeConfig) : null, [latest, refreshed])
  const oldPrice = getFirmQuoteDisplayPrice(draft, before)
  const newPrice = after && refreshed ? getFirmQuoteDisplayPrice(refreshed.draft, after) : null
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="refresh-prices-title" className="max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] overflow-auto rounded-2xl border p-6 shadow-xl backdrop:bg-black/40">
    <h2 id="refresh-prices-title" className="text-xl font-bold text-slate-900">Refresh all prices</h2>
    <p className="mt-2 text-sm text-slate-600">Load current admin rates while keeping room order, titles, wording, quantities and frequencies. This does not save or send the quote.</p>
    <fieldset className="my-4 space-y-3 rounded-xl border p-4">
      <legend className="px-1 font-semibold">Custom prices</legend>
      <label className="flex items-start gap-2"><input type="radio" name="replace-custom-prices" checked={!replaceCustom} onChange={() => setReplaceCustom(false)} className="mt-1" /><span>Keep custom prices<span className="block text-xs text-slate-600">Retain saved task and extra-field prices, room overrides, adjustments and manual final/target prices.</span></span></label>
      <label className="flex items-start gap-2"><input type="radio" name="replace-custom-prices" checked={replaceCustom} onChange={() => setReplaceCustom(true)} className="mt-1" /><span>Replace custom prices<span className="block text-xs text-slate-600">Use current matched admin rates. Clear quote adjustments and manual final/target prices; reset room price overrides.</span></span></label>
    </fieldset>
    {error ? <p role="alert" className="text-red-700">{error}</p> : !after || !refreshed ? <p role="status">Loading current admin prices...</p> : <>
      <table className="w-full text-left text-sm"><caption className="mb-2 text-left text-slate-600">Per visit, excluding GST</caption><thead><tr><th className="py-2">Total</th><th>Current</th><th>Refreshed</th></tr></thead><tbody>
        <tr className="border-t"><th className="py-3">Calculated range</th><td>{formatPriceRange(before.adjustedLow, before.adjustedHigh)}</td><td>{formatPriceRange(after.adjustedLow, after.adjustedHigh)}</td></tr>
        <tr className="border-t"><th className="py-3">Client quote price</th><td>{formatPriceRange(oldPrice.low, oldPrice.high)}</td><td>{newPrice ? formatPriceRange(newPrice.low, newPrice.high) : '-'}</td></tr>
      </tbody></table>
      {!replaceCustom && (draft.finalPerVisit || draft.targetPrice) ? <p className="mt-2 text-sm text-amber-800">Your manual price is retained, so the client price may stay unchanged even when the calculated range changes.</p> : null}
      {refreshed.unmatched.length ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">No matching admin rate; retained unchanged:</p><ul className="list-disc pl-5">{refreshed.unmatched.map((label, index) => <li key={index}>{label}</li>)}</ul></div> : null}
    </>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" disabled={!latest || !refreshed || !!error} onClick={() => { if (latest && refreshed) onApply(refreshed.draft, latest) }} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Apply refreshed prices</button></div>
  </dialog>
}
