import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCommissionRevision } from '../src/lib/commissionRevision.ts'
const saleId='00000000-0000-4000-8000-000000000010'
const input={action:'preview_revision',saleId,winBps:2000,saleBps:2000,reason:'Agreed correction'}
test('revision inputs require exact rates, a reason, sale identity and reviewed confirmation',()=>{
 assert.equal(validateCommissionRevision(input).winBps,2000)
 for(const change of [{winBps:-1},{winBps:10001},{winBps:8000,saleBps:3000},{winBps:20.5},{winBps:'2000'},{reason:' '},{reason:'x'.repeat(1001)},{saleId:'bad'}]) assert.throws(()=>validateCommissionRevision({...input,...change}))
 assert.throws(()=>validateCommissionRevision({...input,action:'revise'}),/Preview/)
 assert.doesNotThrow(()=>validateCommissionRevision({...input,action:'revise',requestId:saleId,expected:{}}))
})
test('backend denies agents before database access and routes owner preview/confirmation separately',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role-key'
 const {manageCommission}=await import('../src/lib/commissions.ts')
 const original=globalThis.fetch;let calls=[]
 globalThis.fetch=async(url,options)=>{
  calls.push({url:String(url),body:JSON.parse(options.body)})
  return new Response(JSON.stringify({saleId,before:[],after:[]}),{headers:{'Content-Type':'application/json'}})
 }
 try {
  for(const role of ['agent','manager']) for(const action of ['preview_revision','revise']) await assert.rejects(manageCommission({id:saleId,role},{...input,action}),/owner/)
  assert.equal(calls.length,0)
  const result=await manageCommission({id:saleId,role:'owner'},input)
  assert.equal(result.preview.saleId,saleId)
  assert.match(calls[0].url,/preview_contract_commission_revision/)
  await manageCommission({id:saleId,role:'owner'},{...input,action:'revise',expected:result.preview,requestId:saleId})
  assert.match(calls[1].url,/revise_contract_commission/)
  assert.deepEqual(calls[1].body.p_expected,result.preview)
  globalThis.fetch=async()=>new Response(JSON.stringify({code:'40001',message:'changed'}),{status:400,headers:{'Content-Type':'application/json'}})
  await assert.rejects(manageCommission({id:saleId,role:'owner'},input),/Preview again/)
 }finally{globalThis.fetch=original}
})
