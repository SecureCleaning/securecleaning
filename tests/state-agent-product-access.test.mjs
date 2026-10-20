import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessStateProduct } from '../src/lib/contractProductAccess.ts'
import { canManageContractSale } from '../src/lib/contractSalePolicy.ts'
import { resolveInvoiceSelection } from '../src/lib/invoiceDirectoryPolicy.ts'

test('product and sale access follows state, not original assignment', () => {
  for (const policy of [canAccessStateProduct, canManageContractSale]) {
    for (const agent of ['original-agent', 'second-agent']) assert.equal(policy('agent', agent, 'NSW', 'NSW'), true)
    for (const [role,id,state,target] of [['agent','a','VIC','NSW'],['agent','a',null,'NSW'],['agent','a',null,null],['agent','','NSW','NSW'],['cleaner','a','NSW','NSW']]) assert.equal(policy(role,id,state,target),false)
    assert.equal(policy('owner','o',null,'NSW'),true)
    assert.equal(policy('manager','m',null,'VIC'),true)
  }
})
test('another same-state agent can open a sale invoice deep link', () => {
  const sale={id:'sale',assignedStaffId:'first',state:'NSW',invoices:[{id:'invoice'}]}
  assert.equal(resolveInvoiceSelection([sale],{id:'second',role:'agent',state:'NSW'},'sale','invoice'),sale)
  assert.throws(()=>resolveInvoiceSelection([sale],{id:'second',role:'agent',state:'VIC'},'sale','invoice'))
})
