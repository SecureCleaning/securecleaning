'use client'

import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { QuoteInputs, City, PremisesType } from '@/lib/types'

interface StepOneProps {
  data: Partial<QuoteInputs>
  onChange: (updates: Partial<QuoteInputs>) => void
  errors: Partial<Record<keyof QuoteInputs, string>>
}

const cityOptions = [
  { value: 'melbourne', label: 'Melbourne' },
  { value: 'sydney', label: 'Sydney' },
]

const premisesOptions = [
  { value: 'office', label: 'Office / Workplace' },
  { value: 'medical', label: 'Medical / Healthcare' },
  { value: 'childcare', label: 'Childcare Centre' },
  { value: 'industrial', label: 'Industrial / Manufacturing' },
  { value: 'retail', label: 'Retail / Showroom' },
  { value: 'gym', label: 'Gym / Fitness Studio' },
  { value: 'warehouse', label: 'Warehouse / Distribution' },
  { value: 'other', label: 'Other' },
]

export default function StepOne({ data, onChange, errors }: StepOneProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: '#1a2744' }}>
          Tell us about your business
        </h2>
        <p className="text-gray-600 text-sm">
          We&apos;ll use this to get in touch with your quote.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Business Name"
          placeholder="e.g. Acme Pty Ltd"
          value={data.businessName ?? ''}
          onChange={(e) => onChange({ businessName: e.target.value })}
          error={errors.businessName}
          required
        />
        <Input
          label="Contact Name"
          placeholder="e.g. Jane Smith"
          value={data.contactName ?? ''}
          onChange={(e) => onChange({ contactName: e.target.value })}
          error={errors.contactName}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Email Address"
          type="email"
          placeholder="jane@acme.com.au"
          value={data.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
          error={errors.email}
          required
        />
        <Input
          label="Phone Number"
          type="tel"
          placeholder="04xx xxx xxx"
          value={data.phone ?? ''}
          onChange={(e) => onChange({ phone: e.target.value })}
          error={errors.phone}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="City"
          options={cityOptions}
          placeholder="Select a city…"
          value={data.city ?? ''}
          onChange={(e) => onChange({ city: e.target.value as City })}
          error={errors.city}
          required
        />
        <Select
          label="Premises Type"
          options={premisesOptions}
          placeholder="Select type…"
          value={data.premisesType ?? ''}
          onChange={(e) => onChange({ premisesType: e.target.value as PremisesType })}
          error={errors.premisesType}
          required
        />
      </div>
    </div>
  )
}
