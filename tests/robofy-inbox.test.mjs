import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ROBOFY_API_KEY = 'robofy-test-api-key'
process.env.ROBOFY_CHATBOT_ID = 'chatbot-123'

const { getRobofyInboxSessions } = await import('../src/lib/robofyInbox.ts')

const originalFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('maps only bounded, validated inbox fields and excludes provider payload fields', async () => {
  const longMessage = `api_key=${process.env.ROBOFY_API_KEY} ${'x'.repeat(600)}`
  globalThis.fetch = async (_input, init) => {
    assert.ok(init.signal)
    return new Response(
      JSON.stringify({
        sessions: [
          {
            session_id: 'session-1',
            last_message_time: '2026-08-12T01:02:03.000Z',
            last_message: longMessage,
            user_profile_name: '  Visitor  ',
            last_message_direction: 'ASSISTANT',
            website_url: 'https://customer.example/private',
            private_token: 'provider-private-token',
          },
          {
            session_id: 'ignored-with-invalid-timestamp',
            last_message_time: 'not-a-date',
            last_message: 'still safe',
            last_message_direction: 'unexpected-provider-value',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  const result = await getRobofyInboxSessions()

  assert.equal(result.error, null)
  assert.equal(result.sessions.length, 2)
  assert.deepEqual(result.sessions[0], {
    sessionId: 'session-1',
    lastMessageTime: '2026-08-12T01:02:03.000Z',
    lastMessage: null,
    visitorName: 'Visitor',
    lastMessageDirection: 'assistant',
  })
  assert.equal(result.sessions[0].lastMessage, null)
  assert.equal(JSON.stringify(result).includes(process.env.ROBOFY_API_KEY), false)
  assert.deepEqual(result.sessions[1], {
    sessionId: 'ignored-with-invalid-timestamp',
    lastMessageTime: null,
    lastMessage: 'still safe',
    visitorName: null,
    lastMessageDirection: null,
  })
  assert.equal('websiteUrl' in result.sessions[0], false)
  assert.equal(JSON.stringify(result).includes('provider-private-token'), false)
})

test('bounds the number of provider sessions', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ sessions: Array.from({ length: 125 }, (_, index) => ({ session_id: `session-${index}` })) }),
    { status: 200 },
  )

  const result = await getRobofyInboxSessions()

  assert.equal(result.sessions.length, 100)
})

test('returns generic errors for provider failures and timeouts', async () => {
  globalThis.fetch = async () => new Response('upstream failure', { status: 503 })
  const failed = await getRobofyInboxSessions()
  assert.equal(failed.error, 'Robofy inbox request failed (503). Check the API key and chatbot ID.')
  assert.equal(JSON.stringify(failed).includes('upstream failure'), false)

  const originalSetTimeout = globalThis.setTimeout
  globalThis.fetch = async (_input, init) => {
    assert.equal(init.signal.aborted, true)
    throw new Error('timeout detail that must not be returned')
  }
  globalThis.setTimeout = (callback) => {
    callback()
    return 0
  }
  try {
    const timedOut = await getRobofyInboxSessions()
    assert.equal(timedOut.error, 'Robofy inbox request timed out. Try again shortly.')
    assert.equal(JSON.stringify(timedOut).includes('timeout detail'), false)
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
})

test('admin chat page explicitly requires the viewer role and does not render the provider URL', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/app/admin/chat/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /getAdminSessionIdentityFromCookies/)
  assert.match(source, /hasAdminRole\(identity\.role, ['"]viewer['"]\)/)
  assert.doesNotMatch(source, /session\.websiteUrl/)
})
