import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('admin navigation consolidates sites under clients and keeps secondary tools compact', () => {
  const nav = source('src/components/admin/AdminNav.tsx')
  const shell = source('src/components/admin/AdminShell.tsx')

  assert.match(nav, /label: 'Clients & Sites'/)
  assert.doesNotMatch(nav, /href: '\/admin\/sites'/)
  assert.match(nav, /const primaryTabs/)
  assert.match(nav, /const secondaryTabs/)
  assert.match(nav, /<details className="group relative">/)
  assert.match(nav, />\s*More /)
  assert.match(nav, /flex flex-wrap items-center/)
  assert.doesNotMatch(nav, /overflow-x-auto|min-w-max/)
  assert.match(shell, /items-start/)
})

test('legacy sites destination redirects into the combined Clients and Sites area', () => {
  const oldSitesPage = source('src/app/admin/sites/page.tsx')
  const clientsPage = source('src/app/admin/clients/page.tsx')
  const workspace = source('src/components/admin/ClientCrmWorkspace.tsx')
  const sitesManager = source('src/components/admin/SitesManager.tsx')

  assert.match(oldSitesPage, /redirect\('\/admin\/clients\?view=sites'\)/)
  assert.match(clientsPage, /searchParams\?\.view === 'sites'/)
  assert.match(clientsPage, /<SitesManager initialSites=\{await getSites\(\)\} allowCreate=\{false\}/)
  assert.match(clientsPage, /<ClientCrmWorkspace initialOpportunityId=\{opportunityId\} showSitesLink/)
  assert.match(workspace, /href="\/admin\/clients\?view=sites"/)
  assert.match(sitesManager, /Add through Client CRM/)
  assert.match(sitesManager, /Linked to Client CRM/)
})

test('online quote and booking workflows retain the required client-to-site handoff', () => {
  const quoteRoute = source('src/app/api/quote/route.ts')
  const bookingRoute = source('src/app/api/booking/route.ts')
  const crmData = source('src/lib/clientCrmData.ts')

  assert.match(quoteRoute, /resolvePublicSubmissionClient/)
  assert.match(quoteRoute, /syncOnlineQuoteCrmOpportunity/)
  assert.match(crmData, /p_site_id: null/)
  assert.match(bookingRoute, /findMatchingSiteForBooking/)
  assert.match(bookingRoute, /createSiteFromBooking/)
  assert.match(bookingRoute, /syncBookingCrmOpportunity/)
  assert.match(bookingRoute, /site_id: matchedSite\?\.id \?\? null/)
})
