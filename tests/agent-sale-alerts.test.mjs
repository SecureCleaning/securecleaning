import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function routeFixture(options = {}) {
  const operations = []
  let databaseReads = 0
  const query = {}
  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method] = (...args) => {
      operations.push([method, ...args])
      return method === 'limit'
        ? Promise.resolve({ data: options.rows ?? [], error: options.databaseError ?? null })
        : query
    }
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
      getAdminSupabase: () => ({ from: () => { databaseReads += 1; return query } }),
    },
    '@/lib/abuseProtection': { rateLimit: () => null },
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
    operations,
    get databaseReads() { return databaseReads },
    run: () => module.exports.GET({}, { params: Promise.resolve({ assigneeId: 'assignee-1' }) }),
  }
}

test('sale alerts require the signed agent account before reading payment workflow data', async () => {
  const unauthorized = routeFixture({ authorized: false })
  assert.equal((await unauthorized.run()).status, 401)
  assert.equal(unauthorized.databaseReads, 0)

  const mismatched = routeFixture({ account: { id: 'agent-1', active: true, role: 'agent', availability_assignee_id: 'another-agent' } })
  assert.equal((await mismatched.run()).status, 403)
  assert.equal(mismatched.databaseReads, 0)
})

test('sale alerts return only assigned inspection-ready sales with minimal fields', async () => {
  const fixture = routeFixture({ rows: [{
    id: 'sale-1', sale_code: 'PS-2026-01000', product_id: 'product-1',
    product_snapshot: { product_code: 'C001000', private_detail: 'not returned' },
  }] })
  const response = await fixture.run()
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), { alerts: [{
    saleId: 'sale-1', saleCode: 'PS-2026-01000', productId: 'product-1', productCode: 'C001000',
  }] })
  assert.ok(fixture.operations.some((operation) => operation[0] === 'eq' && operation[1] === 'assigned_staff_id' && operation[2] === 'agent-1'))
  assert.ok(fixture.operations.some((operation) => operation[0] === 'eq' && operation[1] === 'status' && operation[2] === 'inspection_ready'))
  assert.ok(fixture.operations.some((operation) => operation[0] === 'limit' && operation[1] === 20))
})

test('agent navigation polls and links cleared-deposit alerts to the product sale', () => {
  const navigation = readFileSync(new URL('../src/components/availability/AvailabilityAgentNav.tsx', import.meta.url), 'utf8')
  assert.match(navigation, /setInterval\(\(\) => void loadSaleAlerts\(\), 60_000\)/)
  assert.match(navigation, /Cleared deposit approved/)
  assert.match(navigation, /role="status" aria-live="polite"/)
  assert.match(navigation, /Open Product sales/)
  assert.match(navigation, /\?product=/)
})
