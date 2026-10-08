import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { allowsPublicChat, getRobofyFrameUrl } from '../src/lib/publicChatPolicy.ts'

test('public chat allows only explicit marketing paths', () => {
  for (const path of ['/', '/about', '/services', '/cities/melbourne', '/cities/sydney', '/cleaners', '/consumables']) assert.equal(allowsPublicChat(path), true, path)
  for (const path of [null, '/admin', '/admin/chat', '/agent', '/availability/dashboard/person', '/quote', '/quote/ref', '/quote/result', '/scope/ref', '/booking', '/booking/confirm', '/cleaners/portal', '/jobs/code', '/unsubscribe', '/new-portal', '/about?token=private', '/about#private', '//about', '/about/../admin']) assert.equal(allowsPublicChat(path), false, String(path))
})

test('provider frame URL is fixed cross-origin and contains only validated public identifiers', () => {
  const url = new URL(getRobofyFrameUrl('3792', 'chatbot_example-1'))
  assert.equal(url.origin, 'https://agents.robofy.ai')
  assert.equal(url.pathname, '/agent-widget')
  assert.deepEqual([...url.searchParams.keys()], ['pid', 'cid'])
  assert.equal(url.hash, '')
  for (const id of ['', undefined, '../admin', 'evil.com/', '\" onload=evil', 'x'.repeat(201)]) assert.equal(getRobofyFrameUrl(id, 'cid'), null)
  assert.equal(getRobofyFrameUrl('pid', 'cid&context=private'), null)
})

test('provider stays in restricted cross-origin iframe and is discarded on navigation', async () => {
  const source = await readFile(new URL('../src/components/chat/RobofyWidget.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /next\/script|agent-widget\.js|srcDoc|postMessage|addEventListener|window\.location|document\.cookie/)
  assert.match(source, /sandbox="allow-scripts allow-same-origin"/)
  assert.match(source, /referrerPolicy="no-referrer"/)
  assert.match(source, /if \(!allowsPublicChat\(pathname\) \|\| !src\) return null/)
  assert.match(source, /IsolatedRobofyChat key=\{pathname\}/)
  assert.match(source, /\{open &&/)
})
