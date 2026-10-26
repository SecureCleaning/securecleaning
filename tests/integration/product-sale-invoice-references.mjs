import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SEQUENCE contract_sale_code_seq START 1000;
CREATE SEQUENCE contract_sale_invoice_number_seq START 1000;
CREATE TABLE contract_products(id integer PRIMARY KEY, product_code text UNIQUE);
CREATE TABLE contract_product_sales(id integer PRIMARY KEY, product_id integer REFERENCES contract_products, sale_code text UNIQUE, status text);
CREATE TABLE contract_sale_invoices(id integer PRIMARY KEY, sale_id integer REFERENCES contract_product_sales, invoice_type text, invoice_number text UNIQUE);
INSERT INTO contract_products VALUES(1,'C001018'),(2,'C001009'),(3,'C001020'),(4,'C001021'),(5,'C1234567'),(6,'bad');
INSERT INTO contract_product_sales VALUES(1,1,'PS-2026-01007','deposit_due');
INSERT INTO contract_sale_invoices VALUES(1,1,'sale','SCINV-2026-01007');`)
await db.exec(readFileSync('supabase/migrations/20261022094041_align_future_sale_invoice_numbers.sql','utf8'))
await db.exec("INSERT INTO contract_product_sales VALUES(2,2,'PS-2026-01009','deposit_due',NULL)")
const before = JSON.stringify((await db.query('SELECT * FROM contract_product_sales ORDER BY id')).rows)
const oldInvoice = JSON.stringify((await db.query('SELECT * FROM contract_sale_invoices ORDER BY id')).rows)
await db.exec(readFileSync('supabase/migrations/20261026002543_align_future_product_sale_invoice_references.sql','utf8'))
assert.equal(JSON.stringify((await db.query('SELECT * FROM contract_product_sales ORDER BY id')).rows), before)
assert.equal(JSON.stringify((await db.query('SELECT * FROM contract_sale_invoices ORDER BY id')).rows), oldInvoice)
const year = (await db.query("SELECT to_char(CURRENT_DATE,'YYYY') AS current_year")).rows[0].current_year
await db.exec("INSERT INTO contract_product_sales VALUES(3,3,'ignored','deposit_due','ignored')")
let sale=(await db.query('SELECT * FROM contract_product_sales WHERE id=3')).rows[0]
assert.equal(sale.sale_code,`PS-${year}-001020`)
assert.equal(sale.aligned_invoice_number,`SCINV-${year}-001020`)
await db.exec("INSERT INTO contract_sale_invoices(id,sale_id,invoice_type) VALUES(3,3,'sale')")
assert.equal((await db.query('SELECT invoice_number FROM contract_sale_invoices WHERE id=3')).rows[0].invoice_number,sale.aligned_invoice_number)
// Old pre-alignment sale keeps legacy behavior; already-reserved sale keeps its old reservation.
await db.exec("INSERT INTO contract_sale_invoices(id,sale_id,invoice_type) VALUES(2,2,'sale')")
assert.equal((await db.query('SELECT invoice_number FROM contract_sale_invoices WHERE id=2')).rows[0].invoice_number,'SCINV-2026-01009')
await db.exec("UPDATE contract_product_sales SET status='cancelled' WHERE id=3; INSERT INTO contract_product_sales VALUES(4,3,'ignored','deposit_due',NULL)")
sale=(await db.query('SELECT * FROM contract_product_sales WHERE id=4')).rows[0]
assert.equal(sale.sale_code,`PS-${year}-001020-R2`)
await db.exec("INSERT INTO contract_sale_invoices(id,sale_id,invoice_type) VALUES(4,4,'sale')")
assert.equal((await db.query('SELECT invoice_number FROM contract_sale_invoices WHERE id=4')).rows[0].invoice_number,`SCINV-${year}-001020-R2`)
// A number already used by a legacy invoice must never be reused.
await db.query("INSERT INTO contract_sale_invoices VALUES(5,1,'deposit',$1)",[`SCINV-${year}-001021`])
await db.exec("INSERT INTO contract_product_sales VALUES(5,4,'ignored','deposit_due',NULL)")
assert.equal((await db.query('SELECT sale_code FROM contract_product_sales WHERE id=5')).rows[0].sale_code,`PS-${year}-001021-R2`)
await db.exec("INSERT INTO contract_product_sales VALUES(6,5,'ignored','deposit_due',NULL)")
assert.equal((await db.query('SELECT sale_code FROM contract_product_sales WHERE id=6')).rows[0].sale_code,`PS-${year}-1234567`)
await assert.rejects(db.exec("INSERT INTO contract_product_sales VALUES(7,6,'ignored','deposit_due',NULL)"),/valid product reference/)
await assert.rejects(db.exec("UPDATE contract_product_sales SET aligned_invoice_number='changed' WHERE id=3"),/immutable/)
assert.equal((await db.query("SELECT has_function_privilege('anon','reserve_contract_sale_invoice_number()','EXECUTE') allowed")).rows[0].allowed,false)
console.log('PASS: historical references unchanged; future product/sale/invoice aligned; delayed old invoice preserved; replacement/collision suffixes; long product number; malformed reference rejection; reservation immutable; ACL.')
await db.close()
