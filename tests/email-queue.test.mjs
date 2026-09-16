import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
const {readEmailPages,emailProviderPause}=await import('../src/lib/emailDeliveryQueue.ts')
const {EmailProviderRejectedError}=await import('../src/lib/email.ts')
test('email pagination includes recipients beyond 500 and 1000 without duplicates',async()=>{
  const input=Array.from({length:1201},(_,id)=>({id}))
  const calls=[]
  const result=await readEmailPages(async(from,to)=>{calls.push([from,to]);return{data:input.slice(from,to+1),error:null}})
  assert.deepEqual(result,input);assert.equal(calls.length,5)
  await assert.rejects(readEmailPages(async()=>({data:null,error:new Error('lookup failed')})),/lookup failed/)
})
test('only explicit non-acceptance pauses provider delivery for safe continuation',()=>{
  assert.equal(emailProviderPause(new EmailProviderRejectedError('quota','monthly_quota_exceeded')),'quota')
  assert.equal(emailProviderPause(new EmailProviderRejectedError('rate','rate_limit_exceeded')),'rate')
  assert.equal(emailProviderPause(new EmailProviderRejectedError('network','application_error')),null)
  assert.equal(emailProviderPause(new Error('timeout')),null)
})
