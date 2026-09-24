import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  QUOTE_STATUS_ORDER,
  compareQuoteStatuses,
  getQuoteStatusEditOptions,
  getQuoteStatusOptions,
  matchesQuoteSearch,
} from '../src/lib/quoteList.ts'

const adminDashboard = readFileSync(new URL('../src/components/admin/AdminDashboard.tsx', import.meta.url), 'utf8')
const agentDashboard = readFileSync(new URL('../src/components/availability/AgentQuoteDashboard.tsx', import.meta.url), 'utf8')

test('quote statuses use the requested business priority and can be reversed', () => {
  assert.deepEqual(QUOTE_STATUS_ORDER, ['pending', 'sent', 'accepted', 'expired', 'declined'])

  const mixed = ['declined', 'accepted', 'pending', 'expired', 'sent']
  assert.deepEqual(mixed.toSorted((left, right) => compareQuoteStatuses(left, right, 'priority')), QUOTE_STATUS_ORDER)
  assert.deepEqual(
    mixed.toSorted((left, right) => compareQuoteStatuses(left, right, 'reverse')),
    [...QUOTE_STATUS_ORDER].reverse(),
  )
})

test('unknown statuses remain available after the standard statuses', () => {
  assert.deepEqual(
    getQuoteStatusOptions(['sent', 'archived']),
    ['pending', 'sent', 'accepted', 'expired', 'declined', 'archived'],
  )
})

test('a legacy status can display without becoming an allowed transition for other quotes', () => {
  assert.deepEqual(
    getQuoteStatusEditOptions('archived'),
    ['pending', 'sent', 'accepted', 'expired', 'declined', 'archived'],
  )
  assert.deepEqual(
    getQuoteStatusEditOptions('pending'),
    ['pending', 'sent', 'accepted', 'expired', 'declined'],
  )
  assert.equal(getQuoteStatusEditOptions('pending').includes('archived'), false)
})

test('quote search covers company, client, suburb and postcode', () => {
  const quote = {
    businessName: 'Harbour Dental',
    contactName: 'Mina Patel',
    suburb: 'Parramatta',
    postcode: '2150',
  }

  for (const search of ['harbour', 'MINA', 'matta', '2150']) {
    assert.equal(matchesQuoteSearch(quote, search), true)
  }
  assert.equal(matchesQuoteSearch(quote, 'SC-20260924-ABC'), false)
  assert.equal(matchesQuoteSearch(quote, 'Sydney'), false)
})

test('owner and agent quote boards expose the same search and status controls', () => {
  const placeholder = 'placeholder="Company, client name, suburb or postcode"'
  for (const source of [adminDashboard, agentDashboard]) {
    assert.match(source, /Search quotes/)
    assert.match(source, /All statuses/)
    assert.match(source, new RegExp(placeholder))
    assert.match(source, /aria-sort=/)
    assert.match(source, /compareQuoteStatuses/)
    assert.match(source, /matchesQuoteSearch/)
  }

  assert.doesNotMatch(adminDashboard, /placeholder="Reference, business or city"/)
  assert.doesNotMatch(agentDashboard, /placeholder="Reference, company, suburb or postcode"/)
})
