import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
try {
  await db.exec("CREATE TABLE public.cleaners(id integer PRIMARY KEY, business_name text NOT NULL, email text NOT NULL); INSERT INTO public.cleaners VALUES(1, '.', 'existing@example.test'); ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;")
  await db.exec(readFileSync('supabase/migrations/20261119003337_cleaner_optional_business_and_source.sql', 'utf8'))
  const existing = (await db.query('SELECT * FROM public.cleaners WHERE id = 1')).rows[0]
  assert.equal(existing.business_name, '.')
  assert.equal(existing.lead_source, null)
  assert.equal(existing.lead_source_details, null)
  await db.exec("INSERT INTO public.cleaners(id, email) VALUES(2, 'new@example.test')")
  assert.equal((await db.query('SELECT business_name FROM public.cleaners WHERE id = 2')).rows[0].business_name, '')
  for (const source of [null, 'gumtree', 'referral', 'relationship', 'telemarketing', 'website', 'social_media', 'other']) {
    await db.query('UPDATE public.cleaners SET lead_source=$1, lead_source_details=$2 WHERE id=2', [source, 'Referral details'])
    assert.equal((await db.query('SELECT lead_source FROM public.cleaners WHERE id=2')).rows[0].lead_source, source)
  }
  await assert.rejects(db.query('UPDATE public.cleaners SET lead_source=$1 WHERE id=2', ['invalid']), /check constraint/)
  await assert.rejects(db.query('UPDATE public.cleaners SET lead_source_details=$1 WHERE id=2', ['x'.repeat(1001)]), /check constraint/)
  await db.query('UPDATE public.cleaners SET lead_source=NULL, lead_source_details=NULL WHERE id=2')
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='cleaners'")).rows[0].relrowsecurity, true)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.cleaners')).rows[0].count, 2)
  console.log('PASS: optional business name, source round-trip and constraints, existing data and RLS retained.')
} finally {
  await db.close()
}
