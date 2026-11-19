// Real PostgreSQL engine, synthetic records only. The HTTP and scheduler functions are stubs.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db=new PGlite()
const query=async(sql,args=[]) => (await db.query(sql,args)).rows
const scalar=async(sql,args=[]) => Object.values((await query(sql,args))[0])[0]
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid primary key,active boolean,role text);
CREATE TABLE cleaner_broadcast_campaigns(id uuid primary key,created_by_staff_id uuid,delivery_snapshot jsonb,status text);
CREATE TABLE cleaner_email_batches(id uuid primary key,actor_id uuid,delivery jsonb);
CREATE TABLE cleaner_emails(id uuid primary key,batch_id uuid,delivery_outcome text);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
CREATE SCHEMA cron; CREATE SCHEMA vault; CREATE SCHEMA net;
CREATE TABLE cron.job(jobname text,schedule text,command text,active boolean default true);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3); SELECT 1::bigint $$;
CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
CREATE TABLE wakeups(id bigserial,url text,headers jsonb,body jsonb);
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE result bigint; BEGIN INSERT INTO public.wakeups(url,headers,body) VALUES($1,$2,$3) RETURNING id INTO result; RETURN result; END $$;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
`)
const actor=randomUUID(),other=randomUUID(),old=randomUUID(),current=randomUUID(),batch=randomUUID()
await db.query("INSERT INTO admin_staff_accounts VALUES($1,true,'owner'),($2,true,'manager')",[actor,other])
for(const id of [old,current]) await db.query("INSERT INTO cleaner_broadcast_campaigns VALUES($1,$2,'{}','sending')",[id,actor])
await db.query("INSERT INTO cleaner_email_batches VALUES($1,$2,'{}')",[batch,actor])
for(const outcome of ['sent','unknown','sending','queued']) await db.query('INSERT INTO cleaner_emails VALUES($1,$2,$3)',[randomUUID(),batch,outcome])
const original=await query('select * from cleaner_emails order by id')
await db.exec(await readFile(new URL('../supabase/migrations/20261119033522_background_cleaner_email_delivery.sql',import.meta.url),'utf8'))
assert.equal(await scalar('select count(*) from background_email_jobs'),0)
await db.exec('select background_email_tick()');assert.equal(await scalar('select count(*) from wakeups'),0)
assert.deepEqual(await query('select * from cleaner_emails order by id'),original)
const enqueue=(kind,id,who=actor,resume=false)=>db.query('select enqueue_background_email($1,$2,$3,$4)',[kind,id,who,resume])
await assert.rejects(enqueue('broadcast',current,other),/unavailable/)
await assert.rejects(enqueue('broadcast',current),/configuration missing/)
await db.exec("INSERT INTO vault.decrypted_secrets VALUES('bulk_email_worker_url','https://securecleaning.com.au/api/email/worker'),('bulk_email_worker_secret',repeat('x',32))")
assert.equal(await scalar('select background_email_worker_ready()'),true)
await enqueue('broadcast',current);await enqueue('broadcast',current)
assert.equal(await scalar('select count(*) from background_email_jobs'),1)
assert.equal(await scalar('select count(*) from background_email_jobs where target_id=$1',[old]),0)
await db.exec('select background_email_tick();select background_email_tick()')
assert.equal(await scalar('select count(*) from wakeups'),2) // Lost HTTP wakeups retried, not lost jobs.
const token=randomUUID()
assert.equal((await query('select * from claim_background_email_job($1)',[token])).length,1)
assert.equal((await query('select * from claim_background_email_job($1)',[randomUUID()])).length,0)
await db.exec('select background_email_tick()');assert.equal(await scalar('select count(*) from wakeups'),2)
const finish=(t,status,code=null)=>scalar("select finish_background_email_job('broadcast',$1,$2,$3,$4)",[current,t,status,code])
assert.equal(await finish(randomUUID(),'completed'),false)
// A dead worker lease can be recovered without altering any recipient's state.
await db.exec("update background_email_jobs set lease_until=now()-interval '1 second'")
const successor=randomUUID()
assert.equal((await query('select * from claim_background_email_job($1)',[successor])).length,1)
assert.equal(await finish(token,'completed'),false)
assert.equal(await finish(successor,'paused','provider_quota'),true)
await enqueue('broadcast',current);assert.equal(await scalar('select status from background_email_jobs'),'paused')
assert.equal((await query('select * from claim_background_email_job($1)',[randomUUID()])).length,0)
await enqueue('broadcast',current,actor,true)
assert.equal(await scalar('select status from background_email_jobs'),'queued')
assert.equal((await query('select * from claim_background_email_job($1)',[token])).length,1)
assert.equal(await finish(token,'completed'),true)
await enqueue('broadcast',current,actor,true)
assert.equal(await scalar('select status from background_email_jobs'),'completed')
await enqueue('cleaner_batch',batch)
assert.deepEqual(await query('select * from cleaner_emails order by id'),original)
for(const role of ['anon','authenticated']) {
  for(const fn of ['enqueue_background_email(text,uuid,uuid,boolean)','claim_background_email_job(uuid)','finish_background_email_job(text,uuid,uuid,text,text)','background_email_tick()','background_email_worker_ready()'])
    assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[role,fn]),false)
  assert.equal(await scalar('select has_table_privilege($1,\'background_email_jobs\',\'SELECT\')',[role]),false)
}
await db.exec("update admin_staff_accounts set active=false where role='owner'")
await assert.rejects(enqueue('cleaner_batch',batch),/Unauthorized/)
await db.close()
console.log('PASS: explicit enrollment, no historical backfill, readiness, duplicate/replay, lease concurrency/recovery, quota hold, no recipient resets, restricted access.')
