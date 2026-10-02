import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,role text,active boolean);
CREATE TABLE contract_products(id uuid PRIMARY KEY,state text,status text,sold_at timestamptz,updated_at timestamptz);
CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,sale_code text,product_id uuid,status text,assigned_staff_id uuid,handover_at timestamptz,updated_by_staff_id uuid,updated_at timestamptz);
CREATE TABLE contract_sale_invoices(id uuid PRIMARY KEY,sale_id uuid,invoice_type text,status text,total_inc_gst_cents integer,gst_component_cents integer,deposit_required_inc_gst_cents integer,updated_at timestamptz);
CREATE TABLE contract_sale_payments(id uuid PRIMARY KEY,sale_id uuid,intended_invoice_id uuid,amount_cents integer,status text,confirmed_by_staff_id uuid,confirmed_at timestamptz,updated_at timestamptz);
CREATE TABLE contract_sale_payment_allocations(sale_id uuid,payment_id uuid,invoice_id uuid,amount_cents integer,PRIMARY KEY(payment_id,invoice_id));
CREATE TABLE contract_sale_payment_plans(id uuid PRIMARY KEY,sale_id uuid,balance_invoice_id uuid,version integer,status text DEFAULT 'active' CHECK(status IN ('active','completed','cancelled','defaulted')),terms_snapshot text,approved_by_staff_id uuid,updated_at timestamptz,UNIQUE(sale_id,version));
CREATE UNIQUE INDEX idx_contract_sale_payment_plans_one_active ON contract_sale_payment_plans(sale_id) WHERE status='active';
CREATE TABLE contract_sale_payment_plan_instalments(payment_plan_id uuid,sequence_number integer,due_on date,amount_cents integer CHECK(amount_cents>0),UNIQUE(payment_plan_id,sequence_number));
CREATE TABLE contract_sale_agreements(id uuid PRIMARY KEY,sale_id uuid,status text);
CREATE TABLE admin_audit_log(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_ref text,action text,details jsonb);
`)

await db.exec(readFileSync('supabase/contract_sale_commissions_plans_migration.sql','utf8'))
await db.exec(`ALTER TABLE admin_staff_accounts ADD COLUMN availability_assignee_id text;
CREATE TABLE quotes(id uuid PRIMARY KEY,final_quote_sent_by jsonb,final_quote_sent_at timestamptz);
ALTER TABLE contract_product_sales ADD COLUMN source_quote_id uuid, ADD COLUMN created_by_staff_id uuid;`)
await db.exec(readFileSync('supabase/contract_sale_automatic_commission_assignment_migration.sql','utf8'))
const migration = readFileSync('supabase/migrations/20261002045410_commission_rate_revisions.sql','utf8')
await db.exec(migration); await db.exec(migration)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner=id(1),winner=id(2),seller=id(3),manager=id(4),sale=id(10),invoice=id(11)
await db.query(`INSERT INTO admin_staff_accounts(id,role,active) VALUES($1,'owner',true),($2,'agent',true),($3,'agent',true),($4,'manager',true)`,[owner,winner,seller,manager])
await db.query(`INSERT INTO contract_product_sales(id,sale_code,status) VALUES($1,'PS-REVISE','completed')`,[sale])
await db.query(`INSERT INTO contract_sale_invoices(id,sale_id,status,total_inc_gst_cents,gst_component_cents) VALUES($1,$2,'paid',190000,17273)`,[invoice,sale])
await db.query(`INSERT INTO contract_sale_payment_allocations VALUES($1,$2,$3,190000)`,[sale,id(12),invoice])
const action=(actor,kind,input)=>db.query('SELECT manage_contract_commission($1,$2,$3::jsonb)',[actor,kind,JSON.stringify(input)])
await action(owner,'assign',{saleId:sale,winAgentId:winner,saleAgentId:seller,expectedWinBps:2500,expectedSaleBps:2500})
const preview=async(w=2000,s=2000,actor=owner)=>(await db.query('SELECT preview_contract_commission_revision($1,$2,$3,$4) p',[actor,sale,w,s])).rows[0].p
const revise=(p,req=id(20),actor=owner,reason='Agreed rate correction')=>db.query('SELECT revise_contract_commission($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,p.winBps,p.saleBps,reason,req,JSON.stringify(p)])
let p=await preview()
assert.equal(p.before.reduce((sum,b)=>sum+Number(b.earned_cents),0),86364)
assert.equal(p.after.reduce((sum,b)=>sum+Number(b.earned_cents),0),69091)
assert.equal((await db.query('SELECT win_bps FROM contract_commission_assignments')).rows[0].win_bps,2500,'preview is read-only')
for (const actor of [winner,manager,id(99)]) await assert.rejects(preview(2000,2000,actor),/Owner access/)
await assert.rejects(preview(9000,2000),/Invalid commission/)
await assert.rejects(preview(-1,2000),/Invalid commission/)
await assert.rejects(revise(p,id(20),winner),/Owner access/)
await assert.rejects(revise(p,id(20),owner,''),/reason/)
await revise(p); await revise(p)
assert.equal((await db.query('SELECT count(*)::int n FROM contract_commission_revisions')).rows[0].n,1)
assert.deepEqual((await db.query('SELECT * FROM contract_commission_balances ORDER BY agent_id')).rows,p.after)
await assert.rejects(revise({...p,winBps:3000},id(20)),/different details/)
await assert.rejects(revise(p,id(21)),/changed/)
await assert.rejects(db.query('UPDATE contract_commission_assignments SET win_bps=1000'),/immutable outside/)
await assert.rejects(db.query('DELETE FROM contract_commission_revisions'),/immutable/)
await action(winner,'claim',{saleId:sale,amountCents:30000,reference:'INV-1',requestId:id(30)})
await action(owner,'payout',{saleId:sale,agentId:winner,amountCents:25000,reference:'BANK-1',paidOn:'2026-10-02',requestId:id(31)})
p=await preview(1000,1000)
const oldClaims=(await db.query('SELECT * FROM contract_commission_claims')).rows
const oldPayments=(await db.query('SELECT * FROM contract_commission_payouts')).rows
await revise(p,id(32))
assert.deepEqual((await db.query('SELECT * FROM contract_commission_balances ORDER BY agent_id')).rows,p.after)
assert.deepEqual((await db.query('SELECT * FROM contract_commission_claims')).rows,oldClaims)
assert.deepEqual((await db.query('SELECT * FROM contract_commission_payouts')).rows,oldPayments)
const adjusted=p.after.find(b=>b.agent_id===winner)
assert.ok(adjusted.paid_cents>adjusted.earned_cents)
await assert.rejects(action(owner,'payout',{saleId:sale,agentId:winner,amountCents:1,reference:'EXCESS',paidOn:'2026-10-02',requestId:id(33)}),/exceeds/)
p=await preview(3000,3000)
await action(seller,'claim',{saleId:sale,amountCents:1,reference:'INV-2',requestId:id(34)})
await assert.rejects(revise(p,id(35)),/changed/)
// Receipt change invalidates a preview, including payment-plan eligibility.
p=await preview(3000,3000)
await db.query('UPDATE contract_sale_payment_allocations SET amount_cents=50000 WHERE invoice_id=$1',[invoice])
await assert.rejects(revise(p,id(36)),/changed/)
p=await preview(3000,3000)
assert.equal(p.after.reduce((sum,b)=>sum+Number(b.earned_cents),0),0)
await db.query(`INSERT INTO contract_sale_payment_plans(id,sale_id,status) VALUES($1,$2,'active')`,[id(40),sale])
await db.query(`INSERT INTO contract_sale_agreements(id,sale_id,status,payment_plan_id) VALUES($1,$2,'signed',$3)`,[id(41),sale,id(40)])
await assert.rejects(revise(p,id(42)),/changed/)
p=await preview(3000,3000); await revise(p,id(43))
assert.deepEqual((await db.query('SELECT * FROM contract_commission_balances ORDER BY agent_id')).rows,p.after)
assert.ok(p.after.reduce((sum,b)=>sum+Number(b.earned_cents),0)>0)
p=await preview(0,0);await revise(p,id(44))
assert.equal(p.after.reduce((sum,b)=>sum+Number(b.earned_cents),0),0)
// Same agent receives both shares, including cent rounding.
const same=id(50)
await db.query(`INSERT INTO contract_product_sales(id,sale_code,status) VALUES($1,'PS-SAME','completed')`,[same])
await db.query(`INSERT INTO contract_sale_invoices(id,sale_id,status,total_inc_gst_cents,gst_component_cents) VALUES($1,$2,'paid',1001,91)`,[id(51),same])
await db.query(`INSERT INTO contract_sale_payment_allocations VALUES($1,$2,$3,1001)`,[same,id(52),id(51)])
await action(owner,'assign',{saleId:same,winAgentId:winner,saleAgentId:winner,expectedWinBps:2500,expectedSaleBps:2500})
const combined=(await db.query('SELECT preview_contract_commission_revision($1,$2,1234,2345) p',[owner,same])).rows[0].p
assert.equal(combined.after.length,1)
await db.query('SELECT revise_contract_commission($1,$2,1234,2345,$3,$4,$5::jsonb)',[owner,same,'Same agent',id(53),JSON.stringify(combined)])
assert.deepEqual((await db.query('SELECT * FROM contract_commission_balances WHERE sale_id=$1',[same])).rows,combined.after)
await db.query(`UPDATE contract_product_sales SET status='cancelled' WHERE id=$1`,[sale])
await assert.rejects(preview(),/Active sale/)
for (const role of ['anon','authenticated']) {
 const acl=(await db.query(`SELECT has_function_privilege($1,'revise_contract_commission(uuid,uuid,integer,integer,text,uuid,jsonb)','EXECUTE') allowed, has_table_privilege($1,'contract_commission_revisions','SELECT') readable`,[role])).rows[0]
 assert.equal(acl.allowed,false);assert.equal(acl.readable,false)
}
assert.equal((await db.query(`SELECT relrowsecurity rls FROM pg_class WHERE oid='contract_commission_revisions'::regclass`)).rows[0].rls,true)
await db.exec(`GRANT SELECT,UPDATE ON contract_product_sales,contract_commission_assignments TO service_role;
GRANT SELECT ON admin_staff_accounts,contract_commission_balances,contract_sale_invoices,contract_sale_payment_allocations,contract_sale_payment_plans,contract_sale_agreements,contract_commission_claims,contract_commission_payouts TO service_role;
GRANT INSERT ON admin_audit_log TO service_role;
SET ROLE service_role;`)
const servicePreview=(await db.query('SELECT preview_contract_commission_revision($1,$2,1000,1000) p',[owner,same])).rows[0].p
await db.query('SELECT revise_contract_commission($1,$2,1000,1000,$3,$4,$5::jsonb)',[owner,same,'Service-role execution',id(60),JSON.stringify(servicePreview)])
await db.exec('RESET ROLE; SET ROLE anon;')
await assert.rejects(db.query('SELECT preview_contract_commission_revision($1,$2,1000,1000)',[owner,same]),/permission denied/)
await db.exec('RESET ROLE;')
const atomicPreview=(await db.query('SELECT preview_contract_commission_revision($1,$2,2000,2000) p',[owner,same])).rows[0].p
const countBefore=(await db.query('SELECT count(*)::int n FROM contract_commission_revisions')).rows[0].n
await db.exec(`ALTER TABLE admin_audit_log ADD CONSTRAINT reject_test_revision CHECK(details->>'reason' IS DISTINCT FROM 'fail atomic');`)
await assert.rejects(db.query('SELECT revise_contract_commission($1,$2,2000,2000,$3,$4,$5::jsonb)',[owner,same,'fail atomic',id(61),JSON.stringify(atomicPreview)]),/reject_test_revision/)
assert.equal((await db.query('SELECT win_bps FROM contract_commission_assignments WHERE sale_id=$1',[same])).rows[0].win_bps,1000)
assert.equal((await db.query('SELECT count(*)::int n FROM contract_commission_revisions')).rows[0].n,countBefore)
console.log('PASS: revisions preview exactly, owner-only, immutable history, replay/stale protection, paid/invoiced adjustments, zero rates, same agent, plan receipts and ACL.')
await db.close()
