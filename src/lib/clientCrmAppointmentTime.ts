import { getDateTimeInTimeZone } from '@/lib/calendarInvite'

type ManualInspectionWindowInput = {
  date: string
  startTime: string
  durationMinutes: number
  timeZone: string
  now?: Date
}

export type ManualInspectionWindow = {
  start: Date
  end: Date
  startTime: string
  endTime: string
  day: string
  label: string
}

function localParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${mapped.year}-${mapped.month}-${mapped.day}`,
    time: `${mapped.hour}:${mapped.minute}`,
    weekday: mapped.weekday,
  }
}

export function getManualInspectionWindow(input: ManualInspectionWindowInput): ManualInspectionWindow {
  const date = input.date.trim()
  const startTime = input.startTime.trim()
  const durationMinutes = Number(input.durationMinutes)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new Error('Choose a valid inspection date and start time.')
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error('Inspection duration must be between 15 and 480 minutes.')
  }

  const start = getDateTimeInTimeZone(date, startTime, input.timeZone)
  if (Number.isNaN(start.getTime())) {
    throw new Error('Choose a valid inspection date and start time.')
  }
  const startParts = localParts(start, input.timeZone)
  if (startParts.date !== date || startParts.time !== startTime) {
    throw new Error('Choose a valid inspection date and start time.')
  }
  if (start.getTime() <= (input.now ?? new Date()).getTime()) {
    throw new Error('Inspection appointments must be scheduled in the future.')
  }

  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const endParts = localParts(end, input.timeZone)
  if (endParts.date !== date) {
    throw new Error('Inspection appointments must start and finish on the same day.')
  }

  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    timeZone: input.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(start)
  const timeFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: input.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  })

  return {
    start,
    end,
    startTime,
    endTime: endParts.time,
    day: startParts.weekday.toLowerCase(),
    label: `${dateLabel}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`,
  }
}
