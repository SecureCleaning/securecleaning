import type { AvailabilityConfig, AvailabilitySuggestion, AvailabilityAssignee } from './availability'

// Retained export name for existing callers; Queensland always uses area-first priority.
export function usesMelbournePriority(config: AvailabilityConfig, city: string) {
  return city === 'brisbane' || (city === 'melbourne' && config.settings?.melbourneBookingMode === 'priority')
}

export function compareBookingPriority(a: AvailabilityAssignee, b: AvailabilityAssignee) {
  return (a.bookingPriority ?? 100) - (b.bookingPriority ?? 100) || a.id.localeCompare(b.id)
}

export function validateBookingPriorityConfig(
  config: AvailabilityConfig,
  options: { requireSeparateCalendars?: boolean } = {},
): string | null {
  if (config.settings?.melbourneBookingMode != null && !['zones', 'priority'].includes(config.settings.melbourneBookingMode)) return 'Choose a valid Melbourne booking allocation mode.'
  const requireSeparateCalendars = options.requireSeparateCalendars ?? true
  const priorities = new Set<string>()
  const calendars = new Set<string>()
  for (const agent of config.assignees.filter(a => a.active && usesMelbournePriority(config, a.city))) {
    if (!Number.isInteger(agent.bookingPriority) || agent.bookingPriority! < 1 || agent.bookingPriority! > 999) return `Set a booking priority from 1 to 999 for ${agent.name}.`
    if (priorities.has(`${agent.city}:${agent.bookingPriority}`)) return 'Each active agent in the same priority region must have a different booking priority.'
    priorities.add(`${agent.city}:${agent.bookingPriority}`)
    if (!requireSeparateCalendars) continue
    const calendar = agent.calendarId?.trim().toLowerCase()
    if (!calendar || calendar === 'primary') return `Set a specific separate calendar ID for ${agent.name} before enabling booking priority.`
    if (calendars.has(calendar) || (agent.city === 'brisbane' && config.assignees.some(other => other.active && other.id !== agent.id && other.calendarId?.trim().toLowerCase() === calendar))) return 'Active priority agents must use separate calendars.'
    calendars.add(calendar)
  }
  return null
}

// Availability/conflict checks run first. Keep one eligible agent per time,
// so a lower-priority agent is offered when the preferred agent is unavailable.
export function prioritizeAppointmentSuggestions(config: AvailabilityConfig, suggestions: AvailabilitySuggestion[]) {
  const agents = new Map(config.assignees.map(a => [a.id, a]))
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const sorted = [...suggestions].sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day)
    || a.startTime.localeCompare(b.startTime)
    || compareBookingPriority(agents.get(a.assigneeId)!, agents.get(b.assigneeId)!)
    || a.slotId.localeCompare(b.slotId))
  const seen = new Set<string>()
  return sorted.filter(s => {
    const key = `${s.day}:${s.startTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
