import test from 'node:test'
import assert from 'node:assert/strict'
import { searchBroadcastCleaners } from '../src/lib/broadcastCleanerSearch.ts'
const cleaners = [
  {id:'2',name:'zoe',businessName:'Alpha Cleaning',email:'zoe@example.com'},
  {id:'1',name:'Amy',businessName:'Bright Cleaning',email:'amy@example.com'},
  {id:'3',name:'bob',businessName:'Night Crew',email:'team@example.com'},
]
test('recipient list sorts alphabetically without mutating source order', () => {
 assert.deepEqual(searchBroadcastCleaners(cleaners,'').map(x=>x.name),['Amy','bob','zoe'])
 assert.equal(cleaners[0].name,'zoe')
})
test('typing narrows by name, business or email without case sensitivity', () => {
 assert.deepEqual(searchBroadcastCleaners(cleaners,' AMY@ ').map(x=>x.id),['1'])
 assert.deepEqual(searchBroadcastCleaners(cleaners,'night').map(x=>x.id),['3'])
 assert.deepEqual(searchBroadcastCleaners(cleaners,'zoe alpha').map(x=>x.id),['2'])
 assert.equal(searchBroadcastCleaners(cleaners,'unknown').length,0)
 assert.equal(searchBroadcastCleaners(cleaners,' ').length,3)
})
