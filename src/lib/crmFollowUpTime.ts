export function followUpInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function followUpIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Choose a valid follow-up time.')
  return date.toISOString()
}

export function businessDayFollowUp(days: number, now = new Date()) {
  const date = new Date(now)
  let remaining = days
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining--
  }
  date.setHours(9, 0, 0, 0)
  return followUpInput(date.toISOString())
}

export function followUpGroup(value: string, now = new Date()) {
  const date = new Date(value)
  if (date.getTime() < now.getTime()) return 'Overdue'
  return date.toDateString() === now.toDateString() ? 'Today' : 'Upcoming'
}
