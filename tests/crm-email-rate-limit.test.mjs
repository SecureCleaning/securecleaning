import test from 'node:test'
import assert from 'node:assert/strict'
import { CRM_EMAIL_SEND_LIMIT, CRM_EMAIL_PREVIEW_LIMIT, CRM_EMAIL_WINDOW_MS, crmEmailLimitMessage } from '../src/lib/crmEmailRateLimit.ts'
test('CRM limits allow manual outreach and enough separate previews',()=>{
 assert.equal(CRM_EMAIL_SEND_LIMIT,100)
 assert.equal(CRM_EMAIL_PREVIEW_LIMIT,300)
 assert.equal(CRM_EMAIL_WINDOW_MS,3600000)
})
test('CRM limit message rounds wait up and clarifies blocked sends',()=>{
 assert.match(crmEmailLimitMessage('send','61'),/wait 2 minutes/)
 assert.match(crmEmailLimitMessage('send','1'),/wait 1 second /)
 assert.match(crmEmailLimitMessage('send','3600'),/wait 60 minutes/)
 assert.match(crmEmailLimitMessage('send','30'),/This attempt did not send an email/)
 for(const value of [null,'bad','-1','Infinity','0']) assert.match(crmEmailLimitMessage('preview',value),/wait 1 minute /)
 assert.match(crmEmailLimitMessage('preview','30'),/300 email previews/)
 assert.doesNotMatch(crmEmailLimitMessage('preview','30'),/did not send/)
})
