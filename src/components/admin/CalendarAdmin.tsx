'use client'

import { useMemo, useState } from 'react'
import type { AvailabilityAssignee } from '@/lib/availability'
import type { AgentCalendarEvent } from '@/lib/availabilityCalendar'
import AdminPageHeader from './AdminPageHeader'

type CalendarData = {
  assignee: AvailabilityAssignee
  events: AgentCalendarEvent[]
}

type ViewMode = 'week' | 'day'

type CalendarActionState = {
  type: 'idle' | 'saving' | 'success' | 'warning' | 'error'
  message: string
}

const AGENT_COLOURS = [
  { border: 'border-teal-300', bg: 'bg-teal-50', text: 'text-teal-950', dot: 'bg-teal-500' },
  { border: 'border-violet-300', bg: 'bg-violet-50', text: 'text-violet-950', dot: 'bg-violet-500' },
  { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-950', dot: 'bg-amber-500' },
  { border: 'border-rose-300', bg: 'bg-rose-50', text: 'text-rose-950', dot: 'bg-rose-500' },
  { border: 'border-sky-300', bg: 'bg-sky-50', text: 'text-sky-950', dot: 'bg-sky-500' },
  { border: 'border-lime-300', bg: 'bg-lime-50', text: 'text-lime-950', dot: 'bg-lime-500' },
]

function startOfWeek(value: Date) {
  const next = new Date(value)
  const day = next.getDay()
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day))
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const next = new Date(year, (month || 1) - 1, day || 1)
  next.setHours(0, 0, 0, 0)
  return next
}

function formatDate(value: Date, options: Intl.DateTimeFormatOptions = {}) {
  return value.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', ...options })
}

function formatTimeRange(event: AgentCalendarEvent) {
  if (event.allDay) return 'All day'
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  return `${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
}

function eventKindLabel(kind: AgentCalendarEvent['kind']) {
  return kind === 'booking' || kind === 'sale_inspection'
    ? 'Appointment'
    : kind === 'blockout'
      ? 'Blocked'
      : kind === 'public_holiday'
        ? 'Public holiday'
        : 'Available'
}

function eventTypeStyle(kind: AgentCalendarEvent['kind']) {
  if (kind === 'booking' || kind === 'sale_inspection') return 'border-blue-300 bg-blue-50 text-blue-950'
  if (kind === 'blockout') return 'border-red-300 bg-red-50 text-red-950'
  if (kind === 'public_holiday') return 'border-amber-300 bg-amber-50 text-amber-950'
  return 'border-emerald-300 bg-emerald-50 text-emerald-950'
}

function eventDayKey(event: AgentCalendarEvent) {
  const value = new Date(event.startsAt)
  return dateKey(value)
}

export default function CalendarAdmin({ calendars }: { calendars: CalendarData[] }) {
  const [calendarData, setCalendarData] = useState(calendars)
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => startOfWeek(new Date()))
  const [selectedIds, setSelectedIds] = useState(() => new Set(calendars.map(({ assignee }) => assignee.id)))
  const [selectedEvent, setSelectedEvent] = useState<{ event: AgentCalendarEvent; assignee: AvailabilityAssignee } | null>(null)
  const [actionState, setActionState] = useState<CalendarActionState>({ type: 'idle', message: '' })

  const visibleCalendars = useMemo(
    () => calendarData.filter(({ assignee }) => selectedIds.has(assignee.id)),
    [calendarData, selectedIds],
  )

  const days = useMemo(() => {
    const first = viewMode === 'week' ? startOfWeek(anchorDate) : anchorDate
    return Array.from({ length: viewMode === 'week' ? 7 : 1 }, (_, index) => addDays(first, index))
  }, [anchorDate, viewMode])

  const eventsByDay = useMemo(() => {
    const result = new Map<string, Array<{ event: AgentCalendarEvent; assignee: AvailabilityAssignee; colourIndex: number }>>()
    visibleCalendars.forEach(({ assignee, events }, colourIndex) => {
      events.forEach((event) => {
        const key = eventDayKey(event)
        const current = result.get(key) ?? []
        current.push({ event, assignee, colourIndex })
        result.set(key, current)
      })
    })
    result.forEach((items) => items.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt)))
    return result
  }, [visibleCalendars])

  function toggleAgent(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setToday() {
    setAnchorDate(viewMode === 'week' ? startOfWeek(new Date()) : new Date())
  }

  function move(step: number) {
    setAnchorDate((current) => addDays(current, viewMode === 'week' ? step * 7 : step))
  }

  function changeView(next: ViewMode) {
    setViewMode(next)
    if (next === 'week') setAnchorDate(startOfWeek(anchorDate))
  }

  async function cancelSelectedAppointment() {
    const bookingRef = selectedEvent?.event.bookingRef
    if (!bookingRef || selectedEvent.event.kind !== 'booking' || actionState.type === 'saving') return
    const { event, assignee } = selectedEvent
    if (!window.confirm(`Cancel the ${event.title} appointment on ${formatTimeRange(event)}?`)) return

    setActionState({ type: 'saving', message: '' })
    try {
      const response = await fetch(
        `/api/availability-agent/${encodeURIComponent(assignee.id)}/bookings/${encodeURIComponent(bookingRef)}`,
        { method: 'DELETE' },
      )
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to cancel appointment.')

      setCalendarData((current) => current.map((calendar) => (
        calendar.assignee.id === assignee.id
          ? { ...calendar, events: calendar.events.filter((item) => item.bookingRef !== bookingRef) }
          : calendar
      )))
      setSelectedEvent(null)

      const statuses = (result.notifications ?? []).map((item: { status?: string }) => item.status)
      if (result.unchanged) {
        setActionState({ type: 'success', message: 'The appointment was already cancelled. No new emails were sent.' })
      } else if (statuses.length === 2 && statuses.every((status: string | undefined) => status === 'sent')) {
        setActionState({ type: 'success', message: 'Appointment cancelled. Confirmation emails were sent to the client and agent.' })
      } else {
        setActionState({ type: 'warning', message: 'Appointment cancelled, but one or more notification emails need review. Do not repeat the cancellation.' })
      }
    } catch (error) {
      setActionState({ type: 'error', message: error instanceof Error ? error.message : 'Unable to cancel appointment.' })
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Calendar"
        description="Compare inspection appointments, agent availability, and block-outs across the team."
        actions={<div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm" aria-label="Calendar view">
          <button type="button" onClick={() => changeView('week')} className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold ${viewMode === 'week' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>Weekly</button>
          <button type="button" onClick={() => changeView('day')} className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold ${viewMode === 'day' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>Daily</button>
        </div>}
      />

        {actionState.type !== 'idle' && actionState.type !== 'saving' ? (
          <p
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${actionState.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : actionState.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'}`}
            role={actionState.type === 'success' ? 'status' : 'alert'}
          >
            {actionState.message}
          </p>
        ) : null}

        <section className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Calendars</h2>
              <p className="mt-1 text-sm text-gray-600">Select which agents appear in the calendar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedIds(new Set(calendarData.map(({ assignee }) => assignee.id)))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Select all</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Clear all</button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {calendarData.map(({ assignee }, index) => {
              const colour = AGENT_COLOURS[index % AGENT_COLOURS.length]
              return (
                <label key={assignee.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 hover:border-gray-300">
                  <input type="checkbox" checked={selectedIds.has(assignee.id)} onChange={() => toggleAgent(assignee.id)} className="h-4 w-4" />
                  <span className={`h-3 w-3 rounded-full ${colour.dot}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{assignee.name}</span>
                    <span className="block text-xs capitalize text-gray-500">{assignee.city}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-5">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => move(-1)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Previous</button>
              <button type="button" onClick={setToday} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Today</button>
              <button type="button" onClick={() => move(1)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Next</button>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600" htmlFor="calendar-date">Go to date</label>
              <input id="calendar-date" type="date" value={dateKey(anchorDate)} onChange={(event) => setAnchorDate(parseDateKey(event.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {days.map((day) => {
              const dayEvents = eventsByDay.get(dateKey(day)) ?? []
              return (
                <div key={dateKey(day)}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>{formatDate(day)}</h2>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</span>
                  </div>
                  {viewMode === 'week' ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-2">
                      <div className="space-y-1.5">
                        {dayEvents.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-5 text-xs text-gray-500">No events</div> : dayEvents.map(({ event, assignee, colourIndex }) => {
                          const colour = AGENT_COLOURS[colourIndex % AGENT_COLOURS.length]
                          return <CalendarEventCard key={event.id} event={event} assignee={assignee} colour={colour} onClick={() => setSelectedEvent({ event, assignee })} />
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dayEvents.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-500">No events for this day.</div> : dayEvents.map(({ event, assignee, colourIndex }) => {
                        const colour = AGENT_COLOURS[colourIndex % AGENT_COLOURS.length]
                        return <CalendarEventCard key={event.id} event={event} assignee={assignee} colour={colour} detailed onClick={() => setSelectedEvent({ event, assignee })} />
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      {selectedEvent ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-calendar-event-title">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{eventKindLabel(selectedEvent.event.kind)} · {selectedEvent.assignee.name}</div><h2 id="admin-calendar-event-title" className="mt-1 text-xl font-bold" style={{ color: '#1a2744' }}>{selectedEvent.event.title}</h2><p className="mt-1 text-sm font-semibold text-gray-700">{formatTimeRange(selectedEvent.event)}</p></div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="text-sm font-semibold text-gray-500 hover:text-gray-900">Close</button>
            </div>
            {selectedEvent.event.details?.length ? <dl className="mt-5 space-y-3">{selectedEvent.event.details.map((detail) => <div key={`${detail.label}-${detail.value}`}><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{detail.label}</dt><dd className="mt-0.5 text-sm text-gray-900">{detail.value}</dd></div>)}</dl> : <div className="mt-5 space-y-3 text-sm text-gray-700">{selectedEvent.event.subtitle ? <p>{selectedEvent.event.subtitle}</p> : null}{selectedEvent.event.description ? <p className="whitespace-pre-line">{selectedEvent.event.description}</p> : null}{selectedEvent.event.location ? <p>{selectedEvent.event.location}</p> : null}</div>}
            {actionState.type === 'error' ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{actionState.message}</p> : null}
            {selectedEvent.event.kind === 'booking' && selectedEvent.event.bookingRef ? (
              <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => void cancelSelectedAppointment()}
                  disabled={actionState.type === 'saving'}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionState.type === 'saving' ? 'Cancelling…' : 'Cancel appointment'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CalendarEventCard({
  event,
  assignee,
  colour,
  detailed = false,
  onClick,
}: {
  event: AgentCalendarEvent
  assignee: AvailabilityAssignee
  colour: (typeof AGENT_COLOURS)[number]
  detailed?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} title={`${event.title} · ${formatTimeRange(event)}`} className={`block w-full rounded-lg border px-2 py-2 text-left ${eventTypeStyle(event.kind)} ${event.kind === 'availability' ? 'border-dashed opacity-80' : ''} ${detailed ? 'sm:flex sm:items-start sm:justify-between sm:gap-4' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
          <span className={`h-2 w-2 rounded-full ${colour.dot}`} aria-hidden="true" />
          <span>{assignee.name}</span>
          <span className="opacity-70">{eventKindLabel(event.kind)}</span>
        </div>
        <div className="mt-1 truncate text-sm font-semibold">{event.kind === 'booking' || event.kind === 'public_holiday' ? event.title : formatTimeRange(event)}</div>
        {event.kind === 'booking' ? <div className="mt-1 truncate text-xs opacity-80">{event.location || event.subtitle || 'Click for details'}</div> : null}
        {event.kind === 'public_holiday' ? <div className="mt-1 truncate text-xs opacity-80">{formatTimeRange(event)}</div> : null}
      </div>
      <div className={`mt-1 text-xs font-semibold ${detailed ? 'sm:mt-0 sm:text-right' : ''}`}>
        {event.kind === 'booking' ? formatTimeRange(event) : null}
      </div>
    </button>
  )
}
