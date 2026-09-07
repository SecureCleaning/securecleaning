import assert from 'node:assert/strict'
import test from 'node:test'

const { getManualInspectionWindow } = await import('../src/lib/clientCrmAppointmentTime.ts')

test('manual CRM appointments accept exact staff-selected times outside public slots', () => {
  const result = getManualInspectionWindow({
    date: '2026-09-08',
    startTime: '13:35',
    durationMinutes: 75,
    timeZone: 'Australia/Sydney',
    now: new Date('2026-09-07T00:00:00Z'),
  })

  assert.equal(result.start.toISOString(), '2026-09-08T03:35:00.000Z')
  assert.equal(result.end.toISOString(), '2026-09-08T04:50:00.000Z')
  assert.equal(result.startTime, '13:35')
  assert.equal(result.endTime, '14:50')
  assert.equal(result.day, 'tuesday')
  assert.match(result.label, /Tuesday 8 September 2026/)
})

test('manual CRM appointments reject past, invalid-duration, and overnight values', () => {
  assert.throws(() => getManualInspectionWindow({
    date: '2026-09-06',
    startTime: '10:00',
    durationMinutes: 60,
    timeZone: 'Australia/Melbourne',
    now: new Date('2026-09-07T00:00:00Z'),
  }), /future/)

  assert.throws(() => getManualInspectionWindow({
    date: '2026-09-08',
    startTime: '10:00',
    durationMinutes: 10,
    timeZone: 'Australia/Melbourne',
    now: new Date('2026-09-07T00:00:00Z'),
  }), /between 15 and 480 minutes/)

  assert.throws(() => getManualInspectionWindow({
    date: '2026-02-31',
    startTime: '10:00',
    durationMinutes: 60,
    timeZone: 'Australia/Melbourne',
    now: new Date('2026-01-01T00:00:00Z'),
  }), /valid inspection date/)

  assert.throws(() => getManualInspectionWindow({
    date: '2026-09-08',
    startTime: '23:30',
    durationMinutes: 60,
    timeZone: 'Australia/Melbourne',
    now: new Date('2026-09-07T00:00:00Z'),
  }), /same day/)
})
