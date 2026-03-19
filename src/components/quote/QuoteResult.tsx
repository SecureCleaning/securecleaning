'use client'

import Link from 'next/link'
import type { QuoteResult as QuoteResultType, QuoteInputs } from '@/lib/types'
import { formatCurrency } from '@/lib/quoteEngine'

interface QuoteResultProps {
  quoteRef: string
  result: QuoteResultType
  inputs: QuoteInputs
}

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  '3x_week': '3x per Week',
  '2x_week': '2x per Week',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  once_off: 'Once-Off',
}

const premisesLabels: Record<string, string> = {
  office: 'Office',
  medical: 'Medical / Healthcare',
  childcare: 'Childcare Centre',
  industrial: 'Industrial',
  retail: 'Retail',
  gym: 'Gym / Fitness',
  warehouse: 'Warehouse',
  other: 'Other',
}

export default function QuoteResultComponent({ quoteRef, result, inputs }: QuoteResultProps) {
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
          style={{ backgroundColor: '#22c55e' }}>
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: '#1a2744' }}>
          Your Instant Quote
        </h1>
        <p className="text-gray-500 text-sm">
          Quote Reference: <span className="font-mono font-semibold text-gray-700">{quoteRef}</span>
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Sent to <strong>{inputs.email}</strong>
        </p>
      </div>

      {/* Price card */}
      <div className="rounded-2xl p-8 text-white mb-6 text-center" style={{ backgroundColor: '#1a2744' }}>
        <p className="text-gray-400 text-sm mb-2">
          {result.isSpringClean ? 'Spring Clean — One-Off Price' : `Per Visit Estimate (${frequencyLabels[inputs.frequency] ?? inputs.frequency})`}
        </p>
        <p className="text-5xl font-black mb-1">
          {formatCurrency(result.totalLow)}
          <span className="text-3xl text-gray-400 font-normal mx-2">–</span>
          {formatCurrency(result.totalHigh)}
        </p>
        <p className="text-gray-400 text-sm">
          Price range per visit · Excl. GST
        </p>
        {result.carpetSteamSeparate && (
          <p className="mt-3 text-amber-300 text-sm">
            * Carpet steam cleaning quoted separately
          </p>
        )}
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Quote Breakdown</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Premises</span>
            <span className="font-medium">
              {premisesLabels[inputs.premisesType]} · {inputs.floorArea} sqm
              {inputs.floors > 1 ? ` · ${inputs.floors} floors` : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">City</span>
            <span className="font-medium">{cityLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Frequency</span>
            <span className="font-medium">{frequencyLabels[inputs.frequency]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time preference</span>
            <span className="font-medium capitalize">{inputs.timePreference.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Est. hours per visit</span>
            <span className="font-medium">{result.estimatedHours}h</span>
          </div>

          {result.addOnsTotal > 0 && (
            <>
              <div className="border-t border-gray-100 pt-3 mt-3">
                <p className="text-gray-500 text-xs font-medium mb-2 uppercase tracking-wide">Add-Ons</p>
                {result.breakdown.addOnsDetail.bathroomsTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bathrooms ({inputs.addOns.bathrooms})</span>
                    <span className="font-medium">{formatCurrency(result.breakdown.addOnsDetail.bathroomsTotal)}</span>
                  </div>
                )}
                {result.breakdown.addOnsDetail.kitchensTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Kitchens ({inputs.addOns.kitchens})</span>
                    <span className="font-medium">{formatCurrency(result.breakdown.addOnsDetail.kitchensTotal)}</span>
                  </div>
                )}
                {result.breakdown.addOnsDetail.windowsTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">External windows ({inputs.addOns.windows})</span>
                    <span className="font-medium">{formatCurrency(result.breakdown.addOnsDetail.windowsTotal)}</span>
                  </div>
                )}
                {result.breakdown.addOnsDetail.consumablesTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Consumables supply</span>
                    <span className="font-medium">{formatCurrency(result.breakdown.addOnsDetail.consumablesTotal)}</span>
                  </div>
                )}
                {result.breakdown.addOnsDetail.highTouchTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">High-touch disinfection</span>
                    <span className="font-medium">{formatCurrency(result.breakdown.addOnsDetail.highTouchTotal)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between font-bold text-base">
            <span>Total per visit</span>
            <span style={{ color: '#1a2744' }}>
              {formatCurrency(result.totalLow)} – {formatCurrency(result.totalHigh)}
            </span>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 text-center mb-8">
        This estimate is based on the information provided. Final pricing is confirmed after your free site inspection.
        Valid for 30 days. All prices exclude GST.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href={`/booking?quoteRef=${quoteRef}`}
          className="flex-1 inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-white text-lg transition-all hover:opacity-90"
          style={{ backgroundColor: '#22c55e' }}
        >
          Book Now
        </Link>
        <Link
          href="/quote"
          className="flex-1 inline-flex items-center justify-center px-8 py-4 rounded-xl font-semibold text-gray-700 text-lg border-2 border-gray-200 hover:border-gray-300 transition-all"
        >
          Recalculate
        </Link>
      </div>

      <p className="text-center text-sm text-gray-500 mt-4">
        Questions?{' '}
        <Link href="/contact" className="text-green-600 hover:underline">
          Contact our team
        </Link>{' '}
        or{' '}
        <button
          className="text-green-600 hover:underline"
          onClick={() => {
            // Trigger chat widget
            document.dispatchEvent(new CustomEvent('open-chat'))
          }}
        >
          chat with Max
        </button>
      </p>
    </div>
  )
}
