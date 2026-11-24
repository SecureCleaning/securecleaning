import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as machinery from '../src/lib/cleanerMachinery.ts'
import * as serviceAreas from '../src/lib/cleanerServiceAreas.ts'
import * as leadSource from '../src/lib/cleanerLeadSource.ts'
import { csvCell } from '../src/lib/csvCell.ts'

const source = readFileSync(new URL('../src/lib/cleaners.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
function harness(existing = [], saveError = null) {
  const writes = []
  let emails = 0
  const db = { from: () => {
    let saved, operation
    const query = {
      insert(row) { saved = row; operation = 'insert'; writes.push({ operation, row }); return query },
      update(row) { saved = row; operation = 'update'; writes.push({ operation, row }); return query },
      eq() { return query }, select() { return query }, in() { return query }, order() { return query }, limit() { return query },
      async single() { return { data: { id: 'cleaner-1', ...saved }, error: saveError } },
      then(resolve, reject) { return Promise.resolve({ data: operation ? null : existing, error: null }).then(resolve, reject) },
    }
    return query
  } }
  const modules = {
    '@/lib/supabase': { getAdminSupabase: () => db },
    '@/lib/auditLog': { writeAuditLog: async () => {} },
    '@/lib/cleanerServiceAreas': serviceAreas,
    '@/lib/cleanerMachinery': machinery,
    '@/lib/cleanerLeadSource': leadSource,
    '@/lib/csvCell': { csvCell },
    '@/lib/email': { sendEmailOrThrow: async () => { emails++; throw new Error('Unexpected email') } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((id) => modules[id] ?? {}, module, module.exports)
  return { ...module.exports, writes, emailCount: () => emails }
}

const actor = { id: 'staff-1', username: 'owner', role: 'owner' }
const payload = { businessName: 'Test Cleaning', firstName: 'Simone', email: 'cleaner@example.com', phone: '0400000000' }

test('creates cleaners with omitted, null, empty or whitespace surnames', async () => {
  for (const lastName of [undefined, null, '', '   ']) {
    const record = await harness().createCleaner({ ...payload, lastName }, actor)
    assert.equal(record.contact_name, 'Simone')
    assert.ok(!record.last_name)
  }
})

test('clears a placeholder surname and retains the first name on update', async () => {
  const record = await harness().updateCleaner('cleaner-1', { ...payload, lastName: '', contactName: 'Simone' }, actor)
  assert.equal(record.last_name, '')
  assert.equal(record.contact_name, 'Simone')
})

test('requires first name, mobile and valid email on creation', async () => {
  for (const [field, value, message] of [
    ['phone', '', /Mobile is required/],
    ['phone', '   ', /Mobile is required/],
    ['phone', null, /Mobile is required/],
    ['phone', undefined, /Mobile is required/],
    ['firstName', '', /First name is required/],
    ['email', 'invalid', /valid email is required/],
  ]) {
    await assert.rejects(harness().createCleaner({ ...payload, [field]: value }, actor), message)
  }
})

test('staff saves preserve omitted machinery and persist validated machinery on create and update', async () => {
 const details={items:['carpet_extractor','other'],other:'Ride-on scrubber',notes:'Owned'}
 assert.deepEqual((await harness().createCleaner({...payload,specialistMachinery:details},actor)).specialist_machinery,details)
 assert.deepEqual((await harness().updateCleaner('cleaner-1',{specialistMachinery:details},actor)).specialist_machinery,details)
 assert.equal((await harness().updateCleaner('cleaner-1',{phone:'0400000000'},actor)).specialist_machinery,undefined)
 await assert.rejects(harness().updateCleaner('cleaner-1',{specialistMachinery:{...details,items:['invalid']}},actor),/valid specialist/)
})


test('creates a cleaner with only the three required details and no business name or surname', async () => {
  for (const businessName of [undefined, null, '', '   ']) {
    const api = harness()
    const row = await api.createCleaner({ firstName: 'Arif', email: 'arif@example.test', phone: '0400000000', businessName }, actor)
    assert.equal(row.business_name, '')
    assert.equal(row.contact_name, 'Arif')
    assert.equal(row.phone, '0400000000')
    assert.equal(row.email, 'arif@example.test')
    assert.equal(api.emailCount(), 0)
  }
})

test('staff can clear placeholder businesses and optional attribution without clearing required details', async () => {
  const api = harness()
  const row = await api.updateCleaner('cleaner-1', { businessName: '', leadSource: '', leadSourceDetails: '' }, actor)
  assert.equal(row.business_name, '')
  assert.equal(row.lead_source, null)
  assert.equal(row.lead_source_details, null)
  assert.equal(row.first_name, undefined)
  assert.equal(row.phone, undefined)
  for (const [field, message] of [['firstName', /First name/], ['email', /valid email/], ['phone', /Mobile/]]) {
    for (const value of [null, '', '   ']) await assert.rejects(api.updateCleaner('cleaner-1', { [field]: value }, actor), message)
  }
  assert.equal(api.writes.length, 1)
  assert.equal(api.emailCount(), 0)
})

test('staff source and details round-trip, reject invalid input, and survive omitted partial updates', async () => {
  const api = harness()
  const row = await api.createCleaner({ ...payload, leadSource: 'Gumtree advertisement', leadSourceDetails: '  Advert 123  ' }, actor)
  assert.equal(row.lead_source, 'gumtree')
  assert.equal(row.lead_source_details, 'Advert 123')
  const edited = await api.updateCleaner('cleaner-1', { leadSource: 'referral', leadSourceDetails: 'Existing cleaner referral' }, actor)
  assert.equal(edited.lead_source, 'referral')
  const partial = await api.updateCleaner('cleaner-1', { phone: '0400000001' }, actor)
  assert.equal(partial.lead_source, undefined)
  assert.equal(partial.lead_source_details, undefined)
  await assert.rejects(api.createCleaner({ ...payload, leadSource: 'invalid' }, actor), /valid cleaner source/)
  await assert.rejects(api.updateCleaner('cleaner-1', { leadSourceDetails: 'x'.repeat(1001) }, actor), /1,000/)
  assert.equal(api.writes.length, 3)
  assert.equal(api.emailCount(), 0)
})

test('CSV import accepts no business name, preserves blank attribution, imports source and skips incomplete rows', async () => {
  const api = harness([{ id: 'existing-1', email: 'existing@example.test' }])
  const result = await api.importCleaners([
    { ...payload, businessName: '', email: 'new@example.test', leadSource: 'Referral', leadSourceDetails: 'Cleaner network' },
    { ...payload, businessName: '', email: 'existing@example.test', leadSource: '', leadSourceDetails: '' },
    { ...payload, phone: '' },
    { ...payload, leadSource: 'not-valid' },
  ], actor)
  assert.equal(result.created, 1)
  assert.equal(result.updated, 1)
  assert.equal(result.skipped, 2)
  assert.match(result.errors.join(' '), /Mobile is required/)
  assert.match(result.errors.join(' '), /valid cleaner source/)
  const created = api.writes.find(item => item.operation === 'insert').row[0]
  assert.equal(created.business_name, '')
  assert.equal(created.lead_source, 'referral')
  assert.equal(created.lead_source_details, 'Cleaner network')
  const updated = api.writes.find(item => item.operation === 'update').row
  assert.equal(updated.business_name, undefined)
  assert.equal(updated.lead_source, undefined)
  assert.equal(updated.lead_source_details, undefined)
  assert.equal(api.emailCount(), 0)
})

test('CSV exports attribution with CSV quoting and spreadsheet-formula protection', async () => {
  const api = harness([{ business_name: '', first_name: 'Fixture', email: 'fixture@example.test', lead_source: 'gumtree', lead_source_details: '=HYPERLINK("example")' }])
  const csv = await api.exportCleanersCsv(actor)
  assert.match(csv.split('\n')[0], /"lead_source","lead_source_details"$/)
  assert.match(csv, /gumtree/)
  assert.match(csv, /'=HYPERLINK/)
  assert.equal(api.emailCount(), 0)
})


test('duplicate cleaner email gives actionable guidance on creation and edit', async () => {
  const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint "idx_cleaners_email_unique"', details: 'Private database details' }
  const api = harness([], duplicate)
  for (const save of [() => api.createCleaner({ ...payload, email: 'Cleaner@Example.com' }, actor), () => api.updateCleaner('cleaner-1', { email: payload.email }, actor)]) {
    await assert.rejects(save(), error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /email address is already on file/)
      assert.match(error.message, /Search the Cleaner Database by email/)
      assert.match(error.message, /edit the existing record/)
      assert.doesNotMatch(error.message, /idx_cleaners|Private database/)
      return true
    })
  }
  assert.equal(api.emailCount(), 0)
})

test('other database failures are not misreported as duplicate email', async () => {
  for (const failure of [{ code: '23505', message: 'duplicate key violates cleaners_pkey' }, { code: '23514', message: 'check constraint' }]) {
    const api = harness([], failure)
    await assert.rejects(api.createCleaner(payload, actor), error => error === failure)
    await assert.rejects(api.updateCleaner('cleaner-1', { email: payload.email }, actor), error => error === failure)
  }
})
