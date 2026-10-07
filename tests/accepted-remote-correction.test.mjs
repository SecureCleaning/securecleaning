import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function fixture(role='owner', quoteOverrides={}) {
 const writes=[]
 const quote={status:'accepted',firmQuoteDraft:{status:'accepted'},inputs:{},workflowColumnsAvailable:true,finalDocument:null,...quoteOverrides}
 const mocks={
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
 '@/lib/adminAuth':{isAuthorizedAdminRequest:async(_,required)=>required?role===required:!!role,getAdminSessionIdentityFromRequest:async()=>role?{id:'owner',username:'Owner',role}:null},
 '@/lib/quoteWorkflowData':{getQuoteWorkflowByRef:async()=>quote,QuoteWorkflowConflictError:class extends Error{},reviseQuoteWorkflowByRef:async(...args)=>{writes.push(args);return{version:1}},saveQuoteWorkflowByRef:async()=>{throw Error('normal save must not run')},reviewQuoteWorkflowByRef:async()=>{throw Error('normal review must not run')}},
 '@/lib/quoteWorkflow':{isEditableFirmQuoteStatus:v=>['draft','reviewed'].includes(v),parseFirmQuoteDraft:v=>v,parseInspectionReport:v=>v,getFinalQuoteReadiness:()=>({ready:true})},
 '@/lib/roomTypeConfig':{getQuoteRoomTypeConfig:async()=>({})},'@/lib/pricing':{getQuotePricingConfig:async()=>({})}}
 const code=ts.transpileModule(readFileSync(new URL('../src/app/api/admin/quotes/[ref]/workflow/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,console,Date,require:n=>mocks[n]})
 const send=body=>exports.POST({json:async()=>body},{params:Promise.resolve({ref:'SC-TEST'})})
 return{send,writes}
}
const body={firmQuoteDraft:{status:'accepted'},inspectionReport:{},initializeAccepted:true,expectedUpdatedAt:'2026-10-07T01:00:00Z'}
test('owner can explicitly initialise an accepted correction with a stale-page token',async()=>{
 const f=fixture();const result=await f.send(body);assert.equal(result.status,200);assert.equal(result.body.status,'accepted');assert.equal(f.writes[0][1],0);assert.equal(f.writes[0].at(-1),body.expectedUpdatedAt)
})
test('accepted remote correction rejects other roles, absent intent and malformed tokens',async()=>{
 for(const role of ['manager','staff','agent',null]){const f=fixture(role);assert.ok((await f.send(body)).status>=400);assert.equal(f.writes.length,0)}
 for(const changes of [{initializeAccepted:false},{expectedUpdatedAt:null},{expectedUpdatedAt:'invalid'},{firmQuoteDraft:{status:'draft'}}]){const f=fixture();assert.ok((await f.send({...body,...changes})).status>=400);assert.equal(f.writes.length,0)}
 const f=fixture('owner',{status:'pending',firmQuoteDraft:{status:'draft'}});assert.equal((await f.send(body)).status,400)
})
