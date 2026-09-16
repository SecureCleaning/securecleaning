import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

process.env.ADMIN_SESSION_SECRET = 'test-session-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
const { DELETE } = await import('../src/app/api/admin/cleaners/[cleanerId]/route.ts')
const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import('../src/lib/adminAuth.ts')
const id = '12345678-1234-1234-1234-123456789abc'
function request(role, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (role) headers.cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken({ id: 'actor-id', username: 'actor', role })}`
  return new NextRequest(`https://example.com/api/admin/cleaners/${id}`, { method: 'DELETE', headers, body: JSON.stringify(body) })
}
test('permanent deletion rejects anonymous, agent, viewer and staff requests before touching data', async () => {
  for (const role of [null, 'agent', 'viewer', 'staff']) {
    const response = await DELETE(request(role, { cleanerId: id, confirmation: 'DELETE' }), { params: { cleanerId: id } })
    assert.equal(response.status, role ? 403 : 401)
  }
})
test('manager and owner must confirm the exact cleaner and supply a UUID', async () => {
  for (const role of ['manager', 'owner']) {
    for (const body of [{}, { cleanerId: id, confirmation: 'yes' }, { cleanerId: 'other', confirmation: 'DELETE' }]) {
      const response = await DELETE(request(role, body), { params: { cleanerId: id } })
      assert.equal(response.status, 400)
    }
    assert.equal((await DELETE(request(role, { cleanerId: id, confirmation: 'DELETE' }), { params: { cleanerId: 'invalid' } })).status, 400)
  }
})
test('deletion migration restricts execution and retains atomic audit and document safeguards', () => {
  const sql = readFileSync(new URL('../supabase/cleaner_permanent_deletion_migration.sql', import.meta.url), 'utf8')
  assert.match(sql, /SECURITY INVOKER/)
  assert.match(sql, /FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /TO service_role/)
  assert.match(sql, /FOR UPDATE/)
  assert.match(sql, /EXISTS \(SELECT 1 FROM public.cleaner_documents/)
  assert.ok(sql.indexOf('INSERT INTO public.admin_audit_log') < sql.indexOf('DELETE FROM public.cleaners'))
  assert.doesNotMatch(sql, /EXCEPTION WHEN|DROP CONSTRAINT|DISABLE TRIGGER/)
})

test('authorized deletion passes only signed attribution and handles repeat deletion and protected records', async () => {
  const originalFetch = globalThis.fetch
  try {
    let responseBody = true
    let responseStatus = 200
    let callBody
    globalThis.fetch = async (url, options) => {
      assert.ok(String(url).endsWith('/rest/v1/rpc/delete_cleaner_permanently'))
      callBody = JSON.parse(options.body)
      return new Response(JSON.stringify(responseBody), { status: responseStatus, headers: { 'Content-Type': 'application/json' } })
    }
    const send = () => DELETE(request('manager', { cleanerId: id, confirmation: 'DELETE', actor: { role: 'owner' } }), { params: { cleanerId: id } })
    assert.deepEqual(await (await send()).json(), { success: true, deleted: true })
    assert.deepEqual(callBody, { p_cleaner_id: id, p_actor_id: 'actor-id', p_actor_username: 'actor', p_actor_role: 'manager' })
    responseBody = false
    assert.deepEqual(await (await send()).json(), { success: true, deleted: false })
    responseStatus = 409
    responseBody = { code: '23503', message: 'private database constraint information' }
    const blocked = await send()
    assert.equal(blocked.status, 400)
    const result = await blocked.json()
    assert.match(result.error, /linked sales, offers or broadcast history/)
    assert.doesNotMatch(result.error, /private database/)
    responseBody = { code: 'P0001', message: 'cleaner_has_documents' }
    assert.match((await (await send()).json()).error, /Remove the uploaded documents/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
