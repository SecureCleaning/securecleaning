import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { parseRichEmailContent, richEmailFingerprint, sanitizeRichEmailHtml } = await import('../src/lib/richEmailServer.ts')
const {
  applyEmailMergeFields,
  CLIENT_EMAIL_MERGE_FIELD_KEYS,
  findUnsupportedEmailMergeFields,
} = await import('../src/lib/emailMergeFields.ts')

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('rich email HTML keeps supported formatting and removes unsafe markup', () => {
  const html = sanitizeRichEmailHtml('<h2 style="color:#0f766e" onclick="alert(1)">Hello</h2><p><strong>Safe</strong> copy</p><a href="javascript:alert(1)">bad link</a><script>alert(1)</script>')
  assert.match(html, /<h2 style="color:#0f766e">Hello<\/h2>/)
  assert.match(html, /<strong>Safe<\/strong>/)
  assert.doesNotMatch(html, /onclick|javascript:|script/i)
})

test('legacy plain text becomes safe HTML and preview fingerprints bind the complete draft', () => {
  const content = parseRichEmailContent({ body: 'Hello <Client>\n\nSecond paragraph' })
  assert.equal(content.text, 'Hello <Client>\n\nSecond paragraph')
  assert.match(content.html, /Hello &lt;Client&gt;/)
  assert.notEqual(
    richEmailFingerprint({ subject: 'A', html: content.html, text: content.text, context: 'one' }),
    richEmailFingerprint({ subject: 'B', html: content.html, text: content.text, context: 'one' }),
  )
})

test('database merge fields support friendly, legacy, and rich-editor encoded formats', () => {
  const values = { first_name: 'Jamie', company: 'Bright & Clean', address: '100 Sunnyholt Rd' }
  assert.equal(
    applyEmailMergeFields('Hi <<first_name>> from {{company}} at << address >>.', values),
    'Hi Jamie from Bright & Clean at 100 Sunnyholt Rd.',
  )
  assert.equal(
    applyEmailMergeFields('<p>Hi &lt;&lt;first_name&gt;&gt;</p>', { first_name: 'Jamie' }),
    '<p>Hi Jamie</p>',
  )
  assert.deepEqual(
    findUnsupportedEmailMergeFields(CLIENT_EMAIL_MERGE_FIELD_KEYS, 'Hi <<first_name>> and <<unknown_field>>'),
    ['<<unknown_field>>'],
  )
})

test('all manually composed outreach uses one editor, server preview, and immutable sent copies', () => {
  for (const path of [
    'src/components/admin/ClientCrmWorkspace.tsx',
    'src/components/admin/CleanersAdmin.tsx',
    'src/components/availability/AgentCleaners.tsx',
    'src/components/admin/ContractProductsWorkspace.tsx',
  ]) {
    assert.match(source(path), /RichEmailEditor/)
    assert.match(source(path), /previewFingerprint/)
    assert.match(source(path), /mergeFields=/)
  }

  const migration = source('supabase/rich_email_composer_migration.sql')
  for (const column of [
    'body_document_snapshot',
    'body_html_snapshot',
    'final_html_snapshot',
    'final_text_snapshot',
    'intro_document_snapshot',
    'intro_html_snapshot',
  ]) assert.match(migration, new RegExp(column))

  assert.match(source('src/lib/clientCrmEmail.ts'), /final_html_snapshot: finalHtml/)
  assert.match(source('src/lib/cleaners.ts'), /final_html_snapshot: finalHtml/)
  assert.match(source('src/lib/contractProductBroadcasts.ts'), /final_html_snapshot: finalHtml/)
})

test('the rich email toolbar remains visible and usable at tablet widths', () => {
  const editor = source('src/components/admin/RichEmailEditor.tsx')
  assert.match(editor, /data-rich-email-editor="true"/)
  assert.match(editor, /rich-email-editor-toolbar/)
  assert.match(editor, /sm:min-w-0 sm:flex-wrap/)
  assert.match(editor, /touch-manipulation/)
  assert.doesNotMatch(editor, /(?:sm|md|lg):hidden/)

})

// Every editable email surface must use the shared loading/error boundary.
test('all editable email surfaces use the shared composer', () => {
  for (const path of [
    'admin/CleanerEmailComposer.tsx', 'admin/CleanersAdmin.tsx',
    'admin/ContractProductsWorkspace.tsx', 'admin/ClientCrmWorkspace.tsx',
    'admin/QuoteWorkflowEditor.tsx', 'admin/ContractSalesWorkspace.tsx',
    'availability/AgentCleaners.tsx',
  ]) assert.match(source(`src/components/${path}`), /@\/components\/admin\/RichEmailComposer/)
  assert.match(source('src/components/admin/RichEmailEditor.tsx'), /onMouseDown=.*preventDefault/)
})
