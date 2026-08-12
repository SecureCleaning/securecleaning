'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
  defaultMoppingRequiredForType,
  getAdditionalPublicRoomScopeOptions,
  getRoomScopeGuidance,
  getSuggestedPublicRoomScopeOptions,
  createPublicRoomScopeItem,
  deriveQuoteAddOnCountsFromRoomScope,
  mergeRoomScopeIntoAddOns,
  sanitizePublicRoomScope,
} from '@/lib/publicRoomScope'
import type { QuoteInputs, FlooringType, PublicRoomScopeItem, PublicRoomScopeType } from '@/lib/types'

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

const EMPTY_ADD_ONS = {
  bathrooms: 0,
  kitchens: 0,
  windows: 0,
  glassCleaningRequired: false,
  consumables: false,
  highTouchDisinfection: false,
  carpetSteam: false,
}

function isPresetType(type: PublicRoomScopeType) {
  return type !== 'other'
}

export default function StepTwo({ data, onChange, errors }: StepTwoProps) {
  const [sliderValue, setSliderValue] = useState(data.floorArea ?? DEFAULT_FLOOR_AREA)
  const [pendingFocusRoomId, setPendingFocusRoomId] = useState<string | null>(null)
  const customRoomRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const roomScope = useMemo(
    () => sanitizePublicRoomScope(data.roomScope ?? []),
    [data.roomScope]
  )

  useEffect(() => {
    setSliderValue(data.floorArea ?? DEFAULT_FLOOR_AREA)
  }, [data.floorArea])

  const selectedPresetTypes = new Set(roomScope.filter((room) => isPresetType(room.type)).map((room) => room.type))
  const suggestedOptions = getSuggestedPublicRoomScopeOptions(data.premisesType)
  const additionalOptions = getAdditionalPublicRoomScopeOptions(data.premisesType)
  const roomScopeGuidance = getRoomScopeGuidance(data.premisesType)
  const customRooms = roomScope.filter((room) => room.isCustom)

  useEffect(() => {
    if (!pendingFocusRoomId) return

    const container = customRoomRefs.current[pendingFocusRoomId]
    if (!container) return

    container.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const target = container.querySelector('select, input, textarea') as HTMLElement | null
    window.setTimeout(() => target?.focus(), 220)
    setPendingFocusRoomId(null)
  }, [pendingFocusRoomId, customRooms])

  function emitRoomScope(nextRoomScope: PublicRoomScopeItem[]) {
    const normalizedRoomScope = sanitizePublicRoomScope(nextRoomScope)
    const derivedCounts = deriveQuoteAddOnCountsFromRoomScope(normalizedRoomScope)
    const addOns = mergeRoomScopeIntoAddOns(normalizedRoomScope, data.addOns ?? EMPTY_ADD_ONS)

    onChange({
      roomScope: normalizedRoomScope,
      addOns,
      meetingRooms: derivedCounts.meetingRooms,
    })
  }

  const handleSliderChange = (value: number) => {
    setSliderValue(value)
    onChange({ floorArea: value })
  }

  const handleNumberChange = (raw: string) => {
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 0) {
      setSliderValue(Math.max(SLIDER_MIN, Math.min(num, SLIDER_MAX)))
      onChange({ floorArea: num })
    }
  }

  function togglePresetRoom(type: PublicRoomScopeType) {
    if (selectedPresetTypes.has(type)) {
      emitRoomScope(roomScope.filter((room) => room.type !== type))
      return
    }

    emitRoomScope([...roomScope, createPublicRoomScopeItem(type)])
  }

  function updateRoom(roomId: string, patch: Partial<PublicRoomScopeItem>) {
    emitRoomScope(
      roomScope.map((room) => room.id === roomId ? { ...room, ...patch } : room)
    )
  }

  function addOtherRoom() {
    const nextRoom = {
      ...createPublicRoomScopeItem('other', true),
      label: '',
    }
    emitRoomScope([
      ...roomScope,
      nextRoom,
    ])
    setPendingFocusRoomId(nextRoom.id)
  }

  function removeRoom(roomId: string) {
    emitRoomScope(roomScope.filter((room) => room.id !== roomId))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: '#1a2744' }}>
          About your premises
        </h2>
        <p className="text-gray-600 text-sm">
          This keeps the instant quote quick, while giving us enough scope detail to prepare your inspection.
        </p>
      </div>

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
              min={0}
              value={data.floorArea ?? ''}
              onChange={(e) => handleNumberChange(e.target.value)}
              className="block w-full px-3 py-2 text-center rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-semibold"
              placeholder="sqm"
            />
          </div>
        </div>
        {errors.floorArea && <p className="text-xs text-red-600 mt-1">{errors.floorArea}</p>}
        <p className="text-xs text-gray-500 mt-2">
          The slider is just a quick guide for common sizes. You can type any premises size directly into the box.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <Select
          label="Primary Flooring Type"
          options={flooringOptions}
          placeholder="Select flooring type…"
          value={data.flooringType ?? ''}
          onChange={(e) => onChange({ flooringType: e.target.value as FlooringType })}
          error={errors.flooringType}
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">Common rooms and shared areas</h3>
            <p className="text-sm text-gray-600 mt-1">
              Your main floor area is already covered by the total sqm above. Use this section to flag shared spaces or special areas we should account for before inspection.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              For bathrooms, select Female, Male or Accessible / disabled separately when the facilities are known.
            </p>
            <div className="mt-3 inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              {roomScopeGuidance}
            </div>
          </div>
          <button
            type="button"
            onClick={addOtherRoom}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
          >
            + Other area
          </button>
        </div>

        <div>
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-gray-900">Suggested for this premises</h4>
            <p className="text-sm text-gray-500">Start with the spaces that usually matter most for this type of site.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {suggestedOptions.map((option) => {
              const room = roomScope.find((entry) => entry.type === option.type)
              const selected = Boolean(room)

              return (
                <div
                  key={option.type}
                  className={`rounded-xl border p-4 transition-colors ${
                    selected ? 'border-teal-300 bg-white shadow-sm' : 'border-gray-200 bg-white'
                  }`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => togglePresetRoom(option.type)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-gray-900">{option.label}</span>
                      <span className="mt-1 block text-sm text-gray-500">{option.description}</span>
                    </span>
                  </label>

                  {room ? (
                    <div className={`mt-4 grid gap-3 ${option.allowMopping ? 'sm:grid-cols-[minmax(0,1fr)_132px]' : 'sm:grid-cols-1'}`}>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-gray-700">How many?</span>
                        <input
                          type="number"
                          min="1"
                          value={room.quantity}
                          onChange={(event) => updateRoom(room.id, { quantity: Math.max(1, Number(event.target.value || 1)) })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </label>
                      {option.allowMopping ? (
                        <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 sm:self-end sm:min-h-[42px]">
                          <input
                            type="checkbox"
                            checked={room.moppingRequired ?? false}
                            onChange={() => updateRoom(room.id, { moppingRequired: !(room.moppingRequired ?? false) })}
                            className="h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                          />
                          <span>Mopping?</span>
                        </label>
                      ) : (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                          Mopping is not usually scoped separately for this room type at the remote quote stage.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {additionalOptions.length > 0 ? (
          <div className="mt-5">
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-900">Other spaces you might want to mention</h4>
              <p className="text-sm text-gray-500">Only add these if they matter for your site. We can confirm the finer detail at inspection.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {additionalOptions.map((option) => {
                const room = roomScope.find((entry) => entry.type === option.type)
                const selected = Boolean(room)

                return (
                  <div
                    key={option.type}
                    className={`rounded-xl border p-4 transition-colors ${
                      selected ? 'border-teal-300 bg-white shadow-sm' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => togglePresetRoom(option.type)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900">{option.label}</span>
                        <span className="mt-1 block text-sm text-gray-500">{option.description}</span>
                      </span>
                    </label>

                    {room ? (
                      <div className={`mt-4 grid gap-3 ${option.allowMopping ? 'sm:grid-cols-[minmax(0,1fr)_132px]' : 'sm:grid-cols-1'}`}>
                        <label className="text-sm">
                          <span className="mb-1 block font-medium text-gray-700">How many?</span>
                          <input
                            type="number"
                            min="1"
                            value={room.quantity}
                            onChange={(event) => updateRoom(room.id, { quantity: Math.max(1, Number(event.target.value || 1)) })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2"
                          />
                        </label>
                        {option.allowMopping ? (
                          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 sm:self-end sm:min-h-[42px]">
                            <input
                              type="checkbox"
                              checked={room.moppingRequired ?? false}
                              onChange={() => updateRoom(room.id, { moppingRequired: !(room.moppingRequired ?? false) })}
                              className="h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                            />
                            <span>Mopping?</span>
                          </label>
                        ) : (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                            Mopping is not usually scoped separately for this room type at the remote quote stage.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {customRooms.length > 0 ? (
          <div className="mt-4 space-y-3">
            {customRooms.map((room, index) => (
              <div
                key={room.id}
                ref={(node) => {
                  customRoomRefs.current[room.id] = node
                }}
                className="rounded-xl border border-gray-200 bg-white p-4"
                tabIndex={-1}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">Other area {index + 1}</h4>
                    <p className="text-sm text-gray-500">Add any extra room or special space that should be noted before inspection.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRoom(room.id)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Room type</span>
                    <select
                      id={`custom-room-type-${room.id}`}
                      value={room.type}
                      onChange={(event) => {
                        const nextType = event.target.value as PublicRoomScopeType
                        const nextOption = sanitizePublicRoomScope([createPublicRoomScopeItem(nextType, true)])[0]
                        updateRoom(room.id, {
                          type: nextType,
                          label: room.label.trim() ? room.label : nextOption.label,
                          moppingRequired: defaultMoppingRequiredForType(nextType),
                        })
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white"
                    >
                      {[
                        ...suggestedOptions,
                        ...additionalOptions.filter((option) => !suggestedOptions.some((suggested) => suggested.type === option.type)),
                        { type: 'other', label: 'Other room / area', description: '', allowMopping: true, recommendedFor: [] },
                      ].map((option) => (
                        <option key={option.type} value={option.type}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Area label"
                    placeholder="e.g. Showroom, training room, mezzanine"
                    value={room.label}
                    onChange={(event) => updateRoom(room.id, { label: event.target.value })}
                  />
                  <Input
                    label="How many?"
                    type="number"
                    min={1}
                    value={room.quantity}
                    onChange={(event) => updateRoom(room.id, { quantity: Math.max(1, Number(event.target.value || 1)) })}
                  />
                </div>
                <label className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={room.moppingRequired ?? false}
                    onChange={() => updateRoom(room.id, { moppingRequired: !(room.moppingRequired ?? false) })}
                    className="h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Mopping?</span>
                </label>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-600">
          Bathrooms, kitchens and meeting rooms selected here will flow into the estimate automatically, while mopping requests are carried forward for inspection review.
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Checkbox
            label="Glass cleaning required (internal / external)"
            description="Glass cleaning is priced separately from the remote quote. We can estimate the cost during your site inspection."
            checked={data.addOns?.glassCleaningRequired ?? false}
            onChange={() =>
              onChange({
                addOns: {
                  ...(data.addOns ?? EMPTY_ADD_ONS),
                  glassCleaningRequired: !(data.addOns?.glassCleaningRequired ?? false),
                  windows: 0,
                },
              })
            }
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-900 mb-1">Quick inspection prep</p>
          <p>
            Use the room selector for the spaces you know about now. We’ll confirm room-by-room details, special finishes and final scope during the site visit.
          </p>
        </div>
      </div>
    </div>
  )
}
