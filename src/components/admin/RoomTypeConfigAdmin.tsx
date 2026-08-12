'use client'

import { useState } from 'react'
import type { QuoteRoomTypeConfig, RoomMetricFieldConfig, RoomMetricInputType, RoomTypeConfig } from '@/lib/roomTypeConfig'
import { getAdminHeaders } from '@/lib/useAdminHeaders'

const INPUT_TYPES: RoomMetricInputType[] = ['integer', 'number', 'boolean']

function createRoomType(): RoomTypeConfig {
  return {
    id: `room_type_${Date.now()}`,
    label: 'New room type',
    defaultLabel: 'New room',
    tracksSize: true,
    defaultSize: 20,
    defaultMopping: false,
    scopeTasks: ['Vacuum or mop accessible floor areas', 'Wipe reachable surfaces', 'Empty bins where provided'],
    pricingAdjustmentPercent: 0,
    fixedPricePerVisit: 0,
    fields: [],
  }
}

function createField(): RoomMetricFieldConfig {
  return {
    id: `field_${Date.now()}`,
    label: 'New field',
    inputType: 'integer',
    defaultValue: 0,
    includedUnits: 0,
    pricePerUnit: 0,
    helpText: '',
  }
}

function formatPricingExplanation(field: RoomMetricFieldConfig) {
  const rate = Number(field.pricePerUnit ?? 0)
  if (!Number.isFinite(rate) || rate === 0) {
    return `${field.label || 'This field'} does not currently affect the quote total.`
  }

  if (field.inputType === 'boolean') {
    return `If selected, this adds $${rate.toFixed(2)} per visit.`
  }

  const included = Number(field.includedUnits ?? 0)
  return included > 0
    ? `First ${included} included; each additional ${field.label || 'unit'} adds $${rate.toFixed(2)} per visit.`
    : `Each ${field.label || 'unit'} adds $${rate.toFixed(2)} per unit, per visit.`
}

export default function RoomTypeConfigAdmin({ initialConfig }: { initialConfig: QuoteRoomTypeConfig }) {
  const [config, setConfig] = useState<QuoteRoomTypeConfig>(initialConfig)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [expandedRoomIndexes, setExpandedRoomIndexes] = useState<Set<number>>(() => new Set([0]))

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch('/api/admin/room-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ config }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Save failed.')
      }

      setConfig(result.config as QuoteRoomTypeConfig)
      setStatus({ type: 'success', message: 'Room types saved successfully.' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save room types.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateRoomType(roomId: string, patch: Partial<RoomTypeConfig>) {
    setConfig((current) => ({
      roomTypes: current.roomTypes.map((roomType) => (roomType.id === roomId ? { ...roomType, ...patch } : roomType)),
    }))
  }

  function toggleRoomType(roomTypeIndex: number) {
    setExpandedRoomIndexes((current) => {
      const next = new Set(current)
      if (next.has(roomTypeIndex)) {
        next.delete(roomTypeIndex)
      } else {
        next.add(roomTypeIndex)
      }
      return next
    })
  }

  function removeRoomType(roomId: string, roomTypeIndex: number) {
    setConfig((current) => ({
      roomTypes: current.roomTypes.filter((roomType) => roomType.id !== roomId),
    }))
    setExpandedRoomIndexes((current) => {
      const next = new Set<number>()
      current.forEach((index) => {
        if (index < roomTypeIndex) next.add(index)
        if (index > roomTypeIndex) next.add(index - 1)
      })
      return next
    })
  }

  function addRoomType() {
    setConfig((current) => ({
      roomTypes: [...current.roomTypes, createRoomType()],
    }))
    setExpandedRoomIndexes((current) => new Set([...current, config.roomTypes.length]))
  }

  function addField(roomId: string) {
    setConfig((current) => ({
      roomTypes: current.roomTypes.map((roomType) => (
        roomType.id === roomId ? { ...roomType, fields: [...roomType.fields, createField()] } : roomType
      )),
    }))
  }

  function updateField(roomId: string, fieldId: string, patch: Partial<RoomMetricFieldConfig>) {
    setConfig((current) => ({
      roomTypes: current.roomTypes.map((roomType) => (
        roomType.id === roomId
          ? {
              ...roomType,
              fields: roomType.fields.map((field) => (
                field.id === fieldId
                  ? {
                      ...field,
                      ...patch,
                      defaultValue:
                        patch.inputType === 'boolean'
                          ? Boolean(field.defaultValue)
                          : patch.defaultValue ?? field.defaultValue,
                    }
                  : field
              )),
            }
          : roomType
      )),
    }))
  }

  function removeField(roomId: string, fieldId: string) {
    setConfig((current) => ({
      roomTypes: current.roomTypes.map((roomType) => (
        roomType.id === roomId
          ? { ...roomType, fields: roomType.fields.filter((field) => field.id !== fieldId) }
          : roomType
      )),
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Room Type Master Control
          </h1>
          <p className="text-gray-600 max-w-3xl">
            Control the room types available in the Quote Workbench, the client-facing scope inclusions for each room, mopping defaults, room pricing rules, and any extra pricing fields.
          </p>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Use the field price as an internal pricing rule. Example: a toilet field set to <strong>$3.00</strong> means each toilet adds <strong>$3.00 per visit</strong> to the working quote.
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Quote room type configuration</h2>
              <p className="text-sm text-gray-600">Scope and mopping defaults apply to new rooms and when an agent changes a room type.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={addRoomType}
                className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-gray-700 border border-gray-200 bg-white"
              >
                Add Room Type
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: '#22c55e' }}
              >
                {isSubmitting ? 'Saving…' : 'Save Room Types'}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {config.roomTypes.map((roomType, roomTypeIndex) => (
              <section key={`room-type-row-${roomTypeIndex}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleRoomType(roomTypeIndex)}
                  aria-expanded={expandedRoomIndexes.has(roomTypeIndex)}
                  aria-controls={`room-type-panel-${roomTypeIndex}`}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-gray-50"
                >
                  <span>
                    <span className="block text-xl font-bold" style={{ color: '#1a2744' }}>{roomType.label}</span>
                    <span className="block text-sm text-gray-600">{roomType.id}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mr-1 h-3 w-3 shrink-0 rotate-45 border-b-2 border-r-2 border-gray-500 transition-transform ${expandedRoomIndexes.has(roomTypeIndex) ? 'translate-y-1 rotate-[225deg]' : ''}`}
                  />
                </button>

                {expandedRoomIndexes.has(roomTypeIndex) ? <div id={`room-type-panel-${roomTypeIndex}`} className="border-t border-gray-100 px-6 pb-6 pt-5">
                  <div className="flex items-start justify-end gap-4 mb-5">
                    <button
                      type="button"
                      onClick={() => removeRoomType(roomType.id, roomTypeIndex)}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Remove Room Type
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                  <label className="text-sm">
                    <span className="block mb-1 font-medium text-gray-700">ID</span>
                    <input
                      value={roomType.id}
                      onChange={(event) => updateRoomType(roomType.id, { id: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 font-medium text-gray-700">Label</span>
                    <input
                      value={roomType.label}
                      onChange={(event) => updateRoomType(roomType.id, { label: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 font-medium text-gray-700">Default row label</span>
                    <input
                      value={roomType.defaultLabel}
                      onChange={(event) => updateRoomType(roomType.id, { defaultLabel: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 font-medium text-gray-700">Default sqm</span>
                    <input
                      type="number"
                      step="0.1"
                      value={roomType.defaultSize}
                      onChange={(event) => updateRoomType(roomType.id, { defaultSize: Number(event.target.value || 0) })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3"
                    />
                  </label>
                  </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700 mb-5">
                  <input
                    type="checkbox"
                    checked={roomType.tracksSize}
                    onChange={(event) => updateRoomType(roomType.id, { tracksSize: event.target.checked })}
                  />
                  Track sqm for this room type
                </label>

                <div className="mb-5 grid gap-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start">
                  <label className="flex items-start gap-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={roomType.defaultMopping}
                      onChange={(event) => updateRoomType(roomType.id, { defaultMopping: event.target.checked })}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span>
                      <span className="block font-medium text-gray-800">Mopping included by default</span>
                      <span className="mt-1 block text-xs text-gray-500">Agents can still change this for an individual quote room.</span>
                    </span>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Client-facing scope inclusions</span>
                    <textarea
                      value={roomType.scopeTasks.join('\n')}
                      onChange={(event) => updateRoomType(roomType.id, {
                        // Preserve the raw textarea value while typing so spaces do not reset the caret.
                        scopeTasks: event.target.value.split('\n'),
                      })}
                      rows={5}
                      placeholder="One inclusion per line, for example: Wipe reachable surfaces"
                      className="w-full rounded-lg border border-gray-300 px-4 py-3"
                    />
                    <span className="mt-1 block text-xs text-gray-500">These lines appear under this room on the client scope of works.</span>
                  </label>
                </div>

                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="mb-3">
                    <h4 className="font-semibold" style={{ color: '#1a2744' }}>Default pricing rule</h4>
                    <p className="text-sm text-gray-600">Percentage applies to this room type&apos;s floor-area share of labour. Fixed cost is per room unit, per visit.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Price adjustment (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        value={roomType.pricingAdjustmentPercent}
                        onChange={(event) => updateRoomType(roomType.id, { pricingAdjustmentPercent: Number(event.target.value || 0) })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3"
                      />
                      <span className="mt-1 block text-xs text-gray-500">Example: 20 adds 20% to this room type&apos;s labour share.</span>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Fixed cost per room / visit</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={roomType.fixedPricePerVisit}
                        onChange={(event) => updateRoomType(roomType.id, { fixedPricePerVisit: Math.max(0, Number(event.target.value || 0)) })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3"
                      />
                      <span className="mt-1 block text-xs text-gray-500">Example: 8 adds $8 for each room unit on every visit.</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h4 className="font-semibold" style={{ color: '#1a2744' }}>Extra fields</h4>
                      <p className="text-sm text-gray-600">These appear when this room type is chosen in the Quote Workbench.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addField(roomType.id)}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                    >
                      Add Field
                    </button>
                  </div>

                  <div className="space-y-4">
                    {roomType.fields.map((field, fieldIndex) => (
                      <div key={`room-field-row-${roomTypeIndex}-${fieldIndex}`} className="rounded-xl border border-gray-200 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Field ID</span>
                            <input
                              value={field.id}
                              onChange={(event) => updateField(roomType.id, field.id, { id: event.target.value })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              placeholder="e.g. toilets"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Display label</span>
                            <input
                              value={field.label}
                              onChange={(event) => updateField(roomType.id, field.id, { label: event.target.value })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              placeholder="e.g. Toilets"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Input type</span>
                            <select
                              value={field.inputType}
                              onChange={(event) => updateField(roomType.id, field.id, { inputType: event.target.value as RoomMetricInputType })}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              {INPUT_TYPES.map((inputType) => <option key={inputType} value={inputType}>{inputType}</option>)}
                            </select>
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Default value</span>
                            <input
                              type={field.inputType === 'boolean' ? 'text' : 'number'}
                              value={String(field.defaultValue)}
                              onChange={(event) => updateField(roomType.id, field.id, {
                                defaultValue: field.inputType === 'boolean'
                                  ? event.target.value === 'true'
                                  : Number(event.target.value || 0),
                              })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              placeholder="e.g. 1"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Price / unit / visit</span>
                            <input
                              type="number"
                              step="0.1"
                              value={field.pricePerUnit ?? 0}
                              onChange={(event) => updateField(roomType.id, field.id, { pricePerUnit: Number(event.target.value || 0) })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              placeholder="$0.00"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Included units</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={field.includedUnits ?? 0}
                              onChange={(event) => updateField(roomType.id, field.id, { includedUnits: Math.max(0, Number(event.target.value || 0)) })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              placeholder="0"
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeField(roomType.id, field.id)}
                              className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                            >
                              Remove field
                            </button>
                          </div>
                        </div>
                        <label className="mt-3 block text-sm">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Internal help text</span>
                          <textarea
                            value={field.helpText ?? ''}
                            onChange={(event) => updateField(roomType.id, field.id, { helpText: event.target.value })}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Explain this field to internal users"
                          />
                        </label>
                        <p className="mt-2 text-xs text-gray-500">
                          {field.helpText?.trim() ? field.helpText : formatPricingExplanation(field)}
                        </p>
                      </div>
                    ))}
                    {roomType.fields.length === 0 ? (
                      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
                        No extra fields for this room type yet.
                      </div>
                    ) : null}
                  </div>
                </div>
                </div> : null}
              </section>
            ))}
          </div>

          {status.message ? (
            <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {status.message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  )
}
