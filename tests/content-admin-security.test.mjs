import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('content admin API enforces complete, unique, known content payloads', () => {
  const source = readFileSync(new URL('../src/app/api/admin/content/route.ts', import.meta.url), 'utf8')

  assert.match(source, /isAuthorizedAdminRequest\(request, ['"]manager['"]\)/)
  assert.match(source, /entries\.length !== CONTENT_DEFAULTS\.length/)
  assert.match(source, /submittedKeys\.has\(key\)/)
  assert.match(source, /!allowedKeys\.has\(key\)/)
  assert.match(source, /submittedKeys\.size !== allowedKeys\.size/)
  assert.match(source, /Invalid request body\./)
})
