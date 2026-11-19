// Isolated SQL-only fixtures: no provider or production connection.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID as uuid} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db=new PGlite()
const rows=async(q,p=[]) => (await db.query(q,p)).rows
const scalar=async(q,p=[]) => Object.values((await rows(q,p))[0])[0]
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid primary key,username text,display_name text,email text,active boolean,role text);
CREATE TABLE cleaners(id uuid primary key,email text,contact_name text,state text,status text,broadcast_unsubscribe_token text,created_at timestamptz default now());
CREATE TABLE cleaner_broadcast_suppressions(cleaner_id uuid);
CREATE TABLE crm_email_suppressions(email_normalized text,blocks_all boolean);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
CREATE TABLE cleaner_email_batches(id uuid primary key,actor_id uuid,input_hash text,delivery jsonb,created_at timestamptz default now());
CREATE TABLE cleaner_emails(id uuid primary key default gen_random_uuid(),cleaner_id uuid,template_id uuid,template_name text,to_email text,subject text,body text,status text,sent_by text,batch_id uuid,delivery_outcome text,body_html_snapshot text,body_document_snapshot jsonb,final_html_snapshot text,final_text_snapshot text,delivery_headers jsonb,error_message text);
CREATE TABLE contract_products(id uuid primary key,state text,status text,assigned_staff_id uuid);
CREATE TABLE cleaner_broadcast_campaigns(id uuid primary key default gen_random_uuid(),idempotency_key uuid unique,state text,subject_snapshot text,intro_snapshot text,sender_staff_id uuid,created_by_staff_id uuid,sender_name_snapshot text,sender_email_snapshot text,recipient_count int,recipient_mode text,target_cleaner_id uuid,status text default 'queued',runner_token uuid,lease_expires_at timestamptz);
CREATE TABLE cleaner_broadcast_campaign_products(campaign_id uuid,product_id uuid,product_snapshot jsonb);
CREATE TABLE cleaner_broadcast_recipients(id uuid primary key default gen_random_uuid(),campaign_id uuid,cleaner_id uuid,to_email text,cleaner_name_snapshot text,status text default 'queued',failure_code text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`)
await db.exec(await readFile(new URL('../supabase/migrations/20261119040651_cleaner_email_all_statuses.sql',import.meta.url),'utf8'))
const actor=uuid(),product=uuid(),token=uuid()
await db.query("insert into admin_staff_accounts values($1,'owner','Owner','owner@example.test',true,'owner')",[actor])
await db.query("insert into contract_products values($1,'NSW','available',$2)",[product,actor])
await db.exec('set role service_role')
const statuses=['lead','pending_approval','approved','paused','rejected','inactive']
const ids=[]
for(const status of statuses){const id=uuid();ids.push(id);await db.query("insert into cleaners(id,email,contact_name,state,status,broadcast_unsubscribe_token) values($1,$2,$3,'NSW',$3,'token')",[id,`${status}@example.test`,status])}
const campaign=async(selected,key=uuid())=>scalar("select create_cleaner_broadcast_campaign_v3($1,'NSW','Subject','Message',$2,$3,'state',null,$4,$5,$5,'owner',null)",[key,[product],JSON.stringify([{id:product}]),selected,actor])
const key=uuid(),campaignId=await campaign(ids,key)
assert.equal(await campaign(ids,key),campaignId,'idempotent creation')
await db.query("update cleaner_broadcast_campaigns set status='sending',runner_token=$2,lease_expires_at=now()+interval '1 minute' where id=$1",[campaignId,token])
for(const r of await rows('select * from cleaner_broadcast_recipients where campaign_id=$1',[campaignId])) assert.equal(await scalar("select claim_cleaner_broadcast_recipient($1,$2,$3,$4,'owner',null)",[campaignId,r.id,token,actor]),true)
const messages=ids.map((id,i)=>({cleaner_id:id,email:`${statuses[i]}@example.test`,subject:'Subject',body:'Body'}))
const reserve=(id,selected)=>scalar('select reserve_cleaner_email_batch_v2($1,$2,$3,$4,null,null,$5)',[id,actor,'a'.repeat(64),JSON.stringify(selected),JSON.stringify({from:'owner@example.test',replyTo:'owner@example.test'})])
const batch=uuid();assert.equal(await reserve(batch,messages),true);assert.equal(await reserve(batch,messages),false)
for(const r of await rows('select * from cleaner_emails where batch_id=$1',[batch])) assert.equal(await scalar('select claim_cleaner_email_delivery($1,$2)',[r.id,actor]),true)
// Opt-outs arriving after preview still block both independent delivery paths.
const queuedCampaign=await campaign(ids),queuedBatch=uuid();await reserve(queuedBatch,messages)
await db.query("update cleaner_broadcast_campaigns set status='sending',runner_token=$2,lease_expires_at=now()+interval '1 minute' where id=$1",[queuedCampaign,token])
await db.query('insert into cleaner_broadcast_suppressions values($1)',[ids[0]])
await db.query("insert into crm_email_suppressions values('pending_approval@example.test',true)")
for(const id of ids.slice(0,2)){
 const r=(await rows('select * from cleaner_broadcast_recipients where campaign_id=$1 and cleaner_id=$2',[queuedCampaign,id]))[0]
 assert.equal(await scalar("select claim_cleaner_broadcast_recipient($1,$2,$3,$4,'owner',null)",[queuedCampaign,r.id,token,actor]),false)
 const e=(await rows('select id from cleaner_emails where batch_id=$1 and cleaner_id=$2',[queuedBatch,id]))[0]
 assert.equal(await scalar('select claim_cleaner_email_delivery($1,$2)',[e.id,actor]),false)
 await assert.rejects(campaign([id]),/not eligible/)
 await assert.rejects(reserve(uuid(),[messages[ids.indexOf(id)]]),/ineligible/)
}
await db.query("update cleaners set state='VIC' where id=$1",[ids[2]])
await assert.rejects(campaign([ids[2]]),/not eligible/)
for(const role of ['anon','authenticated']) assert.equal(await scalar(`select bool_or(has_function_privilege('${role}',oid,'EXECUTE')) from pg_proc where proname in ('claim_cleaner_email_delivery','reserve_cleaner_email_batch','reserve_cleaner_email_batch_v2','claim_cleaner_broadcast_recipient','create_cleaner_broadcast_campaign_v3')`),false)
await db.close();console.log('PASS: all six statuses reserve/claim, replay prevention, send-time local/global blocks, region checks and ACLs')
