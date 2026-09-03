import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const { appointmentStartConflictsWithBlock } = await import('../src/lib/availability.ts')

const blockStart = new Date('2026-09-03T13:05:00+10:00')
const blockEnd = new Date('2026-09-03T16:05:00+10:00')

test('a partial-day block-out preserves appointment starts at least one hour before it', () => {
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-03T12:00:00+10:00'), blockStart, blockEnd),
    false,
  )
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-03T13:00:00+10:00'), blockStart, blockEnd),
    true,
  )
})

test('a 12:30pm block-out keeps 10am and 11am but removes noon and later starts', () => {
  const middayBlockStart = new Date('2026-09-08T12:30:00+10:00')
  const middayBlockEnd = new Date('2026-09-08T14:29:00+10:00')

  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-08T10:00:00+10:00'), middayBlockStart, middayBlockEnd),
    false,
  )
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-08T11:00:00+10:00'), middayBlockStart, middayBlockEnd),
    false,
  )
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-08T12:00:00+10:00'), middayBlockStart, middayBlockEnd),
    true,
  )
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-08T15:00:00+10:00'), middayBlockStart, middayBlockEnd),
    true,
  )
})

test('appointments resume only after the one-hour block-out buffer', () => {
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-03T17:00:00+10:00'), blockStart, blockEnd),
    true,
  )
  assert.equal(
    appointmentStartConflictsWithBlock(new Date('2026-09-03T17:05:00+10:00'), blockStart, blockEnd),
    false,
  )
})

test('invalid block-out ranges do not suppress appointments', () => {
  assert.equal(
    appointmentStartConflictsWithBlock(
      new Date('2026-09-03T13:00:00+10:00'),
      new Date('2026-09-03T16:00:00+10:00'),
      new Date('2026-09-03T15:00:00+10:00'),
    ),
    false,
  )
})
