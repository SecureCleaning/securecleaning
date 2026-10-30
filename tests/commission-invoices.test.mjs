import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCommissionInvoice, invoiceFileType } from '../src/lib/commissionInvoiceInput.ts'
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const valid={agentId:id(1),requestId:id(2),reference:' INV-1 ',invoiceDate:'2026-10-30',amountCents:300,allocations:[{saleId:id(4),amountCents:200},{saleId:id(3),amountCents:100}]}
test('received invoice validates dates, exact allocations and unique sales',()=>{
 const input=validateCommissionInvoice(valid)
 assert.equal(input.reference,'INV-1');assert.equal(input.allocations[0].saleId,id(3))
 for(const bad of [{invoiceDate:'2026-02-30'},{amountCents:301},{agentId:'bad'},{reference:' '},{allocations:[]},{allocations:[{saleId:id(3),amountCents:150},{saleId:id(3),amountCents:150}]},{allocations:[{saleId:id(3),amountCents:-1}]}]) assert.throws(()=>validateCommissionInvoice({...valid,...bad}))
})
test('invoice attachment signatures reject active HTML and SVG despite extension',()=>{
 assert.equal(invoiceFileType(Buffer.from('%PDF-1.7')).type,'application/pdf')
 assert.equal(invoiceFileType(Buffer.from([137,80,78,71,13,10,26,10])).type,'image/png')
 assert.equal(invoiceFileType(Buffer.from([255,216,255,224])).type,'image/jpeg')
 for(const value of ['<svg></svg>','<html>invoice</html>','not a pdf','']) assert.throws(()=>invoiceFileType(Buffer.from(value)))
})
test('received invoice server blocks nonowners before processing uploads',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';process.env.SUPABASE_SERVICE_ROLE_KEY='test'
 const { receiveCommissionInvoice }=await import('../src/lib/commissionInvoices.ts')
 for(const role of ['agent','manager']) await assert.rejects(receiveCommissionInvoice({id:id(1),role},new FormData()),/Only the owner/)
})
test('invoice attachment download is scoped to the agent before accessing private storage',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';process.env.SUPABASE_SERVICE_ROLE_KEY='test'
 const { downloadCommissionInvoice }=await import('../src/lib/commissionInvoices.ts')
 const original=globalThis.fetch;let calls=0
 globalThis.fetch=async url=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('agent_id'),`eq.${id(1)}`);assert.ok(u.pathname.endsWith('/contract_commission_received_invoices'));return new Response('null',{headers:{'Content-Type':'application/json'}})}
 try {await assert.rejects(downloadCommissionInvoice({id:id(1),role:'agent'},id(2)),/not found/);assert.equal(calls,1);await assert.rejects(downloadCommissionInvoice({id:id(1),role:'manager'},id(2)),/access required/);assert.equal(calls,1)} finally {globalThis.fetch=original}
})

test('owner upload uses private content-addressed storage and passes only validated receipt fields',async()=>{
 const { receiveCommissionInvoice }=await import('../src/lib/commissionInvoices.ts')
 const original=globalThis.fetch;let uploaded=false;let recorded=false
 globalThis.fetch=async (url,options)=>{
   const u=new URL(url)
   if(u.pathname.includes('/storage/v1/object/commission-invoices/')) {
     assert.ok(u.pathname.includes(`/${id(1)}/${id(2)}/`));assert.ok(u.pathname.endsWith('.pdf'));assert.equal(options.method,'POST');uploaded=true
     return new Response(JSON.stringify({Key:'private-file'}),{headers:{'Content-Type':'application/json'}})
   }
   assert.ok(u.pathname.endsWith('/rpc/record_received_commission_invoice'))
   const body=JSON.parse(options.body)
   assert.equal(body.p_actor_id,id(9));assert.equal(body.p_input.reference,'INV-1');assert.equal(body.p_input.contentType,'application/pdf');assert.equal(body.p_input.paid,undefined)
   assert.match(body.p_input.storagePath,/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9]{64}\.pdf$/);recorded=true
   return new Response(JSON.stringify(id(2)),{headers:{'Content-Type':'application/json'}})
 }
 try {
   const form=new FormData();form.set('invoice',JSON.stringify({...valid,paid:true,storagePath:'other-user/secret'}));form.set('file',new File(['%PDF-1.7\nfixture'],'invoice.pdf',{type:'application/pdf'}))
   assert.equal(await receiveCommissionInvoice({id:id(9),role:'owner'},form),id(2));assert.equal(uploaded,true);assert.equal(recorded,true)
 } finally {globalThis.fetch=original}
})
