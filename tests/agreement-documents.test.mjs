import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDocumentCorrection, assertAgreementPdf } from '../src/lib/agreementDocumentPolicy.ts'
test('document corrections require a deliberate action, reason and revision', () => {
 assert.deepEqual(parseDocumentCorrection('remove',' Wrong contract ',0),{action:'remove',reason:'Wrong contract',revision:0})
 for(const action of ['delete','approve','',null]) assert.throws(()=>parseDocumentCorrection(action,'Wrong file',0))
 for(const reason of ['',null,'oops','x'.repeat(1001)]) assert.throws(()=>parseDocumentCorrection('replace',reason,0))
 for(const revision of [null,'',-1,1.2,'NaN']) assert.throws(()=>parseDocumentCorrection('support','Additional page',revision))
})
test('uploaded evidence must be a bounded PDF with PDF signature', () => {
 assert.doesNotThrow(()=>assertAgreementPdf({type:'application/pdf',size:12},Buffer.from('%PDF-1.7\n')))
 for(const type of ['text/html','image/png','']) assert.throws(()=>assertAgreementPdf({type,size:12},Buffer.from('%PDF-1.7')))
 for(const size of [0,10*1024*1024+1]) assert.throws(()=>assertAgreementPdf({type:'application/pdf',size},Buffer.from('%PDF-1.7')))
 assert.throws(()=>assertAgreementPdf({type:'application/pdf',size:20},Buffer.from('<html>bad')))
})
