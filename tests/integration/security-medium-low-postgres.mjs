// Isolated PostgreSQL engine tests. PGlite serializes queries: Promise.all below
// verifies queued admission counts, not simultaneous multi-connection locking.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const sql = readFileSync(new URL('../../supabase/migrations/20261008053208_security_medium_low_remediation.sql', import.meta.url), 'utf8')
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
const denied = async (sql, params = []) => { await assert.rejects(db.query(sql, params), /permission denied/); checks++ }
const subject = n => n.toString(16).padStart(24, '0')
const consume = async (policy = 'test', id = subject(1), limit = 3, window = 60000) => (await db.query('select consume_public_rate_limit($1,$2,$3,$4) as result', [policy, id, limit, window])).rows[0].result
const hits = async key => (await db.query('select hits from public_rate_buckets where key=$1', [key])).rows[0]?.hits
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table ai_chat_sessions(id text primary key, token text, messages jsonb);
    create table owner_operators(id text primary key, name text, email text, insurance text);
    create table owner_operator_ratings(id text primary key, booking_id text, client_id text, rating integer);
    create table quotes(id text primary key, inputs jsonb, inspection_report jsonb, firm_quote_workflow jsonb, final_quote_document jsonb);
    create table cleaner_emails(id text primary key,delivery_outcome text);
    create table public_rate_buckets(key text primary key,hits integer not null,expires_at timestamptz not null);
    alter table ai_chat_sessions enable row level security;
    alter table owner_operators enable row level security;
    alter table owner_operator_ratings enable row level security;
    alter table quotes enable row level security;
    create policy "Users access own chat by token" on ai_chat_sessions for select using(true);
    create policy "Anon can create chat session" on ai_chat_sessions for insert with check(true);
    create policy "Public can view active operators" on owner_operators for select using(true);
    create policy "Public read public ratings" on owner_operator_ratings for select using(true);
    create policy "Anon can insert quotes" on quotes for insert with check(true);
    create policy authenticated_quote_read on quotes for select to authenticated using(true);
    grant all on ai_chat_sessions,owner_operators,owner_operator_ratings to public,anon,authenticated;
    grant select(id),insert(id),update(id),references(id) on ai_chat_sessions,owner_operators,owner_operator_ratings to public,anon,authenticated;
    grant insert on quotes to public,anon,authenticated;
    grant insert(id,inputs) on quotes to public,anon,authenticated;
    grant select on quotes to authenticated;
    grant all on all tables in schema public to service_role;
    insert into quotes(id,inputs) values('existing','{}');
  `)
  // Prove the modeled historical exposure exists before applying the exact migration.
  await db.exec('set role anon')
  await db.query(`select id,token from ai_chat_sessions`)
  await db.query(`insert into quotes(id,inputs) values('historical','{}')`)
  await db.exec('reset role')
  // Historical large values are permitted until the particular field changes.
  await db.query(`update quotes set inspection_report=to_jsonb(repeat('x',131073)), firm_quote_workflow=to_jsonb(repeat('x',524289)), final_quote_document=to_jsonb(repeat('x',1048577)) where id='existing'`)
  await db.exec(sql); await db.exec(sql)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    for (const table of ['ai_chat_sessions', 'owner_operators', 'owner_operator_ratings']) {
      await denied(`select * from ${table}`)
      await denied(`select id from ${table}`)
      await denied(`insert into ${table}(id) values('blocked')`)
      await denied(`update ${table} set id='blocked'`)
      await denied(`delete from ${table}`)
    }
    await denied(`insert into quotes(id) values('blocked')`)
    await denied(`select consume_public_rate_limit('x',$1,1,1000)`, [subject(1)])
    if (role === 'authenticated') check((await db.query('select count(*)::int as n from quotes')).rows[0].n, 2)
    await db.exec('reset role')
  }
  check((await db.query(`select count(*)::int n from pg_policies where policyname in ('Users access own chat by token','Anon can create chat session','Anon can insert quotes','Public can view active operators','Public read public ratings')`)).rows[0].n, 0)
  await db.exec('set role service_role')
  await db.query(`insert into quotes(id,inputs) values('server','{}')`)
  await db.query(`insert into ai_chat_sessions values('server','secret','[]')`)
  await db.query(`update quotes set inputs='{"changed":true}',inspection_report=inspection_report,firm_quote_workflow=firm_quote_workflow,final_quote_document=final_quote_document where id='existing'`)
  check((await db.query(`select inputs->>'changed' changed from quotes where id='existing'`)).rows[0].changed,'true')
  for (const [column,limit] of [['inspection_report',128*1024],['firm_quote_workflow',512*1024],['final_quote_document',1024*1024]]) {
    // JSONB text includes two string quotes, so limit-2 ASCII characters is exact.
    await db.query(`update quotes set ${column}=to_jsonb(repeat('x',$1::integer)) where id='server'`,[limit-2])
    await assert.rejects(db.query(`update quotes set ${column}=to_jsonb(repeat('x',$1::integer)) where id='server'`,[limit-1]), /limit|large|size/i); checks++
    await assert.rejects(db.query(`insert into quotes(id,${column}) values('too-big',to_jsonb(repeat('x',$1::integer)))`,[limit]), /limit|large|size/i); checks++
    await assert.rejects(db.query(`update quotes set ${column}=to_jsonb(repeat(chr(233),$1::integer)) where id='server'`,[Math.floor(limit/2)]), /limit|large|size/i); checks++
    await db.query(`update quotes set ${column}='{}' where id='existing'`)
    check((await db.query(`select ${column} value from quotes where id='existing'`)).rows[0].value,{})
    await db.query(`update quotes set ${column}=null where id='server'`)
  }
  check((await db.query('select count(*)::int n from quotes')).rows[0].n, 3)
  check((await db.query('select token from ai_chat_sessions')).rows[0].token, 'secret')
  await db.query(`insert into cleaner_emails values('a','sending','key-a','draft-a')`)
  await assert.rejects(db.query(`insert into cleaner_emails values('b','sent','key-a','other')`), /unique constraint/); checks++
  await assert.rejects(db.query(`insert into cleaner_emails values('b','unknown','key-b','draft-a')`), /unique constraint/); checks++
  await db.query(`update cleaner_emails set delivery_outcome='unknown' where id='a'`)
  await assert.rejects(db.query(`insert into cleaner_emails values('b','sending','key-b','draft-a')`), /unique constraint/); checks++
  await db.query(`update cleaner_emails set delivery_outcome='sent' where id='a'`)
  await db.query(`insert into cleaner_emails values('b','sending','key-b','draft-a'),('legacy1','sent',null,null),('legacy2','sent',null,null)`)
  check((await db.query('select count(*)::int n from cleaner_emails')).rows[0].n, 4)
  check((await consume()).allowed, true)
  check((await consume()).allowed, true)
  check((await consume()).allowed, true)
  const blocked = await consume()
  check(blocked.allowed, false); assert.ok(blocked.retry_after >= 1); checks++
  check(await hits('global'), 3)
  check(await hits(`test:${subject(1)}`), 3)
  await db.query(`update public_rate_buckets set expires_at=now()-interval '1 second' where key <> 'global'`)
  check((await consume()).allowed, true); check(await hits(`test:${subject(1)}`), 1); check(await hits('global'), 4)
  const beforeInvalid = await hits('global')
  for (const args of [[null,subject(1),3,60000],['x',null,3,60000],['x',subject(1),null,60000],['x',subject(1),3,null],['',subject(1),3,60000],['x','bad',3,60000],['x',subject(1),0,60000],['x',subject(1),3,999]]) {
    await assert.rejects(consume(...args), /Invalid rate policy/); checks++
  }
  check(await hits('global'), beforeInvalid)
  await db.query(`update public_rate_buckets set hits=999 where key='global'`)
  check((await consume('cap',subject(2))).allowed, true)
  check((await consume('cap',subject(3))).allowed, false)
  check(await hits('global'), 1000); check(await hits(`cap:${subject(3)}`), undefined)
  await db.query(`update public_rate_buckets set expires_at=now()-interval '1 second' where key='global'`)
  check((await consume('cap',subject(3))).allowed, true); check(await hits('global'), 1)
  await db.exec('delete from public_rate_buckets')
  const queued = await Promise.all(Array.from({length: 30}, () => consume('queued',subject(4),7)))
  check(queued.filter(result => result.allowed).length,7); check(await hits('global'),7); check(await hits(`queued:${subject(4)}`),7)
  await db.query(`update public_rate_buckets set hits=995 where key='global'`)
  const capQueued = await Promise.all(Array.from({length: 20}, (_,n) => consume('queued-cap',subject(n+10),7)))
  check(capQueued.filter(result => result.allowed).length,5); check(await hits('global'),1000)
  await db.exec(`delete from public_rate_buckets;
    insert into public_rate_buckets select 'seed:'||n,1,now()+interval '1 hour' from generate_series(1,100000) n;`)
  check((await consume('capacity',subject(100))).allowed,false)
  check(await hits('global'),undefined)
  await db.query(`update public_rate_buckets set expires_at=now()-interval '1 second' where key='seed:1'`)
  check((await consume('capacity',subject(100))).allowed,false)
  check(await hits('global'),undefined)
  await db.query(`delete from public_rate_buckets where key='seed:2'`)
  check((await consume('capacity',subject(100))).allowed,true)
  check(await hits('global'),1)
  check((await db.query('select count(*)::int n from public_rate_buckets')).rows[0].n,100000)
  console.log(`PASS: ${checks} assertions: replay, table/column/PUBLIC ACLs, server writes, authenticated quote reads, email uniqueness, rate limits, expiry, invalid inputs, global capacity, queued admission.`)
  console.log('LIMIT: PGlite serializes calls; simultaneous multi-connection advisory-lock races require real PostgreSQL verification.')
} finally { await db.close() }
