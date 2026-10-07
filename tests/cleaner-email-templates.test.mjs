import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key'
const { parseCleanerTemplate, saveCleanerEmailTemplate, listCleanerEmailTemplates } = await import('../src/lib/cleanerEmailTemplates.ts')
const draft = { name: 'Availability', description: 'Ask about capacity', subject: 'Hi {{first_name}}', body: 'Hello {{contact_name}}', is_active: true }

test('cleaner templates preserve supported merge fields and sanitize rich HTML', () => {
  const { row } = parseCleanerTemplate({ ...draft, bodyHtml: '<p onclick="bad()">Hello {{contact_name}}</p><script>bad()</script>' })
  assert.equal(row.body_html, '<p>Hello {{contact_name}}</p>')
  assert.equal(row.subject, draft.subject)
  assert.equal(row.is_active, true)
  assert.equal(parseCleanerTemplate({ ...draft, is_active: false }).row.is_active, false)
})
test('cleaner templates reject invalid fields, identities, status and oversized content', () => {
  for (const change of [{ name: '' }, { subject: 'Line\nbreak' }, { id: 'invalid' }, { is_active: 'true' }, { body: '' }, { body: 'x'.repeat(20001) }, { subject: '{{internal_notes}}' }, { bodyHtml: '<p>{{unknown}}</p>' }]) {
    assert.throws(() => parseCleanerTemplate({ ...draft, ...change }))
  }
  assert.throws(() => parseCleanerTemplate(null))
})
test('template API authorizes reads and staff writes before handling data', () => {
  const source = readFileSync(new URL('../src/app/api/admin/cleaners/templates/route.ts', import.meta.url), 'utf8')
  assert.match(source, /authorizeCleanerAdminRequest\(request, 'list'\)/)
  assert.match(source, /authorizeCleanerAdminRequest\(request, 'mutate'\)/)
  assert.equal((source.match(/if \(!auth.identity\)/g) || []).length, 2)
})

test('template storage creates, updates, reloads archived records and audits without sending email', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  let stored
  const id = '11111111-1111-4111-8111-111111111111'
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, method: init?.method || 'GET' })
    if (url.includes('/admin_audit_log')) return new Response(null, { status: 201 })
    assert.match(url, /\/cleaner_email_templates/)
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      stored = { ...JSON.parse(init.body), id }
      return new Response(JSON.stringify(stored), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify([stored]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const actor = { id: 'staff-id', username: 'staff', role: 'staff' }
    const created = await saveCleanerEmailTemplate(draft, actor)
    assert.equal(created.id, id)
    await saveCleanerEmailTemplate({ ...draft, id, is_active: false, subject: 'Updated' }, actor)
    const templates = await listCleanerEmailTemplates()
    assert.equal(templates[0].subject, 'Updated')
    assert.equal(templates[0].is_active, false)
    assert.ok(calls.some((call) => call.method === 'PATCH' && call.url.includes('id=eq.')))
    assert.equal(calls.filter((call) => call.url.includes('/admin_audit_log')).length, 2)
  } finally { globalThis.fetch = originalFetch }
})

test('template route awaits authorization and blocks unauthenticated/viewer writes', async () => {
  const ts = await import('typescript')
  const vm = await import('node:vm')
  const source = readFileSync(new URL('../src/app/api/admin/cleaners/templates/route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  for (const status of [401, 403, 200]) {
    const calls = []
    const exports = {}
    const mocks = {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      '@/lib/abuseProtection': { rejectCrossOriginMutation: () => null, rejectLargePayload: () => null },
      '@/lib/cleanerAdminAuth': { authorizeCleanerAdminRequest: async () => { await Promise.resolve(); return status === 200 ? { identity: { id: 'staff' } } : { identity: null, status, error: 'Denied' } } },
      '@/lib/cleanerEmailTemplates': { listCleanerEmailTemplates: async () => { calls.push('read'); return [] }, saveCleanerEmailTemplate: async () => { calls.push('save'); return {} } },
    }
    vm.runInNewContext(code, { exports, require: name => mocks[name] })
    assert.equal((await exports.POST({ json: async () => ({}) })).status, status)
    assert.equal((await exports.GET({})).status, status)
    assert.deepEqual(calls, status === 200 ? ['save', 'read'] : [])
  }
})
