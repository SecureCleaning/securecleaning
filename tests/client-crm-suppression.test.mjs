import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ClientEmailStatus from '../src/components/admin/ClientEmailStatus.tsx'

const suppression = {
  reason: 'unsubscribed', source: 'unsubscribe_link',
  createdAt: '2026-10-08T04:31:55.177539+00:00',
  updatedAt: '2026-10-08T04:31:55.177539+00:00',
}
const render = (lead) => renderToStaticMarkup(React.createElement(ClientEmailStatus, { lead }))

test('shows recorded unsubscribe source and Australian local time without claiming who clicked', () => {
  const html = render({ suppressed: true, suppression })
  assert.match(html, /Unsubscribed from marketing emails/)
  assert.match(html, /Email unsubscribe link/)
  assert.match(html, /8 Oct 2026/)
  assert.match(html, /3:31 pm/)
  assert.match(html, /CRM outreach is disabled/)
  assert.doesNotMatch(html, /Last updated/)
})

test('distinguishes other suppression reasons and retains first recorded and update dates', () => {
  for (const [reason, label] of [['hard_bounce', 'permanent delivery failure'], ['complaint', 'spam complaint'], ['manual', 'suppressed manually']]) {
    const html = render({ suppressed: true, suppression: { ...suppression, reason, source: 'client_crm', updatedAt: '2026-10-09T04:31:55Z' } })
    assert.match(html, new RegExp(label))
    assert.match(html, /First recorded/)
    assert.match(html, /Last updated/)
    assert.doesNotMatch(html, /Unsubscribed from/)
  }
})

test('handles missing, unknown and invalid metadata without implying consent or exposing raw sources', () => {
  assert.equal(render({ suppressed: false, suppression: null }), '')
  assert.match(render({ suppressed: true, suppression: null }), /details unavailable/)
  const html = render({ suppressed: true, suppression: { reason: 'unknown', source: 'private-internal-value', createdAt: 'invalid', updatedAt: '' } })
  assert.match(html, /reason unavailable/)
  assert.match(html, /Date unavailable/)
  assert.doesNotMatch(html, /private-internal-value/)
})
