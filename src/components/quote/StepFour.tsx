'use client'

import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { QuoteInputs } from '@/lib/types'

interface StepFourProps {
  data: Partial<QuoteInputs>
  onChange: (updates: Partial<QuoteInputs>) => void
  errors: Partial<Record<keyof QuoteInputs, string>>
}

const heardOptions = [
  { value: 'google', label: 'Google Search' },
  { value: 'referral', label: 'Referral / Word of mouth' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'flyer', label: 'Flyer / Letterbox' },
  { value: 'existing_customer', label: 'Existing Customer' },
  { value: 'other', label: 'Other' },
]

export default function StepFour({ data, onChange, errors }: StepFourProps) {
  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split('T')[0]
  // Default to 2 weeks from now
  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() + 14)
  const defaultStartStr = defaultStart.toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: '#1a2744' }}>
          Final details
        </h2>
        <p className="text-gray-600 text-sm">
          Almost done! A few last questions to personalise your quote.
        </p>
      </div>

      <Input
        label="Preferred Inspection / Start Window"
        type="date"
        min={today}
        value={data.preferredStartDate ?? defaultStartStr}
        onChange={(e) => onChange({ preferredStartDate: e.target.value })}
        error={errors.preferredStartDate}
        hint="When would you like us to inspect the site or aim for commencement? We'll confirm the final schedule after inspection."
      />

      <Select
        label="How did you hear about us?"
        options={heardOptions}
        placeholder="Select an option…"
        value={data.heardAboutUs ?? ''}
        onChange={(e) => onChange({ heardAboutUs: e.target.value })}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Additional Notes
        </label>
        <textarea
          rows={5}
          placeholder="Anything else we should know? E.g. access requirements, specific concerns, existing cleaning contract end date, key handover preferences…"
          value={data.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder-gray-400 resize-none"
        />
      </div>

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={data.website ?? ''}
        onChange={(e) => onChange({ website: e.target.value })}
        className="hidden"
      />

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={data.acceptableUseAccepted ?? false}
          onChange={(e) => onChange({ acceptableUseAccepted: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        <span>
          I confirm this is a genuine enquiry for my business, or a business I am authorised to represent,
          and I will not use this quote tool for scraping, resale, automated testing, spam, or competitor data collection.
        </span>
      </label>

      {errors.acceptableUseAccepted ? (
        <p className="text-sm text-red-600">{errors.acceptableUseAccepted}</p>
      ) : null}

      {/* Summary reminder */}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <p className="font-semibold mb-1">📋 What happens after you submit?</p>
        <ul className="space-y-1 text-blue-700">
          <li>✓ You&apos;ll receive your remote quote estimate by email</li>
          <li>✓ Our team will review your details within 1 business day</li>
          <li>✓ We&apos;ll match you with a verified Owner-Operator in your area</li>
          <li>✓ A site inspection is arranged — usually within 48 hours</li>
          <li>✓ We confirm scope, requirements, and final pricing after inspection</li>
          <li>✓ No obligation to proceed</li>
        </ul>
      </div>
    </div>
  )
}
