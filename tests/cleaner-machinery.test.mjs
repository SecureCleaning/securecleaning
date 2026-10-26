import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCleanerMachinery } from '../src/lib/cleanerMachinery.ts'
import { sanitizeCleanerPortalPayload } from '../src/lib/cleanerPortalPolicy.ts'

test('machinery distinguishes omitted, not provided and confirmed none',()=>{
 assert.equal(parseCleanerMachinery(undefined),undefined)
 assert.equal(parseCleanerMachinery(null),null)
 assert.deepEqual(parseCleanerMachinery({items:[],other:'',notes:''}),{items:[],other:'',notes:''})
 assert.deepEqual(parseCleanerMachinery({items:['multi_wash','multi_wash'],other:'stale',notes:' Owned '}),{items:['multi_wash'],other:'',notes:'Owned'})
})
test('machinery rejects unknown choices, malformed objects, missing Other and oversized text',()=>{
 for(const value of [[],false,'test',{}, {items:['unknown'],other:'',notes:''}, {items:['other'],other:'  ',notes:''}, {items:[],other:'',notes:'x'.repeat(1001)}, {items:['other'],other:'x'.repeat(201),notes:''}, {items:[null],other:'',notes:''}, {items:[],other:'',notes:'',internalOwner:'attacker'}]) assert.throws(()=>parseCleanerMachinery(value))
})
test('secure update and onboarding whitelist machinery while retaining registered identity and excluding staff fields',()=>{
 const details={items:['rotary_buffer','other'],other:'Pressure washer',notes:'Hired when needed'}
 const payload=sanitizeCleanerPortalPayload({businessName:'Test',firstName:'Test',lastName:'Cleaner',state:'NSW',email:'attacker@example.invalid',specialistMachinery:details,status:'approved',notes:'internal'},'registered@example.invalid')
 assert.deepEqual(payload.specialistMachinery,details)
 assert.equal(payload.email,'registered@example.invalid');assert.equal(payload.status,undefined);assert.equal(payload.notes,undefined)
 assert.equal(sanitizeCleanerPortalPayload({businessName:'Test',firstName:'Test',lastName:'Cleaner',state:'NSW'},'registered@example.invalid').specialistMachinery,undefined)
})
