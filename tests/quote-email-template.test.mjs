import test from 'node:test'
import assert from 'node:assert/strict'
import { quoteEmailDraft, DEFAULT_QUOTE_EMAIL_TEMPLATE } from '../src/lib/quoteEmailTemplate.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
const { parseQuoteMessage, manageQuoteEmailTemplate } = await import('../src/lib/quoteEmailTemplateServer.ts')

test('quote templates merge references and escape client values in rich HTML', () => {
 const draft = quoteEmailDraft({ ...DEFAULT_QUOTE_EMAIL_TEMPLATE, bodyText: 'For <<business_name>>', bodyHtml: '<p>For &lt;&lt;business_name&gt;&gt;</p>' }, { quote_ref: 'SC-123', business_name: '<img src=x>' })
 assert.equal(draft.subject, 'Your updated Secure Cleaning quote - SC-123')
 assert.equal(draft.body, 'For <img src=x>')
 assert.ok(!draft.bodyHtml.includes('<img'))
 assert.equal(draft.bodyDocument, null)
})
test('quote template validates subject and message limits', () => {
 assert.throws(() => parseQuoteMessage({ subject: 'a\nb', body: 'hello' }))
 assert.throws(() => parseQuoteMessage({ subject: 'a'.repeat(181), body: 'hello' }))
 assert.throws(() => parseQuoteMessage({ subject: 'Hello', body: 'a'.repeat(4001) }))
 assert.equal(parseQuoteMessage({ subject: 'Hello', body: 'Message' }).text, 'Message')
})
test('agents cannot save global quote defaults', async () => {
 await assert.rejects(manageQuoteEmailTemplate({ role: 'agent' }, { action: 'quote-email-template.update' }), /owner or manager/)
})
