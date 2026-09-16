import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const {
  applyContractProductBroadcastTemplateFields,
  findUnsupportedContractProductBroadcastTemplateFields,
} = await import('../src/lib/contractProductBroadcastTemplateTokens.ts')

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${projectRoot}/${path}`, 'utf8')

test('broadcast template fields are applied once per cleaner and unsupported fields are detected', () => {
  const fields = {
    '{{first_name}}': 'Jamie',
    '{{last_name}}': 'Ng',
    '{{contact_name}}': 'Jamie Ng',
    '{{business_name}}': 'Bright Clean',
    '{{cleaner_email}}': 'jamie@example.com.au',
    '{{city}}': 'Sydney',
    '{{suburb}}': 'Parramatta',
    '{{state}}': 'NSW',
    '{{product_count}}': '2',
    '{{product_codes}}': 'C001001, C001002',
    '{{jobs_link}}': 'https://securecleaning.com.au/jobs/access/example?state=NSW',
    '{{sender_name}}': 'Renata Mezedi',
    '{{sender_title}}': 'Customer Relationship Manager',
    '{{sender_email}}': 'renata@securecleaning.com.au',
    '{{sender_phone}}': '0400 000 000',
  }

  assert.equal(
    applyContractProductBroadcastTemplateFields(
      'Hi {{first_name}}, {{product_count}} contracts are available in {{state}} from {{sender_name}}.',
      fields,
    ),
    'Hi Jamie, 2 contracts are available in NSW from Renata Mezedi.',
  )
  assert.deepEqual(
    findUnsupportedContractProductBroadcastTemplateFields('Hi {{first_name}} and {{unknown_field}}', '{{unknown_field}}'),
    ['<<unknown_field>>'],
  )
  assert.equal(
    applyContractProductBroadcastTemplateFields('Hi <<first_name>> from <<company>>.', fields),
    'Hi Jamie from Bright Clean.',
  )
})

test('broadcast preview renders the same personalised email builder required by send', () => {
  const broadcasts = source('src/lib/contractProductBroadcasts.ts')
  const workspace = source('src/components/admin/ContractProductsWorkspace.tsx')
  const templates = source('src/lib/contractProductBroadcastTemplates.ts')

  assert.match(broadcasts, /emailPreview:\s*\{[\s\S]+subject: renderBroadcastSubject\(subject, templateInput\)/)
  assert.match(broadcasts, /html: buildBroadcastHtml\(/)
  assert.match(broadcasts, /const finalSubject = renderBroadcastSubject\(subject, templateInput\)[\s\S]+const finalHtml = buildBroadcastHtml/)
  assert.match(broadcasts, /assertSupportedBroadcastTemplateFields\(subject, intro\.text, intro\.html\)/)
  assert.match(broadcasts, /previewFingerprint: broadcastDraftFingerprint/)
  assert.match(broadcasts, /final_html_snapshot: finalHtml/)
  assert.match(templates, /findUnsupportedContractProductBroadcastTemplateFields\(subject, message, richMessage\.html\)/)
  assert.match(workspace, /Preview email & confirm recipients/)
  assert.match(workspace, /Product broadcast email preview/)
  assert.match(workspace, /Changing a recipient, product, sender, subject, or message removes the preview/)
  assert.match(workspace, /CONTRACT_PRODUCT_BROADCAST_TEMPLATE_FIELDS/)
  assert.match(workspace, /Cleaner database/)
  assert.match(workspace, /Broadcast selection/)
  assert.match(workspace, /Team Access/)
})
