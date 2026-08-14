import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { toPublicQuoteDocument } = await import('../src/lib/publicQuoteDocument.ts')
const { getFinalQuoteReadiness, isEditableFirmQuoteStatus } = await import('../src/lib/finalQuoteWorkflow.ts')
const { getSendFailureDisposition, resolveFinalQuoteRecipient } = await import('../src/lib/finalQuoteSendPolicy.ts')

test('normal workflow save states exclude sent, accepted, and unknown values', () => {
  assert.equal(isEditableFirmQuoteStatus('draft'), true)
  assert.equal(isEditableFirmQuoteStatus('reviewed'), true)
  assert.equal(isEditableFirmQuoteStatus('sent'), false)
  assert.equal(isEditableFirmQuoteStatus('accepted'), false)
  assert.equal(isEditableFirmQuoteStatus('unknown'), false)
  const adminSave = readFileSync(`${root}/src/app/api/admin/quotes/[ref]/workflow/route.ts`, 'utf8')
  const agentSave = readFileSync(`${root}/src/app/api/availability-agent/[assigneeId]/quotes/[ref]/workflow/route.ts`, 'utf8')
  assert.match(adminSave, /isEditableFirmQuoteStatus/)
  assert.match(agentSave, /isEditableFirmQuoteStatus/)
  assert.doesNotMatch(adminSave, /saveQuoteWorkflowByRef\([^)]*status: 'sent'/)
})

test('final quote readiness requires review and a positive final price', () => {
  const draft = { status: 'draft', finalPerVisit: '', roomItems: [], revisedInputs: { contactName: '', email: '' } }
  assert.equal(getFinalQuoteReadiness(draft).ready, false)
  assert.equal(getFinalQuoteReadiness({ ...draft, status: 'reviewed', finalPerVisit: '125', roomItems: [{}], revisedInputs: { contactName: 'Client', email: 'client@example.com' } }).ready, true)
})

test('protected send routes retain authorization, readiness, final variant, and duplicate-send claims', () => {
  for (const relative of [
    'src/app/api/admin/quotes/[ref]/send/route.ts',
    'src/app/api/availability-agent/[assigneeId]/quotes/[ref]/send/route.ts',
  ]) {
    const source = readFileSync(`${root}/${relative}`, 'utf8')
    assert.match(source, /isAuthorized(?:Admin|AvailabilityAgent)Request/)
    assert.match(source, /getFinalQuoteReadiness/)
    assert.match(source, /createFinalQuoteSendAttempt/)
    assert.match(source, /completeFinalQuoteSend/)
    assert.match(source, /documentVariant: 'final'/)
  }
})

test('public documents select explicit remote-review and final variants', () => {
  const data = readFileSync(`${root}/src/lib/quoteWorkflowData.ts`, 'utf8')
  assert.match(data, /variant: QuoteDocumentVariant = 'remote_review'/)
  assert.match(data, /if \(variant === 'final'\)/)
  assert.match(data, /if \(!quote\.finalDocument\) return null/)
  assert.match(data, /createDefaultFirmQuoteDraft\(quote\.inputs/)
})

test('public quote DTO excludes workflow, staff, contact, configuration, and send metadata in both variants', () => {
  const record = {
    quoteRef: 'SC-20260814-TEST',
    inputs: {
      businessName: 'Private business', contactName: 'Private person', email: 'private@example.com', phone: '0400000000',
      address: 'Private address', notes: 'Private notes', city: 'melbourne', premisesType: 'office', floorArea: 100,
      floors: 1, frequency: 'weekly', timePreference: 'business_hours', roomScope: [],
      addOns: { bathrooms: 1, kitchens: 1, glassCleaningRequired: false, highTouchDisinfection: false, carpetSteam: false, consumables: false },
    },
    result: { totalLow: 100, totalHigh: 120, carpetSteamSeparate: false, breakdown: { internalLabour: 99 }, estimatedHours: 8 },
    inspectionReport: { riskNotes: 'internal' }, firmQuoteDraft: { serviceCommentary: 'internal' },
    finalDocument: { reviewedBy: { name: 'Staff' } }, roomTypeConfig: { secret: true },
    sentAt: 'now', sentBy: { name: 'Staff' }, sentTo: 'private@example.com',
  }
  for (const variant of ['remote_review', 'final']) {
    const dto = toPublicQuoteDocument(record, variant)
    assert.deepEqual(Object.keys(dto).sort(), ['inputs', 'quoteRef', 'result', 'variant'])
    const serialized = JSON.stringify(dto)
    for (const forbidden of ['inspectionReport', 'firmQuoteDraft', 'finalDocument', 'roomTypeConfig', 'sentAt', 'sentBy', 'sentTo', 'email', 'phone', 'address', 'notes', 'reviewedBy', 'breakdown', 'estimatedHours', 'internalLabour']) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked from ${variant}`)
    }
  }
})

test('send finalization persists sent metadata and audit atomically in the migration RPC', () => {
  const migration = readFileSync(`${root}/supabase/final_quote_scope_workflow_migration.sql`, 'utf8')
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.finalize_final_quote_send/)
  assert.match(migration, /SET status = 'sent'/)
  assert.match(migration, /final_quote_sent_at = p_sent_at/)
  assert.match(migration, /final_quote_sent_by = attempt\.actor/)
  assert.match(migration, /final_quote_sent_to = attempt\.recipient/)
  assert.match(migration, /INSERT INTO public\.admin_audit_log/)
  assert.match(migration, /GRANT EXECUTE .* TO service_role/)
})

test('send policy locks the reviewed recipient and never retries an uncertain provider call', () => {
  assert.deepEqual(resolveFinalQuoteRecipient(' Client@Example.com ', 'client@example.com'), {
    authoritative: 'client@example.com', matches: true,
  })
  assert.equal(resolveFinalQuoteRecipient('client@example.com', 'attacker@example.com').matches, false)
  assert.deepEqual(getSendFailureDisposition(false, false), {
    markFailed: true, failureStage: 'internal_before_provider', reconciliationRequired: false, providerAccepted: false, status: 500,
    error: 'The final quote could not be sent. Please retry or contact support.',
  })
  assert.equal(getSendFailureDisposition(true, false).markFailed, false)
  assert.equal(getSendFailureDisposition(true, false).reconciliationRequired, true)
  assert.equal(getSendFailureDisposition(true, true).providerAccepted, true)
  assert.deepEqual(getSendFailureDisposition(true, false, true), {
    markFailed: true, failureStage: 'provider_rejected', reconciliationRequired: false,
    providerAccepted: false, status: 502, error: 'The email provider rejected this delivery. Review the address and retry.',
  })
})

test('privileged reconciliation is manager-only, audited, and supports accepted or rejected evidence', () => {
  const route = readFileSync(`${root}/src/app/api/admin/quotes/[ref]/send/reconcile/route.ts`, 'utf8')
  assert.match(route, /isAuthorizedAdminRequest\(request, 'manager'\)/)
  assert.match(route, /confirmed_rejected/)
  assert.match(route, /confirmed_accepted/)
  assert.match(route, /evidence\.length < 10/)
  const migration = readFileSync(`${root}/supabase/final_quote_scope_workflow_migration.sql`, 'utf8')
  assert.match(migration, /FUNCTION public\.reconcile_final_quote_send/)
  assert.match(migration, /final_quote_send_reconciled/)
  assert.match(migration, /status IN \('claimed', 'provider_accepted'\)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reconcile_final_quote_send/)
  assert.match(migration, /GRANT EXECUTE .* TO service_role/)
  assert.match(migration, /final_quote_sent_by = attempt\.actor/)
  assert.match(migration, /final_quote_sent_at = COALESCE\(attempt\.provider_accepted_at, p_reconciled_at\)/)
  assert.match(migration, /'actor', attempt\.actor/)
  assert.match(migration, /'reconciledBy', p_actor/)
  const page = readFileSync(`${root}/src/app/admin/quotes/[ref]/page.tsx`, 'utf8')
  assert.match(page, /identity\?\.role === 'manager' \|\| identity\?\.role === 'owner'/)
  const editor = readFileSync(`${root}/src/components/admin/QuoteWorkflowEditor.tsx`, 'utf8')
  assert.match(editor, /canReconcileDelivery = false/)
})

test('final customer documents remove provisional and inspection-booking actions', () => {
  const quoteView = readFileSync(`${root}/src/components/quote/QuoteResultView.tsx`, 'utf8')
  const scopePage = readFileSync(`${root}/src/app/scope/[ref]/page.tsx`, 'utf8')
  assert.match(quoteView, /documentVariant === 'final' \? 'Your Final Quote'/)
  assert.match(quoteView, /documentVariant !== 'final' \? <Link/)
  assert.match(scopePage, /variant !== 'final' \? <Link/)
  assert.match(scopePage, /reviewed final scope/)
})
