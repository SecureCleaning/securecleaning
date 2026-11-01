import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { buildCleanerScopePdf } from '../src/lib/contractSaleChecklistPdf.ts'
import { richEmailFingerprint } from '../src/lib/richEmailServer.ts'
import { plainTextToEmailHtml } from '../src/lib/richEmailContent.ts'
const scope = { summary:'Office cleaning', frequency:'weekly', timePreference:'after_hours', floorArea:10, floors:1,selectedOptions:[],rooms:[{label:'Office',quantity:1,size:10,floor:1,description:'Clean thoroughly',tasks:[{label:'Dust',cadence:'weekly'}],selectedOptions:['Bins - as needed']}],clientName:'SECRET CUSTOMER',siteAddress:'SECRET STREET',price:100 }
const compiled=ts.transpileModule(readFileSync('src/lib/contractSaleScopeEmail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const require=createRequire(import.meta.url)
class ProductError extends Error {}
class Rejected extends Error {}
function harness(options={}) {
 const rows=new Map();const sends=[];let auth=0
 const state={scope:structuredClone(scope),email:'cleaner@example.com'}
 const db={from(table){let op='select',value;const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},single(){return q},maybeSingle(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},then(resolve){let data=null,error=null;if(table==='cleaners')data={email:state.email};else if(op==='insert'){if(rows.has(value.id)||[...rows.values()].some(r=>['pending','unknown'].includes(r.status)))error={code:'23505'};else rows.set(value.id,{...value})}else if(op==='update'){if(options.updateFails)error={message:'failed'};else Object.assign(rows.get(filters.id),value)}else data=rows.get(filters.id)||null;return Promise.resolve({data,error}).then(resolve)}};return q}}
 const modules={
  'server-only':{},'@/lib/supabase':{getAdminSupabase:()=>db},
  '@/lib/contractSales':{getAuthorizedSale:async()=>{auth++;if(options.denied)throw new ProductError('Denied');return {status:options.status||'completed',product_id:'product',cleaner_id:'cleaner'}}},
  '@/lib/contractProducts':{ContractProductError:ProductError,getContractProductCleanerScope:async()=>{if(options.privateScope)throw new ProductError('Private scope');return {productCode:'C001',scope:state.scope}}},
  '@/lib/contractSalePolicy':{normalizeInvoiceEmail:v=>v?.includes('@')?v:null},
  '@/lib/contractSaleChecklistPdf':{buildCleanerScopePdf},'@/lib/richEmailContent':{plainTextToEmailHtml},'@/lib/richEmailServer':{richEmailFingerprint},
  '@/lib/email':{EmailProviderRejectedError:Rejected,sendEmailOrThrow:async(payload,opts)=>{sends.push({payload,opts});if(options.fail==='unknown')throw new Error('timeout');if(options.fail==='rejected')throw new Rejected();return {id:'provider'}}},
  '@/lib/auditLog':{writeAuditLogStrict:async()=>{if(options.auditFails)throw new Error('audit failed')}},
 }
 const mod={exports:{}};new Function('require','module','exports',compiled)(id=>modules[id]??require(id),mod,mod.exports)
 return {run:input=>mod.exports.contractSaleScopeEmail({id:'staff',email:'staff@example.com',displayName:'Staff'}, {saleId:'sale',...input}),state,rows,sends,auth:()=>auth}
}
const requestId='11111111-1111-4111-8111-111111111111'
const preview=h=>h.run({action:'scope-email.preview',to:'attacker@example.com'})
const send=(h,p,id=requestId)=>h.run({action:'scope-email.send',fingerprint:p.fingerprint,requestId:id})
test('scope-only PDF excludes record details and retains long saved text',()=>{
 const longScope=structuredClone(scope);longScope.rooms[0].description='Long description '.repeat(100)+'LAST DESCRIPTION';longScope.rooms[0].tasks.push('Task '.repeat(100)+'LAST TASK')
 const pdf=buildCleanerScopePdf('C001',longScope).toString('latin1')
 assert.match(pdf,/%PDF/);assert.match(pdf,/LAST DESCRIPTION/);assert.match(pdf,/LAST[\s\S]*TASK/);assert.match(pdf,/weekly/)
 for(const v of ['SECRET CUSTOMER','SECRET STREET','NEW SITE CHECKLIST'])assert.ok(!pdf.includes(v))
})
test('preview is read-only, fixes cleaner recipient and contains exact attachment',async()=>{
 const h=harness();const p=await preview(h);assert.equal(p.to,'cleaner@example.com');assert.equal(h.sends.length,0);assert.equal(h.rows.size,0);assert.deepEqual(Buffer.from(p.attachment.content,'base64'),buildCleanerScopePdf('C001',scope))
})
test('send archives and transmits preview bytes once with provider idempotency key',async()=>{
 const h=harness();const p=await preview(h);await send(h,p);await send(h,p)
 assert.equal(h.sends.length,1);assert.deepEqual(h.sends[0].payload.attachments,[p.attachment]);assert.deepEqual(h.rows.get(requestId).attachments,[p.attachment]);assert.equal(h.rows.get(requestId).status,'sent');assert.equal(h.sends[0].opts.idempotencyKey,`cleaner-scope-${requestId}`);assert.equal(h.auth(),3)
})
test('scope or cleaner changes invalidate preview',async()=>{
 for(const mutate of [h=>h.state.email='other@example.com',h=>h.state.scope.rooms[0].tasks.push('Changed task')]){const h=harness();const p=await preview(h);mutate(h);await assert.rejects(send(h,p),/Preview it again/);assert.equal(h.sends.length,0)}
})
test('denied, cancelled, private scope, missing recipient and missing preview never send',async()=>{
 for(const options of [{denied:true},{status:'cancelled'},{privateScope:true}]){const h=harness(options);await assert.rejects(preview(h));assert.equal(h.sends.length,0)}
 const h=harness();h.state.email='';await assert.rejects(preview(h),/valid email/)
 await assert.rejects(send(harness(),{fingerprint:'bad'}),/Preview it again/)
})
test('uncertain sends and archive failures block another delivery',async()=>{
 for(const options of [{fail:'unknown'},{updateFails:true},{auditFails:true}]){const h=harness(options);const p=await preview(h);await assert.rejects(send(h,p),/uncertain/);await assert.rejects(send(h,p,'22222222-2222-4222-8222-222222222222'),/pending|uncertain/);assert.equal(h.sends.length,options.auditFails?0:1)}
})
test('definitive rejection is recorded as failed',async()=>{const h=harness({fail:'rejected'});const p=await preview(h);await assert.rejects(send(h,p),/rejected/);assert.equal(h.rows.get(requestId).status,'failed')})
