import test from 'node:test'
import assert from 'node:assert/strict'
import { commissionCents, commissionShares, parsePlanInstalments } from '../src/lib/commissionPolicy.ts'

test('commission excludes GST and releases only full payment or active-plan receipts', () => {
  assert.equal(commissionCents(550000,50000,55000,2500,false),0)
  assert.equal(commissionCents(550000,50000,55000,2500,true),12500)
  assert.equal(commissionCents(550000,50000,550000,2500,false),125000)
  assert.equal(commissionCents(550000,50000,550000,2500,true),125000)
  assert.equal(commissionCents(550000,50000,600000,2500,true),125000)
  let accrued=0
  for(let paid=1;paid<=1001;paid++) accrued+=commissionCents(1001,91,paid,2500,true)-commissionCents(1001,91,paid-1,2500,true)
  assert.equal(accrued,commissionCents(1001,91,1001,2500,true))
})

test('custom schedules validate exact cents, calendar dates, order and size', () => {
  const rows=[{dueOn:'2026-09-25',amountCents:50000},{dueOn:'2026-10-25',amountCents:500000}]
  assert.equal(parsePlanInstalments(rows,550000).length,2)
  for(const bad of [[],[rows[0]],rows.toReversed(),[{...rows[0],dueOn:'2026-02-30'},rows[1]],[{...rows[0],amountCents:0},rows[1]],[{...rows[0],amountCents:1.5},rows[1]]]) assert.throws(()=>parsePlanInstalments(bad,550000))
  assert.throws(()=>parsePlanInstalments(rows,549999))
})

test('commission reads limit agents to their own balances and component rates without customer records', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role-key'
  const { getCommissionWorkspace, manageCommission } = await import('../src/lib/commissions.ts')
  const original=globalThis.fetch
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
  globalThis.fetch=async url=>{
    const u=new URL(url),table=u.pathname.split('/').pop()
    if(table==='contract_commission_assignments') return json([{sale_id:'sale',win_agent_id:'other',sale_agent_id:'agent',win_bps:2500,sale_bps:2500}])
    assert.equal(u.searchParams.get('agent_id'),'eq.agent')
    if(table==='contract_commission_balances') return json([{sale_id:'sale',agent_id:'agent',earned_cents:12500}])
    if(['contract_commission_claims','contract_commission_payouts'].includes(table)) return json([])
    throw new Error('Unexpected endpoint')
  }
  try {
    const result=await getCommissionWorkspace({id:'agent',role:'agent'})
    assert.deepEqual(result.components,[{saleId:'sale',agentId:'agent',component:'Sale',rateBps:2500}])
    assert.deepEqual(result.agents,[])
    assert.deepEqual(result.sales,[])
    assert.equal(result.settings,null)
    await assert.rejects(getCommissionWorkspace({id:'manager',role:'manager'}),/access required/)
    for(const action of ['settings','assign','payout']) await assert.rejects(manageCommission({id:'agent',role:'agent'},{action}),/cannot perform/)
  } finally {globalThis.fetch=original}
})


test('both beneficiaries remain monotonic at cent boundaries and always sum to combined entitlement', () => {
  for(const [w,s] of [[2500,2500],[1000,4000],[3333,1111],[0,5000],[5000,0],[0,0]]) {
    let previous={win:0,sale:0}
    for(let paid=54990;paid<=55100;paid++) {
      const current=commissionShares(550000,500000/10,paid,w,s,true)
      assert.ok(current.win>=previous.win)
      assert.ok(current.sale>=previous.sale)
      assert.equal(current.win+current.sale,current.combined)
      previous=current
    }
  }
  assert.deepEqual(commissionShares(550000,50000,55002,2500,2500,true),{win:12501,sale:12500,combined:25001})
  assert.deepEqual(commissionShares(550000,50000,55003,2500,2500,true),{win:12501,sale:12500,combined:25001})
})
