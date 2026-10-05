// No network: real PostgreSQL engine with synthetic customer/agent records.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
 CREATE TYPE quote_status AS ENUM ('pending','sent','accepted','expired','declined','cancelled');
 CREATE TABLE quotes(quote_ref text primary key,inputs jsonb,status quote_status DEFAULT 'pending',valid_until timestamptz default now()+interval '30 days',final_quote_document jsonb,final_quote_document_version integer,firm_quote_workflow jsonb);
 CREATE TABLE quote_send_attempts(id uuid primary key,quote_ref text references quotes on delete cascade,status text,provider_message_id text,document_version integer,provider_accepted_at timestamptz,actor jsonb);
 GRANT ALL ON quotes, quote_send_attempts, admin_audit_log TO service_role;
`)
for (const file of ['sms_workflow_migration.sql','sms_quote_status_enum_repair.sql','migrations/20261005215106_quote_request_sms_permission.sql','migrations/20261005215106_quote_request_sms_permission.sql']) {
  await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))
}
const query = async (sql,params=[]) => (await db.query(sql,params)).rows
const scalar = async (sql,params=[]) => Object.values((await query(sql,params))[0])[0]
assert.equal(await scalar('select delay_minutes from sms_settings'),0)
assert.equal(await scalar("select sms_next_time('2026-10-06T00:00Z','Australia/Sydney')='2026-10-06T00:00Z'"),true)
assert.equal(await scalar("select sms_next_time('2026-10-04T08:07Z','Australia/Sydney')='2026-10-04T22:00Z'"),true)
assert.equal(await scalar("select sms_next_time('2027-04-02T07:05Z','Australia/Sydney')='2027-04-04T23:00Z'"),true)
for (const role of ['anon','authenticated']) {
  for (const table of ['sms_quote_requests','sms_remote_quote_emails']) assert.equal(await scalar(`select has_table_privilege('${role}','${table}','SELECT,INSERT,UPDATE,DELETE')`),false)
  assert.equal(await scalar(`select bool_or(has_function_privilege('${role}',oid,'EXECUTE')) from pg_proc where pronamespace='public'::regnamespace and proname like 'sms_%'`),false)
}
assert.equal(await scalar("select bool_and(relrowsecurity) from pg_class where relname like 'sms_%' and relkind='r'"),true)
await db.exec('set role service_role')
const mobile='61412345678'
async function quote(ref,{phone=mobile,final=false}={}) {
  const inputs={phone,email:'client@example.test',city:'sydney',contactName:'Test Client'}
  await db.query('insert into quotes(quote_ref,inputs,final_quote_document,final_quote_document_version) values($1,$2,$3,$4)',[ref,JSON.stringify(inputs),final?JSON.stringify({inputs}):null,final?1:null])
}
async function request(ref,{source='online_request',allowed=true,phone=mobile,notice='2026-10-06'}={}) {
  return scalar('select sms_record_quote_request($1,$2,$3,$4,$5,$6)',[ref,phone,source,'test-actor',allowed,notice])
}
async function remote(ref,{phone=mobile,recipient='client@example.test',provider='provider-test'}={}) {
  return scalar('select sms_record_remote_quote_email($1,$2,$3,$4)',[ref,phone,recipient,provider])
}
async function finalEmail(ref,provider='final-provider',status='provider_accepted') {
  await db.query('insert into quote_send_attempts values($1,$2,$3,$4,1,now(),$5)',[randomUUID(),ref,status,provider,'{"id":"test-agent"}'])
}
const job = async ref => (await query('select * from sms_jobs where quote_ref=$1 order by created_at desc',[ref]))[0]
const token=randomUUID()
async function dispatch(ref) {
  const j=await job(ref)
  await db.query("update sms_jobs set status='leased',lease_token=$2,lease_until=now()+interval '1 minute',due_at=now() where id=$1",[j.id,token])
  return query("select * from sms_dispatch($1,$2,'fixed quote notification','{}','test-scope')",[j.id,token])
}
await quote('LEGACY');assert.equal(await remote('LEGACY'),false)
assert.equal(await request('LEGACY',{notice:'old'}),false)
assert.equal(await request('LEGACY',{phone:'61499999999'}),false)
assert.equal(await scalar('select count(*)::int from sms_quote_requests'),0)
await quote('OFF');assert.equal(await request('OFF'),true);await remote('OFF');assert.equal(await job('OFF'),undefined)
await db.exec('update sms_settings set auto_enabled=true')
await remote('OFF');assert.equal(await job('OFF'),undefined) // No backfill after enabling.
await quote('ONLINE');assert.equal(await request('ONLINE'),true);assert.equal(await request('ONLINE'),true)
assert.equal(await remote('ONLINE',{provider:''}),false);assert.equal(await remote('ONLINE',{recipient:'other@example.test'}),false)
assert.equal(await job('ONLINE'),undefined)
assert.equal(await remote('ONLINE'),true);await remote('ONLINE',{provider:'resend'})
assert.equal(await scalar("select count(*)::int from sms_jobs where quote_ref='ONLINE'"),1)
assert.equal(await scalar("select count(*)::int from admin_audit_log where entity_ref='ONLINE' and action='sms.quote_request.recorded'"),1)
assert.equal(await scalar('select count(*)::int from sms_preferences'),0) // No global permission.
assert.equal((await job('ONLINE')).document_version,0)
// Isolate actual dispatch from clock; the real quiet-hour/DST function was checked above.
await db.exec('reset role')
await db.exec("create or replace function sms_next_time(t timestamptz,z text) returns timestamptz language sql as 'select t'")
await db.exec('set role service_role')
assert.equal((await dispatch('ONLINE')).length,1)
await db.exec("update sms_jobs set status='delivered',first_attempt_at=now()-interval '2 minutes' where quote_ref='ONLINE'")
// Publishing a final quote supersedes any outstanding estimate; its own notification still sends.
await db.exec("update quotes set final_quote_document=jsonb_build_object('inputs',inputs),final_quote_document_version=1 where quote_ref='ONLINE'")
await finalEmail('ONLINE')
await db.exec("update sms_jobs set first_attempt_at=now() where quote_ref='ONLINE' and purpose='remote_quote_followup'")
assert.equal((await dispatch('ONLINE')).length,0)
assert.equal((await job('ONLINE')).status,'queued')
assert.ok(new Date((await job('ONLINE')).due_at).getTime()>Date.now())
await db.exec("update sms_jobs set first_attempt_at=now()-interval '2 minutes' where quote_ref='ONLINE' and purpose='remote_quote_followup'")
assert.equal((await dispatch('ONLINE')).length,1)
await db.exec("update sms_jobs set status='cancelled' where quote_ref='ONLINE'")
await quote('AGENT',{final:true});assert.equal(await request('AGENT',{source:'agent_request'}),true)
await finalEmail('AGENT',null,'claimed');assert.equal(await job('AGENT'),undefined)
await finalEmail('AGENT');await finalEmail('AGENT');assert.equal(await scalar("select count(*)::int from sms_jobs where quote_ref='AGENT'"),1)
assert.equal((await dispatch('AGENT')).length,1)
await db.exec("update sms_jobs set status='cancelled' where quote_ref='AGENT'")
await quote('EMAIL-ONLY');await request('EMAIL-ONLY',{allowed:false});await remote('EMAIL-ONLY')
assert.equal((await job('EMAIL-ONLY')).reason,'quote_email_only')
await db.exec("update quotes set final_quote_document=jsonb_build_object('inputs',inputs),final_quote_document_version=1 where quote_ref='EMAIL-ONLY'")
await request('EMAIL-ONLY',{source:'agent_request',allowed:true})
assert.equal(await scalar("select allowed from sms_quote_requests where quote_ref='EMAIL-ONLY'"),false)
await finalEmail('EMAIL-ONLY');assert.equal((await dispatch('EMAIL-ONLY')).length,0)
assert.equal((await job('EMAIL-ONLY')).reason,'quote_email_only')
await quote('STOP');await request('STOP');await remote('STOP')
await scalar('select sms_apply_event($1,$2,$3,$4,$5,$6,$7,now())',['stop-event',null,'inbound','{}',mobile,'STOP',true])
assert.equal((await job('STOP')).status,'cancelled')
assert.equal((await dispatch('STOP')).length,0)
await quote('AFTER-STOP',{final:true});await request('AFTER-STOP',{source:'agent_request'});await finalEmail('AFTER-STOP')
assert.equal((await dispatch('AFTER-STOP')).length,0)
assert.equal((await job('AFTER-STOP')).reason,'sms_opted_out')
assert.equal(await scalar('select opted_out from sms_preferences where mobile=$1',[mobile]),true)
await quote('NEW-MOBILE',{phone:'61412345679'});await request('NEW-MOBILE',{phone:'61412345679'});await remote('NEW-MOBILE',{phone:'61412345679'})
await db.exec("update quotes set inputs=jsonb_set(inputs,'{phone}','\"61412345680\"') where quote_ref='NEW-MOBILE'")
assert.equal((await dispatch('NEW-MOBILE')).length,0);assert.equal((await job('NEW-MOBILE')).reason,'mobile_changed')
await quote('NO-REQUEST',{phone:'61412345681',final:true});await finalEmail('NO-REQUEST')
assert.equal((await dispatch('NO-REQUEST')).length,0);assert.equal((await job('NO-REQUEST')).reason,'sms_consent_missing')
await quote('EXPIRED',{phone:'61412345682'});await request('EXPIRED',{phone:'61412345682'});await remote('EXPIRED',{phone:'61412345682'})
await db.exec("update quotes set valid_until=now()-interval '1 minute' where quote_ref='EXPIRED'")
assert.equal((await dispatch('EXPIRED')).length,0);assert.equal((await job('EXPIRED')).reason,'quote_changed_or_removed')
await quote('DELETE',{phone:'61412345683'});await request('DELETE',{phone:'61412345683'});await remote('DELETE',{phone:'61412345683'})
await db.exec("delete from quotes where quote_ref='DELETE'")
assert.equal(await scalar("select status from sms_jobs where entity_ref='DELETE'"),'cancelled')
assert.equal(await scalar("select count(*)::int from sms_quote_requests where quote_ref='DELETE'"),0)
await db.close()
console.log('Quote SMS PostgreSQL checks passed: online and agent requests, provider acceptance, per-stage dedupe, no backfill/global opt-in, email-only, STOP, mobile changes, expiry, deletion, business hours/DST, ACL/RLS and migration replay.')
