// Real PostgreSQL with synthetic fixtures; HTTP/Vault stubs cannot contact providers.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const query = async (sql, args=[]) => (await db.query(sql,args)).rows
const scalar = async (sql,args=[]) => Object.values((await query(sql,args))[0])[0]
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
 CREATE TYPE quote_status AS ENUM ('pending','sent','accepted','expired','declined','cancelled');
 CREATE TABLE quotes(quote_ref text primary key,inputs jsonb,status quote_status DEFAULT 'pending',valid_until timestamptz default now()+interval '30 days',final_quote_document jsonb,final_quote_document_version integer,firm_quote_workflow jsonb);
 CREATE TABLE quote_send_attempts(id uuid primary key,quote_ref text references quotes on delete cascade,status text,provider_message_id text,document_version integer,provider_accepted_at timestamptz,actor jsonb);
 CREATE SCHEMA vault; CREATE SCHEMA net;
 CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 INSERT INTO vault.decrypted_secrets VALUES('sms_worker_url','https://securecleaning.com.au/api/sms/worker'),('sms_worker_secret',repeat('x',32));
 CREATE TABLE wakeups(id bigserial,created_at timestamptz default now());
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$
 DECLARE result bigint; BEGIN INSERT INTO public.wakeups DEFAULT VALUES RETURNING id INTO result; RETURN result; END $$;
`)
for(const file of ['sms_workflow_migration.sql','sms_quote_status_enum_repair.sql','migrations/20261005215106_quote_request_sms_permission.sql','migrations/20261008090000_sms_worker_stale_threshold.sql']) await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))
// Existing scheduled messages must keep their exact due time, even if under five minutes.
await db.exec(`INSERT INTO sms_jobs(purpose,entity_type,entity_ref,mobile,time_zone,due_at,actor_id)
 VALUES('test','test','existing','61412345678','Australia/Sydney',now()+interval '2 minutes','test');`)
const existing = await query('select id,due_at,expires_at from sms_jobs')
const migration=await readFile(new URL('../supabase/migrations/20261014031331_sms_due_work_gate.sql',import.meta.url),'utf8')
await db.exec(migration);await db.exec(migration)
assert.deepEqual(await query('select id,due_at,expires_at from sms_jobs'),existing)
assert.equal(await scalar('select delay_minutes from sms_settings'),5)
await assert.rejects(db.exec('update sms_settings set delay_minutes=0'),/check constraint/)
for(const role of ['anon','authenticated']) assert.equal(await scalar(`select has_function_privilege('${role}','sms_tick()','EXECUTE')`),false)
assert.equal(await scalar("select has_function_privilege('service_role','sms_tick()','EXECUTE')"),true)
// Count settings writes independently of HTTP wakeups.
await db.exec(`CREATE TABLE setting_writes(id int); CREATE FUNCTION count_settings_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.setting_writes VALUES(1); RETURN NEW; END $$;
 CREATE TRIGGER count_settings_write AFTER UPDATE ON sms_settings FOR EACH ROW EXECUTE FUNCTION count_settings_write();`)
async function reset() {
 await db.exec(`delete from sms_jobs; delete from sms_preferences; delete from sms_alerts; delete from wakeups;
 update sms_settings set worker_at=now(),inbound_checked_at=now(),worker_lease_until=null;
 delete from setting_writes;`)
}
async function tick(expected) {await db.exec('select sms_tick()');assert.equal(await scalar('select count(*)::int from wakeups'),expected)}
async function job(status='queued',time="now()-interval '1 minute'",extra='') {
 return scalar(`INSERT INTO sms_jobs(purpose,entity_type,entity_ref,mobile,time_zone,due_at,actor_id,status ${extra?', '+extra.split('=')[0]:''})
 VALUES('test','test','test','61412345678','Australia/Sydney',${time},'test',$1 ${extra?', '+extra.slice(extra.indexOf('=')+1):''}) RETURNING id`,[status])
}
await reset()
// Idle path must not even require Vault; no HTTP, settings writes or false stale alert.
await db.exec('alter table vault.decrypted_secrets rename to unavailable_secrets')
await tick(0)
await db.exec("update sms_settings set worker_at=now()-interval '14 minutes';delete from setting_writes")
await tick(0)
assert.equal(await scalar('select count(*)::int from setting_writes'),0)
assert.equal(await scalar('select count(*)::int from sms_alerts'),0)
await db.exec('alter table vault.unavailable_secrets rename to decrypted_secrets')
await job('queued',"now()+interval '5 minutes'");await tick(0)
await db.exec("update sms_jobs set due_at=now()");await tick(1)
// Simulate a lost HTTP wakeup: no heartbeat/lease was acquired, next tick retries.
await tick(2)
await db.exec("update sms_settings set worker_lease_until=now()+interval '90 seconds'");await tick(2)
await db.exec("update sms_settings set worker_lease_until=now()-interval '1 second'");await tick(3)
await reset();await job('unknown');await tick(1)
await reset();const leased=await job('submitting',"now()-interval '1 minute'","lease_until=now()-interval '1 second'")
await db.exec('update sms_jobs set first_attempt_at=now()');await tick(1)
const claims=await Promise.all([query('select * from sms_claim($1)',[randomUUID()]),query('select * from sms_claim($1)',[randomUUID()])])
assert.equal(claims.flat().length,1);assert.equal(claims.flat()[0].id,leased)
assert.ok(claims.flat()[0].first_attempt_at) // Recovery retains uncertainty and immutable job identity.
await reset();await job('submitted', 'now()', "reconcile_at=now()-interval '59 minutes'");await tick(0)
await db.exec("update sms_jobs set reconcile_at=now()-interval '61 minutes'");await tick(1)
await reset();await job('submitted');await tick(1)
await reset();await db.exec("insert into sms_preferences(mobile,evidence,actor_id,provider_sync_pending)values('61412345678','test','test',true)");await tick(1)
await reset();await db.exec("insert into sms_alerts(dedupe_key,code)values('test','test')");await tick(1)
await reset();await db.exec("update sms_settings set worker_at=now()-interval '16 minutes'");await tick(1)
assert.equal(await scalar('select count(*)::int from sms_alerts'),0)
await reset();await db.exec("update sms_settings set worker_at=now()-interval '26 minutes'");await tick(1)
assert.equal(await scalar("select count(*)::int from sms_alerts where code='sms_worker_stale'"),1)
await tick(2);assert.equal(await scalar('select count(*)::int from sms_alerts'),1)
await reset();await job('queued',"now()-interval '11 minutes'")
await db.exec("update sms_settings set worker_at=now()-interval '11 minutes'");await tick(1)
assert.equal(await scalar('select count(*)::int from sms_alerts'),1)
await reset();await job('queued',"now()-interval '9 minutes'")
await db.exec("update sms_settings set worker_at=now()-interval '11 minutes'");await tick(1)
assert.equal(await scalar('select count(*)::int from sms_alerts'),0)
// Terminal jobs do not wake dispatch. STOP sync remains work even after cancellation.
for(const status of ['cancelled','skipped','failed','delivered','review']) {await reset();await job(status);await tick(0)}
await reset();await job();await query('select sms_apply_event($1,null,\'inbound\',\'{}\',$2,\'STOP\',true,now())',['stop','61412345678'])
assert.equal(await scalar('select status from sms_jobs'),'cancelled');await tick(1)
await db.exec('update sms_preferences set provider_sync_pending=false;delete from wakeups');await tick(0)
// Real quiet-hour/DST calculations retain the five-minute offset across boundaries.
assert.equal(await scalar("select sms_next_time('2026-10-06T00:00Z'::timestamptz+interval '5 minutes','Australia/Sydney')='2026-10-06T00:05Z'"),true)
assert.equal(await scalar("select sms_next_time('2026-10-02T07:58Z'::timestamptz+interval '5 minutes','Australia/Sydney')='2026-10-04T22:00Z'"),true)
assert.equal(await scalar("select sms_next_time('2027-04-02T06:58Z'::timestamptz+interval '5 minutes','Australia/Sydney')='2027-04-04T23:00Z'"),true)
// Isolate enqueue timing from business hours (checked above).
await reset()
await db.exec("create or replace function sms_next_time(t timestamptz,z text) returns timestamptz language sql as 'select t';update sms_settings set auto_enabled=true")
await db.exec(`insert into quotes(quote_ref,inputs,final_quote_document,final_quote_document_version)values('DELAY','{"phone":"0412345678","email":"client@example.test","city":"sydney"}','{"inputs":{"phone":"0412345678","city":"sydney"}}',1)`)
await query('select sms_record_quote_request($1,$2,$3,$4,true,$5)',['DELAY','61412345678','online_request','test','2026-10-06'])
await db.exec('begin')
await query('select sms_record_remote_quote_email($1,$2,$3,$4)',['DELAY','61412345678','client@example.test','provider-online'])
assert.equal(await scalar("select due_at=now()+interval '5 minutes' from sms_jobs where purpose='remote_quote_followup'"),true)
await query("insert into quote_send_attempts values($1,'DELAY','provider_accepted','provider-final',1,now(),'{\"id\":\"test\"}')",[randomUUID()])
assert.equal(await scalar("select due_at=now()+interval '5 minutes' from sms_jobs where purpose='quote_followup'"),true)
await tick(0)
await db.exec('commit')
await query("insert into quote_send_attempts values($1,'DELAY','provider_accepted','provider-resend',1,now(),'{\"id\":\"test\"}')",[randomUUID()])
assert.equal(await scalar("select count(*)::int from sms_jobs where purpose='quote_followup'"),1)
await db.close()
console.log('SMS due-work PostgreSQL checks passed: idle/no writes, delayed eligibility, maintenance, stale thresholds, lost wakeups, leases, competing claims, STOP, terminal states, reconciliation, DST, dedupe, ACLs and migration replay.')
