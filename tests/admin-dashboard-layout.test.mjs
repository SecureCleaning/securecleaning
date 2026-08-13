import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dashboard = readFileSync(new URL('../src/components/admin/AdminDashboard.tsx', import.meta.url), 'utf8')
const reporting = readFileSync(new URL('../src/components/admin/ReportingPanel.tsx', import.meta.url), 'utf8')
const followUp = readFileSync(new URL('../src/components/admin/CrmFollowUpPanel.tsx', import.meta.url), 'utf8')

test('admin dashboard keeps quotes first and removes dead-end local work areas', () => {
  assert.match(dashboard, /\{ key: 'quotes', label: 'Quotes' \}/)
  assert.match(dashboard, /\{ key: 'bookings', label: 'Bookings' \}/)
  assert.match(dashboard, /\{ key: 'leads', label: 'Leads' \}/)
  assert.doesNotMatch(dashboard, /key: 'clients'/)
  assert.doesNotMatch(dashboard, /key: 'sites'/)
  assert.doesNotMatch(dashboard, /key: 'operators'/)
  assert.doesNotMatch(dashboard, /key: 'settings'/)
  assert.match(dashboard, /useState<TabKey>\('quotes'\)/)
  assert.ok(dashboard.indexOf('Recent Quotes') < dashboard.indexOf('section="quotes"'))
  assert.match(dashboard, /section="leads"[\s\S]*onLeadUpdated=/)
})

test('admin shortcuts resolve to focused management routes with accurate labels', () => {
  assert.match(dashboard, /<nav className="flex flex-wrap gap-2" aria-label="Admin shortcuts">/)
  for (const href of ['/admin/sites', '/admin/availability', '/admin/calendar']) {
    assert.match(dashboard, new RegExp(`href="${href}"`))
  }
  assert.match(dashboard, /Inspection agents &amp; availability/)
  assert.doesNotMatch(dashboard, /href="\/admin\/(?:content|pricing)"/)
})

test('dashboard summaries are compact and preserve schedule editing', () => {
  assert.doesNotMatch(reporting, /ReportingTrendNotes|BreakdownCard/)
  assert.doesNotMatch(dashboard, /<OverdueWorkflowPanel|<DispatchBoard|<UpcomingInspectionsPanel/)
  assert.match(dashboard, /Edit agent schedule/)
  assert.match(dashboard, /role="status" aria-live="polite"/)
  assert.match(dashboard, /role="alert" aria-live="assertive"/)
  assert.match(dashboard, /aria-pressed=\{isActive\}/)
  assert.match(dashboard, /tabIndex=\{-1\}/)
  assert.match(dashboard, /workArea\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(followUp, /role="status" aria-live="polite"/)
  assert.match(followUp, /role="alert"/)
})
