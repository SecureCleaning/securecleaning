// Isolated PostgreSQL integration test. PGLITE_MODULE points to an external test-only install.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
 CREATE TABLE quotes(quote_ref text primary key,status text,valid_until timestamptz default now()+interval '30 days',final_quote_document jsonb,final_quote_document_version integer,firm_quote_workflow jsonb);
 CREATE TABLE quote_send_attempts(id uuid primary key,quote_ref text references quotes on delete cascade,status text,provider_message_id text,document_version integer,provider_accepted_at timestamptz,actor jsonb);
`)
const migration=await readFile(new URL('../supabase/sms_workflow_migration.sql',import.meta.url),'utf8')
await db.exec(migration)
await db.exec(migration) // re-apply is safe
const query=async(sql,params=[]) => (await db.query(sql,params)).rows
const scalar=async(sql,params=[])=>Object.values((await query(sql,params))[0])[0]
assert.equal(await scalar('select auto_enabled from sms_settings'),false)
assert.equal(await scalar('select alert_email from sms_settings'),'info@securecleaning.com.au')
assert.equal(await scalar("select sms_next_time('2026-10-02T08:05Z','Australia/Sydney')::text"),'2026-10-04 22:00:00+00')
assert.equal(await scalar("select sms_next_time('2027-04-02T07:05Z','Australia/Sydney')::text"),'2027-04-04 23:00:00+00')
for(const role of ['anon','authenticated']) {
 assert.equal(await scalar(`select has_table_privilege('${role}','sms_jobs','SELECT')`),false)
 assert.equal(await scalar(`select bool_or(has_function_privilege('${role}',oid,'EXECUTE')) from pg_proc where pronamespace='public'::regnamespace and proname like 'sms_%'`),false)
}
assert.equal(await scalar("select bool_and(relrowsecurity) from pg_class where relname like 'sms_%' and relkind='r'"),true)
async function quote(ref,mobile='0412345678'){
 await db.query(`insert into quotes(quote_ref,status,final_quote_document_version,final_quote_document,firm_quote_workflow)values($1,'sent',1,$2,'{"status":"sent"}')`,[ref,JSON.stringify({inputs:{phone:mobile,city:'sydney',contactName:'Alex'}})])
}
async function email(ref,status='provider_accepted',id=randomUUID()){
 await db.query(`insert into quote_send_attempts values($1,$2,$3,$4,1,now(),'{"id":"owner"}')`,[id,ref,status,status==='claimed'?null:'resend-test']);return id
}
await quote('OFF');await email('OFF');assert.equal(await scalar('select count(*)::int from sms_jobs'),0)
await db.exec('update sms_settings set auto_enabled=true')
await quote('A');const attempt=await email('A','claimed');assert.equal(await scalar('select count(*)::int from sms_jobs'),0)
await db.query("update quote_send_attempts set status='provider_accepted',provider_message_id='resend-test',provider_accepted_at=now() where id=$1",[attempt])
await db.query("update quote_send_attempts set status='finalized' where id=$1",[attempt]);await email('A')
assert.equal(await scalar("select count(*)::int from sms_jobs where quote_ref='A'"),1)
await quote('BAD','02 9999 9999');await email('BAD');assert.equal(await scalar("select reason from sms_jobs where quote_ref='BAD'"),'invalid_mobile')
await db.exec("update quotes set status='accepted' where quote_ref='A'")
assert.equal(await scalar("select status from sms_jobs where quote_ref='A'"),'cancelled')
await quote('DELETE','0412345679');await email('DELETE');await db.exec("delete from quotes where quote_ref='DELETE'")
assert.equal(await scalar("select status from sms_jobs where entity_ref='DELETE'"),'cancelled')
assert.equal(await scalar("select quote_ref from sms_jobs where entity_ref='DELETE'"),null)
await quote('REV','0412345680');await email('REV');await db.exec("update quotes set final_quote_document_version=2 where quote_ref='REV'")
assert.equal(await scalar("select status from sms_jobs where quote_ref='REV'"),'cancelled')
await quote('STOP','0412345681');await email('STOP')
const stopKey='inbound:test',stopArgs=[stopKey,null,'inbound','{}','61412345681','STOP',true,new Date().toISOString()]
assert.equal(await scalar('select sms_apply_event($1,$2,$3,$4,$5,$6,$7,$8)',stopArgs),true)
assert.equal(await scalar('select sms_apply_event($1,$2,$3,$4,$5,$6,$7,$8)',stopArgs),false)
assert.equal(await scalar("select status from sms_jobs where quote_ref='STOP'"),'cancelled')
assert.equal(await scalar("select provider_sync_pending from sms_preferences where mobile='61412345681'"),true)
await quote('MANUAL','0412345682');await email('MANUAL')
const manualId=randomUUID(),manual=[manualId,'MANUAL',1,'61412345682','Secure Cleaning test. Reply STOP to opt out.','Australia/Sydney',false,'owner']
assert.equal(await scalar('select sms_enqueue_manual($1,$2,$3,$4,$5,$6,$7,$8)',manual),true)
assert.equal(await scalar('select sms_enqueue_manual($1,$2,$3,$4,$5,$6,$7,$8)',manual),true)
assert.equal(await scalar('select sms_enqueue_manual($1,$2,$3,$4,$5,$6,$7,$8)',[...manual.slice(0,4),'changed',...manual.slice(5)]),false)
assert.equal(await scalar("select status from sms_jobs where quote_ref='MANUAL' and automatic"),'cancelled')
await db.exec("update sms_jobs set status='cancelled' where status='queued'")
await quote('DELIVERY','0412345683');await email('DELIVERY')
const job=(await query("select * from sms_jobs where quote_ref='DELIVERY'"))[0]
// Quiet-hour calculation tested above. Dispatch tests isolate eligibility from wall-clock time.
await db.exec("create or replace function sms_next_time(t timestamptz,z text) returns timestamptz language sql as 'select t'")
await db.exec("update sms_jobs set due_at=now()-interval '1 minute' where quote_ref='DELIVERY'")
const token=randomUUID()
assert.equal((await query('select * from sms_claim($1)',[token])).length,1)
assert.equal((await query('select * from sms_claim($1)',[randomUUID()])).length,0)
assert.equal((await query('select * from sms_dispatch($1,$2,$3,$4,$5)',[job.id,token,'test','{}','scope'])).length,0)
assert.equal(await scalar('select reason from sms_jobs where id=$1',[job.id]),'sms_consent_missing')
await db.query("insert into sms_preferences(mobile,consent,evidence,actor_id)values('61412345683',true,'Test consent','owner')")
await db.query("update sms_jobs set status='queued' where id=$1",[job.id]);await query('select * from sms_claim($1)',[token])
assert.equal((await query('select * from sms_dispatch($1,$2,$3,$4,$5)',[job.id,token,'test','{"messages":[]}','scope'])).length,1)
await db.query("update sms_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);await query('select * from sms_claim($1)',[token])
assert.equal(await scalar('select attempt_count from sms_jobs where id=$1',[job.id]),1)
assert.equal((await query('select * from sms_dispatch($1,$2,$3,$4,$5)',[job.id,token,'test','{"messages":[]}','changed-key'])).length,0)
assert.equal(await scalar('select status from sms_jobs where id=$1',[job.id]),'review')
for(const [part,status] of [[2,'delivered'],[1,'failed'],[1,'delivered']]) {
 await query('select sms_apply_event($1,$2,$3,$4,$5,$6,$7,$8)',[`receipt-${part}-${status}`,job.id,'status',JSON.stringify({status,part_number:part,total_parts:2,message_id:'provider-id'}),'61412345683','',false,new Date().toISOString()])
}
assert.equal(await scalar('select status from sms_jobs where id=$1',[job.id]),'failed')
await query('select sms_record_acceptance($1,$2,$3)',[job.id,'provider-id',2])
assert.equal(await scalar('select status from sms_jobs where id=$1',[job.id]),'failed')
assert.equal(await scalar('select sms_worker_lock($1)',[randomUUID()]),true)
assert.equal(await scalar('select sms_worker_lock($1)',[randomUUID()]),false)

await quote('DISABLE','0412345684');await email('DISABLE')
await db.exec('update sms_settings set auto_enabled=false')
assert.equal(await scalar("select status from sms_jobs where quote_ref='DISABLE'"),'cancelled')
const revision=await scalar('select updated_at from sms_settings')
const values={auto_enabled:false,delay_minutes:10,template:'Secure Cleaning test. Reply STOP to opt out.',alert_email:'new@example.com',low_credit_threshold:50,credit_price_cents:3,max_parts:2}
assert.equal(await scalar('select sms_save_settings($1,$2,$3)',[revision,JSON.stringify(values),'owner']),true)
assert.equal(await scalar('select sms_save_settings($1,$2,$3)',[revision,JSON.stringify(values),'owner']),false)
assert.equal(await scalar("select count(*)::int from admin_audit_log where action='sms.settings.updated'"),1)
assert.equal(await scalar('select sms_save_preference($1,$2,$3,$4,$5)',['61412345681',true,'New permission','owner','STOP']),false)
assert.equal(await scalar('select sms_save_preference($1,$2,$3,$4,$5)',['61412345688',true,'Permission on form','owner','A']),true)
assert.equal(await scalar("select count(*)::int from admin_audit_log where action='sms.permission.updated'"),1)

await db.close()
console.log('SMS PostgreSQL integration checks passed: migration replay, ACL/RLS, queue, dedupe, cancellation, STOP, manual send, claim leases, consent, credential rotation, receipts and worker locking.')
