import test from 'node:test'
import assert from 'node:assert/strict'
import { getCityTimeZone, getDateTimeInTimeZone } from '../src/lib/calendarInvite.ts'
import { australianLocalities, getAustralianLocalitySuggestions } from '../src/lib/australianLocalities.ts'
import { QUEENSLAND_SERVICE_ZONES } from '../src/lib/queenslandServiceZones.ts'
import { crmPostcodeMatchesRegion } from '../src/lib/clientCrmLocation.ts'
import { getStateForAvailabilityCity } from '../src/lib/cleanerAgentPolicy.ts'
import { validateBookingPriorityConfig } from '../src/lib/availabilityPriority.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic'
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic'
const { matchServiceZones, mergeAvailabilityConfig, getAvailabilitySuggestionsForConfig }=await import('../src/lib/availability.ts')

test('Queensland localities and booking zones cover each selected area, excluding unrelated regions',()=>{
 for(const [postcode,zone] of [['4000','qld_brisbane'],['4300','qld_brisbane'],['4217','qld_gold_coast'],['4558','qld_sunshine_coast'],['4567','qld_sunshine_coast']]) {
  assert.ok(getAustralianLocalitySuggestions({query:postcode,state:'QLD'}).length)
  assert.ok(matchServiceZones({postcode},'brisbane',QUEENSLAND_SERVICE_ZONES).zones.some(z=>z.id===zone),postcode)
  assert.equal(crmPostcodeMatchesRegion(postcode,'brisbane'),true)
  assert.equal(crmPostcodeMatchesRegion(postcode,'melbourne'),false)
 }
 for(const postcode of ['4870','4810','4350','2000','3000']) assert.equal(matchServiceZones({postcode},'brisbane',QUEENSLAND_SERVICE_ZONES).zones.length,0,postcode)
 assert.equal(getStateForAvailabilityCity('brisbane'),'QLD')
 assert.ok(australianLocalities.filter(r=>r.state==='QLD').length>3000)
 assert.ok(getAustralianLocalitySuggestions({query:"D'Aguilar",state:'QLD'}).some(r=>r.postcode==='4514'))
})
test('Queensland stays at UTC+10 during southern daylight saving and winter',()=>{
 assert.equal(getCityTimeZone('brisbane'),'Australia/Brisbane')
 for(const date of ['2026-01-05','2026-07-06','2026-11-02']) assert.equal(getDateTimeInTimeZone(date,'09:00',getCityTimeZone('brisbane')).getUTCHours(),23)
 assert.equal(getDateTimeInTimeZone('2026-11-02','09:00',getCityTimeZone('melbourne')).getUTCHours(),22)
})
test('Queensland prioritizes only agents with matching selected areas and independent availability',()=>{
 const zones=QUEENSLAND_SERVICE_ZONES
 const agents=[{id:'a',name:'A',city:'brisbane',active:true,bookingPriority:1,calendarId:'qld-a'}, {id:'b',name:'B',city:'brisbane',active:true,bookingPriority:2,calendarId:'qld-b'}]
 const slot=(id,assigneeId,zoneIds)=>({id,assigneeId,zoneIds,city:'brisbane',label:id,day:'monday',startTime:'09:00',endTime:'10:00',active:true})
 const config=mergeAvailabilityConfig({settings:{maxSlotsToShow:6},zones,assignees:agents,weeklySlots:[slot('one','a',['qld_gold_coast']),slot('two','b',['qld_brisbane'])],oneOffBlocks:[]})
 assert.equal(config.assignees[0].city,'brisbane')
 assert.equal(config.weeklySlots[0].city,'brisbane')
 assert.equal(validateBookingPriorityConfig(config),null)
 const matched=zones.filter(z=>z.id==='qld_brisbane')
 const suggestions=(reservations=[])=>getAvailabilitySuggestionsForConfig(config,matched,'brisbane','2026-11-02',reservations)
 assert.ok(suggestions().every(s=>s.assigneeId==='b'))
 config.weeklySlots[0].zoneIds=['qld_brisbane']
 assert.ok(suggestions().every(s=>s.assigneeId==='a' && s.calendarId==='qld-a'))
 assert.equal(suggestions([{assigneeId:'a',start:new Date('2026-11-01T23:00:00Z'),end:new Date('2026-11-01T23:10:00Z')}])[0].assigneeId,'b')
 config.weeklySlots=[]; assert.equal(suggestions().length,0)
 config.assignees[1].bookingPriority=1; assert.ok(validateBookingPriorityConfig(config))
 config.assignees[1].bookingPriority=2; config.assignees[1].calendarId='qld-a';assert.ok(validateBookingPriorityConfig(config))
})

test('Queensland cannot reuse a configured Sydney calendar when Google integration is enabled',()=>{
 const config={settings:{maxSlotsToShow:6},zones:[],weeklySlots:[],oneOffBlocks:[],assignees:[
  {id:'qld',name:'QLD',city:'brisbane',active:true,bookingPriority:1,calendarId:'shared'},
  {id:'nsw',name:'NSW',city:'sydney',active:true,calendarId:'shared'}]}
 assert.ok(validateBookingPriorityConfig(config))
 assert.equal(validateBookingPriorityConfig(config,{requireSeparateCalendars:false}),null)
})
