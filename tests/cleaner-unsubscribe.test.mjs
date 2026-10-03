import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const { POST } = await import('../src/app/api/cleaner-email-preferences/unsubscribe/route.ts')
const validToken = '91ea65ec-7cdd-4640-aeb1-123456789abc'
let requestSequence = 0

function request(token, suffix = '') {
  requestSequence += 1
  return new NextRequest(`https://example.com/api/cleaner-email-preferences/unsubscribe${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `198.51.100.${requestSequence}` },
    body: JSON.stringify({ token }),
  })
}

test('cleaner unsubscribe records a valid token before showing success', async () => {
  const originalFetch = globalThis.fetch
  try {
    let rpcBody
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/consume_public_rate_limit')) return new Response(JSON.stringify({ allowed: true }), { headers: { 'Content-Type': 'application/json' } })
      assert.ok(String(url).endsWith('/rest/v1/rpc/unsubscribe_cleaner_broadcast'))
      rpcBody = JSON.parse(String(options?.body))
      return new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const response = await POST(request(validToken))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true })
    assert.deepEqual(rpcBody, { p_token: validToken })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cleaner unsubscribe rejects malformed and unknown tokens without claiming success', async () => {
  const originalFetch = globalThis.fetch
  try {
    let fetchCount = 0
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/consume_public_rate_limit')) return new Response(JSON.stringify({ allowed: true }), { headers: { 'Content-Type': 'application/json' } })
      fetchCount += 1
      return new Response('false', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const malformed = await POST(request('not-a-valid-token'))
    assert.equal(malformed.status, 400)
    assert.equal(fetchCount, 0)

    const unknown = await POST(request(validToken, '?attempt=unknown'))
    assert.equal(unknown.status, 400)
    assert.equal(fetchCount, 1)
    assert.deepEqual(await unknown.json(), { success: false, error: 'This unsubscribe link is not valid.' })
  } finally {
    globalThis.fetch = originalFetch
  }
})
