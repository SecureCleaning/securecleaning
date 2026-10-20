'use client'

import { useRef } from 'react'
import { formatPriceRange } from '@/lib/quoteEngine'
import type { RoomPricingBreakdown, WorkflowRoomItem } from '@/lib/quoteWorkflow'

type Props = {
  quoteRef: string
  rooms: WorkflowRoomItem[]
  prices: RoomPricingBreakdown
  workingLow: number
  workingHigh: number
}

export default function RoomPriceSummary({ quoteRef, rooms, prices, workingLow, workingHigh }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const total = rooms.reduce((sum, room) => ({
    low: sum.low + (prices[room.id]?.low ?? 0),
    high: sum.high + (prices[room.id]?.high ?? 0),
  }), { low: 0, high: 0 })

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800"
      >
        Room prices
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="room-price-summary-title"
        aria-describedby="room-price-summary-note"
        className="m-auto max-h-[94dvh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-gray-950/60"
      >
        <div className="flex max-h-[94dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-3">
            <div>
              <h2 id="room-price-summary-title" className="text-xl font-bold text-teal-950">Room price summary</h2>
              <p className="text-sm text-gray-600">{quoteRef} · {rooms.length} areas · Internal use only</p>
            </div>
            <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">
              Close
            </button>
          </div>
          <p id="room-price-summary-note" className="bg-teal-50 px-5 py-2 text-xs text-teal-950">
            Current editor values, including unsaved changes. All amounts are per visit, excluding GST, and include the quantity shown. Not included in client quotes or emails.
          </p>
          <div className="min-h-0 overflow-auto px-5">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Internal calculated value for each room in quote order</caption>
              <thead className="sticky top-0 bg-white text-xs text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-2">#</th>
                  <th scope="col" className="py-2 pr-3">Room / area</th>
                  <th scope="col" className="py-2 px-2 text-right">Qty</th>
                  <th scope="col" className="py-2 px-2 text-right">sqm each</th>
                  <th scope="col" className="py-2 pl-3 text-right">Value / visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {rooms.map((room, index) => (
                  <tr key={room.id} className="even:bg-gray-50">
                    <td className="py-0.5 pr-2 text-gray-500">{index + 1}</td>
                    <th scope="row" className="py-0.5 pr-3 font-medium">{room.label || room.type}</th>
                    <td className="py-0.5 px-2 text-right tabular-nums">{room.quantity}</td>
                    <td className="py-0.5 px-2 text-right tabular-nums">{room.size}</td>
                    <td className="whitespace-nowrap py-0.5 pl-3 text-right font-semibold tabular-nums">
                      {prices[room.id] ? formatPriceRange(prices[room.id].low, prices[room.id].high) : 'Unavailable'}
                    </td>
                  </tr>
                ))}
                {rooms.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-gray-500">No rooms added yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="space-y-1 border-t border-gray-200 bg-gray-50 px-5 py-3 text-sm">
            <div className="flex justify-between gap-4 font-bold"><span>Room subtotal</span><span>{formatPriceRange(total.low, total.high)}</span></div>
            <div className="flex justify-between gap-4"><span>Overall working quote</span><span>{formatPriceRange(workingLow, workingHigh)}</span></div>
            <p className="text-xs text-gray-600">The room subtotal excludes whole-quote add-ons and minimum call-out adjustments. Final client price overrides are not allocated to rooms. Display rounding can affect totals.</p>
          </div>
        </div>
      </dialog>
    </>
  )
}
