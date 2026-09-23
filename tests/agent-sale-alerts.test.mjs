import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function routeFixture(options = {}) {
  const operations = []
  const auditWrites = []
  let databaseReads = 0
  function createQuery(table) {
    const query = {}
    for (const method of ['select', 'eq', 'in', 'order']) {
      query[method] = (...args) => {
        operations.push([table, method, ...args])
        return query
      }
    }
    query.limit = (...args) => {
      operations.push([table, 'limit', ...args])
      return Promise.resolve({
        data: table === 'contract_product_sales' ? options.rows ?? [] : options.activity ?? [],
        error: table === 'admin_audit_log' ? options.activityError ?? null : options.databaseError ?? null,
      })
    }
    query.maybeSingle = () => {
      operations.push([table, 'maybeSingle'])
      return Promise.resolve({ data: options.sale ?? null, error: options.databaseError ?? null })
    }
    return query
  }
  const dependencies = {
    'next/server': {
      NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) },
    },
    '@/lib/availabilityAgentAuth': {
      isAuthorizedAvailabilityAgentRequest: async () => options.authorized !== false,
    },
    '@/lib/adminAuth': {
      getAdminSessionIdentityFromRequest: () => options.identity ?? { id: 'agent-1', role: 'agent' },
    },
    '@/lib/staffAccounts': {
      getStaffAccountById: async () => options.account ?? {
        id: 'agent-1', active: true, role: 'agent', availability_assignee_id: 'assignee-1',
      },
    },
    '@/lib/supabase': {
      getAdminSupabase: () => ({ from: (table) => { databaseReads += 1; return createQuery(table) } }),
    },
    '@/lib/abuseProtection': { rejectCrossOriginMutation: () => null, rejectLargePayload: () => null, rateLimit: () => null },
    '@/lib/auditLog': {
      writeAuditLogStrict: async (...args) => { auditWrites.push(args) },
    },
  }
  const source = readFileSync(new URL('../src/app/api/availability-agent/[assigneeId]/sale-alerts/route.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  vm.runInNewContext(outputText, {
    module, exports: module.exports, console: { error() {} },
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return {
    auditWrites,
    operations,
    get databaseReads() { return databaseReads },
    runGet: () => module.exports.GET({}, { params: Promise.resolve({ assigneeId: 'assignee-1' }) }),
    runPost: (saleId) => module.exports.POST(
      { json: async () => ({ saleId }) },
      { params: Promise.resolve({ assigneeId: 'assignee-1' }) }
    ),
  }
}

test('sale alerts require the signed agent account before reading payment workflow data', async () => {
  const unauthorized = routeFixture({ authorized: false })
  assert.equal((await unauthorized.runGet()).status, 401)
  assert.equal(unauthorized.databaseReads, 0)

  const mismatched = routeFixture({ account: { id: 'agent-1', active: true, role: 'agent', availability_assignee_id: 'another-agent' } })
  assert.equal((await mismatched.runGet()).status, 403)
  assert.equal(mismatched.databaseReads, 0)
})

test('sale alerts return only assigned inspection-ready sales with minimal fields', async () => {
  const fixture = routeFixture({ rows: [{
    id: 'sale-1', sale_code: 'PS-2026-01000', product_id: 'product-1',
    product_snapshot: { product_code: 'C001000', private_detail: 'not returned' },
  }] })
  const response = await fixture.runGet()
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), { alerts: [{
    saleId: 'sale-1', saleCode: 'PS-2026-01000', productId: 'product-1', productCode: 'C001000',
  }] })
  assert.ok(fixture.operations.some((operation) => operation[0] === 'contract_product_sales' && operation[1] === 'eq' && operation[2] === 'assigned_staff_id' && operation[3] === 'agent-1'))
  assert.ok(fixture.operations.some((operation) => operation[0] === 'contract_product_sales' && operation[1] === 'eq' && operation[2] === 'status' && operation[3] === 'inspection_ready'))
  assert.ok(fixture.operations.some((operation) => operation[0] === 'contract_product_sales' && operation[1] === 'limit' && operation[2] === 20))
})

test('successful availability follow-up and this agent dismissal clear deposit alerts', async () => {
  const rows = [
    { id: 'sale-1', sale_code: 'PS-1', product_id: 'product-1', product_snapshot: {} },
    { id: 'sale-2', sale_code: 'PS-2', product_id: 'product-2', product_snapshot: {} },
    { id: 'sale-3', sale_code: 'PS-3', product_id: 'product-3', product_snapshot: {} },
  ]
  const fixture = routeFixture({ rows, activity: [
    { entity_ref: 'sale-1', action: 'contract_sale.inspection.availability_sent', details: { deliveryStatus: 'sent' } },
    { entity_ref: 'sale-2', action: 'contract_sale.deposit_alert.dismissed', details: { actorId: 'agent-1' } },
    { entity_ref: 'sale-3', action: 'contract_sale.deposit_alert.dismissed', details: { actorId: 'another-agent' } },
  ] })

  const response = await fixture.runGet()
  assert.deepEqual(response.body.alerts.map((alert) => alert.saleId), ['sale-3'])
})

test('only the assigned signed-in agent can durably dismiss an inspection-ready sale alert', async () => {
  const saleId = '54ac6d78-9b0f-4e18-a18b-9697eb02036e'
  const fixture = routeFixture({ sale: { id: saleId } })
  const response = await fixture.runPost(saleId)

  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.auditWrites)), [[
    'contract_sale', saleId, 'contract_sale.deposit_alert.dismissed',
    { actorId: 'agent-1', actorRole: 'agent' },
  ]])
  assert.ok(fixture.operations.some((operation) => operation[0] === 'contract_product_sales' && operation[1] === 'eq' && operation[2] === 'assigned_staff_id' && operation[3] === 'agent-1'))
  assert.ok(fixture.operations.some((operation) => operation[0] === 'contract_product_sales' && operation[1] === 'eq' && operation[2] === 'status' && operation[3] === 'inspection_ready'))

  const invalid = routeFixture()
  assert.equal((await invalid.runPost('not-a-sale')).status, 400)
  assert.equal(invalid.databaseReads, 0)
  assert.equal(invalid.auditWrites.length, 0)
})

test('agent navigation explains, refreshes and dismisses cleared-deposit alerts per sale', () => {
  const navigation = readFileSync(new URL('../src/components/availability/AvailabilityAgentNav.tsx', import.meta.url), 'utf8')
  const inspectionPanel = readFileSync(new URL('../src/components/admin/ContractSaleInspectionPanel.tsx', import.meta.url), 'utf8')
  assert.match(navigation, /setInterval\(\(\) => void loadSaleAlerts\(\), 60_000\)/)
  assert.match(navigation, /Cleared deposit approved/)
  assert.match(navigation, /role="status" aria-live="polite"/)
  assert.match(navigation, /Sending the client availability request or scheduling the inspection clears the alert automatically/)
  assert.match(navigation, /dismissSaleAlert\(alert\.saleId\)/)
  assert.match(navigation, /: 'Dismiss'/)
  assert.match(navigation, /\?product=/)
  assert.match(inspectionPanel, /secure-cleaning:sale-alerts-changed/)
})
