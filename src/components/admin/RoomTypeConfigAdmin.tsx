'use client'

import { useState } from 'react'
import type { QuotePricingConfig } from '@/lib/pricing'
import {
  applyGlobalRoomTaskRates,
  DEFAULT_MONTHLY_COBWEB_TASK,
  DEFAULT_VACUUM_TASK,
  DEFAULT_WEEKLY_DUSTING_TASK,
  getRoomScopeTaskCadence,
  getRoomScopeTaskDefault,
  getRoomScopeTaskDefinitions,
  getRoomScopeTaskId,
  getRoomScopeTaskMinutesPerSqm,
  getRoomScopeTaskPrice,
  getMatchedGlobalRoomTaskRates,
  getGlobalRoomTaskRates,
  getRoomScopeTaskGlobalRateCode,
  getRoomScopeTaskPricingMode,
  ROOM_TASK_CADENCE_OPTIONS,
  type QuoteRoomTypeConfig,
  type GlobalRoomTaskRate,
  type RoomMetricFieldConfig,
  type RoomMetricInputType,
  type RoomTaskCadence,
  type RoomTypeConfig,
} from '@/lib/roomTypeConfig'
import { getAdminHeaders } from '@/lib/useAdminHeaders'
import AdminPageHeader from './AdminPageHeader'

const INPUT_TYPES: RoomMetricInputType[] = ['integer', 'number', 'boolean']

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

function getDefaultRoomPricingSummary(roomType: RoomTypeConfig, pricingConfig: QuotePricingConfig) {
  const taskDefinitions = getRoomScopeTaskDefinitions(roomType)
  const totals: Record<RoomTaskCadence, number> = {
    every_clean: 0,
    weekly: 0,
    fortnightly: 0,
    monthly: 0,
    quarterly: 0,
    annually: 0,
  }

  for (const task of taskDefinitions) {
    const rate = task.pricingMode === 'area'
      ? task.minutesPerSqm * pricingConfig.settings.hourlyRate / 60
      : task.price
    if (!task.defaultSelected || rate <= 0) continue
    const amount = task.pricingMode === 'area'
      ? rate * Math.max(0, roomType.defaultSize)
      : rate
    totals[task.cadence] += amount
  }

  const labels: Record<RoomTaskCadence, string> = {
    every_clean: '/ clean',
    weekly: ' weekly',
    fortnightly: ' fortnightly',
    monthly: ' monthly',
    quarterly: ' quarterly',
    annually: ' annually',
  }
  const order: RoomTaskCadence[] = ['every_clean', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually']
  const parts = order
    .filter((cadence) => totals[cadence] > 0)
    .map((cadence) => `${formatCurrency(totals[cadence])}${labels[cadence]}`)

  return parts.length ? parts.join(' + ') : '$0 configured'
}

function createRoomType(): RoomTypeConfig {
  return {
    id: `room_type_${Date.now()}`,
    label: 'New room type',
    defaultLabel: 'New room',
    tracksSize: true,
    defaultSize: 20,
    defaultMopping: false,
    moppingCadence: 'every_clean',
    scopeTasks: [DEFAULT_VACUUM_TASK, 'Wipe reachable surfaces', 'Empty bins where provided', DEFAULT_WEEKLY_DUSTING_TASK, DEFAULT_MONTHLY_COBWEB_TASK],
    scopeTaskIds: ['vacuum', 'wipe-surfaces', 'empty-bins', 'dust-perimeter', 'remove-cobwebs'],
    scopeTaskCadences: ['every_clean', 'every_clean', 'every_clean', 'weekly', 'monthly'],
    scopeTaskPrices: [0, 0, 0, 0, 0],
    scopeTaskMinutesPerSqm: [0.068, 0, 0, 0, 0],
    scopeTaskPricingModes: ['area', 'fixed', 'fixed', 'area', 'area'],
    scopeTaskGlobalRateCodes: [null, null, null, null, null],
    scopeTaskDefaults: [true, true, true, true, true],
    pricingAdjustmentPercent: 0,
    fixedPricePerVisit: 0,
    applyFixedPriceWithAreaTasks: false,
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
    cadence: 'every_clean',
    helpText: '',
  }
}

function createGlobalTaskRate(): GlobalRoomTaskRate {
  return {
    code: `global_task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: 'New global task rate',
    pricingMode: 'fixed',
    minutesPerSqm: 0,
    pricePerRoom: 0,
  }
}

export default function RoomTypeConfigAdmin({
  initialConfig,
  pricingConfig,
}: {
  initialConfig: QuoteRoomTypeConfig
  pricingConfig: QuotePricingConfig
}) {
  const [config, setConfig] = useState<QuoteRoomTypeConfig>(() => applyGlobalRoomTaskRates(initialConfig))
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [expandedRoomIndexes, setExpandedRoomIndexes] = useState<Set<number>>(() => new Set())

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
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: current.roomTypes.map((roomType) => (roomType.id === roomId ? { ...roomType, ...patch } : roomType)),
    }))
  }

  function updateGlobalTaskRate(code: string, patch: Partial<GlobalRoomTaskRate>) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      globalTaskRates: getGlobalRoomTaskRates(current).map((rate) => (
        rate.code === code ? { ...rate, ...patch } : rate
      )),
    }))
  }

  function addGlobalTaskRate() {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      globalTaskRates: [...getGlobalRoomTaskRates(current), createGlobalTaskRate()],
    }))
  }

  function removeGlobalTaskRate(code: string) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      globalTaskRates: getGlobalRoomTaskRates(current).filter((rate) => rate.code !== code),
      roomTypes: current.roomTypes.map((roomType) => ({
        ...roomType,
        scopeTaskGlobalRateCodes: roomType.scopeTasks.map((_, taskIndex) => {
          const matched = getMatchedGlobalRoomTaskRates(current, roomType, taskIndex)
          if (!matched.some((rate) => rate.code === code)) return getRoomScopeTaskGlobalRateCode(roomType, taskIndex)
          const remaining = matched.filter((rate) => rate.code !== code)
          return remaining.length === 1 ? remaining[0].code : ''
        }),
      })),
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
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
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
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: [...current.roomTypes, createRoomType()],
    }))
    setExpandedRoomIndexes((current) => new Set([...current, config.roomTypes.length]))
  }

  function addField(roomId: string) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: current.roomTypes.map((roomType) => (
        roomType.id === roomId ? { ...roomType, fields: [...roomType.fields, createField()] } : roomType
      )),
    }))
  }

  function updateField(roomId: string, fieldId: string, patch: Partial<RoomMetricFieldConfig>) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
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
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: current.roomTypes.map((roomType) => (
        roomType.id === roomId
          ? { ...roomType, fields: roomType.fields.filter((field) => field.id !== fieldId) }
          : roomType
      )),
    }))
  }

  function addScopeTask(roomId: string) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: current.roomTypes.map((roomType) => roomType.id === roomId
        ? {
            ...roomType,
            scopeTasks: [...roomType.scopeTasks, 'New scope task'],
            scopeTaskIds: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskId(roomType, index)), `task-${Date.now()}`],
            scopeTaskCadences: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskCadence(roomType, index)), 'every_clean'],
            scopeTaskPrices: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskPrice(roomType, index)), 0],
            scopeTaskMinutesPerSqm: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskMinutesPerSqm(roomType, index)), 0],
            scopeTaskPricingModes: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskPricingMode(roomType, index)), 'fixed'],
            scopeTaskGlobalRateCodes: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskGlobalRateCode(roomType, index)), ''],
            scopeTaskDefaults: [...roomType.scopeTasks.map((_, index) => getRoomScopeTaskDefault(roomType, index)), false],
          }
        : roomType),
    }))
  }

  function updateScopeTask(
    roomId: string,
    taskIndex: number,
    patch: { label?: string; cadence?: RoomTaskCadence; price?: number; minutesPerSqm?: number; pricingMode?: 'area' | 'fixed'; globalRateCode?: string | null; defaultSelected?: boolean }
  ) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: current.roomTypes.map((roomType) => {
        if (roomType.id !== roomId) return roomType
        const scopeTasks = [...roomType.scopeTasks]
        const scopeTaskCadences = roomType.scopeTasks.map((_, index) => getRoomScopeTaskCadence(roomType, index))
        const scopeTaskPrices = roomType.scopeTasks.map((_, index) => getRoomScopeTaskPrice(roomType, index))
        const scopeTaskMinutesPerSqm = roomType.scopeTasks.map((_, index) => getRoomScopeTaskMinutesPerSqm(roomType, index))
        const scopeTaskPricingModes = roomType.scopeTasks.map((_, index) => getRoomScopeTaskPricingMode(roomType, index))
        const scopeTaskGlobalRateCodes = roomType.scopeTasks.map((_, index) => getRoomScopeTaskGlobalRateCode(roomType, index))
        const scopeTaskIds = roomType.scopeTasks.map((_, index) => getRoomScopeTaskId(roomType, index))
        const scopeTaskDefaults = roomType.scopeTasks.map((_, index) => getRoomScopeTaskDefault(roomType, index))
        if (patch.label !== undefined) scopeTasks[taskIndex] = patch.label
        if (patch.cadence !== undefined) scopeTaskCadences[taskIndex] = patch.cadence
        if (patch.price !== undefined) scopeTaskPrices[taskIndex] = Math.max(0, patch.price)
        if (patch.minutesPerSqm !== undefined) scopeTaskMinutesPerSqm[taskIndex] = Math.max(0, patch.minutesPerSqm)
        if (patch.pricingMode !== undefined) scopeTaskPricingModes[taskIndex] = patch.pricingMode
        if (patch.globalRateCode !== undefined) scopeTaskGlobalRateCodes[taskIndex] = patch.globalRateCode
        if (patch.defaultSelected !== undefined) scopeTaskDefaults[taskIndex] = patch.defaultSelected
        return { ...roomType, scopeTasks, scopeTaskIds, scopeTaskCadences, scopeTaskPrices, scopeTaskMinutesPerSqm, scopeTaskPricingModes, scopeTaskGlobalRateCodes, scopeTaskDefaults }
      }),
    }))
  }

  function removeScopeTask(roomId: string, taskIndex: number) {
    setConfig((current) => applyGlobalRoomTaskRates({
      ...current,
      roomTypes: current.roomTypes.map((roomType) => roomType.id === roomId
        ? {
            ...roomType,
            scopeTasks: roomType.scopeTasks.filter((_, index) => index !== taskIndex),
            scopeTaskIds: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskId(roomType, index))
              .filter((_, index) => index !== taskIndex),
            scopeTaskCadences: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskCadence(roomType, index))
              .filter((_, index) => index !== taskIndex),
            scopeTaskPrices: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskPrice(roomType, index))
              .filter((_, index) => index !== taskIndex),
            scopeTaskMinutesPerSqm: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskMinutesPerSqm(roomType, index))
              .filter((_, index) => index !== taskIndex),
            scopeTaskPricingModes: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskPricingMode(roomType, index))
              .filter((_, index) => index !== taskIndex),
            scopeTaskGlobalRateCodes: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskGlobalRateCode(roomType, index))
              .filter((_, index) => index !== taskIndex),
            scopeTaskDefaults: roomType.scopeTasks
              .map((_, index) => getRoomScopeTaskDefault(roomType, index))
              .filter((_, index) => index !== taskIndex),
          }
        : roomType),
    }))
  }

  return (
    <div>
        <AdminPageHeader title="Pricing & Rooms" description="Set shared task rates once, then choose which tasks belong in each room." actions={<><button type="button" onClick={addRoomType} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Add room</button><button type="submit" form="room-type-editor-form" disabled={isSubmitting} className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: '#22c55e' }}>{isSubmitting ? 'Saving…' : 'Save room pricing'}</button></>} />
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>How pricing works:</strong> shared tasks use the global rates below everywhere they appear. Area tasks use minutes per sqm and the {formatCurrency(pricingConfig.settings.hourlyRate)} hourly rate. Fixed tasks use one amount per room. Extra fixture fields and the quote minimum are applied afterwards. Legacy per-room visit charges and room percentage adjustments are reset to zero.
        </div>

        <form id="room-type-editor-form" onSubmit={handleSave} className="space-y-5">
          <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Global shared task rates</h2>
                <p className="text-sm text-gray-600">Add, edit or remove shared rates here, then choose the pricing source on each room task.</p>
              </div>
              <button type="button" onClick={addGlobalTaskRate} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800">Add global rate</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {getGlobalRoomTaskRates(config).map((rate) => (
                <div key={rate.code} className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-sm">
                  <label className="block">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Rate name</span>
                    <input value={rate.label} onChange={(event) => updateGlobalTaskRate(rate.code, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-800" />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Calculation</span>
                      <select value={rate.pricingMode} onChange={(event) => updateGlobalTaskRate(rate.code, { pricingMode: event.target.value === 'area' ? 'area' : 'fixed' })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                        <option value="fixed">Per room</option>
                        <option value="area">Per sqm</option>
                      </select>
                    </label>
                    <label>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{rate.pricingMode === 'area' ? 'Minutes / sqm' : 'Price / room ($)'}</span>
                      <input
                        type="number"
                        min="0"
                        step={rate.pricingMode === 'area' ? '0.001' : '0.01'}
                        inputMode="decimal"
                        value={rate.pricingMode === 'area' ? rate.minutesPerSqm : rate.pricePerRoom}
                        onChange={(event) => updateGlobalTaskRate(rate.code, rate.pricingMode === 'area'
                          ? { minutesPerSqm: Math.max(0, Number(event.target.value || 0)) }
                          : { pricePerRoom: Math.max(0, Number(event.target.value || 0)) })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <span className="block text-xs text-teal-800">{rate.pricingMode === 'area'
                    ? `${formatCurrency(rate.minutesPerSqm * pricingConfig.settings.hourlyRate / 60)} / sqm at ${formatCurrency(pricingConfig.settings.hourlyRate)} per hour`
                    : `${formatCurrency(rate.pricePerRoom)} per room / visit`}</span>
                    <button type="button" onClick={() => removeGlobalTaskRate(rate.code)} className="text-xs font-semibold text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            {getGlobalRoomTaskRates(config).length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">No global rates. Add one to share pricing across room tasks.</p> : null}
          </section>

          <div className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Room pricing and client scope</h2>
              <p className="text-sm text-gray-600">Each room chooses its tasks and cadence. Shared prices come from the global catalogue above.</p>
            </div>
            <span className="text-xs text-gray-500">Defaults apply to new Quote Workbench rooms.</span>
          </div>

          <div className="space-y-6">
            {config.roomTypes.map((roomType, roomTypeIndex) => {
              const defaultPricingSummary = getDefaultRoomPricingSummary(roomType, pricingConfig)
              const hasDefaultAreaRate = getRoomScopeTaskDefinitions(roomType).some((task) => (
                task.defaultSelected && task.pricingMode === 'area' && task.minutesPerSqm > 0
              ))
              return (
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
                  <span className="flex shrink-0 items-center gap-5">
                    <span className="text-right">
                      <span className="block text-sm font-bold text-indigo-900">
                        Default charges: {defaultPricingSummary}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {hasDefaultAreaRate
                          ? 'Task-based area pricing'
                          : 'Fixed task and field pricing'}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mr-1 h-3 w-3 shrink-0 rotate-45 border-b-2 border-r-2 border-gray-500 transition-transform ${expandedRoomIndexes.has(roomTypeIndex) ? 'translate-y-1 rotate-[225deg]' : ''}`}
                    />
                  </span>
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

                <div className="mb-5 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                    <label className="flex items-start gap-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={roomType.defaultMopping}
                        onChange={(event) => updateRoomType(roomType.id, { defaultMopping: event.target.checked })}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                      />
                      <span>
                        <span className="block font-medium text-gray-800">Mopping included by default</span>
                        <span className="mt-1 block text-xs text-gray-500">Its calculated time cost follows the cadence selected here.</span>
                      </span>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Mopping frequency</span>
                      <select
                        value={roomType.moppingCadence ?? 'every_clean'}
                        onChange={(event) => updateRoomType(roomType.id, { moppingCadence: event.target.value as RoomTaskCadence })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                      >
                        {ROOM_TASK_CADENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 border-t border-teal-100 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-gray-800">Client scope tasks</h4>
                        <p className="text-xs text-gray-600">Default tasks start selected in new quotes. Floor tasks use minutes per sqm and the {formatCurrency(pricingConfig.settings.hourlyRate)} hourly rate; other prices are fixed and support cents.</p>
                      </div>
                      <button type="button" onClick={() => addScopeTask(roomType.id)} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800">Add task</button>
                    </div>
                    <div className="space-y-2">
                      {roomType.scopeTasks.map((task, taskIndex) => {
                        const globalRates = getGlobalRoomTaskRates(config)
                        const matchedGlobalRates = getMatchedGlobalRoomTaskRates(config, roomType, taskIndex)
                        const globalLabels = matchedGlobalRates.map((rate) => rate.label)
                        const globallyManaged = matchedGlobalRates.length > 0
                        const taskPricingMode = getRoomScopeTaskPricingMode(roomType, taskIndex)
                        const selectedGlobalRateCode = getRoomScopeTaskGlobalRateCode(roomType, taskIndex)
                        const pricingSource = selectedGlobalRateCode === null ? '__automatic__' : selectedGlobalRateCode || '__custom__'
                        return (
                        <div key={getRoomScopeTaskId(roomType, taskIndex)} className="grid gap-2 rounded-lg border border-teal-100 bg-white p-2 md:grid-cols-[minmax(0,1fr)_170px_140px_140px_90px_auto] md:items-end">
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Task shown on scope</span>
                            <input value={task} onChange={(event) => updateScopeTask(roomType.id, taskIndex, { label: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                            {globallyManaged ? <span className="mt-1 block text-xs font-medium text-teal-700">Global: {globalLabels.join(' + ')}</span> : null}
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Pricing source</span>
                            <select
                              value={pricingSource}
                              onChange={(event) => updateScopeTask(roomType.id, taskIndex, {
                                globalRateCode: event.target.value === '__automatic__'
                                  ? null
                                  : event.target.value === '__custom__' ? '' : event.target.value,
                              })}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                            >
                              <option value="__automatic__">Automatic match</option>
                              <option value="__custom__">Custom for this task</option>
                              {globalRates.map((rate) => <option key={rate.code} value={rate.code}>{rate.label}</option>)}
                            </select>
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Frequency</span>
                            <select value={getRoomScopeTaskCadence(roomType, taskIndex)} onChange={(event) => updateScopeTask(roomType.id, taskIndex, { cadence: event.target.value as RoomTaskCadence })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                              {ROOM_TASK_CADENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{taskPricingMode === 'area' ? 'Minutes / sqm' : 'Fixed price ($)'}</span>
                            {globallyManaged ? <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 font-semibold text-teal-800">
                              {taskPricingMode === 'area'
                                ? `${getRoomScopeTaskMinutesPerSqm(roomType, taskIndex)} min / sqm`
                                : `${formatCurrency(getRoomScopeTaskPrice(roomType, taskIndex))} / room`}
                            </div> : <>
                              <select value={taskPricingMode} onChange={(event) => updateScopeTask(roomType.id, taskIndex, { pricingMode: event.target.value === 'area' ? 'area' : 'fixed' })} className="mb-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs">
                                <option value="fixed">Per room</option>
                                <option value="area">Per sqm</option>
                              </select>
                              {taskPricingMode === 'area' ? <>
                              <input type="number" min="0" step="0.001" inputMode="decimal" value={getRoomScopeTaskMinutesPerSqm(roomType, taskIndex)} onChange={(event) => updateScopeTask(roomType.id, taskIndex, { minutesPerSqm: Number(event.target.value || 0) })} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                              <span className="mt-1 block text-xs text-gray-500">≈ {formatCurrency(getRoomScopeTaskMinutesPerSqm(roomType, taskIndex) * pricingConfig.settings.hourlyRate / 60)} / sqm · {formatCurrency(getRoomScopeTaskMinutesPerSqm(roomType, taskIndex) * pricingConfig.settings.hourlyRate / 60 * Math.max(0, roomType.defaultSize))} for {roomType.defaultSize} sqm</span>
                              </> : <input type="number" min="0" step="0.01" inputMode="decimal" value={getRoomScopeTaskPrice(roomType, taskIndex)} onChange={(event) => updateScopeTask(roomType.id, taskIndex, { price: Number(event.target.value || 0) })} className="w-full rounded-lg border border-gray-300 px-3 py-2" />}
                            </>}
                          </label>
                          <label className="flex min-h-[42px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={getRoomScopeTaskDefault(roomType, taskIndex)} onChange={(event) => updateScopeTask(roomType.id, taskIndex, { defaultSelected: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600" />
                            Default
                          </label>
                          <button type="button" onClick={() => removeScopeTask(roomType.id, taskIndex)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">Remove</button>
                        </div>
                      )})}
                    </div>
                  </div>
                </div>

                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                  <strong>Room-specific allowances are disabled.</strong> The percentage adjustment and additional price per room are both fixed at zero. Add or edit a task rate instead so the same work is priced consistently throughout the system.
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h4 className="font-semibold" style={{ color: '#1a2744' }}>Priced extras</h4>
                      <p className="text-sm text-gray-600">Extras appear in the Quote Workbench and can run every clean or on a periodic schedule.</p>
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
                      <div key={`room-field-row-${roomTypeIndex}-${fieldIndex}`} className="rounded-xl border border-gray-200 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
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
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Price when done</span>
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
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Frequency</span>
                            <select
                              value={field.cadence ?? 'every_clean'}
                              onChange={(event) => updateField(roomType.id, field.id, { cadence: event.target.value as RoomTaskCadence })}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              {ROOM_TASK_CADENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
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
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_140px] md:items-end">
                          <label className="block text-sm">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Internal help (10–15 words)</span>
                          <input
                            value={field.helpText ?? ''}
                            onChange={(event) => updateField(roomType.id, field.id, { helpText: event.target.value })}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            maxLength={120}
                            placeholder="Briefly explain what to count and how it affects price"
                          />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeField(roomType.id, field.id)}
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remove field
                          </button>
                        </div>
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
              )
            })}
          </div>

          {status.message ? (
            <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {status.message}
            </p>
          ) : null}
        </form>
      </div>
  )
}
