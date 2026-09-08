import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { isQuoteReference } = await import('../src/lib/quoteReference.ts')
const { getQuoteCustomerJourney, isSelfServiceQuoteJourney } = await import('../src/lib/quoteCustomerJourney.ts')

test('quote references accept the established online and agent-created formats only', () => {
  assert.equal(isQuoteReference('SC-20260908-AB12'), true)
  assert.equal(isQuoteReference('SC-20260908-D8C16026'), true)
  assert.equal(isQuoteReference('SC-20260908-ABC12'), false)
  assert.equal(isQuoteReference('SC-20260908-ABC123'), false)
  assert.equal(isQuoteReference('SC-20260908-abc1'), false)
  assert.equal(isQuoteReference('XX-20260908-AB12'), false)
})

test('persisted CRM source separates agent-created and online customer journeys', () => {
  assert.equal(getQuoteCustomerJourney('crm_manual'), 'agent_created')
  assert.equal(getQuoteCustomerJourney('online_quote'), 'online_enquiry')
  assert.equal(getQuoteCustomerJourney('migration'), 'online_enquiry')
  assert.equal(getQuoteCustomerJourney(null), 'online_enquiry')
  assert.equal(isSelfServiceQuoteJourney('online_enquiry'), true)
  assert.equal(isSelfServiceQuoteJourney('agent_created'), false)
})

test('agent-created customer views omit online-enquiry actions and provisional copy', () => {
  const quoteView = readFileSync(`${root}/src/components/quote/QuoteResultView.tsx`, 'utf8')
  const quotePage = readFileSync(`${root}/src/app/quote/[ref]/page.tsx`, 'utf8')
  const scopePage = readFileSync(`${root}/src/app/scope/[ref]/page.tsx`, 'utf8')
  const workflowData = readFileSync(`${root}/src/lib/quoteWorkflowData.ts`, 'utf8')

  assert.match(workflowData, /getQuoteCustomerJourney\(crmLinkRes\.data\?\.link_source\)/)
  assert.match(quotePage, /customerJourney=\{quote\.customerJourney\}/)
  assert.match(quoteView, /showSelfServiceActions = documentVariant !== 'final' && isSelfServiceQuoteJourney\(customerJourney\)/)
  assert.match(quoteView, /showSelfServiceActions \? <Link[\s\S]*Book Site Inspection/)
  assert.match(quoteView, /showSelfServiceActions \? <Link[\s\S]*Recalculate/)
  assert.match(quoteView, /isAgentCreated \? 'Quoted total per visit' : 'Indicative total per visit'/)
  assert.match(scopePage, /variant !== 'final' && isSelfServiceQuoteJourney\(report\.customerJourney\)/)
})

test('scope and quote endpoints share the strict reference validator', () => {
  for (const relative of [
    'src/app/scope/[ref]/page.tsx',
    'src/app/api/quote/[ref]/route.ts',
    'src/app/api/quote/[ref]/booking-prefill/route.ts',
  ]) {
    assert.match(readFileSync(`${root}/${relative}`, 'utf8'), /isQuoteReference/)
  }
})
