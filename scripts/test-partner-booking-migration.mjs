// Isolated PostgreSQL fixture. No production connection or external delivery.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '/tmp/sc-partner-db-test/node_modules/@electric-sql/pglite/dist/index.js')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TYPE city_type AS ENUM('melbourne','sydney','brisbane');
CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_name text, contact_name text, email text UNIQUE NOT NULL, phone text, address text, city city_type, created_at timestamptz DEFAULT now());
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY, availability_assignee_id text, active boolean, role text);
CREATE TYPE booking_status AS ENUM('pending','confirmed','completed','cancelled');
CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_ref text UNIQUE,client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,inputs jsonb NOT NULL,status booking_status,inspection_status text,inspection_scheduled_for timestamptz,assigned_operator_id uuid,opportunity_id uuid,quote_id uuid,site_id uuid);
CREATE TABLE contract_sale_inspections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,scheduled_by_staff_id uuid,starts_at timestamptz,duration_minutes int);
CREATE TABLE availability_private_config(key text PRIMARY KEY,content text);
CREATE TABLE crm_reconciliation_issues(record_type text,record_id uuid,issue_code text,details jsonb, UNIQUE(record_type,record_id,issue_code));
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
await db.exec(await readFile(new URL('../supabase/migrations/20261103234059_partner_appointment_proposals.sql',import.meta.url),'utf8'))
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
await db.query('update availability_private_config set content=$1',[config])
const proposedDay=new Date(Date.now()+14*86400000);while([0,6].includes(proposedDay.getUTCDay()))proposedDay.setUTCDate(proposedDay.getUTCDate()+1)
const proposedTimes=[{date:proposedDay.toISOString().slice(0,10),startTime:'18:00'},{date:proposedDay.toISOString().slice(0,10),startTime:'20:00'}]
const proposedInputs={...inputs,inspectionBookingSource:'partner_request',requestedInspectionTimes:proposedTimes,preferredStartDate:''}
const propose=async(id,overrides={})=>(await db.query('select create_partner_booking($1,$2,$3,$4,$5,NULL,$6) result',[uid,rev,id,'proposal-hash',JSON.stringify({...proposedInputs,...overrides}),config])).rows[0].result
const decide=async(id,decision='confirmed',selected=0,assignee='a',reason='Fixture reason')=>(await db.query('select decide_partner_appointment_request($1,$2,$3,$4,$5,$6,$7) result',[id,assignee,'fixture-staff',decision,selected,reason,config])).rows[0].result
const p1=request(),p2=request(),pending1=await propose(p1),pending2=await propose(p2)
assert.equal((await propose(p1)).created,false)
assert.equal((await db.query('select inspection_scheduled_for from bookings where id=$1',[pending1.bookingId])).rows[0].inspection_scheduled_for,null)
await assert.rejects(()=>decide(p1),/still being processed/)
await db.query("update partner_booking_requests set email_status='sent' where id in ($1,$2)",[p1,p2])
await assert.rejects(()=>db.query("update bookings set inspection_scheduled_for=now()+interval '3 days' where id=$1",[pending1.bookingId]),/Review the pending/)
await assert.rejects(()=>db.query("update bookings set inputs=inputs || '{\"notes\":\"changed\"}' where id=$1",[pending1.bookingId]),/Review the pending/)
await assert.rejects(()=>decide(p1,'confirmed',0,'other'),/not found/)
await assert.rejects(()=>decide(p1,'confirmed',9),/Invalid proposed/)
assert.equal((await decide(p1)).created,true)
assert.equal((await decide(p1)).created,false)
await assert.rejects(()=>decide(p1,'confirmed',1),/already reviewed/)
assert.equal((await db.query('select inputs from bookings where id=$1',[pending1.bookingId])).rows[0].inputs.preferredInspectionStartTime,'18:00')
await assert.rejects(()=>decide(p2),/no longer available/)
assert.equal((await db.query('select decision_status from partner_booking_requests where id=$1',[p2])).rows[0].decision_status,'pending','collision rolls back the decision and delivery claim')
await assert.rejects(()=>decide(p2,'declined',null,'a',''),/decline reason/)
assert.equal((await decide(p2,'declined',null)).created,true)
assert.equal((await db.query('select status from bookings where id=$1',[pending2.bookingId])).rows[0].status,'cancelled')
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>decide(p1),/permission denied/);await db.exec('reset role')}
// Reproduce the reported rejection against the original deployed function.
const changedContact={businessName:'Another Business Ltd',contactName:'Different Contact',phone:'0411111111',address:'500 Test Street'}
const conflictingKey=request()
await assert.rejects(()=>propose(conflictingKey,changedContact),/Contact reconciliation required/)
assert.equal((await db.query('select count(*)::int n from partner_booking_requests where id=$1',[conflictingKey])).rows[0].n,0)
const originalClients=await db.query('select * from clients order by id')
const originalCrm=await db.query('select * from crm_fixture order by id')
const originalBookings=await db.query('select * from bookings order by id')
const contactReviewMigration=await readFile(new URL('../supabase/migrations/20261104003304_partner_request_contact_review.sql',import.meta.url),'utf8')
assert.equal((await db.query("select is_nullable from information_schema.columns where table_name='bookings' and column_name='client_id'")).rows[0].is_nullable,'NO','fixture starts with production NOT NULL constraint')
// Reproduce the release-review blocker: the new function alone still fails when
// production's NOT NULL is retained. Roll back every test change afterwards.
await db.exec('BEGIN')
await db.exec(contactReviewMigration)
await db.exec('ALTER TABLE bookings ALTER COLUMN client_id SET NOT NULL')
await assert.rejects(()=>propose(conflictingKey,changedContact),{code:'23502'})
await db.exec('ROLLBACK')
await db.exec(contactReviewMigration)
// The same mailbox may request a different business, but cannot claim its CRM record.
await db.exec('set role service_role')
const held=await propose(conflictingKey,changedContact)
assert.equal(held.created,true);assert.equal(held.contactReviewRequired,true)
assert.equal((await propose(conflictingKey,changedContact)).created,false,'replay cannot create another request or review issue')
await db.exec('reset role')
const heldBooking=(await db.query('select * from bookings where id=$1',[held.bookingId])).rows[0]
assert.equal(heldBooking.client_id,null);assert.equal(heldBooking.opportunity_id,null)
assert.equal(heldBooking.inspection_scheduled_for,null);assert.equal(heldBooking.inspection_status,'pending')
assert.equal(heldBooking.inputs.businessName,changedContact.businessName)
assert.equal(heldBooking.inputs.email,inputs.email)
assert.deepEqual(heldBooking.inputs.requestedInspectionTimes,proposedTimes)
assert.deepEqual((await db.query('select * from clients order by id')).rows,originalClients.rows,'existing contact is never changed')
assert.deepEqual((await db.query('select * from crm_fixture order by id')).rows,originalCrm.rows,'no incorrect CRM link or assignment')
assert.deepEqual((await db.query('select * from bookings where id<>$1 order by id',[held.bookingId])).rows,originalBookings.rows,'existing bookings are untouched')
assert.equal((await db.query('select count(*)::int n from crm_reconciliation_issues where record_id=$1',[held.bookingId])).rows[0].n,1)
assert.equal((await db.query('select contact_review_required from partner_booking_requests where id=$1',[conflictingKey])).rows[0].contact_review_required,true)
assert.equal((await db.query("select (details->>'contactReviewRequired')::boolean flag from admin_audit_log where entity_ref=$1",[held.bookingRef])).rows[0].flag,true)
// The nullable exception is restricted to one real, flagged request. It cannot
// detach ordinary bookings, attach unrelated CRM records or hide staff review.
await assert.rejects(()=>db.query("insert into bookings(booking_ref,inputs,status) values('NO-CLIENT','{}','pending')"),{code:'23514'})
await assert.rejects(()=>db.query('update bookings set client_id=NULL where id=$1',[first.bookingId]),/cannot be detached/)
await assert.rejects(()=>db.query("insert into bookings(booking_ref,inputs,status,partner_request_id) values('WRONG-REQUEST','{}','pending',$1)",[key]),/contact-review appointment request/)
await assert.rejects(()=>db.query("insert into bookings(booking_ref,inputs,status,partner_request_id) values('REUSED-REQUEST','{}','pending',$1)",[conflictingKey]),/contact-review appointment request/)
for(const column of ['quote_id','site_id','opportunity_id']) {
 await assert.rejects(()=>db.query(`update bookings set ${column}=gen_random_uuid() where id=$1`,[held.bookingId]),/contact-review appointment request/)
}
await assert.rejects(()=>db.query('update bookings set partner_request_id=NULL where id=$1',[held.bookingId]),/contact-review appointment request/)
await assert.rejects(()=>db.query('update partner_booking_requests set contact_review_required=false where id=$1',[conflictingKey]),/Resolve the booking client/)
await assert.rejects(()=>db.query("update partner_booking_requests set request_kind='booking' where id=$1",[conflictingKey]),/Resolve the booking client/)
await assert.rejects(()=>db.query('update partner_booking_requests set booking_id=NULL where id=$1',[conflictingKey]),/Resolve the booking client/)
await assert.rejects(()=>db.query('delete from clients where id=$1',[originalClients.rows[0].id]),{code:'23503'})
// Genuine configuration conflicts and normal confirmed-booking guards still apply.
await assert.rejects(()=>call(request(),changedContact),/Contact reconciliation required/)
await db.query("update availability_private_config set content='{}'")
await assert.rejects(()=>propose(request(),changedContact),/Availability changed/)
await db.query('update availability_private_config set content=$1',[config])
// Exact same contact, case/phone normalization and brand-new contacts still auto-link.
const matched=await propose(request(),{email:inputs.email.toUpperCase(),phone:'+61 400 000 000'})
assert.equal(matched.contactReviewRequired,false)
assert.equal((await db.query('select client_id from bookings where id=$1',[matched.bookingId])).rows[0].client_id,originalClients.rows[0].id)
const newContact=await propose(request(),{...changedContact,email:'new-business@example.invalid'})
assert.equal(newContact.contactReviewRequired,false)
assert.ok((await db.query('select opportunity_id from bookings where id=$1',[newContact.bookingId])).rows[0].opportunity_id)
// Duplicate normalized identities are also held, rather than selecting an arbitrary record.
await db.query('insert into clients(business_name,contact_name,email,phone,city) values($1,$2,$3,$4,$5)',[inputs.businessName,inputs.contactName,inputs.email.toUpperCase(),inputs.phone,inputs.city])
const ambiguousKey=request(),ambiguous=await propose(ambiguousKey)
assert.equal(ambiguous.contactReviewRequired,true)
await db.query("update partner_booking_requests set email_status='sent' where id=$1",[ambiguousKey])
assert.equal((await decide(ambiguousKey,'declined',null)).created,true,'an unlinked request can still be declined')
assert.equal((await db.query('select status from bookings where id=$1',[ambiguous.bookingId])).rows[0].status,'cancelled')
// Reviewing a held request still confirms a single chosen time without a wrong CRM link.
await db.query("update partner_booking_requests set email_status='sent' where id=$1",[conflictingKey])
await db.exec('set role service_role')
assert.equal((await decide(conflictingKey,'confirmed',1)).created,true)
assert.equal((await decide(conflictingKey,'confirmed',1)).created,false)
await db.exec('reset role')
assert.equal((await db.query('select client_id from bookings where id=$1',[held.bookingId])).rows[0].client_id,null)
assert.equal((await db.query('select inputs from bookings where id=$1',[held.bookingId])).rows[0].inputs.inspectionBookingSource,'partner','confirmation no longer uses the pending-request source')
await db.query("update bookings set inspection_scheduled_for=inspection_scheduled_for+interval '1 hour' where id=$1",[held.bookingId])
await db.query("update bookings set status='cancelled',inspection_status='cancelled' where id=$1",[held.bookingId])
assert.equal((await db.query('select contact_review_required from partner_booking_requests where id=$1',[conflictingKey])).rows[0].contact_review_required,true,'client review survives appointment approval')
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>propose(request(),changedContact),/permission denied/);await db.exec('reset role')}
assert.equal((await db.query("select not prosecdef as invoker from pg_proc where oid='create_partner_booking(uuid,uuid,uuid,text,jsonb,timestamp with time zone,text)'::regprocedure")).rows[0].invoker,true)
console.log('PASS: original shared-email failure reproduced; forward migration accepts TBA request, preserves clients/CRM/assignments/bookings, flags review, replays once and confirms safely; exact/new contacts still link; private grants retained.')
console.log('PASS: production NOT NULL failure reproduced; guarded exception rejects ordinary NULL bookings, detachment, foreign linkage and clearing review; original client FK preserved; held requests can be confirmed, rescheduled, cancelled or declined.')
console.log('PASS: proposal creation with no reservation, independent simultaneous proposals, pending mutation guard, reviewer ownership, confirmation replay, collision rollback, decline and private function grants.')
console.log('PASS: atomic creation/replay, collision across entry points, cancellation, revoked/expired access, state/calendar restrictions, CRM failure rollback and private grants/RLS.')
await db.close()
