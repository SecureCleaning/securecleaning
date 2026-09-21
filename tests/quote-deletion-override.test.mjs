import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
process.env.ADMIN_SESSION_SECRET = 'test-session-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
const { GET, DELETE } = await import('../src/app/api/admin/quotes/[ref]/deletion/route.ts')
const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import('../src/lib/adminAuth.ts')
const ref = 'SC-20260921-TEST'
const params = { params: { ref } }
const body = { confirmation: ref, reason: 'Internal test cleanup', linkedRecords: 'keep', override: true, previewToken: 'a'.repeat(32) }
function request(role, data=body, method='DELETE', extraHeaders={}) {
  const headers = { 'Content-Type':'application/json', ...extraHeaders }
  if (role) headers.cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken({id:'owner-id', username:'owner',role})}`
  return new NextRequest(`https://example.com/api/admin/quotes/${ref}/deletion`, {method,headers,...(method==='DELETE' ? {body:JSON.stringify(data)} : {})})
}
const originalFetch=globalThis.fetch
const account={id:'owner-id',username:'owner',display_name:'Owner',active:true,role:'owner'}
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
beforeEach(()=>{globalThis.fetch=async url=>{assert.ok(String(url).includes('/admin_staff_accounts?'));return json(account)}})
afterEach(()=>{globalThis.fetch=originalFetch})
test('stale owner cookies cannot inspect or delete after account removal, deactivation or demotion',async()=>{
 for(const record of [null,{...account,active:false},{...account,role:'manager'},{...account,username:'changed'}]){
  globalThis.fetch=async url=>{assert.ok(String(url).includes('/admin_staff_accounts?'));return json(record)}
  assert.equal((await GET(request('owner',{},'GET'),params)).status,403)
  assert.equal((await DELETE(request('owner'),params)).status,403)
 }
})
test('quote deletion preview and mutation reject all non-owner roles before data access', async () => {
  for (const role of [null,'agent','viewer','staff','manager']) {
    assert.equal((await GET(request(role,{},'GET'),params)).status,401)
    assert.equal((await DELETE(request(role),params)).status,401)
  }
})
test('owner must supply exact confirmation, reason, explicit record choice and reviewed preview', async () => {
  for (const changes of [{confirmation:'wrong'},{reason:'short'},{linkedRecords:'documents'},{override:'true'},{previewToken:''}]) {
    assert.equal((await DELETE(request('owner',{...body,...changes}),params)).status,400)
  }
  assert.equal((await DELETE(request('owner',body,'DELETE',{origin:'https://untrusted.example'}),params)).status,403)
})
test('deletion uses signed owner identity, preserves chosen mode and safely reports concurrent changes', async () => {
  const oldFetch = globalThis.fetch
  const oldError = console.error
  console.error = () => {}
  try {
    let sent, rpcError
    globalThis.fetch = async (url, options) => {
      if(String(url).includes('/admin_staff_accounts?')) return json(account)
      assert.ok(String(url).endsWith('/rpc/admin_delete_quote_with_override'))
      sent=JSON.parse(options.body)
      return new Response(JSON.stringify(rpcError ?? {quoteRef:ref,uploadsDeleted:false}), {status:rpcError ? 409 : 200,headers:{'Content-Type':'application/json'}})
    }
    const send = mode => DELETE(request('owner',{...body,linkedRecords:mode,actor:{role:'agent',id:'forged'}}),params)
    for (const mode of ['keep','delete']) {
      assert.equal((await send(mode)).status,200)
      assert.deepEqual(sent.p_actor,{id:'owner-id',name:'owner',role:'owner'})
      assert.equal(sent.p_linked_records,mode)
      assert.equal(sent.p_preview_token,body.previewToken)
    }
    for (const [code,message,status] of [['40001','changed',409],['23503','retained history',409],['55000','still being processed',409],['P0002','not found',404]]) {
      rpcError={code,message:'private database detail'}
      const result=await send('delete')
      assert.equal(result.status,status)
      const json=await result.json()
      assert.match(json.error,new RegExp(message,'i'))
      assert.doesNotMatch(json.error,/private database/)
    }
  } finally {globalThis.fetch=oldFetch;console.error=oldError}
})
