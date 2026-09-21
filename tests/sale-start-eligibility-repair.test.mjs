import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
test('sale-start repair restores the established approval-only function without replacing newer handover logic',()=>{
 const repair=source('supabase/contract_sale_start_eligibility_repair_migration.sql')
 const approved=source('supabase/contract_sale_approved_cleaners_migration.sql')
 const functionBody=sql=>sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION create_contract_product_sale('),sql.indexOf('\n$$;')+4)
 assert.equal(functionBody(repair),functionBody(approved))
 assert.doesNotMatch(repair,/CREATE OR REPLACE FUNCTION complete_contract_sale_handover/)
 assert.match(repair,/FROM PUBLIC, anon, authenticated/)
 assert.match(repair,/TO service_role/)
})
