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
  assert.match(dashboard, /aria-label="Admin shortcuts"/)
  for (const href of ['/admin/availability', '/admin/calendar']) {
    assert.match(dashboard, new RegExp(`href="${href}"`))
  }
  assert.match(dashboard, /href="\/admin\/clients\?view=sites"/)
  assert.match(dashboard, /Quick access/)
  assert.match(dashboard, /Client sites/)
  assert.match(dashboard, /Contract products/)
  assert.match(dashboard, /Product sales/)
  assert.doesNotMatch(dashboard, /href="\/admin\/sites"/)
  assert.match(dashboard, /Inspection availability/)
  assert.doesNotMatch(dashboard, /href="\/admin\/(?:content|pricing)"/)
})

test('dashboard summaries flow into a compact two-column workspace and preserve schedule editing', () => {
  assert.doesNotMatch(reporting, /ReportingTrendNotes|BreakdownCard/)
  assert.doesNotMatch(dashboard, /<OverdueWorkflowPanel|<DispatchBoard|<UpcomingInspectionsPanel/)
  assert.match(dashboard, /Operations overview/)
  assert.match(dashboard, /xl:grid-cols-\[minmax\(0,1fr\)_22rem\]/)
  assert.match(dashboard, /xl:sticky xl:top-4/)
  assert.match(dashboard, /flex min-w-\[10rem\] flex-wrap gap-1\.5/)
  assert.match(dashboard, /Agent schedule/)
  assert.match(dashboard, /role="status" aria-live="polite"/)
  assert.match(dashboard, /role="alert" aria-live="assertive"/)
  assert.match(dashboard, /role="tablist"/)
  assert.match(dashboard, /aria-selected=\{isActive\}/)
  assert.match(dashboard, /tabIndex=\{-1\}/)
  assert.match(dashboard, /workArea\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(followUp, /role="status" aria-live="polite"/)
  assert.match(followUp, /role="alert"/)
})
