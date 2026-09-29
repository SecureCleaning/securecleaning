import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { DEFAULT_SMS_TEMPLATE,normalizeSmsMobile,nextSmsSendTime,inSmsSendingHours,renderSms,smsSegments,isSmsOptOut } from '../src/lib/smsPolicy.ts'
import { verifySmsWebhook,mobileMessageRequest,checkSmsConnection } from '../src/lib/mobileMessage.ts'

test('SMS scheduling enforces weekdays and both sides of daylight saving',()=>{
 for(const zone of ['Australia/Sydney','Australia/Melbourne']) {
  const cases=[['2026-09-25T08:05:00Z','2026-09-27T23:00:00Z'],['2026-09-26T02:00:00Z','2026-09-27T23:00:00Z'],['2026-10-02T08:00:00Z','2026-10-04T22:00:00Z'],['2027-04-02T07:00:00Z','2027-04-04T23:00:00Z'],['2026-09-28T22:59:00Z','2026-09-28T23:00:00Z'],['2026-09-29T07:59:59Z','2026-09-29T07:59:59Z']]
  for(const [input,expected] of cases) assert.equal(nextSmsSendTime(new Date(input),zone).toISOString(),new Date(expected).toISOString())
  assert.equal(inSmsSendingHours(new Date('2026-09-29T08:00:00Z'),zone),false)
 }
})
test('Australian mobile validation rejects landlines, international and injected values',()=>{
 for(const value of ['0412 345 678','+61 412 345 678','61412345678']) assert.equal(normalizeSmsMobile(value),'61412345678')
 for(const value of ['0299999999','+12125551234','0412abc345678','614123456789','',null]) assert.equal(normalizeSmsMobile(value),null)
})
test('templates use exact safe fields and mandatory brand and opt-out text',()=>{
 assert.equal(renderSms(DEFAULT_SMS_TEMPLATE,{}),DEFAULT_SMS_TEMPLATE)
 assert.match(renderSms('Secure Cleaning: Hi {{first_name}}, {{quote_reference}}. Reply STOP to opt out.',{first_name:'Alex\n{bad}',quote_reference:'SC-1'}),/Hi Alex  bad/)
 for(const text of ['Unbranded reply STOP to opt out.','Secure Cleaning: hello','Secure Cleaning: {{secret}}. Reply STOP to opt out.','Secure Cleaning: {provider_variable}. Reply STOP to opt out.']) assert.throws(()=>renderSms(text,{}))
})
test('SMS cost count handles GSM extensions, unicode and multipart boundaries',()=>{
 assert.equal(smsSegments(DEFAULT_SMS_TEMPLATE).segments,1)
 assert.equal(smsSegments('a'.repeat(160)).segments,1)
 assert.equal(smsSegments('a'.repeat(161)).segments,2)
 assert.equal(smsSegments('^'.repeat(81)).segments,2)
 assert.equal(smsSegments('🙂'.repeat(36)).segments,2)
 assert.equal(smsSegments('漢'.repeat(70)).segments,1)
 assert.equal(smsSegments('漢'.repeat(71)).segments,2)
})
test('STOP and clear unsubscribe requests are recognised',()=>{
 for(const text of ['STOP','Please unsubscribe me','remove me please',"Don't text me again"]) assert.equal(isSmsOptOut(text),true)
 assert.equal(isSmsOptOut("I haven't received the quote"),false)
})
test('webhooks reject changed bodies, stale signatures, missing secrets and malformed headers',()=>{
 const raw='{"type":"inbound"}',ts='1790640000',secret='test-secret',signature=createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex'),now=Number(ts)*1000
 assert.equal(verifySmsWebhook(raw,ts,signature,secret,now),true)
 assert.equal(verifySmsWebhook(raw+' ',ts,signature,secret,now),false)
 assert.equal(verifySmsWebhook(raw,ts,signature,secret,now+301000),false)
 assert.equal(verifySmsWebhook(raw,ts,signature,'',now),false)
 assert.equal(verifySmsWebhook(raw,ts,'x',secret,now),false)
})
test('provider adapter fails closed outside production and validates dedicated sender without purchase APIs',async()=>{
 const old={...process.env},fetchBefore=globalThis.fetch
 try {
  process.env.MOBILE_MESSAGE_API_USERNAME='unit-test';process.env.MOBILE_MESSAGE_API_PASSWORD='not-real';process.env.MOBILE_MESSAGE_SENDER='61412345678';process.env.MOBILE_MESSAGE_WEBHOOK_SECRET='test';process.env.NEXT_PUBLIC_SITE_URL='https://securecleaning.com.au'
  process.env.VERCEL_ENV='preview';process.env.SMS_LIVE_SEND_ENABLED='true'
  let calls=[]
  globalThis.fetch=async(url)=>{calls.push(url);const key=new URL(url).pathname.split('/').pop();const bodies={account:{credit_balance:500},senders:{results:[{sender:'61412345678',type:'dedicated'}]},webhooks:{has_signing_secret:true,webhooks:{inbound:'https://securecleaning.com.au/api/sms/webhook',status:'https://securecleaning.com.au/api/sms/webhook'}}};return new Response(JSON.stringify(bodies[key]),{status:200})}
  await assert.rejects(mobileMessageRequest('messages','POST',{}),/disabled/)
  assert.equal(calls.length,0)
  const health=await checkSmsConnection();assert.equal(health.ready,true);assert.equal(health.live,false);assert.equal(calls.length,3)
  assert.ok(calls.every(url=>!url.includes('dedicated-numbers')))
 } finally {globalThis.fetch=fetchBefore;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old)}
})
