import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as machinery from '../src/lib/cleanerMachinery.ts'
import * as serviceAreas from '../src/lib/cleanerServiceAreas.ts'

const source = readFileSync(new URL('../src/lib/cleaners.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
function harness() {
  let saved
  const query = {
    insert(row) { saved = row; return query },
    update(row) { saved = row; return query },
    eq() { return query }, select() { return query },
    async single() { return { data: { id: 'cleaner-1', ...saved }, error: null } },
  }
  const modules = {
    '@/lib/supabase': { getAdminSupabase: () => ({ from: () => query }) },
    '@/lib/auditLog': { writeAuditLog: async () => {} },
    '@/lib/cleanerServiceAreas': serviceAreas,
    '@/lib/cleanerMachinery': machinery,
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((id) => modules[id] ?? {}, module, module.exports)
  return module.exports
}
const actor = { id: 'staff-1', username: 'owner', role: 'owner' }
const payload = { businessName: 'Test Cleaning', firstName: 'Simone', email: 'cleaner@example.com' }

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

test('still requires business name, first name and valid email on creation', async () => {
  for (const [field, value, message] of [
    ['businessName', '', /Business name is required/],
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
