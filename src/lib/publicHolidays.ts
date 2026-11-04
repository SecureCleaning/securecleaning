import { getCityTimeZone, getDateTimeInTimeZone } from '@/lib/calendarInvite'
import { getAdminSupabase } from '@/lib/supabase'
import type { City } from '@/lib/types'

export type AustralianStateCode = 'ACT' | 'NSW' | 'NT' | 'QLD' | 'SA' | 'TAS' | 'VIC' | 'WA'

type PublicHolidayRow = {
  id: string
  state_code: AustralianStateCode
  holiday_date: string
  holiday_name: string
  start_time: string
  end_time: string
  is_all_day: boolean
  source_url: string
}

export type PublicHolidayPeriod = {
  id: string
  stateCode: AustralianStateCode
  name: string
  startsAt: string
  endsAt: string
  allDay: boolean
  sourceUrl: string
}

const CITY_STATE: Record<City, AustralianStateCode> = {
  melbourne: 'VIC',
  sydney: 'NSW',
  brisbane: 'QLD',
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function normaliseTime(value: string, fallback: string) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : fallback
}

export function mapPublicHolidayRows(rows: PublicHolidayRow[], city: City): PublicHolidayPeriod[] {
  const timeZone = getCityTimeZone(city)
  return rows.flatMap((row) => {
    if (row.state_code !== CITY_STATE[city]) return []
    const startTime = row.is_all_day ? '00:00' : normaliseTime(row.start_time, '00:00')
    const endTime = row.is_all_day ? '00:00' : normaliseTime(row.end_time, '23:59')
    const endDate = row.is_all_day || endTime <= startTime ? addDate(row.holiday_date, 1) : row.holiday_date
    const startsAt = getDateTimeInTimeZone(row.holiday_date, startTime, timeZone)
    const endsAt = getDateTimeInTimeZone(endDate, endTime, timeZone)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return []
    return [{
      id: row.id,
      stateCode: row.state_code,
      name: row.holiday_name,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      allDay: row.is_all_day,
      sourceUrl: row.source_url,
    }]
  })
}

async function loadPublicHolidayPeriods(
  city: City,
  rangeStart: Date,
  rangeEnd: Date,
  required: boolean,
): Promise<PublicHolidayPeriod[]> {
  const timeZone = getCityTimeZone(city)
  const startDate = dateKeyInTimeZone(rangeStart, timeZone)
  const endDate = dateKeyInTimeZone(new Date(Math.max(rangeStart.getTime(), rangeEnd.getTime() - 1)), timeZone)
  try {
    const { data, error } = await getAdminSupabase()
      .from('calendar_public_holidays')
      .select('id, state_code, holiday_date, holiday_name, start_time, end_time, is_all_day, source_url')
      .eq('state_code', CITY_STATE[city])
      .eq('active', true)
      .gte('holiday_date', startDate)
      .lte('holiday_date', endDate)
      .order('holiday_date', { ascending: true })

    if (error) {
      console.error('[publicHolidays] Failed to load public holidays:', error)
      if (required) throw new Error('Public holiday availability could not be checked.')
      return []
    }
    return mapPublicHolidayRows((data ?? []) as PublicHolidayRow[], city)
  } catch (error) {
    if (required && error instanceof Error && error.message === 'Public holiday availability could not be checked.') throw error
    console.error('[publicHolidays] Unexpected public holiday load failure:', error)
    if (required) throw new Error('Public holiday availability could not be checked.')
    return []
  }
}

export function getPublicHolidayPeriods(city: City, rangeStart: Date, rangeEnd: Date) {
  return loadPublicHolidayPeriods(city, rangeStart, rangeEnd, false)
}

/** Booking paths must fail closed if the authoritative holiday calendar cannot be read. */
export function getRequiredPublicHolidayPeriods(city: City, rangeStart: Date, rangeEnd: Date) {
  return loadPublicHolidayPeriods(city, rangeStart, rangeEnd, true)
}

export function publicHolidaysToAvailabilityBlocks(
  holidays: PublicHolidayPeriod[],
  assigneeIds: string[],
) {
  return assigneeIds.flatMap((assigneeId) => holidays.map((holiday) => ({
    id: `public-holiday-${holiday.id}-${assigneeId}`,
    assigneeId,
    startsAt: holiday.startsAt,
    endsAt: holiday.endsAt,
    label: holiday.name,
    active: true,
  })))
}
