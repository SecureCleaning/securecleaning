import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as menus from '../src/lib/menuConfiguration.ts'
import * as invoicePolicy from '../src/lib/invoiceDirectoryPolicy.ts'

function moduleWithMocks(path, mocks) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, Buffer, URLSearchParams, console, require(name) {
    if (name === 'server-only') return {}
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
    return mocks[name]
  } })
  return exports
}
const json = value => JSON.parse(JSON.stringify(value))

test('default menus preserve every existing destination and put invoices directly on top', () => {
  const config = menus.parseMenuConfiguration(menus.defaultMenuConfiguration())
  for (const audience of ['admin', 'agent']) {
    const ids = config[audience].items.flatMap(item => item.kind === 'link' ? [item.id] : item.children)
    assert.equal(new Set(ids).size, menus.MENU_CATALOG[audience].length)
    assert.ok(config[audience].items.some(item => item.kind === 'link' && item.id === 'invoices'))
    assert.ok(ids.includes('commissions'))
  }
})

test('menu validator rejects missing, repeated, external, cross-audience and nested links', () => {
  for (const mutate of [
    c => c.admin.items.pop(),
    c => c.admin.items.push({kind:'link',id:'overview'}),
    c => c.admin.items.push({kind:'link',id:'https://example.com'}),
    c => c.admin.items.push({kind:'link',id:'portal'}),
    c => c.admin.items.find(x=>x.kind==='group').children.push({kind:'group',children:[]}),
    c => c.admin.items.find(x=>x.kind==='group').label = '<script>bad</script>',
    c => c.admin.items.find(x=>x.kind==='group').label = 'a'.repeat(31),
    c => c.admin.items.find(x=>x.kind==='group').id = 'overview',
    c => c.admin.items.find(x=>x.kind==='group').id = 'top',
  ]) {
    const config = menus.defaultMenuConfiguration(); mutate(config)
    assert.throws(()=>menus.parseMenuConfiguration(config))
  }
})

test('moving links preserves unique membership and configuration cannot hide itself', () => {
  const config = menus.defaultMenuConfiguration()
  config.admin = menus.moveMenuLink(config.admin, 'invoices', 'sales-group')
  assert.ok(config.admin.items.find(x=>x.id==='sales-group').children.includes('invoices'))
  config.admin = menus.moveMenuLink(config.admin, 'invoices', 'hidden')
  assert.deepEqual(config.admin.hidden, ['invoices'])
  config.admin = menus.moveMenuLink(config.admin, 'invoices', 'top')
  assert.doesNotThrow(()=>menus.parseMenuConfiguration(config))
  config.admin = menus.moveMenuLink(config.admin, 'menus', 'hidden')
  assert.throws(()=>menus.parseMenuConfiguration(config), /Keep Menu configuration visible/)
})

test('role filters hide owner-only controls, empty groups and inaccessible invoice links', () => {
  for (const role of ['viewer','staff','manager','owner']) {
    const destinations = menus.menuDestinations('admin', role)
    assert.equal(destinations.some(x=>x.id==='menus'), role==='owner')
    assert.equal(destinations.some(x=>x.id==='invoices'), ['owner','manager'].includes(role))
    const layout = menus.filterMenuLayout(menus.defaultMenuConfiguration().admin, destinations.map(x=>x.id))
    assert.ok(layout.items.every(x=>x.kind==='link' || x.children.length))
  }
  assert.deepEqual(menus.menuDestinations('admin','agent'), [])
  assert.ok(menus.menuDestinations('agent','agent','agent/a').find(x=>x.id==='invoices').href.endsWith('agent%2Fa'))
  assert.ok(menus.isMenuDestinationActive('/admin/quotes/ABC','/admin'))
  assert.equal(menus.isMenuDestinationActive('/admin/invoices','/'),false)
})

test('menu actor revalidates disabled, changed-role and stale-username sessions', async () => {
  let account = { id:'owner', username:'lyle', role:'owner', active:true }
  const mod = moduleWithMocks('src/lib/menuSettingsAuth.ts', {'@/lib/staffAccounts':{getStaffAccountProfileById:async()=>account}})
  const identity = {id:'owner',username:'lyle',role:'owner'}
  assert.equal(await mod.getMenuSettingsActor(null), null)
  assert.ok(await mod.getMenuSettingsActor(identity))
  for (const changes of [{active:false},{role:'viewer'},{username:'changed'}]) {
    account = {...identity,active:true,...changes}
    assert.equal(await mod.getMenuSettingsActor(identity), null)
  }
})

function storageFixture({failAudit=false,result={data:{updated_at:'revision-2'},error:null}}={}) {
  const calls = []
  const chain = new Proxy({}, {get(_,name) { if(name==='then') return resolve=>resolve(result); return (...args)=>{calls.push([name,...args]);return chain} }})
  const mod = moduleWithMocks('src/lib/menuSettings.ts', {
    '@/lib/supabase':{getAdminSupabase:()=>({from:(...args)=>{calls.push(['from',...args]);return chain}})},
    '@/lib/auditLog':{writeAuditLogStrict:async()=>{calls.push(['audit']);if(failAudit)throw new Error('audit unavailable')}},
    '@/lib/menuConfiguration':menus,
  })
  return {mod,calls}
}

test('menu writes compare revisions and never upsert over simultaneous initial creation', async () => {
  const first=storageFixture()
  await first.mod.saveMenuSettings(menus.defaultMenuConfiguration(),null,'owner')
  assert.ok(first.calls.some(x=>x[0]==='insert')); assert.ok(!first.calls.some(x=>x[0]==='upsert'))
  const stale=storageFixture({result:{data:null,error:null}})
  await assert.rejects(()=>stale.mod.saveMenuSettings(menus.defaultMenuConfiguration(),'old','owner'),/another session/)
  assert.ok(stale.calls.some(x=>x[0]==='eq'&&x[1]==='updated_at'&&x[2]==='old'))
  const collision=storageFixture({result:{data:null,error:{code:'23505'}}})
  await assert.rejects(()=>collision.mod.saveMenuSettings(menus.defaultMenuConfiguration(),null,'owner'),/another session/)
})

test('audit failure prevents a menu write', async () => {
  const {mod,calls}=storageFixture({failAudit:true})
  await assert.rejects(()=>mod.saveMenuSettings(menus.defaultMenuConfiguration(),null,'owner'),/audit unavailable/)
  assert.ok(!calls.some(x=>['insert','update'].includes(x[0])))
})

test('menu endpoint permits only active owner mutations and returns private role-filtered reads', async () => {
  let actor={id:'staff-1',role:'manager',availabilityAssigneeId:null}, writes=0
  const route=moduleWithMocks('src/app/api/menu-settings/route.ts',{
    'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},
    '@/lib/adminAuth':{getAdminSessionIdentityFromRequest:()=>({})},
    '@/lib/menuSettingsAuth':{getMenuSettingsActor:async()=>actor},
    '@/lib/menuSettings':{getMenuSettings:async()=>({config:menus.defaultMenuConfiguration(),revision:null}),saveMenuSettings:async()=>{writes++;return{}},MenuSettingsConflict:class extends Error{}},
    '@/lib/menuConfiguration':menus,
    '@/lib/abuseProtection':{rejectCrossOriginMutation:()=>null,rejectLargePayload:()=>null,rateLimit:()=>null},
  })
  const request={nextUrl:{searchParams:new URLSearchParams()},text:async()=>JSON.stringify({config:menus.defaultMenuConfiguration(),revision:null})}
  assert.equal((await route.PUT(request)).status,403)
  const read=await route.GET(request)
  assert.equal(read.headers['Cache-Control'],'private, no-store')
  assert.ok(!JSON.stringify(read.body.layout).includes('"menus"'))
  actor={...actor,role:'owner'}
  await route.PUT(request);assert.equal(writes,1)
  actor=null;assert.equal((await route.GET(request)).status,401)
})

test('invoice search parameters are bounded and filter punctuation cannot change query structure', () => {
  assert.throws(()=>invoicePolicy.parseInvoiceDirectoryQuery(new URLSearchParams('page=-1')))
  assert.throws(()=>invoicePolicy.parseInvoiceDirectoryQuery(new URLSearchParams('status=everything')))
  const filters=invoicePolicy.parseInvoiceDirectoryQuery(new URLSearchParams({q:'x%,sale.id.eq.(stolen)'}))
  assert.doesNotMatch(filters.search, /[%,().]/)
})

test('invoice deep links require matching sale, invoice, staff assignment and state', () => {
  const sale={id:'sale-1',assignedStaffId:'agent-1',state:'VIC',invoices:[{id:'invoice-1'}]}
  const actor={id:'agent-1',role:'agent',state:'VIC'}
  assert.equal(invoicePolicy.resolveInvoiceSelection([sale],actor,'sale-1','invoice-1'),sale)
  for (const [a,s,i] of [[actor,'sale-1','invoice-other'],[actor,'sale-other','invoice-1'],[{...actor,id:'agent-2'},'sale-1','invoice-1'],[{...actor,state:'NSW'},'sale-1','invoice-1']]) assert.throws(()=>invoicePolicy.resolveInvoiceSelection([sale],a,s,i))
  const href=invoicePolicy.invoiceWorkspaceHref('sale-1','invoice-1','agent-1')
  assert.equal(href,'/availability/sales/agent-1?sale=sale-1&invoice=invoice-1&tab=invoices')
})

test('invoice directory filters assignment and region in the database, returns minimal paged fields', async () => {
  const calls=[]
  const row={id:'invoice-1',invoice_number:'SC-1',recipient_business_snapshot:'Example',status:'issued',issued_at:'2026-09-21',due_on:null,total_inc_gst_cents:50000,sale:{id:'sale-1',sale_code:'PS-1',assigned_staff_id:'agent-1',product:{state:'VIC',assigned_staff_id:'agent-1'}},private_note:'must not leak'}
  const rows=[row,{...row,id:'forbidden',sale:{...row.sale,assigned_staff_id:'agent-2'}}]
  function table(name){const chain=new Proxy({}, {get(_,method){if(method==='then')return resolve=>resolve({data:name==='contract_sale_invoices'?rows:[{invoice_id:'invoice-1',amount_cents:10000}],error:null});return(...args)=>{calls.push([name,method,...args]);return chain}}});return chain}
  const mod=moduleWithMocks('src/lib/invoiceDirectory.ts',{'@/lib/supabase':{getAdminSupabase:()=>({from:table})},'@/lib/contractSalePolicy':{canManageContractSale:(role,id,assigned)=>role!=='agent'||id===assigned},'@/lib/invoiceDirectoryPolicy':invoicePolicy})
  const result=await mod.getInvoiceDirectory({id:'agent-1',role:'agent',productState:'VIC'},{page:0,status:'all',search:''})
  for(const [field,value] of [['sale.assigned_staff_id','agent-1'],['sale.product.assigned_staff_id','agent-1'],['sale.product.state','VIC']])assert.ok(calls.some(c=>c[1]==='eq'&&c[2]===field&&c[3]===value))
  assert.ok(calls.some(c=>c[1]==='range'&&c[2]===0&&c[3]===25))
  assert.equal(result.invoices.length,1);assert.equal(result.invoices[0].paidCents,10000)
  assert.ok(!JSON.stringify(result).includes('private_note'))
  assert.equal(json(result.invoices[0]).saleId,'sale-1')
})

test('invoice allocation pagination uses the real composite key and includes every payment', async () => {
  const migration = readFileSync(new URL('../supabase/contract_product_sales_migration.sql', import.meta.url), 'utf8')
  const definition = migration.match(/CREATE TABLE IF NOT EXISTS contract_sale_payment_allocations \(([\s\S]*?)\n\);/)[1]
  assert.match(definition, /PRIMARY KEY\(payment_id, invoice_id\)/)
  assert.doesNotMatch(definition, /^\s*id\s/im)
  const invoice={id:'invoice-1',invoice_number:'SC-1',recipient_business_snapshot:'Example',status:'part_paid',issued_at:'2026-09-21',due_on:null,total_inc_gst_cents:999999,sale:{id:'sale-1',sale_code:'PS-1',assigned_staff_id:null,product:{state:'VIC',assigned_staff_id:null}}}
  const invoices=[invoice,{...invoice,id:'invoice-2',invoice_number:'SC-2'}]
  // A payment may be allocated to more than one invoice, so both key columns matter.
  const allocations=Array.from({length:501},(_,index)=>({payment_id:`payment-${String(Math.floor(index/2)).padStart(4,'0')}`,invoice_id:index%2?'invoice-2':'invoice-1',amount_cents:100})).reverse()
  const offsets=[], pageOrders=[]
  function table(name) {
    let start=0,end=999
    const orders=[]
    const chain=new Proxy({}, {get(_,method) {
      if(method==='then') return resolve=>{
        if(name==='contract_sale_invoices') return resolve({data:invoices,error:null})
        pageOrders.push([...orders])
        const sorted=[...allocations].sort((a,b)=>{
          for(const column of orders) { const difference=String(a[column]).localeCompare(String(b[column])); if(difference)return difference }
          return 0
        })
        return resolve({data:sorted.slice(start,end+1),error:null})
      }
      return(...args)=>{
        if(method==='order' && name==='contract_sale_payment_allocations') {
          assert.ok(Object.hasOwn(allocations[0],args[0]), `42703: allocation column ${args[0]} does not exist`)
          orders.push(args[0])
        }
        if(method==='range') { [start,end]=args; if(name==='contract_sale_payment_allocations')offsets.push(start) }
        return chain
      }
    }})
    return chain
  }
  const mod=moduleWithMocks('src/lib/invoiceDirectory.ts',{'@/lib/supabase':{getAdminSupabase:()=>({from:table})},'@/lib/contractSalePolicy':{canManageContractSale:()=>true},'@/lib/invoiceDirectoryPolicy':invoicePolicy})
  const result=await mod.getInvoiceDirectory({id:'owner-1',role:'owner',productState:null},{page:0,status:'all',search:''})
  assert.equal(result.invoices[0].paidCents,25100)
  assert.equal(result.invoices[1].paidCents,25000)
  assert.deepEqual(offsets,[0,500])
  assert.deepEqual(pageOrders,[['payment_id','invoice_id'],['payment_id','invoice_id']])
})
