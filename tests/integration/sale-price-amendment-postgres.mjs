import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const read = name => readFileSync(`supabase/${name}`, 'utf8')
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,role text,active boolean);
CREATE TABLE contract_products(id uuid PRIMARY KEY,state text,status text,sold_at timestamptz,updated_at timestamptz);
CREATE FUNCTION agent_can_access_product_state(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE cleaners(id uuid PRIMARY KEY,contact_name text,business_name text,email text);
CREATE TABLE crm_opportunities(id uuid PRIMARY KEY); CREATE TABLE quotes(id uuid PRIMARY KEY); CREATE TABLE sites(id uuid PRIMARY KEY);
CREATE TABLE admin_audit_log(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_ref text,action text,details jsonb);
CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid,bucket_id text); CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
`)
for (const file of ['contract_product_sales_migration.sql','contract_sale_tax_invoice_workflow_migration.sql','contract_sale_document_bundle_workflow_migration.sql','contract_sale_invoice_preview_history_migration.sql','contract_sale_commissions_plans_migration.sql']) await db.exec(read(file))
await db.exec(`ALTER TABLE contract_product_sales ADD COLUMN deleted_source_quote_ref text;`)
// Use the actual current replacement-plan routine (not a mocked schedule validator).
const stateMigration = read('migrations/20261020071815_state_agent_product_access.sql')
await db.exec(stateMigration.slice(stateMigration.indexOf('CREATE OR REPLACE FUNCTION public.create_contract_sale_payment_plan'), stateMigration.indexOf('CREATE OR REPLACE FUNCTION', stateMigration.indexOf('CREATE OR REPLACE FUNCTION public.create_contract_sale_payment_plan') + 1)))
await db.exec(read('migrations/20261023072449_contract_sale_price_amendments.sql'))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner=id(1), agent=id(2), manager=id(3), cleaner=id(4), product=id(5), opp=id(6), quote=id(7), sale=id(10), invoice=id(11), agreement=id(12), plan=id(13)
await db.query("INSERT INTO admin_staff_accounts VALUES($1,'owner',true),($2,'agent',true),($3,'manager',true)",[owner,agent,manager])
await db.query("INSERT INTO cleaners VALUES($1,'Test Cleaner','Test Cleaning','cleaner@example.invalid')",[cleaner])
await db.query("INSERT INTO contract_products(id,state,status) VALUES($1,'NSW','reserved')",[product])
await db.query('INSERT INTO crm_opportunities VALUES($1)',[opp]); await db.query('INSERT INTO quotes VALUES($1)',[quote])
await db.query(`INSERT INTO contract_product_sales(id,sale_code,product_id,cleaner_id,opportunity_id,source_quote_id,agreed_purchase_price_inc_gst_cents,product_snapshot,cleaner_snapshot,client_snapshot,created_by_staff_id,updated_by_staff_id,price_finalised_at) VALUES($1,'PS-TEST',$2,$3,$4,$5,300000,'{}','{}','{}',$6,$6,now())`,[sale,product,cleaner,opp,quote,owner])
await db.query(`INSERT INTO contract_sale_invoices(id,idempotency_key,sale_id,invoice_type,deposit_required_inc_gst_cents,description_snapshot,total_inc_gst_cents,gst_component_cents,payment_terms_snapshot,recipient_name_snapshot,recipient_business_snapshot,recipient_email_snapshot,sender_name_snapshot,sender_email_snapshot,issued_by_staff_id) VALUES($1,$2,$3,'sale',50000,'Site purchase',300000,27273,'Original terms','Test Cleaner','Test Cleaning','cleaner@example.invalid','Owner','owner@example.invalid',$4)`,[invoice,id(90),sale,owner])
await db.query(`INSERT INTO contract_sale_payments(id,idempotency_key,sale_id,intended_invoice_id,amount_cents,received_on,payment_method,payment_reference,recorded_by_staff_id) VALUES($1,$1,$2,$3,50000,'2026-10-23','bank_transfer','Test payment',$4)`,[id(14),sale,invoice,owner])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(14),invoice,owner,'owner'])
const schedule = [{sequenceNumber:1,dueOn:'2026-11-23',amountCents:100000},{sequenceNumber:2,dueOn:'2026-12-23',amountCents:150000}]
const terms = 'Test payment plan terms for the remaining amount, subject to acceptance.'
const oldPlan=(await db.query('SELECT create_contract_sale_payment_plan($1,$2,$3,$4,$5,$6,NULL) id',[sale,invoice,terms,JSON.stringify(schedule),owner,'owner'])).rows[0].id
await db.query(`INSERT INTO contract_sale_agreements(id,sale_id,version,agreement_type,payment_plan_id,status,content_snapshot,cleaner_name_snapshot,cleaner_business_snapshot,cleaner_email_snapshot,created_by_staff_id) VALUES($1,$2,1,'payment_plan',$3,'draft','Original agreement','Test Cleaner','Test Cleaning','cleaner@example.invalid',$4)`,[agreement,sale,oldPlan,owner])
await db.query("UPDATE contract_sale_agreements SET status='signed',signed_at=now(),signed_file_name='original.pdf',signed_storage_path='archive/original.pdf' WHERE id=$1",[agreement])
const before=(await db.query('SELECT * FROM contract_sale_invoices WHERE id=$1',[invoice])).rows[0]
const receipts=JSON.stringify((await db.query('SELECT * FROM contract_sale_payment_allocations')).rows)
const revised=[{sequenceNumber:1,dueOn:'2026-11-24',amountCents:90000},{sequenceNumber:2,dueOn:'2026-12-24',amountCents:110000}]
const call=({actor=owner,request=id(20),expected=300000,paid=50000,price=250000,rows=revised,expectedPlan=oldPlan,reason='Agreed price correction'}={})=>db.query('SELECT amend_contract_sale_price($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id',[actor,sale,request,expected,paid,price,reason,rows===null?null:JSON.stringify(rows),terms,'Revised purchase agreement with new price and terms. '.repeat(5),expectedPlan])
await assert.rejects(call({actor:agent}),/Only the owner/)
await assert.rejects(call({actor:manager}),/Only the owner/)
await assert.rejects(call({expected:290000}),/price changed/)
await assert.rejects(call({paid:0}),/Payments changed/)
await assert.rejects(call({price:50000}),/greater than the deposit/)
await assert.rejects(call({rows:[]}),/instalment schedule/)
assert.equal((await db.query('SELECT count(*)::int n FROM contract_sale_price_amendments')).rows[0].n,0)
assert.equal((await db.query('SELECT status FROM contract_sale_agreements WHERE id=$1',[agreement])).rows[0].status,'signed')
await assert.rejects(call({expectedPlan:null}),/Payment plan changed/)
await call(); await call() // exact replay is idempotent
const after=(await db.query('SELECT * FROM contract_sale_invoices WHERE id=$1',[invoice])).rows[0]
assert.equal(after.invoice_number,before.invoice_number);assert.equal(after.id,before.id)
assert.equal(after.total_inc_gst_cents,250000);assert.equal(after.gst_component_cents,22727);assert.equal(after.revision_number,2);assert.equal(after.delivery_status,'pending')
assert.equal(JSON.stringify((await db.query('SELECT * FROM contract_sale_payment_allocations')).rows),receipts)
assert.equal((await db.query('SELECT status FROM contract_sale_payments')).rows[0].status,'confirmed')
const oldAgreement=(await db.query('SELECT * FROM contract_sale_agreements WHERE id=$1',[agreement])).rows[0]
assert.equal(oldAgreement.status,'void');assert.equal(oldAgreement.content_snapshot,'Original agreement');assert.equal(oldAgreement.signed_storage_path,'archive/original.pdf')
const latest=(await db.query('SELECT * FROM contract_sale_agreements ORDER BY version DESC LIMIT 1')).rows[0]
assert.equal(latest.status,'draft');assert.equal(latest.version,2)
const currentPlan=(await db.query('SELECT * FROM contract_sale_payment_plans WHERE id=$1',[latest.payment_plan_id])).rows[0]
assert.equal(currentPlan.status,'awaiting_acceptance');assert.equal(currentPlan.opening_paid_cents,50000)
assert.equal((await db.query('SELECT status FROM contract_sale_payment_plans WHERE id=$1',[oldPlan])).rows[0].status,'cancelled')
assert.equal((await db.query('SELECT invoice_before FROM contract_sale_price_amendments')).rows[0].invoice_before.total_inc_gst_cents,300000)
await assert.rejects(call({price:240000}),/already used/)
// Direct updates remain locked outside the amendment transaction.
await assert.rejects(db.query('UPDATE contract_product_sales SET agreed_purchase_price_inc_gst_cents=270000 WHERE id=$1',[sale]),/cannot change/)
await assert.rejects(db.query('UPDATE contract_sale_invoices SET total_inc_gst_cents=270000 WHERE id=$1',[invoice]),/immutable/)
await assert.rejects(db.query('UPDATE contract_sale_invoices SET revision_number=20 WHERE id=$1',[invoice]),/immutable/)
await assert.rejects(db.query('UPDATE contract_product_sales SET cleaner_id=$1 WHERE id=$2',[owner,sale]),/immutable/)
await assert.rejects(db.exec("UPDATE contract_sale_price_amendments SET reason='changed'"),/immutable/)
await assert.rejects(db.query("UPDATE contract_sale_agreements SET signed_storage_path='changed' WHERE id=$1",[agreement]),/immutable/)
await assert.rejects(db.query(`INSERT INTO contract_sale_agreements(sale_id,version,content_snapshot,cleaner_name_snapshot,cleaner_business_snapshot,cleaner_email_snapshot,created_by_staff_id,purchase_price_inc_gst_cents_snapshot) VALUES($1,3,'Stale agreement','Test','Test','test@example.invalid',$2,300000)`,[sale,owner]),/price changed/)
const reserveEmail=revision=>db.query(`INSERT INTO contract_sale_invoice_email_deliveries(invoice_id,sale_id,delivery_kind,recipient_email_snapshot,reply_to_email_snapshot,subject_snapshot,html_snapshot,sent_by_staff_id,sender_name_snapshot,sender_email_snapshot,invoice_revision) VALUES($1,$2,'invoice_only','test@example.invalid','owner@example.invalid','Test','Test',$3,'Owner','owner@example.invalid',$4) RETURNING id`,[invoice,sale,owner,revision])
await assert.rejects(reserveEmail(1),/revision changed/)
const delivery=(await reserveEmail(2)).rows[0].id
await assert.rejects(call({request:id(22),expected:250000,price:260000,expectedPlan:currentPlan.id}),/email is in progress/)
await assert.rejects(db.query('UPDATE contract_sale_invoice_email_deliveries SET invoice_revision=3 WHERE id=$1',[delivery]),/immutable/)
await db.query("UPDATE contract_sale_invoice_email_deliveries SET delivery_status='failed' WHERE id=$1",[delivery])
// A single final instalment, and a price increase, are valid and atomic.
await db.exec('BEGIN')
await call({request:id(23),expected:250000,price:260000,expectedPlan:currentPlan.id,rows:[{sequenceNumber:1,dueOn:'2026-12-24',amountCents:210000}]})
assert.equal((await db.query('SELECT total_inc_gst_cents FROM contract_sale_invoices WHERE id=$1',[invoice])).rows[0].total_inc_gst_cents,260000)
await db.exec('ROLLBACK')
// No-plan sales can also be amended without inventing a schedule.
await db.exec('BEGIN')
await db.query("UPDATE contract_sale_payment_plans SET status='cancelled' WHERE sale_id=$1",[sale])
await call({request:id(24),expected:250000,price:240000,expectedPlan:null,rows:null})
assert.equal((await db.query('SELECT agreement_type FROM contract_sale_agreements ORDER BY version DESC LIMIT 1')).rows[0].agreement_type,'standard')
await db.exec('ROLLBACK')
// Preserve newly confirmed receipts when the amended price exactly settles the balance.
await db.exec('BEGIN')
await db.query(`INSERT INTO contract_sale_payments(id,idempotency_key,sale_id,intended_invoice_id,amount_cents,received_on,payment_method,payment_reference,recorded_by_staff_id) VALUES($1,$1,$2,$3,100000,'2026-10-23','bank_transfer','Extra test payment',$4)`,[id(25),sale,invoice,owner])
await db.query('SELECT confirm_contract_sale_payment($1,$2,$3,$4)',[id(25),invoice,owner,'owner'])
await db.exec('SAVEPOINT below_paid')
await assert.rejects(call({request:id(26),expected:250000,paid:150000,price:140000,expectedPlan:currentPlan.id}),/below confirmed/)
await db.exec('ROLLBACK TO SAVEPOINT below_paid')
await call({request:id(26),expected:250000,paid:150000,price:150000,expectedPlan:currentPlan.id,rows:null})
assert.equal((await db.query('SELECT status FROM contract_sale_invoices WHERE id=$1',[invoice])).rows[0].status,'paid')
await db.exec('ROLLBACK')
// Existing quote-deletion override is retained in the source guard.
await db.exec('BEGIN');await db.query("SELECT set_config('app.deleting_quote_id',$1,true)",[quote]);
await db.query("ALTER TABLE contract_product_sales ALTER COLUMN source_quote_id DROP NOT NULL")
await db.query("UPDATE contract_product_sales SET source_quote_id=NULL,deleted_source_quote_ref='Q-ARCHIVE' WHERE id=$1",[sale]);await db.exec('ROLLBACK')
// Replacement acceptance activates only the revised schedule.
await db.query("UPDATE contract_sale_agreements SET status='signed',signed_at=now() WHERE id=$1",[latest.id])
assert.equal((await db.query('SELECT status FROM contract_sale_payment_plans WHERE id=$1',[currentPlan.id])).rows[0].status,'active')
await db.query('INSERT INTO contract_commission_assignments VALUES($1,$2,$2,2500,2500,$3,now())',[sale,agent,owner])
await db.query("INSERT INTO contract_commission_claims VALUES($1,$2,$3,1000,'TEST-CLAIM',now())",[id(50),sale,agent])
await assert.rejects(call({request:id(21),expected:250000,price:260000}),/Commission has already/)
await db.exec('SET ROLE service_role')
await assert.rejects(db.exec('DELETE FROM contract_sale_price_amendments'),/permission denied/)
await assert.rejects(db.exec('INSERT INTO contract_sale_price_amendments DEFAULT VALUES'),/permission denied/)
await db.exec('RESET ROLE; SET ROLE anon')
await assert.rejects(call(),/permission denied/)
await assert.rejects(db.exec('SELECT * FROM contract_sale_price_amendments'),/permission denied/)
await db.exec('RESET ROLE')
console.log('PASS: price amendment, exact replay, atomic schedule rollback, owner authorization, stale reads, preserved receipts/number/history, signed supersession and reacceptance, immutable guards, quote deletion compatibility, commission claim block, ACLs.')
await db.close()
