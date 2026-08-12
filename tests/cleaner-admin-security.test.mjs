import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NextRequest } from 'next/server'

process.env.ADMIN_SESSION_SECRET = 'test-session-secret'

const {
  createAdminSessionToken,
  ADMIN_SESSION_COOKIE,
} = await import('../src/lib/adminAuth.ts')
const {
  authorizeCleanerAdminRequest,
  canAccessCleanerAdminAction,
} = await import('../src/lib/cleanerAdminAuth.ts')

const actions = [
  'list',
  'detail',
  'mutate',
  'comment',
  'documentUpload',
  'email',
  'import',
  'export',
  'documentDownload',
  'documentDelete',
  'sampleDelete',
]

test('cleaner permissions match the bounded role matrix', () => {
  const expected = {
    viewer: ['list', 'detail'],
    staff: ['list', 'detail', 'mutate', 'comment', 'documentUpload', 'email', 'import'],
    manager: actions,
    owner: actions,
  }

  for (const role of Object.keys(expected)) {
    for (const action of actions) {
      assert.equal(
        canAccessCleanerAdminAction(role, action),
        expected[role].includes(action),
        `${role} access to ${action}`,
      )
    }
  }
})

test('cleaner route authorization distinguishes missing sessions from insufficient roles', () => {
  const missingSessionRequest = new NextRequest('https://securecleaning.com.au/api/admin/cleaners/export')
  assert.deepEqual(authorizeCleanerAdminRequest(missingSessionRequest, 'export'), {
    identity: null,
    error: 'Unauthorized',
    status: 401,
  })

  const viewerToken = createAdminSessionToken({ id: 'viewer-id', username: 'viewer.one', role: 'viewer' })
  const viewerRequest = new NextRequest('https://securecleaning.com.au/api/admin/cleaners/export', {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=${viewerToken}` },
  })
  assert.deepEqual(authorizeCleanerAdminRequest(viewerRequest, 'export'), {
    identity: null,
    error: 'Forbidden',
    status: 403,
  })

  const staffToken = createAdminSessionToken({ id: 'staff-id', username: 'staff.one', role: 'staff' })
  const staffRequest = new NextRequest('https://securecleaning.com.au/api/admin/cleaners/cleaner-1/comments', {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=${staffToken}` },
  })
  assert.deepEqual(authorizeCleanerAdminRequest(staffRequest, 'comment').identity, {
    id: 'staff-id',
    username: 'staff.one',
    role: 'staff',
  })
})

test('cleaner mutations use signed identity and cannot use browser attribution fields', () => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const routeFiles = [
    'src/app/api/admin/cleaners/[cleanerId]/comments/route.ts',
    'src/app/api/admin/cleaners/[cleanerId]/documents/route.ts',
    'src/app/api/admin/cleaners/[cleanerId]/email/route.ts',
  ]

  for (const relativePath of routeFiles) {
    const source = readFileSync(join(projectRoot, relativePath), 'utf8')
    assert.match(source, /authorizeCleanerAdminRequest/)
  }

  const commentsRoute = readFileSync(join(projectRoot, routeFiles[0]), 'utf8')
  const documentsRoute = readFileSync(join(projectRoot, routeFiles[1]), 'utf8')
  const emailRoute = readFileSync(join(projectRoot, routeFiles[2]), 'utf8')
  assert.doesNotMatch(commentsRoute, /body\?\.authorName/)
  assert.doesNotMatch(documentsRoute, /formData\.get\(['"]uploadedBy['"]\)/)
  assert.doesNotMatch(emailRoute, /body\?\.sentBy/)
  assert.match(commentsRoute, /authorization\.identity/)
  assert.match(documentsRoute, /actor: authorization\.identity/)
  assert.match(emailRoute, /actor: authorization\.identity/)
})

test('document replacement requires manager-level document delete permission', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/app/api/admin/cleaners/[cleanerId]/documents/route.ts', import.meta.url)),
    'utf8',
  )
  assert.match(source, /if \(replaceDocumentId\)/)
  assert.match(source, /authorizeCleanerAdminRequest\(request, 'documentDelete'\)/)
})
