import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
const { previewCleanerEmail } = await import('../src/lib/cleaners.ts')
const draft = { cleanerId: '22222222-2222-4222-8222-222222222222', state: 'NSW', subject: 'Test cleaner email', body: 'Authorised test', actor: { id: 'assignee-test', username: 'nsw-agent', role: 'availability_agent' } }
function backend(overrides = {}) {
  const calls = []
  return { calls, fetch: async (input) => {
    const url = new URL(String(input)); calls.push(url.pathname)
    const table = url.pathname.split('/').pop()
    let data
    if (table === 'cleaners') data = { id: draft.cleanerId, email: 'cleaner@example.test', contact_name: 'Test Cleaner', business_name: 'Test Company', state: 'NSW', services: [] }
    else if (table === 'availability_private_config') data = { content: JSON.stringify({ assignees: [{ id: 'assignee-test', name: 'NSW Agent', city: 'sydney', active: true, email: 'Agent@Example.test', ...overrides }] }) }
    else if (table === 'admin_staff_accounts') data = { id: '11111111-1111-4111-8111-111111111111', username: 'owner', active: true, email: 'owner@example.test', role: 'owner' }
    else if (['cleaner_comments', 'cleaner_emails', 'cleaner_documents'].includes(table)) data = []
    else throw new Error(`Unexpected request: ${table}`)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  } }
}
test('regional preview uses the active assignee email without querying a UUID staff ID', async () => {
  const saved = globalThis.fetch; const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const preview = await previewCleanerEmail(draft)
    assert.equal(preview.to, 'cleaner@example.test')
    assert.equal(preview.cc, 'agent@example.test')
    assert.ok(preview.previewFingerprint)
    assert.ok(!mock.calls.some(path => path.endsWith('/admin_staff_accounts')))
  } finally { globalThis.fetch = saved }
})
test('regional email preview rejects inactive, out-of-region and invalid sender identities', async () => {
  const saved = globalThis.fetch
  try {
    for (const override of [{ active: false }, { city: 'melbourne' }, { email: '' }, { email: 'invalid' }]) {
      globalThis.fetch = backend(override).fetch
      await assert.rejects(previewCleanerEmail(draft), /active account and valid work email/)
    }
  } finally { globalThis.fetch = saved }
})
test('owner email preview retains staff-account sender resolution', async () => {
  const saved = globalThis.fetch; const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const preview = await previewCleanerEmail({ ...draft, state: undefined, actor: { id: '11111111-1111-4111-8111-111111111111', username: 'owner', role: 'owner' } })
    assert.equal(preview.cc, 'owner@example.test')
    assert.ok(mock.calls.some(path => path.endsWith('/admin_staff_accounts')))
  } finally { globalThis.fetch = saved }
})
