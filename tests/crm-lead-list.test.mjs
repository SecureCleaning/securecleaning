import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { filterSortCrmLeads, parseCrmLeadSort, crmLeadSortKey } from '../src/lib/crmLeadList.ts'
import { CRM_LEAD_STAGES } from '../src/lib/crmLeadStages.ts'
const require=createRequire(import.meta.url)
const leads=[
 {id:'b',businessName:'Beta',contactName:'John',email:'b@example.com',suburb:'Blacktown',postcode:'2148',createdAt:'2026-10-01',updatedAt:'2026-10-29',stage:'new',nextFollowUpAt:null},
 {id:'a',businessName:'Alpha',contactName:'Jane',email:'a@example.com',suburb:'Camden',postcode:'2570',createdAt:'2026-10-28',updatedAt:'2026-10-28',stage:'won',nextFollowUpAt:'2026-10-30'},
]
test('lead search includes suburb and preserves other searchable fields',()=>{
 for(const query of [' camDEN ','2570','Jane','a@example.com','Alpha']) assert.deepEqual(filterSortCrmLeads(leads,query,'updated').map(l=>l.id),['a'])
 assert.equal(filterSortCrmLeads(leads,'absent','updated').length,0)
})
test('lead sorts are deterministic and do not mutate the workspace list',()=>{
 for(const [sort,expected] of [['updated',['b','a']],['created',['a','b']],['name',['a','b']],['stage',['b','a']],['followUp',['a','b']]]) assert.deepEqual(filterSortCrmLeads(leads,'',sort).map(l=>l.id),expected)
 assert.deepEqual(leads.map(l=>l.id),['b','a'])
 assert.equal(parseCrmLeadSort('created'),'created')
 for(const bad of [null,'invalid','__proto__']) assert.equal(parseCrmLeadSort(bad),'updated')
 assert.notEqual(crmLeadSortKey('owner'),crmLeadSortKey('agent'))
})
test('production Tailwind scan emits every CRM stage background and border',async()=>{
 const postcss=require('postcss'),tailwind=require('tailwindcss'),config=require('../tailwind.config.js')
 const {css}=await postcss([tailwind(config)]).process('@tailwind utilities;', {from:undefined})
 for(const stage of Object.values(CRM_LEAD_STAGES)) for(const name of stage.colour.split(' ')) assert.ok(css.includes(`.${name} {`),`missing generated CSS for ${name}`)
})
