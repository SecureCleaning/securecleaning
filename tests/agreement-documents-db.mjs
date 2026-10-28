// Run with PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/agreement-documents-db.mjs
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid primary key,username text,role text,active boolean);
CREATE TABLE contract_product_sales(id uuid primary key,status text,handover_at timestamptz);
CREATE TABLE contract_sale_payment_plans(id uuid primary key,sale_id uuid,status text,updated_at timestamptz);
CREATE TABLE contract_sale_agreements(id uuid primary key,sale_id uuid,status text,version integer,payment_plan_id uuid,agreement_type text, signed_at timestamptz,signed_file_name text,signed_storage_path text,purchase_price_inc_gst_cents_snapshot integer,content_snapshot text,cleaner_name_snapshot text,cleaner_business_snapshot text,cleaner_email_snapshot text);
CREATE TABLE contract_sale_price_amendments(sale_id uuid,transaction_id bigint);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`)
await db.exec(await fs.readFile('supabase/migrations/20261027232911_contract_sale_agreement_documents.sql','utf8'))
await db.exec(await fs.readFile('supabase/migrations/20261028223817_reuse_supporting_agreement_document.sql','utf8'))
await db.exec(`CREATE TRIGGER trg_contract_sale_agreement_snapshot BEFORE UPDATE ON contract_sale_agreements FOR EACH ROW EXECUTE FUNCTION protect_signed_contract_sale_agreement();
CREATE TRIGGER trg_activate_signed_contract_plan BEFORE INSERT OR UPDATE ON contract_sale_agreements FOR EACH ROW EXECUTE FUNCTION activate_signed_contract_plan();`)
const owner='00000000-0000-0000-0000-000000000001',sale='00000000-0000-0000-0000-000000000002',ag='00000000-0000-0000-0000-000000000003',plan='00000000-0000-0000-0000-000000000004',agent='00000000-0000-0000-0000-000000000005'
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'Admin','owner',true),($2,'Agent','agent',true)`,[owner,agent])
await db.query(`INSERT INTO contract_product_sales VALUES($1,'completed',now())`,[sale]); await db.query(`INSERT INTO contract_sale_payment_plans VALUES($1,$2,'completed',now())`,[plan,sale])
await db.query(`INSERT INTO contract_sale_agreements(id,sale_id,status,version,payment_plan_id,agreement_type,signed_at,signed_file_name,signed_storage_path,content_snapshot) VALUES($1,$2,'signed',1,$3,'payment_plan',now(),'wrong.pdf',$4,'Immutable terms')`,[ag,sale,plan,`${sale}/${ag}/wrong.pdf`])
const financial=JSON.stringify((await db.query('select * from contract_sale_payment_plans')).rows)
async function row(){return (await db.query('select * from contract_sale_agreements')).rows[0]}
async function change(action,opts={}){const a=await row();return (await db.query(`select correct_contract_sale_agreement_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,[opts.actor??owner,sale,ag,action,'Correct uploaded file',opts.revision??a.document_revision,a.signed_storage_path,opts.name??'correct.pdf',opts.path??`${sale}/${ag}/correct-${a.document_revision}.pdf`,opts.target??null])).rows[0].id}
await db.exec('SET ROLE service_role')
await assert.rejects(change('replace',{actor:agent}),/Admin access/)
await assert.rejects(db.query(`update contract_sale_agreements set signed_file_name='tamper.pdf'`),/immutable/)
await change('replace'); assert.equal((await row()).signed_file_name,'correct.pdf')
await assert.rejects(change('remove',{revision:0}),/changed/)
const support=await change('support'); await change('remove_support',{target:support}); await assert.rejects(change('remove_support',{target:support}),/already removed/)
await db.exec('update contract_product_sales set handover_at=NULL');
await change('remove'); assert.equal((await row()).status,'sent');assert.equal((await row()).signed_storage_path,null);assert.equal((await row()).document_correction_pending,true)
assert.equal((await db.query("select count(*)::int n from contract_sale_agreements where status='signed'")).rows[0].n,0)
await assert.rejects(db.exec('update contract_product_sales set handover_at=now()'),/removed signed agreement/);
await change('replace');assert.equal((await row()).status,'signed');assert.equal((await row()).document_correction_pending,false)
await db.exec('update contract_product_sales set handover_at=now()');
assert.equal(JSON.stringify((await db.query('select * from contract_sale_payment_plans')).rows),financial)
assert.equal((await row()).content_snapshot,'Immutable terms')
assert.equal((await db.query('select count(*)::int n from contract_sale_agreement_document_events')).rows[0].n,5)
assert.equal((await db.query('select count(*)::int n from admin_audit_log')).rows[0].n,5)
await assert.rejects(db.exec('delete from contract_sale_agreement_document_events'),/permission denied/)
await db.exec('RESET ROLE; SET ROLE anon')
await assert.rejects(db.exec('select * from contract_sale_agreement_document_events'),/permission denied/)
await assert.rejects(db.query(`select correct_contract_sale_agreement_document($1,$2,$3,'remove','reason',5,NULL)`,[owner,sale,ag]),/permission denied/)
await db.exec('RESET ROLE')
await assert.rejects(db.exec('update contract_sale_agreement_document_events set reason=\'tamper\''),/immutable/)
// An audit failure rolls the document pointer and history back together.
await db.exec(`CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$; CREATE TRIGGER fail_test_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION fail_test_audit();`)
const beforeFailure=JSON.stringify(await row())
await assert.rejects(change('replace'),/Synthetic audit failure/)
assert.equal(JSON.stringify(await row()),beforeFailure)
await db.exec('DROP TRIGGER fail_test_audit ON admin_audit_log')
await db.exec("UPDATE contract_sale_payment_plans SET status='active'")
const activePlan=JSON.stringify((await db.query('select * from contract_sale_payment_plans')).rows)
await change('remove'); await change('replace')
assert.equal(JSON.stringify((await db.query('select * from contract_sale_payment_plans')).rows),activePlan)
// Promoting a supporting upload reuses its stored path, not a new upload or caller path.
const reusable=await change('support',{name:'existing.pdf',path:`${sale}/${ag}/existing.pdf`})
await change('remove')
await assert.rejects(change('replace',{target:support}),/already removed/)
await assert.rejects(change('replace',{target:'00000000-0000-0000-0000-000000000099'}),/missing/)
await change('replace',{target:reusable,name:'untrusted.pdf',path:`${sale}/${ag}/untrusted.pdf`})
assert.equal((await row()).signed_storage_path,`${sale}/${ag}/existing.pdf`)
assert.equal((await row()).signed_file_name,'existing.pdf')
assert.equal((await row()).document_correction_pending,false)
assert.equal(JSON.stringify((await db.query('select * from contract_sale_payment_plans')).rows),activePlan)
console.log('PASS: replacement, supporting/removal, restoration, stale revisions, immutable snapshots/history, admin/anon authorization, atomic audit and unchanged completed payment plan.')
await db.close()
