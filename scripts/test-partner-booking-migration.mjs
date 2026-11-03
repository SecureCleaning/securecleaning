// Isolated PostgreSQL fixture. No production connection or external delivery.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '/tmp/sc-partner-db-test/node_modules/@electric-sql/pglite/dist/index.js')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TYPE city_type AS ENUM('melbourne','sydney','brisbane');
CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_name text, contact_name text, email text, phone text, address text, city city_type, created_at timestamptz DEFAULT now());
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY, availability_assignee_id text, active boolean, role text);
CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_ref text UNIQUE,client_id uuid REFERENCES clients(id),inputs jsonb,status text,inspection_status text,inspection_scheduled_for timestamptz,assigned_operator_id uuid,opportunity_id uuid);
CREATE TABLE contract_sale_inspections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,scheduled_by_staff_id uuid,starts_at timestamptz,duration_minutes int);
CREATE TABLE availability_private_config(key text PRIMARY KEY,content text);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
-- Existing CRM sync is independently tested by the application suite. The stub
-- models its no-reassignment contract, and can deliberately fail to test rollback.
CREATE TABLE crm_fixture(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assigned_staff_id uuid,booking_id uuid);
CREATE FUNCTION sync_client_crm_opportunity(uuid,uuid,uuid,uuid,text,text,text,city_type,text,text,uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid; BEGIN IF $5 = 'FAIL' THEN RAISE EXCEPTION 'fixture CRM failure'; END IF;
INSERT INTO crm_fixture(assigned_staff_id,booking_id) VALUES($11,$2) RETURNING id INTO result;
UPDATE bookings SET opportunity_id=result WHERE id=$2; RETURN result; END $$;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`)
const migration = await readFile(new URL('../supabase/migrations/20261103101314_partner_booking_portal.sql',import.meta.url),'utf8')
await db.exec(migration)
const uid='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222',rev='33333333-3333-4333-8333-333333333333',staff='44444444-4444-4444-8444-444444444444'
const config=JSON.stringify({assignees:[{id:'a',city:'melbourne',active:true}]})
await db.query('insert into availability_private_config values($1,$2)',['availability.config',config])
await db.query('insert into admin_staff_accounts values($1,$2,true,$3)',[staff,'a','agent'])
await db.query("insert into partner_booking_companies(id,name,active,cities,assignee_ids) values($1,'Fixture',true,ARRAY['melbourne'],ARRAY['a'])",[cid])
await db.query("insert into partner_booking_users(id,company_id,username,display_name,password_hash,session_version) values($1,$2,'caller','Caller','synthetic',$3)",[uid,cid,rev])
const start=new Date(Date.now()+7*86400000).toISOString()
const inputs={businessName:'Fixture Ltd',contactName:'Fixture Contact',email:'fixture@example.invalid',phone:'0400000000',address:'10 Test St',city:'melbourne',suburb:'Melbourne',postcode:'3000',preferredInspectionAssigneeId:'a',inspectionDurationMinutes:10}
let n=0
const request=()=>`55555555-5555-4555-8555-${String(++n).padStart(12,'0')}`
const call=async(key,overrides={})=>(await db.query('select create_partner_booking($1,$2,$3,$4,$5,$6,$7) result',[uid,rev,key,'fingerprint',JSON.stringify({...inputs,...overrides}),start,config])).rows[0].result
await db.exec('set role service_role')
const key=request(),first=await call(key)
assert.equal(first.created,true)
assert.equal((await call(key)).created,false)
await db.exec('reset role')
assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1)
assert.equal((await db.query('select count(*)::int n from admin_audit_log')).rows[0].n,1)
await assert.rejects(()=>db.query('select create_partner_booking($1,$2,$3,$4,$5,$6,$7)',[uid,rev,key,'DIFFERENT',JSON.stringify(inputs),start,config]),/conflict/)
await assert.rejects(()=>call(request(),{email:'second@example.invalid'}),/no longer available/)
assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n,1,'failed booking rolled back contact insert')
await assert.rejects(async()=>db.query("insert into bookings(booking_ref,client_id,inputs,status,inspection_status,inspection_scheduled_for) values('PUBLIC',$1,$2,'pending','scheduled',$3)",[ (await db.query('select id from clients')).rows[0].id,JSON.stringify(inputs),start]),/no longer available/)
await assert.rejects(()=>db.query("insert into contract_sale_inspections(status,scheduled_by_staff_id,starts_at,duration_minutes) values('scheduled',$1,$2,60)",[staff,start]),/no longer available/)
await db.query("update bookings set status='cancelled' where id=$1",[first.bookingId])
const second=await call(request());assert.equal(second.created,true,'cancelled booking frees the time')
await db.query("update partner_booking_companies set active=false where id=$1",[cid]);await assert.rejects(()=>call(request()),/revoked/)
await db.query("update partner_booking_companies set active=true,cities='{}' where id=$1",[cid]);await assert.rejects(()=>call(request()),/not permitted/)
await db.query("update partner_booking_companies set cities=ARRAY['melbourne'],assignee_ids='{}' where id=$1",[cid]);await assert.rejects(()=>call(request()),/not permitted/)
await db.query("update partner_booking_companies set assignee_ids=ARRAY['a'],expires_at=now()-interval '1 hour' where id=$1",[cid]);await assert.rejects(()=>call(request()),/revoked/)
await db.query("update partner_booking_companies set expires_at=null where id=$1",[cid])
await db.query("update partner_booking_users set session_version=gen_random_uuid() where id=$1",[uid]);await assert.rejects(()=>call(request()),/revoked/)
await db.query('update partner_booking_users set session_version=$1 where id=$2',[rev,uid])
await db.query("update bookings set status='cancelled'")
await assert.rejects(()=>call(request(),{address:'FAIL',email:'fail@example.invalid'}),/fixture CRM failure/)
assert.equal((await db.query('select count(*)::int n from partner_booking_requests')).rows[0].n,2,'CRM failure rolls entire transaction back')
await db.query("insert into contract_sale_inspections(status,scheduled_by_staff_id,starts_at,duration_minutes) values('scheduled',$1,$2,60)",[staff,start])
await assert.rejects(()=>call(request()),/no longer available/)
await db.query('delete from contract_sale_inspections')
await db.query("update availability_private_config set content='{}'");await assert.rejects(()=>call(request()),/Availability changed/)
for (const role of ['anon','authenticated']) {
 await db.exec(`set role ${role}`)
 await assert.rejects(()=>db.query('select * from partner_booking_companies'),/permission denied/)
 await assert.rejects(()=>call(request()),/permission denied/)
 await db.exec('reset role')
}
assert.equal((await db.query("select bool_and(relrowsecurity) ok from pg_class where relname in ('partner_booking_companies','partner_booking_users','partner_booking_sessions','partner_booking_requests')")).rows[0].ok,true)
console.log('PASS: atomic creation/replay, collision across entry points, cancellation, revoked/expired access, state/calendar restrictions, CRM failure rollback and private grants/RLS.')
await db.close()
