import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import AgentCalendarPanel from '../src/components/availability/AgentCalendarPanel.tsx'
import { calendarDateKey, calendarFortnight } from '../src/lib/availabilityCalendarClient.ts'

test('regional calendar groups midnight and morning appointments independently of host timezone', () => {
  const original = process.env.TZ
  try {
    for (const host of ['UTC', 'Australia/Sydney', 'America/Los_Angeles']) {
      process.env.TZ = host
      assert.equal(calendarDateKey(new Date('2026-10-05T09:00:00+11:00'), 'Australia/Sydney'), '2026-10-05')
      assert.equal(calendarDateKey(new Date('2026-10-04T00:05:00+10:00'), 'Australia/Sydney'), '2026-10-04')
      const days = calendarFortnight(new Date('2026-10-05T00:05:00+11:00'), 'Australia/Sydney', 0).flat()
      assert.equal(days[0].toISOString().slice(0, 10), '2026-10-05')
      assert.equal(days[13].toISOString().slice(0, 10), '2026-10-18')
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

test('fortnight navigation preserves every day across daylight saving and year boundaries', () => {
  for (const [now, offset, first, last] of [
    ['2026-10-04T03:30:00+11:00', 0, '2026-09-28', '2026-10-11'],
    ['2026-10-04T03:30:00+11:00', 1, '2026-10-12', '2026-10-25'],
    ['2026-10-04T03:30:00+11:00', -1, '2026-09-14', '2026-09-27'],
    ['2027-01-01T00:05:00+11:00', 0, '2026-12-28', '2027-01-10'],
    ['2026-04-05T03:30:00+10:00', 0, '2026-03-30', '2026-04-12'],
  ]) {
    const keys = calendarFortnight(new Date(now), 'Australia/Sydney', offset).flat().map(date => date.toISOString().slice(0, 10))
    assert.equal(keys[0], first)
    assert.equal(keys[13], last)
    assert.equal(new Set(keys).size, 14)
  }
})

test('initial calendar markup is stable before the browser clock is available', () => {
  const html = renderToString(React.createElement(AgentCalendarPanel, { events: [], timeZone: 'Australia/Sydney' }))
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /Loading calendar/)
  assert.doesNotMatch(html, /No events|upcoming client visit/)
})
