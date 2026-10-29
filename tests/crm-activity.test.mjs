import test from 'node:test'
import assert from 'node:assert/strict'
import { crmActivity } from '../src/lib/crmActivity.ts'
const notes=[{id:'n',createdAt:'2026-10-20',body:'Private note'}]
const emails=[{id:'e',createdAt:'2026-10-19',sentAt:'2026-10-21',status:'sent'}, {id:'old',createdAt:'2026-10-01',sentAt:null,status:'unknown'}]
test('activity merges notes and emails newest first using sent time, without mutating inputs',()=>{
 assert.deepEqual(crmActivity(notes,emails,'all').map(e=>e.value.id),['e','n','old'])
 assert.deepEqual(crmActivity(notes,emails,'notes').map(e=>e.value.id),['n'])
 assert.deepEqual(crmActivity(notes,emails,'emails').map(e=>e.value.id),['e','old'])
 assert.equal(emails[0].id,'e'); assert.equal(crmActivity(notes,emails,'all')[2].value.status,'unknown')
})
test('combined history defers old emails until older notes have loaded',()=>{
 assert.deepEqual(crmActivity(notes,emails,'all','2026-10-20|n').map(e=>e.value.id),['e','n'])
 assert.deepEqual(crmActivity(notes,emails,'emails','2026-10-20|n').map(e=>e.value.id),['e','old'])
 assert.deepEqual(crmActivity([],[],'all'),[])
})
