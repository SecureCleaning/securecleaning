'use client'

import { clsx } from 'clsx'
import Checkbox from '@/components/ui/Checkbox'
import type { QuoteInputs, CleaningFrequency, TimePreference, QuoteAddOns } from '@/lib/types'

interface StepThreeProps {
  data: Partial<QuoteInputs>
  onChange: (updates: Partial<QuoteInputs>) => void
  errors: Partial<Record<keyof QuoteInputs, string>>
}

const frequencyOptions: { value: CleaningFrequency; label: string; subtext: string }[] = [
  { value: 'daily', label: 'Daily', subtext: '5 days/week' },
  { value: '3x_week', label: '3x per Week', subtext: 'Mon/Wed/Fri' },
  { value: '2x_week', label: '2x per Week', subtext: 'Flexible days' },
  { value: 'weekly', label: 'Weekly', subtext: 'Once a week' },
  { value: 'fortnightly', label: 'Fortnightly', subtext: 'Every 2 weeks' },
  { value: 'once_off', label: 'Once-Off', subtext: 'Single clean' },
]

const timeOptions: { value: TimePreference; label: string; subtext: string }[] = [
  { value: 'business_hours', label: 'Business Hours', subtext: '6am – 6pm weekdays' },
  { value: 'after_hours', label: 'After Hours', subtext: 'After 6pm weekdays' },
  { value: 'weekend', label: 'Weekend', subtext: 'Sat or Sun' },
]

const defaultAddOns: QuoteAddOns = {
  bathrooms: 0,
  kitchens: 0,
  windows: 0,
  consumables: false,
  highTouchDisinfection: false,
  carpetSteam: false,
}

export default function StepThree({ data, onChange, errors }: StepThreeProps) {
  const addOns = data.addOns ?? defaultAddOns

  const toggleAddOn = (key: keyof QuoteAddOns) => {
    onChange({ addOns: { ...addOns, [key]: !addOns[key as keyof typeof addOns] } })
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: '#1a2744' }}>
          Cleaning schedule &amp; add-ons
        </h2>
        <p className="text-gray-600 text-sm">
          Choose how often you need cleaning and any extras.
        </p>
      </div>

      {/* Frequency */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">
          Cleaning Frequency <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {frequencyOptions.map((opt) => {
            const selected = data.frequency === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ frequency: opt.value })}
                className={clsx(
                  'flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all duration-200',
                  selected
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <span className={clsx('font-semibold text-sm', selected ? 'text-green-700' : 'text-gray-900')}>
                  {opt.label}
                </span>
                <span className="text-xs text-gray-500 mt-0.5">{opt.subtext}</span>
              </button>
            )
          })}
        </div>
        {errors.frequency && <p className="text-xs text-red-600 mt-2">{errors.frequency}</p>}
      </div>

      {/* Time preference */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">
          Time Preference <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {timeOptions.map((opt) => {
            const selected = data.timePreference === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ timePreference: opt.value })}
                className={clsx(
                  'flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all duration-200',
                  selected
                    ? 'border-navy-700 bg-navy-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
                style={selected ? { borderColor: '#1a2744', backgroundColor: 'rgba(26,39,68,0.05)' } : undefined}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={clsx('font-semibold text-sm', selected ? 'text-navy-800' : 'text-gray-900')}
                    style={selected ? { color: '#1a2744' } : undefined}>
                    {opt.label}
                  </span>
                </div>
                <span className="text-xs text-gray-500 mt-0.5">{opt.subtext}</span>
              </button>
            )
          })}
        </div>
        {errors.timePreference && <p className="text-xs text-red-600 mt-2">{errors.timePreference}</p>}
      </div>

      {/* Add-ons */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-4">Optional Add-ons</p>
        <div className="space-y-4 p-5 bg-gray-50 rounded-xl border border-gray-200">
          <Checkbox
            label="High-Touch Point Disinfection"
            description="Enhanced disinfection of door handles, light switches, lift buttons, and shared touch surfaces. (Priced by floor area)"
            checked={addOns.highTouchDisinfection}
            onChange={() => toggleAddOn('highTouchDisinfection')}
          />
          <Checkbox
            label="Carpet Steam Cleaning"
            description="Deep steam cleaning of all carpeted areas. Quoted separately — your operator will advise frequency (typically 2–4x per year)."
            checked={addOns.carpetSteam}
            onChange={() => toggleAddOn('carpetSteam')}
          />
        </div>
      </div>

      {/* Spring clean */}
      <div className="p-4 rounded-xl border-2 border-dashed border-green-300 bg-green-50">
        <Checkbox
          label="This is a once-off spring clean / deep clean"
          description="Spring cleans are priced at 2–3x the regular clean rate, reflecting the additional time and effort required to restore your premises to a high standard."
          checked={data.isSpringClean ?? false}
          onChange={() => onChange({ isSpringClean: !data.isSpringClean })}
        />
      </div>
    </div>
  )
}
