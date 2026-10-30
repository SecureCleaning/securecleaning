import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
if (!process.env.PGLITE_MODULE_PATH) throw new Error('Set PGLITE_MODULE_PATH to test-only PGlite installation.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE admin_staff_accounts(id uuid primary key,active boolean,role text);
 CREATE TABLE contract_product_sales(id uuid primary key);
 CREATE TABLE contract_commission_assignments(sale_id uuid primary key,win_agent_id uuid,sale_agent_id uuid);
 CREATE TABLE contract_commission_claims(id uuid primary key,sale_id uuid,agent_id uuid,amount_cents integer,invoice_reference text,created_at timestamptz default now());
 CREATE TABLE contract_commission_payouts(id uuid primary key,sale_id uuid,agent_id uuid,amount_cents integer,paid_on date,reference text,recorded_by uuid,created_at timestamptz default now());
 CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
 CREATE TABLE earned(sale_id uuid,agent_id uuid,earned_cents bigint);
 CREATE VIEW contract_commission_balances AS SELECT e.*,coalesce((select sum(amount_cents) from contract_commission_claims c where c.sale_id=e.sale_id and c.agent_id=e.agent_id),0) claimed_cents,coalesce((select sum(amount_cents) from contract_commission_payouts p where p.sale_id=e.sale_id and p.agent_id=e.agent_id),0) paid_cents FROM earned e;
 CREATE FUNCTION protect_contract_commission_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END $$;
 INSERT INTO admin_staff_accounts VALUES('${id(1)}',true,'owner'),('${id(2)}',true,'agent'),('${id(3)}',true,'agent');
 INSERT INTO contract_product_sales VALUES('${id(10)}'),('${id(11)}');
 INSERT INTO contract_commission_assignments VALUES('${id(10)}','${id(2)}','${id(2)}'),('${id(11)}','${id(2)}','${id(2)}');
 INSERT INTO earned VALUES('${id(10)}','${id(2)}',10000),('${id(11)}','${id(2)}',5000);
 `)
 await db.exec(readFileSync(new URL('../supabase/migrations/20261030011732_commission_invoice_received.sql',import.meta.url),'utf8'))
 const input={requestId:id(20),agentId:id(2),reference:'INV-1',invoiceDate:'2026-10-30',amountCents:10000,allocations:[{saleId:id(10),amountCents:6000},{saleId:id(11),amountCents:4000}],storagePath:null,contentType:null}
 const save=(actor,body)=>db.query('select record_received_commission_invoice($1,$2)',[actor,JSON.stringify(body)])
 await assert.rejects(save(id(2),input),/Owner/)
 await assert.rejects(save(id(1),{...input,amountCents:9999}),/equal/)
 await assert.rejects(save(id(1),{...input,agentId:id(3)}),/exceeds/)
 await assert.rejects(save(id(1),{...input,amountCents:20000,allocations:[{saleId:id(10),amountCents:5000},{saleId:id(11),amountCents:15000}]}),/exceeds/)
 assert.equal((await db.query('select count(*)::int n from contract_commission_claims')).rows[0].n,0)
 await save(id(1),input); await save(id(1),input)
 assert.equal((await db.query('select count(*)::int n from contract_commission_claims')).rows[0].n,2)
 await assert.rejects(save(id(1),{...input,reference:'different'}),/different/)
 await assert.rejects(save(id(1),{...input,requestId:id(21),reference:' inv-1 '}),/already/)
 await assert.rejects(save(id(1),{...input,requestId:id(22),reference:'INV-2'}),/exceeds/)
 assert.equal((await db.query("select has_function_privilege('anon','record_received_commission_invoice(uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed,false)
 assert.equal((await db.query("select has_table_privilege('authenticated','contract_commission_received_invoices','SELECT') allowed")).rows[0].allowed,false)
 assert.equal((await db.query('select public from storage.buckets')).rows[0].public,false)
 await assert.rejects(db.exec('delete from contract_commission_received_invoices'),/immutable/)
 // Existing payout behavior remains, and an agent cannot resubmit an owner-recorded invoice.
 await assert.rejects(db.query('select manage_contract_commission($1,$2,$3)',[id(2),'claim',JSON.stringify({saleId:id(10),amountCents:100,reference:'INV-1',requestId:id(40)})]),/already recorded/)
 const pay={saleId:id(10),agentId:id(2),amountCents:2500,paidOn:'2026-10-30',reference:'BANK-1',requestId:id(30)}
 await db.query('select manage_contract_commission($1,$2,$3)',[id(1),'payout',JSON.stringify(pay)])
 await db.query('select manage_contract_commission($1,$2,$3)',[id(1),'payout',JSON.stringify(pay)])
 const balance=(await db.query('select * from contract_commission_balances where sale_id=$1',[id(10)])).rows[0]
 assert.equal(Number(balance.paid_cents),2500);assert.equal(Number(balance.claimed_cents),6000)
 await assert.rejects(db.query('select manage_contract_commission($1,$2,$3)',[id(1),'payout',JSON.stringify({...pay,requestId:id(31),amountCents:4000})]),/exceeds/)
 console.log('PASS: invoice authorization, atomic allocations, duplicate/retry protection, private storage, immutable audit records, existing partial-payment and overpayment guards.')
} finally {await db.close()}
