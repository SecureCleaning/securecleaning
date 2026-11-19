'use client'

import { CLEANER_LEAD_SOURCES } from '@/lib/cleanerLeadSource'
import { useId } from 'react'

type Props = {
  source: string
  details: string
  disabled?: boolean
  onChange: (value: { leadSource: string; leadSourceDetails: string }) => void
}

export default function CleanerSourceFields({ source, details, disabled, onChange }: Props) {
  const id = useId()
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 col-span-full">
    <legend className="px-1 text-sm font-semibold text-gray-700">Where did this cleaner come from?</legend>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1 text-sm font-medium text-gray-700">
        <label htmlFor={`${id}-source`} className="block">Cleaner source (optional)</label>
        <select id={`${id}-source`} value={source} onChange={(event) => onChange({ leadSource: event.target.value, leadSourceDetails: details })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3">
          <option value="">Not recorded</option>
          {CLEANER_LEAD_SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="space-y-1 text-sm font-medium text-gray-700">
        <label htmlFor={`${id}-details`} className="block">Source details (optional)</label>
        <textarea id={`${id}-details`} value={details} maxLength={1000} rows={2} onChange={(event) => onChange({ leadSource: source, leadSourceDetails: event.target.value })} placeholder="Referrer, relationship, company or advert link" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3" />
      </div>
    </div>
    <p className="text-xs text-gray-500">Internal information for Secure Cleaning staff and agents.</p>
  </fieldset>
}
