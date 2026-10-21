// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const { PGlite } = await import(process.env.PGLITE_MODULE)
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table admin_staff_accounts(id uuid primary key,active boolean,role text,display_name text,email text);
create table cleaners(id uuid primary key,status text,state text,email text,contact_name text,broadcast_unsubscribe_token uuid default gen_random_uuid(),created_at timestamptz default now());
create table cleaner_broadcast_suppressions(cleaner_id uuid);
create table crm_email_suppressions(email_normalized text,blocks_all boolean);
create table contract_products(id uuid primary key,status text,state text,assigned_staff_id uuid);
create table cleaner_broadcast_campaigns(id uuid primary key default gen_random_uuid(),idempotency_key uuid unique,state text,subject_snapshot text,intro_snapshot text,sender_staff_id uuid,created_by_staff_id uuid,sender_name_snapshot text,sender_email_snapshot text,recipient_count int,recipient_mode text,target_cleaner_id uuid,status text default 'sending',runner_token uuid,lease_expires_at timestamptz);
create table cleaner_broadcast_campaign_products(campaign_id uuid,product_id uuid,product_snapshot jsonb);
create table cleaner_broadcast_recipients(id uuid primary key default gen_random_uuid(),campaign_id uuid,cleaner_id uuid,to_email text,cleaner_name_snapshot text,status text default 'queued',failure_code text);
`)
const migration=readFileSync(new URL('../../supabase/migrations/20261021053555_broadcast_include_leads_pending.sql',import.meta.url),'utf8')
await db.exec(migration)
await db.exec(migration) // Replaying preserves definitions and ACLs.
const actor=randomUUID(),product=randomUUID()
await db.query('insert into admin_staff_accounts values($1,true,\'agent\',\'Agent\',\'agent@example.com\')',[actor])
await db.query('insert into contract_products values($1,\'available\',\'NSW\',$2)',[product,actor])
async function cleaner(status='lead',state='NSW',email=`${randomUUID()}@example.com`) {
 const id=randomUUID();await db.query('insert into cleaners(id,status,state,email,contact_name) values($1,$2,$3,$4,\'Cleaner\')',[id,status,state,email]);return id
}
async function create(ids,mode='single',key=randomUUID(),actorState='NSW') {
 const result=await db.query('select create_cleaner_broadcast_campaign_v3($1,\'NSW\',\'Jobs\',\'Hello\',$2::uuid[],$3::jsonb,$4,$5,$6::uuid[],$7,$7,\'agent\',$8) id',[key,[product],JSON.stringify([{id:product}]),mode,mode==='single'?ids[0]:null,ids,actor,actorState]);return result.rows[0].id
}
async function claim(campaign,id) {
 const token=randomUUID();await db.query("update cleaner_broadcast_campaigns set runner_token=$2,lease_expires_at=now()+interval '5 minutes' where id=$1",[campaign,token]);
 const row=(await db.query('select id from cleaner_broadcast_recipients where campaign_id=$1 and cleaner_id=$2',[campaign,id])).rows[0];
 return (await db.query("select claim_cleaner_broadcast_recipient($1,$2,$3,$4,'agent','NSW') ok",[campaign,row.id,token,actor])).rows[0].ok
}
for(const status of ['lead','pending_approval','approved']) {
 const id=await cleaner(status),key=randomUUID(),campaign=await create([id],'single',key)
 assert.equal(await create([id],'single',key),campaign)
 assert.equal(await claim(campaign,id),true)
 assert.equal(await claim(campaign,id),false)
}
for(const status of ['paused','rejected','inactive']) await assert.rejects(create([await cleaner(status)]),/not eligible/)
await assert.rejects(create([await cleaner('lead','VIC')]),/not eligible/)
await assert.rejects(create([await cleaner('lead','NSW','invalid')]),/not eligible/)
await assert.rejects(create([await cleaner()],'single',randomUUID(),'VIC'),/outside agent region/)
for(const mode of ['state','multiple']) {
 const ids=[await cleaner('lead'),await cleaner('pending_approval')];const campaign=await create(ids,mode)
 for(const id of ids) assert.equal(await claim(campaign,id),true)
}
const blocked=await cleaner();await db.query('insert into cleaner_broadcast_suppressions values($1)',[blocked]);await assert.rejects(create([blocked]),/not eligible/)
const global=await cleaner('lead','NSW','blocked@example.com');await db.exec("insert into crm_email_suppressions values('blocked@example.com',true)");await assert.rejects(create([global]),/not eligible/)
const duplicate=[await cleaner('lead','NSW','shared@example.com'),await cleaner('approved','NSW','shared@example.com')];await assert.rejects(create(duplicate,'multiple'),/not eligible/)
for(const change of ['status','suppression']) {
 const id=await cleaner(),campaign=await create([id]);
 if(change==='status') await db.query("update cleaners set status='paused' where id=$1",[id]); else await db.query('insert into cleaner_broadcast_suppressions values($1)',[id]);
 assert.equal(await claim(campaign,id),false)
}
for(const name of ['claim_cleaner_broadcast_recipient','create_cleaner_broadcast_campaign_v3']) {
 const acl=(await db.query("select has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where proname=$1",[name])).rows[0]
 assert.deepEqual(acl,{anon:false,authenticated:false,service:true})
}
await db.close()
console.log('Broadcast eligibility SQL fixtures passed: statuses, modes, retries, suppression, state, duplicates, claim-time changes and ACLs.')
