'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AgentCalendarEvent } from '@/lib/availabilityCalendar'

function startOfWeek(value: Date) {
  const next = new Date(value)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatDayHeader(value: Date) {
  return value.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  return `${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
}

function eventTone(kind: AgentCalendarEvent['kind']) {
  switch (kind) {
    case 'booking':
      return 'border-blue-200 bg-blue-50 text-blue-950'
    case 'blockout':
      return 'border-red-200 bg-red-50 text-red-950'
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  }
}

function eventLabel(kind: AgentCalendarEvent['kind']) {
  switch (kind) {
    case 'booking':
      return 'Appointment'
    case 'blockout':
      return 'Blocked'
    default:
      return 'Available'
  }
}

function toDateInput(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function toTimeInput(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export default function AgentCalendarPanel({
  events,
  bookingApiPath,
  timeZone = 'Australia/Melbourne',
}: {
  events: AgentCalendarEvent[]
  bookingApiPath?: string
  timeZone?: string
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [calendarEvents, setCalendarEvents] = useState(events)
  const [selectedEvent, setSelectedEvent] = useState<AgentCalendarEvent | null>(null)
  const [editingBooking, setEditingBooking] = useState<AgentCalendarEvent | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [actionState, setActionState] = useState<{ type: 'idle' | 'saving' | 'error'; message: string }>({ type: 'idle', message: '' })

  useEffect(() => {
    setCalendarEvents(events)
  }, [events])

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date())
    return addDays(base, weekOffset * 14)
  }, [weekOffset])

  const calendarWeeks = useMemo(
    () => Array.from({ length: 2 }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex) => addDays(weekStart, weekIndex * 7 + dayIndex))
    ),
    [weekStart]
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgentCalendarEvent[]>()

    for (const event of calendarEvents) {
      const dayKey = new Date(event.startsAt).toDateString()
      const dayEvents = map.get(dayKey) ?? []
      dayEvents.push(event)
      map.set(dayKey, dayEvents)
    }

    for (const dayEvents of map.values()) {
      dayEvents.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    }

    return map
  }, [calendarEvents])

  const upcomingCount = calendarEvents.filter((event) => event.kind === 'booking' && new Date(event.startsAt) >= new Date()).length

  function beginEdit(event: AgentCalendarEvent) {
    setSelectedEvent(null)
    setEditingBooking(event)
    setEditDate(toDateInput(event.startsAt, timeZone))
    setEditTime(toTimeInput(event.startsAt, timeZone))
    setActionState({ type: 'idle', message: '' })
  }

  function closeEdit() {
    if (actionState.type === 'saving') return
    setEditingBooking(null)
    setActionState({ type: 'idle', message: '' })
  }

  async function saveBooking() {
    if (!editingBooking?.bookingRef || !bookingApiPath || !editDate || !editTime) return
    setActionState({ type: 'saving', message: '' })

    try {
      const response = await fetch(`${bookingApiPath}/${encodeURIComponent(editingBooking.bookingRef)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredStartDate: editDate, preferredInspectionStartTime: editTime }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update appointment.')

      const startsAt = result.booking?.inspection_scheduled_for
        ? new Date(result.booking.inspection_scheduled_for).toISOString()
        : editingBooking.startsAt
      const endsAt = new Date(new Date(startsAt).getTime() + 10 * 60 * 1000).toISOString()
      setCalendarEvents((current) => current.map((event) => (
        event.bookingRef === editingBooking.bookingRef ? { ...event, startsAt, endsAt } : event
      )))
      closeEdit()
    } catch (error) {
      setActionState({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update appointment.' })
    }
  }

  async function cancelBooking(event: AgentCalendarEvent) {
    if (!event.bookingRef || !bookingApiPath || !window.confirm(`Cancel appointment ${event.bookingRef}?`)) return
    setActionState({ type: 'saving', message: '' })
    try {
      const response = await fetch(`${bookingApiPath}/${encodeURIComponent(event.bookingRef)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to cancel appointment.')
      setCalendarEvents((current) => current.filter((item) => item.bookingRef !== event.bookingRef))
      setSelectedEvent(null)
      setActionState({ type: 'idle', message: '' })
    } catch (error) {
      setActionState({ type: 'error', message: error instanceof Error ? error.message : 'Unable to cancel appointment.' })
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#1a2744' }}>
            Schedule calendar
          </h2>
          <p className="text-sm text-gray-600">
            Upcoming appointments, recurring availability windows, and block-outs shown across the current and following week.
          </p>
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
          {upcomingCount} upcoming client visit{upcomingCount === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setWeekOffset((current) => current - 1)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
        >
          Previous 2 weeks
        </button>
        <button
          type="button"
          onClick={() => setWeekOffset(0)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
        >
          This 2 weeks
        </button>
        <button
          type="button"
          onClick={() => setWeekOffset((current) => current + 1)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
        >
          Next 2 weeks
        </button>
      </div>

      <div className="mt-6 space-y-5">
        {calendarWeeks.map((weekDays) => (
          <div key={weekDays[0].toISOString()}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Week of {formatDayHeader(weekDays[0])}
            </div>
            <div className="grid gap-3 lg:grid-cols-7">
              {weekDays.map((day) => {
                const dayEvents = eventsByDay.get(day.toDateString()) ?? []
                return (
                  <div key={day.toISOString()} className="rounded-xl border border-gray-200 bg-gray-50 p-2">
                    <div className="mb-2">
                      <div className="text-sm font-semibold text-gray-900">{formatDayHeader(day)}</div>
                    </div>
                    <div className="space-y-1.5">
                      {dayEvents.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-2 py-2 text-[11px] text-gray-500">
                          No events
                        </div>
                      ) : (
                        dayEvents.map((event) => (
                          <button
                            type="button"
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            title={`${event.title} · ${formatTimeRange(event.startsAt, event.endsAt)}`}
                            className={`block w-full rounded-lg border px-2 py-2 text-left text-[11px] transition hover:brightness-95 ${eventTone(event.kind)} ${event.kind === 'availability' ? 'border-dashed opacity-80' : ''}`}
                          >
                            <div className="font-semibold uppercase tracking-wide">{eventLabel(event.kind)}</div>
                            <div className="mt-0.5 truncate font-semibold">{event.kind === 'booking' ? `${formatTimeRange(event.startsAt, event.endsAt)} · ${event.title}` : `${formatTimeRange(event.startsAt, event.endsAt)}`}</div>
                            {event.kind === 'booking' ? <div className="mt-0.5 truncate opacity-80">{event.title}</div> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedEvent ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="agent-calendar-event-title">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${selectedEvent.kind === 'booking' ? 'text-blue-700' : selectedEvent.kind === 'blockout' ? 'text-red-700' : 'text-emerald-700'}`}>{eventLabel(selectedEvent.kind)}</div>
                <h3 id="agent-calendar-event-title" className="mt-1 text-xl font-bold" style={{ color: '#1a2744' }}>{selectedEvent.title}</h3>
                <p className="mt-1 text-sm font-semibold text-gray-700">{formatTimeRange(selectedEvent.startsAt, selectedEvent.endsAt)}</p>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="text-sm font-semibold text-gray-500 hover:text-gray-900">Close</button>
            </div>
            {selectedEvent.details?.length ? (
              <dl className="mt-5 space-y-3">
                {selectedEvent.details.map((detail) => <div key={`${detail.label}-${detail.value}`}><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{detail.label}</dt><dd className="mt-0.5 text-sm text-gray-900">{detail.value}</dd></div>)}
              </dl>
            ) : (
              <div className="mt-5 space-y-3 text-sm text-gray-700">{selectedEvent.subtitle ? <p>{selectedEvent.subtitle}</p> : null}{selectedEvent.description ? <p className="whitespace-pre-line">{selectedEvent.description}</p> : null}{selectedEvent.location ? <p>{selectedEvent.location}</p> : null}</div>
            )}
            {selectedEvent.kind === 'booking' && selectedEvent.bookingRef && bookingApiPath ? (
              <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => beginEdit(selectedEvent)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50">Edit time</button>
                <button type="button" onClick={() => cancelBooking(selectedEvent)} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50">Cancel appointment</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingBooking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-agent-booking-title">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="edit-agent-booking-title" className="text-lg font-bold" style={{ color: '#1a2744' }}>Edit inspection appointment</h3>
                <p className="mt-1 text-sm text-gray-600">{editingBooking.bookingRef}</p>
              </div>
              <button type="button" onClick={closeEdit} className="text-sm font-semibold text-gray-500 hover:text-gray-900">Close</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Inspection date</span>
                <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} disabled={actionState.type === 'saving'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Start time</span>
                <input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} disabled={actionState.type === 'saving'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <span className="block text-xs text-gray-500">The appointment is 10 minutes; the rest of the hour protects travel time.</span>
              </label>
            </div>
            {actionState.type === 'error' ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionState.message}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeEdit} disabled={actionState.type === 'saving'} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Keep current time</button>
              <button type="button" onClick={saveBooking} disabled={actionState.type === 'saving' || !editDate || !editTime} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#22c55e' }}>
                {actionState.type === 'saving' ? 'Saving…' : 'Save appointment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
