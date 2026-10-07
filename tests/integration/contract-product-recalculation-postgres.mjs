import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TABLE admin_staff_accounts(id uuid,active boolean,role text);
CREATE TABLE quotes(id uuid,updated_at timestamptz,inputs jsonb,firm_quote_workflow jsonb,final_quote_document jsonb);
CREATE TABLE contract_products(id uuid,source_quote_id uuid,updated_at timestamptz,status text,assigned_staff_id uuid,state text,cleaner_scope_snapshot jsonb,source_quote_document_version integer,time_preference text,frequency text,annual_visits integer,client_price_per_visit_ex_gst_cents integer,annual_contract_value_ex_gst_cents integer,purchase_price_ex_gst_cents integer,pricing_method text);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);`)
await db.exec(readFileSync('supabase/contract_product_timing_refresh_migration.sql','utf8'))
const sql=readFileSync('supabase/migrations/20261007214453_contract_product_recalculation.sql','utf8')
await db.exec(sql);await db.exec(sql)
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',stamp='2026-10-08T00:00:00Z'
const scope={state:'NSW',suburb:'Test',premisesType:'office',frequency:'fortnightly',timePreference:'after_hours',rooms:[{type:'office'}]}
await db.query('INSERT INTO admin_staff_accounts VALUES($1,true,\'owner\'),($2,true,\'agent\')',[id,other])
await db.query('INSERT INTO quotes VALUES($1,$2,$3,null,$4)',[id,stamp,{city:'sydney'},{inputs:{city:'sydney',...scope},displayPrice:{low:160}}])
await db.query(`INSERT INTO contract_products(id,source_quote_id,updated_at,status,assigned_staff_id,state,annual_visits,client_price_per_visit_ex_gst_cents,annual_contract_value_ex_gst_cents,purchase_price_ex_gst_cents,pricing_method) VALUES($1,$1,$2,'withdrawn',$1,'NSW',52,9000,468000,234000,'default_50_percent')`,[id,stamp])
const call=(actor=id,role='owner',expected=stamp,quoteStamp=stamp,rate=16000)=>db.query('SELECT recalculate_contract_product_from_quote($1,$2,2,$3,$4,$5,\'NSW\',$6,$7)',[id,expected,scope,actor,role,quoteStamp,rate])
await assert.rejects(call(other,'agent'),/outside agent/)
await assert.rejects(call(id,'owner','2020-01-01'),/changed/)
await assert.rejects(call(id,'owner',stamp,'2020-01-01'),/changed/)
await assert.rejects(call(id,'owner',stamp,stamp,17000),/match final/)
await call()
let p=(await db.query('SELECT * FROM contract_products')).rows[0]
assert.equal(p.annual_visits,26);assert.equal(p.client_price_per_visit_ex_gst_cents,16000);assert.equal(p.annual_contract_value_ex_gst_cents,416000);assert.equal(p.purchase_price_ex_gst_cents,208000);assert.equal(p.frequency,'fortnightly');assert.equal(p.time_preference,'after_hours')
await db.exec("UPDATE contract_products SET annual_value_method='manual',annual_contract_value_ex_gst_cents=500000,pricing_method='manual',purchase_price_ex_gst_cents=150000")
await call(id,'owner',p.updated_at)
p=(await db.query('SELECT * FROM contract_products')).rows[0]
assert.equal(p.annual_value_method,'calculated');assert.equal(p.purchase_price_ex_gst_cents,150000)
await db.exec("UPDATE contract_products SET status='sold'")
await assert.rejects(db.exec('UPDATE contract_products SET annual_contract_value_ex_gst_cents=600000'),/Withdraw/)
await assert.rejects(call(id,'owner',p.updated_at),/status/)
assert.ok((await db.query('SELECT * FROM admin_audit_log')).rows.length>=4)
const acl=(await db.query("SELECT has_function_privilege('anon','recalculate_contract_product_from_quote(uuid,timestamptz,integer,jsonb,uuid,text,text,timestamptz,integer)','EXECUTE') allowed")).rows[0]
assert.equal(acl.allowed,false)
await db.close();console.log('Product recalculation, override, audit, stale checks and regional ACL passed')
