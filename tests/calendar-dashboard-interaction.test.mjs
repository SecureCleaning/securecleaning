import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AgentCalendarPanel from '../src/components/availability/AgentCalendarPanel.tsx'

 test('dashboard calendar renders every appointment as a button on its Australian local date', () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    id: `booking-${i}`, kind: i === 0 ? 'sale_inspection' : 'booking', title: `Appointment ${i}`,
    startsAt: '2026-10-01T23:00:00Z', endsAt: '2026-10-01T23:30:00Z',
  }))
  const html = renderToStaticMarkup(React.createElement(AgentCalendarPanel, {
    events, assigneeId: 'agent-one', timeZone: 'Australia/Sydney',
    dashboardDays: [{ key: '2026-10-02', label: 'Fri', dateLabel: '2 Oct', isToday: true }],
    bookingApiPath: '/api/availability-agent/agent-one/bookings',
  }))
  assert.equal((html.match(/<button/g) || []).length, 6)
  assert.match(html, /Appointment 5/)
  assert.match(html, /9:00 am/)
  assert.doesNotMatch(html, /No events/)
  assert.match(html, /\/availability\/quoters\/agent-one/)
})

test('availability cards omit long area lists and next-week navigation preserves dashboard context', () => {
  const html = renderToStaticMarkup(React.createElement(AgentCalendarPanel, {
    events: [{ id: 'window', kind: 'availability', title: 'Thursday', subtitle: 'Sydney North West, Sydney South', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-01T06:00:00Z' }],
    assigneeId: 'agent-one', timeZone: 'Australia/Sydney', dashboardWeekOffset: 1,
    dashboardDays: [{ key: '2026-10-01', label: 'Thu', dateLabel: '1 Oct', isToday: false }],
  }))
  assert.doesNotMatch(html, /Sydney North West/)
  assert.match(html, /Thursday/)
  assert.match(html, /\?week=2/)
  assert.match(html, /Previous week/)
  assert.match(html, /This week/)
})
