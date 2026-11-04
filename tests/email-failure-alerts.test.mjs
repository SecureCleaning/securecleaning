import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'

const compile = name => ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const alertSource = compile('lib/emailFailureAlerts')
const sendSource = compile('lib/email')
const fixed = new Date('2026-11-04T10:00:00Z')
const failure = { payload: { to: 'client@example.test', subject: 'Appointment - BK-FIXTURE', html: 'PRIVATE BODY', attachments: [{ content: 'PRIVATE ATTACHMENT' }] }, outcome: 'uncertain', code: 'provider_outcome_uncertain', idempotencyKey: 'private-capability' }

function fixture(env = {}, options = {}) {
  const rows = [], calls = [], logs = []
  const db = {
    from(table) {
      assert.equal(table, 'email_failure_alerts')
      return {
        upsert(record) {
          return { select: () => ({ maybeSingle: async () => {
            if (options.databaseError) throw Error('PRIVATE DATABASE ERROR')
            if (rows.some(row => row.dedupe_key === record.dedupe_key)) return { data: null }
            const row = { ...record, id: `alert-${rows.length}`, status: 'pending' }; rows.push(row)
            return { data: { id: row.id } }
          } }) }
        },
        update(update) {
          const filters = {}
          const query = { eq(key, value) { filters[key] = value; return query }, then(resolve) {
            for (const row of rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))) Object.assign(row, update)
            resolve({ error: null })
          } }
          return query
        },
      }
    },
    async rpc(name, args) {
      assert.equal(name, 'claim_email_failure_alerts')
      const selected = rows.filter(row => row.status === 'pending' && !row.leased && (!args.p_id || row.id === args.p_id)).slice(0, args.p_limit)
      for (const row of selected) { row.leased = true; row.lease_token = crypto.randomUUID(); row.recipient ||= args.p_recipient }
      return { data: selected }
    },
  }
  const exports = {}
  const environment = { VERCEL_ENV: 'production', ADMIN_EMAIL: ' owner@example.test\n', RESEND_API_KEY: 'fake-key', ...env }
  vm.runInNewContext(alertSource, {
    exports, process: { env: environment }, Date, AbortSignal,
    console: { error: value => logs.push(value) },
    require: name => name === 'node:crypto' ? crypto : name === './supabase' ? { getAdminSupabase: () => db } : {},
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (options.fetchError) throw Error('PRIVATE TRANSPORT ERROR')
      return { ok: !options.reject, json: async () => options.reject ? { error: 'PRIVATE PROVIDER ERROR' } : { id: 'synthetic-alert-id' } }
    },
  })
  return { module: exports, rows, calls, logs, env: environment, options }
}

test('failure records deduplicate logical sends and omit bodies, attachments, raw errors and tokens', () => {
  const { module } = fixture()
  const record = module.emailFailureRecord(failure, fixed)
  assert.match(record.alert_text, /BK-FIXTURE/); assert.match(record.alert_text, /client@example.test/)
  assert.match(record.alert_text, /Delivery is uncertain/)
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE|private-capability/)
  assert.equal(record.dedupe_key, module.emailFailureRecord(failure, new Date('2026-11-05T10:00:00Z')).dedupe_key)
  assert.notEqual(record.dedupe_key, module.emailFailureRecord({ ...failure, idempotencyKey: 'another-send' }, fixed).dedupe_key)
  const noKey = { ...failure, idempotencyKey: undefined }
  assert.equal(module.emailFailureRecord(noKey, fixed).dedupe_key, module.emailFailureRecord(noKey, fixed).dedupe_key)
  assert.notEqual(module.emailFailureRecord(noKey, fixed).dedupe_key, module.emailFailureRecord(noKey, new Date('2026-11-05')).dedupe_key)
})
test('one owner alert is sent for duplicate failure reports; customer and CC addresses are never alert recipients', async () => {
  const f = fixture()
  await Promise.all([f.module.reportEmailFailure(failure), f.module.reportEmailFailure(failure)])
  assert.equal(f.rows.length, 1); assert.equal(f.calls.length, 1); assert.equal(f.rows[0].status, 'sent')
  const payload = JSON.parse(f.calls[0].init.body)
  assert.deepEqual(payload.to, ['owner@example.test'])
  assert.equal(payload.cc, undefined); assert.equal(payload.bcc, undefined)
  assert.equal(f.calls[0].init.headers['Idempotency-Key'], 'email-failure-alert/alert-0')
})
test('alert transport failures remain queued without recursion; retries freeze recipient, payload and key', async () => {
  const f = fixture({}, { fetchError: true })
  await f.module.reportEmailFailure(failure)
  assert.equal(f.rows.length, 1); assert.equal(f.calls.length, 1); assert.equal(f.rows[0].status, 'pending')
  f.rows[0].leased = false; f.env.ADMIN_EMAIL = 'different-owner@example.test'; f.options.fetchError = false
  await f.module.deliverEmailFailureAlerts()
  assert.equal(f.calls.length, 2); assert.equal(f.rows[0].status, 'sent')
  assert.equal(f.calls[0].init.body, f.calls[1].init.body)
  assert.equal(f.calls[0].init.headers['Idempotency-Key'], f.calls[1].init.headers['Idempotency-Key'])
})
test('provider rejection does not mark the owner alert sent', async () => {
  const f = fixture({}, { reject: true })
  await f.module.reportEmailFailure(failure)
  assert.equal(f.rows[0].status, 'pending'); assert.equal(f.calls.length, 1)
})
test('missing provider configuration retains queued alerts; preview and local runs never write or send alerts', async () => {
  const f = fixture({ RESEND_API_KEY: '' })
  await f.module.reportEmailFailure({ ...failure, outcome: 'not_sent', code: 'email_service_not_configured' })
  assert.equal(f.rows.length, 1); assert.equal(f.calls.length, 0)
  for (const VERCEL_ENV of ['preview', 'development', undefined]) {
    const isolated = fixture({ VERCEL_ENV })
    await isolated.module.reportEmailFailure(failure); await isolated.module.deliverEmailFailureAlerts()
    assert.equal(isolated.rows.length, 0); assert.equal(isolated.calls.length, 0)
  }
})
test('invalid owner configuration never falls back to a customer or agent', async () => {
  const f = fixture({ ADMIN_EMAIL: 'owner@example.test\nBcc: attacker@example.test' })
  await f.module.reportEmailFailure(failure)
  assert.equal(f.rows.length, 1); assert.equal(f.calls.length, 0)
  assert.equal(f.rows[0].recipient, undefined)
})
test('failure reporting swallows database outages without exposing raw errors', async () => {
  const f = fixture({}, { databaseError: true })
  await f.module.reportEmailFailure(failure)
  assert.equal(f.calls.length, 0); assert.equal(f.logs.length, 1)
  assert.doesNotMatch(f.logs.join(''), /PRIVATE/)
})

function sender(response, env = { RESEND_API_KEY: 'synthetic' }, reportError = false) {
  const exports = {}, failures = []; let attempts = 0
  vm.runInNewContext(sendSource, {
    exports, Headers, process: { env }, console: { warn() {}, error() {} },
    require: name => name === 'resend' ? { Resend: class { headers = {}; emails = { send: async () => { attempts++; if (response instanceof Error) throw response; return response } } } }
      : name === './siteUrl' ? { getSiteUrl: () => 'https://fixture.invalid' }
        : name === './emailFailureAlerts' ? { reportEmailFailure: async data => { failures.push(data); if (reportError) throw Error('report failed') } } : {},
  })
  return { module: exports, failures, attempts: () => attempts }
}
test('common sending captures definite rejection and preserves its original error even when alert reporting fails', async () => {
  const f = sender({ error: { name: 'validation_error', message: 'Synthetic rejection' } }, undefined, true)
  await assert.rejects(f.module.sendEmailOrThrow(failure.payload, { idempotencyKey: 'original-key' }), error => error instanceof f.module.EmailProviderRejectedError && error.message === 'Synthetic rejection')
  assert.equal(f.failures.length, 1); assert.equal(f.failures[0].outcome, 'provider_rejected')
  assert.equal(f.failures[0].idempotencyKey, 'original-key'); assert.equal(f.attempts(), 1)
})
test('network, server and missing-acknowledgement outcomes alert as uncertain without retrying the original email', async () => {
  for (const result of [Error('timeout'), { error: { name: 'application_error' } }, { error: { name: 'internal_server_error' } }, { data: {} }]) {
    const f = sender(result)
    await assert.rejects(f.module.sendEmailOrThrow(failure.payload))
    assert.equal(f.failures.length, 1); assert.equal(f.failures[0].outcome, 'uncertain'); assert.equal(f.attempts(), 1)
  }
})
test('unconfigured mail service alerts as not sent; success never creates a failure alert', async () => {
  const missing = sender({}, {})
  await assert.rejects(missing.module.sendEmailWithResult(failure.payload), /not configured/)
  assert.equal(missing.failures[0].outcome, 'not_sent'); assert.equal(missing.attempts(), 0)
  const success = sender({ data: { id: 'sent' } })
  assert.equal((await success.module.sendEmailOrThrow(failure.payload)).id, 'sent'); assert.equal(success.failures.length, 0)
})

test('scheduled owner alerts require worker authentication and still run when SMS is disabled or failing', async () => {
  const source = compile('app/api/sms/worker/route')
  for (const smsFails of [false, true]) {
    const exports = {}; let sms = 0, alerts = 0
    vm.runInNewContext(source, {
      exports, process: { env: { SMS_WORKER_SECRET: 'synthetic-worker-secret' } }, console: { error() {} },
      require: name => name === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
        : name === '@/lib/mobileMessage' ? { secureTokenMatch: (a,b) => a === b }
          : name === '@/lib/smsWorker' ? { runSmsWorker: async () => { sms++; if (smsFails) throw Error('SMS unavailable'); return { enabled: false } } }
            : { deliverEmailFailureAlerts: async () => { alerts++ } },
    })
    assert.equal((await exports.POST({ headers: new Headers() })).status,401)
    assert.equal(sms,0); assert.equal(alerts,0)
    const result = await exports.POST({ headers: new Headers({ authorization: 'Bearer synthetic-worker-secret' }) })
    assert.equal(result.status,smsFails ? 503 : 200); assert.equal(alerts,1); assert.equal(sms,1)
  }
})

test('admin warning shows outstanding alert count without exposing recipient, subject or stored content', async () => {
  const source = compile('lib/alerts')
  for (const response of [{ count: 2 }, { count: 0 }, { error: { message: 'PRIVATE DB ERROR' } }]) {
    const exports = {}
    const db = { from(table) {
      const result = table === 'email_failure_alerts' ? response : { data: [] }
      const query = { then(resolve) { resolve(result) } }
      for (const method of ['select','eq','neq','not','lt','order','limit','in']) query[method] = () => query
      return query
    } }
    vm.runInNewContext(source, {
      exports, Date, console,
      require: name => name === '@/lib/supabase' ? { getAdminSupabase: () => db }
        : name === '@/lib/adminAlertRanking.mjs' ? { rankAdminAlerts: rows => rows } : {},
    })
    const alerts = await exports.getAdminAlerts()
    assert.equal(alerts.length,response.count === 0 ? 0 : 1)
    if (alerts.length) { assert.equal(alerts[0].kind,'email_failure'); assert.equal(alerts[0].severity,'critical') }
    assert.doesNotMatch(JSON.stringify(alerts),/PRIVATE|@|alert_text/)
  }
})
