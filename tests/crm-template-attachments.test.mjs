import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${root}/${path}`, 'utf8')

test('CRM template attachments use a private, versioned and service-only data model', () => {
  const migration = source('supabase/migrations/20261118004956_crm_template_attachments.sql')
  assert.match(migration, /'crm-template-attachments',[\s\S]*FALSE/)
  assert.match(migration, /crm_email_template_version_documents/)
  assert.match(migration, /FOREIGN KEY \(template_id, template_version\)/)
  assert.match(migration, /attachment_snapshot JSONB NOT NULL DEFAULT '\[\]'/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g)
  assert.match(migration, /REVOKE ALL ON TABLE public\.crm_email_template_documents FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /save_client_crm_template_with_documents/)
  assert.match(migration, /requested_bytes > 20971520/)
})

test('PDF uploads are direct, private, validated and immutable', () => {
  const documents = source('src/lib/clientCrmTemplateDocuments.ts')
  const route = source('src/app/api/admin/client-crm/route.ts')
  assert.match(documents, /actor\.role !== 'owner' && actor\.role !== 'manager'/)
  assert.match(documents, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/)
  assert.match(documents, /validateDocumentContent\(bytes/)
  assert.match(documents, /createHash\('sha256'\)/)
  assert.match(documents, /changed after it was approved/)
  assert.doesNotMatch(documents, /getPublicUrl/)
  assert.match(route, /template-document\.upload\.create/)
  assert.match(route, /template-document\.upload\.finalize/)
  assert.match(route, /Content-Security-Policy': "sandbox; default-src 'none'"/)
})

test('template attachments are bound to preview, send and immutable email history', () => {
  const email = source('src/lib/clientCrmEmail.ts')
  const reads = source('src/lib/clientCrmReads.ts')
  const workspace = source('src/components/admin/ClientCrmWorkspace.tsx')
  assert.match(email, /templateAttachments\.map\(\(document\) => \[document\.id, document\.sha256\]\)/)
  assert.match(email, /loadCrmTemplateDocumentContents\(prepared\.templateAttachments\)/)
  assert.match(email, /attachment_snapshot: attachmentSnapshot/)
  assert.match(email, /templateAttachments: templateAttachmentContents\.map/)
  assert.match(reads, /attachment_snapshot/)
  assert.match(workspace, /Automatic PDF attachments/)
  assert.match(workspace, /Attached automatically with this template:/)
  assert.match(workspace, /uploadToSignedUrl/)
  assert.match(workspace, /These files are fixed to template version/)
})
