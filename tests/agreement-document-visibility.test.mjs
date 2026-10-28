import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleAgreementDocuments } from '../src/lib/agreementDocumentVisibility.ts'
const agreement={id:'a',version:2,status:'signed',signed_at:'2026-10-01T00:00:00Z',signed_file_name:'correct.pdf'}
const event=(id,action,date,extra={})=>({id,agreement_id:'a',action,target_id:null,created_at:date,after_evidence:{file_name:id+'.pdf',storage_path:'private/secret'},reason:'PRIVATE REASON',actor_name:'PRIVATE ACTOR',...extra})
test('agents see the current replacement and its correction date without private history',()=>{
 const result=visibleAgreementDocuments([agreement],[event('r','replace','2026-10-29T00:00:00Z')])
 assert.equal(result.signed.fileName,'correct.pdf');assert.equal(result.signed.replaced,true)
 assert.equal(result.signed.updatedAt,'2026-10-29T00:00:00Z')
 assert.doesNotMatch(JSON.stringify(result),/secret|PRIVATE|storage_path|before_evidence/)
})
test('supporting PDFs are visible with upload dates, but do not become signed agreements',()=>{
 const result=visibleAgreementDocuments([{...agreement,status:'sent',signed_file_name:null}],[event('rm','remove','2026-10-28T00:00:00Z'),event('s','support','2026-10-29T00:00:00Z')])
 assert.equal(result.signed,null);assert.equal(result.correctionPending,true)
 assert.equal(result.supporting[0].fileName,'s.pdf');assert.equal(result.supporting[0].uploadedAt,'2026-10-29T00:00:00Z')
 assert.equal(result.updatedAt,'2026-10-29T00:00:00Z')
})
test('removed supporting files and files on voided agreements are not exposed',()=>{
 const result=visibleAgreementDocuments([agreement,{...agreement,id:'void',version:1,status:'void'}],[event('s','support','2026-10-27T00:00:00Z'),event('rm','remove_support','2026-10-28T00:00:00Z',{target_id:'s'}),event('v','support','2026-10-29T00:00:00Z',{agreement_id:'void'})])
 assert.deepEqual(result.supporting,[])
})
test('a newer draft does not present an older signed version as the current agreement',()=>{
 const result=visibleAgreementDocuments([agreement,{...agreement,id:'new',version:3,status:'draft',signed_file_name:null,signed_at:null}],[])
 assert.equal(result.signed,null)
})
