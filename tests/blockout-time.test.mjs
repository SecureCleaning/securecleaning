import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultBlockoutEnd } from '../src/lib/blockoutTime.ts'

test('block-out ends one hour after a future start, retaining minutes and selected date', () => {
 assert.equal(defaultBlockoutEnd('2026-11-26T14:00:00+11:00'),'2026-11-26T04:00:00.000Z')
 assert.equal(defaultBlockoutEnd('2026-11-26T14:35:00+11:00'),'2026-11-26T04:35:00.000Z')
})
test('block-out hour handles midnight, year rollover and daylight-saving offsets', () => {
 assert.equal(defaultBlockoutEnd('2026-12-31T23:30:00Z'),'2027-01-01T00:30:00.000Z')
 assert.equal(defaultBlockoutEnd('2026-10-04T01:30:00+10:00'),'2026-10-03T16:30:00.000Z')
 assert.equal(defaultBlockoutEnd('2026-04-05T02:30:00+11:00'),'2026-04-04T16:30:00.000Z')
})
test('empty or invalid starts clear the generated end safely', () => {
 assert.equal(defaultBlockoutEnd(''),'')
 assert.equal(defaultBlockoutEnd('invalid'),'')
})
