// In-memory PostgreSQL only. Never connects to production or sends messages.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
if (!process.env.PGLITE_MODULE_PATH) throw new Error('Set PGLITE_MODULE_PATH to the local test-only PGlite module.')
const { PGlite }=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db=new PGlite()
const migration=readFileSync('supabase/migrations/20261030055403_configure_queensland_booking.sql','utf8')
const qld='00000000-0000-0000-0000-000000000001',vic='00000000-0000-0000-0000-000000000002'
const old={settings:{maxSlotsToShow:6,melbourneBookingMode:'priority'},zones:[{id:'existing',city:'melbourne',postcodes:['3000']}],assignees:[{id:'qld-test',city:'brisbane',active:true},{id:'vic-test',city:'melbourne',active:true}],weeklySlots:[{id:'existing-slot',assigneeId:'vic-test'}],oneOffBlocks:[{id:'old-block'}]}
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 SET check_function_bodies=off;
 CREATE TYPE public.city_type AS ENUM ('melbourne','sydney');
 CREATE TABLE public.availability_private_config(key text PRIMARY KEY,content jsonb);
 CREATE TABLE public.admin_staff_accounts(id uuid,active boolean,role text,availability_assignee_id text);
 CREATE TABLE public.quotes(id uuid); CREATE TABLE public.sms_settings(id boolean);
 CREATE TABLE public.crm_opportunities(id uuid); CREATE TABLE public.contract_products(id uuid); CREATE TABLE public.clients(id uuid);`)
 await db.query('INSERT INTO availability_private_config VALUES ($1,$2)', ['availability.config',JSON.stringify(old)])
 await db.query('INSERT INTO admin_staff_accounts VALUES ($1,true,$2,$3),($4,true,$2,$5)',[qld,'agent','qld-test',vic,'vic-test'])
 await db.exec(readFileSync('supabase/migrations/20261030055359_add_queensland_service_region.sql','utf8'))
 await db.exec(migration)
 // Actual existing SQL authorization routine, with region and role isolation.
 const allowed=async(id,state)=>(await db.query('SELECT public.agent_can_access_product_state($1,$2) AS ok',[id,state])).rows[0].ok
 assert.equal(await allowed(qld,'QLD'),true)
 for(const state of ['NSW','VIC','WA']) assert.equal(await allowed(qld,state),false)
 assert.equal(await allowed(vic,'QLD'),false);assert.equal(await allowed(vic,'VIC'),true)
 await db.query('UPDATE admin_staff_accounts SET active=false WHERE id=$1',[qld]);assert.equal(await allowed(qld,'QLD'),false)
 const config=async()=>(await db.query('SELECT content FROM availability_private_config')).rows[0].content
 const after=await config()
 assert.equal(after.zones.length,4)
 assert.deepEqual({...after,zones:after.zones.filter(z=>!z.id.startsWith('qld_'))},old)
 await db.exec('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;')
 await db.exec(migration);assert.deepEqual(await config(),after)
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.agent_can_access_product_state(uuid,text)','EXECUTE') AS ok")).rows[0].ok,false)
 assert.equal((await db.query("SELECT has_function_privilege('service_role','public.agent_can_access_product_state(uuid,text)','EXECUTE') AS ok")).rows[0].ok,true)
 assert.equal((await db.query("SELECT 'brisbane'::public.city_type AS city")).rows[0].city,'brisbane')
 console.log('PASS: both migrations execute; Queensland state isolation, inactive agent rejection, existing configuration preservation and idempotency verified.')
} finally {await db.close()}
