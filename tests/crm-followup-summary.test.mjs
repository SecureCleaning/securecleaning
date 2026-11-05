import test from 'node:test'
import assert from 'node:assert/strict'
import { followUpSummary } from '../src/lib/crmFollowUpSummary.ts'

const sent = { status: 'sent', sentAt: '2026-09-28T01:00:00Z', templateId: 'outreach' }
const templates = [{ id: 'outreach', name: 'Purchased lead - first outreach' }]
test('reminder describes sent template without leaking imported enquiry notes', () => {
  assert.equal(followUpSummary({ communications: [sent], quotes: [], notes: 'Long private enquiry' }, templates), 'Follow up: Purchased lead - first outreach')
})
test('newer failed email does not replace the last sent activity', () => {
  const communications = [sent, { status: 'rejected', sentAt: '2026-09-29T01:00:00Z', templateId: 'other' }]
  assert.equal(followUpSummary({ communications, quotes: [] }, templates), 'Follow up: Purchased lead - first outreach')
})
test('most recent quote or email determines the summary without mutating histories', () => {
  const item = { communications: [sent], quotes: [{ finalQuoteSentAt: '2026-09-29T01:00:00Z' }] }
  assert.equal(followUpSummary(item, templates), 'Follow up sent quote')
  item.quotes[0].finalQuoteSentAt = '2026-09-27T01:00:00Z'
  assert.equal(followUpSummary(item, templates), 'Follow up: Purchased lead - first outreach')
})
test('manual reminders and missing templates use honest fallback labels', () => {
  assert.equal(followUpSummary({ communications: [], quotes: [] }, []), 'Client follow-up')
  assert.equal(followUpSummary({ communications: [sent], quotes: [] }, []), 'Follow up client email')
})
test('recorded reminder source wins over unrelated email history', () => {
  const item = { communications: [sent], quotes: [{ finalQuoteSentAt: '2026-10-01T00:00:00Z' }] }
  assert.equal(followUpSummary({ ...item, followUpSource: 'inspection' }, templates), 'Follow up after inspection')
  assert.equal(followUpSummary({ ...item, followUpSource: 'inspection_cancelled' }, templates), 'Rebook cancelled inspection')
  assert.equal(followUpSummary({ ...item, followUpSource: 'quote' }, templates), 'Follow up sent quote')
  assert.equal(followUpSummary({ ...item, followUpSource: 'manual' }, templates), 'Client follow-up (manually scheduled)')
})
test('email reminder label uses its own message, not an unrelated later send', () => {
  const item = { followUpSource: 'email', followUpSourceId: 'first', communications: [{ ...sent, id: 'first' }, { ...sent, id: 'second', sentAt: '2026-10-02T00:00:00Z', templateId: 'other' }], quotes: [{ finalQuoteSentAt: '2026-10-01T00:00:00Z' }] }
  assert.equal(followUpSummary(item, templates), 'Follow up: Purchased lead - first outreach')
  assert.equal(followUpSummary({ ...item, followUpSourceId: 'removed' }, templates), 'Follow up client email')
})
