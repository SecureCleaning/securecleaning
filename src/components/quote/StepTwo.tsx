'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { QuoteInputs, FlooringType } from '@/lib/types'

interface StepTwoProps {
  data: Partial<QuoteInputs>
  onChange: (updates: Partial<QuoteInputs>) => void
  errors: Partial<Record<keyof QuoteInputs, string>>
}

const flooringOptions = [
  { value: 'hard_floor', label: 'Hard Floor (tiles, vinyl, polished concrete)' },
  { value: 'carpet', label: 'Carpet throughout' },
  { value: 'mixed', label: 'Mixed (carpet + hard floor)' },
]

const SLIDER_MIN = 50
const SLIDER_MAX = 400
const DEFAULT_FLOOR_AREA = 150

export default function StepTwo({ data, onChange, errors }: StepTwoProps) {
  const [sliderValue, setSliderValue] = useState(data.floorArea ?? DEFAULT_FLOOR_AREA)

  const handleSliderChange = (value: number) => {
    setSliderValue(value)
    onChange({ floorArea: value })
  }

  const handleNumberChange = (raw: string) => {
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 0) {
      const bounded = Math.max(SLIDER_MIN, Math.min(num, SLIDER_MAX))
      setSliderValue(bounded)
      onChange({ floorArea: bounded })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: '#1a2744' }}>
          About your premises
        </h2>
        <p className="text-gray-600 text-sm">
          This helps us calculate an accurate quote. Estimates are fine.
        </p>
      </div>

      {/* Floor area slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Total Floor Area (sqm) <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={25}
              value={sliderValue}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-green-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{SLIDER_MIN} sqm</span>
              <span>{SLIDER_MAX} sqm</span>
            </div>
          </div>
          <div className="w-28 shrink-0">
            <input
              type="number"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              value={data.floorArea ?? ''}
              onChange={(e) => handleNumberChange(e.target.value)}
              className="block w-full px-3 py-2 text-center rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-semibold"
              placeholder="sqm"
            />
          </div>
        </div>
        {errors.floorArea && <p className="text-xs text-red-600 mt-1">{errors.floorArea}</p>}
        <p className="text-xs text-gray-500 mt-2">
          💡 Not sure? Google Maps satellite view can help estimate.
          Average Australian office floor: ~200–600 sqm per floor.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Number of Floors"
          type="number"
          min={1}
          max={50}
          placeholder="1"
          value={data.floors ?? ''}
          onChange={(e) => onChange({ floors: parseInt(e.target.value) || 1 })}
          error={errors.floors}
          hint="Including ground floor"
          required
        />
        <Input
          label="Bathrooms / Toilets"
          type="number"
          min={0}
          max={50}
          placeholder="0"
          value={data.addOns?.bathrooms ?? ''}
          onChange={(e) =>
            onChange({ addOns: { ...(data.addOns ?? { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false }), bathrooms: parseInt(e.target.value) || 0 } })
          }
          hint="Count only — pricing confirmed after site review"
        />
        <Input
          label="Kitchens / Kitchenettes"
          type="number"
          min={0}
          max={20}
          placeholder="0"
          value={data.addOns?.kitchens ?? ''}
          onChange={(e) =>
            onChange({ addOns: { ...(data.addOns ?? { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false }), kitchens: parseInt(e.target.value) || 0 } })
          }
          hint="Count only — pricing confirmed after site review"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Meeting / Conference Rooms"
          type="number"
          min={0}
          max={50}
          placeholder="0"
          value={data.meetingRooms ?? ''}
          onChange={(e) => onChange({ meetingRooms: parseInt(e.target.value) || 0 })}
          hint="For scheduling purposes"
        />
        <Input
          label="External Windows"
          type="number"
          min={0}
          max={200}
          placeholder="0"
          value={data.addOns?.windows ?? ''}
          onChange={(e) =>
            onChange({ addOns: { ...(data.addOns ?? { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false }), windows: parseInt(e.target.value) || 0 } })
          }
          hint="Count only — pricing confirmed after site review"
        />
      </div>

      <Select
        label="Primary Flooring Type"
        options={flooringOptions}
        placeholder="Select flooring type…"
        value={data.flooringType ?? ''}
        onChange={(e) => onChange({ flooringType: e.target.value as FlooringType })}
        error={errors.flooringType}
      />
    </div>
  )
}
