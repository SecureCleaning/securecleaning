import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service'
const { getAvailabilitySuggestionsForConfig, mergeAvailabilityConfig }=await import('../src/lib/availability.ts')
const { replaceOneOffAvailabilityEvents }=await import('../src/lib/availabilityCalendarClient.ts')
import { validOneOffWindow } from '../src/lib/oneOffAvailability.ts'
const zone={id:'zone',name:'Test',city:'sydney',matchTerms:[],postcodes:[]}
const slot={id:'once',assigneeId:'agent',city:'sydney',date:'2026-11-26',day:'monday',startTime:'14:00',endTime:'15:00',zoneIds:['zone'],active:true,label:'Extra availability'}
const config=()=>({settings:{maxSlotsToShow:50},assignees:[{id:'agent',name:'Agent',city:'sydney',active:true}],zones:[zone],weeklySlots:[{...slot}],oneOffBlocks:[]})
const get=(c,date,reservations=[])=>getAvailabilitySuggestionsForConfig(c,[zone],'sydney',date,reservations)
test('one-off window survives normalization, offers only its date and never exceeds its end',()=>{
 const c=mergeAvailabilityConfig(config())
 assert.equal(c.weeklySlots[0].date,slot.date)
 const results=get(c,slot.date);assert.ok(results.length>0)
 assert.ok(results.every(item=>item.day==='thursday'&&item.startTime>='14:00'&&item.endTime<='15:00'))
 assert.equal(get(c,'2026-12-03').length,0);assert.equal(get(c,undefined).length,0)
})
test('one-off windows obey blocks, reservations, zones and active agents',()=>{
 const c=config();c.oneOffBlocks=[{id:'block',assigneeId:'agent',active:true,startsAt:'2026-11-26T03:00:00Z',endsAt:'2026-11-26T04:00:00Z'}]
 assert.equal(get(c,slot.date).length,0)
 c.oneOffBlocks=[]
 assert.equal(get(c,slot.date,[{assigneeId:'agent',start:new Date('2026-11-26T03:00:00Z'),end:new Date('2026-11-26T04:00:00Z')}]).length,0)
 c.assignees[0].active=false;assert.equal(get(c,slot.date).length,0)
 c.assignees[0].active=true;c.weeklySlots[0].zoneIds=[];assert.equal(get(c,slot.date).length,0)
})
test('invalid dates or reversed times never become recurring availability',()=>{
 for(const change of [{date:''},{date:'2026-02-30'},{endTime:'13:00'}]){
 const c=config();Object.assign(c.weeklySlots[0],change)
 assert.equal(validOneOffWindow(c.weeklySlots[0]),false)
 assert.equal(get(mergeAvailabilityConfig(c),'2026-11-26').length,0)
 }
})
test('saved one-off calendar windows replace instead of duplicate and preserve other events',()=>{
 const booking={id:'booking',kind:'inspection',startsAt:'2026-11-26T00:00:00Z',endsAt:'2026-11-26T01:00:00Z',title:'Booking'}
 const first=replaceOneOffAvailabilityEvents([booking],[slot],'sydney')
 const second=replaceOneOffAvailabilityEvents(first,[slot],'sydney')
 assert.equal(second.length,2);assert.deepEqual(second.find(e=>e.id==='booking'),booking)
 assert.equal(second.find(e=>e.kind==='availability').startsAt,'2026-11-26T03:00:00.000Z')
 assert.deepEqual(replaceOneOffAvailabilityEvents(second,[],'sydney'),[booking])
})

test('one-off windows do not change permanent zone coverage and overlapping windows offer one appointment',async()=>{
 const {getAssigneeServiceZones}=await import('../src/lib/availability.ts')
 const c=config();assert.equal(getAssigneeServiceZones(c,'agent').length,0)
 c.weeklySlots.push({...slot,id:'weekly',date:undefined,day:'thursday'})
 const results=get(c,slot.date)
 assert.equal(results.filter(r=>r.startTime==='14:00').length,1)
 assert.equal(getAssigneeServiceZones(c,'agent').length,1)
})

test('agent sanitizer preserves date and forces ownership/region, rejecting malformed one-off windows',async()=>{
 const {readFileSync}=await import('node:fs');const ts=await import('typescript');const rules=await import('../src/lib/oneOffAvailability.ts')
 const source=readFileSync(new URL('../src/app/api/availability-agent/[assigneeId]/route.ts',import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};new Function('exports','require',compiled+'\nexports.sanitize=sanitizeAgentSlots;')(exports,name=>name==='@/lib/oneOffAvailability'?rules:{})
 const result=exports.sanitize([{...slot,assigneeId:'other',city:'melbourne'}],'agent','sydney',new Set(['zone']))
 assert.equal(result[0].assigneeId,'agent');assert.equal(result[0].city,'sydney');assert.equal(result[0].date,slot.date);assert.equal(result[0].day,'thursday')
 for(const bad of [{date:''},{date:'2026-02-30'},{endTime:'13:00'},{zoneIds:['unknown']}])assert.throws(()=>exports.sanitize([{...slot,...bad}],'agent','sydney',new Set(['zone'])))
})

test('server calendar emits a dated window once, within range, and keeps weekly recurrence',async()=>{
 const {readFileSync}=await import('node:fs');const ts=await import('typescript');const rules=await import('../src/lib/oneOffAvailability.ts');const calendar=await import('../src/lib/calendarInvite.ts')
 const source=readFileSync(new URL('../src/lib/availabilityCalendar.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};new Function('exports','require',code+'\nexports.build=buildAvailabilityEvents;')(exports,name=>name==='./oneOffAvailability'?rules:name==='@/lib/calendarInvite'?calendar:{})
 const events=exports.build([slot,{...slot,id:'weekly',date:undefined,day:'thursday'}],[zone],'sydney',new Date('2026-11-01T00:00:00Z'),new Date('2026-12-01T00:00:00Z'))
 assert.equal(events.filter(e=>e.id==='one-off-availability-once').length,1)
 assert.equal(events.filter(e=>e.id.startsWith('availability-weekly')).length,4)
 assert.equal(exports.build([slot],[zone],'sydney',new Date('2026-12-01T00:00:00Z'),new Date('2027-01-01T00:00:00Z')).length,0)
})
test('a one-off appointment cannot extend into a block starting mid-appointment',()=>{
 const c=config();c.oneOffBlocks=[{id:'mid',active:true,assigneeId:'agent',startsAt:'2026-11-26T03:05:00Z',endsAt:'2026-11-26T04:00:00Z'}]
 assert.equal(get(c,slot.date).length,0)
})
