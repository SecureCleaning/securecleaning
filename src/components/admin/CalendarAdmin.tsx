'use client'

import { useMemo, useState } from 'react'
import type { AvailabilityAssignee } from '@/lib/availability'
import type { AgentCalendarEvent } from '@/lib/availabilityCalendar'

type CalendarData = {
  assignee: AvailabilityAssignee
  events: AgentCalendarEvent[]
}

type ViewMode = 'week' | 'day'

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
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  return `${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
}

function eventKindLabel(kind: AgentCalendarEvent['kind']) {
  return kind === 'booking' ? 'Appointment' : kind === 'blockout' ? 'Blocked' : 'Available'
}

function eventTypeStyle(kind: AgentCalendarEvent['kind']) {
  if (kind === 'booking') return 'border-blue-300 bg-blue-50 text-blue-950'
  if (kind === 'blockout') return 'border-red-300 bg-red-50 text-red-950'
  return 'border-emerald-300 bg-emerald-50 text-emerald-950'
}

function eventDayKey(event: AgentCalendarEvent) {
  const value = new Date(event.startsAt)
  return dateKey(value)
}

export default function CalendarAdmin({ calendars }: { calendars: CalendarData[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => startOfWeek(new Date()))
  const [selectedIds, setSelectedIds] = useState(() => new Set(calendars.map(({ assignee }) => assignee.id)))
  const [selectedEvent, setSelectedEvent] = useState<{ event: AgentCalendarEvent; assignee: AvailabilityAssignee } | null>(null)

  const visibleCalendars = useMemo(
    () => calendars.filter(({ assignee }) => selectedIds.has(assignee.id)),
    [calendars, selectedIds],
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

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: '#1a2744' }}>Calendar</h1>
            <p className="mt-2 max-w-3xl text-gray-600">Compare inspection appointments, agent availability, and block-outs across the team.</p>
          </div>
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm" aria-label="Calendar view">
            <button type="button" onClick={() => changeView('week')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${viewMode === 'week' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>Weekly</button>
            <button type="button" onClick={() => changeView('day')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${viewMode === 'day' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>Daily</button>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Calendars</h2>
              <p className="mt-1 text-sm text-gray-600">Select which agents appear in the calendar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedIds(new Set(calendars.map(({ assignee }) => assignee.id)))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Select all</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Clear all</button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {calendars.map(({ assignee }, index) => {
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

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
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

          <div className="mt-5 space-y-5">
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
      </div>

      {selectedEvent ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-calendar-event-title">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{eventKindLabel(selectedEvent.event.kind)} · {selectedEvent.assignee.name}</div><h2 id="admin-calendar-event-title" className="mt-1 text-xl font-bold" style={{ color: '#1a2744' }}>{selectedEvent.event.title}</h2><p className="mt-1 text-sm font-semibold text-gray-700">{formatTimeRange(selectedEvent.event)}</p></div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="text-sm font-semibold text-gray-500 hover:text-gray-900">Close</button>
            </div>
            {selectedEvent.event.details?.length ? <dl className="mt-5 space-y-3">{selectedEvent.event.details.map((detail) => <div key={`${detail.label}-${detail.value}`}><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{detail.label}</dt><dd className="mt-0.5 text-sm text-gray-900">{detail.value}</dd></div>)}</dl> : <div className="mt-5 space-y-3 text-sm text-gray-700">{selectedEvent.event.subtitle ? <p>{selectedEvent.event.subtitle}</p> : null}{selectedEvent.event.description ? <p className="whitespace-pre-line">{selectedEvent.event.description}</p> : null}{selectedEvent.event.location ? <p>{selectedEvent.event.location}</p> : null}</div>}
          </div>
        </div>
      ) : null}
    </main>
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
        <div className="mt-1 truncate text-sm font-semibold">{event.kind === 'booking' ? `${event.title}` : formatTimeRange(event)}</div>
        {event.kind === 'booking' ? <div className="mt-1 truncate text-xs opacity-80">{event.location || event.subtitle || 'Click for details'}</div> : null}
      </div>
      <div className={`mt-1 text-xs font-semibold ${detailed ? 'sm:mt-0 sm:text-right' : ''}`}>
        {event.kind === 'booking' ? formatTimeRange(event) : null}
      </div>
    </button>
  )
}
