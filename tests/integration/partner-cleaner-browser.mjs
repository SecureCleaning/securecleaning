import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin=process.env.TEST_ORIGIN || 'http://localhost:3371'
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const context=await browser.newContext({viewport:{width:1280,height:1000}})
const calls=[], unexpected=[];let delivery='sent', failOnce=false
let cities=['melbourne','sydney'], signedIn=true
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url())
 if(url.origin!==origin){await route.abort();return}
 if(!url.pathname.startsWith('/api/')){await route.continue();return}
 const respond=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
 if(url.pathname==='/api/partner-booking/session'){
  if(request.method()==='DELETE'){signedIn=false;return respond({ok:true})}
  if(request.method()==='POST'){signedIn=true;return respond({ok:true})}
  if(!signedIn)return route.fulfill({status:401,contentType:'application/json',body:'{"error":"Sign in"}'})
  return respond({name:'Fixture Caller',company:'Fixture Telemarketing',cities})
 }
 if(url.pathname==='/api/locality-autocomplete')return respond({suggestions:url.searchParams.get('city')==='sydney'?[{label:'Sydney 2000',suburb:'Sydney',postcode:'2000',state:'NSW'}]:[{label:'Melbourne 3000',suburb:'Melbourne',postcode:'3000',state:'VIC'}]})
 if(url.pathname==='/api/partner-booking/cleaners'){
  calls.push(request.postDataJSON())
  if(failOnce){failOnce=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic transient error. Retry this submission.'})})}
  await new Promise(resolve=>setTimeout(resolve,200))
  return respond({reference:calls.at(-1).idempotencyKey,emailStatus:delivery,replay:calls.length>1})
 }
 // Analytics and unrelated shell APIs cannot reach a real service.
 if(request.method()!=='GET')unexpected.push(url.pathname)
 return respond({})
})
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
try {
 await page.goto(`${origin}/partner-booking`)
 await page.getByRole('heading',{name:'Find an appointment'}).waitFor()
 assert.equal(await page.getByRole('combobox',{name:/^State/}).inputValue(),'sydney')
 assert.equal(await page.getByRole('heading',{name:'Add cleaner lead',exact:true}).isVisible(),false)
 await page.locator('#suburb').fill('Booking draft suburb')
 await page.getByRole('button',{name:'Add cleaner lead',exact:true}).click()
 const section=page.getByRole('region',{name:'Add cleaner lead',exact:true})
 assert.equal(await section.getByRole('combobox',{name:/^State/}).inputValue(),'sydney')
 await section.getByRole('combobox',{name:/^State/}).selectOption('melbourne')
 await section.getByLabel('Business name *',{exact:true}).fill('Synthetic Cleaner')
 await section.getByLabel('Email *',{exact:true}).fill('cleaner@example.test')
 await section.getByLabel('Phone *',{exact:true}).fill('0400000000')
 await section.getByLabel('Street address (optional)').fill('Unit 2, 10 Example Street')
 await section.getByLabel('Suburb or Postcode Search').fill('Melbourne')
 await section.getByRole('button',{name:/Melbourne.*3000/}).click()
 await section.getByLabel('Internal notes (optional)').fill('Private fixture note')
 await page.getByRole('button',{name:'Book appointment',exact:true}).click()
 assert.equal(await page.locator('#suburb').inputValue(),'Booking draft suburb')
 await page.getByRole('button',{name:'Add cleaner lead',exact:true}).click()
 assert.equal(await section.getByLabel('Business name *',{exact:true}).inputValue(),'Synthetic Cleaner')
 assert.equal(await section.getByLabel('Street address (optional)').inputValue(),'Unit 2, 10 Example Street')
 assert.equal(await section.getByRole('combobox',{name:/^State/}).inputValue(),'melbourne')
 await section.getByRole('button',{name:'Review cleaner details'}).click()
 const save=section.getByRole('button',{name:'Save cleaner & send details email'})
 assert.equal(await save.isEnabled(),false)
 await section.getByRole('checkbox').check()
 // Simulate an uncertain network result and verify retry retains its reference.
 failOnce=true;await save.click();await section.getByRole('alert').waitFor()
 await save.click();await section.getByRole('heading',{name:'Cleaner details received'}).waitFor()
 assert.equal(calls.length,2);assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey)
 assert.equal(calls[0].firstName,'');assert.equal(calls[0].notes,'Private fixture note');assert.equal(calls[0].emailConsent,true)
 assert.equal(calls[0].address,'Unit 2, 10 Example Street')
 await page.screenshot({path:'/tmp/sc-partner-cleaner-desktop.png',fullPage:true})
 await section.getByRole('button',{name:'Add another cleaner'}).click()
 assert.equal(await section.getByLabel('Business name *',{exact:true}).inputValue(),'')
 assert.equal(await section.getByRole('combobox',{name:/^State/}).inputValue(),'sydney')
 assert.equal(await section.getByLabel('Street address (optional)').inputValue(),'')
 await page.setViewportSize({width:390,height:844})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
 await section.getByLabel('Business name *',{exact:true}).fill('Second Fixture')
 await section.getByLabel('Email *',{exact:true}).fill('existing@example.test')
 await section.getByLabel('Phone *',{exact:true}).fill('0400000001')
 await section.getByLabel('Suburb or Postcode Search').fill('Sydney')
 await section.getByRole('button',{name:/Sydney.*2000/}).click()
 await section.getByRole('button',{name:'Review cleaner details'}).click()
 await section.getByRole('checkbox').check()
 await page.screenshot({path:'/tmp/sc-partner-cleaner-mobile.png',fullPage:true})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
 delivery='team_review';await save.click();await section.getByRole('heading',{name:'Cleaner details received'}).waitFor()
 assert.match(await section.innerText(),/will review/);assert.doesNotMatch(await section.innerText(),/has been sent/)
 assert.notEqual(calls[2].idempotencyKey,calls[0].idempotencyKey)
 assert.equal(calls[2].address,'');assert.equal(calls[2].city,'sydney')
 await page.getByRole('button',{name:'Log out',exact:true}).click()
 await page.getByLabel('Username',{exact:true}).fill('fixture')
 await page.getByLabel('Password',{exact:true}).fill('synthetic-not-a-password')
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await page.getByRole('heading',{name:'Find an appointment'}).waitFor()
 assert.equal(await page.getByRole('combobox',{name:/^State/}).inputValue(),'sydney')
 await page.getByRole('button',{name:'Add cleaner lead',exact:true}).click()
 assert.equal(await section.getByRole('combobox',{name:/^State/}).inputValue(),'sydney')
 // An agency without NSW permission must never receive a NSW default.
 cities=['melbourne'];await page.reload();await page.getByRole('heading',{name:'Find an appointment'}).waitFor()
 assert.equal(await page.getByRole('combobox',{name:/^State/}).inputValue(),'melbourne')
 await page.getByRole('button',{name:'Add cleaner lead',exact:true}).click()
 assert.equal(await section.getByRole('combobox',{name:/^State/}).inputValue(),'melbourne')
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[])
 console.log('PASS NSW defaults on session/sign-in/reset, allowed-state fallback, optional address/blank submission, draft preservation, consent gate, stable retry key, review-needed receipt, 390px layout, zero real API writes or sends.')
} finally {await browser.close()}
