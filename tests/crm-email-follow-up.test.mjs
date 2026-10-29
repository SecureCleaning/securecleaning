import test from 'node:test'
import { createRequire } from 'node:module'
globalThis.require = createRequire(import.meta.url)
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service'
process.env.RESEND_API_KEY = 're_synthetic'
const { buildCrmOriginalEmailQuote, crmFollowUpSubject } = await import('../src/lib/crmEmailFollowUp.ts')
const { previewClientCrmEmail, sendClientCrmEmail } = await import('../src/lib/clientCrmEmail.ts')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor = { id: id(1), role: 'agent' }
const original = { id:id(2), opportunity_id:id(3), contact_id:id(4), to_email:'client@example.test', status:'sent', sent_at:'2026-10-20T01:00:00Z', subject_snapshot:'Original subject', body_snapshot:'Original message <script>alert(1)</script>', signature_snapshot:'Original signature', sender_name:'Original Sender', from_email:'agent@securecleaning.com.au' }
const input = { opportunityId:id(3), followUpToId:id(2), subject:'Re: Original subject', body:'Hi <<first_name>>, did you receive this?' }
function fixture(options={}) {
  const calls=[], sends=[], snapshots=[]
  return { calls,sends,snapshots,fetch:async (url,init={})=>{
    const parsed=new URL(String(url)), table=parsed.pathname.split('/').pop(), method=init.method || 'GET'
    calls.push(table)
    const body=init.body?JSON.parse(init.body):null
    let data
    if(parsed.hostname==='api.resend.com') { sends.push(body); data={id:'provider-id'} }
    else if(parsed.hostname!=='fixture.invalid') throw new Error('Unexpected external URL')
    else if(table==='admin_staff_accounts') data={id:actor.id,role:'agent',active:true,display_name:'Agent',job_title:'Regional Agent',phone:'0400000000',email:'agent@securecleaning.com.au'}
    else if(table==='crm_opportunities') data={id:id(3),primary_contact_id:id(4),organisation_id:id(5),site_id:null,assigned_staff_id:options.denied?id(99):actor.id}
    else if(table==='crm_opportunity_intakes') data={lead_id:id(6)}
    else if(table==='leads') data={email:'client@example.test',contact_basis:'enquiry',source_explanation:'you requested information'}
    else if(table==='clients') data={id:id(4),email:'client@example.test',first_name:'Test',unsubscribe_token:'fixture-token'}
    else if(table==='crm_organisations') data={id:id(5),business_name:'Example Business'}
    else if(table==='crm_communications' && method==='PATCH') { snapshots.push(body); data=null }
    else if(table==='crm_communications') data=parsed.searchParams.get('id')==='eq.'+id(2)?{...original,...options.original}:null
    else if(table==='crm_email_suppressions') data=options.suppressed?{reason:'unsubscribed'}:null
    else if(table==='claim_client_crm_communication') data=id(8)
    else if(table==='finalize_client_crm_communication') data=null
    else throw new Error('Unexpected fixture request '+table)
    return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
  }}
}
test('follow-up quotes text safely and avoids stacking Re prefixes',()=>{
  const quote=buildCrmOriginalEmailQuote(original,id(3),id(4),'client@example.test')
  assert.match(quote.html,/&lt;script&gt;/);assert.doesNotMatch(quote.html,/<script>/)
  assert.match(quote.text,/Original subject/);assert.match(quote.text,/20 Oct 2026/)
  assert.equal(crmFollowUpSubject('re: Hello'),'re: Hello');assert.equal(crmFollowUpSubject('Hello'),'Re: Hello')
  for(const patch of [{status:'unknown'},{status:'rejected'},{contact_id:id(9)},{opportunity_id:id(9)},{to_email:'other@example.test'},{sent_at:null},{body_snapshot:''}]) assert.throws(()=>buildCrmOriginalEmailQuote({...original,...patch},id(3),id(4),'client@example.test'))
})
test('real CRM preview/send path includes original and stores relationship using mocked services only',async()=>{
  const saved=globalThis.fetch, backend=fixture();globalThis.fetch=backend.fetch
  try {
    const preview=await previewClientCrmEmail(actor,input)
    assert.match(preview.html,/Hi Test/);assert.match(preview.html,/Earlier email/);assert.match(preview.html,/Original signature/)
    assert.equal(backend.sends.length,0)
    const result=await sendClientCrmEmail(actor,{...input,previewFingerprint:preview.previewFingerprint,idempotencyKey:id(10)})
    assert.equal(result.status,'sent');assert.equal(backend.sends.length,1)
    assert.equal(backend.sends[0].html,preview.html)
    assert.equal(backend.snapshots[0].follow_up_to_id,id(2))
    assert.match(backend.snapshots[0].final_text_snapshot,/Original subject/)
  } finally {globalThis.fetch=saved}
})
test('authorization, original recipient/status, suppression and preview changes block sending',async()=>{
  const saved=globalThis.fetch
  try {
    for(const options of [{denied:true},{original:{to_email:'other@example.test'}},{original:{status:'unknown'}}]){
      const backend=fixture(options);globalThis.fetch=backend.fetch
      await assert.rejects(previewClientCrmEmail(actor,input));assert.equal(backend.sends.length,0)
    }
    for(const options of [{suppressed:true},{}]){
      const backend=fixture(options);globalThis.fetch=backend.fetch
      const preview=await previewClientCrmEmail(actor,input)
      await assert.rejects(sendClientCrmEmail(actor,{...input,...(options.suppressed?{}:{followUpToId:null}),previewFingerprint:preview.previewFingerprint,idempotencyKey:id(11)}))
      assert.equal(backend.sends.length,0)
    }
  } finally {globalThis.fetch=saved}
})
