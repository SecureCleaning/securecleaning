import test from 'node:test'
import assert from 'node:assert/strict'
import { crmArchivedEmailText, getCrmQuoteEmailText } from '../src/lib/crmEmailArchiveText.ts'

test('archived HTML retains all visible paragraphs, table cells, entities and signature without active content', () => {
  const text = crmArchivedEmailText('<html><head><title>Not body</title><style>.private{display:none}</style></head><body><p>Hi <b>Test</b> <i>Manager</i>,</p><p>First &amp; second paragraph.</p><table><tr><td>Price</td><td>$345</td></tr></table><p>Last paragraph &lt;agreed&gt;.</p><p>Kind regards,<br>Agent</p><img src="https://pixel.example/track"><a href="https://example.test/accept?token=OLD-SECRET">View quote</a><script>bad()</script></body></html>')
  assert.match(text, /Hi Test Manager,/)
  assert.match(text, /First & second paragraph/)
  assert.match(text, /Price\n\$345/)
  assert.match(text, /Last paragraph <agreed>/)
  assert.match(text, /Kind regards,\nAgent/)
  assert.match(text, /View quote/)
  assert.doesNotMatch(text, /Not body|private|bad\(\)|OLD-SECRET|https:|<img|<script/)
})

test('long archived email text is not cut to an excerpt', () => {
  const paragraphs = Array.from({ length: 250 }, (_, i) => `<p>Paragraph ${i}: all the saved text.</p>`).join('')
  const text = crmArchivedEmailText(paragraphs)
  assert.equal(text.split('\n').length, 250)
  assert.ok(text.endsWith('Paragraph 249: all the saved text.'))
})

test('legacy quote email recovery reads only its saved provider ID and validates recipient and quote reference', async () => {
  const priorFetch=globalThis.fetch, priorKey=process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY='re_fixture'
  const providerId='00000000-0000-4000-8000-000000000001'
  const source={provider_message_id:providerId,quote_ref:'SC-FIXTURE',recipient:'client@example.test'}
  const valid={id:providerId,to:['client@example.test'],subject:'Your quote SC-FIXTURE',from:'Agent <agent@example.test>',html:'<p>Complete original message.</p><p>Last paragraph.</p><a href="https://example.test/accept?token=old-secret">View quote</a>'}
  let calls=0
  try {
    globalThis.fetch=async (url,init)=>{calls++;assert.equal(url,'https://api.resend.com/emails/'+providerId);assert.equal(init.method,undefined);assert.equal(init.redirect,'error');return new Response(JSON.stringify(valid))}
    const recovered=await getCrmQuoteEmailText(source)
    assert.match(recovered.text,/Complete original message/);assert.match(recovered.text,/Last paragraph/)
    assert.doesNotMatch(recovered.text,/old-secret/)
    assert.equal(calls,1)
    assert.match((await getCrmQuoteEmailText({...source,email_snapshot:{html:'<p>Saved local message</p>'}})).text,/Saved local/)
    assert.equal(calls,1)
    assert.equal(await getCrmQuoteEmailText({...source,provider_message_id:'../bad'}),null);assert.equal(calls,1)
    for(const patch of [{to:['other@example.test']},{to:['client@example.test','other@example.test']},{id:'other'},{subject:'Another quote'}, {html:null,text:null}]) {
      globalThis.fetch=async()=>new Response(JSON.stringify({...valid,...patch}))
      assert.equal(await getCrmQuoteEmailText(source),null)
    }
    for(const status of [403,404,429,500]) {globalThis.fetch=async()=>new Response('',{status});assert.equal(await getCrmQuoteEmailText(source),null)}
    globalThis.fetch=async()=>{throw new Error('fixture timeout')};assert.equal(await getCrmQuoteEmailText(source),null)
  } finally {globalThis.fetch=priorFetch;if(priorKey===undefined) delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=priorKey}
})
