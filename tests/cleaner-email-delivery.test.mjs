import test from 'node:test'
import { createRequire } from 'node:module'
globalThis.require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
process.env.ADMIN_SESSION_SECRET = 'test-session-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.RESEND_API_KEY = 'test-resend-key'
const { parseCleanerEmailInput, renderCleanerEmail } = await import('../src/lib/cleanerEmailPolicy.ts')
const { previewCleanerEmail, deliverCleanerEmail } = await import('../src/lib/cleanerEmailDelivery.ts')
const { POST } = await import('../src/app/api/admin/cleaners/email/route.ts')
const { ADMIN_SESSION_COOKIE, createAdminSessionToken } = await import('../src/lib/adminAuth.ts')
const actor = { id: '11111111-1111-4111-8111-111111111111', username: 'staff', role: 'staff' }
const cleanerId = '22222222-2222-4222-8222-222222222222'
const draft = { emails: 'cleaner@example.test', subject: 'Hello {{first_name}}', body: 'Hi {{first_name}}', bodyHtml: '<p>Hi <strong>{{first_name}}</strong></p>' }
const sender = { displayName: 'Staff Member', jobTitle: 'Operations', phone: '0400000000', email: 'staff@example.test' }
const cleaner = { id: cleanerId, email: draft.emails, first_name: '<script>bad</script>', contact_name: 'Test Cleaner', business_name: 'Test Business', status: 'approved', broadcast_unsubscribe_token: 'test-token' }

test('recipient validation rejects duplicates, invalid addresses, oversized lists, unsupported fields and header injection', () => {
  for (const change of [{ emails: '' }, { emails: 'bad' }, { emails: 'a@example.test,A@example.test' }, { emails: Array.from({length:51},(_,i)=>`cleaner${i}@example.test`).join(',') }, { subject: 'Hello\nBcc: bad@example.test' }, { body: '{{internal_notes}}' }]) {
    assert.throws(() => parseCleanerEmailInput({ ...draft, ...change }))
  }
  assert.equal(parseCleanerEmailInput({ ...draft, emails: ' CLEANER@EXAMPLE.TEST ' }).emails[0], 'cleaner@example.test')
})
test('rich personalisation keeps formatting while escaping cleaner values and unsafe HTML', () => {
  const input = parseCleanerEmailInput({ ...draft, bodyHtml: draft.bodyHtml + '<script>alert(1)</script><a href="javascript:alert(1)">bad link</a>' })
  const rendered = renderCleanerEmail(input, cleaner, sender, 'https://example.test/unsubscribe?token=one')
  assert.match(rendered.html, /<strong>&lt;script&gt;bad&lt;\/script&gt;<\/strong>/)
  assert.doesNotMatch(rendered.html, /<script|javascript:/)
  assert.match(rendered.text, /Unsubscribe/)
  assert.match(rendered.html, /staff@example.test/)
})
test('new cleaner email API denies anonymous, viewer and regional agent sessions', async () => {
  for (const role of [null, 'viewer', 'agent']) {
    const headers = { 'Content-Type': 'application/json' }
    if (role) headers.cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken({ ...actor, role })}`
    const response = await POST(new NextRequest('https://example.test/api/admin/cleaners/email', { method:'POST', headers, body:JSON.stringify({ action:'send',...draft }) }))
    assert.equal(response.status, role ? 403 : 401)
  }
})
function backend(options = {}) {
  let batch = null
  let entries = []
  let sent = 0
  const rpcCalls = []
  const fetch = async (url, init = {}) => {
    const path = String(url)
    const body = init.body ? JSON.parse(init.body) : null
    const json = (value, status = 200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}})
    if (path.includes('api.resend.com')) {
      sent++
      assert.equal(Array.isArray(body.to) ? body.to[0] : body.to, draft.emails)
      assert.equal(body.cc, undefined)
      if (options.unknown) throw new Error('Provider timeout')
      if (options.failed) return json({statusCode:422,name:'validation_error',message:'Rejected'},422)
      return json({id:'provider-test-id'})
    }
    if (path.includes('/admin_staff_accounts?')) return json({id:actor.id,username:'staff',display_name:sender.displayName,job_title:sender.jobTitle,phone:sender.phone,email:sender.email,role:'staff',active:true})
    if (path.includes('/cleaners?')) return json([{...cleaner,status:options.rejected?'rejected':'approved'}])
    if (path.includes('/crm_email_suppressions?')) return json(options.suppressed?[{email_normalized:draft.emails}]:[])
    if (path.includes('/cleaner_broadcast_suppressions?')) return json([])
    if (path.includes('/cleaner_email_batches?')) return json(batch)
    if (path.includes('/cleaner_emails?')) return json(entries)
    if (path.includes('/rpc/')) {
      const rpc = path.split('/rpc/')[1];rpcCalls.push(rpc)
      if (rpc === 'reserve_cleaner_email_batch') {
        if (batch) return json(false)
        batch={id:body.p_id,actor_id:body.p_actor_id,input_hash:body.p_input_hash}
        entries=[{id:'33333333-3333-4333-8333-333333333333',cleaner_id:cleanerId,to_email:draft.emails,subject:draft.subject,delivery_outcome:'queued'}]
        return json(true)
      }
      if (rpc === 'claim_cleaner_email_delivery') {
        entries[0].delivery_outcome=options.changedAfterPreview?'skipped':'sending'
        return json(!options.changedAfterPreview)
      }
      if (rpc === 'complete_cleaner_email_delivery') { if(options.finalizeFailure) return json({message:'Synthetic database interruption'},500); entries[0].delivery_outcome=body.p_outcome; return new Response(null,{status:204}) }
    }
    throw new Error(`Unexpected test endpoint: ${new URL(path).pathname}`)
  }
  return {fetch,get sent(){return sent},rpcCalls}
}
test('preview/send uses server-approved recipients and preview binding, with durable replay protection', async () => {
  const previous=globalThis.fetch; const mock=backend();globalThis.fetch=mock.fetch
  try {
    const preview=await previewCleanerEmail(actor,draft)
    const request={...draft,requestId:'44444444-4444-4444-8444-444444444444',fingerprint:preview.fingerprint}
    await assert.rejects(deliverCleanerEmail(actor,{...request,subject:'Changed'}),/Preview again/i)
    assert.equal(mock.sent,0)
    const result=await deliverCleanerEmail(actor,request)
    assert.equal(result.recipients[0].delivery_outcome,'sent')
    assert.equal(mock.sent,1)
    assert.equal((await deliverCleanerEmail(actor,request)).duplicate,true)
    assert.equal(mock.sent,1)
  } finally {globalThis.fetch=previous}
})
test('rejected/suppressed recipients fail preview and eligibility changes at claim skip sending',async()=>{
  const previous=globalThis.fetch
  try {
    for(const setting of [{rejected:true},{suppressed:true}]){globalThis.fetch=backend(setting).fetch;await assert.rejects(previewCleanerEmail(actor,draft),/not an eligible/)}
    const mock=backend({changedAfterPreview:true});globalThis.fetch=mock.fetch
    const preview=await previewCleanerEmail(actor,draft)
    const result=await deliverCleanerEmail(actor,{...draft,requestId:'55555555-5555-4555-8555-555555555555',fingerprint:preview.fingerprint})
    assert.equal(result.recipients[0].delivery_outcome,'skipped');assert.equal(mock.sent,0)
  }finally{globalThis.fetch=previous}
})
test('provider rejection and unknown outcomes are recorded without automatic resend',async()=>{
  const previous=globalThis.fetch
  try{
    for(const [setting,outcome] of [[{failed:true},'failed'],[{unknown:true},'unknown']]){
      const mock=backend(setting);globalThis.fetch=mock.fetch
      const preview=await previewCleanerEmail(actor,draft)
      const request={...draft,requestId:'66666666-6666-4666-8666-666666666666',fingerprint:preview.fingerprint}
      assert.equal((await deliverCleanerEmail(actor,request)).recipients[0].delivery_outcome,outcome)
      await deliverCleanerEmail(actor,request);assert.equal(mock.sent,1)
    }
  }finally{globalThis.fetch=previous}
})

test('provider acceptance followed by finalization failure is never resent', async () => {
  const previous = globalThis.fetch
  const mock = backend({ finalizeFailure: true }); globalThis.fetch = mock.fetch
  try {
    const preview = await previewCleanerEmail(actor, draft)
    const request = { ...draft, requestId: '77777777-7777-4777-8777-777777777777', fingerprint: preview.fingerprint }
    try { await deliverCleanerEmail(actor, request) } catch { /* Status may remain pending after database failure. */ }
    const replay = await deliverCleanerEmail(actor, request)
    assert.equal(replay.duplicate, true)
    assert.equal(replay.recipients[0].delivery_outcome, 'sending')
    assert.equal(mock.sent, 1)
  } finally { globalThis.fetch = previous }
})
