import type { AvailabilityConfig } from './availability'
import { getAssigneeServiceZones, locationMatchesServiceZones } from './availability'
import { compareBookingPriority } from './availabilityPriority'
import { checkPartnerDate, partnerConfig, partnerLocation, PartnerError, type PartnerCompany } from './partnerBookingPolicy'
import type { City } from './types'

export type ProposedAppointment = { date: string; startTime: string }
export function parseProposedAppointments(value: unknown, city: City, now: Date | null = new Date()): ProposedAppointment[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new PartnerError('Provide between one and five proposed appointment times.')
  const seen = new Set<string>()
  return value.map(item => {
    const date = item?.date
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new PartnerError('Choose a valid proposed date.')
    if (now) checkPartnerDate(date, city, now)
    const startTime = item?.startTime
    if (typeof startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || startTime > '23:50') throw new PartnerError('Choose a valid start time with room for a 10-minute appointment.')
    const key = `${date} ${startTime}`
    if (seen.has(key)) throw new PartnerError('Each proposed time must be different.')
    seen.add(key)
    return { date, startTime }
  }).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
}

export function proposalAgent(config: AvailabilityConfig, company: PartnerCompany, input: Record<string, unknown>) {
  const location = partnerLocation(input), scoped = partnerConfig(config, company, location.city)
  return scoped.assignees.filter(agent => locationMatchesServiceZones(location, location.city, getAssigneeServiceZones(scoped, agent.id)))
    .sort(compareBookingPriority)[0] ?? null
}
