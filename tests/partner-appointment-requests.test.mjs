import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as policy from '../src/lib/partnerBookingPolicy.ts'
import * as calendar from '../src/lib/calendarInvite.ts'
import * as ics from '../src/lib/ics.ts'
import * as html from '../src/lib/htmlEscape.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic'
const proposals=await import('../src/lib/partnerAppointmentPolicy.ts')
const availability=await import('../src/lib/availability.ts')
const {mergeAvailabilityConfig}=availability
const linkage=await import('../src/lib/availabilityLinkage.ts')
const fixed=new Date('2026-11-04T00:00:00Z')
const times=[{date:'2026-11-09',startTime:'18:00'},{date:'2026-11-09',startTime:'20:00'}]
const inputs={businessName:'Fixture <business>',contactName:'Test Contact',email:'client@example.invalid',phone:'0400000000',address:'10 Test Street',city:'melbourne',suburb:'Melbourne',postcode:'3000',premisesType:'office',frequency:'weekly',timePreference:'business_hours',notes:'PRIVATE <script>\nInternal note',preferredInspectionAssigneeId:'a',preferredStartDate:'2026-11-09',preferredInspectionStartTime:'18:00',preferredInspectionEndTime:'18:10'}
const company={id:'company',name:'Test Partner',active:true,cities:['melbourne'],assignee_ids:['a','b'],expires_at:null}
const config=()=>mergeAvailabilityConfig({assignees:['a','b'].map((id,i)=>({id,name:`Agent ${id}`,city:'melbourne',active:true,email:`${id}@example.invalid`,bookingPriority:i+1,calendarId:`calendar-${id}`})),zones:[{id:'zone',city:'melbourne',name:'CBD',postcodes:['3000'],matchTerms:['Melbourne']}],weeklySlots:['a','b'].map(id=>({id,assigneeId:id,city:'melbourne',zoneIds:['zone'],day:'monday',startTime:'09:00',endTime:'12:00',active:true})),oneOffBlocks:[]})
function load(path,mocks,env={}){const exports={};const code=ts.transpileModule(readFileSync(new URL(`../src/lib/${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,Buffer,console,process:{env},Date:class extends Date{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed.getTime()}},require(name){if(name==='server-only')return{};if(!(name in mocks))throw Error(`Unexpected ${name}`);return mocks[name]}});return exports}
test('confirmed contact-review bookings appear only on the assigned agent calendar without a CRM link',async()=>{
 const rows=['a','b'].map(id=>({booking_ref:`BK-${id}`,client_id:null,opportunity_id:null,status:'pending',inputs:{...inputs,preferredInspectionAssigneeId:id}}))
 const db={from(table){assert.equal(table,'bookings');const q={select(){return q},in(){return q},order(){return q},limit:async()=>({data:rows,error:null})};return q}}
 const mod=load('availabilityCalendar',{'@/lib/calendarInvite':calendar,'@/lib/supabase':{getAdminSupabase:()=>db},'@/lib/availability':availability,'@/lib/availabilityLinkage':linkage,'@/lib/publicHolidays':{getPublicHolidayPeriods:async()=>[]}})
 const c=config(),bookings=await mod.getAgentBookingsForCalendar(c,c.assignees.find(a=>a.id==='a'))
 assert.equal(bookings.length,1);assert.equal(bookings[0].booking_ref,'BK-a')
 const events=mod.buildBookingEvents(bookings,new Date('2026-11-09T00:00:00Z'),new Date('2026-11-10T00:00:00Z'))
 assert.equal(events.length,1);assert.equal(events[0].opportunityId,undefined)
 assert.match(events[0].description,/Fixture <business>/);assert.match(events[0].location,/10 Test Street/)
 assert.equal(events[0].startsAt,'2026-11-09T07:00:00.000Z')
 assert.equal(mod.buildBookingEvents([{...bookings[0],inputs:{...inputs,preferredStartDate:''}}],fixed,new Date('2026-12-01')).length,0,'TBA proposals do not reserve calendar times')
})
test('proposals validate one to five distinct weekday times and normalize order',()=>{
 assert.deepEqual(proposals.parseProposedAppointments([...times].reverse(),'melbourne',fixed),times)
 for(const value of [[],Array(6).fill(times[0]),[times[0],times[0]],[{date:'2026-11-07',startTime:'18:00'}],[{date:'2026-11-04',startTime:'18:00'}],[{date:'2026-11-09',startTime:'23:59'}],[{date:'2026-02-30',startTime:'12:00'}]])assert.throws(()=>proposals.parseProposedAppointments(value,'melbourne',fixed))
 assert.equal(proposals.parseProposedAppointments(times,'melbourne',null).length,2)
})
test('request agent selection checks suburb and company restrictions before priority',()=>{
 const c=config();assert.equal(proposals.proposalAgent(c,company,inputs).id,'a')
 c.weeklySlots[0].zoneIds=['elsewhere'];assert.equal(proposals.proposalAgent(c,company,inputs).id,'b')
 assert.equal(proposals.proposalAgent(c,{...company,assignee_ids:['a']},inputs),null)
 assert.throws(()=>proposals.proposalAgent(c,{...company,cities:[]},inputs))
})
const messageMocks={'./htmlEscape':html,'./ics':ics,'./calendarInvite':calendar,'./email':{sendEmailOrThrow:()=>{throw Error('No real send')}},'./siteUrl':{getSiteUrl:()=> 'https://fixture.invalid'}}
const messages=load('partnerAppointmentMessages',messageMocks)
const notice={requestId:'11111111-1111-4111-8111-111111111111',bookingRef:'BK-FIXTURE',inputs,proposals:times,agentEmail:'agent@example.invalid',state:'pending'}
test('pasted sender and admin settings do not prevent appointment notification preparation',()=>{
 for(const sender of ['quotes@example.invalid','Secure Cleaning <quotes@example.invalid>']){
  const configured=load('partnerAppointmentMessages',messageMocks,{FROM_EMAIL:` ${sender}\r\n`,ADMIN_EMAIL:' info@example.invalid\n'})
  for(const state of ['pending','confirmed','declined']){
   const result=configured.partnerAppointmentPayloads({...notice,state,selected:state==='confirmed'?0:null})
   assert.equal(result.client.from,sender);assert.equal(result.staff.from,sender)
   assert.equal(result.client.replyTo,'info@example.invalid');assert.equal(result.staff.replyTo,'info@example.invalid')
   assert.deepEqual(Array.from(result.staff.to),['info@example.invalid','agent@example.invalid'])
   for(const attachment of result.staff.attachments){
    const content=Buffer.from(attachment.content,'base64').toString()
    assert.match(content,/ORGANIZER:mailto:quotes@example.invalid\r\n/)
   }
   assert.doesNotMatch(JSON.stringify(result.client),/PRIVATE|Internal note/)
  }
 }
 const empty=load('partnerAppointmentMessages',messageMocks,{FROM_EMAIL:' \n',ADMIN_EMAIL:' \r\n'})
 assert.equal(empty.partnerAppointmentPayloads(notice).client.from,'quotes@securecleaning.com.au')
 assert.equal(empty.partnerAppointmentPayloads(notice).client.replyTo,'info@securecleaning.com.au')
 for(const sender of ['quotes@example.invalid\r\nATTENDEE:mailto:other@example.invalid','Secure\nCleaning <quotes@example.invalid>']){
  const invalid=load('partnerAppointmentMessages',messageMocks,{FROM_EMAIL:sender})
  assert.throws(()=>invalid.partnerAppointmentPayloads(notice),/Invalid calendar mailbox/)
 }
})
test('initial customer message is TBA without invite or notes; agent has tentative transparent options and notes',()=>{
 const result=messages.partnerAppointmentPayloads(notice)
 assert.match(result.client.html,/TBA and no time is confirmed/);assert.equal(result.client.attachments,undefined);assert.doesNotMatch(JSON.stringify(result.client),/PRIVATE|Internal note/)
 assert.match(result.staff.html,/PRIVATE &lt;script&gt;<br>Internal note/);assert.doesNotMatch(result.staff.html,/<script>/)
 assert.equal(result.staff.attachments.length,2)
 for(const item of result.staff.attachments){const text=Buffer.from(item.content,'base64').toString();assert.match(text,/STATUS:TENTATIVE/);assert.match(text,/TRANSP:TRANSPARENT/);assert.match(text,/SEQUENCE:0/);assert.match(text.replace(/\r\n[ \t]/g,''),/PRIVATE/)}
})
test('confirmation updates selected calendar UID, cancels alternatives and gives client a private invite',()=>{
 const result=messages.partnerAppointmentPayloads({...notice,state:'confirmed',selected:0})
 const staff=result.staff.attachments.map(a=>Buffer.from(a.content,'base64').toString())
 assert.match(staff[0],/STATUS:CONFIRMED/);assert.match(staff[0],/SEQUENCE:1/);assert.match(staff[1],/METHOD:CANCEL/)
 assert.equal(staff[0].match(/UID:(.*)/)[1],messages.proposalCalendar(notice,0).match(/UID:(.*)/)[1])
 const client=Buffer.from(result.client.attachments[0].content,'base64').toString()
 assert.doesNotMatch(result.client.html+client,/PRIVATE|Internal note|appointment-requests/)
 assert.match(client,/DTSTART:20261109T070000Z/)
 assert.match(messages.proposalCalendar({...notice,inputs:{...inputs,city:'brisbane'}},0),/DTSTART:20261109T080000Z/)
 assert.ok(messages.partnerAppointmentPayloads({...notice,state:'declined'}).staff.attachments.every(a=>Buffer.from(a.content,'base64').toString().includes('STATUS:CANCELLED')))
})
function reviewFixture(options={}) {
 const calls={rpc:0,send:0,calendar:0,filters:[],updates:[]}
 const row={id:notice.requestId,booking_id:'booking',assigned_assignee_id:'a',proposed_times:times,decision_status:'pending',email_status:'sent',selected_proposal:null,...options.row}
 const db={from(table){let update=null;const q={select(){return q},eq(k,v){calls.filters.push([table,k,v]);return q},update(v){update=v;calls.updates.push(v);return q},single:async()=>({data:{inputs,booking_ref:'BK-FIXTURE'},error:null}),maybeSingle:async()=>({data:options.missing?null:row,error:null}),then(resolve){resolve({data:update,error:options.saveError?{}:null})}};return q},async rpc(name,args){calls.rpc++;calls.args=args;return {data:{created:!options.raceReplay,inputs,bookingRef:'BK-FIXTURE'},error:options.rpcError||null}}}
 const mod=load('partnerAppointmentReview',{'./supabase':{getAdminSupabase:()=>db},'./partnerBookingAvailability':{loadPartnerConfig:async()=>({config:config(),content:'exact'}),loadPartnerBusy:async()=>{if(options.busyError)throw Error('Busy unavailable');return options.busy||[]}},'./partnerBookingPolicy':policy,'./calendarInvite':calendar,'./partnerAppointmentMessages':{sendPartnerAppointmentNotice:async()=>{calls.send++;if(options.sendError)throw Error('Unknown provider outcome')}},'./googleCalendar':{upsertContractSaleInspectionEvent:async()=>{calls.calendar++;return {status:options.calendarError?'failed':'created'}}}})
 return {calls,run:(extra={})=>mod.reviewPartnerAppointmentRequest({id:'staff-a',assigneeId:'a'},{id:row.id,decision:'confirmed',selected:0,reviewed:true,...extra})}
}
test('approval checks agent scope and commits once before notifying and calendar sync',async()=>{
 const f=reviewFixture();const result=await f.run();assert.equal(result.emailStatus,'sent');assert.equal(f.calls.rpc,1);assert.equal(f.calls.send,1);assert.equal(f.calls.calendar,1)
 assert.ok(f.calls.filters.some(v=>v[1]==='assigned_assignee_id'&&v[2]==='a'));assert.equal(f.calls.args.p_config,'exact')
 const other=reviewFixture({missing:true});await assert.rejects(()=>other.run(),/not found/);assert.equal(other.calls.rpc,0)
})
test('approval refuses collision/travel, failed busy checks, invalid options, missing acknowledgement and initial sends in flight',async()=>{
 for(const options of [{busy:[{assigneeId:'a',start:new Date('2026-11-09T06:30:00Z'),end:new Date('2026-11-09T06:40:00Z')}]},{busyError:true},{row:{email_status:'sending'}}]){const f=reviewFixture(options);await assert.rejects(()=>f.run());assert.equal(f.calls.rpc,0);assert.equal(f.calls.send,0)}
 for(const extra of [{selected:7},{selected:null},{reviewed:false}]){const f=reviewFixture();await assert.rejects(()=>f.run(extra));assert.equal(f.calls.rpc,0)}
})
test('persisted and racing confirmation replays never send again',async()=>{
 for(const options of [{raceReplay:true},{row:{decision_status:'confirmed',selected_proposal:0,decision_email_status:'sent',decision_calendar_status:'sent'}}]){const f=reviewFixture(options);assert.equal((await f.run()).replay,true);assert.equal(f.calls.send,0);assert.equal(f.calls.calendar,0)}
 const f=reviewFixture({row:{decision_status:'confirmed',selected_proposal:1}});await assert.rejects(()=>f.run(),/already been reviewed/)
})
test('notification or calendar failures are persisted for staff review without rolling back the booking',async()=>{
 const f=reviewFixture({sendError:true,calendarError:true});const result=await f.run();assert.equal(result.emailStatus,'review_required');assert.equal(result.calendarStatus,'review_required');assert.equal(f.calls.rpc,1);assert.equal(f.calls.updates[0].decision_email_status,'review_required')
})
test('decline requires a reason, notifies with no confirmed calendar write',async()=>{
 const f=reviewFixture();await assert.rejects(()=>f.run({decision:'declined',reason:''}),/reason/)
 const r=await f.run({decision:'declined',reason:'Unavailable'});assert.equal(r.calendarStatus,'not_required');assert.equal(f.calls.calendar,0);assert.equal(f.calls.send,1);assert.equal(f.calls.args.p_selected,null)
})
function createFixture(options={}){
 const calls={rpc:0,send:0,updates:[],notices:[]}
 const db={from(table){let update;const q={select(){return q},eq(){return q},update(v){update=v;calls.updates.push(v);return q},async maybeSingle(){return {data:update?{id:'claim'}:options.replay||null,error:null}},async single(){return {data:{booking_ref:'BK-FIXTURE'},error:null}},then(resolve){resolve({error:null})}};return q},async rpc(name,args){calls.rpc++;calls.args=args;return {data:{created:!options.raceReplay,bookingRef:'BK-FIXTURE',contactReviewRequired:options.contactReview===true},error:options.rpcError||null}}}
 const c=config();if(options.noEmail)c.assignees[0].email=''
 const mod=load('partnerAppointmentCreate',{'node:crypto':crypto,'./supabase':{getAdminSupabase:()=>db},'./partnerBookingAvailability':{loadPartnerConfig:async()=>({config:c,content:'exact'})},'./partnerBookingPolicy':policy,'./partnerAppointmentPolicy':{...proposals,parseProposedAppointments:(value,city,now)=>proposals.parseProposedAppointments(value,city,now===null?null:fixed)},'./partnerAppointmentMessages':{sendPartnerAppointmentNotice:async notice=>{calls.send++;calls.notices.push(notice);if(options.sendError)throw Error('Unknown')}}})
 return {calls,run:()=>mod.createPartnerAppointmentRequest({id:'caller',session_version:'rev',company},{...inputs,idempotencyKey:notice.requestId,proposedTimes:times,customerConfirmed:true})}
}
test('proposal creation stores no scheduled time, claims once and sends TBA notice',async()=>{
 const f=createFixture();const result=await f.run();assert.equal(result.pending,true);assert.equal(f.calls.args.p_start,null);assert.equal(f.calls.args.p_inputs.preferredStartDate,'');assert.equal(f.calls.send,1)
 const noEmail=createFixture({noEmail:true});await assert.rejects(()=>noEmail.run(),/notification address/);assert.equal(noEmail.calls.rpc,0)
 const failure=createFixture({sendError:true});assert.equal((await failure.run()).emailStatus,'review_required')
})
test('proposal replay returns saved receipt without new writes or deliveries',async()=>{
 const details=policy.partnerBookingDetails({...inputs,idempotencyKey:notice.requestId,customerConfirmed:true,date:'request',slotId:'request'})
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({kind:'request',details,proposals:times})).digest('hex')
 const f=createFixture({replay:{input_hash:fingerprint,booking_id:'booking',email_status:'sent',calendar_status:'sent'}});assert.equal((await f.run()).replay,true);assert.equal(f.calls.rpc,0);assert.equal(f.calls.send,0)
})
test('review HTTP endpoints deny unauthenticated, viewer and cross-agent access before data access',async()=>{
 const response=(data,status=200)=>({data,status});let read=0,write=0
 const mocks={'./adminAuth':{isAuthorizedAdminRequest:async()=>false,getAdminSessionIdentityFromRequest:async()=>null},'./availabilityAgentAuth':{isAuthorizedAvailabilityAgentRequest:async(req,id)=>req.allowed===id},'./abuseProtection':{rejectCrossOriginMutation:()=>null,rejectLargePayload:async()=>null,rateLimitValue:async()=>null},'./partnerBookingPolicy':policy,'./partnerBookingHttp':{partnerJson:response,partnerFailure:e=>response({error:e.message},e.status||500)},'./partnerAppointmentReview':{listPartnerAppointmentRequests:async actor=>{read++;return actor},reviewPartnerAppointmentRequest:async()=>{write++;return{}}}}
 const mod=load('partnerAppointmentReviewHttp',{'next/server':{},...mocks})
 for(const id of [undefined,'b'])assert.equal((await mod.partnerRequestReviewHttp({method:'GET',allowed:'a'},id)).status,401)
 assert.equal(read,0);assert.equal(write,0)
 assert.equal((await mod.partnerRequestReviewHttp({method:'GET',allowed:'a'},'a')).data.assigneeId,'a');assert.equal(read,1)
})

test('calendar invitation mailbox fields reject header injection',()=>{assert.throws(()=>messages.proposalCalendar({...notice,agentEmail:'agent@example.invalid\r\nATTENDEE:mailto:other@example.invalid'},0),/Invalid calendar mailbox/)})


test('contact-review requests send a TBA receipt and expose the review flag only to staff',async()=>{
 const f=createFixture({contactReview:true});const result=await f.run()
 assert.equal(result.pending,true);assert.equal(result.emailStatus,'sent');assert.equal(f.calls.send,1)
 assert.equal(f.calls.notices[0].contactReviewRequired,true)
 assert.equal(result.contactReviewRequired,undefined,'partner does not learn about existing client matches')
 const payloads=messages.partnerAppointmentPayloads({...notice,contactReviewRequired:true})
 assert.match(payloads.staff.html,/Client details need review/)
 assert.doesNotMatch(JSON.stringify(payloads.client),/Client details need review|Client CRM|existing client|PRIVATE/)
 const racing=createFixture({contactReview:true,raceReplay:true});assert.equal((await racing.run()).replay,true);assert.equal(racing.calls.send,0)
})
test('request errors separate contact validation from calendar changes without leaking stored data',async()=>{
 for(const [rpcError,expected] of [
  [{code:'23514',message:'Contact reconciliation required'},/client details need.*review/],
  [{code:'23P01',message:'Private config details'},/Calendar settings have changed/],
  [{code:'23514',message:'Private record details'},/could not be saved/],
  [{code:'23505',message:'Private record details'},/could not be saved/],
  [{code:'42501',message:'Private permission details'},/permissions have changed/],
 ]){const f=createFixture({rpcError});await assert.rejects(()=>f.run(),e=>{assert.match(e.message,expected);assert.doesNotMatch(e.message,/Private/);assert.equal(e.status,rpcError.code==='42501'?403:409);return true});assert.equal(f.calls.send,0);assert.equal(f.calls.updates.length,0)}
})
test('contact review remains visible beyond recent decisions and remains agent scoped',async()=>{
 const calls=[];const flagged={id:'request',booking_id:'booking',decision_status:'confirmed',contact_review_required:true}
 const db={from(table){const filters=[];const q={select(){return q},eq(...v){filters.push(['eq',...v]);return q},neq(...v){filters.push(['neq',...v]);return q},or(v){filters.push(['or',v]);return q},order(){return q},limit(){return q},in(...v){filters.push(['in',...v]);return q},then(resolve){calls.push({table,filters});resolve({data:table==='bookings'?[{id:'booking',booking_ref:'BK-FIXTURE',inputs,opportunity_id:null}]:filters.some(v=>v[0]==='or')?[flagged]:[],error:null})}};return q}}
 const mod=load('partnerAppointmentReview',{'./supabase':{getAdminSupabase:()=>db},'./partnerBookingAvailability':{},'./partnerBookingPolicy':policy,'./calendarInvite':calendar,'./partnerAppointmentMessages':{},'./googleCalendar':{}})
 const result=await mod.listPartnerAppointmentRequests({id:'staff',assigneeId:'a'})
 assert.equal(result.requests.length,1);assert.equal(result.requests[0].contact_review_required,true)
 const queries=calls.filter(c=>c.table==='partner_booking_requests')
 assert.ok(queries.every(c=>c.filters.some(v=>v[1]==='assigned_assignee_id'&&v[2]==='a')))
 assert.ok(queries.some(c=>c.filters.some(v=>v[0]==='or'&&v[1]==='decision_status.eq.pending,contact_review_required.eq.true')))
 assert.ok(queries.some(c=>c.filters.some(v=>v[1]==='contact_review_required'&&v[2]===false)))
})
