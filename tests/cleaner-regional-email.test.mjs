import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
globalThis.require = createRequire(import.meta.url)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.FROM_EMAIL = 'quotes@securecleaning.com.au'
const { previewCleanerEmail, sendCleanerEmail } = await import('../src/lib/cleaners.ts')
const { getCleanerEmailSenders } = await import('../src/lib/cleanerEmailSenders.ts')
const ownerId = '11111111-1111-4111-8111-111111111111'
const agentId = '33333333-3333-4333-8333-333333333333'
const owner = { id: ownerId, username: 'owner', role: 'owner' }
const draft = { cleanerId: '22222222-2222-4222-8222-222222222222', state: 'NSW', subject: 'Test cleaner email', body: 'Authorised test', actor: { id: 'assignee-test', username: 'nsw-agent', role: 'availability_agent' } }
function backend(options = {}) {
  const calls = []; const sent = []; let archived
  const accounts = [
    { id: ownerId, username: 'owner', active: true, email: 'owner@securecleaning.com.au', role: 'owner', display_name: 'Owner Name', job_title: 'Owner', phone: '0400000000' },
    { id: agentId, username: 'agent', active: true, email: 'agent@securecleaning.com.au', role: 'agent', display_name: 'Agent Name', job_title: 'Regional Agent', phone: '0400000001', availability_assignee_id: 'assignee-test', ...options.account },
  ]
  return { calls, sent, accounts, get archived() { return archived }, fetch: async (input, init = {}) => {
    const url = new URL(String(input)); calls.push(url.pathname)
    const table = url.pathname.split('/').pop()
    const body = init.body ? JSON.parse(init.body) : null
    let data
    if (url.hostname === 'api.resend.com') { sent.push(body); data = { id: 'provider-id' } }
    else if (table === 'cleaners') data = { id: draft.cleanerId, email: 'cleaner@example.test', contact_name: 'Test Cleaner', business_name: 'Test Company', state: 'NSW', services: [] }
    else if (table === 'availability_private_config') data = { content: JSON.stringify({ assignees: [{ id: 'assignee-test', name: 'NSW Agent', city: 'sydney', active: true, email: 'legacy@example.test', ...options.assignee }] }) }
    else if (table === 'admin_staff_accounts') data = url.searchParams.has('id') ? accounts.find(a => 'eq.' + a.id === url.searchParams.get('id')) : accounts
    else if (table === 'cleaner_emails' && init.method === 'POST') { archived = body; data = { ...body, id: 'email-id' } }
    else if (table === 'cleaner_emails' && init.method === 'PATCH') data = { ...archived, ...body, id: 'email-id' }
    else if (table === 'admin_audit_log') data = null
    else if (['cleaner_comments', 'cleaner_emails', 'cleaner_documents'].includes(table)) data = []
    else throw new Error(`Unexpected request: ${table}`)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  } }
}
test('regional cleaner preview uses linked Team Access signature and cleaner-specific From', async () => {
  const saved = globalThis.fetch; const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const preview = await previewCleanerEmail(draft)
    assert.equal(preview.to, 'cleaner@example.test')
    assert.equal(preview.cc, 'agent@securecleaning.com.au')
    assert.equal(preview.replyTo, preview.cc)
    assert.equal(preview.from, 'Agent Name - Secure Cleaning <info@securecleaning.com.au>')
    assert.match(preview.text, /Kind regards,[\s\S]*Agent Name[\s\S]*Regional Agent/)
    assert.match(preview.html, /Agent Name/)
    assert.doesNotMatch(preview.text, /legacy@example/)
    assert.ok(preview.previewFingerprint)
  } finally { globalThis.fetch = saved }
})
test('regional preview rejects inactive/out-of-region/unlinked/incomplete senders and sender spoofing', async () => {
  const saved = globalThis.fetch
  try {
    for (const options of [{ assignee: { active: false } }, { assignee: { city: 'melbourne' } }, { account: { active: false } }, { account: { availability_assignee_id: null } }, { account: { job_title: '' } }]) {
      globalThis.fetch = backend(options).fetch
      await assert.rejects(previewCleanerEmail(draft))
    }
    globalThis.fetch = backend().fetch
    await assert.rejects(previewCleanerEmail({ ...draft, senderStaffId: ownerId }), /cannot send/)
  } finally { globalThis.fetch = saved }
})
test('only owner selects another active sender; default stays logged-in and profile changes invalidate preview', async () => {
  const saved = globalThis.fetch; const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const context = await getCleanerEmailSenders(owner)
    assert.equal(context.defaultSenderId, ownerId)
    assert.equal(context.senders.length, 2)
    const input = { ...draft, state: undefined, actor: owner, senderStaffId: agentId }
    const preview = await previewCleanerEmail(input)
    assert.equal(preview.cc, 'agent@securecleaning.com.au')
    await assert.rejects(previewCleanerEmail({ ...input, actor: { id: agentId, role: 'agent' }, senderStaffId: ownerId }), /cannot send/)
    mock.accounts[1].phone = '0400000099'
    await assert.rejects(sendCleanerEmail({ ...input, previewFingerprint: preview.previewFingerprint }), /Preview this exact/)
    assert.equal(mock.sent.length, 0)
    mock.accounts[1].active = false
    await assert.rejects(previewCleanerEmail(input), /cannot send/)
  } finally { globalThis.fetch = saved }
})
test('individual provider payload and archived snapshots match signed preview HTML/text and sender headers', async () => {
  const saved = globalThis.fetch; const mock = backend(); globalThis.fetch = mock.fetch
  try {
    const input = { ...draft, state: undefined, actor: owner, senderStaffId: agentId }
    const preview = await previewCleanerEmail(input)
    await sendCleanerEmail({ ...input, previewFingerprint: preview.previewFingerprint })
    assert.equal(mock.sent.length, 1)
    const payload = mock.sent[0]
    assert.equal(payload.from, preview.from)
    assert.equal(payload.html, preview.html)
    assert.equal(payload.text, preview.text)
    assert.deepEqual(Array.isArray(payload.cc) ? payload.cc : [payload.cc], [preview.cc])
    assert.equal(payload.reply_to, preview.replyTo)
    assert.equal(mock.archived.final_html_snapshot, preview.html)
    assert.equal(mock.archived.final_text_snapshot, preview.text)
  } finally { globalThis.fetch = saved }
})
