// Isolated PostgreSQL: no network, customer writes or real message sends.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
 CREATE TABLE quotes(id uuid primary key default gen_random_uuid(),quote_ref text unique,inputs jsonb,status text default 'pending',valid_until timestamptz default now()+interval '30 days',final_quote_document jsonb,final_quote_document_version integer,firm_quote_workflow jsonb);
 CREATE TABLE quote_send_attempts(id uuid primary key,quote_ref text references quotes(quote_ref),status text,provider_message_id text,document_version integer,provider_accepted_at timestamptz,actor jsonb);
 CREATE TABLE bookings(id uuid primary key default gen_random_uuid(),booking_ref text unique,quote_id uuid,inputs jsonb,status text default 'pending');
 CREATE TABLE partner_booking_requests(booking_id uuid,request_kind text,decision_status text);
 CREATE TABLE clients(id uuid primary key default gen_random_uuid(),phone text,email text);
 CREATE TABLE crm_opportunities(id uuid primary key default gen_random_uuid(),primary_contact_id uuid);
 CREATE TABLE contract_products(id uuid primary key default gen_random_uuid(),state text);
 CREATE TABLE contract_product_sales(id uuid primary key default gen_random_uuid(),sale_code text,status text,product_id uuid,opportunity_id uuid,source_quote_id uuid);
 CREATE TABLE contract_sale_inspections(id uuid primary key default gen_random_uuid(),sale_id uuid,status text,starts_at timestamptz,duration_minutes integer,location_snapshot text,client_email_snapshot text);
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`)
for(const file of ['sms_workflow_migration.sql','sms_quote_status_enum_repair.sql','migrations/20261005215106_quote_request_sms_permission.sql','migrations/20261014031331_sms_due_work_gate.sql','migrations/20261116231302_inspection_email_sms.sql']) await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'))
const query=async(sql,args=[]) => (await db.query(sql,args)).rows
const scalar=async(sql,args=[]) => Object.values((await query(sql,args))[0])[0]
assert.equal(await scalar('select count(*)::int from sms_jobs'),0,'migration does not backfill')
for(const role of ['anon','authenticated']){
 assert.equal(await scalar(`select has_table_privilege('${role}','sms_inspection_emails','SELECT,INSERT,UPDATE,DELETE')`),false)
 assert.equal(await scalar(`select bool_or(has_function_privilege('${role}',oid,'EXECUTE')) from pg_proc where pronamespace='public'::regnamespace and proname in ('sms_record_inspection_email','sms_inspection_context','sms_inspection_block_reason','sms_dispatch')`),false)
}
assert.equal(await scalar("select relrowsecurity from pg_class where relname='sms_inspection_emails'"),true)
assert.equal(await scalar("select sms_next_time('2026-11-20T08:00Z','Australia/Sydney')='2026-11-22T22:00Z'"),true)
assert.equal(await scalar("select sms_next_time('2026-11-20T08:00Z','Australia/Brisbane')='2026-11-22T23:00Z'"),true)
await db.exec("create or replace function sms_next_time(t timestamptz,z text) returns timestamptz language sql as 'select t'")
await db.exec('set role service_role')
let count=0
async function booking(ref,extra={}){
 const input={phone:`041234${String(++count).padStart(4,'0')}`,email:'client@example.test',city:'sydney',preferredStartDate:'2099-11-18',preferredInspectionStartTime:'10:00',preferredInspectionEndTime:'10:10',preferredInspectionAssigneeId:'agent',inspectionBookingSource:'partner',...extra}
 await db.query('insert into bookings(booking_ref,inputs) values($1,$2)',[ref,JSON.stringify(input)]);return input
}
async function context(ref,type='booking'){return scalar('select sms_inspection_context($1,$2)',[type,ref])}
async function receipt(ref,{type='booking',kind='confirmation',provider='accepted',snapshot,phone,email}={}){
 const c=await context(ref,type)
 return scalar('select sms_record_inspection_email($1,$2,$3,$4,$5,$6,$7)',[type,ref,kind,phone??c?.mobile,email??c?.recipient,JSON.stringify(snapshot??c?.snapshot),provider])
}
const jobs=ref=>query('select * from sms_jobs where entity_ref=$1 order by created_at',[ref])
async function dispatch(j){
 const token=randomUUID();await db.query("update sms_jobs set status='leased',lease_token=$2,lease_until=now()+interval '1 minute' where id=$1",[j.id,token])
 return query("select * from sms_dispatch($1,$2,$3,'{}','fixture-scope')",[j.id,token,j.template])
}
async function reason(j){return scalar('select reason from sms_jobs where id=$1',[j.id])}
await booking('OFF');assert.equal(await receipt('OFF'),true);assert.equal((await jobs('OFF'))[0].reason,'automation_disabled')
await db.exec('update sms_settings set auto_enabled=true');await receipt('OFF');assert.equal((await jobs('OFF')).length,1);assert.equal((await jobs('OFF'))[0].status,'skipped')
await booking('NORMAL')
assert.equal(await receipt('NORMAL',{provider:''}),false);assert.equal(await receipt('NORMAL',{email:'other@example.test'}),false)
assert.equal(await receipt('NORMAL',{phone:'0412999999'}),false);assert.equal(await receipt('NORMAL',{snapshot:{wrong:true}}),false)
assert.equal((await jobs('NORMAL')).length,0)
assert.equal(await receipt('NORMAL'),true);await receipt('NORMAL',{provider:'resend'});assert.equal((await jobs('NORMAL')).length,1)
assert.equal(await scalar('select count(*)::int from sms_preferences'),0,'no global marketing permission created')
assert.equal((await dispatch((await jobs('NORMAL'))[0])).length,1)
assert.match((await jobs('NORMAL'))[0].template,/calendar invitation/)
for(const [ref,change,expected] of [
 ['CANCEL',"status='cancelled'",'inspection_changed_or_removed'],
 ['MOBILE',"inputs=jsonb_set(inputs,'{phone}','\"0412999999\"')",'inspection_contact_changed'],
 ['EMAIL',"inputs=jsonb_set(inputs,'{email}','\"changed@example.test\"')",'inspection_contact_changed'],
 ['RESCHEDULE',"inputs=jsonb_set(inputs,'{preferredInspectionStartTime}','\"11:00\"')",'inspection_changed_or_removed'],
 ['PASSED',"inputs=jsonb_set(inputs,'{preferredStartDate}','\"2000-01-01\"')",'inspection_changed_or_removed'],
 ]){await booking(ref);await receipt(ref);const j=(await jobs(ref))[0];await db.exec(`update bookings set ${change} where booking_ref='${ref}'`);assert.equal((await dispatch(j)).length,0);assert.equal(await reason(j),expected)}
await booking('OLD',{preferredStartDate:'2000-01-01'});await receipt('OLD');assert.equal((await jobs('OLD'))[0].reason,'inspection_passed')
await booking('LANDLINE',{phone:'0299999999'});await receipt('LANDLINE',{phone:'0299999999'});assert.equal((await jobs('LANDLINE'))[0].reason,'invalid_mobile')
assert.equal(await scalar("select count(*)::int from sms_alerts where code='invalid_mobile'"),1)
await booking('QLD',{city:'brisbane'});await receipt('QLD');assert.equal((await jobs('QLD'))[0].time_zone,'Australia/Brisbane')
await booking('NULL-PROPOSALS',{requestedInspectionTimes:null});assert.deepEqual((await context('NULL-PROPOSALS')).snapshot.proposals,[])
await booking('STOP');await receipt('STOP');const stopped=(await jobs('STOP'))[0]
await scalar("select sms_apply_event($1,null,'inbound','{}',$2,'STOP',true,now())",[randomUUID(),stopped.mobile]);assert.equal((await jobs('STOP'))[0].status,'cancelled')
assert.equal((await dispatch(stopped)).length,0);assert.equal(await reason(stopped),'cancelled')
await booking('STOP-BEFORE',{phone:stopped.mobile});await receipt('STOP-BEFORE');assert.equal((await jobs('STOP-BEFORE'))[0].reason,'sms_opted_out')
await booking('PENDING',{preferredStartDate:'',preferredInspectionStartTime:'',preferredInspectionEndTime:'',inspectionBookingSource:'partner_request',requestedInspectionTimes:[{date:'2099-11-18',startTime:'10:00'}]})
await receipt('PENDING',{kind:'request'});const pending=(await jobs('PENDING'))[0];assert.match(pending.template,/not confirmed/)
await db.exec("insert into partner_booking_requests select id,'request','declined' from bookings where booking_ref='PENDING'")
assert.equal((await dispatch(pending)).length,0);assert.equal(await reason(pending),'inspection_changed_or_removed')
// Pending and confirmed stages each get one notice; quote sends do not delay inspections by a day.
await booking('STAGES',{preferredStartDate:'',inspectionBookingSource:'partner_request'});await receipt('STAGES',{kind:'request'})
const stage=(await jobs('STAGES'))[0];await db.query("update sms_jobs set status='delivered',first_attempt_at=now()-interval '2 minutes' where id=$1",[stage.id])
await db.exec("update bookings set inputs=inputs||'{\"preferredStartDate\":\"2099-11-18\",\"inspectionBookingSource\":\"partner\"}'::jsonb where booking_ref='STAGES'")
await receipt('STAGES');const next=(await jobs('STAGES')).find(j=>j.purpose==='inspection_confirmation');assert.equal((await dispatch(next)).length,1)
await booking('EMAILONLY');const em=(await context('EMAILONLY')).mobile
const qid=randomUUID();await db.query("insert into quotes(id,quote_ref,inputs) values($1,'SC-EMAILONLY',$2)",[qid,JSON.stringify({phone:em,email:'client@example.test'})]);await db.query("update bookings set quote_id=$1 where booking_ref='EMAILONLY'",[qid])
await db.query("insert into sms_quote_requests values('SC-EMAILONLY',$1,'online_request',false,'fixture','2026-10-06',now())",[em]);await receipt('EMAILONLY');assert.equal((await jobs('EMAILONLY'))[0].reason,'quote_email_only')
// Purchasing-cleaner inspection uses the CLIENT mobile, independent of accepted quote state.
const client=randomUUID(),opp=randomUUID(),product=randomUUID(),sale=randomUUID(),inspection=randomUUID()
await db.query("insert into clients values($1,'0412999988','client@example.test')",[client]);await db.query('insert into crm_opportunities values($1,$2)',[opp,client]);await db.query("insert into contract_products values($1,'VIC')",[product]);await db.query("insert into contract_product_sales values($1,'PS-TEST','inspection_scheduled',$2,$3,null)",[sale,product,opp]);await db.query("insert into contract_sale_inspections values($1,$2,'scheduled','2099-11-18T00:00Z',60,'Fixture site','client@example.test')",[inspection,sale])
assert.equal(await receipt(inspection,{type:'sale_inspection'}),true);await receipt(inspection,{type:'sale_inspection',provider:'resend'});assert.equal((await jobs(inspection)).length,1)
const purchase=(await jobs(inspection))[0];assert.equal(purchase.mobile,'61412999988');assert.equal(purchase.time_zone,'Australia/Melbourne');assert.match(purchase.template,/purchasing cleaner/);assert.equal((await dispatch(purchase)).length,1)
await db.query("update contract_product_sales set status='cancelled' where id=$1",[sale]);assert.equal((await dispatch(purchase)).length,0);assert.equal(await reason(purchase),'inspection_changed_or_removed')
assert.equal(await scalar("select count(*)::int from sms_preferences where consent"),0)
// The new receipt path does not weaken the existing quote checks or daily limit.
async function quote(ref,mobile,allowed=true){
 await db.query('insert into quotes(quote_ref,inputs) values($1,$2)',[ref,JSON.stringify({phone:mobile,email:'client@example.test',city:'sydney'})])
 assert.equal(await scalar("select sms_record_quote_request($1,$2,'online_request','fixture',$3,'2026-10-06')",[ref,mobile,allowed]),true)
 assert.equal(await scalar("select sms_record_remote_quote_email($1,$2,'client@example.test','accepted')",[ref,mobile]),true)
 return (await jobs(ref))[0]
}
const originalQuote=await quote('SC-REGRESSION','61412000101')
assert.equal((await dispatch(originalQuote)).length,1)
await db.query("update sms_jobs set status='delivered',first_attempt_at=now()-interval '2 minutes' where id=$1",[originalQuote.id])
const otherQuote=await quote('SC-OTHER','61412000101')
assert.equal((await dispatch(otherQuote)).length,0)
assert.equal(await scalar("select status='queued' and due_at>now()+interval '23 hours' from sms_jobs where id=$1",[otherQuote.id]),true)
await booking('AFTER-QUOTE',{phone:'0412000101'});await receipt('AFTER-QUOTE');assert.equal((await dispatch((await jobs('AFTER-QUOTE'))[0])).length,1)
const emailOnlyQuote=await quote('SC-NO-SMS','61412000102',false)
assert.equal((await dispatch(emailOnlyQuote)).length,0);assert.equal(await reason(emailOnlyQuote),'quote_email_only')
const noReceiptQuote=await quote('SC-NO-RECEIPT','61412000103')
await db.query('delete from sms_remote_quote_emails where quote_ref=$1',[noReceiptQuote.quote_ref])
assert.equal((await dispatch(noReceiptQuote)).length,0);assert.equal(await reason(noReceiptQuote),'email_not_confirmed')
const acceptedQuote=await quote('SC-ACCEPTED','61412000104')
await db.query("update quotes set status='accepted' where quote_ref=$1",[acceptedQuote.quote_ref])
assert.equal((await dispatch(acceptedQuote)).length,0);assert.equal(await reason(acceptedQuote),'quote_changed_or_removed')
// A queued notice still needs its immutable email receipt, and uncertain sends never replay blindly.
await booking('MISSING-RECEIPT');await receipt('MISSING-RECEIPT');const missingReceipt=(await jobs('MISSING-RECEIPT'))[0]
await db.query('update sms_jobs set inspection_email_id=null where id=$1',[missingReceipt.id])
assert.equal((await dispatch(missingReceipt)).length,0);assert.equal(await reason(missingReceipt),'sms_consent_missing')
await booking('UNCERTAIN');await receipt('UNCERTAIN');const uncertain=(await jobs('UNCERTAIN'))[0]
await db.query("update sms_jobs set first_attempt_at=now()-interval '24 hours',provider_scope='fixture-scope' where id=$1",[uncertain.id])
assert.equal((await dispatch(uncertain)).length,0);assert.equal(await reason(uncertain),'unknown_requires_reconciliation')
assert.equal((await jobs('UNCERTAIN'))[0].status,'review')
await booking('FROZEN');await receipt('FROZEN');const frozen=(await jobs('FROZEN'))[0]
await db.query("update sms_jobs set first_attempt_at=now(),provider_scope='fixture-scope',request_payload='{\"fixed\":true}' where id=$1",[frozen.id])
await assert.rejects(dispatch(frozen),/SMS payload changed/)
await db.close();console.log('PASS: inspection SMS receipt matching, deduplication, stages, opt-out/email-only, stale appointments, client routing, QLD timezones, permissions and no backfill')
