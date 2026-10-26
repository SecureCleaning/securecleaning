'use client'

import { SPECIALIST_MACHINERY, type CleanerMachinery } from '@/lib/cleanerMachinery'

export default function CleanerMachineryFields({ value, onChange, disabled = false }: {
  value: CleanerMachinery | null; onChange: (value: CleanerMachinery | null) => void; disabled?: boolean
}) {
  const current = value ?? { items: [], other: '', notes: '' }
  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm'
  return <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
    <legend className="px-1 text-sm font-semibold text-gray-700">Specialist machinery</legend>
    <p className="text-xs text-gray-600">Select the machinery you have available for cleaning work.</p>
    <p className="text-xs font-semibold text-teal-800">{value === null ? 'Not yet provided' : current.items.length ? 'Equipment details provided' : 'No specialist machinery selected'}</p>
    <div className="grid gap-2 sm:grid-cols-2">{SPECIALIST_MACHINERY.map(([code, label]) => <label key={code} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={current.items.includes(code)} onChange={event => onChange({ ...current, items: event.target.checked ? [...current.items, code] : current.items.filter(item => item !== code), other: code === 'other' && !event.target.checked ? '' : current.other })} />{label}</label>)}</div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value !== null && current.items.length === 0} onChange={event => onChange(event.target.checked ? { ...current, items: [], other: '' } : null)} />No specialist machinery available</label>
    {current.items.includes('other') ? <label className="block text-sm">Other equipment<input required maxLength={200} className={inputClass} value={current.other} onChange={event => onChange({ ...current, other: event.target.value })} /></label> : null}
    <label className="block text-sm">Equipment notes (optional)<textarea rows={2} maxLength={1000} className={inputClass} placeholder="Make/model, size, or owned/hired" value={current.notes} onChange={event => onChange({ ...current, notes: event.target.value })} /></label>
  </fieldset>
}
