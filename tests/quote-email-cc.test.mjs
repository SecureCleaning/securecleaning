import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const availability = await import('../src/lib/availability.ts')
const { formatPriceRange } = await import('../src/lib/quoteEngine.ts')
const scope = await import('../src/lib/publicRoomScope.ts')
const richEmail = await import('../src/lib/richEmailServer.ts')
const sendPolicy = await import('../src/lib/finalQuoteSendPolicy.ts')

// Execute the production modules with only I/O replaced; no real database or email requests.
function loadTs(path, dependencies, env = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  vm.runInNewContext(outputText, {
    module, exports: module.exports, console: { warn() {}, error() {} }, URLSearchParams,
    process: { env },
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  }, { filename: path })
  return module.exports
}

const inputs = {
  businessName: 'Sample Office', contactName: 'Sample Client', email: 'client@example.com', phone: '0400000000',
  city: 'melbourne', suburb: 'Richmond', postcode: '3121', premisesType: 'office', floorArea: 100,
  floors: 1, flooringType: 'mixed', frequency: 'weekly', timePreference: 'business_hours',
  addOns: { bathrooms: 0, kitchens: 0, windows: 0, consumables: false, highTouchDisinfection: false, carpetSteam: false },
}
const regionalAgent = { id: 'regional', email: 'regional@example.com', active: true, city: 'melbourne' }
function configFor(agents = [regionalAgent]) {
  return {
    assignees: agents,
    zones: [{ id: 'zone', city: 'melbourne', name: 'Richmond', postcodes: ['3121'], matchTerms: ['Richmond'] }],
    weeklySlots: agents.map((agent) => ({ active: true, assigneeId: agent.id, city: agent.city, zoneIds: ['zone'] })),
  }
}

function recipientFixture(options = {}) {
  const calls = []
  const rows = { quotes: { id: 'quote-id' }, crm_opportunities: null, admin_staff_accounts: null, bookings: null, ...options.rows }
  const config = options.config ?? configFor()
  const db = {
    from(table) {
      const operations = []
      const query = {}
      for (const method of ['select', 'eq', 'neq', 'order', 'limit']) {
        query[method] = (...args) => { operations.push([method, ...args]); return query }
      }
      query.maybeSingle = async () => {
        calls.push({ table, operations })
        return { data: rows[table], error: options.errorTable === table ? new Error('Private database detail') : null }
      }
      return query
    },
  }
  const exports = loadTs('src/lib/quoteEmailRecipients.ts', {
    'server-only': {},
    '@/lib/availability': { ...availability, getAvailabilityConfig: async () => config },
    '@/lib/clientCrmQuoteAccess': { getCrmOpportunityIdForQuote: async () => options.opportunityId ?? null },
    '@/lib/supabase': { getAdminSupabase: () => db },
  })
  return { ...exports, calls }
}

test('quote CC uses authoritative CRM agent instead of booking or regional agents', async () => {
  const fixture = recipientFixture({ opportunityId: 'opportunity', rows: {
    crm_opportunities: { assigned_staff_id: 'staff' },
    admin_staff_accounts: { active: true, role: 'agent', email: ' AGENT@example.com ' },
    bookings: { inputs: { preferredInspectionAssigneeId: 'regional' } },
  } })
  assert.deepEqual([...await fixture.getQuoteAgentCc('SC-TEST', inputs)], ['agent@example.com'])
  assert.equal(fixture.calls.some((call) => call.table === 'bookings'), false)
  assert.deepEqual(fixture.calls.find((call) => call.table === 'admin_staff_accounts').operations[1], ['eq', 'id', 'staff'])
})

test('inactive assigned agents and unrelated staff roles cannot fall back to another agent', async () => {
  for (const staff of [{ active: false, role: 'agent', email: 'old@example.com' }, { active: true, role: 'manager', email: 'manager@example.com' }, null]) {
    const fixture = recipientFixture({ opportunityId: 'opportunity', rows: {
      crm_opportunities: { assigned_staff_id: 'staff' }, admin_staff_accounts: staff,
    } })
    await assert.rejects(fixture.getQuoteAgentCc('SC-TEST', inputs), /Assign an active agent/)
  }
})

test('missing profile email may use the same agent linked availability email only', async () => {
  const fixture = recipientFixture({ opportunityId: 'opportunity', rows: {
    crm_opportunities: { assigned_staff_id: 'staff' },
    admin_staff_accounts: { active: true, role: 'agent', email: '', availability_assignee_id: 'regional' },
  } })
  assert.deepEqual([...await fixture.getQuoteAgentCc('SC-TEST', inputs)], ['regional@example.com'])
  const missing = recipientFixture({ opportunityId: 'opportunity', rows: {
    crm_opportunities: { assigned_staff_id: 'staff' },
    admin_staff_accounts: { active: true, role: 'agent', email: '' },
  } })
  await assert.rejects(missing.getQuoteAgentCc('SC-TEST', inputs), /valid email address/)
})

test('latest non-cancelled inspection assignment wins over ambiguous regional routing', async () => {
  const fixture = recipientFixture({
    config: configFor([regionalAgent, { ...regionalAgent, id: 'other', email: 'other@example.com' }]),
    rows: { bookings: { inputs: { preferredInspectionAssigneeId: 'other' } } },
  })
  assert.deepEqual([...await fixture.getQuoteAgentCc('SC-TEST', inputs)], ['other@example.com'])
  const operations = fixture.calls.find((call) => call.table === 'bookings').operations
  assert.ok(operations.some((operation) => operation[0] === 'neq' && operation[1] === 'status' && operation[2] === 'cancelled'))
  assert.ok(operations.some((operation) => operation[0] === 'order' && operation[1] === 'created_at' && operation[2].ascending === false))
  assert.ok(operations.some((operation) => operation[0] === 'limit' && operation[1] === 1))
})

test('inactive or missing inspection agent never falls back to a different regional agent', async () => {
  const fixture = recipientFixture({ rows: { bookings: { inputs: { preferredInspectionAssigneeId: 'missing-agent' } } } })
  await assert.rejects(fixture.getQuoteAgentCc('SC-TEST', inputs), /Assign an active agent/)
})

test('regional fallback requires one active matching agent and ignores untrusted quote CC fields', async () => {
  const config = configFor([regionalAgent, { ...regionalAgent, id: 'inactive', active: false }, { ...regionalAgent, id: 'sydney', city: 'sydney' }])
  config.assignees.push({ ...regionalAgent, id: 'unrelated', email: 'unrelated@example.com' })
  const fixture = recipientFixture({ config })
  assert.deepEqual([...await fixture.getQuoteAgentCc('SC-TEST', { ...inputs, cc: 'attacker@example.com', preferredInspectionAssigneeId: 'sydney' })], ['regional@example.com'])
  await assert.rejects(fixture.getQuoteAgentCc('SC-TEST', { ...inputs, suburb: 'Unknown', postcode: '3999' }), /Assign an active agent/)
  const ambiguous = recipientFixture({ config: configFor([regionalAgent, { ...regionalAgent, id: 'second' }]) })
  await assert.rejects(ambiguous.getQuoteAgentCc('SC-TEST', inputs), /More than one agent/)
})

test('CC normalizes email and omits duplicates of To without excluding an agent using the admin address', async () => {
  const fixture = recipientFixture({ config: configFor([{ ...regionalAgent, email: ' INFO@securecleaning.com.au ' }]) })
  assert.deepEqual([...await fixture.getQuoteAgentCc('SC-TEST', inputs)], ['info@securecleaning.com.au'])
  assert.deepEqual([...await fixture.getQuoteAgentCc('SC-TEST', inputs, 'INFO@securecleaning.com.au')], [])
  for (const email of ['', 'invalid', 'a@example.com,b@example.com', 'a@example.com\r\nBcc:b@example.com']) {
    const invalid = recipientFixture({ config: configFor([{ ...regionalAgent, email }]) })
    await assert.rejects(invalid.getQuoteAgentCc('SC-TEST', inputs), /valid email address/)
  }
})

test('recipient lookup failure is actionable and does not expose database detail', async () => {
  const fixture = recipientFixture({ errorTable: 'quotes' })
  await assert.rejects(fixture.getQuoteAgentCc('SC-TEST', inputs), (error) => {
    assert.ok(error instanceof fixture.QuoteAgentEmailError)
    assert.match(error.message, /Could not confirm/)
    assert.doesNotMatch(error.message, /Private database detail/)
    return true
  })
})

function emailFixture(options = {}) {
  const payloads = []
  const lookups = []
  const exports = loadTs('src/lib/email.ts', {
    '@/lib/richEmailServer': richEmail,
    './quoteEngine': { formatPriceRange }, './calendarInvite': {},
    './siteUrl': { getSiteUrl: () => 'https://example.com' }, './publicRoomScope': scope,
    './availability': {}, './quoteBookingAccess': { createQuoteBookingHandoffToken: () => 'sample-token' },
    './quoteEmailRecipients': { getQuoteAgentCc: async (...args) => {
      lookups.push(args)
      if (options.lookupError) throw options.lookupError
      return options.cc ?? ['agent@example.com']
    } },
    resend: { Resend: class { emails = { send: async (payload) => {
      payloads.push(payload)
      if (options.providerThrow) throw options.providerThrow
      return options.providerResult ?? { data: { id: 'provider-id' } }
    } } } },
  }, { RESEND_API_KEY: 'local-placeholder', FROM_EMAIL: 'quotes@example.com', ADMIN_EMAIL: 'admin@example.com' })
  return { ...exports, payloads, lookups }
}

test('initial and standard resend quote send one exact client email with agent CC, no separate internal copy', async () => {
  const fixture = emailFixture()
  for (let send = 0; send < 2; send++) {
    await fixture.sendQuoteEmail('SC-TEST', inputs, { totalLow: 100, totalHigh: 120 })
    assert.equal(fixture.payloads.length, send + 1)
    const payload = fixture.payloads[send]
    assert.equal(payload.to, inputs.email)
    assert.deepEqual([...payload.cc], ['agent@example.com'])
    assert.match(payload.html, /View Quote Online/)
    assert.match(payload.html, /View Scope of Works/)
    assert.doesNotMatch(payload.subject + payload.html, /Quote Copy|Internal Quote Copy/)
  }
  assert.equal(fixture.payloads[0].html, fixture.payloads[1].html)
})

test('final/revised quote and scope link preserve client content in a single shared send', async () => {
  const fixture = emailFixture()
  const result = await fixture.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 150, high: 150, isFirm: true }, {
    subject: 'Your revised quote', messageHtml: '<p><strong>Agreed changes</strong></p>', includeConsumablesCatalogue: true,
    agentCc: ['responsible@example.com'],
  })
  assert.equal(result.id, 'provider-id')
  assert.equal(fixture.payloads.length, 1)
  assert.equal(fixture.lookups.length, 0)
  const payload = fixture.payloads[0]
  assert.equal(payload.to, inputs.email)
  assert.deepEqual([...payload.cc], ['responsible@example.com'])
  assert.equal(payload.subject, 'Your revised quote')
  assert.match(payload.html, /<strong>Agreed changes<\/strong>/)
  assert.match(payload.html, /variant=final/)
  assert.match(payload.html, /View Consumables Pricing/)
  await fixture.sendScopeOfWorksEmail('SC-TEST', inputs, 'final')
  assert.equal(fixture.payloads.length, 2)
  assert.deepEqual([...fixture.payloads[1].cc], ['agent@example.com'])
  assert.match(fixture.payloads[1].html, /variant=final/)
})

test('updated quote email uses either the authored greeting or the automatic greeting once', async () => {
  const authored = emailFixture()
  await authored.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 150, high: 150 }, {
    message: 'Hi Jim,\n\nHere is your updated quote.',
    messageHtml: '<p>Hi Jim,</p><p>Here is your updated quote.</p>',
  })
  assert.equal((authored.payloads[0].html.match(/<p>Hi Jim,<\/p>/g) ?? []).length, 1)
  assert.doesNotMatch(authored.payloads[0].html, /<p>Hi Sample Client,<\/p>/)

  const automatic = emailFixture()
  await automatic.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 150, high: 150 }, {
    message: 'Here is your updated quote.',
    messageHtml: '<p>Here is your updated quote.</p>',
  })
  assert.equal((automatic.payloads[0].html.match(/<p>Hi Sample Client,<\/p>/g) ?? []).length, 1)
})

test('direct final sends resolve CC and empty deduped CC does not send an empty provider header', async () => {
  const fixture = emailFixture({ cc: [] })
  await fixture.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 150, high: 150 })
  assert.equal(fixture.lookups.length, 1)
  assert.equal('cc' in fixture.payloads[0], false)
})

test('recipient preflight failure never contacts provider; provider rejection/uncertainty never trigger another send', async () => {
  const missing = emailFixture({ lookupError: new Error('Agent unavailable') })
  await assert.rejects(missing.sendQuoteEmail('SC-TEST', inputs, { totalLow: 100, totalHigh: 120 }), /Agent unavailable/)
  await assert.rejects(missing.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 100, high: 100 }), /Agent unavailable/)
  await assert.rejects(missing.sendScopeOfWorksEmail('SC-TEST', inputs), /Agent unavailable/)
  assert.equal(missing.payloads.length, 0)
  const rejected = emailFixture({ providerResult: { error: { name: 'validation_error', message: 'Rejected' } } })
  await assert.rejects(rejected.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 100, high: 100 }), rejected.EmailProviderRejectedError)
  assert.equal(rejected.payloads.length, 1)
  const unknown = emailFixture({ providerThrow: new Error('Timeout') })
  await assert.rejects(unknown.sendUpdatedQuoteEmail('SC-TEST', inputs, { low: 100, high: 100 }), /Timeout/)
  assert.equal(unknown.payloads.length, 1)
})

function finalRouteFixture(kind, options = {}) {
  const calls = []
  const { QuoteAgentEmailError } = recipientFixture()
  class EmailProviderRejectedError extends Error {}
  const finalDocument = { inputs, version: 2 }
  const quote = { id: 'quote-id', quoteRef: 'SC-TEST', inputs, workflowColumnsAvailable: true, finalDocument, firmQuoteDraft: {} }
  const config = { assignees: [{ id: 'regional', name: 'Sample Agent', active: true }] }
  const exports = loadTs(kind === 'admin'
    ? 'src/app/api/admin/quotes/[ref]/send/route.ts'
    : 'src/app/api/availability-agent/[assigneeId]/quotes/[ref]/send/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'node:crypto': { randomUUID: () => 'attempt-id' },
    '@/lib/richEmailServer': richEmail,
    '@/lib/adminAuth': { isAuthorizedAdminRequest: () => options.authorized !== false, getAdminSessionIdentityFromRequest: () => ({ id: 'staff', username: 'Staff' }) },
    '@/lib/availabilityAgentAuth': { isAuthorizedAvailabilityAgentRequest: async () => options.authorized !== false },
    '@/lib/availability': { getAvailabilityConfig: async () => config, getAvailabilityAssignee: () => config.assignees[0] },
    '@/lib/clientCrmQuoteAccess': { canAvailabilityAgentAccessQuote: async () => options.inRegion !== false },
    '@/lib/staffAccounts': { getStaffAccountById: async () => null },
    '@/lib/quoteWorkflow': { getFinalQuoteReadiness: () => ({ ready: true }) },
    '@/lib/finalQuoteSendPolicy': sendPolicy,
    '@/lib/quoteEmailRecipients': { QuoteAgentEmailError, getQuoteAgentCc: async () => {
      calls.push('resolve')
      if (options.noAgent) throw new QuoteAgentEmailError('Assign an active agent with a valid email address before sending this quote.')
      return ['responsible@example.com']
    } },
    '@/lib/email': { EmailProviderRejectedError, sendUpdatedQuoteEmail: async (...args) => {
      calls.push(['send', ...args])
      if (options.rejected) throw new EmailProviderRejectedError('Rejected')
      if (options.uncertain) throw new Error('Timeout')
      return { id: 'provider-id' }
    } },
    '@/lib/quoteWorkflowData': {
      getQuoteWorkflowByRef: async () => quote,
      createFinalQuoteSendAttempt: async () => { calls.push('claim'); return options.claimed !== false },
      getPublicQuoteWorkflowByRef: async () => ({ ...quote, displayPrice: { low: 100, high: 100 } }),
      recordFinalQuoteProviderAccepted: async (...args) => { calls.push(['accepted', ...args]) },
      completeFinalQuoteSend: async () => { calls.push('complete'); return { sentAt: '2026-09-17' } },
      recordFinalQuoteSendFailure: async (...args) => { calls.push(['failed', ...args]) },
    },
  })
  const request = { json: async () => ({ to: inputs.email, cc: 'attacker@example.com', agentCc: ['attacker@example.com'] }) }
  return { calls, run: () => exports.POST(request, { params: { assigneeId: 'regional', ref: 'SC-TEST' } }) }
}

for (const kind of ['admin', 'agent']) {
  test(`${kind} quote send resolves CC before claim and ignores requested CC addresses`, async () => {
    const fixture = finalRouteFixture(kind)
    const response = await fixture.run()
    assert.equal(response.status, 200)
    assert.equal(response.body.status, 'sent')
    assert.deepEqual(fixture.calls.slice(0, 2), ['resolve', 'claim'])
    const sends = fixture.calls.filter(Array.isArray).filter((call) => call[0] === 'send')
    assert.equal(sends.length, 1)
    assert.deepEqual([...sends[0][4].agentCc], ['responsible@example.com'])
    assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === 'accepted' && call[2] === 'provider-id'))
    assert.equal(fixture.calls.at(-1), 'complete')
  })

  test(`${kind} missing-agent failure occurs before claim and remains safely retryable`, async () => {
    const fixture = finalRouteFixture(kind, { noAgent: true })
    const response = await fixture.run()
    assert.equal(response.status, 500)
    assert.match(response.body.error, /Assign an active agent/)
    assert.equal(response.body.reconciliationRequired, false)
    assert.equal(response.body.providerAccepted, false)
    assert.deepEqual(fixture.calls, ['resolve'])
  })

  test(`${kind} provider outcomes keep existing retry and reconciliation protection`, async () => {
    const rejected = finalRouteFixture(kind, { rejected: true })
    const rejection = await rejected.run()
    assert.equal(rejection.status, 502)
    assert.equal(rejection.body.reconciliationRequired, false)
    assert.ok(rejected.calls.some((call) => Array.isArray(call) && call[0] === 'failed' && call[2] === 'provider_rejected'))
    const uncertain = finalRouteFixture(kind, { uncertain: true })
    const unresolved = await uncertain.run()
    assert.equal(unresolved.status, 409)
    assert.equal(unresolved.body.reconciliationRequired, true)
    assert.equal(uncertain.calls.some((call) => Array.isArray(call) && call[0] === 'failed'), false)
    assert.equal(uncertain.calls.filter((call) => Array.isArray(call) && call[0] === 'send').length, 1)
    const duplicate = finalRouteFixture(kind, { claimed: false })
    assert.equal((await duplicate.run()).status, 409)
    assert.deepEqual(duplicate.calls, ['resolve', 'claim'])
  })

  test(`${kind} unauthorized request cannot resolve recipients or send a quote`, async () => {
    const fixture = finalRouteFixture(kind, { authorized: false })
    assert.equal((await fixture.run()).status, 401)
    assert.deepEqual(fixture.calls, [])
  })
}

test('out-of-region agent cannot resolve recipients or send a quote', async () => {
  const fixture = finalRouteFixture('agent', { inRegion: false })
  assert.equal((await fixture.run()).status, 403)
  assert.deepEqual(fixture.calls, [])
})

test('public quote remains available online and preserves admin notification when agent setup prevents email', async () => {
  const engine = await import('../src/lib/quoteEngine.ts')
  const workflow = await import('../src/lib/quoteWorkflow.ts')
  const { DEFAULT_QUOTE_PRICING_CONFIG } = await import('../src/lib/pricing.ts')
  const { DEFAULT_QUOTE_ROOM_TYPE_CONFIG } = await import('../src/lib/roomTypeConfig.ts')
  const { QuoteAgentEmailError } = recipientFixture()
  const calls = []
  class ClientCrmError extends Error {}
  const { POST } = loadTs('src/app/api/quote/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/quoteEngine': { ...engine, generateQuoteRef: () => 'SC-TEST' },
    '@/lib/quoteWorkflow': workflow,
    '@/lib/pricing': { getQuotePricingConfig: async () => DEFAULT_QUOTE_PRICING_CONFIG },
    '@/lib/roomTypeConfig': { getQuoteRoomTypeConfig: async () => DEFAULT_QUOTE_ROOM_TYPE_CONFIG },
    '@/lib/publicRoomScope': scope,
    '@/lib/supabase': { getAdminSupabase: () => ({ from: () => ({ insert: () => {
      calls.push('save quote')
      return { select: () => ({ single: async () => ({ data: { id: 'quote-id' }, error: null }) }) }
    } }) }) },
    '@/lib/email': { sendQuoteEmail: async () => { throw new QuoteAgentEmailError('More than one agent covers this quote. Assign the responsible agent in CRM before sending.') } },
    '@/lib/quoteEmailRecipients': { QuoteAgentEmailError },
    '@/lib/adminNotifications': { createAdminNotification: async () => { calls.push('notify admin') } },
    '@/lib/clientCrmData': {
      ClientCrmError, resolvePublicSubmissionClient: async () => ({ id: 'client-id' }), syncOnlineQuoteCrmOpportunity: async () => {},
    },
    '@/lib/abuseProtection': Object.fromEntries([
      'limitString', 'rateLimit', 'rateLimitValue', 'rejectCrossOriginMutation', 'rejectLargePayload', 'validatePublicSubmission',
    ].map((name) => [name, () => null])),
  })
  const response = await POST({ json: async () => inputs })
  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.quoteRef, 'SC-TEST')
  assert.equal(response.body.emailSent, false)
  assert.ok(response.body.result)
  assert.match(response.body.emailError, /quote is ready online/)
  assert.doesNotMatch(response.body.emailError, /agent|CRM|assigned/i)
  assert.deepEqual(calls, ['save quote', 'notify admin'])
})
