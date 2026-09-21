import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,role text,active boolean);
CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,status text);
CREATE TABLE contract_sale_invoices(id uuid PRIMARY KEY,sale_id uuid,status text,total_inc_gst_cents integer);
CREATE TABLE contract_sale_invoice_templates(id text PRIMARY KEY);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);`)
const migration=readFileSync('supabase/contract_sale_invoice_bank_details_migration.sql','utf8')
await db.exec(migration);await db.exec(migration)
const termsMigration=readFileSync('supabase/contract_sale_invoice_terms_revision_migration.sql','utf8')
await db.exec(termsMigration);await db.exec(termsMigration)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'owner',true),($2,'agent',true);`,[id(1),id(2)])
await db.query(`INSERT INTO contract_product_sales VALUES($1,'draft')`,[id(3)])
await db.query(`INSERT INTO contract_sale_invoices(id,sale_id,status,total_inc_gst_cents) VALUES($1,$2,'issued',190000)`,[id(4),id(3)])
const insert=actor=>db.query(`INSERT INTO contract_sale_invoice_bank_revisions(invoice_id,actor_staff_id,bank_account_name_snapshot,bank_name_snapshot,bank_bsb_snapshot,bank_account_number_snapshot,payment_reference_template_snapshot) VALUES($1,$2,'Example Account','','123-456','12345678','{invoice_number}')`,[id(4),actor])
await assert.rejects(insert(id(2)),/Owner/)
await insert(id(1))
assert.equal((await db.query('SELECT count(*)::int n FROM admin_audit_log')).rows[0].n,1)
assert.equal((await db.query('SELECT payment_terms_snapshot FROM contract_sale_invoice_bank_revisions')).rows[0].payment_terms_snapshot,null)
await db.query(`INSERT INTO contract_sale_invoice_bank_revisions(invoice_id,actor_staff_id,bank_account_name_snapshot,bank_name_snapshot,bank_bsb_snapshot,bank_account_number_snapshot,payment_reference_template_snapshot,payment_terms_snapshot) VALUES($1,$2,'Example Account','','123-456','12345678','{invoice_number}','Updated invoice payment instructions.')`,[id(4),id(1)])
await assert.rejects(db.exec(`UPDATE contract_sale_invoice_bank_revisions SET payment_terms_snapshot='Changed invoice payment instructions.'`),/immutable/)
await insert(id(1))
assert.equal((await db.query('SELECT payment_terms_snapshot FROM contract_sale_invoice_bank_revisions WHERE payment_terms_snapshot IS NOT NULL ORDER BY id DESC LIMIT 1')).rows[0].payment_terms_snapshot,'Updated invoice payment instructions.')
assert.equal((await db.query('SELECT total_inc_gst_cents FROM contract_sale_invoices')).rows[0].total_inc_gst_cents,190000)
await assert.rejects(db.exec(`UPDATE contract_sale_invoice_bank_revisions SET bank_bsb_snapshot='222-222'`),/immutable/)
await assert.rejects(db.exec(`DELETE FROM contract_sale_invoice_bank_revisions`),/immutable/)
await assert.rejects(db.exec(`UPDATE contract_sale_invoices SET bank_bsb_snapshot='222-222'`),/immutable/)
await db.exec('SET ROLE service_role')
await insert(id(1))
await assert.rejects(db.exec('TRUNCATE contract_sale_invoice_bank_revisions'),/permission denied/)
await assert.rejects(db.exec('UPDATE contract_sale_invoice_bank_revisions SET bank_name_snapshot=bank_name_snapshot'),/permission denied/)
await assert.rejects(db.exec('DELETE FROM contract_sale_invoice_bank_revisions'),/permission denied/)
await db.exec('RESET ROLE')
await db.exec(`UPDATE contract_sale_invoices SET status='void'`)
await assert.rejects(insert(id(1)),/current invoice/)
await db.exec(`SET ROLE anon`)
await assert.rejects(db.exec('SELECT * FROM contract_sale_invoice_bank_revisions'),/permission denied/)
await db.exec('RESET ROLE')
await db.close()
console.log('Invoice bank migration: repeatability, owner authorization, immutable history, unchanged amount, audit and RLS passed.')
