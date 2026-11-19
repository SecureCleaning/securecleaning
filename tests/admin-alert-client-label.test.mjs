import test from 'node:test'
import assert from 'node:assert/strict'
import { adminAlertClientLabel } from '../src/lib/adminAlertClientLabel.ts'

test('action labels lead with company and suburb, not opaque references or city', () => {
  assert.equal(adminAlertClientLabel({businessName:' Dixon Valve ', contactName:'Person', suburb:' Scoresby ', city:'Melbourne'}, 'BK-123'), 'Dixon Valve - Scoresby')
  assert.equal(adminAlertClientLabel({contactName:'Jane Smith', suburb:'Richmond'}, 'BK-123'), 'Jane Smith - Richmond')
  assert.equal(adminAlertClientLabel({businessName:'Company'}, 'SC-123'), 'Company')
  assert.equal(adminAlertClientLabel({suburb:'Camden'}, 'SC-123'), 'Camden')
})

test('legacy and malformed action identity data safely falls back to reference', () => {
  for (const value of [null, undefined, [], 'text', {businessName:33, suburb: {}, contactName:' '}]) {
    assert.equal(adminAlertClientLabel(value, 'BK-123'), 'BK-123')
  }
})

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as bookingWorkflow from '../src/lib/bookingWorkflow.ts'
import { rankAdminAlerts } from '../src/lib/adminAlertRanking.mjs'

test('all quote and booking alerts fetch identities and preserve action references', async () => {
  const selects = []
  let bookingQuery = 0
  const db = {from(table) {
    const index = table === 'bookings' ? bookingQuery++ : 0
    const row = {status:'pending', quote_ref:'SC-1', booking_ref:'BK-1', created_at:'2026-01-01', inspection_scheduled_for:'2026-01-01', inputs:{businessName:'Example Co', suburb:'Camden'}}
    const chain = new Proxy({}, {get(_,method) {
      if (method === 'then') return resolve => resolve({data:table === 'admin_audit_log' ? [] : [row], count:0, error:null})
      return (...args) => { if(method === 'select') selects.push({table,index,columns:args[0]}); return chain }
    }})
    return chain
  }}
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/alerts.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const mocks = {
    '@/lib/supabase': {getAdminSupabase:()=>db},
    '@/lib/auditLog': {writeAuditLogStrict:()=>{throw new Error('Unexpected write')}},
    '@/lib/adminAlertRanking.mjs': {rankAdminAlerts},
    '@/lib/adminAlertId': {isValidAdminAlertId:()=>true},
    '@/lib/bookingWorkflow': bookingWorkflow,
    '@/lib/adminAlertClientLabel': {adminAlertClientLabel},
  }
  vm.runInNewContext(code, {exports, console, require(name) {if(!(name in mocks))throw new Error(name); return mocks[name]}})
  const alerts = await exports.getAdminAlerts()
  assert.equal(alerts.length, 4)
  for(const alert of alerts) {
    assert.ok(alert.title.startsWith('Example Co - Camden - '))
    assert.equal(alert.entity_ref, alert.kind === 'new_quote' ? 'SC-1' : 'BK-1')
  }
  assert.equal(selects.filter(s=>['quotes','bookings'].includes(s.table) && s.columns.includes('inputs')).length,4)
})

test('cancelled appointment alerts disappear but live appointments and service bookings remain', async () => {
  const rows = [
    {booking_ref:'CANCELLED',quote_id:null,status:'pending',inspection_status:'cancelled',inputs:{inspectionBookingSource:'crm_manual'}},
    {booking_ref:'LIVE',quote_id:null,status:'pending',inspection_status:'scheduled',inputs:{inspectionBookingSource:'crm_manual'}},
    {booking_ref:'SERVICE',quote_id:'quote-id',status:'pending',inspection_status:'cancelled',inputs:{inspectionBookingSource:'crm_manual'}},
  ]
  let bookingQuery=0
  const db={from(table){
    const index=table==='bookings'?bookingQuery++:0
    let columns=''
    const chain=new Proxy({}, {get(_,method){
      if(method==='then')return resolve=>resolve({data:table==='bookings' && index!==1 ? rows.map(row=>Object.fromEntries(columns.split(',').map(c=>c.trim()).map(c=>[c,row[c]]))) : [],count:0,error:null})
      return (...args)=>{if(method==='select')columns=args[0];return chain}
    }})
    return chain
  }}
  const exports={}
  const mocks={
    '@/lib/supabase':{getAdminSupabase:()=>db}, '@/lib/auditLog':{writeAuditLogStrict:()=>{throw Error('Unexpected write')}},
    '@/lib/adminAlertRanking.mjs':{rankAdminAlerts}, '@/lib/adminAlertId':{isValidAdminAlertId:()=>true},
    '@/lib/bookingWorkflow':bookingWorkflow, '@/lib/adminAlertClientLabel':{adminAlertClientLabel},
  }
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/alerts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(code,{exports,console,require:name=>mocks[name]})
  const alerts=await exports.getAdminAlerts()
  assert.equal(alerts.some(a=>a.entity_ref==='CANCELLED'),false)
  for(const ref of ['LIVE','SERVICE']) {
    assert.ok(alerts.some(a=>a.entity_ref===ref && a.kind==='new_booking'))
    assert.ok(alerts.some(a=>a.entity_ref===ref && a.kind==='unassigned_booking'))
  }
})
