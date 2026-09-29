import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,role text,active boolean,email text);
CREATE TABLE cleaners(id uuid PRIMARY KEY,email text);
CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,cleaner_id uuid,status text,assigned_staff_id uuid,created_by_staff_id uuid);
CREATE TABLE contract_sale_invoices(id uuid PRIMARY KEY,sale_id uuid,invoice_type text,delivery_status text,recipient_email_snapshot text,issued_at timestamptz);
CREATE TABLE admin_audit_log(id uuid DEFAULT gen_random_uuid(),entity_type text,entity_ref text,action text,details jsonb);
`)
const migration = readFileSync('supabase/contract_sale_first_invoice_cleaner_profile_migration.sql', 'utf8')
await db.exec(migration)
await db.exec(migration)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner = id(1), creator = id(2), otherAgent = id(3), cleaner = id(10), sale = id(20), invoice = id(30)
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'owner',true,'owner@example.test'),($2,'agent',true,'creator@example.test'),($3,'agent',true,'other@example.test')`, [owner, creator, otherAgent])
await db.query(`INSERT INTO cleaners VALUES($1,'cleaner@example.test')`, [cleaner])
await db.query(`INSERT INTO contract_product_sales VALUES($1,$2,'deposit_due',$3,$3)`, [sale, cleaner, creator])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','sent','cleaner@example.test','2026-09-29T00:00:00Z')`, [invoice, sale])
const reserve = (actor, saleId, invoiceId, cleanerId = cleaner) => db.query(`SELECT reserve_contract_sale_cleaner_profile_request($1,$2,$3,$4,'Subject','Body','<p>Body</p>',NULL,'<div>Body</div>') request_id`, [cleanerId, saleId, invoiceId, actor])
const reserved = (await reserve(owner, sale, invoice)).rows[0].request_id
assert.ok(reserved)
const row = (await db.query('SELECT * FROM contract_sale_cleaner_profile_requests WHERE id=$1', [reserved])).rows[0]
assert.equal(row.copied_agent_id, creator)
assert.equal(row.copied_email_snapshot, 'creator@example.test')
assert.equal((await reserve(owner, sale, invoice)).rows[0].request_id, null)

const laterSale = id(21), laterInvoice = id(31)
await db.query(`INSERT INTO contract_product_sales VALUES($1,$2,'deposit_due',$3,$3)`, [laterSale, cleaner, creator])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','sent','cleaner@example.test','2026-09-30T00:00:00Z')`, [laterInvoice, laterSale])
assert.equal((await reserve(owner, laterSale, laterInvoice)).rows[0].request_id, null)

const cleaner2 = id(11), sale2 = id(22), invoice2 = id(32)
await db.query(`INSERT INTO cleaners VALUES($1,'second@example.test')`, [cleaner2])
await db.query(`INSERT INTO contract_product_sales VALUES($1,$2,'deposit_due',$3,$3)`, [sale2, cleaner2, creator])
await db.query(`INSERT INTO contract_sale_invoices VALUES($1,$2,'sale','sent','second@example.test','2026-09-29T00:00:00Z')`, [invoice2, sale2])
await assert.rejects(reserve(otherAgent, sale2, invoice2, cleaner2), /Product sale access denied/)
console.log('PASS: first sent invoice reserves one audited cleaner profile email, copies the sale creator, and rejects duplicates and unauthorized agents.')
await db.close()
