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
  assert.match(roomAdmin, /Fixed price \(\$\)/)
  assert.match(roomAdmin, /defaultSelected/)
  assert.match(roomAdmin, /step="0\.01" inputMode="decimal"/)
  assert.match(roomAdmin, /Global shared task rates/)
  assert.match(roomAdmin, /Add, edit or remove shared rates here/)
  assert.match(roomAdmin, /Add global rate/)
  assert.match(roomAdmin, /removeGlobalTaskRate/)
  assert.match(roomAdmin, /Pricing source/)
  assert.match(roomAdmin, /Custom for this task/)
  assert.match(roomAdmin, /Minutes \/ sqm/)
  assert.match(roomAdmin, /hourly rate/)
  assert.match(roomAdmin, /Mopping frequency/)
  assert.match(quoteEditor, /Scheduled task extras \(amortised\)/)
  assert.match(quoteEditor, /Tasks included in this room/)
  assert.match(quoteEditor, /formatTaskCurrency/)
  assert.match(quoteEditor, /for this area/)
  assert.match(quoteEditor, /Recalculate with current defaults/)
  assert.match(quoteEditor, /Current pricing defaults loaded/)
  assert.match(roomAdmin, /Room-specific allowances are disabled/)
  assert.doesNotMatch(roomAdmin, /Additional price per room \/ visit/)
  assert.match(quoteEditor, /Managed in Pricing &amp; Rooms and applied wherever mopping is selected/)
  assert.match(quoteEditor, /scopeTaskSelections/)
  assert.match(quoteEditor, /ROOM_TASK_CADENCE_OPTIONS/)
  assert.match(quoteEditor, /Units in each room/)
  assert.match(quoteEditor, /Units included in base/)
  assert.match(quoteEditor, /Current contribution/)
  assert.match(clientScope, /getRoomTaskCadenceLabel\(task\.cadence\)/)

  const scopeBuilder = source('src/lib/scopeOfWorks.ts')
  assert.match(scopeBuilder, /getWorkflowRoomMetricFields\(room, roomTypeConfig\)/)
})

test('pricing configuration mutations remain manager-only and reject cross-origin or oversized writes', () => {
  for (const path of ['src/app/api/admin/pricing/route.ts', 'src/app/api/admin/room-types/route.ts']) {
    const route = source(path)
    assert.match(route, /isAuthorizedAdminRequest\(request, 'manager'\)/)
    assert.match(route, /rejectCrossOriginMutation\(request\)/)
    assert.match(route, /rejectLargePayload\(request/)
  }
})
