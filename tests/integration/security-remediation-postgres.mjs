import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role;
create type city_type as enum ('sydney','melbourne'); create type premises_type as enum ('office');
create type quote_status as enum ('draft','sent','accepted'); create type booking_status as enum ('pending');
create table admin_staff_accounts(id uuid primary key default gen_random_uuid(),username text,password_hash text,legacy_password_hash text,role text,active boolean,availability_assignee_id text);
create table site_content(key text primary key,title text,content text,group_name text,updated_at timestamptz);
alter table site_content enable row level security;
create policy public_read on site_content for select to anon,authenticated using(true);
grant select on site_content to anon,authenticated;
create table clients(id uuid primary key default gen_random_uuid());
create table quotes(id uuid primary key default gen_random_uuid(),quote_ref text unique,client_id uuid references clients(id),inputs jsonb,status quote_status,final_quote_document_version integer,final_quote_sent_at timestamptz);
create table sites(id uuid primary key default gen_random_uuid(),client_id uuid references clients(id),site_name text,address text,suburb text,postcode text,city city_type,premises_type premises_type,floor_area integer,access_notes text,is_active boolean,created_at timestamptz default now());
create table bookings(id uuid primary key default gen_random_uuid(),booking_ref text unique not null,quote_id uuid references quotes(id),client_id uuid references clients(id),site_id uuid references sites(id),assigned_operator_id uuid,inputs jsonb,status booking_status,inspection_status text,inspection_scheduled_for timestamptz,first_clean_date date,recurring_schedule jsonb,created_at timestamptz default now());
grant usage on schema public to anon,authenticated,service_role;
grant all on all tables in schema public to service_role;
insert into site_content values('availability.config','private','synthetic-only','availability',now()),('home.hero_title','public','Hello','home',now()),('internal.other','private','Private','ops',now());
`)
const sql = readFileSync(process.argv[2], 'utf8')
await db.exec(sql); await db.exec(sql)
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`)
  assert.deepEqual((await db.query('select key from site_content')).rows.map(r=>r.key), ['home.hero_title'])
  for (const table of ['availability_private_config','quote_capabilities','public_rate_buckets','booking_security_outbox']) {
    await assert.rejects(db.query(`select * from ${table}`), /permission denied/)
  }
  await assert.rejects(db.query(`select consume_public_rate_limit('x',$1,2,1000)`,['a'.repeat(24)]), /permission denied/)
  await assert.rejects(db.query(`select create_authorized_quote_booking('bad','bad','{}')`), /permission denied/)
  await db.exec('reset role')
}
assert.equal((await db.query(`select count(*)::int n from availability_private_config`)).rows[0].n,1)
assert.equal((await db.query(`select count(*)::int n from site_content where key='availability.config'`)).rows[0].n,0)
await db.exec(`set role service_role`)
const account=(await db.query(`insert into admin_staff_accounts(password_hash,role,active) values('synthetic','owner',true) returning id,session_version`)).rows[0]
await db.query(`update admin_staff_accounts set active=false where id=$1`,[account.id])
await db.query(`update admin_staff_accounts set active=true where id=$1`,[account.id])
assert.notEqual((await db.query(`select session_version from admin_staff_accounts where id=$1`,[account.id])).rows[0].session_version,account.session_version)
const limits=await Promise.all(Array.from({length:8},()=>db.query(`select consume_public_rate_limit('test',$1,3,10000) as result`,['a'.repeat(24)])))
assert.equal(limits.filter(x=>x.rows[0].result.allowed).length,3)
await db.exec(`update public_rate_buckets set expires_at=now()-interval '1 second' where key like 'test:%'`)
assert.equal((await db.query(`select consume_public_rate_limit('test',$1,3,10000) as result`,['a'.repeat(24)])).rows[0].result.allowed,true)
const client=(await db.query(`insert into clients default values returning id`)).rows[0].id
const input={email:'client@example.test',phone:'0400000000',contactName:'Test',businessName:'Test',address:'1 Test St',suburb:'Sydney',postcode:'2000',city:'sydney',premisesType:'office',floorArea:100}
const quote=(await db.query(`insert into quotes(quote_ref,client_id,inputs,status) values('SC-TEST',$1,$2,'sent') returning id`,[client,input])).rows[0].id
const hash='b'.repeat(64)
await db.query(`insert into quote_capabilities(token_hash,quote_id,purpose,variant,expires_at) values($1,$2,'booking','remote_review',now()+interval '1 day')`,[hash,quote])
const payload={booking_ref:'BK-TEST',inputs:input,inspection_status:'pending',first_clean_date:'2026-10-04',recurring_schedule:{}}
for (const bad of [{...input,email:'attacker@example.test'},{...input,phone:'invalid'}]) {
 await assert.rejects(db.query(`select create_authorized_quote_booking($1,'SC-TEST',$2)`,[hash,{...payload,inputs:bad}]), /mismatch/)
}
assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,0)
await assert.rejects(db.query(`select create_authorized_quote_booking($1,'SC-TEST',$2)`,[hash,{...payload,first_clean_date:'invalid'}]))
assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,0)
assert.equal((await db.query('select status from quotes')).rows[0].status,'sent')
const results=await Promise.all(Array.from({length:4},()=>db.query(`select create_authorized_quote_booking($1,'SC-TEST',$2) as result`,[hash,payload])))
assert.equal(results.filter(x=>x.rows[0].result.created).length,1)
assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1)
assert.equal((await db.query('select count(*)::int n from booking_security_outbox')).rows[0].n,1)
assert.equal((await db.query('select status from quotes')).rows[0].status,'accepted')
await db.query('update quote_capabilities set revoked_at=now() where token_hash=$1',[hash])
await assert.rejects(db.query(`select create_authorized_quote_booking($1,'SC-TEST',$2)`,[hash,payload]), /unavailable/)
await db.close()
console.log('PASS: migration replay, role ACLs, private backfill, staff revocation, rate concurrency/expiry, booking denial/atomic rollback/replay/revocation')
