import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
const { addContractNote, getContractNotes, parseNote, parseNoteTarget } = await import('../src/lib/contractNotes.ts')

const recordId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000002'
const actor = { id: 'agent-one', role: 'agent', productState: 'NSW', displayName: 'Agent One', username: 'agent' }
const input = { kind: 'product', recordId, requestId, text: ' Spoke to cleaner\nFollow up Friday. ' }

test('notes reject empty, oversized and malformed inputs without truncation', () => {
  for (const text of ['', '  ', null, 'a'.repeat(5001)]) assert.throws(() => parseNote({ ...input, text }))
  assert.equal(parseNote(input).text, 'Spoke to cleaner\nFollow up Friday.')
  assert.throws(() => parseNoteTarget({ ...input, kind: 'quote' }))
  assert.throws(() => parseNoteTarget({ ...input, recordId: 'bad' }))
  assert.throws(() => parseNote({ ...input, requestId: 'bad' }))
})

test('notes enforce ownership and state for reads and writes; retries are idempotent', async () => {
  const original = globalThis.fetch
  let assigned = actor.id, state = 'NSW', auditCalls = 0
  const rows = new Map()
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url))
    const table = parsed.pathname.split('/').at(-1)
    let data, status = 200
    if (table === 'contract_products') data = { id: recordId, assigned_staff_id: assigned, state }
    else if (table === 'contract_product_sales') data = { id: recordId, assigned_staff_id: assigned, product_id: recordId }
    else if (table === 'admin_audit_log') {
      auditCalls++
      if (init.method === 'POST') {
        const row = JSON.parse(init.body)
        if (rows.has(row.id)) { status = 409; data = { code: '23505', message: 'duplicate' } }
        else { data = { ...row, created_at: '2026-10-18T00:00:00Z' }; rows.set(row.id, data) }
      } else {
        const matches = [...rows.values()].filter(row => ['id', 'entity_type', 'entity_ref', 'action'].every(key => !parsed.searchParams.has(key) || parsed.searchParams.get(key) === `eq.${row[key]}`))
        data = parsed.searchParams.has('id') ? matches[0] ?? null : matches
      }
    } else throw new Error(`Unexpected table: ${table}`)
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    for (const kind of ['product', 'sale']) {
      assigned = 'another-agent'
      await assert.rejects(getContractNotes(actor, { ...input, kind }), /not found/)
      await assert.rejects(addContractNote(actor, { ...input, kind }), /not found/)
      assigned = actor.id; state = 'VIC'
      await assert.rejects(getContractNotes(actor, { ...input, kind }), /not found/)
      await assert.rejects(addContractNote(actor, { ...input, kind }), /not found/)
      state = 'NSW'
    }
    assert.equal(auditCalls, 0)
    const saved = await addContractNote(actor, input)
    assert.equal(saved.author, actor.displayName)
    assert.equal(saved.text, input.text.trim())
    assert.deepEqual(await addContractNote(actor, input), saved)
    assert.equal(rows.size, 1)
    await assert.rejects(addContractNote(actor, { ...input, text: 'Changed retry' }), /already been used/)
    assert.deepEqual(await getContractNotes(actor, input), [saved])
    assert.deepEqual(await getContractNotes(actor, { ...input, kind: 'sale' }), [])
    assert.deepEqual(await getContractNotes(actor, { ...input, recordId: requestId }), [])
    const saleInput = { ...input, kind: 'sale', requestId: '00000000-0000-4000-8000-000000000003' }
    const saleNote = await addContractNote(actor, saleInput)
    assert.deepEqual(await getContractNotes(actor, saleInput), [saleNote])
    assert.deepEqual(await addContractNote(actor, saleInput), saleNote)
    await assert.rejects(getContractNotes(actor, { ...input, offset: -1 }), /Invalid notes page/)
    assigned = 'other-agent'
    for (const role of ['owner', 'manager']) assert.deepEqual(await getContractNotes({ ...actor, role }, input), [saved])
  } finally { globalThis.fetch = original }
})


test('note route awaits current asynchronous security gates', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/app/api/admin/contract-notes/route.ts', import.meta.url), 'utf8')
  assert.match(source, /await rejectLargePayload\(request, 32 \* 1024\)/)
  assert.match(source, /const limited = await rateLimit\(/)
})
