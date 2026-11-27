// Real React components with synthetic data. Every external request is blocked.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync, readdirSync, existsSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const {build}=await import(pathToFileURL(process.env.ESBUILD_MODULE).href)
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const root=process.cwd(),writes=[],errors=[]
const cove='c08e0000-0000-4000-8000-000000000001',renata='72bddeab-8e0e-4bb2-bee4-c48cafbeede6'
let rules=[{id:cove,name:'Cove Commercial Cleaning',agent_id:renata,agent_bps:6000,active:true,revision:1}]
const agents=[{id:renata,display_name:'Renata Mezedi'},{id:'00000000-0000-4000-8000-000000000002',display_name:'Future Agent'}]
const workspace=()=>({success:true,role:'owner',sourceRules:rules,agents,sales:[],balances:[],claims:[],payouts:[],components:[],assignments:[],revisions:[],receivedInvoices:[],settings:{win_bps:2000,sale_bps:2000}})
const crm=()=>({success:true,commissionSources:rules.map(r=>({id:r.id,name:r.name,agentId:r.agent_id,active:r.active})),premisesOptions:[],opportunities:[],templates:[],templateDocuments:[],agents:agents.map(a=>({id:a.id,displayName:a.display_name,active:true})),senders:[],defaultCity:'sydney',actor:{id:'owner',role:'owner',displayName:'Owner'}})
const output=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Commissions from '${root}/src/components/admin/CommissionsWorkspace';import Crm from '${root}/src/components/admin/ClientCrmWorkspace';createRoot(document.getElementById('root')).render(location.pathname==='/crm'?<Crm/>:<Commissions/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"test"','process.env':JSON.stringify({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture'})},plugins:[{name:'fixture-ui',setup(b){
 b.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}))
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}))
 b.onResolve({filter:/RichEmailComposer$/},()=>({path:'editor',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='css'?'export default {}':args.path==='link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export default function Editor(){return null}",loader:'jsx',resolveDir:root}))
}}]})
const js=output.outputFiles[0].text
const css=existsSync('.next/static/css')?readdirSync('.next/static/css').filter(x=>x.endsWith('.css')).map(x=>readFileSync('.next/static/css/'+x,'utf8')).join('\n'):''
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?js:'<!doctype html><html><head><style>'+css+'</style></head><body style="font-family:Arial;padding:24px"><div id="root"></div><script src="/app.js"></script></body></html>')})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const context=await browser.newContext({viewport:{width:1280,height:960}})
context.setDefaultTimeout(10000)
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort()
 if(!url.pathname.startsWith('/api/'))return route.continue()
 if(req.method()==='POST') {
  const body=req.postDataJSON();writes.push(body)
  assert.equal(body.action,'source_rule.save')
  const existing=rules.find(r=>r.id===body.id)
  assert.equal(body.revision,existing?.revision||0)
  rules=rules.filter(r=>r.id!==body.id).concat([{id:body.id,name:body.name,agent_id:body.agentId,agent_bps:body.agentBps,active:body.active,revision:body.revision+1}])
  return route.fulfill({json:{success:true}})
 }
 return route.fulfill({json:url.pathname.includes('client-crm')?crm():workspace()})
})
try {
 const page=await context.newPage();await page.goto(origin)
 const summary=page.getByText('Enquiry-source commission rules',{exact:true})
 await summary.waitFor()
 assert.equal(await summary.evaluate(el=>el.parentElement.open),false)
 await summary.click()
 await page.getByText('Renata Mezedi: 60% · Secure Cleaning: 40%',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Edit rule',exact:true}).click()
 assert.equal(await page.getByLabel('Commission recipient').inputValue(),renata)
 await page.getByLabel('Total agent share %').fill('55')
 await page.getByText('Secure Cleaning share: 45%',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Save rule for future sales',exact:true}).click()
 await page.getByText('Renata Mezedi: 55% · Secure Cleaning: 45%',{exact:true}).waitFor()
 assert.equal(writes[0].agentBps,5500)
 await page.getByRole('button',{name:'Add enquiry source',exact:true}).click()
 await page.getByLabel('Enquiry source name').fill('Another referral')
 await page.getByLabel('Commission recipient').selectOption(agents[1].id)
 await page.getByLabel('Total agent share %').fill('50')
 await page.getByRole('button',{name:'Save rule for future sales',exact:true}).click()
 await page.getByText('Future Agent: 50% · Secure Cleaning: 50%',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/cove-commission-rules.png',fullPage:true})
 await page.goto(`${origin}/crm`)
 await page.getByRole('button',{name:'New opportunity',exact:true}).click()
 await page.getByLabel('Enquiry source',{exact:true}).selectOption(`referral:${cove}`)
 assert.equal(await page.getByLabel('Provider or public source',{exact:true}).inputValue(),'Cove Commercial Cleaning')
 assert.equal(await page.getByLabel('Assigned regional agent',{exact:true}).inputValue(),renata)
 assert.equal(await page.getByLabel('Assigned regional agent',{exact:true}).isDisabled(),true)
 await page.screenshot({path:'/tmp/cove-crm-source.png',fullPage:true})
 assert.equal(writes.length,2)
 assert.deepEqual(errors,[])
 console.log('PASS: collapsed owner source controls, edit and new source, reciprocal share preview, real CRM Cove selection fills and locks Renata. All API writes mocked; no external network or messages.')
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
