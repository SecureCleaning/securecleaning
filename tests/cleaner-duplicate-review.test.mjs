import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanerMatchReasons, cleanerPhoneKey, prepareCleanerReview } from '../src/lib/cleanerDuplicateReview.ts'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('matches case-insensitive email, formatted Australian phones and full names', () => {
 const row={email:'cleaner@example.test',phone:'+61 490 007 629',first_name:'Satish',last_name:'Bhandari'}
 assert.deepEqual(cleanerMatchReasons({email:' Cleaner@Example.test ',phone:'0490007629',firstName:'satish',lastName:'BHANDARI'},row),['Email','Phone','Full name'])
 assert.equal(cleanerPhoneKey('0490 007 629'),cleanerPhoneKey('+61 490 007 629'))
 assert.deepEqual(cleanerMatchReasons({email:'new@example.test',alternatePhone:'0490 007 629'},row),['Phone'])
 assert.deepEqual(cleanerMatchReasons({firstName:'Satish'},row),[])
 assert.deepEqual(cleanerMatchReasons({phone:'123'}, {phone:'123'}),[])
})
test('review defaults to existing data, appends notes, and preserves replaced values', () => {
 const existing={email:'old@example.test',phone:'0400000000',notes:'Existing history',status:'approved',services:'Cleaning',firstName:'Old'}
 const incoming={email:'new@example.test',phone:'0411111111',notes:'New context',status:'lead',services:'',firstName:'New'}
 const merged=prepareCleanerReview(existing,incoming,{email:'incoming',phone:'both',firstName:'existing'})
 assert.equal(merged.email,incoming.email);assert.equal(merged.phone,existing.phone)
 assert.equal(merged.status,'approved');assert.equal(merged.services,'Cleaning');assert.equal(merged.firstName,'Old')
 assert.match(merged.notes,/Existing history/);assert.match(merged.notes,/Previous Email: old@example.test/);assert.match(merged.notes,/Additional Mobile: 0411111111/);assert.match(merged.notes,/Submitted notes: New context/)
 assert.equal(existing.notes,'Existing history');assert.equal(incoming.notes,'New context')
})
test('empty incoming values never erase data; unknown fields cannot be merged', () => {
 assert.deepEqual(prepareCleanerReview({email:'a',notes:'history',id:'existing'},{email:'',notes:'',id:'new'},{email:'incoming',id:'incoming'}),{email:'a',notes:'history',id:'existing'})
})
function load(path, mocks) {
 const module={exports:{}}
 const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports',code)(name=>{if(name in mocks)return mocks[name];throw Error(name)},module,module.exports)
 return module.exports
}
test('lookup paginates and applies agent region on every read, without writes',async()=>{
 const calls=[]
 const rows=Array.from({length:501},(_,i)=>({id:String(i),state:'NSW',first_name:'Test',last_name:String(i),email:i===500?'match@example.test':'different@example.test'}))
 const db={from(table){assert.equal(table,'cleaners');const call={};calls.push(call);return {select(){return this},order(){return this},eq(k,v){call.region=[k,v];return this},range(a,b){call.range=[a,b];return this},then(resolve){return Promise.resolve({data:rows.slice(call.range[0],call.range[1]+1),error:null}).then(resolve)}}}}
 const lookup=load('src/lib/cleanerDuplicateLookup.ts',{'@/lib/supabase':{getAdminSupabase:()=>db},'@/lib/cleanerDuplicateReview':{cleanerMatchReasons}})
 const result=await lookup.findCleanerMatches({email:'MATCH@example.test'},'NSW')
 assert.equal(result.length,1);assert.equal(result[0].id,'500');assert.equal(calls.length,2)
 for(const call of calls)assert.deepEqual(call.region,['state','NSW'])
})
test('lookup endpoints deny unauthorized users before accessing cleaner data',async()=>{
 for(const [path,auth] of [
 ['src/app/api/admin/cleaners/matches/route.ts',{'@/lib/cleanerAdminAuth':{authorizeCleanerAdminRequest:async()=>({identity:null,error:'Forbidden',status:403})}}],
 ['src/app/api/availability-agent/[assigneeId]/cleaners/matches/route.ts',{'@/lib/cleanerAgentAccess':{getCleanerAgentContext:async()=>null}}],
 ]) {
 const api=load(path,{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/abuseProtection':{rejectCrossOriginMutation:()=>null,rejectLargePayload:async()=>null,rateLimit:async()=>null},'@/lib/cleanerDuplicateLookup':{findCleanerMatches:()=>assert.fail('unauthorized lookup')},...auth})
 const result=await api.POST({}, {params:Promise.resolve({assigneeId:'agent'})})
 assert.ok([401,403].includes(result.status))
 }
})

test('comparison UI stages chosen details without saving and prevents same-email separate creation', async () => {
 const rules=await import('../src/lib/cleanerDuplicateReview.ts')
 const jsx=await import('react/jsx-runtime')
 const states=[];let cursor=0,prepared=null,cancelled=0
 const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}]},useRef:()=>({current:null}),useEffect:()=>{}}
 const module={exports:{}}
 const code=ts.transpileModule(readFileSync(new URL('../src/components/cleaners/CleanerDuplicateReview.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const record={id:'existing',email:'same@example.test',phone:'0400000000',notes:'History',updated_at:'v1'}
 const requests=[]
 new Function('require','module','exports','fetch',code)(name=>({'react':react,'react/jsx-runtime':jsx,'@/lib/cleanerDuplicateReview':rules}[name]),module,module.exports,async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({cleaner:record})}})
 const props={matches:[{id:'existing',name:'Cleaner',email:record.email,phone:record.phone,reasons:['Email']}],incoming:{email:record.email,phone:'0411111111',notes:'New'},apiBase:'/api/admin/cleaners',toForm:r=>({email:r.email,phone:r.phone,notes:r.notes}),onPrepared:async(...values)=>{prepared=values},onSeparate:()=>assert.fail('unexpected create'),onCancel:()=>{cancelled++}}
 function render(){cursor=0;return module.exports.default(props)}
 function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return [];return [node,...nodes(node.props?.children)]}
 let tree=render()
 const separate=nodes(tree).find(n=>n.type==='button'&&String(n.props.children).startsWith('Different cleaner'))
 assert.equal(separate.props.disabled,true)
 nodes(tree).find(n=>n.type==='button'&&n.key==='existing').props.onClick()
 await new Promise(resolve=>setImmediate(resolve));tree=render()
 nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Keep Mobile').props.onChange({target:{value:'incoming'}})
 tree=render()
 await nodes(tree).find(n=>n.type==='button'&&n.props.children==='Review updates in existing record').props.onClick()
 assert.equal(prepared[0],'existing');assert.equal(prepared[1].phone,'0411111111');assert.match(prepared[1].notes,/Previous Mobile: 0400000000/);assert.equal(prepared[2],'v1')
 assert.equal(requests.length,1);assert.equal(requests[0].options.method,undefined)
 tree=render();nodes(tree).find(n=>n.type==='button'&&n.props.children==='Back to new entry').props.onClick();assert.equal(cancelled,1)
 props.incoming.notes='x'.repeat(2100);tree=render()
 assert.equal(nodes(tree).find(n=>n.type==='button'&&n.props.children==='Review updates in existing record').props.disabled,true)
 assert.ok(nodes(tree).some(n=>n.props?.role==='alert'))
})
