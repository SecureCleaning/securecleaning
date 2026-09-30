import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE admin_staff_accounts(id uuid,active boolean,role text);
CREATE TABLE quotes(id uuid,final_quote_document jsonb,firm_quote_workflow jsonb,inputs jsonb);
CREATE TABLE contract_products(id uuid,status text,state text,assigned_staff_id uuid,source_quote_id uuid,updated_at timestamptz,cleaner_scope_snapshot jsonb,source_quote_document_version int,time_preference text,keyed_job text);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);`)
const migration=readFileSync(new URL('../../supabase/contract_product_timing_refresh_migration.sql',import.meta.url),'utf8')
await db.exec(migration);await db.exec(migration)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const inputs={city:'sydney',suburb:'North Sydney',premisesType:'office',frequency:'weekly',timePreference:'after_hours'}
const scope={...inputs,state:'NSW',rooms:[{id:'room'}]}
await db.query("INSERT INTO admin_staff_accounts VALUES($1,true,'agent')",[id(1)])
await db.query('INSERT INTO quotes(id,final_quote_document) VALUES($1,$2)',[id(2),{inputs}])
await db.query("INSERT INTO contract_products VALUES($1,'withdrawn','NSW',$2,$3,'2026-09-30Z',NULL,1,'business_hours','keyed')",[id(3),id(1),id(2)])
const call=async(actor=id(1),snapshot=scope,stamp='2026-09-30T00:00:00Z')=>db.query('SELECT refresh_contract_product_cleaner_scope($1,$2,2,$3,$4,$5,$6)',[id(3),stamp,snapshot,actor,'agent','NSW'])
await assert.rejects(call(id(9)),/actor not authorized/)
await assert.rejects(call(id(1),{...scope,timePreference:'business_hours'}),/does not match/)
await call()
const row=(await db.query('SELECT * FROM contract_products')).rows[0]
assert.equal(row.time_preference,'after_hours');assert.equal(row.cleaner_scope_snapshot.timePreference,'after_hours');assert.equal(row.keyed_job,'keyed')
assert.equal(row.source_quote_document_version,2)
await assert.rejects(call(),/changed while editing/)
await db.exec("UPDATE contract_products SET status='available'")
await assert.rejects(call(id(1),scope,row.updated_at),/cannot be refreshed/)
const permissions=(await db.query("SELECT has_function_privilege('anon','refresh_contract_product_cleaner_scope(uuid,timestamptz,integer,jsonb,uuid,text,text)','EXECUTE') AS anon, has_function_privilege('service_role','refresh_contract_product_cleaner_scope(uuid,timestamptz,integer,jsonb,uuid,text,text)','EXECUTE') AS service")).rows[0]
assert.equal(permissions.anon,false);assert.equal(permissions.service,true)
await db.close();console.log('Timing refresh migration, replay, atomic update, permissions and stale/published protection passed')
