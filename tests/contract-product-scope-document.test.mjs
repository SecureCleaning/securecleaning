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
 assert.ok(html.includes('Print / Save as PDF'));assert.ok(html.includes('@media print'))
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
