import assert from 'node:assert/strict'
import test from 'node:test'

import { replaceCalendarBlockoutEvents } from '../src/lib/availabilityCalendarClient.ts'

test('saved block-outs immediately replace stale calendar block-out events', () => {
  const events = [
    {
      id: 'booking-one',
      kind: 'booking',
      title: 'Client visit',
      startsAt: '2026-09-03T02:00:00.000Z',
      endsAt: '2026-09-03T02:10:00.000Z',
    },
    {
      id: 'blockout-old',
      kind: 'blockout',
      title: 'Old block-out',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T07:00:00.000Z',
    },
  ]
  const blocks = [{
    id: 'manual',
    assigneeId: 'melb_primary',
    label: 'Manual block-out',
    startsAt: '2026-09-03T06:30:00.000Z',
    endsAt: '2026-09-03T07:34:00.000Z',
    active: true,
  }]

  const result = replaceCalendarBlockoutEvents(events, blocks)

  assert.equal(result.some((event) => event.id === 'blockout-old'), false)
  assert.equal(result.some((event) => event.id === 'booking-one'), true)
  assert.deepEqual(result.find((event) => event.id === 'blockout-manual'), {
    id: 'blockout-manual',
    kind: 'blockout',
    title: 'Manual block-out',
    startsAt: '2026-09-03T06:30:00.000Z',
    endsAt: '2026-09-03T07:34:00.000Z',
    description: 'Manual block-out added by the agent or admin.',
  })
})

test('inactive and invalid block-outs are omitted from the calendar', () => {
  const blocks = [
    { id: 'inactive', assigneeId: 'melb_primary', label: '', startsAt: '2026-09-03T06:30:00.000Z', endsAt: '2026-09-03T07:30:00.000Z', active: false },
    { id: 'reversed', assigneeId: 'melb_primary', label: '', startsAt: '2026-09-03T07:30:00.000Z', endsAt: '2026-09-03T06:30:00.000Z', active: true },
  ]

  assert.deepEqual(replaceCalendarBlockoutEvents([], blocks), [])
})
