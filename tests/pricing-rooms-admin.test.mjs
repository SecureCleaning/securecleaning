import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('pricing and rooms share one admin destination with quote-wide rules kept advanced', () => {
  const nav = source('src/components/admin/AdminNav.tsx')
  const roomPage = source('src/app/admin/room-types/page.tsx')
  const oldPricingPage = source('src/app/admin/pricing/page.tsx')

  assert.match(nav, /Pricing & Rooms/)
  assert.doesNotMatch(nav, /href: '\/admin\/pricing'/)
  assert.match(roomPage, /Advanced quote-wide rules/)
  assert.match(roomPage, /<PricingAdmin initialConfig=\{pricingConfig\} embedded/)
  assert.match(oldPricingPage, /redirect\('\/admin\/room-types'\)/)
})

test('room tasks, mopping, and quote extras expose cadence controls and scope output', () => {
  const roomAdmin = source('src/components/admin/RoomTypeConfigAdmin.tsx')
  const quoteEditor = source('src/components/admin/QuoteWorkflowEditor.tsx')
  const clientScope = source('src/app/scope/[ref]/page.tsx')

  assert.match(roomAdmin, /Client scope tasks/)
  assert.match(roomAdmin, /Price when done/)
  assert.match(roomAdmin, /Mopping frequency/)
  assert.match(roomAdmin, /Rooms that had no base price have been prefilled/)
  assert.match(quoteEditor, /Scheduled task extras \(amortised\)/)
  assert.match(quoteEditor, /ROOM_TASK_CADENCE_OPTIONS/)
  assert.match(clientScope, /getRoomTaskCadenceLabel\(task\.cadence\)/)
})

test('pricing configuration mutations remain manager-only and reject cross-origin or oversized writes', () => {
  for (const path of ['src/app/api/admin/pricing/route.ts', 'src/app/api/admin/room-types/route.ts']) {
    const route = source(path)
    assert.match(route, /isAuthorizedAdminRequest\(request, 'manager'\)/)
    assert.match(route, /rejectCrossOriginMutation\(request\)/)
    assert.match(route, /rejectLargePayload\(request/)
  }
})
