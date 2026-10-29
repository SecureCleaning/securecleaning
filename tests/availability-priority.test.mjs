import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service'
const { getAvailabilitySuggestionsForConfig, mergeAvailabilityConfig, getAssigneeServiceZones, toBrowserAvailabilityConfig } = await import('../src/lib/availability.ts')
import { validateBookingPriorityConfig } from '../src/lib/availabilityPriority.ts'
const { bookingBelongsToAvailabilityAssignee } = await import('../src/lib/availabilityLinkage.ts')
const zone={id:'east',name:'Melbourne East',city:'melbourne',matchTerms:['test'],postcodes:['3000']}
const agents=[{id:'a',name:'Agent One',city:'melbourne',active:true,bookingPriority:1,calendarId:'one@group.calendar.google.com'},{id:'b',name:'Agent Two',city:'melbourne',active:true,bookingPriority:2,calendarId:'two@group.calendar.google.com'}]
const slot=(id,assigneeId)=>({id,assigneeId,city:'melbourne',label:id,day:'monday',startTime:'09:00',endTime:'10:00',zoneIds:['east'],active:true})
const make=()=>({settings:{maxSlotsToShow:20,melbourneBookingMode:'priority'},zones:[zone],assignees:structuredClone(agents),weeklySlots:[slot('one','a'),slot('two','b')],oneOffBlocks:[]})
const suggestions=(config,reservations=[])=>getAvailabilitySuggestionsForConfig(config,[zone],'melbourne','2026-11-02',reservations)
test('overlapping eligible Melbourne agents produce one choice per time in admin priority order',()=>{
 const config=make(),before=structuredClone(config),result=suggestions(config)
 assert.ok(result.length>0);assert.ok(result.every(s=>s.assigneeId==='a' && s.calendarId===agents[0].calendarId))
 assert.equal(new Set(result.map(s=>s.startTime)).size,result.length);assert.deepEqual(config,before)
 config.assignees[0].bookingPriority=3
 assert.ok(suggestions(config).every(s=>s.assigneeId==='b' && s.calendarId===agents[1].calendarId))
})
test('bookings and block-outs remove only the occupied agent and allow fallback',()=>{
 const config=make();const reservations=[{assigneeId:'a',start:new Date('2026-11-01T22:00:00Z'),end:new Date('2026-11-01T22:10:00Z')}]
 assert.equal(suggestions(config,reservations).find(s=>s.startTime==='09:00').assigneeId,'b')
 config.oneOffBlocks=[{id:'block',assigneeId:'b',active:true,startsAt:'2026-11-01T22:00:00Z',endsAt:'2026-11-01T23:59:00Z',label:'Unavailable'}]
 assert.equal(suggestions(config,reservations).some(s=>s.startTime==='09:00'),false)
})
test('inactive agents, wrong-city slots and disabled windows do not receive priority bookings',()=>{
 const config=make();config.assignees[0].active=false
 assert.ok(suggestions(config).every(s=>s.assigneeId==='b'))
 config.assignees[1].city='sydney';assert.equal(suggestions(config).length,0)
 const disabled=make();disabled.weeklySlots.forEach(s=>s.active=false);assert.equal(suggestions(disabled).length,0)
})
test('legacy zone allocation and Sydney retain their existing behavior',()=>{
 const config=make();delete config.settings.melbourneBookingMode
 config.weeklySlots.forEach(s=>s.zoneIds=[])
 assert.equal(suggestions(config).length,0)
 config.weeklySlots.forEach(s=>s.zoneIds=['east'])
 assert.equal(new Set(suggestions(config).map(s=>s.assigneeId)).size,2)
 const syd=make();syd.assignees.forEach(a=>a.city='sydney');syd.weeklySlots.forEach(s=>{s.city='sydney';s.zoneIds=['east']})
 assert.equal(new Set(getAvailabilitySuggestionsForConfig(syd,[{...zone,city:'sydney'}],'sydney','2026-11-02').map(s=>s.assigneeId)).size,2)
})
test('priority operates after conflict checks and before the displayed-slot limit',()=>{
 const config=make();config.settings.maxSlotsToShow=1;config.assignees[0].bookingPriority=3
 assert.equal(suggestions(config)[0].assigneeId,'b')
})
test('normalization preserves independent calendars and priority and defaults older configs to zones',()=>{
 const config=make(),merged=mergeAvailabilityConfig(config)
 assert.equal(merged.settings.melbourneBookingMode,'priority');assert.equal(merged.assignees[1].bookingPriority,2)
 assert.equal(merged.assignees[1].calendarId,agents[1].calendarId)
 assert.equal(toBrowserAvailabilityConfig(merged).assignees[1].calendarId,undefined)
 assert.deepEqual(getAssigneeServiceZones(config,'b'),[zone])
 delete config.settings.melbourneBookingMode
 assert.equal(mergeAvailabilityConfig(config).settings.melbourneBookingMode,'zones')
})
test('admin must supply distinct priorities and separate specific calendars',()=>{
 assert.equal(validateBookingPriorityConfig(make()),null)
 for(const patch of [{bookingPriority:1},{bookingPriority:0},{bookingPriority:1.5},{bookingPriority:1000},{bookingPriority:undefined},{calendarId:agents[0].calendarId},{calendarId:''},{calendarId:'primary'}]){
  const config=make();Object.assign(config.assignees[1],patch);assert.ok(validateBookingPriorityConfig(config),JSON.stringify(patch))
 }
})
test('changing ranking does not move existing bookings between agents',()=>{
 const config=make(),booking={inputs:{city:'melbourne',preferredInspectionAssigneeId:'a'}}
 config.assignees[0].bookingPriority=3
 assert.equal(bookingBelongsToAvailabilityAssignee(booking,config.assignees[0],[zone]),true)
 assert.equal(bookingBelongsToAvailabilityAssignee(booking,config.assignees[1],[zone]),false)
 assert.equal(booking.inputs.preferredInspectionAssigneeId,'a')
})

test('suburb coverage precedes priority and does not spill into an unselected area',()=>{
 const config=make();config.weeklySlots[0].zoneIds=['west']
 assert.ok(suggestions(config).length>0)
 assert.ok(suggestions(config).every(s=>s.assigneeId==='b'))
 config.weeklySlots[1].zoneIds=['west'];assert.equal(suggestions(config).length,0)
 config.weeklySlots[0].zoneIds=[];assert.equal(suggestions(config).length,0)
 assert.deepEqual(getAssigneeServiceZones(config,'a'),[])
})
