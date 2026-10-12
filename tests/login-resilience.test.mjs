import test from 'node:test'
import assert from 'node:assert/strict'
import { signInStaff } from '../src/lib/staffLoginClient.ts'
import { databaseFetch } from '../src/lib/databaseFetch.ts'

function mockFetch(t, implementation) {
  const original = globalThis.fetch
  globalThis.fetch = implementation
  t.after(() => { globalThis.fetch = original })
}

test('login accepts the existing successful agent response', async t => {
  mockFetch(t, async (_url, init) => {
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), { username: 'agent', password: 'test-password' })
    return Response.json({ success: true, role: 'agent', assigneeId: 'nsw' })
  })
  assert.equal((await signInStaff('agent', 'test-password')).assigneeId, 'nsw')
})

for (const [status, body, expected] of [
  [504, 'An error occurred', /temporarily unavailable/],
  [200, '<html>Proxy error</html>', /temporarily unavailable/],
  [401, '{"error":"private provider detail"}', /Invalid username or password/],
  [429, 'Too many requests', /wait before trying again/],
  [200, '{"success":true,"role":"agent","assigneeId":null}', /not linked/],
]) test(`login safely handles status ${status}: ${expected}`, async t => {
  mockFetch(t, async () => new Response(body, { status }))
  await assert.rejects(signInStaff('agent', 'test-password'), expected)
})

test('login cancels a hanging request without retrying', async t => {
  let calls = 0
  mockFetch(t, (_url, { signal }) => new Promise((_resolve, reject) => {
    calls++
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  await assert.rejects(signInStaff('agent', 'test-password', 10), /took too long/)
  assert.equal(calls, 1)
})

test('login deadline covers a stalled response body too', async t => {
  mockFetch(t, async (_url, { signal }) => ({
    status: 200, ok: true,
    json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }),
  }))
  await assert.rejects(signInStaff('agent', 'test-password', 10), /took too long/)
})

test('database fetch preserves options and aborts after headers, without retries', async t => {
  let signal
  let calls = 0
  mockFetch(t, async (_url, init) => {
    calls++
    signal = init.signal
    assert.equal(init.cache, 'no-store')
    assert.equal(init.method, 'POST')
    assert.equal(init.body, 'payload')
    return new Response('ok')
  })
  await databaseFetch('https://example.test', { method: 'POST', body: 'payload' }, 10)
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})

test('database fetch preserves caller cancellation including Request input', async t => {
  mockFetch(t, async (_url, { signal }) => {
    assert.equal(signal.aborted, true)
    throw signal.reason
  })
  const controller = new AbortController()
  controller.abort(new Error('caller cancelled'))
  await assert.rejects(databaseFetch(new Request('https://example.test', { signal: controller.signal })), /caller cancelled/)
})

test('database transport uploads bytes and leaves an uncertain timed-out write unretried', async () => {
  const { createServer } = await import('node:http')
  let writes = 0
  let uploaded = 0
  const server = createServer(async (request, response) => {
    for await (const chunk of request) uploaded += chunk.length
    writes++
    if (request.url === '/upload') { response.end('stored'); return }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.write('{')
    // Simulate a committed write whose response body never completes.
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const response = await databaseFetch(`${url}/upload`, { method: 'POST', body: new Uint8Array(1024 * 1024) }, 2000)
    assert.equal(await response.text(), 'stored')
    assert.equal(uploaded, 1024 * 1024)
    const stalled = await databaseFetch(`${url}/write`, { method: 'POST', body: 'write' }, 100)
    await assert.rejects(stalled.text())
    assert.equal(writes, 2, 'timeout does not retry or undo the committed write')
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
