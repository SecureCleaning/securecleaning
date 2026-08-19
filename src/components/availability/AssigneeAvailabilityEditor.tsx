'use client'
import { useState } from 'react'
import type {
  AvailabilityAssignee,
  OneOffAvailabilityBlock,
  ServiceZone,
  WeeklyAvailabilitySlot,
  Weekday,
} from '@/lib/availability'
import type { AgentCalendarEvent } from '@/lib/availabilityCalendar'
import { getCalendarSubscriptionUrl, getCalendarViewUrl } from '@/lib/calendarLinks'
import AgentCalendarPanel from './AgentCalendarPanel'
import AvailabilityAgentNav from './AvailabilityAgentNav'

const DAY_OPTIONS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function toLocalDateTimeInput(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function fromLocalDateTimeInput(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

export default function AssigneeAvailabilityEditor({
  assignee,
  initialWeeklySlots,
  initialOneOffBlocks,
  zones,
  apiPath,
  title,
  description,
  allowAddSlot = false,
  allowDeleteSlot = false,
  allowZoneEditing = false,
  initialCalendarEvents = [],
  calendarFeedUrl,
  compactLayout = false,
  showAgentNav = true,
}: {
  assignee: AvailabilityAssignee
  initialWeeklySlots: WeeklyAvailabilitySlot[]
  initialOneOffBlocks: OneOffAvailabilityBlock[]
  zones: ServiceZone[]
  apiPath: string
  title: string
  description: string
  allowAddSlot?: boolean
  allowDeleteSlot?: boolean
  allowZoneEditing?: boolean
  initialCalendarEvents?: AgentCalendarEvent[]
  calendarFeedUrl?: string
  compactLayout?: boolean
  showAgentNav?: boolean
}) {
  const [weeklySlots, setWeeklySlots] = useState(initialWeeklySlots)
  const [oneOffBlocks, setOneOffBlocks] = useState(initialOneOffBlocks)
  const calendarViewUrl = getCalendarViewUrl(assignee)
  const calendarSubscriptionUrl = getCalendarSubscriptionUrl(assignee)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedCopied, setFeedCopied] = useState(false)

  function updateSlot(slotId: string, updates: Partial<WeeklyAvailabilitySlot>) {
    setWeeklySlots((current) =>
      current.map((slot) => (slot.id === slotId ? { ...slot, ...updates, assigneeId: assignee.id } : slot))
    )
  }

  function addSlot() {
    const id = `slot-${assignee.id}-${Date.now()}`
    setWeeklySlots((current) => [
      ...current,
      {
        id,
        city: assignee.city,
        assigneeId: assignee.id,
        label: 'New slot',
        day: 'monday',
        startTime: '09:00',
        endTime: '10:00',
        zoneIds: [],
        active: true,
        notes: '',
      },
    ])
  }

  function removeSlot(slotId: string) {
    setWeeklySlots((current) => current.filter((slot) => slot.id !== slotId))
  }

  function updateBlock(blockId: string, updates: Partial<OneOffAvailabilityBlock>) {
    setOneOffBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, ...updates, assigneeId: assignee.id } : block))
    )
  }

  function addBlock() {
    const id = `block-${assignee.id}-${Date.now()}`
    setOneOffBlocks((current) => [
      ...current,
      {
        id,
        assigneeId: assignee.id,
        startsAt: '',
        endsAt: '',
        label: 'Manual block-out',
        active: true,
      },
    ])
  }

  function removeBlock(blockId: string) {
    setOneOffBlocks((current) => current.filter((block) => block.id !== blockId))
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklySlots, oneOffBlocks }),
      })

      const result = await response.json()
      if (!response.ok || result?.error) {
        throw new Error(result.error || 'Save failed.')
      }

      setWeeklySlots((result.weeklySlots as WeeklyAvailabilitySlot[]) ?? weeklySlots)
      setOneOffBlocks((result.oneOffBlocks as OneOffAvailabilityBlock[]) ?? oneOffBlocks)
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

  return (
    <div className={compactLayout ? 'space-y-5' : 'min-h-screen bg-gray-50 py-16'}>
      <div className={compactLayout ? 'space-y-5' : 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8'}>
        {showAgentNav ? <AvailabilityAgentNav assigneeId={assignee.id} showLogout /> : null}
        {!compactLayout ? <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            {title}
          </h1>
          <p className="text-gray-600 max-w-3xl">{description}</p>
        </div> : null}

        <form onSubmit={handleSave} className={compactLayout ? 'space-y-5' : 'space-y-8'}>
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Agent</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{assignee.name}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">City</div>
                <div className="mt-1 text-sm text-gray-900 capitalize">{assignee.city}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</div>
                <div className="mt-1 text-sm text-gray-900">{assignee.email || '—'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Calendar ID</div>
                <div className="mt-1 text-sm text-gray-900 break-all">{assignee.calendarId || '—'}</div>
              </div>
            </div>
            {(calendarViewUrl || calendarSubscriptionUrl || calendarFeedUrl) ? (
              <div className="mt-5 flex flex-wrap gap-3">
                {calendarViewUrl ? (
                  <a
                    href={calendarViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300"
                  >
                    Open calendar view
                  </a>
                ) : null}
                {calendarSubscriptionUrl ? (
                  <a
                    href={calendarSubscriptionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300"
                  >
                    Open subscription / feed link
                  </a>
                ) : null}
                {calendarFeedUrl ? (
                  <div className="w-full rounded-xl border border-teal-200 bg-teal-50 p-4">
                    <div className="text-sm font-bold text-teal-950">Google Calendar sync</div>
                    <p className="mt-1 text-sm text-teal-900">In Google Calendar, choose <strong>Other calendars +</strong>, then <strong>From URL</strong>, and paste this private feed link. New, moved, and cancelled Secure Cleaning appointments will appear after Google refreshes the subscription.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={calendarFeedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-teal-300 bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:border-teal-400">Open private ICS feed</a>
                      <button type="button" onClick={async () => { await navigator.clipboard.writeText(calendarFeedUrl); setFeedCopied(true); window.setTimeout(() => setFeedCopied(false), 2000) }} className="inline-flex items-center justify-center rounded-lg border border-teal-300 bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:border-teal-400">{feedCopied ? 'Feed link copied' : 'Copy feed link'}</button>
                    </div>
                    <p className="mt-2 break-all text-xs text-teal-800">Keep this private: anyone with the link can view this agent&apos;s calendar feed.</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm text-gray-600">
                Ask admin to add a calendar view link or subscription/feed link if you need to open your appointment calendar outside this page.
              </p>
            )}
          </section>

          <AgentCalendarPanel
            events={initialCalendarEvents}
            bookingApiPath={`${apiPath}/bookings`}
            timeZone={assignee.city === 'sydney' ? 'Australia/Sydney' : 'Australia/Melbourne'}
          />

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>Weekly inspection slots</h2>
                <p className="text-sm text-gray-600">Adjust your recurring inspection windows here.</p>
              </div>
              {allowAddSlot ? (
                <button
                  type="button"
                  onClick={addSlot}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: '#1a2744' }}
                >
                  Add Slot
                </button>
              ) : null}
            </div>

            <div className="space-y-4">
              {weeklySlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No recurring slots are set yet for this agent.
                </div>
              ) : null}
              {weeklySlots.map((slot) => (
                <div key={slot.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                      <input
                        value={slot.label}
                        onChange={(event) => updateSlot(slot.id, { label: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                      <select
                        value={slot.day}
                        onChange={(event) => updateSlot(slot.id, { day: event.target.value as Weekday })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white"
                      >
                        {DAY_OPTIONS.map((day) => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(event) => updateSlot(slot.id, { startTime: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(event) => updateSlot(slot.id, { endTime: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                  </div>

                  {allowZoneEditing ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Inspection zones</label>
                      <p className="mb-2 text-sm text-gray-600">Select the areas you can cover during this inspection slot. Unchecked zones will be removed when you save.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-gray-200 p-4">
                        {zones.length > 0 ? zones.map((zone) => {
                            const checked = slot.zoneIds.includes(zone.id)
                            return (
                              <label key={zone.id} className="flex items-start gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const nextZoneIds = event.target.checked
                                      ? [...slot.zoneIds, zone.id]
                                      : slot.zoneIds.filter((zoneId) => zoneId !== zone.id)
                                    updateSlot(slot.id, { zoneIds: nextZoneIds })
                                  }}
                                />
                                <span>{zone.name}</span>
                              </label>
                            )
                          }) : (
                            <p className="text-sm text-gray-500">No inspection zones are configured for this city yet.</p>
                          )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      Zones: {slot.zoneIds.map((zoneId) => zones.find((zone) => zone.id === zoneId)?.name ?? zoneId).join(', ') || 'No zones assigned'}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        rows={2}
                        value={slot.notes ?? ''}
                        onChange={(event) => updateSlot(slot.id, { notes: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 md:justify-end">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700 mt-7 md:mt-0">
                        <input
                          type="checkbox"
                          checked={slot.active}
                          onChange={(event) => updateSlot(slot.id, { active: event.target.checked })}
                        />
                        Active slot
                      </label>
                      {allowDeleteSlot ? (
                        <button
                          type="button"
                          onClick={() => removeSlot(slot.id)}
                          className="text-sm font-semibold text-red-600 hover:text-red-700 mt-7 md:mt-0"
                        >
                          Delete slot
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>Inspection zone coverage</h2>
              <p className="mt-1 text-sm text-gray-600">
                Expand a zone to see the suburbs, area names, and postcodes it covers before assigning it to a slot.
              </p>
            </div>
            {zones.length > 0 ? (
              <div className="space-y-3">
                {zones.map((zone) => (
                  <details key={zone.id} className="group rounded-xl border border-gray-200 bg-gray-50 open:bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                      <span>{zone.name}</span>
                      <span className="shrink-0 text-xs font-medium text-teal-700 group-open:hidden">View coverage</span>
                      <span className="hidden shrink-0 text-xs font-medium text-teal-700 group-open:inline">Hide coverage</span>
                    </summary>
                    <div className="grid gap-4 border-t border-gray-200 px-4 py-4 md:grid-cols-2">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suburbs and areas</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {zone.matchTerms.length > 0 ? zone.matchTerms.map((term) => (
                            <span key={term} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700">{term}</span>
                          )) : <span className="text-sm text-gray-500">No suburb or area terms configured.</span>}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Postcodes</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {zone.postcodes.length > 0 ? zone.postcodes.map((postcode) => (
                            <span key={postcode} className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 font-mono text-xs font-semibold text-teal-900">{postcode}</span>
                          )) : <span className="text-sm text-gray-500">No postcodes configured.</span>}
                        </div>
                      </div>
                      {(zone.anchors ?? []).length > 0 ? <div className="md:col-span-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Radius coverage</h3>
                        <ul className="mt-2 space-y-1 text-sm text-gray-700">
                          {(zone.anchors ?? []).map((anchor) => (
                            <li key={anchor.id}><span className="font-semibold">{anchor.label}</span> — within {anchor.radiusKm} km</li>
                          ))}
                        </ul>
                      </div> : null}
                      {((zone.excludedMatchTerms ?? []).length > 0 || (zone.excludedPostcodes ?? []).length > 0) ? <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <span className="font-semibold">Excluded from this zone:</span>{' '}
                        {[...(zone.excludedMatchTerms ?? []), ...(zone.excludedPostcodes ?? [])].join(', ')}
                      </div> : null}
                      {zone.notes ? <p className="text-sm text-gray-600 md:col-span-2"><span className="font-semibold text-gray-700">Zone notes:</span> {zone.notes}</p> : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                No inspection zones are configured for this city yet.
              </p>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>One-off block-outs</h2>
                <p className="text-sm text-gray-600">Use these for leave, personal appointments, or any unavailable period.</p>
              </div>
              <button
                type="button"
                onClick={addBlock}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: '#1a2744' }}
              >
                Add Block-out
              </button>
            </div>

            <div className="space-y-4">
              {oneOffBlocks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  No date-specific block-outs added yet.
                </div>
              ) : null}
              {oneOffBlocks.map((block) => (
                <div key={block.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Starts</label>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeInput(block.startsAt)}
                        onChange={(event) => updateBlock(block.id, { startsAt: fromLocalDateTimeInput(event.target.value) })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ends</label>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeInput(block.endsAt)}
                        onChange={(event) => updateBlock(block.id, { endsAt: fromLocalDateTimeInput(event.target.value) })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                      <input
                        value={block.label}
                        onChange={(event) => updateBlock(block.id, { label: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={block.active}
                        onChange={(event) => updateBlock(block.id, { active: event.target.checked })}
                      />
                      Active block-out
                    </label>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="text-sm font-semibold text-red-600 hover:text-red-700"
                    >
                      Delete block-out
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {status.message ? (
            <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {status.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#22c55e' }}
          >
            {isSubmitting ? 'Saving…' : 'Save My Availability'}
          </button>
        </form>
      </div>
    </div>
  )
}
