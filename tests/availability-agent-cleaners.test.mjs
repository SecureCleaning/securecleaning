import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path) => readFileSync(`${root}/${path}`, 'utf8')
const { getAgentCleanerPageCount, getStateForAvailabilityCity, toAgentCleanerEmailHistory } = await import('../src/lib/cleanerAgentPolicy.ts')
const { normalizeAvailabilityAssigneeCity } = await import('../src/lib/availabilityNormalization.ts')

test('agent cleaner access maps supported cities to canonical states', () => {
  assert.equal(getStateForAvailabilityCity('melbourne'), 'VIC')
  assert.equal(getStateForAvailabilityCity('sydney'), 'NSW')
  assert.equal(getStateForAvailabilityCity('brisbane'), null)
  const source = read('src/lib/cleanerAgentAccess.ts')
  assert.match(source, /isAuthorizedAvailabilityAgentRequest\(request, assigneeId\)/)
  assert.match(source, /if \(!assignee\?\.active\) return null/)
  assert.match(source, /if \(!state\) return null/)
})

test('availability assignee city normalization disables malformed persisted values', () => {
  assert.deepEqual(normalizeAvailabilityAssigneeCity('sydney', 'melbourne'), { city: 'sydney', supported: true })
  assert.deepEqual(normalizeAvailabilityAssigneeCity(undefined, 'sydney'), { city: 'sydney', supported: true })
  assert.deepEqual(normalizeAvailabilityAssigneeCity('brisbane', 'melbourne'), { city: 'melbourne', supported: false })
  assert.match(read('src/lib/availability.ts'), /active: normalizedCity\.supported && Boolean/)
})

test('agent cleaner pagination exposes every result page', () => {
  assert.equal(getAgentCleanerPageCount(0, 50), 1)
  assert.equal(getAgentCleanerPageCount(100, 50), 2)
  assert.equal(getAgentCleanerPageCount(101, 50), 3)
  const component = read('src/components/availability/AgentCleaners.tsx')
  assert.match(component, /page: String\(targetPage\)/)
  assert.match(component, /loadPage\(page \+ 1\)/)
  assert.match(component, /submittedQuery = appliedQuery/)
  assert.match(component, /setAppliedQuery\(query\); await loadPage\(1, query\)/)
})

test('agent email response removes sensitive provider and message fields', () => {
  const projected = toAgentCleanerEmailHistory({
    id: 'email-1', cleaner_id: 'cleaner-1', to_email: 'private@example.com', subject: 'Hello', body: 'Private body',
    status: 'sent', template_name: 'Welcome', provider_message_id: 'provider-secret', error_message: 'private error',
    sent_at: '2026-08-14T00:00:00Z', created_at: '2026-08-14T00:00:00Z',
  })
  assert.deepEqual(Object.keys(projected).sort(), ['created_at', 'id', 'sent_at', 'status', 'subject', 'template_name'])
  for (const field of ['body', 'to_email', 'provider_message_id', 'error_message']) assert.equal(field in projected, false)
  assert.match(read('src/lib/cleaners.ts'), /return toAgentCleanerEmailHistory\(email\)/)
})

test('agent cleaner list forces signed agent state and ignores client state', () => {
  const source = read('src/app/api/availability-agent/[assigneeId]/cleaners/route.ts')
  assert.match(source, /state: context\.state/)
  assert.doesNotMatch(source, /searchParams\.get\(['"]state['"]\)/)
})

test('detail comments and email enforce state-scoped cleaner lookup', () => {
  const cleaners = read('src/lib/cleaners.ts')
  assert.match(cleaners, /getCleanerDetailForState/)
  assert.match(cleaners, /\.eq\('id', cleanerId\)[\s\S]*\.eq\('state', normalizedState\)/)
  assert.match(cleaners, /addCleanerCommentForState[\s\S]*addCleanerComment\(cleanerId, comment, actor, state\)/)
  assert.match(cleaners, /if \(state\) await assertCleanerInState\(cleanerId, state\)/)
  assert.match(cleaners, /sendCleanerEmailForState/)

  for (const path of [
    'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/route.ts',
    'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/comments/route.ts',
    'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/email/route.ts',
  ]) {
    const source = read(path)
    assert.match(source, /context\.state/)
    assert.match(source, /Cleaner not found\./)
  }
})

test('agent email derives recipient and active template metadata on the server', () => {
  const source = read('src/lib/cleaners.ts')
  assert.match(source, /to_email: cleaner\.email/)
  assert.match(source, /to: cleaner\.email/)
  assert.match(source, /\.from\('cleaner_email_templates'\)[\s\S]*\.eq\('is_active', true\)/)
  assert.match(source, /if \(payload\.state\) await assertCleanerInState\(cleaner\.id, payload\.state\)/)
  const sendSource = source.slice(source.indexOf('export async function sendCleanerEmail(payload'))
  assert.ok(sendSource.indexOf('if (payload.state) await assertCleanerInState(cleaner.id, payload.state)') < sendSource.indexOf(".from('cleaner_emails')"))

  const route = read('src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/email/route.ts')
  assert.doesNotMatch(route, /body\?\.to|body\?\.templateName|body\?\.sentBy/)
})

test('agent responses expose full regional cleaner records while keeping email history minimized', () => {
  const cleaners = read('src/lib/cleaners.ts')
  assert.match(cleaners, /AGENT_CLEANER_LIST_SELECT/)
  assert.match(cleaners, /AGENT_CLEANER_DETAIL_SELECT/)
  assert.match(cleaners, /AGENT_EMAIL_HISTORY_SELECT = 'id, subject, status, template_name, created_at, sent_at'/)
  const emailRoute = read('src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/email/route.ts')
  const commentRoute = read('src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/comments/route.ts')
  assert.ok(emailRoute.indexOf('getCleanerAgentContext') < emailRoute.indexOf('rateLimit(request'))
  assert.ok(commentRoute.indexOf('getCleanerAgentContext') < commentRoute.indexOf('rateLimit(request'))
})

test('agent portal exposes state-scoped cleaner record and document mutations', () => {
  const nav = read('src/components/availability/AvailabilityAgentNav.tsx')
  const page = read('src/app/availability/cleaners/[assigneeId]/page.tsx')
  const component = read('src/components/availability/AgentCleaners.tsx')
  assert.match(nav, /availability\/cleaners\/\$\{assigneeId\}/)
  assert.match(page, /hasAvailabilityAgentSession\(assigneeId\)/)
  assert.match(component, /can create and manage all cleaner record details/)
  assert.match(component, /method: creating \? 'POST' : 'PATCH'/)
  assert.match(component, /method: 'DELETE'/)
  assert.match(component, /Upload document/)
  for (const path of [
    'src/app/api/availability-agent/[assigneeId]/cleaners/route.ts',
    'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/route.ts',
    'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/documents/route.ts',
    'src/app/api/availability-agent/[assigneeId]/cleaners/[cleanerId]/documents/[documentId]/route.ts',
  ]) {
    const route = read(path)
    assert.match(route, /getCleanerAgentContext/)
    assert.match(route, /context\.state/)
  }
})
