// Date-only arithmetic must not depend on the browser/server timezone.
export function addPartnerDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function isPartnerWeekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day >= 1 && day <= 5
}

export function partnerWeekStart(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return addPartnerDays(date, -(day === 0 ? 6 : day - 1))
}

export function partnerCalendarWeek(requestedDate: string, minDate: string, maxDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    || !Number.isFinite(Date.parse(requestedDate))
    || new Date(requestedDate).toISOString().slice(0, 10) !== requestedDate
    || requestedDate < partnerWeekStart(minDate) || requestedDate > maxDate) {
    throw new RangeError('Choose a week within the next 90 days.')
  }
  const weekStart = partnerWeekStart(requestedDate)
  const previous = addPartnerDays(weekStart, -7), next = addPartnerDays(weekStart, 7)
  return {
    weekStart,
    dates: Array.from({ length: 5 }, (_, day) => addPartnerDays(weekStart, day)),
    previousWeek: previous >= partnerWeekStart(minDate) ? previous : null,
    nextWeek: next <= maxDate ? next : null,
  }
}
