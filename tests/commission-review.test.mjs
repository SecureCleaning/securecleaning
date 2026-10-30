import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role-key'
const { getCommissionReviewRows } = await import('../src/lib/commissionReview.ts')

test('commission review reads all pages, excludes assigned/cancelled sales and prioritises action-ready sales', async () => {
  const original=globalThis.fetch
  let calls=0
  globalThis.fetch=async url=>{
    const u=new URL(url)
    assert.equal(u.searchParams.get('has_assignment'),'eq.false')
    assert.equal(u.searchParams.get('status'),'neq.cancelled')
    const rows=calls++===0 ? Array.from({length:500},(_,i)=>({sale_id:`id-${i}`,sale_code:`PS-${i}`,status:'draft',review_reason:'Review',win_agent_id:null,sale_agent_id:'known'})) : [{sale_id:'complete',sale_code:'PS-complete',status:'completed',review_reason:'Missing winner'}]
    return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json'}})
  }
  try {
    const rows=await getCommissionReviewRows()
    assert.equal(rows.length,501)
    assert.equal(rows[0].id,'complete')
    assert.equal(rows[1].suggestedWinAgentId,null)
    assert.equal(rows[1].suggestedSaleAgentId,'known')
  } finally { globalThis.fetch=original }
})

test('sale review lookup stays within authorised IDs and fails closed on a read error',async()=>{
  const original=globalThis.fetch
  let calls=0
  globalThis.fetch=async url=>{
    calls++
    const u=new URL(url)
    assert.equal(u.searchParams.get('sale_id'),'in.(allowed-sale)')
    return new Response(JSON.stringify({message:'lookup failed'}),{status:400,headers:{'Content-Type':'application/json'}})
  }
  try {
    assert.deepEqual(await getCommissionReviewRows([]),[])
    assert.equal(calls,0)
    await assert.rejects(getCommissionReviewRows(['allowed-sale']))
    assert.equal(calls,1)
  } finally {globalThis.fetch=original}
})
