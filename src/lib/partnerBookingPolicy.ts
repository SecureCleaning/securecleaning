import type { AvailabilityConfig, AvailabilitySuggestion } from './availability'
import type { City } from './types'
import { australianLocalities } from './australianLocalities'
import { isPartnerWeekday } from './partnerBookingDates'

export const PARTNER_REGIONS = { melbourne: 'VIC', sydney: 'NSW', brisbane: 'QLD' } as const
export type PartnerCompany = {
  id: string; name: string; active: boolean; cities: City[]; assignee_ids: string[]; expires_at: string | null
}
export class PartnerError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export function textField(value: unknown, label: string, max: number, required = true) {
  const text = typeof value === 'string' ? value.trim() : ''
  if ((required && !text) || text.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new PartnerError(`Enter a valid ${label}.`)
  return text
}
export function companyEnabled(company: PartnerCompany, now = Date.now()) {
  return company.active && (!company.expires_at || Date.parse(company.expires_at) > now)
}
export function partnerConfig(config: AvailabilityConfig, company: PartnerCompany, city: City): AvailabilityConfig {
  if (!companyEnabled(company) || !company.cities.includes(city)) throw new PartnerError('This state is not available for your account.', 403)
  const assignees = config.assignees.filter(a => a.active && a.city === city && company.assignee_ids.includes(a.id))
  const ids = new Set(assignees.map(a => a.id))
  // Filter before priority selection: excluded calendars must never consume a slot.
  return { ...config, assignees, weeklySlots: config.weeklySlots.filter(s => ids.has(s.assigneeId)), oneOffBlocks: config.oneOffBlocks.filter(b => ids.has(b.assigneeId)) }
}
export function partnerLocation(input: Record<string, unknown>) {
  const city = input.city as City
  if (!Object.hasOwn(PARTNER_REGIONS, city)) throw new PartnerError('Choose an allowed state.')
  const suburb = textField(input.suburb, 'suburb', 80)
  const postcode = textField(input.postcode, 'postcode', 4)
  const locality = australianLocalities.find(l => l.state === PARTNER_REGIONS[city] && l.postcode === postcode && l.suburb.toLowerCase() === suburb.toLowerCase())
  if (!locality) throw new PartnerError('Select a matching suburb and postcode in that state.')
  return { city, suburb: locality.suburb, postcode, latitude: locality.latitude, longitude: locality.longitude }
}
export function localDate(city: City, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: city === 'brisbane' ? 'Australia/Brisbane' : city === 'sydney' ? 'Australia/Sydney' : 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return `${values.year}-${values.month}-${values.day}`
}
export function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
export function checkPartnerDate(date: unknown, city: City, now = new Date()) {
  const value = textField(date, 'appointment date', 10)
  const today = localDate(city, now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < addDays(today, 1) || value > addDays(today, 90)) throw new PartnerError('Choose a date from tomorrow within the next 90 days.')
  if (!isPartnerWeekday(value)) throw new PartnerError('Appointments are available Monday to Friday only.')
  return value
}
export function safePartnerSlot(slot: AvailabilitySuggestion, date: string) {
  return { slotId: slot.slotId, date, startTime: slot.startTime, endTime: slot.endTime, agent: slot.assigneeName }
}
export function partnerBookingDetails(input: Record<string, unknown>) {
  const location = partnerLocation(input)
  const email = textField(input.email, 'email', 254).toLowerCase()
  const phone = textField(input.phone, 'phone number', 40)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, '').length < 8) throw new PartnerError('Enter a valid contact email and phone number.')
  const premisesType = textField(input.premisesType, 'premises type', 40)
  if (!['office','medical','industrial','childcare','retail','gym','warehouse','function_centre','sports_facility','other'].includes(premisesType)) throw new PartnerError('Choose a premises type.')
  const frequency = textField(input.frequency, 'cleaning frequency', 20)
  if (!['daily','7x_week','3x_week','2x_week','weekly','fortnightly','monthly'].includes(frequency)) throw new PartnerError('Choose a recurring cleaning frequency.')
  const timePreference = textField(input.timePreference, 'cleaning time preference', 20)
  if (!['business_hours','after_hours','weekend'].includes(timePreference)) throw new PartnerError('Choose a cleaning time preference.')
  if (input.customerConfirmed !== true) throw new PartnerError('Confirm that the customer has agreed to this appointment.')
  const idempotencyKey = textField(input.idempotencyKey, 'booking request', 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new PartnerError('Refresh the page before booking.')
  return { ...location, email, phone, premisesType, frequency, timePreference, idempotencyKey,
    businessName: textField(input.businessName, 'business name', 120), contactName: textField(input.contactName, 'contact name', 120),
    address: textField(input.address, 'street address', 180), notes: textField(input.notes, 'appointment notes', 1500, false),
    date: textField(input.date, 'appointment date', 10), slotId: textField(input.slotId, 'appointment time', 180) }
}
