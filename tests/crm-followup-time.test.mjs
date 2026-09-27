import test from 'node:test'
import assert from 'node:assert/strict'
import { followUpInput, followUpIso, businessDayFollowUp, followUpGroup } from '../src/lib/crmFollowUpTime.ts'

test('follow-up local input round trips without changing the instant', () => {
  for (const zone of ['Australia/Melbourne', 'Australia/Sydney', 'UTC']) {
    process.env.TZ = zone
    for (const value of ['2026-09-28T00:20:00.000Z', '2026-10-05T00:20:00.000Z']) {
      assert.equal(followUpIso(followUpInput(value)), value)
    }
  }
})
test('business day reminders skip weekends and retain morning local time across DST', () => {
  process.env.TZ = 'Australia/Melbourne'
  assert.equal(businessDayFollowUp(2, new Date('2026-10-02T10:00:00+10:00')), '2026-10-06T09:00')
})
test('overdue, today and upcoming use the due time and local date', () => {
  const now = new Date('2026-09-28T10:00:00+10:00')
  assert.equal(followUpGroup('2026-09-28T09:59:00+10:00', now), 'Overdue')
  assert.equal(followUpGroup('2026-09-28T10:20:00+10:00', now), 'Today')
  assert.equal(followUpGroup('2026-09-29T10:20:00+10:00', now), 'Upcoming')
  assert.equal(followUpIso(''), null)
  assert.throws(() => followUpIso('invalid'))
})

test('reminder migration only schedules successful transitions and keeps earlier work', async () => {
  const { readFile } = await import('node:fs/promises')
  const sql = await readFile(new URL('../supabase/client_crm_followups_migration.sql', import.meta.url), 'utf8')
  assert.match(sql, /NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent'/)
  assert.match(sql, /next_follow_up_at IS NULL OR next_follow_up_at > NEW.follow_up_at/)
  assert.match(sql, /stage NOT IN \('won', 'lost', 'cancelled'\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION apply_crm_email_follow_up\(\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /'previousDueAt', OLD.next_follow_up_at/)
})

test('reminder actions retain server-side assignment and stale reminder protection', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/lib/clientCrmData.ts', import.meta.url), 'utf8')
  assert.match(source, /canActorAccessAssignedOpportunity\(actor.role, actor.id, current.assigned_staff_id\)/)
  assert.match(source, /query = query.eq\('assigned_staff_id', actor.id\)/)
  assert.match(source, /input.expectedNextFollowUpAt !== current.next_follow_up_at/)
})
