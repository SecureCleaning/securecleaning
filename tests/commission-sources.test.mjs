import test from 'node:test'
import assert from 'node:assert/strict'
import { commissionSourceId, validateCommissionSourceRule } from '../src/lib/commissionSourcePolicy.ts'
import { normalizeCrmSourceType, buildContactSourceExplanation } from '../src/lib/clientCrmPolicy.ts'
import { commissionShares } from '../src/lib/commissionPolicy.ts'
import { leadCsv, parseLeadCsv } from '../src/lib/clientLeadCsv.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture'
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture'
const cove='c08e0000-0000-4000-8000-000000000001'
const renata='72bddeab-8e0e-4bb2-bee4-c48cafbeede6'
const input={id:cove,name:'Cove Commercial Cleaning',agentId:renata,agentBps:6000,active:true,revision:1}

test('stable source identity survives names, rejects invalid IDs and CSV round trips',()=>{
 assert.equal(commissionSourceId(`referral:${cove}`),cove)
 assert.equal(normalizeCrmSourceType(`referral:${cove}`),`referral:${cove}`)
 assert.equal(normalizeCrmSourceType('referral:fake'),null)
 assert.equal(commissionSourceId('Cove Commercial Cleaning'),null)
 assert.match(buildContactSourceExplanation({sourceType:`referral:${cove}`,sourceProvider:input.name}),/referred.*Cove Commercial Cleaning/)
 const rows=parseLeadCsv(leadCsv([{source_type:`referral:${cove}`,first_name:'Test',email:'test@example.com',postcode:'2000',city:'sydney',contact_basis:'enquiry'}]),[])
 assert.equal(rows[0].record.source_type,`referral:${cove}`)
 assert.deepEqual(rows[0].errors,[])
})

test('source rule validates total percentage, active recipient and optimistic version',()=>{
 assert.equal(validateCommissionSourceRule(input).agentBps,6000)
 for(const change of [{name:''},{agentId:''},{agentBps:10001},{agentBps:-1},{agentBps:'6000'},{agentBps:1.5},{active:'yes'},{revision:-1},{id:'fake'}]) assert.throws(()=>validateCommissionSourceRule({...input,...change}))
})

test('Cove total is 60% excluding GST with cumulative instalments, never 60% plus standard sale commission',()=>{
 assert.deepEqual(commissionShares(110000,10000,110000,6000,0,false),{win:60000,sale:0,combined:60000})
 assert.equal(commissionShares(110000,10000,55000,6000,0,true).combined,30000)
 assert.equal(commissionShares(110000,10000,55000,6000,0,false).combined,0)
 assert.equal(commissionShares(110000,10000,110000,2000,2000,false).combined,40000)
})

test('source management is owner-only and rejects stale edits; agent source choice is scoped',async()=>{
 const {saveCommissionSourceRule,resolveCrmCommissionSource,getCrmCommissionSources}=await import('../src/lib/commissionSources.ts')
 const original=global.fetch;let writes=0;let conflict=false
 global.fetch=async(url,options)=>{
  if(String(url).includes('/rpc/')) {writes++;return new Response(JSON.stringify(conflict?{code:'40001'}:null),{status:conflict?409:200,headers:{'Content-Type':'application/json'}})}
  const data={id:cove,name:input.name,agent_id:renata,agent_bps:6000,active:true,revision:1}
  return new Response(JSON.stringify(new URL(url).searchParams.has('id')?data:[data]),{headers:{'Content-Type':'application/json'}})
 }
 try {
  for(const role of ['agent','manager','viewer']) await assert.rejects(saveCommissionSourceRule({role,id:renata},input),/Only the owner/)
  assert.equal(writes,0)
  await saveCommissionSourceRule({role:'owner',id:'owner'},input)
  conflict=true;await assert.rejects(saveCommissionSourceRule({role:'owner',id:'owner'},input),/rule changed/)
  assert.equal((await resolveCrmCommissionSource({role:'agent',id:renata},`referral:${cove}`)).agent_id,renata)
  await assert.rejects(resolveCrmCommissionSource({role:'agent',id:'someone-else'},`referral:${cove}`),/another agent/)
  assert.deepEqual(await getCrmCommissionSources({role:'agent',id:'someone-else'}),[])
  assert.equal((await getCrmCommissionSources({role:'owner',id:'owner'}))[0].agent_bps,undefined)
 } finally {global.fetch=original}
})

test('CRM create uses the saved source and Renata, ignoring a different requested recipient or provider',async()=>{
 const {createManualCrmOpportunity}=await import('../src/lib/clientCrmData.ts')
 const original=global.fetch,writes=[]
 const actor={id:renata,role:'agent',active:true,availabilityAssigneeId:'nsw'}
 global.fetch=async(url,options)=>{
  const path=new URL(url).pathname;let value
  if(path.endsWith('/availability_private_config')) value={content:JSON.stringify({assignees:[{id:'nsw',city:'sydney',active:true}],weeklySlots:[]})}
  else if(path.endsWith('/commission_source_rules')) value={id:cove,name:input.name,agent_id:renata,active:true}
  else if(path.endsWith('/admin_staff_accounts')) value=[]
  else if(path.endsWith('/rpc/save_crm_record_with_premises')) {writes.push(JSON.parse(options.body).p_values);value='new-opportunity'}
  else throw new Error('Unexpected request '+path)
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
 }
 try {
  const draft={firstName:'Example',email:'fixture@example.com',postcode:'2000',contactBasis:'enquiry',sourceType:`referral:${cove}`,sourceProvider:'Spoofed provider',assignedStaffId:'someone-else'}
  await createManualCrmOpportunity(actor,draft)
  assert.equal(writes.length,1)
  assert.equal(writes[0].p_source_provider,'Cove Commercial Cleaning')
  assert.equal(writes[0].p_assigned_staff_id,renata)
  assert.equal(writes[0].p_source,`referral:${cove}`)
  await assert.rejects(createManualCrmOpportunity({...actor,id:'other'},draft),/another agent/)
  await assert.rejects(createManualCrmOpportunity(actor,{...draft,sourceType:'referral:bad'}),/valid enquiry source/)
  assert.equal(writes.length,1)
 } finally {global.fetch=original}
})
