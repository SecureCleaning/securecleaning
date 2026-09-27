import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildDashboardWeek,
  quoteRequiresFollowUp,
  saleRequiresInduction,
} from '../src/lib/agentDashboardPolicy.ts'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('sent quotes remain in follow-up until won or lost', () => {
  assert.equal(quoteRequiresFollowUp({ status: 'sent', followUpStatus: 'new' }), true)
  assert.equal(quoteRequiresFollowUp({ status: 'sent', followUpStatus: 'contacted' }), true)
  assert.equal(quoteRequiresFollowUp({ status: 'sent', followUpStatus: 'won' }), false)
  assert.equal(quoteRequiresFollowUp({ status: 'sent', followUpStatus: 'lost' }), false)
  assert.equal(quoteRequiresFollowUp({ status: 'pending', followUpStatus: 'new' }), false)
})

test('product sales need induction while ready or scheduled', () => {
  assert.equal(saleRequiresInduction('inspection_ready'), true)
  assert.equal(saleRequiresInduction('inspection_scheduled'), true)
  for (const status of ['draft', 'deposit_due', 'agreement_pending', 'completed', 'cancelled']) {
    assert.equal(saleRequiresInduction(status), false)
  }
})

test('dashboard week contains seven local days and groups events by agent timezone', () => {
  const events = [{
    id: 'event-1',
    kind: 'booking',
    title: 'Sydney appointment',
    startsAt: '2026-09-27T14:30:00.000Z',
    endsAt: '2026-09-27T15:30:00.000Z',
  }]
  const week = buildDashboardWeek(events, new Date('2026-09-27T22:00:00.000Z'), 'Australia/Sydney')
  assert.equal(week.length, 7)
  assert.equal(week[0].key, '2026-09-28')
  assert.equal(week[0].isToday, true)
  assert.equal(week[0].events[0].id, 'event-1')
  assert.equal(week[6].key, '2026-10-04')
})

test('agent dashboard revalidates identity and scopes every data source', () => {
  const route = source('src/app/availability/dashboard/[assigneeId]/page.tsx')
  const data = source('src/lib/agentDashboard.ts')
  assert.match(route, /account\?\.active/)
  assert.match(route, /account\.role === 'agent'/)
  assert.match(route, /account\.username === identity\?\.username/)
  assert.match(route, /account\.availabilityAssigneeId === assigneeId/)
  assert.match(data, /quoteMatchesAgentServiceRegion/)
  assert.match(data, /getCrmAssignedQuoteOpportunities/)
  assert.match(data, /\.eq\('assigned_staff_id', actor\.id\)/)
  assert.match(data, /\.in\('product_id', accessibleProductIds\)/)
})

test('login and configured agent navigation lead to the dashboard', () => {
  const login = source('src/components/availability/AvailabilityAgentLogin.tsx')
  const menus = source('src/lib/menuConfiguration.ts')
  assert.match(login, /`\/availability\/dashboard\/\$\{result\.assigneeId\}`/)
  assert.match(menus, /id: 'portal', label: 'Dashboard', href: '\/availability\/dashboard\/\{assigneeId\}'/)
})

test('navigation waits for saved settings instead of flashing default links', () => {
  const hook = source('src/lib/useNavigationMenu.ts')
  const navigation = source('src/components/navigation/ConfigurableNavigation.tsx')
  assert.match(hook, /loading: !ready/)
  assert.match(hook, /setResolved\(\{ key, settings: data \}\)/)
  assert.match(navigation, /if \(loading\) return <nav/)
  assert.match(navigation, /aria-busy="true"/)
  assert.match(navigation, /Loading navigation/)
})
