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
const migration=readFileSync('supabase/contract_sale_commissions_plans_migration.sql','utf8')
await db.exec(migration);await db.exec(migration)
const base=readFileSync('supabase/contract_sale_tax_invoice_workflow_migration.sql','utf8')
await db.exec(base.slice(base.indexOf('CREATE OR REPLACE FUNCTION confirm_contract_sale_payment('),base.indexOf('CREATE OR REPLACE FUNCTION create_contract_sale_payment_plan(')))
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner=id(1),agent=id(2),winner=id(3),manager=id(4),sale=id(10),product=id(11),invoice=id(12),payment=id(13)
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'owner',true),($2,'agent',true),($3,'agent',true),($4,'manager',true)`,[owner,agent,winner,manager])
await db.query(`INSERT INTO contract_products(id,state) VALUES($1,'NSW');`,[product])
await db.query(`INSERT INTO contract_product_sales(id,sale_code,product_id,status,assigned_staff_id) VALUES($1,'PS-TEST',$2,'draft',$3)`,[sale,product,agent])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','issued',550000,50000,50000,NULL)`,[invoice,sale])
const action=(actor,kind,input)=>db.query('SELECT manage_contract_commission($1,$2,$3::jsonb)',[actor,kind,JSON.stringify(input)])
await assert.rejects(action(agent,'settings',{winBps:1000,saleBps:1000}),/Owner/)
await assert.rejects(action(owner,'settings',{winBps:9000,saleBps:2000}),/check constraint/)
await action(owner,'assign',{saleId:sale,winAgentId:winner,saleAgentId:agent,expectedWinBps:2500,expectedSaleBps:2500})
await action(owner,'settings',{winBps:1000,saleBps:1000})
assert.equal((await db.query('SELECT win_bps FROM contract_commission_assignments')).rows[0].win_bps,2500)
await db.query(`INSERT INTO contract_sale_payments(id,sale_id,intended_invoice_id,amount_cents,status) VALUES($1,$2,$3,55000,'pending')`,[payment,sale,invoice])
const balance=async()=> (await db.query('SELECT * FROM contract_commission_balances WHERE agent_id=$1',[agent])).rows[0]
assert.equal(Number((await balance()).earned_cents),0)
await assert.rejects(db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[payment,invoice,agent,'agent']),/owner or manager/i)
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[payment,invoice,owner,'owner'])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[payment,invoice,owner,'owner'])
assert.equal((await db.query('SELECT count(*)::int n FROM contract_sale_payment_allocations')).rows[0].n,1)
assert.equal(Number((await balance()).earned_cents),0)
const rows=[{sequenceNumber:1,dueOn:'2026-10-01',amountCents:245000},{sequenceNumber:2,dueOn:'2026-11-01',amountCents:250000}]
const createPlan=actor=>db.query('SELECT create_contract_sale_payment_plan($1,$2,$3,$4::jsonb,$5,$6,$7) id',[sale,invoice,'Payment plan for synthetic sale; retains rights until payment in full.',JSON.stringify(rows),actor,'agent','NSW'])
await assert.rejects(createPlan(winner),/Sale not found/)
const plan=(await createPlan(agent)).rows[0].id
assert.equal((await createPlan(agent)).rows[0].id,plan)
assert.equal(Number((await balance()).earned_cents),0)
await db.query(`INSERT INTO contract_sale_agreements(id,sale_id,status,payment_plan_id) VALUES($1,$2,'sent',$3)`,[id(14),sale,plan])
await db.query(`UPDATE contract_sale_agreements SET status='signed' WHERE id=$1`,[id(14)])
assert.equal(Number((await balance()).earned_cents),12500)
assert.equal((await db.query(`SELECT status FROM contract_sale_payment_plans WHERE id=$1`,[plan])).rows[0].status,'active')
await assert.rejects(action(agent,'payout',{saleId:sale,amountCents:100,requestId:id(20)}),/owner/i)
const claim={saleId:sale,amountCents:12500,reference:'AG-1',requestId:id(21)}
await action(agent,'claim',claim);await action(agent,'claim',claim)
await assert.rejects(action(agent,'claim',{...claim,requestId:id(22)}),/exceeds/)
await assert.rejects(action(agent,'claim',{...claim,amountCents:100}),/different/)
const payout={saleId:sale,agentId:agent,amountCents:5000,reference:'BANK-1',paidOn:'2026-10-02',requestId:id(23)}
await action(owner,'payout',payout);await action(owner,'payout',payout)
assert.equal(Number((await balance()).paid_cents),5000)
await assert.rejects(action(owner,'payout',{...payout,amountCents:8000,requestId:id(24)}),/exceeds/)
await action(owner,'payout',{...payout,amountCents:7500,requestId:id(25)})
assert.equal(Number((await balance()).paid_cents),12500)
const replacement=(await createPlan(agent)).rows[0].id
assert.notEqual(replacement,plan)
assert.equal((await db.query('SELECT status FROM contract_sale_payment_plans WHERE id=$1',[plan])).rows[0].status,'active')
assert.equal(Number((await balance()).earned_cents),12500)
await db.query(`INSERT INTO contract_sale_agreements(id,sale_id,status,payment_plan_id) VALUES($1,$2,'sent',$3)`,[id(31),sale,replacement])
await assert.rejects(db.query('UPDATE contract_sale_agreements SET payment_plan_id=$1 WHERE id=$2',[replacement,id(14)]),/immutable/)
await db.query(`UPDATE contract_sale_agreements SET status='signed' WHERE id=$1`,[id(31)])
assert.equal((await db.query('SELECT status FROM contract_sale_payment_plans WHERE id=$1',[plan])).rows[0].status,'cancelled')
assert.equal((await db.query('SELECT status FROM contract_sale_payment_plans WHERE id=$1',[replacement])).rows[0].status,'active')
assert.equal(Number((await balance()).earned_cents),12500)
await db.query(`INSERT INTO contract_sale_payments(id,sale_id,intended_invoice_id,amount_cents,status) VALUES($1,$2,$3,495000,'pending')`,[id(30),sale,invoice])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(30),invoice,owner,'owner'])
assert.equal(Number((await balance()).earned_cents),125000)
// A separate standard sale releases no commission until fully paid; odd cents preserve the combined rate.
await action(owner,'settings',{winBps:2500,saleBps:2500})
await db.query(`INSERT INTO contract_product_sales(id,sale_code,product_id,status,assigned_staff_id) VALUES($1,'PS-STANDARD',$2,'draft',$3)`,[id(40),product,agent])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','issued',550011,50001,50000,NULL)`,[id(41),id(40)])
await action(owner,'assign',{saleId:id(40),winAgentId:winner,saleAgentId:agent,expectedWinBps:2500,expectedSaleBps:2500})
await db.query(`INSERT INTO contract_sale_payments(id,sale_id,intended_invoice_id,amount_cents,status) VALUES($1,$2,$3,550011,'pending')`,[id(42),id(40),id(41)])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(42),id(41),owner,'owner'])
const standard=(await db.query('SELECT sum(earned_cents)::int total FROM contract_commission_balances WHERE sale_id=$1',[id(40)])).rows[0]
assert.equal(standard.total,250005)
// Review regression: another positive receipt must not reduce a beneficiary already invoiced/paid.
await db.query(`INSERT INTO contract_product_sales(id,sale_code,product_id,status,assigned_staff_id) VALUES($1,'PS-ROUNDING',$2,'draft',$3)`,[id(60),product,agent])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','issued',550000,50000,50000,NULL)`,[id(61),id(60)])
await action(owner,'assign',{saleId:id(60),winAgentId:winner,saleAgentId:agent,expectedWinBps:2500,expectedSaleBps:2500})
await db.query(`INSERT INTO contract_sale_payments(id,sale_id,intended_invoice_id,amount_cents,status) VALUES($1,$2,$3,55002,'pending')`,[id(62),id(60),id(61)])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(62),id(61),owner,'owner'])
const edgePlan=(await db.query('SELECT create_contract_sale_payment_plan($1,$2,$3,$4::jsonb,$5,$6,$7) id',[id(60),id(61),'Boundary plan: rights retained until payment in full.',JSON.stringify([{sequenceNumber:1,dueOn:'2026-10-01',amountCents:247499},{sequenceNumber:2,dueOn:'2026-11-01',amountCents:247499}]),agent,'agent','NSW'])).rows[0].id
await db.query(`INSERT INTO contract_sale_agreements(id,sale_id,status,payment_plan_id) VALUES($1,$2,'signed',$3)`,[id(63),id(60),edgePlan])
const edgeBalance=async()=> (await db.query('SELECT * FROM contract_commission_balances WHERE sale_id=$1 ORDER BY agent_id',[id(60)])).rows
const before=await edgeBalance()
assert.equal(Number(before.find(x=>x.agent_id===agent).earned_cents),12500)
assert.equal(Number(before.find(x=>x.agent_id===winner).earned_cents),12501)
await action(agent,'claim',{saleId:id(60),amountCents:12500,reference:'ROUNDING-CLAIM',requestId:id(64)})
await action(owner,'payout',{saleId:id(60),agentId:agent,amountCents:12500,reference:'ROUNDING-PAID',paidOn:'2026-10-02',requestId:id(65)})
await db.query(`INSERT INTO contract_sale_payments(id,sale_id,intended_invoice_id,amount_cents,status) VALUES($1,$2,$3,1,'pending')`,[id(66),id(60),id(61)])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(66),id(61),owner,'owner'])
const after=await edgeBalance()
for(let n=0;n<after.length;n++) { assert.ok(Number(after[n].earned_cents)>=Number(before[n].earned_cents)); assert.ok(Number(after[n].earned_cents)>=Number(after[n].paid_cents)) }
assert.equal(after.reduce((sum,row)=>sum+Number(row.earned_cents),0),25001)
// Same-agent roles aggregate to one beneficiary row, preserving the exact total.
await db.query(`INSERT INTO contract_product_sales(id,sale_code,product_id,status,assigned_staff_id) VALUES($1,'PS-SAME-AGENT',$2,'draft',$3)`,[id(70),product,agent])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','issued',550011,50001,50000,NULL)`,[id(71),id(70)])
await action(owner,'assign',{saleId:id(70),winAgentId:agent,saleAgentId:agent,expectedWinBps:2500,expectedSaleBps:2500})
await db.query(`INSERT INTO contract_sale_payments(id,sale_id,intended_invoice_id,amount_cents,status) VALUES($1,$2,$3,550011,'pending')`,[id(72),id(70),id(71)])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(72),id(71),owner,'owner'])
const same=(await db.query('SELECT * FROM contract_commission_balances WHERE sale_id=$1',[id(70)])).rows
assert.equal(same.length,1);assert.equal(Number(same[0].earned_cents),250005)
await db.query(`UPDATE contract_product_sales SET status='cancelled' WHERE id=$1`,[id(60)])
await assert.rejects(db.query(`INSERT INTO contract_sale_agreements(id,sale_id,status,payment_plan_id) VALUES($1,$2,'signed',$3)`,[id(80),id(60),edgePlan]),/Cancelled sale/)
await db.exec('SET ROLE anon')
await assert.rejects(db.query('SELECT * FROM contract_commission_balances'),/permission denied/)
await assert.rejects(action(owner,'settings',{winBps:1,saleBps:1}),/permission denied/)
await db.exec('RESET ROLE')
console.log('PASS: repeatable migration, defaults/snapshots, agent plan approval, signed activation, confirmed allocations, rounding, claims, replay protection, partial payouts, full payment and anonymous denial.')
await db.close()
