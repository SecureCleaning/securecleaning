'use client'

import { useState } from 'react'
import type { AvailabilityConfig, ServiceZone, WeeklyAvailabilitySlot, Weekday } from '@/lib/availability'
import { getAdminHeaders } from '@/lib/useAdminHeaders'

const DAY_OPTIONS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function toCsv(values: string[]): string {
  return values.join(', ')
}

function fromCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function AvailabilityAdmin({ initialConfig }: { initialConfig: AvailabilityConfig }) {
  const [config, setConfig] = useState<AvailabilityConfig>(initialConfig)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch('/api/admin/availability', {
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

      setConfig(result.config as AvailabilityConfig)
      setStatus({ type: 'success', message: 'Availability saved successfully.' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save availability.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateZone(zoneId: string, updates: Partial<ServiceZone>) {
    setConfig((current) => ({
      ...current,
      zones: current.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...updates } : zone)),
    }))
  }

  function updateSlot(slotId: string, updates: Partial<WeeklyAvailabilitySlot>) {
    setConfig((current) => ({
      ...current,
      weeklySlots: current.weeklySlots.map((slot) => (slot.id === slotId ? { ...slot, ...updates } : slot)),
    }))
  }

  function addZone() {
    const id = `zone-${Date.now()}`
    setConfig((current) => ({
      ...current,
      zones: [
        ...current.zones,
        { id, name: 'New Zone', city: 'melbourne', matchTerms: [], postcodes: [], notes: '' },
      ],
    }))
  }

  function addSlot() {
    const id = `slot-${Date.now()}`
    setConfig((current) => ({
      ...current,
      weeklySlots: [
        ...current.weeklySlots,
        {
          id,
          city: 'melbourne',
          label: 'New Slot',
          day: 'monday',
          startTime: '09:00',
          endTime: '10:00',
          zoneIds: [],
          active: true,
          notes: '',
        },
      ],
    }))
  }

  function removeZone(zoneId: string) {
    setConfig((current) => ({
      ...current,
      zones: current.zones.filter((zone) => zone.id !== zoneId),
      weeklySlots: current.weeklySlots.map((slot) => ({
        ...slot,
        zoneIds: slot.zoneIds.filter((id) => id !== zoneId),
      })),
    }))
  }

  function removeSlot(slotId: string) {
    setConfig((current) => ({
      ...current,
      weeklySlots: current.weeklySlots.filter((slot) => slot.id !== slotId),
    }))
  }

  const zoneOptions = config.zones.map((zone) => ({ id: zone.id, label: `${zone.name} (${zone.city})` }))

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Availability Editor
          </h1>
          <p className="text-gray-600 max-w-3xl">
            Match suburb/postcode terms to service zones, then assign weekly inspection windows to those zones.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Inspection availability configuration</h2>
                <p className="text-sm text-gray-600">Save once you&apos;ve finished updating service zones and weekly windows.</p>
              </div>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: '#22c55e' }}>
                {isSubmitting ? 'Saving…' : 'Save Availability'}
              </button>
            </div>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: '#1a2744' }}>Service zones</h3>
                  <p className="text-sm text-gray-600">Address matching checks suburb/area terms first, then explicit postcodes.</p>
                </div>
                <button type="button" onClick={addZone} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: '#1a2744' }}>
                  Add Zone
                </button>
              </div>

              <div className="space-y-4">
                {config.zones.map((zone) => (
                  <div key={zone.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Zone name</label>
                        <input value={zone.name} onChange={(event) => updateZone(zone.id, { name: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <select value={zone.city} onChange={(event) => updateZone(zone.id, { city: event.target.value as ServiceZone['city'] })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
                          <option value="melbourne">Melbourne</option>
                          <option value="sydney">Sydney</option>
                        </select>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-xs text-gray-500 break-all">ID: {zone.id}</div>
                        <button type="button" onClick={() => removeZone(zone.id)} className="text-sm font-semibold text-red-600 hover:text-red-700">Delete</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Suburb / area terms (comma separated)</label>
                      <textarea rows={3} value={toCsv(zone.matchTerms)} onChange={(event) => updateZone(zone.id, { matchTerms: fromCsv(event.target.value) })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Postcodes (comma separated)</label>
                      <input value={toCsv(zone.postcodes)} onChange={(event) => updateZone(zone.id, { postcodes: fromCsv(event.target.value) })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <input value={zone.notes ?? ''} onChange={(event) => updateZone(zone.id, { notes: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: '#1a2744' }}>Weekly inspection slots</h3>
                  <p className="text-sm text-gray-600">Attach one or more service zones to each weekly slot.</p>
                </div>
                <button type="button" onClick={addSlot} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: '#1a2744' }}>
                  Add Slot
                </button>
              </div>

              <div className="space-y-4">
                {config.weeklySlots.map((slot) => (
                  <div key={slot.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                        <input value={slot.label} onChange={(event) => updateSlot(slot.id, { label: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <select value={slot.city} onChange={(event) => updateSlot(slot.id, { city: event.target.value as WeeklyAvailabilitySlot['city'] })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
                          <option value="melbourne">Melbourne</option>
                          <option value="sydney">Sydney</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                        <select value={slot.day} onChange={(event) => updateSlot(slot.id, { day: event.target.value as Weekday })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white">
                          {DAY_OPTIONS.map((day) => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                        <input type="time" value={slot.startTime} onChange={(event) => updateSlot(slot.id, { startTime: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                        <input type="time" value={slot.endTime} onChange={(event) => updateSlot(slot.id, { endTime: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Matched zones</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-gray-200 p-4">
                        {zoneOptions.map((zone) => {
                          const checked = slot.zoneIds.includes(zone.id)
                          return (
                            <label key={zone.id} className="flex items-start gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  const nextZoneIds = event.target.checked
                                    ? [...slot.zoneIds, zone.id]
                                    : slot.zoneIds.filter((id) => id !== zone.id)
                                  updateSlot(slot.id, { zoneIds: nextZoneIds })
                                }}
                              />
                              <span>{zone.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea rows={2} value={slot.notes ?? ''} onChange={(event) => updateSlot(slot.id, { notes: event.target.value })} className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                      </div>
                      <div className="flex items-center justify-between gap-4 md:justify-end">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700 mt-7 md:mt-0">
                          <input type="checkbox" checked={slot.active} onChange={(event) => updateSlot(slot.id, { active: event.target.checked })} />
                          Active slot
                        </label>
                        <button type="button" onClick={() => removeSlot(slot.id)} className="text-sm font-semibold text-red-600 hover:text-red-700 mt-7 md:mt-0">
                          Delete slot
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {status.message ? <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{status.message}</p> : null}
        </form>
      </div>
    </div>
  )
}
