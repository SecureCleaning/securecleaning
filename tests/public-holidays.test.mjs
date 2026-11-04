import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import * as calendarInvite from '../src/lib/calendarInvite.ts'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const { mapPublicHolidayRows, publicHolidaysToAvailabilityBlocks } = await import('../src/lib/publicHolidays.ts')
const { buildPublicHolidayEvents, excludePublicHolidaysFromAvailability } = await import('../src/lib/availabilityCalendar.ts')
const { isAvailabilityDateInRange } = await import('../src/lib/availability.ts')
const root = fileURLToPath(new URL('..', import.meta.url))

const baseRow = {
  id: 'vic-2027-good-friday',
  state_code: 'VIC',
  holiday_date: '2027-03-26',
  holiday_name: 'Good Friday',
  start_time: '00:00:00',
  end_time: '00:00:00',
  is_all_day: true,
  source_url: 'https://business.vic.gov.au/example',
}

test('state public holidays become timezone-safe all-day calendar periods', () => {
  const [holiday] = mapPublicHolidayRows([baseRow], 'melbourne')
  assert.deepEqual(holiday, {
    id: 'vic-2027-good-friday',
    stateCode: 'VIC',
    name: 'Good Friday',
    startsAt: '2027-03-25T13:00:00.000Z',
    endsAt: '2027-03-26T13:00:00.000Z',
    allDay: true,
    sourceUrl: 'https://business.vic.gov.au/example',
  })
})

test('part-day holidays preserve their official local hours', () => {
  const [holiday] = mapPublicHolidayRows([{
    ...baseRow,
    id: 'qld-2027-christmas-eve',
    state_code: 'QLD',
    holiday_date: '2027-12-24',
    holiday_name: 'Christmas Eve public holiday',
    start_time: '18:00:00',
    is_all_day: false,
    source_url: 'https://www.qld.gov.au/example',
  }], 'brisbane')
  assert.equal(holiday.startsAt, '2027-12-24T08:00:00.000Z')
  assert.equal(holiday.endsAt, '2027-12-24T14:00:00.000Z')
  assert.equal(holiday.allDay, false)
})

test('holidays are limited to the calendar state', () => {
  const rows = [
    baseRow,
    { ...baseRow, id: 'qld-state', state_code: 'QLD' },
  ]
  assert.deepEqual(mapPublicHolidayRows(rows, 'sydney'), [])
  assert.deepEqual(mapPublicHolidayRows(rows, 'brisbane').map((holiday) => holiday.id), ['qld-state'])
})

test('booking availability accepts only dates inside the holiday-loaded calendar window', () => {
  assert.equal(isAvailabilityDateInRange(undefined, '2026-11-05', '2027-02-02'), true)
  assert.equal(isAvailabilityDateInRange('2026-11-05', '2026-11-05', '2027-02-02'), true)
  assert.equal(isAvailabilityDateInRange('2027-02-03', '2026-11-05', '2027-02-02'), false)
  assert.equal(isAvailabilityDateInRange('not-a-date', '2026-11-05', '2027-02-02'), false)
  assert.equal(isAvailabilityDateInRange('2026-02-30', '2026-01-01', '2026-12-31'), false)
})

function loadHolidayModule(result) {
  const source = readFileSync(`${root}/src/lib/publicHolidays.ts`, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  const builder = new Proxy({}, { get(_target, key) { if (key === 'then') return (resolve) => resolve(result); return () => builder } })
  vm.runInNewContext(code, { exports, console, require(name) {
    if (name === '@/lib/calendarInvite') return calendarInvite
    if (name === '@/lib/supabase') return { getAdminSupabase: () => ({ from: () => builder }) }
    throw new Error(`Unexpected dependency ${name}`)
  } })
  return exports
}

test('booking holiday reads fail closed while display-only calendars degrade safely', async () => {
  const mod = loadHolidayModule({ data: null, error: { message: 'private database detail' } })
  const start = new Date('2026-11-01T00:00:00Z'), end = new Date('2026-12-01T00:00:00Z')
  await assert.rejects(() => mod.getRequiredPublicHolidayPeriods('melbourne', start, end), /could not be checked/)
  assert.equal((await mod.getPublicHolidayPeriods('melbourne', start, end)).length, 0)
})

test('public holidays block every active assignee calendar without becoming editable personal blocks', () => {
  const holidays = mapPublicHolidayRows([baseRow], 'melbourne')
  const blocks = publicHolidaysToAvailabilityBlocks(holidays, ['melb-one', 'melb-two'])
  assert.equal(blocks.length, 2)
  assert.deepEqual(blocks.map((block) => block.assigneeId), ['melb-one', 'melb-two'])
  assert.ok(blocks.every((block) => block.label === 'Good Friday' && block.active))

  const [event] = buildPublicHolidayEvents(holidays)
  assert.equal(event.kind, 'public_holiday')
  assert.equal(event.title, 'Good Friday')
  assert.equal(event.allDay, true)
  assert.match(event.description, /Standard inspection availability is blocked/)
})

test('calendar display removes or splits green availability while preserving appointments', () => {
  const availability = { id: 'available', kind: 'availability', title: 'Available', startsAt: '2027-12-24T07:00:00.000Z', endsAt: '2027-12-24T10:00:00.000Z' }
  const booking = { id: 'booking', kind: 'booking', title: 'Existing appointment', startsAt: '2027-12-24T08:30:00.000Z', endsAt: '2027-12-24T08:40:00.000Z' }
  const partial = [{ id: 'partial', stateCode: 'QLD', name: 'Christmas Eve', startsAt: '2027-12-24T08:00:00.000Z', endsAt: '2027-12-24T09:00:00.000Z', allDay: false, sourceUrl: 'https://www.qld.gov.au/example' }]
  const result = excludePublicHolidaysFromAvailability([availability, booking], partial)
  assert.deepEqual(result.filter((event) => event.kind === 'availability').map((event) => [event.startsAt, event.endsAt]), [
    ['2027-12-24T07:00:00.000Z', '2027-12-24T08:00:00.000Z'],
    ['2027-12-24T09:00:00.000Z', '2027-12-24T10:00:00.000Z'],
  ])
  assert.equal(result.some((event) => event.id === 'booking'), true)
  assert.deepEqual(excludePublicHolidaysFromAvailability([availability], [{ ...partial[0], startsAt: '2027-12-23T14:00:00.000Z', endsAt: '2027-12-24T14:00:00.000Z', allDay: true }]), [])
})

test('holiday migration imports official NSW, Victoria and Queensland dates for 2026 and 2027', () => {
  const migration = readFileSync(`${root}/supabase/migrations/20261104115915_calendar_public_holidays.sql`, 'utf8')
  for (const state of ['NSW', 'VIC', 'QLD']) {
    for (const year of ['2026', '2027']) assert.match(migration, new RegExp(`'${state}', '${year}-`))
  }
  assert.match(migration, /calendar_public_holidays.*enable row level security/s)
  assert.match(migration, /revoke all on table public\.calendar_public_holidays from public, anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete on table public\.calendar_public_holidays to service_role/)
  assert.doesNotMatch(migration, /Brisbane Show Day|brisbane-show-day|scope_city/)
  assert.equal((migration.match(/\('[a-z]{3}-202[67]-/g) ?? []).length, 82)
})
