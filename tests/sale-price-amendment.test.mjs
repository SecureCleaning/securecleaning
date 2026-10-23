import test from 'node:test'
import assert from 'node:assert/strict'
import { remainingPlanRows, parseAmendedPrice } from '../src/lib/saleAmendmentPolicy.ts'

test('replacement schedules retain unpaid dates and deduct only payments since the plan opened', () => {
 const rows=[{dueOn:'2026-10-23',amountCents:50000},{dueOn:'2026-11-23',amountCents:100000},{dueOn:'2026-12-23',amountCents:150000}]
 assert.deepEqual(remainingPlanRows(rows,75000,0),[{dueOn:'2026-11-23',amountCents:75000},rows[2]])
 assert.deepEqual(remainingPlanRows(rows,50000,50000),rows)
 assert.deepEqual(remainingPlanRows(rows,300000,0),[])
 assert.equal(rows[0].amountCents,50000)
})
test('amendment prices respect cents, deposit and confirmed receipts',()=>{
 assert.equal(parseAmendedPrice('2500.01',50000,50000),250001)
 for(const value of ['','NaN','1e4','2500.001','-1','500.00','999999999999']) assert.throws(()=>parseAmendedPrice(value,50000,0))
 assert.throws(()=>parseAmendedPrice('600',50000,70000),/below confirmed/)
 assert.equal(parseAmendedPrice('700',50000,70000),70000)
})
