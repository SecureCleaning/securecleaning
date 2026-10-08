import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { readBoundedBody, boundRequestBody } from '../src/lib/boundedBody.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
const { rejectLargePayload } = await import('../src/lib/abuseProtection.ts')
import { validChatInput, validPublicQuoteInput, validWorkflowInput, allNumbersFinite, assertStoredDocumentBounded } from '../src/lib/securityInput.ts'
const { createDefaultFirmQuoteDraft, createDefaultInspectionReport } = await import('../src/lib/quoteWorkflow.ts')
const inputs = {businessName:'Example', contactName:'Customer', email:'test@example.com', phone:'0400000000', city:'melbourne', suburb:'Richmond', postcode:'3121', premisesType:'office', floorArea:300, floors:1, flooringType:'mixed', frequency:'weekly', timePreference:'after_hours', addOns:{bathrooms:1,kitchens:1,windows:0,consumables:false,highTouchDisinfection:false,carpetSteam:false}}
const request = (body, headers = {}) => new NextRequest('https://example.com/api', {method:'POST', body, headers, duplex:'half'})
test('actual streamed bytes reject missing and dishonest Content-Length and cancel source', async () => {
 for (const headers of [{}, {'content-length':'1'}]) {
  let cancelled=false
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(8))},cancel(){cancelled=true}})
  const response=await rejectLargePayload(request(stream,headers),10)
  assert.equal(response.status,413); assert.equal(cancelled,true)
 }
})
test('bounded native JSON parsing survives chunks and exact cap', async () => {
 const bytes=new TextEncoder().encode('{"name":"a"}')
 const req=request(new ReadableStream({start(c){c.enqueue(bytes.slice(0,3));c.enqueue(bytes.slice(3));c.close()}}))
 assert.equal(await rejectLargePayload(req,bytes.length),null)
 assert.deepEqual(await req.json(),{name:'a'})
})
test('multipart aggregate limited before formData and preserves file contents', async () => {
 const form=new FormData();form.append('one',new Blob(['abc']),'a.txt');form.append('two','def')
 const req=request(form)
 await boundRequestBody(req,4096)
 const parsed=await req.formData();assert.equal(await parsed.get('one').text(),'abc');assert.equal(parsed.get('two'),'def')
 const encoded = request(form)
 const buffer = await encoded.arrayBuffer()
 const tooLarge=request(buffer, {'content-type':encoded.headers.get('content-type')});assert.equal((await rejectLargePayload(tooLarge,3)).status,413)
})
test('read bounded body rejects invalid cap',async()=>assert.rejects(()=>readBoundedBody(request('abc'),Infinity)))
test('chat rejects structured content, system role, unknown keys and aggregate excess',()=>{
 assert.equal(validChatInput({messages:[{role:'user',content:'Hello'}]}),true)
 for (const value of [{messages:[{role:'system',content:'Hi'}]},{messages:[{role:'user',content:[{type:'text',text:'Hi'}]}]},{messages:[{role:'user',content:'Hi',tool_calls:[]}]},{messages:[{role:'user',content:'Hi'}],model:'other'},{messages:Array.from({length:12},()=>({role:'user',content:'界'.repeat(1200)}))}]) assert.equal(validChatInput(value),false)
})
test('quote rejects nonfinite extreme fractional counts and malformed nested fields',()=>{
 assert.equal(validPublicQuoteInput(inputs),true)
 for(const floorArea of [Infinity,NaN,1e308,-1,0,'300']) assert.equal(validPublicQuoteInput({...inputs,floorArea}),false)
 assert.equal(validPublicQuoteInput({...inputs,floors:1.5}),false)
 assert.equal(validPublicQuoteInput({...inputs,addOns:{...inputs.addOns,bathrooms:-1}}),false)
 assert.equal(validPublicQuoteInput({...inputs,addOns:{...inputs.addOns,unknown:1}}),false)
 assert.equal(allNumbersFinite({price:Infinity}),false)
})
test('workflow preserves accepted correction contract but rejects unknown fields and oversized structures',()=>{
 const draft=JSON.parse(JSON.stringify(createDefaultFirmQuoteDraft(inputs)))
 const workflow={inspectionReport:createDefaultInspectionReport(inputs),firmQuoteDraft:draft,revision:true,expectedDocumentVersion:1}
 assert.equal(validWorkflowInput(workflow),true)
 assert.equal(validWorkflowInput({...workflow,firmQuoteDraft:{...draft,status:'accepted'},initializeAccepted:true,expectedUpdatedAt:'2026-10-08T00:00:00Z'}),true)
 for(const changed of [{...draft,roomItems:Array(101).fill(draft.roomItems[0])},{...draft,scopeSummary:'x'.repeat(10001)},{...draft,revisedInputs:{...inputs,internalPrice:1}},{...draft,roomItems:[{...draft.roomItems[0],metrics:{evil:{nested:1}}}]}]) assert.equal(validWorkflowInput({...workflow,firmQuoteDraft:changed}),false)
})
test('legacy documents fail safely before parsing oversized collections and text',()=>{
 assert.doesNotThrow(()=>assertStoredDocumentBounded({draft:createDefaultFirmQuoteDraft(inputs)},512*1024))
 assert.throws(()=>assertStoredDocumentBounded({rooms:Array(1001).fill({})},512*1024),/administrator review/)
 assert.throws(()=>assertStoredDocumentBounded({text:'x'.repeat(10001)},512*1024),/administrator review/)
})

test('multipart rejects too many parts, huge headers and non-file text before parsing', async () => {
 const encode = parts => parts.map(({header = 'Content-Disposition: form-data; name="field"', text = 'ok'}) => `--bounded\r\n${header}\r\n\r\n${text}\r\n`).join('') + '--bounded--\r\n'
 for (const parts of [Array.from({length:33},()=>({})), [{header:'Content-Disposition: form-data; name="'+'x'.repeat(8192)+'"'}], [{text:'x'.repeat(65537)}], Array.from({length:5},()=>({text:'x'.repeat(65536)}))]) {
  const response = await rejectLargePayload(request(encode(parts), {'content-type':'multipart/form-data; boundary=bounded'}),1024*1024)
  assert.equal(response.status,413)
 }
})
test('bounded multipart bytes remain intact before native parsing', async () => {
 const body='--bounded\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello--boundedFAKE\r\nworld\r\n--bounded--\r\n'
 const req=request(body,{'content-type':'multipart/form-data; boundary="bounded"'})
 assert.equal(await rejectLargePayload(req,4096),null)
 assert.equal(await req.text(),body)
})
test('quote allows the existing SMS notice version field',()=>assert.equal(validPublicQuoteInput({...inputs,smsQuoteNoticeVersion:'2026-10-06'}),true))

test('current public form wire payload includes consent metadata and all supported room fields', () => {
 const wire=JSON.parse(JSON.stringify({...inputs, address:'1 Example Street', latitude:-37.8, longitude:144.9, acceptableUseAccepted:true, formStartedAt:Date.now()-5000, website:'', companyWebsiteUrl:'', smsQuoteNoticeVersion:'2026-10-06', smsQuoteEmailOnly:false, isSpringClean:false, heardAboutUs:'Search', notes:'Please call', preferredStartDate:'2026-11-01', meetingRooms:1, roomScope:[{id:'room_1',type:'meeting_room',label:'Board room',quantity:1,moppingRequired:true,isCustom:false}],addOns:{...inputs.addOns,glassCleaningRequired:true}}))
 assert.equal(validPublicQuoteInput(wire),true)
 assert.equal(validWorkflowInput({firmQuoteDraft:JSON.parse(JSON.stringify(createDefaultFirmQuoteDraft(wire))),inspectionReport:createDefaultInspectionReport(wire)}),true)
})
test('many small streamed chunks remain within the exact byte budget', async () => {
 let remaining=4096
 const body=new ReadableStream({pull(controller){if(remaining--)controller.enqueue(Uint8Array.of(65));else controller.close()}})
 const bytes=await readBoundedBody(request(body),4096)
 assert.equal(bytes.length,4096)
 assert.equal(bytes[4095],65)
})
