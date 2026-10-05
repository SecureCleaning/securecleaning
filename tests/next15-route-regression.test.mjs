import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as ts from 'typescript'
import { isQuoteReference } from '../src/lib/quoteReference.ts'

function loadRoute(path, dependencies) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } }
    if (name === '@/lib/quoteReference') return { isQuoteReference }
    if (!(name in dependencies)) throw Error('Unexpected dependency: ' + name)
    return dependencies[name]
  } })
  return exports
}
const ref = 'SC-20261004-TEST'
const context = () => ({ params: Promise.resolve({ ref }) })

test('async quote route parameters preserve capability forwarding and private responses', async () => {
  let calls = []
  const { GET } = loadRoute('src/app/api/quote/[ref]/route.ts', {
    '@/lib/abuseProtection': { rateLimit: async () => null },
    '@/lib/quoteWorkflowData': { getPublicQuoteDocumentByRef: async (...args) => {
      calls.push(args)
      return args[2] === 'valid-document-capability' ? { quoteRef: ref } : null
    } },
  })
  for (const access of ['', 'invalid', 'valid-document-capability']) {
    const result = await GET({ nextUrl: new URL(`https://example.test/?variant=final&access=${access}`) }, context())
    assert.equal(result.status, access === 'valid-document-capability' ? 200 : 404)
    assert.deepEqual(calls.at(-1), [ref, 'final', access])
    if (result.status === 200) assert.equal(result.headers['Cache-Control'], 'private, no-store')
  }
})

test('async booking prefill parameters authorize before loading customer details', async () => {
  let reads = 0
  const { GET } = loadRoute('src/app/api/quote/[ref]/booking-prefill/route.ts', {
    '@/lib/abuseProtection': { rateLimit: async () => null },
    '@/lib/quoteBookingAccess': { verifyQuoteBookingHandoffToken: async (quoteRef, token) => {
      assert.equal(quoteRef, ref)
      return token === 'valid-handoff'
    } },
    '@/lib/quoteData': { getQuoteByRef: async quoteRef => { assert.equal(quoteRef, ref); reads++; return { inputs: {} } } },
    '@/lib/quoteBookingPrefill': {
      buildBookingPrefillFromQuoteInputs: quoteRef => ({ quoteRef }),
      buildQuoteEditPrefillFromQuoteInputs: () => ({}),
    },
  })
  for (const handoff of ['', 'invalid', 'valid-handoff']) {
    const result = await GET({ nextUrl: new URL(`https://example.test/?handoff=${handoff}`) }, context())
    assert.equal(result.status, handoff === 'valid-handoff' ? 200 : 404)
    assert.equal(reads, handoff === 'valid-handoff' ? 1 : 0)
    if (result.status === 200) assert.equal(result.headers['Cache-Control'], 'private, no-store')
  }
})
