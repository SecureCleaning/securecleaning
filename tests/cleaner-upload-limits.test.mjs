import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
const { rejectLargePayload, rejectCrossOriginMutation } = await import('../src/lib/abuseProtection.ts')
const limit = 10 * 1024 * 1024 + 64 * 1024
const paths = {
  admin: 'src/app/api/admin/cleaners/[cleanerId]/documents/route.ts',
  agent: 'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/documents/route.ts',
  portal: 'src/app/api/cleaner-portal/documents/route.ts',
}
function route(kind, authorized = true) {
  const uploads = []
  const upload = async (...args) => { uploads.push(args); return { id: 'doc1', document_type: 'insurance', file_name: 'proof.pdf', created_at: '2026-10-08' } }
  const mocks = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/abuseProtection': { rejectLargePayload, rejectCrossOriginMutation, rateLimit: async () => null },
    '@/lib/cleanerAdminAuth': { authorizeCleanerAdminRequest: async () => authorized ? { identity: { id: 'staff', role: 'manager' } } : { identity: null, status: 401, error: 'Unauthorized' } },
    '@/lib/cleanerAgentAccess': { getCleanerAgentContext: async () => authorized ? { assignee: { id: 'agent' }, state: 'VIC', actor: { id: 'agent', role: 'agent' } } : null },
    '@/lib/cleanerPortalAccess': { CLEANER_PORTAL_COOKIE: 'portal', verifyCleanerPortalToken: () => authorized ? { mode: 'update', cleanerId: 'cleaner', email: 'cleaner@example.test' } : null },
    '@/lib/cleaners': { uploadCleanerDocument: upload, uploadCleanerDocumentForState: upload, deleteCleanerDocument: async () => { throw new Error('Unexpected delete') } },
    '@/lib/cleanerPortal': { uploadCleanerPortalDocument: upload },
  }
  const source = readFileSync(new URL(`../${paths[kind]}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, Buffer, console, require(name) { assert.ok(mocks[name], `Unexpected dependency ${name}`); return mocks[name] } })
  return { post: request => exports.POST(request, { params: Promise.resolve({ cleanerId: 'cleaner', assigneeId: 'agent' }) }), uploads }
}
function chunked(headers = {}) {
  let pulls = 0; let cancelled = false; let parsed = false
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(64 * 1024)); if (pulls > 200) controller.close() },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const request = new NextRequest('https://example.test/upload', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=fixture', ...headers }, body, duplex: 'half' })
  Object.defineProperty(request, 'formData', { configurable: true, value: async () => { parsed = true; throw new Error('Parser should not execute') } })
  return { request, state: () => ({ pulls, cancelled, parsed }) }
}
for (const kind of Object.keys(paths)) {
  for (const headers of [{}, { 'content-length': '1' }]) {
    test(`${kind} upload bounds chunked bytes before parsing despite ${headers['content-length'] ? 'false' : 'absent'} Content-Length`, async () => {
      const { post, uploads } = route(kind)
      const { request, state } = chunked(headers)
      const response = await post(request)
      assert.equal(response.status, 413)
      assert.equal(state().parsed, false)
      assert.equal(state().cancelled, true)
      assert.equal(state().pulls, Math.floor(limit / (64 * 1024)) + 1)
      assert.deepEqual(uploads, [])
    })
  }
  test(`${kind} unauthorized upload never reads or parses body`, async () => {
    const { post, uploads } = route(kind, false)
    const { request, state } = chunked()
    assert.equal((await post(request)).status, 401)
    assert.deepEqual(state(), { pulls: 0, cancelled: false, parsed: false })
    assert.deepEqual(uploads, [])
    await request.body.cancel()
  })
  test(`${kind} authorized bounded multipart still reaches upload`, async () => {
    const { post, uploads } = route(kind)
    const form = new FormData()
    form.set('file', new File(['%PDF-1.7\nfixture'], 'proof.pdf', { type: 'application/pdf' }))
    form.set('documentType', 'insurance')
    const request = new NextRequest('https://example.test/upload', { method: 'POST', body: form })
    assert.equal((await post(request)).status, 200)
    assert.equal(uploads.length, 1)
    const payload = uploads[0].at(-1)
    assert.equal(payload.fileName, 'proof.pdf')
    assert.equal(payload.data.toString(), '%PDF-1.7\nfixture')
  })
}
