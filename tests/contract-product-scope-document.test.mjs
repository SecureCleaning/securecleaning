import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
const { renderContractProductScopeDocument } = await import('../src/lib/contractProductScopeDocument.ts')
import { readFileSync } from 'node:fs'
const scope = { summary:'Office cleaning',frequency:'weekly',timePreference:'after_hours',floorArea:100,floors:1, selectedOptions:['Vacuum'],rooms:[{label:'Office <script>bad</script>',description:'Dust & wipe',quantity:1,size:100,floor:1,tasks:[{label:'Wipe desks',cadence:'weekly'},'Vacuum floors'],selectedOptions:['Empty bins']}],email:'private@example.com',address:'Hidden street',internalNotes:'Do not publish',clientPrice:400 }
test('cleaner document uses only saved scope display fields, escapes content and includes task cadence',()=>{
 const html=renderContractProductScopeDocument('C001',scope,'test-nonce')
 for(const secret of ['private@example.com','Hidden street','Do not publish','clientPrice']) assert.ok(!html.includes(secret))
 assert.ok(html.includes('Office &lt;script&gt;bad&lt;/script&gt;'))
 assert.ok(html.includes('Weekly'));assert.ok(html.includes('Every clean'));assert.ok(html.includes('Empty bins'))
 assert.ok(html.includes('href="?format=pdf" download>Download PDF'));assert.ok(html.includes('Print page'));assert.ok(html.includes('@media print'))
})
test('scope endpoint uses authenticated state-authorized saved product access without changing status',()=>{
 const service=readFileSync('src/lib/contractProducts.ts','utf8').split('export async function getContractProductCleanerScope')[1].split('async function getContractProductQuoteSnapshot')[0]
 assert.match(service,/getAuthorizedProduct\(actor, productId\)/)
 assert.match(service,/product.cleaner_scope_snapshot/)
 assert.match(service,/assertCleanerListingExcludesSourcePii/)
 assert.doesNotMatch(service,/\.update\(|\.rpc\(|source_quote_id|status ===/)
 const route=readFileSync('src/app/api/admin/contract-products/[id]/scope/route.ts','utf8')
 assert.match(route,/getContractProductActor\(request\)/);assert.match(route,/private, no-store/)
})

const { containsSourceIdentity } = await import('../src/lib/contractProductScopePrivacy.ts')
test('privacy checks scan customer identity and phone details beyond long scope prefixes', () => {
 const prefix = 'Ordinary cleaning task. '.repeat(200)
 assert.equal(containsSourceIdentity(prefix + 'Private Client Pty Ltd', ['Private Client Pty Ltd'], ''), true)
 assert.equal(containsSourceIdentity(prefix + 'Call 0412 345 678', [], '0412345678'), true)
 assert.equal(containsSourceIdentity(prefix + '20 Example Street', ['20 Example St'], ''), true)
 assert.equal(containsSourceIdentity(prefix, ['Private Client Pty Ltd'], '0412345678'), false)
})

test('direct PDF download uses the same private scope and denies unauthorised access', async () => {
 const { createRequire } = await import('node:module')
 const require = createRequire(import.meta.url)
 const ts = (await import('typescript')).default
 const { NextRequest, NextResponse } = require('next/server')
 const { buildCleanerScopePdf } = await import('../src/lib/contractSaleChecklistPdf.ts')
 let authorized = true
 const compiled = ts.transpileModule(readFileSync('src/app/api/admin/contract-products/[id]/scope/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const modules = {
  'next/server': {NextResponse}, '@/lib/contractSaleChecklistPdf': {buildCleanerScopePdf},
  '@/lib/contractProductAuth': {getContractProductActor:async()=>authorized?{id:'staff'}:null},
  '@/lib/contractProducts': {ContractProductError:class extends Error {},getContractProductCleanerScope:async()=>({productCode:'C001',scope})},
  '@/lib/contractProductScopeDocument': {renderContractProductScopeDocument},
 }
 const mod={exports:{}}
 new Function('require','module','exports',compiled)(id=>modules[id]??require(id),mod,mod.exports)
 const request=new NextRequest('https://securecleaning.com.au/api/admin/contract-products/11111111-1111-4111-8111-111111111111/scope?format=pdf')
 const context={params:Promise.resolve({id:'11111111-1111-4111-8111-111111111111'})}
 const response=await mod.exports.GET(request,context)
 assert.equal(response.headers.get('content-type'),'application/pdf')
 assert.equal(response.headers.get('content-disposition'),'attachment; filename="cleaner-scope-C001.pdf"')
 assert.equal(response.headers.get('cache-control'),'private, no-store')
 const bytes=Buffer.from(await response.arrayBuffer())
 assert.deepEqual(bytes,buildCleanerScopePdf('C001',scope))
 assert.doesNotMatch(bytes.toString('latin1'),/https:\/\/securecleaning|private@example.com|Hidden street/)
 authorized=false
 assert.equal((await mod.exports.GET(request,context)).status,403)
})
