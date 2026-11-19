// Actual React screens; every API and delivery is synthetic. No production network is permitted.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const {build}=await import(pathToFileURL(process.env.ESBUILD_MODULE).href)
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const root=process.cwd(), requests=[]
const sender={missing:[],from:'owner@example.test',replyTo:'owner@example.test',cc:'owner@example.test',signature:'Fixture Owner',id:'owner',displayName:'Fixture Owner',email:'owner@example.test',phone:'0400000000',jobTitle:'Owner',role:'owner'}
let done=false
const workspace={success:true,products:[],broadcasts:[{id:'campaign',state:'NSW',subject:'Fixture broadcast',status:'sending',backgroundStatus:'queued',recipientMode:'state',senderName:'Fixture Owner',senderEmail:'owner@example.test',recipientCount:3,sentCount:1,failedCount:0,skippedCount:0,createdAt:'2026-11-19T00:00:00Z'}],templates:[],senders:[sender],actor:{id:'owner',role:'owner',state:'NSW',displayName:'Fixture Owner'},jobsUrl:'https://example.test/jobs'}
const delivery=()=>({inProgress:!done,paused:false,backgroundStatus:done?'completed':'queued',deliveryMessage:done?'Background delivery finished.':'Emails are sending in the background. You can close this page.',sentCount:done?3:1,failedCount:0,remainingCount:done?0:2,recipients:[{id:'one',to_email:'fixture@example.test',delivery_outcome:done?'sent':'queued'}]})
const output=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Workspace from '${root}/src/components/admin/ContractProductsWorkspace'; import Composer from '${root}/src/components/admin/CleanerEmailComposer'; sessionStorage.setItem('cleaner-broadcast-request','22222222-2222-4222-8222-222222222222'); sessionStorage.setItem('cleaner-email-request','33333333-3333-4333-8333-333333333333'); createRoot(document.getElementById('root')).render(location.pathname==='/cleaner'?<Composer cleaners={[]} templates={[]} onClose={()=>{document.getElementById('root').textContent='Closed'}}/>:<Workspace/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"test"','process.env':JSON.stringify({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon'})},plugins:[{name:'fixture-only-layout',setup(builder){
 builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}))
 builder.onResolve({filter:/RichEmailComposer$/},()=>({path:'editor',namespace:'fixture'}))
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export default function Editor(){return null}",loader:'jsx',resolveDir:root}))
}}]})
const js=output.outputFiles[0].text
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?js:'<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>')})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[]
context.on('page',page=>page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack)}))
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort()
 if(!url.pathname.startsWith('/api/'))return route.continue()
 const body=req.method()==='POST'?req.postDataJSON():{};requests.push(body.action||'GET')
 let data=workspace
 if(body.action==='broadcast.recipients')data={success:true,result:{cleaners:[],consideredCount:0,excluded:{}}}
 else if(body.action==='broadcast.status'||body.action==='status')data={success:true,result:delivery()}
 else if(url.pathname.includes('senders'))data={success:true,...sender,senders:[sender],defaultSenderId:sender.id}
 else if(req.method()==='POST')throw Error(`Unexpected mutation ${body.action}`)
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
})
try {
 let page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
 await page.goto(origin);await page.getByRole('button',{name:'Broadcasts',exact:true}).click()
 await page.getByRole('button',{name:'Check delivery status',exact:true}).click()
 await page.getByText('Emails are sending in the background. You can close this page.',{exact:true}).first().waitFor()
 assert.equal(requests.filter(x=>x==='broadcast.continue').length,0)
 await page.screenshot({path:'/tmp/sc-background-broadcast.png',fullPage:true})
 await page.close()
 // Synthetic scheduler completes while no browser is open. Separate worker/SQL tests exercise real dispatch logic.
 done=true
 page=await context.newPage();await page.goto(origin);await page.getByRole('button',{name:'Broadcasts',exact:true}).click()
 await page.getByRole('button',{name:'Check delivery status',exact:true}).click()
 await page.getByText(/3 sent; 0 queued; 0 unresolved/).waitFor()
 assert.equal(requests.filter(x=>x==='broadcast.send'||x==='broadcast.continue').length,0)
 done=false
 await page.goto(`${origin}/cleaner`)
 await page.getByRole('button',{name:'Check delivery status',exact:true}).click()
 await page.getByText('Emails are sending in the background. You can close this page.',{exact:true}).waitFor()
 page.on('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Close email',exact:true}).click()
 await page.getByText('Closed',{exact:true}).waitFor()
 assert.deepEqual(errors,[])
 console.log('PASS: real broadcast/cleaner screens poll read-only status, explain safe closure, reopen completed request without send/resume, and allow closing the composer. All APIs mocked; no external access.')
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
