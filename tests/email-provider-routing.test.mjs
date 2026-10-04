import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as ts from 'typescript'
const require = createRequire(import.meta.url)
const source = ts.transpileModule(readFileSync(new URL('../src/lib/email.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const email = {}
vm.runInNewContext(source, {
  exports: email,
  require: name => name === 'resend' ? require('resend') : name === './siteUrl' ? { getSiteUrl: () => 'https://example.test' } : {},
  process: { env: { RESEND_API_KEY: 're_synthetic_test_key' } }, console,
})
test('both email helpers send reply-to through the installed SDK using the provider field name', async () => {
  const saved = globalThis.fetch
  try {
    for (const send of [email.sendEmailOrThrow, email.sendEmailWithResult]) {
      let sent
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), 'https://api.resend.com/emails')
        sent = JSON.parse(options.body)
        return new Response(JSON.stringify({ id: 'test-provider-id' }), { headers: { 'Content-Type': 'application/json' } })
      }
      const input = { from: 'quotes@example.test', to: 'cleaner@example.test', cc: 'agent@example.test', replyTo: 'agent@example.test', subject: 'Test', html: '<p>Test</p>', attachments: [{ filename: 'invite.ics', content: 'test' }] }
      assert.equal((await send(input)).id, 'test-provider-id')
      assert.equal(sent.reply_to, 'agent@example.test')
      assert.equal('replyTo' in sent, false)
      assert.equal(sent.cc, input.cc)
      assert.deepEqual(sent.attachments, input.attachments)
      assert.equal(input.replyTo, 'agent@example.test')
    }
  } finally { globalThis.fetch = saved }
})
test('explicit provider reply-to takes precedence without changing other headers', async () => {
  const saved = globalThis.fetch
  try {
    let sent
    globalThis.fetch = async (_, options) => { sent = JSON.parse(options.body); return new Response('{"id":"test"}', { headers: { 'Content-Type': 'application/json' } }) }
    await email.sendEmailOrThrow({ replyTo: 'legacy@example.test', reply_to: ['explicit@example.test'], headers: { 'X-Test': 'yes' } })
    assert.deepEqual(sent.reply_to, ['explicit@example.test'])
    assert.deepEqual(sent.headers, { 'X-Test': 'yes' })
  } finally { globalThis.fetch = saved }
})
test('provider rejection retains the definitive-rejection error used by send reconciliation', async () => {
  const saved = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('{"message":"Rejected test","name":"validation_error"}', { status: 422, headers: { 'Content-Type': 'application/json' } })
    await assert.rejects(email.sendEmailOrThrow({ replyTo: 'agent@example.test' }), error => error instanceof email.EmailProviderRejectedError && error.outcome === 'provider_rejected')
  } finally { globalThis.fetch = saved }
})
