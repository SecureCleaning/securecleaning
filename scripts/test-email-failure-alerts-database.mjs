// Isolated PostgreSQL tests only. No live database connection or email provider calls.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
if (!process.env.PGLITE_MODULE) throw Error('Set PGLITE_MODULE to the test-only PGlite installation.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
  await db.exec(readFileSync(new URL('../supabase/migrations/20261104061109_email_failure_owner_alerts.sql', import.meta.url), 'utf8'))
  const security = (await db.query(`SELECT c.relrowsecurity AS rls,
    has_table_privilege('anon','public.email_failure_alerts','SELECT') AS anon_read,
    has_table_privilege('authenticated','public.email_failure_alerts','INSERT') AS auth_write,
    has_function_privilege('anon','public.claim_email_failure_alerts(text,integer,uuid)','EXECUTE') AS anon_claim,
    has_function_privilege('authenticated','public.claim_email_failure_alerts(text,integer,uuid)','EXECUTE') AS auth_claim,
    p.prosecdef AS definer, p.proconfig AS config
    FROM pg_class c,pg_proc p WHERE c.oid='public.email_failure_alerts'::regclass AND p.oid='public.claim_email_failure_alerts(text,integer,uuid)'::regprocedure`)).rows[0]
  assert.equal(security.rls, true)
  for (const key of ['anon_read','auth_write','anon_claim','auth_claim','definer']) assert.equal(security[key], false)
  assert.ok(security.config.includes('search_path=pg_catalog'))
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM public.email_failure_alerts'), /permission denied/)
  await assert.rejects(db.query("SELECT * FROM public.claim_email_failure_alerts('owner@example.test')"), /permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  const insert = `INSERT INTO public.email_failure_alerts(dedupe_key,outcome,failure_code,alert_text) VALUES ($1,'uncertain','provider_outcome_uncertain','Synthetic alert, no customer data') ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`
  const id = (await db.query(insert, ['a'.repeat(64)])).rows[0].id
  assert.equal((await db.query(insert, ['a'.repeat(64)])).rows.length, 0)
  await assert.rejects(db.query("SELECT * FROM public.claim_email_failure_alerts('bad\nrecipient')"), /Invalid owner/)
  const claim = "SELECT * FROM public.claim_email_failure_alerts($1,3,$2)"
  const first = (await db.query(claim, ['owner@example.test',id])).rows[0]
  assert.equal(first.attempts,1); assert.equal(first.recipient,'owner@example.test'); assert.ok(first.lease_token)
  assert.equal((await db.query(claim, ['second@example.test',id])).rows.length,0, 'An active lease cannot be claimed twice')
  await db.query("UPDATE public.email_failure_alerts SET lease_until=now()-interval '1 second' WHERE id=$1", [id])
  assert.equal((await db.query(claim, ['second@example.test',id])).rows.length,0, 'Backoff applies even after lease expiry')
  await db.query("UPDATE public.email_failure_alerts SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[id])
  const retry = (await db.query(claim,['second@example.test',id])).rows[0]
  assert.equal(retry.recipient,first.recipient); assert.equal(retry.alert_text,first.alert_text)
  assert.equal(retry.attempts,2); assert.notEqual(retry.lease_token,first.lease_token)
  assert.equal((await db.query("UPDATE public.email_failure_alerts SET status='sent' WHERE id=$1 AND lease_token=$2 RETURNING id",[id,first.lease_token])).rows.length,0, 'Stale worker cannot overwrite a reclaimed alert')
  await db.query("UPDATE public.email_failure_alerts SET first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' WHERE id=$1",[id])
  assert.equal((await db.query(claim,['owner@example.test',id])).rows.length,0)
  assert.equal((await db.query('SELECT status FROM public.email_failure_alerts WHERE id=$1',[id])).rows[0].status,'review')
  for (const key of ['b','c','d','e']) await db.query(insert,[key.repeat(64)])
  assert.equal((await db.query("SELECT * FROM public.claim_email_failure_alerts('owner@example.test',100)")).rows.length,3, 'Worker batch is bounded')
  const last = (await db.query("SELECT * FROM public.claim_email_failure_alerts('owner@example.test',100)")).rows[0]
  await db.query("UPDATE public.email_failure_alerts SET status='sent',sent_at=now() WHERE id=$1 AND lease_token=$2",[last.id,last.lease_token])
  assert.equal((await db.query(claim,['owner@example.test',last.id])).rows.length,0,'Sent alerts are never sent again')
  await db.exec('RESET ROLE')
  await db.exec(readFileSync(new URL('../supabase/migrations/20261104061109_email_failure_owner_alerts.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.email_failure_alerts')).rows[0].n,5,'Repeat migration preserves queued and sent alerts')
  console.log('PASS: private grants/RLS, invoker RPC, deduplication, exclusive leases, frozen retries, backoff, stale-worker fencing, retry cutoff, bounded batches and repeatable migration.')
} finally { await db.close() }
