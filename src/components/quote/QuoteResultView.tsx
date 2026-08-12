'use client'

import Link from 'next/link'
import type { QuoteResult as QuoteResultType, QuoteInputs } from '@/lib/types'
import { isBathroomRoomScopeType, sanitizePublicRoomScope, summarizePublicRoomScope } from '@/lib/publicRoomScope'
import { formatPriceRange } from '@/lib/quoteEngine'

interface QuoteResultViewProps {
  quoteRef: string
  result: QuoteResultType
  inputs: QuoteInputs
  emailSent?: boolean
  emailError?: string | null
}

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  '3x_week': '3x per Week',
  '2x_week': '2x per Week',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  once_off: 'Recurring service',
}

const premisesLabels: Record<string, string> = {
  office: 'Office',
  medical: 'Medical / Healthcare',
  childcare: 'Childcare Centre',
  industrial: 'Industrial',
  retail: 'Retail',
  gym: 'Gym / Fitness',
  warehouse: 'Warehouse',
  function_centre: 'Function Centre / Venue',
  sports_facility: 'Sports Facility / Recreation Centre',
  other: 'Other',
}

const timeLabels: Record<string, string> = {
  business_hours: 'Business hours',
  after_hours: 'After hours (sometimes cheaper!)',
  weekend: 'Weekend (sometimes cheaper!)',
}

export default function QuoteResultView({ quoteRef, result, inputs, emailSent }: QuoteResultViewProps) {
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const hasEmailIssue = emailSent === false
  const roomScopeSummary = summarizePublicRoomScope(
    sanitizePublicRoomScope(inputs.roomScope).filter((room) => !isBathroomRoomScopeType(room.type) && room.type !== 'kitchen')
  )
  const bathroomScopeSummary = summarizePublicRoomScope(
    sanitizePublicRoomScope(inputs.roomScope).filter((room) => isBathroomRoomScopeType(room.type))
  )

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
          style={{ backgroundColor: '#22c55e' }}
        >
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
          {hasEmailIssue ? (
            <>
              We could not email your copy just yet, but your quote is ready here for <strong>{inputs.email}</strong>
            </>
          ) : (
            <>
              A copy has been prepared for <strong>{inputs.email}</strong>
            </>
          )}
        </p>
      </div>

      {hasEmailIssue && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
          <p className="font-semibold mb-1">Email delivery is temporarily unavailable</p>
          <p>
            Your quote was created successfully. Please use the quote reference above or this page while we restore
            automated email delivery.
          </p>
        </div>
      )}

      <div className="rounded-2xl p-8 text-white mb-6 text-center" style={{ backgroundColor: '#1a2744' }}>
        <p className="text-gray-400 text-sm mb-2">
          {`Per Visit Estimate (${frequencyLabels[inputs.frequency] ?? 'Recurring service'})`}
        </p>
        <p className="text-5xl font-black mb-1">{formatPriceRange(result.totalLow, result.totalHigh)}</p>
        <p className="text-gray-400 text-sm">Price range per visit · Excl. GST</p>
        {result.carpetSteamSeparate && (
          <p className="mt-3 text-amber-300 text-sm">* Carpet steam cleaning quoted separately</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Service Summary</h2>
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
            <span className="font-medium">{timeLabels[inputs.timePreference] ?? inputs.timePreference.replace(/_/g, ' ')}</span>
          </div>
          {(inputs.addOns.bathrooms > 0 ||
            bathroomScopeSummary.length > 0 ||
            inputs.addOns.kitchens > 0 ||
            roomScopeSummary.length > 0 ||
            inputs.addOns.glassCleaningRequired ||
            inputs.addOns.highTouchDisinfection) && (
            <div className="border-t border-gray-100 pt-3 mt-3">
              <p className="text-gray-500 text-xs font-medium mb-2 uppercase tracking-wide">
                Included requirements
              </p>
              <div className="text-right text-gray-700 space-y-1">
                {bathroomScopeSummary.map((item) => <div key={item}>{item}</div>)}
                {bathroomScopeSummary.length === 0 && inputs.addOns.bathrooms > 0 && <div>Bathrooms / toilets: {inputs.addOns.bathrooms}</div>}
                {inputs.addOns.kitchens > 0 && <div>Kitchens / kitchenettes: {inputs.addOns.kitchens}</div>}
                {roomScopeSummary.map((item) => <div key={item}>{item}</div>)}
                {inputs.addOns.glassCleaningRequired && <div>Glass cleaning requested — priced separately on inspection</div>}
                {inputs.addOns.highTouchDisinfection && <div>High-touch disinfection requested</div>}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between font-bold text-base">
            <span>Indicative total per visit</span>
            <span style={{ color: '#1a2744' }}>
              {formatPriceRange(result.totalLow, result.totalHigh)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
        <p className="font-semibold mb-1">What this quote includes</p>
        <p>
          This is an indicative estimate based on your premises size, cleaning frequency, timing preference,
          and the requirements selected. Consumables are charged separately only where required and based on
          actual usage.
        </p>
        {inputs.addOns.glassCleaningRequired ? (
          <p className="mt-2">
            Glass cleaning is not included in this remote estimate. We can estimate the cost of internal / external glass cleaning during your inspection.
          </p>
        ) : null}
      </div>

      <p className="text-xs text-gray-500 text-center mb-8">
        Final pricing is confirmed after your free site inspection. Valid for 30 days. All prices exclude GST.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/booking?quoteRef=${quoteRef}`}
          className="inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-white text-lg transition-all hover:opacity-90"
          style={{ backgroundColor: '#22c55e' }}
        >
          Book Site Inspection
        </Link>
        <Link
          href={`/scope/${quoteRef}`}
          className="inline-flex items-center justify-center rounded-xl border-2 border-teal-700 px-8 py-4 text-lg font-bold text-teal-800 transition-all hover:bg-teal-50"
        >
          View Scope of Works
        </Link>
        <Link
          href="/quote"
          className="inline-flex items-center justify-center px-8 py-4 rounded-xl font-semibold text-gray-700 text-lg border-2 border-gray-200 hover:border-gray-300 transition-all"
        >
          Recalculate
        </Link>
      </div>

      <p className="text-center text-sm text-gray-500 mt-4">
        Questions? <Link href="/contact" className="text-green-600 hover:underline">Contact our team</Link> or{' '}
        <button
          className="text-green-600 hover:underline"
          onClick={() => {
            document.dispatchEvent(new CustomEvent('open-chat'))
          }}
        >
          chat with Secure Bot
        </button>
      </p>
    </div>
  )
}
