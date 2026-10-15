'use client'

import { useState } from 'react'
import { ROOM_TASK_CADENCE_OPTIONS, type QuoteRoomTypeConfig, type RoomMetricFieldConfig } from '@/lib/roomTypeConfig'

type Props = {
  config: QuoteRoomTypeConfig
  addField: (roomId: string) => void
  updateField: (roomId: string, fieldId: string, patch: Partial<RoomMetricFieldConfig>) => void
}

export default function SavedQuoteFields({ config, addField, updateField }: Props) {
  const [search, setSearch] = useState('')
  const [roomId, setRoomId] = useState(config.roomTypes[0]?.id ?? '')
  const rows = config.roomTypes.flatMap(room => room.fields.map(field => ({ room, field })))
  const duplicates = new Set(rows.filter((row, index) => rows.findIndex(other => other.field.id === row.field.id) !== index).map(row => row.field.id))
  const visible = rows.filter(({ room, field }) => `${room.label} ${field.label} ${field.id}`.toLowerCase().includes(search.toLowerCase()))
  return <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold text-gray-900">Saved quote fields</h2>
    <p className="mt-1 text-sm text-gray-600">These fields populate Add saved field in the quote editor. Each added copy can be edited independently. Save room pricing to save library changes.</p>
    <div className="my-4 flex flex-wrap gap-3">
      <input aria-label="Search saved quote fields" placeholder="Search field or room" value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border p-2" />
      <select aria-label="Room for new saved field" value={roomId} onChange={e => setRoomId(e.target.value)} className="rounded-lg border p-2">{config.roomTypes.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>
      <button type="button" disabled={!config.roomTypes.some(room => room.id === roomId)} onClick={() => { addField(roomId); setSearch('') }} className="rounded-lg border border-teal-700 px-3 py-2 font-semibold text-teal-800">Add saved field</button>
    </div>
    {duplicates.size > 0 && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Some field IDs occur in multiple rooms. The quote dropdown uses the first definition for each ID. Check the marked entries before changing them; editing a row only changes that room definition.</p>}
    <div className="max-h-[36rem] space-y-3 overflow-y-auto">
      {visible.map(({ room, field }, index) => <details key={`${room.id}-${field.id}-${index}`} className="rounded-xl border p-3">
        <summary className="cursor-pointer font-semibold">{field.label} <span className="font-normal text-gray-500">- {room.label}{duplicates.has(field.id) ? ' (shared ID)' : ''}</span></summary>
        <p className="mt-2 text-xs text-gray-500">Field ID: {field.id}. This field is also a default extra for {room.label}.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Name (maximum 200 characters)<input maxLength={200} value={field.label} onChange={e => updateField(room.id, field.id, { label: e.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">Input type<select value={field.inputType} onChange={e => updateField(room.id, field.id, { inputType: e.target.value as RoomMetricFieldConfig['inputType'] })} className="mt-1 block w-full rounded border p-2"><option value="integer">Whole number</option><option value="number">Decimal number</option><option value="boolean">Yes / no</option></select></label>
          <label className="text-sm">Default value{field.inputType === 'boolean' ? <select value={String(Boolean(field.defaultValue))} onChange={e => updateField(room.id, field.id, { defaultValue: e.target.value === 'true' })} className="mt-1 block w-full rounded border p-2"><option value="false">No</option><option value="true">Yes</option></select> : <input type="number" min="0" step={field.inputType === 'integer' ? '1' : 'any'} value={Number(field.defaultValue)} onChange={e => updateField(room.id, field.id, { defaultValue: Math.max(0, Number(e.target.value)) })} className="mt-1 block w-full rounded border p-2" />}</label>
          <label className="text-sm">Price per unit ($)<input type="number" min="0" step="0.01" value={field.pricePerUnit ?? 0} onChange={e => updateField(room.id, field.id, { pricePerUnit: Math.max(0, Number(e.target.value)) })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">Units included in base<input type="number" min="0" step="any" value={field.includedUnits ?? 0} onChange={e => updateField(room.id, field.id, { includedUnits: Math.max(0, Number(e.target.value)) })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">Frequency<select value={field.cadence ?? 'every_clean'} onChange={e => updateField(room.id, field.id, { cadence: e.target.value as RoomMetricFieldConfig['cadence'] })} className="mt-1 block w-full rounded border p-2">{ROOM_TASK_CADENCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-sm sm:col-span-2">Description<input maxLength={120} value={field.helpText ?? ''} onChange={e => updateField(room.id, field.id, { helpText: e.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
        </div>
      </details>)}
      {!visible.length && <p className="text-sm text-gray-500">No saved fields match your search.</p>}
    </div>
  </section>
}
