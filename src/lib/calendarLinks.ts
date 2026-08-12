type CalendarLinkFields = {
  calendarId?: string
  calendarViewUrl?: string
  calendarSubscriptionUrl?: string
}

function normalizeUrl(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : ''
}

export function buildGoogleCalendarViewUrl(calendarId?: string) {
  const normalized = calendarId?.trim()
  if (!normalized) return ''
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(normalized)}`
}

export function getCalendarViewUrl(source: CalendarLinkFields) {
  return normalizeUrl(source.calendarViewUrl) || buildGoogleCalendarViewUrl(source.calendarId)
}

export function getCalendarSubscriptionUrl(source: CalendarLinkFields) {
  return normalizeUrl(source.calendarSubscriptionUrl)
}
