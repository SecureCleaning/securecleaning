import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as policy from '../src/lib/partnerBookingPolicy.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic'
const proposalPolicy=await import('../src/lib/partnerAppointmentPolicy.ts')
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic'
const { mergeAvailabilityConfig, getAvailabilitySuggestionsForConfig, matchServiceZones } = await import('../src/lib/availability.ts')
import * as dates from '../src/lib/calendarInvite.ts'
import * as partnerDates from '../src/lib/partnerBookingDates.ts'
import * as menus from '../src/lib/menuConfiguration.ts'
const publicHolidayHelpers = await import('../src/lib/publicHolidays.ts')
const noPublicHolidays = {
 getRequiredPublicHolidayPeriods: async()=>[],
 publicHolidaysToAvailabilityBlocks: publicHolidayHelpers.publicHolidaysToAvailabilityBlocks,
}
const company={id:'company',name:'Partner',active:true,cities:['melbourne'],assignee_ids:['a','b'],expires_at:null}
function config() {return mergeAvailabilityConfig({settings:{melbourneBookingMode:'priority',maxSlotsToShow:10},assignees:[{id:'a',name:'Agent A',city:'melbourne',active:true,bookingPriority:1,calendarId:'secret-a'},{id:'b',name:'Agent B',city:'melbourne',active:true,bookingPriority:2,calendarId:'secret-b'}],zones:[{id:'zone',name:'Area',city:'melbourne',postcodes:['3000'],matchTerms:['Melbourne']}],weeklySlots:['a','b'].map(id=>({id:`slot-${id}`,assigneeId:id,city:'melbourne',zoneIds:['zone'],day:'monday',startTime:'10:00',endTime:'10:00',active:true})),oneOffBlocks:[]})}
const now = new Date('2026-11-03T00:00:00Z')
test('partner permissions restrict calendars before priority without changing the original configuration',()=>{
 const original=config(), scoped=policy.partnerConfig(original,{...company,assignee_ids:['b']},'melbourne')
 const result=getAvailabilitySuggestionsForConfig(scoped,original.zones,'melbourne','2026-11-09')
 assert.equal(result[0].assigneeId,'b');assert.equal(original.assignees.length,2)
 assert.throws(()=>policy.partnerConfig(original,{...company,cities:[]},'melbourne'),/state/)
 assert.throws(()=>policy.partnerConfig(original,{...company,active:false},'melbourne'))
 assert.equal(policy.companyEnabled({...company,expires_at:'2020-01-01'}),false)
})
test('partner allocation retains suburb, busy-time and priority rules',()=>{
 const scoped=policy.partnerConfig(config(),company,'melbourne')
 scoped.weeklySlots[0].zoneIds=['elsewhere']
 assert.equal(getAvailabilitySuggestionsForConfig(scoped,scoped.zones,'melbourne','2026-11-09')[0].assigneeId,'b')
 scoped.weeklySlots[0].zoneIds=['zone']
 assert.equal(getAvailabilitySuggestionsForConfig(scoped,scoped.zones,'melbourne','2026-11-09')[0].assigneeId,'a')
 const busy=[{assigneeId:'a',start:new Date('2026-11-08T23:00:00Z'),end:new Date('2026-11-08T23:10:00Z')}]
 assert.equal(getAvailabilitySuggestionsForConfig(scoped,scoped.zones,'melbourne','2026-11-09',busy)[0].assigneeId,'b')
})
test('partner location and date validation rejects mismatched states and invalid, past or same-day dates',()=>{
 assert.equal(policy.partnerLocation({city:'brisbane',suburb:'Brisbane City',postcode:'4000'}).city,'brisbane')
 assert.throws(()=>policy.partnerLocation({city:'sydney',suburb:'Melbourne',postcode:'3000'}))
 for(const date of ['2026-11-03','2026-02-30','2026-01-01','2029-01-01']) assert.throws(()=>policy.checkPartnerDate(date,'melbourne',now))
 assert.equal(policy.checkPartnerDate('2026-11-04','melbourne',now),'2026-11-04')
 assert.equal(policy.localDate('brisbane',new Date('2026-11-02T13:30:00Z')),'2026-11-02')
 assert.equal(policy.localDate('melbourne',new Date('2026-11-02T13:30:00Z')),'2026-11-03')
})
test('partner slot response is an explicit privacy allowlist',()=>{
 const slot={slotId:'slot',startTime:'10:00',endTime:'10:10',assigneeName:'Agent',calendarId:'secret',notes:'private',accessCodeHash:'secret',zoneNames:['private'],clientName:'Hidden'}
 assert.deepEqual(policy.safePartnerSlot(slot,'2026-11-09'),{slotId:'slot',date:'2026-11-09',startTime:'10:00',endTime:'10:10',agent:'Agent'})
})
test('telemarketing menu upgrades saved layouts and stays owner-only',()=>{
 const original=menus.defaultMenuConfiguration(); const settings=original.admin.items.find(x=>x.id==='settings-group');settings.children=settings.children.filter(x=>x!=='telemarketing')
 const upgraded=menus.parseMenuConfiguration(original)
 assert.ok(upgraded.admin.items.find(x=>x.id==='settings-group').children.includes('telemarketing'))
 assert.equal(settings.children.includes('telemarketing'),false)
 for(const role of ['owner','manager','agent','staff','viewer']) assert.equal(menus.menuDestinations('admin',role).some(x=>x.id==='telemarketing'),role==='owner')
})
function moduleWithMocks(path,mocks,globals={}) {
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,Buffer,Date,console,process:{env:{}},...globals,require(name){if(name==='server-only')return {};if(!(name in mocks))throw new Error(`Unexpected dependency ${name}`);return mocks[name]}});return exports
}
function dbFixture(values){return {from(table){let value=values[table];const builder=new Proxy({}, {get(_t,key){if(key==='then')return (ok,fail)=>Promise.resolve(value).then(ok,fail);return ()=>builder}});return builder}}}
test('partner session rejects revocation, expiry and disabled companies on every request',async()=>{
 const values={partner_booking_sessions:{data:{user_id:'u',session_version:'v',expires_at:'2099-01-01'}},partner_booking_users:{data:{id:'u',session_version:'v',active:true,company_id:'company',display_name:'Caller'}},partner_booking_companies:{data:company}}
 const auth=moduleWithMocks('src/lib/partnerBookingAuth.ts',{'node:crypto':await import('node:crypto'),'./supabase':{getAdminSupabase:()=>dbFixture(values)},'./partnerBookingPolicy':policy})
 const request={cookies:{get:()=>({value:'a'.repeat(64)})}}
 assert.equal((await auth.getPartnerActor(request)).id,'u')
 values.partner_booking_users.data.session_version='changed';await assert.rejects(()=>auth.getPartnerActor(request),/sign in/)
 values.partner_booking_users.data.session_version='v';values.partner_booking_companies.data={...company,active:false};await assert.rejects(()=>auth.getPartnerActor(request),/disabled/)
 values.partner_booking_companies.data=company;values.partner_booking_sessions.data.expires_at='2020-01-01';await assert.rejects(()=>auth.getPartnerActor(request),/sign in/)
})
test('availability reads include quote duration and sale inspection, and fail closed on database errors',async()=>{
 const values={bookings:{data:[{inputs:{preferredInspectionAssigneeId:'a',inspectionDurationMinutes:60},status:'pending',inspection_status:'scheduled',inspection_scheduled_for:'2026-11-09T00:00:00Z'}]},contract_sale_inspections:{data:[{starts_at:'2026-11-09T02:00:00Z',duration_minutes:90,scheduled_by_staff_id:'staff',status:'scheduled'}]},admin_staff_accounts:{data:[{id:'staff',availability_assignee_id:'a'}]}}
 const mod=moduleWithMocks('src/lib/partnerBookingAvailability.ts',{'googleapis':{google:{}},'./googleCalendar':{},'./supabase':{getAdminSupabase:()=>dbFixture(values)},'./availability':{mergeAvailabilityConfig,matchServiceZones,getAvailabilitySuggestionsForConfig},'./calendarInvite':dates,'./partnerAppointmentPolicy':proposalPolicy,'./partnerBookingDates':partnerDates,'./partnerBookingPolicy':policy,'./publicHolidays':noPublicHolidays})
 const busy=await mod.loadPartnerBusy(config(),'melbourne','2026-11-04','2026-11-11')
 assert.equal(busy.length,2);assert.equal(busy[0].end.getTime()-busy[0].start.getTime(),3600000)
 assert.equal(busy[1].end.getTime()-busy[1].start.getTime(),5400000)
 values.bookings.error={message:'private backend failure'};await assert.rejects(()=>mod.loadPartnerBusy(config(),'melbourne','2026-11-04','2026-11-11'),/could not be checked/)
})

test('Google free/busy fails closed on an inaccessible calendar and returns no provider event details',async()=>{
 const values={bookings:{data:[]},contract_sale_inspections:{data:[]},admin_staff_accounts:{data:[]}}
 let denied=false, received
 const mod=moduleWithMocks('src/lib/partnerBookingAvailability.ts',{
  'googleapis':{google:{calendar:()=>({freebusy:{query:async request=>{received=request;return {data:{calendars:{'secret-a':denied?{errors:[{reason:'notFound'}]}:{busy:[{start:'2026-11-09T00:00:00Z',end:'2026-11-09T01:00:00Z'}]},'secret-b':{busy:[]}}}}}}})}},
  './googleCalendar':{getCalendarClient:()=>({setCredentials(){}})},'./supabase':{getAdminSupabase:()=>dbFixture(values)},'./availability':{mergeAvailabilityConfig,matchServiceZones,getAvailabilitySuggestionsForConfig},'./calendarInvite':dates,'./partnerAppointmentPolicy':proposalPolicy,'./partnerBookingDates':partnerDates,'./partnerBookingPolicy':policy,'./publicHolidays':noPublicHolidays,
 },{process:{env:{GOOGLE_CALENDAR_CLIENT_ID:'synthetic',GOOGLE_CALENDAR_REFRESH_TOKEN:'synthetic'}}})
 const busy=await mod.loadPartnerBusy(config(),'melbourne','2026-11-04','2026-11-11')
 assert.equal(busy.length,1);assert.deepEqual(Object.keys(busy[0]).sort(),['assigneeId','end','start'])
 assert.equal(received.requestBody.items[0].id,'secret-a')
 denied=true;await assert.rejects(()=>mod.loadPartnerBusy(config(),'melbourne','2026-11-04','2026-11-11'),/cannot be checked/)
})

test('booking retries do not resend confirmations or create another calendar event',async()=>{
 const details={city:'melbourne',suburb:'Melbourne',postcode:'3000',email:'fixture@example.invalid',phone:'0400000000',businessName:'Fixture',contactName:'Caller',address:'10 Test St',notes:'',premisesType:'office',frequency:'weekly',timePreference:'business_hours',idempotencyKey:'11111111-1111-4111-8111-111111111111',date:'2099-01-01',slotId:'test',customerConfirmed:true}
 const normalized=policy.partnerBookingDetails(details)
 const crypto=await import('node:crypto'), fingerprint=crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
 const values={partner_booking_requests:{data:{id:details.idempotencyKey,input_hash:fingerprint,booking_id:'b',email_status:'sent',calendar_status:'internal'}},bookings:{data:{booking_ref:'BK-TEST'}}}
 const mod=moduleWithMocks('src/lib/partnerBookingCreate.ts',{'node:crypto':crypto,'./supabase':{getAdminSupabase:()=>dbFixture(values)},'./partnerBookingAvailability':{partnerAvailability:()=>{throw new Error('Must not query availability for a saved replay')}},'./partnerBookingPolicy':policy,'./calendarInvite':dates,'./googleCalendar':{createBookingFollowUpEvent:()=>{throw new Error('Must not write calendar')}},'./email':{sendBookingConfirmationEmail:()=>{throw new Error('Must not send email')}}})
 const result=await mod.createPartnerBooking({id:'caller',company},details)
 assert.equal(result.replay,true);assert.equal(result.bookingRef,'BK-TEST')
 await assert.rejects(()=>mod.createPartnerBooking({id:'caller',company},{...details,notes:'Changed content'}),/already used/)
})

test('new partner bookings use only the selected calendar and record delivery failures without losing the booking',async()=>{
 const details={city:'melbourne',suburb:'Melbourne',postcode:'3000',email:'fixture@example.invalid',phone:'0400000000',businessName:'Fixture',contactName:'Caller',address:'10 Test St',notes:'',premisesType:'office',frequency:'weekly',timePreference:'business_hours',idempotencyKey:'11111111-1111-4111-8111-111111111111',date:partnerDates.addPartnerDays(partnerDates.partnerWeekStart(policy.localDate('melbourne')),7),slotId:'test',customerConfirmed:true}
 for(const mode of ['success','delivery-failure','internal','collision','revoked','unavailable']) {
  const updates=[], delivered=[], calendars=[]; let rpcArgs
  const slot={slotId:'test',startTime:'10:00',endTime:'10:10',label:'Confirmed fixture time',assigneeId:'b',assigneeName:'Agent B',calendarId:mode==='internal'?undefined:'selected-calendar',day:'monday'}
  const db={from(){let result={data:null};const chain={select(){return chain},eq(){return chain},update(value){updates.push(value);result={data:{id:details.idempotencyKey}};return chain},maybeSingle(){return Promise.resolve(result)},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};return chain},async rpc(_name,args){rpcArgs=args;return ['collision','revoked'].includes(mode)?{error:{code:mode==='collision'?'23P01':'42501'}}:{data:{created:true,bookingRef:'BK-FIXTURE'}}}}
  const mod=moduleWithMocks('src/lib/partnerBookingCreate.ts',{
   'node:crypto':await import('node:crypto'),'./supabase':{getAdminSupabase:()=>db},'./partnerBookingAvailability':{partnerAvailability:async()=>({suggestions:mode==='unavailable'?[]:[slot],content:'exact-config'})},'./partnerBookingPolicy':policy,'./calendarInvite':dates,
   './googleCalendar':{createBookingFollowUpEvent:async(ref,inputs)=>{calendars.push(inputs);if(mode==='delivery-failure')throw new Error('synthetic calendar error');return {created:true}}},
   './email':{sendBookingConfirmationEmail:async(ref,inputs)=>{delivered.push(inputs);if(mode==='delivery-failure')throw new Error('synthetic mail error')}},
  },{process:{env:{GOOGLE_CALENDAR_CLIENT_ID:'synthetic'}}})
  if(['collision','revoked','unavailable'].includes(mode)) {
   await assert.rejects(()=>mod.createPartnerBooking({id:'caller',session_version:'v',company},details),/Availability has changed|permissions have changed|no longer available/)
   assert.equal(delivered.length,0);assert.equal(calendars.length,0);continue
  }
  const result=await mod.createPartnerBooking({id:'caller',session_version:'v',company},details)
  assert.equal(result.bookingRef,'BK-FIXTURE');assert.equal(result.replay,false)
  assert.equal(delivered.length,1);assert.equal(rpcArgs.p_config,'exact-config');assert.equal(rpcArgs.p_inputs.preferredInspectionAssigneeId,'b')
  assert.equal(rpcArgs.p_inputs.inspectionBookingSource,'partner');assert.equal(rpcArgs.p_inputs.inspectionAvailabilityOverridden,false)
  assert.equal(calendars.length,mode==='internal'?0:1)
  if(calendars.length)assert.equal(calendars[0].preferredInspectionCalendarId,'selected-calendar')
  assert.equal(updates[0].email_status,'sending')
  assert.equal(result.emailStatus,mode==='delivery-failure'?'review_required':'sent')
  assert.equal(result.calendarStatus,mode==='delivery-failure'?'review_required':mode==='internal'?'internal':'sent')
  const ics=dates.buildBookingInviteIcs('BK-FIXTURE',rpcArgs.p_inputs)
  assert.match(ics,/SUMMARY:Secure Cleaning site inspection/);assert.doesNotMatch(ics,/provisional inspection/)
 }
})


test('partner weeks are Monday to Friday with safe first/last-week navigation',()=>{
 const week=partnerDates.partnerCalendarWeek('2026-11-05','2026-11-05','2027-02-02')
 assert.deepEqual(week.dates,['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'])
 assert.equal(week.previousWeek,null);assert.equal(week.nextWeek,'2026-11-09')
 const last=partnerDates.partnerCalendarWeek('2027-02-02','2026-11-05','2027-02-02')
 assert.equal(last.nextWeek,null);assert.equal(last.previousWeek,'2027-01-25')
 assert.equal(partnerDates.partnerWeekStart('2027-01-01'),'2026-12-28')
 for(const date of ['2026-02-30','invalid','2026-10-26','2027-02-03']) assert.throws(()=>partnerDates.partnerCalendarWeek(date,'2026-11-05','2027-02-02'))
 for(const date of ['2026-11-07','2026-11-08']) assert.throws(()=>policy.checkPartnerDate(date,'melbourne',now),/Monday to Friday/)
})

test('partner availability excludes weekend slots even when agent calendars offer them',async()=>{
 const raw=config()
 raw.weeklySlots=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({...raw.weeklySlots[0],id:`fixture-${day}`,day}))
 const values={availability_private_config:{data:{content:JSON.stringify(raw)}},bookings:{data:[]},contract_sale_inspections:{data:[]},admin_staff_accounts:{data:[]}}
 const mod=moduleWithMocks('src/lib/partnerBookingAvailability.ts',{'googleapis':{google:{}},'./googleCalendar':{},'./supabase':{getAdminSupabase:()=>dbFixture(values)},'./availability':{mergeAvailabilityConfig,matchServiceZones,getAvailabilitySuggestionsForConfig},'./calendarInvite':dates,'./partnerAppointmentPolicy':proposalPolicy,'./partnerBookingDates':partnerDates,'./partnerBookingPolicy':{...policy,localDate:()=> '2026-11-06'},'./publicHolidays':noPublicHolidays},{Date:class extends Date {static now(){return Date.parse('2026-11-06T01:00:00Z')}}})
 const result=await mod.partnerAvailability(company,{city:'melbourne',suburb:'Melbourne',postcode:'3000',date:'2026-11-09'})
 assert.deepEqual(Array.from(result.public.days,d=>d.date),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13'])
 assert.ok(result.public.days.every(d=>d.slots.length===1))
 assert.equal(result.public.next.date,'2026-11-09')
 const initial=await mod.partnerAvailability(company,{city:'melbourne',suburb:'Melbourne',postcode:'3000'})
 assert.equal(initial.public.weekStart,'2026-11-09')
 const current=await mod.partnerAvailability(company,{city:'melbourne',suburb:'Melbourne',postcode:'3000',date:'2026-11-07'})
 assert.equal(current.suggestions.length,0)
 assert.ok(current.public.days.every(d=>d.slots.length===0))
 const last=await mod.partnerAvailability(company,{city:'melbourne',suburb:'Melbourne',postcode:'3000',date:'2027-02-04'})
 assert.equal(last.public.nextWeek,null)
 assert.equal(last.public.days[4].slots.length,0)
 assert.doesNotMatch(JSON.stringify(result.public),/calendarId|secret-a|assigneeId/)
})

test('partner advertised slots block public holidays and fail closed when holiday data is unavailable',async()=>{
 const raw=config()
 const values={availability_private_config:{data:{content:JSON.stringify(raw)}},bookings:{data:[]},contract_sale_inspections:{data:[]},admin_staff_accounts:{data:[]}}
 const period={id:'vic-2026-fixture',stateCode:'VIC',name:'Fixture public holiday',startsAt:'2026-11-08T13:00:00.000Z',endsAt:'2026-11-09T13:00:00.000Z',allDay:true,sourceUrl:'https://business.vic.gov.au/example'}
 const dependencies={
  'googleapis':{google:{}},'./googleCalendar':{},'./supabase':{getAdminSupabase:()=>dbFixture(values)},'./availability':{mergeAvailabilityConfig,matchServiceZones,getAvailabilitySuggestionsForConfig},'./calendarInvite':dates,'./partnerAppointmentPolicy':proposalPolicy,'./partnerBookingDates':partnerDates,'./partnerBookingPolicy':{...policy,localDate:()=> '2026-11-06'},
 }
 const blocked=moduleWithMocks('src/lib/partnerBookingAvailability.ts',{...dependencies,'./publicHolidays':{getRequiredPublicHolidayPeriods:async()=>[period],publicHolidaysToAvailabilityBlocks:publicHolidayHelpers.publicHolidaysToAvailabilityBlocks}},{Date:class extends Date {static now(){return Date.parse('2026-11-06T01:00:00Z')}}})
 const result=await blocked.partnerAvailability(company,{city:'melbourne',suburb:'Melbourne',postcode:'3000',date:'2026-11-09'})
 assert.equal(result.public.days[0].date,'2026-11-09');assert.equal(result.public.days[0].slots.length,0)
 assert.equal(result.public.next.date,'2026-11-16')
 const failed=moduleWithMocks('src/lib/partnerBookingAvailability.ts',{...dependencies,'./publicHolidays':{getRequiredPublicHolidayPeriods:async()=>{throw new Error('Public holiday availability could not be checked.')},publicHolidaysToAvailabilityBlocks:publicHolidayHelpers.publicHolidaysToAvailabilityBlocks}},{Date:class extends Date {static now(){return Date.parse('2026-11-06T01:00:00Z')}}})
 await assert.rejects(()=>failed.partnerAvailability(company,{city:'melbourne',suburb:'Melbourne',postcode:'3000',date:'2026-11-09'}),/could not be checked/)
})
