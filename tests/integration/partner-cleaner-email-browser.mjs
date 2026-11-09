import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { partnerCleanerMessage } from '../../src/lib/partnerCleanerMessage.ts'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service'
const {parseCleanerEmailInput,renderCleanerEmail}=await import('../../src/lib/cleanerEmailPolicy.ts')

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin=process.env.TEST_ORIGIN || 'http://localhost:3371'
const token='22222222-2222-4222-8222-222222222222'
const unsubscribeUrl=`${origin}/cleaner-email-preferences/unsubscribe?token=${token}`
const message=partnerCleanerMessage('Alex','Fixture Cleaning Company',`${origin}/cleaners/portal/claim?token=synthetic-only`,unsubscribeUrl)
writeFileSync('/tmp/sc-partner-cleaner-email-preview.html',message.html)
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const context=await browser.newContext({viewport:{width:1100,height:1100}})
const posts=[],errors=[];let succeeds=true
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.origin!==origin)return route.abort()
  if(!url.pathname.startsWith('/api/'))return route.continue()
  if(url.pathname==='/api/cleaner-email-preferences/unsubscribe') {
    assert.equal(request.method(),'POST');posts.push(request.postDataJSON())
    return route.fulfill({status:succeeds?200:400,contentType:'application/json',body:JSON.stringify({success:succeeds})})
  }
  return route.fulfill({status:200,contentType:'application/json',body:'{}'})
})
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
try {
  for(const [name,width] of [['desktop',1100],['mobile',390]]) {
    await page.setViewportSize({width,height:1100});await page.setContent(message.html)
    await page.getByRole('heading',{name:'Secure Cleaning',exact:true}).waitFor()
    assert.equal(await page.getByRole('link',{name:'Unsubscribe from cleaner outreach and job broadcasts'}).getAttribute('href'),unsubscribeUrl)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
    await page.screenshot({path:`/tmp/sc-partner-cleaner-email-${name}.png`,fullPage:true})
  }
  const welcome=renderCleanerEmail(parseCleanerEmailInput({emails:'cleaner@example.test',subject:'Welcome <<first_name>>',body:'Hello <<first_name>>,\n\nThank you for speaking with our team about cleaning contracts.'}),{id:'fixture',email:'cleaner@example.test',first_name:'Alex',contact_name:'Alex',business_name:'Fixture Cleaning Company',state:'NSW'},{displayName:'Fixture NSW Agent',jobTitle:'Regional Agent',phone:'0400 000 000',email:'agent@example.test'},unsubscribeUrl,'partner_lead')
  for(const width of [1100,390]) {
    await page.setViewportSize({width,height:1100});await page.setContent(welcome.html)
    assert.match(await page.locator('body').innerText(),/Hello Alex/)
    assert.match(await page.locator('body').innerText(),/Fixture NSW Agent/)
    assert.doesNotMatch(await page.locator('body').innerText(),/approved cleaner profile/)
    assert.equal(await page.getByRole('link',{name:'Unsubscribe from cleaner updates and job broadcasts'}).getAttribute('href'),unsubscribeUrl)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
    await page.screenshot({path:`/tmp/sc-partner-welcome-email-${width}.png`,fullPage:true})
  }
  // Viewing a link must not unsubscribe (mail-security scanners may open it).
  await page.goto(unsubscribeUrl)
  const unsubscribe=page.getByRole('button',{name:'Unsubscribe from cleaner emails',exact:true})
  await unsubscribe.waitFor();assert.equal(posts.length,0)
  await unsubscribe.click()
  await page.getByRole('status').filter({hasText:'You have been unsubscribed'}).waitFor()
  assert.deepEqual(posts,[{token}])
  assert.match(await page.getByRole('status').innerText(),/Messages needed to manage work you request or already hold are unaffected/)
  // An unsuccessful mutation must not claim that the recipient is unsubscribed.
  succeeds=false;await page.goto(unsubscribeUrl);await unsubscribe.click()
  await page.getByRole('alert').filter({hasText:'This link could not be processed'}).waitFor()
  assert.equal(await page.getByText('You have been unsubscribed',{exact:false}).count(),0)
  assert.deepEqual(errors,[])
  console.log('PASS both branded emails with agent signature at desktop/mobile, visible unsubscribe link, GET has no mutation, explicit opt-out success and failure feedback; all API calls mocked, no real sends or records.')
} finally {await browser.close()}
