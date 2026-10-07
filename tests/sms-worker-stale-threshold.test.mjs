import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20261008090000_sms_worker_stale_threshold.sql', import.meta.url),
  'utf8',
)

test('SMS worker stale alerts require a sustained ten-minute outage', () => {
  assert.match(migration, /worker_at\s*<\s*now\(\)\s*-\s*interval '10 minutes'/i)
  assert.doesNotMatch(migration, /interval '5 minutes'/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sms_tick\(\)/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.sms_tick\(\) FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.sms_tick\(\) TO service_role/i)
})
