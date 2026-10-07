import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function fixture(overrides={}) {
 const row={id:'p',updated_at:'v1',status:'withdrawn',assigned_staff_id:'owner',state:'NSW',annual_visits:26,client_price_per_visit_ex_gst_cents:16000,annual_contract_value_ex_gst_cents:416000,annual_value_method:'calculated',cleaner_scope_snapshot:{},...overrides}
 let update
 const query={select(){return this},eq(){return this},update(value){update=value;return this},async maybeSingle(){return {data:{...row,...update},error:null}}}
 const mocks={'server-only':{},'@/lib/supabase':{getAdminSupabase:()=>({from:()=>query})},'@/lib/contractProductPolicy':{canActorAccessContractProduct:(role,id,assigned)=>role==='owner'||id===assigned,calculateContractProductPricing:(rate,visits)=>({annualValueExGstCents:rate*visits})},'@/lib/contractProductListingDetails':{normalizeContractProductHours:()=>'',isValidContractProductHours:()=>true}}
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/contractProducts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,console,require:n=>mocks[n]??{}})
 const input={productId:'p',expectedUpdatedAt:'v1',heading:'Office',description:'Cleaning',annualVisits:26,timePreference:'after_hours',keyedJob:'keyed'}
 return {save:(values={},actor={id:'owner',role:'owner'})=>exports.updateContractProduct(actor,{...input,...values}),updated:()=>update}
}
test('manual annual value drives default purchase price and survives older requests',async()=>{
 const f=fixture();await f.save({annualValueMethod:'manual',annualValueExGst:'5000.01'});assert.equal(f.updated().annual_contract_value_ex_gst_cents,500001);assert.equal(f.updated().purchase_price_ex_gst_cents,250001)
 const old=fixture({annual_value_method:'manual',annual_contract_value_ex_gst_cents:500000});await old.save();assert.equal(old.updated().annual_contract_value_ex_gst_cents,500000)
})
test('calculated value restores rate times visits and manual purchase remains independent',async()=>{
 const f=fixture();await f.save({annualValueMethod:'calculated',annualVisits:52,pricingMethod:'manual',purchasePriceExGst:'1200'});assert.equal(f.updated().annual_contract_value_ex_gst_cents,832000);assert.equal(f.updated().purchase_price_ex_gst_cents,120000)
})
test('invalid annual amounts, stale versions, locked products and outside agents are rejected',async()=>{
 for(const annualValueExGst of ['','0','-1','NaN','10000001']) await assert.rejects(fixture().save({annualValueMethod:'manual',annualValueExGst}))
 await assert.rejects(fixture().save({expectedUpdatedAt:'old'}))
 for(const status of ['available','reserved','sold'])await assert.rejects(fixture({status}).save())
 await assert.rejects(fixture().save({}, {id:'other',role:'agent',productState:'NSW'}))
})
