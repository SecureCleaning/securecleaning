export function isOneOffDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value
}
export function oneOffWeekday(date: string) {
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(`${date}T00:00:00Z`).getUTCDay()] ?? 'monday'
}
export function validOneOffWindow(slot: { date?: string; startTime?: string; endTime?: string }) {
  return isOneOffDate(slot.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime ?? '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime ?? '') && slot.endTime! > slot.startTime!
}
