import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path) => readFileSync(`${root}/${path}`, 'utf8')

test('agent portal has a dedicated entry point and portal navigation', () => {
  const entry = read('src/app/agent/page.tsx')
  const nav = read('src/components/availability/AvailabilityAgentNav.tsx')
  const adminPage = read('src/lib/adminPage.tsx')
  assert.match(entry, /Secure Cleaning Agent Portal/)
  assert.match(entry, /Open agent portal/)
  assert.match(nav, /href="\/agent"/)
  assert.match(nav, /window\.location\.assign\('\/agent'\)/)
  assert.match(adminPage, /href="\/agent"/)
  assert.equal(existsSync(`${root}/src/app/availability/login/page.tsx`), false)
})

test('calendar badge and private feed include booked client visits only', () => {
  const panel = read('src/components/availability/AgentCalendarPanel.tsx')
  const feed = read('src/app/api/availability-agent/[assigneeId]/feed/route.ts')
  assert.match(panel, /event\.kind === 'booking'/)
  assert.match(panel, /upcoming client visit/)
  assert.match(feed, /includeAvailability: false/)
  assert.match(feed, /filter\(\(event\) => event\.kind === 'booking'\)/)
})

test('quote workbench hides native disclosure arrows and separates note audiences', () => {
  const editor = read('src/components/admin/QuoteWorkflowEditor.tsx')
  const quoteDashboard = read('src/components/availability/AgentQuoteDashboard.tsx')
  const roomAdmin = read('src/components/admin/RoomTypeConfigAdmin.tsx')
  assert.match(quoteDashboard, /Create new quote/)
  assert.match(editor, /Add saved field/)
  assert.match(editor, /Blank field/)
  assert.match(editor, /removeMetricField/)
  assert.match(roomAdmin, /Internal help \(10–15 words\)/)
  assert.match(roomAdmin, /maxLength=\{120\}/)
  assert.match(editor, /\[&::\-webkit-details-marker\]:hidden/)
  assert.match(editor, /Inspection summary[\s\S]*Internal only/)
  assert.match(editor, /Scope summary[\s\S]*Client visible/)
  const editableSection = editor.slice(editor.indexOf('<h2 className="text-xl font-bold mb-4"'))
  for (const redundantLabel of ['Access / security notes', 'Parking / arrival notes', 'Alarm / key / lockup notes', 'Client commentary']) {
    assert.doesNotMatch(editableSection, new RegExp(redundantLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
