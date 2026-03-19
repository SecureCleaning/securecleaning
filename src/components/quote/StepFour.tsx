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
        label="Preferred Start Date"
        type="date"
        min={today}
        value={data.preferredStartDate ?? defaultStartStr}
        onChange={(e) => onChange({ preferredStartDate: e.target.value })}
        error={errors.preferredStartDate}
        hint="When would you like your first clean? We'll confirm this after your site inspection."
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

      {/* Summary reminder */}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <p className="font-semibold mb-1">📋 What happens after you submit?</p>
        <ul className="space-y-1 text-blue-700">
          <li>✓ You&apos;ll receive your instant price estimate by email</li>
          <li>✓ Our team will review your details within 1 business day</li>
          <li>✓ We&apos;ll match you with a verified Owner-Operator in your area</li>
          <li>✓ A site inspection is arranged — usually within 48 hours</li>
          <li>✓ No obligation to proceed</li>
        </ul>
      </div>
    </div>
  )
}
