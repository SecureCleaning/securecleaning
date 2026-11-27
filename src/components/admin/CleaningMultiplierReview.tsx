'use client'

import { useMemo, useState } from 'react'
import type { QuotePricingConfig } from '@/lib/pricing'
import type { QuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import { buildFirmQuotePreview, getFirmQuoteDisplayPrice, getRoomMoppingContribution, reviewCleaningMultipliers, type FirmQuoteDraft } from '@/lib/quoteWorkflow'

const money = (value: number) => `$${value.toFixed(2)}`
const range = (low: number, high: number) => low === high ? money(low) : `${money(low)} - ${money(high)}`
const percentage = (factor: number) => `${factor >= 1 ? '+' : ''}${Math.round((factor - 1) * 10000) / 100}%`

export default function CleaningMultiplierReview({ draft, pricingConfig, roomTypeConfig, disabled, onApply, buildingLabel, frequencyLabel }: {
  draft: FirmQuoteDraft
  pricingConfig: QuotePricingConfig
  roomTypeConfig: QuoteRoomTypeConfig
  disabled: boolean
  onApply: (draft: FirmQuoteDraft) => void
  buildingLabel: string
  frequencyLabel: string
}) {
  const [reviewing, setReviewing] = useState(false)
  const data = useMemo(() => {
    const before = buildFirmQuotePreview(draft, pricingConfig, roomTypeConfig)
    try {
      const proposed = reviewCleaningMultipliers(draft, pricingConfig)
      const after = buildFirmQuotePreview(proposed, pricingConfig, roomTypeConfig)
      const mop = (value: FirmQuoteDraft) => value.roomItems.map(room => getRoomMoppingContribution(room, value, pricingConfig, roomTypeConfig))
      return { before, proposed, after, currentMopping: mop(draft), proposedMopping: mop(proposed), error: null }
    } catch (error) { return { before, error: error instanceof Error ? error.message : 'Unable to review multipliers.' } }
  }, [draft, pricingConfig, roomTypeConfig])
  const snapshot = draft.cleaningMultipliers
  const staleSelection = snapshot && (snapshot.premisesType !== draft.revisedInputs.premisesType || snapshot.frequency !== draft.revisedInputs.frequency)
  const applied = data.before.cleaningMultiplierBreakdown
  const same = JSON.stringify(snapshot) === JSON.stringify(data.proposed?.cleaningMultipliers)
  const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
  const currentPrice = getFirmQuoteDisplayPrice(draft, data.before)
  const proposedPrice = data.proposed && data.after ? getFirmQuoteDisplayPrice(data.proposed, data.after) : null
  const proposedBreakdown = data.after?.cleaningMultiplierBreakdown

  return <section className="mt-5 rounded-xl border border-indigo-200 bg-white p-4 text-sm" aria-label="Internal multiplier breakdown">
    <h3 className="font-semibold text-indigo-950">Building and frequency multipliers <span className="text-xs font-normal">Internal only</span></h3>
    <p className="mt-2">{snapshot ? `Reviewed rates in this draft: building x${snapshot.building} (${percentage(snapshot.building)}), frequency x${snapshot.frequencyFactor} (${percentage(snapshot.frequencyFactor)}).` : 'Existing pricing preserved. Building and frequency currently affect general area labour only; review below to apply them to the whole cleaning subtotal.'}</p>
    {data.proposed && <p className="mt-2">Current defaults for {buildingLabel}, {frequencyLabel}: building x{data.proposed.cleaningMultipliers!.building} ({percentage(data.proposed.cleaningMultipliers!.building)}), frequency x{data.proposed.cleaningMultipliers!.frequencyFactor} ({percentage(data.proposed.cleaningMultipliers!.frequencyFactor)}).</p>}
    {staleSelection && <p className="mt-2 font-semibold text-amber-800">Building type or frequency has changed since the last review. The previously reviewed multiplier rates are retained until you review and apply the new rates.</p>}
    {applied && <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div>Cleaning subtotal before multipliers<div className="font-bold">{range(applied.beforeLow, applied.beforeHigh)}</div></div>
      <div>Cleaning subtotal after multipliers<div className="font-bold">{range(applied.afterLow, applied.afterHigh)}</div></div>
      <div>Multiplier increase / decrease<div className="font-bold">{range(applied.afterLow - applied.beforeLow, applied.afterHigh - applied.beforeHigh)}</div></div>
    </div>}
    <p className="mt-2 text-xs text-gray-600">Per clean, excluding GST. Building and frequency compound once across general cleaning labour, tasks, mopping, room field extras, room charges and cleaning add-ons. Separately priced consumables are excluded. Quote adjustment, minimum call-out and final price overrides are applied afterwards. Floors, time and region still affect general area labour only.</p>
    <details className="mt-3 text-xs text-gray-600"><summary className="cursor-pointer">Other multipliers (general area labour only)</summary><p className="mt-2">Floors x{data.before.calculated.breakdown.floorsMultiplier}; time x{data.before.calculated.breakdown.timeMultiplier}; region x{data.before.calculated.breakdown.cityMultiplier}.</p></details>
    {data.error ? <p className="mt-3 text-red-700">{data.error}</p> : !reviewing ? <button type="button" disabled={disabled || same} className="mt-3 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 font-semibold disabled:opacity-50" onClick={() => setReviewing(true)}>{same ? 'Reviewed rates applied in editor' : 'Review building and frequency multipliers'}</button> : data.proposed && data.after && proposedBreakdown && proposedPrice && <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3" role="region" aria-label="Review building and frequency multipliers">
      <h4 className="font-semibold">Review before applying</h4>
      <p className="mt-2">{buildingLabel}: x{proposedBreakdown.building} ({percentage(proposedBreakdown.building)}). {frequencyLabel}: x{proposedBreakdown.frequency} ({percentage(proposedBreakdown.frequency)}).</p>
      <p className="mt-1 font-semibold">Combined: x{Number((proposedBreakdown.building * proposedBreakdown.frequency).toFixed(4))} ({percentage(proposedBreakdown.building * proposedBreakdown.frequency)}).</p>
      <p className="mt-2">Proposed cleaning subtotal: {range(proposedBreakdown.beforeLow, proposedBreakdown.beforeHigh)} before multipliers → {range(proposedBreakdown.afterLow, proposedBreakdown.afterHigh)} after multipliers.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead><tr><th scope="col">Per clean, ex GST</th><th scope="col" className="px-2 text-right">Current</th><th scope="col" className="px-2 text-right">Proposed</th></tr></thead><tbody>
        <tr><th scope="row" className="py-2 font-normal">Calculated quote before minimum</th><td className="px-2 text-right">{range(data.before.calculatedLow, data.before.calculatedHigh)}</td><td className="px-2 text-right">{range(data.after.calculatedLow, data.after.calculatedHigh)}</td></tr>
        <tr><th scope="row" className="py-2 font-normal">Working quote after minimum</th><td className="px-2 text-right">{range(data.before.adjustedLow, data.before.adjustedHigh)}</td><td className="px-2 text-right">{range(data.after.adjustedLow, data.after.adjustedHigh)}</td></tr>
        <tr><th scope="row" className="py-2">Client price (including any override)</th><td className="px-2 text-right">{range(currentPrice.low, currentPrice.high)}</td><td className="px-2 text-right">{range(proposedPrice.low, proposedPrice.high)}</td></tr>
        <tr><th scope="row" className="py-2 font-normal">Mopping included above{data.currentMopping?.some(v => v === null) ? ' (separable amounts only)' : ''}</th><td className="px-2 text-right">{money(sum(data.currentMopping ?? []))}</td><td className="px-2 text-right">{money(sum(data.proposedMopping ?? []))}</td></tr>
      </tbody></table></div>
      <p className="mt-2 font-semibold">Working quote change: {range(data.after.adjustedLow - data.before.adjustedLow, data.after.adjustedHigh - data.before.adjustedHigh)} per clean.</p>
      <p className="mt-2">Apply changes the editor only. Save separately to keep it. Final and target price overrides are preserved. The reviewed rates are stored with the draft; future default-rate changes require another review.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-2" onClick={() => setReviewing(false)}>Cancel</button><button type="button" disabled={disabled} className="rounded-lg bg-indigo-700 px-3 py-2 font-semibold text-white disabled:opacity-50" onClick={() => { onApply(data.proposed!); setReviewing(false) }}>Apply to editor</button></div>
    </div>}
  </section>
}
