import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { buildCleanerScopePdf } from '../src/lib/contractSaleChecklistPdf.ts'
import { DEFAULT_CLEANER_SCOPE_EMAIL_TEMPLATE, cleanerScopeEmailDraft } from '../src/lib/cleanerScopeEmailTemplate.ts'
import * as templateDefinitions from '../src/lib/cleanerScopeEmailTemplate.ts'
import * as mergeFields from '../src/lib/emailMergeFields.ts'
import { parseRichEmailContent, richEmailFingerprint } from '../src/lib/richEmailServer.ts'
import { plainTextToEmailHtml } from '../src/lib/richEmailContent.ts'
const scope = { summary:'Office cleaning', frequency:'weekly', timePreference:'after_hours', floorArea:10, floors:1,selectedOptions:[],rooms:[{label:'Office',quantity:1,size:10,floor:1,description:'Clean thoroughly',tasks:[{label:'Dust',cadence:'weekly'}],selectedOptions:['Bins - as needed']}],clientName:'SECRET CUSTOMER',siteAddress:'SECRET STREET',price:100 }
const compiled=ts.transpileModule(readFileSync('src/lib/contractSaleScopeEmail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const require=createRequire(import.meta.url)
class ProductError extends Error {}
class Rejected extends Error {}
const templateCompiled=ts.transpileModule(readFileSync('src/lib/cleanerScopeEmailTemplateServer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
function templateHarness() {
 let row=null;let writes=0;const audits=[]
 const db={from(){let value;const q={select(){return q},eq(){return q},maybeSingle(){return q},single(){return q},upsert(v){value=v;return q},then(resolve){if(value){row=value;writes++}return Promise.resolve({data:row,error:null}).then(resolve)}};return q}}
 const modules={'server-only':{},'@/lib/supabase':{getAdminSupabase:()=>db},'@/lib/contractProducts':{ContractProductError:ProductError},'@/lib/richEmailServer':{parseRichEmailContent},'@/lib/emailMergeFields':mergeFields,'@/lib/cleanerScopeEmailTemplate':templateDefinitions,'@/lib/auditLog':{writeAuditLogStrict:async(...args)=>audits.push(args)}}
 const mod={exports:{}};new Function('require','module','exports',templateCompiled)(id=>modules[id]??require(id),mod,mod.exports)
 return {...mod.exports,writes:()=>writes,audits}
}
const {parseCleanerScopeMessage}=templateHarness()
function harness(options={}) {
 const rows=new Map();const sends=[];let auth=0
 const state={scope:structuredClone(scope),email:'cleaner@example.com',template:structuredClone(DEFAULT_CLEANER_SCOPE_EMAIL_TEMPLATE)}
 const db={from(table){let op='select',value;const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},single(){return q},maybeSingle(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},then(resolve){let data=null,error=null;if(table==='cleaners')data={email:state.email};else if(op==='insert'){if(rows.has(value.id)||[...rows.values()].some(r=>['pending','unknown'].includes(r.status)))error={code:'23505'};else rows.set(value.id,{...value})}else if(op==='update'){if(options.updateFails)error={message:'failed'};else Object.assign(rows.get(filters.id),value)}else data=rows.get(filters.id)||null;return Promise.resolve({data,error}).then(resolve)}};return q}}
 const modules={
  'server-only':{},'@/lib/supabase':{getAdminSupabase:()=>db},
  '@/lib/contractSales':{getAuthorizedSale:async()=>{auth++;if(options.denied)throw new ProductError('Denied');return {status:options.status||'completed',product_id:'product',cleaner_id:'cleaner'}}},
  '@/lib/contractProducts':{ContractProductError:ProductError,getContractProductCleanerScope:async()=>{if(options.privateScope)throw new ProductError('Private scope');return {productCode:'C001',scope:state.scope}}},
  '@/lib/contractSalePolicy':{normalizeInvoiceEmail:v=>v?.includes('@')?v:null},
  '@/lib/cleanerScopeEmailTemplate':{cleanerScopeEmailDraft},'@/lib/cleanerScopeEmailTemplateServer':{parseCleanerScopeMessage,loadCleanerScopeEmailTemplate:async()=>state.template},
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

test('personalised subject and rich message are previewed and archived exactly; later edits invalidate preview',async()=>{
 const h=harness();const draft={subject:'Your cleaning scope with a personal note',body:'Thank you for your help, see you Monday.',bodyHtml:'<p>Thank you for your <strong>help</strong>, see you Monday.</p><script>bad()</script>'}
 const p=await h.run({action:'scope-email.preview',...draft})
 assert.equal(p.subject,draft.subject);assert.match(p.html,/<strong>help<\/strong>/);assert.doesNotMatch(p.html,/script|bad\(\)/)
 for(const change of [{subject:'Changed subject'},{body:'Changed message',bodyHtml:'<p>Changed message</p>'}]) {
   await assert.rejects(h.run({action:'scope-email.send',...draft,...change,fingerprint:p.fingerprint,requestId}),/Preview it again/)
 }
 assert.equal(h.sends.length,0)
 await h.run({action:'scope-email.send',...draft,fingerprint:p.fingerprint,requestId})
 assert.equal(h.sends[0].payload.subject,p.subject);assert.equal(h.sends[0].payload.html,p.html);assert.equal(h.rows.get(requestId).html,p.html)
})
test('draft uses saved master wording and safe merge fields; preview of edited draft survives later master changes',async()=>{
 const h=harness();h.state.template.subject='Your scope <<product_code>>';h.state.template.bodyText='Prepared by <<sender_name>> for <<cleaner_first_name>>.'
 const draft=await h.run({action:'scope-email.draft'})
 assert.equal(draft.subject,'Your scope C001');assert.equal(draft.body,'Prepared by Staff for there.')
 assert.equal(h.rows.size,0);assert.equal(h.sends.length,0)
 const p=await h.run({action:'scope-email.preview',...draft})
 h.state.template.bodyText='New master template'
 await h.run({action:'scope-email.send',...draft,fingerprint:p.fingerprint,requestId})
 assert.match(h.sends[0].payload.html,/Prepared by Staff/)
})
test('empty, oversized or header-injected custom email is rejected without send',async()=>{
 for(const draft of [{subject:'',body:'Hello'}, {subject:'a'.repeat(201),body:'Hello'}, {subject:'Hello\r\nBcc: other@example.com',body:'Hello'}, {subject:'Hello',body:''}, {subject:'Hello',body:'a'.repeat(10001)}]) {
 const h=harness();await assert.rejects(h.run({action:'scope-email.preview',...draft}));assert.equal(h.sends.length,0);assert.equal(h.rows.size,0)
 }
})

test('master template persists, sanitises, audits and denies agents or customer merge fields',async()=>{
 const h=templateHarness();const run=(role,input)=>h.manageCleanerScopeEmailTemplate({id:'staff',role},input)
 assert.equal((await h.loadCleanerScopeEmailTemplate()).subject,DEFAULT_CLEANER_SCOPE_EMAIL_TEMPLATE.subject)
 await assert.rejects(run('agent',{action:'scope-email-template.get'}),/Only an owner or manager/)
 await assert.rejects(run('agent',{action:'scope-email-template.update',subject:'Scope',bodyText:'Hello'}),/Only an owner or manager/)
 await assert.rejects(run('owner',{action:'scope-email-template.update',subject:'Scope <<site_address>>',bodyText:'Hello'}),/unsupported/)
 assert.equal(h.writes(),0)
 const input={action:'scope-email-template.update',subject:'Scope <<product_code>>',bodyText:'Hello <<cleaner_first_name>>, thank you!',bodyHtml:'<p>Hello &lt;&lt;cleaner_first_name&gt;&gt;, <b>thank you!</b></p><script>bad()</script>'}
 await run('manager',input)
 const loaded=(await run('owner',{action:'scope-email-template.get'})).template
 assert.equal(loaded.subject,input.subject);assert.match(loaded.bodyHtml,/<b>thank you!<\/b>/);assert.doesNotMatch(loaded.bodyHtml,/script/)
 assert.equal(h.writes(),1);assert.equal(h.audits.length,1)
 const draft=cleanerScopeEmailDraft(loaded,{product_code:'C001',cleaner_first_name:'Alex & Pat',sender_name:'Staff'})
 assert.match(draft.bodyHtml,/Alex &amp; Pat/);assert.equal(draft.bodyDocument,null)
})
