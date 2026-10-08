// Real independent PostgreSQL connections; ephemeral local cluster, no application credentials.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
const modulePath = process.env.EMBEDDED_POSTGRES_MODULE
if (!modulePath) throw new Error('Set EMBEDDED_POSTGRES_MODULE to an isolated embedded-postgres installation.')
const { default: EmbeddedPostgres } = await import(modulePath)
const directory = mkdtempSync(join(tmpdir(), 'sc-security-concurrency-'))
const pg = new EmbeddedPostgres({ databaseDir: join(directory,'data'), user:'postgres', password:randomBytes(24).toString('hex'), port:65439, persistent:false, createPostgresUser:false, postgresFlags:['-h','127.0.0.1','-k',directory], onLog:()=>{}, onError:()=>{} })
const clients=[]
let admin
const subject=n=>n.toString(16).padStart(24,'0')
try {
  await pg.initialise(); await pg.start()
  admin=pg.getPgClient('postgres','127.0.0.1'); await admin.connect()
  await admin.query(`create role anon;create role authenticated;create role service_role;
    create table ai_chat_sessions(id text);create table owner_operators(id text);create table owner_operator_ratings(id text);
    create table quotes(id text,inspection_report jsonb,firm_quote_workflow jsonb,final_quote_document jsonb);
    create table cleaner_emails(id text,delivery_outcome text);
    create table public_rate_buckets(key text primary key,hits integer not null,expires_at timestamptz not null);
    grant usage on schema public to service_role;grant all on all tables in schema public to service_role;`)
  await admin.query(readFileSync(new URL('../../supabase/migrations/20261008053208_security_medium_low_remediation.sql',import.meta.url),'utf8'))
  for(let i=0;i<16;i++){const c=pg.getPgClient('postgres','127.0.0.1');await c.connect();await c.query('set role service_role');clients.push(c)}
  const run=async(count,policy,id,limit)=>{
    const values=[]
    await Promise.all(clients.map(async(c,index)=>{
      for(let i=index;i<count;i+=clients.length){const r=await c.query('select consume_public_rate_limit($1,$2,$3,60000) result',[policy,typeof id==='function'?id(i):id,limit]);values.push(r.rows[0].result)}
    }))
    return values.filter(x=>x.allowed).length
  }
  const globalHits=async()=>Number((await admin.query("select hits from public_rate_buckets where key='global'")).rows[0]?.hits??0)
  assert.equal(await run(200,'same',subject(1),3),3)
  assert.equal(await globalHits(),3)
  assert.equal(await run(1200,'same',subject(1),3),0)
  assert.equal(await globalHits(),3)
  assert.equal(await run(64,'independent',i=>subject(i+10),3),64)
  assert.equal(await globalHits(),67)
  await admin.query("truncate public_rate_buckets;insert into public_rate_buckets values('global',990,now()+interval '1 minute')")
  assert.equal(await run(100,'capacity',i=>subject(i+100),2),10)
  assert.equal(await globalHits(),1000)
  assert.equal(Number((await admin.query("select count(*) n from public_rate_buckets where key<>'global'")).rows[0].n),10)
  await admin.query("update public_rate_buckets set expires_at=now()-interval '1 second'")
  assert.equal(await run(32,'renewed',subject(2),5),5)
  assert.equal(await globalHits(),5)
  await clients[0].query('begin')
  await clients[0].query('select consume_public_rate_limit($1,$2,1,60000)',['rollback',subject(999)])
  await clients[0].query('rollback')
  assert.equal(await globalHits(),5)
  assert.equal(Number((await admin.query("select count(*) n from public_rate_buckets where key like 'rollback:%'")).rows[0].n),0)
  console.log('PASS: real PostgreSQL, 16 connections, 1,596 concurrent scheduled requests; exact subject/shared admission, rejected-source isolation, global capacity race, expiry and rollback.')
} finally {
  await Promise.allSettled(clients.map(c=>c.end()))
  if(admin)await admin.end()
  await pg.stop().catch(()=>{})
  rmSync(directory,{recursive:true,force:true})
}
