// Run with PGLITE_MODULE pointing to an isolated @electric-sql/pglite install.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE)
const db = new PGlite()
const sql = readFileSync(new URL('../../supabase/migrations/20261022094041_align_future_sale_invoice_numbers.sql', import.meta.url), 'utf8')
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SEQUENCE contract_sale_code_seq START 1006;
CREATE SEQUENCE contract_sale_invoice_number_seq START 1005;
CREATE TABLE contract_product_sales(id int primary key, sale_code text unique, status text default 'draft');
CREATE TABLE contract_sale_invoices(id int primary key, sale_id int references contract_product_sales, invoice_number text unique, invoice_type text);
INSERT INTO contract_product_sales VALUES (1,'PS-2026-01006','draft');
INSERT INTO contract_sale_invoices VALUES (1,1,'SCINV-2026-01005','sale');
`)
await db.exec(sql)
assert.equal((await db.query('select aligned_invoice_number from contract_product_sales where id=1')).rows[0].aligned_invoice_number,null)
const sale = async id => (await db.query(`insert into contract_product_sales(id,sale_code) values ($1,'PS-2026-'||lpad(nextval('contract_sale_code_seq')::text,5,'0')) returning *`,[id])).rows[0]
const invoice = async (id,saleId,type) => (await db.query('insert into contract_sale_invoices(id,sale_id,invoice_type) values ($1,$2,$3) returning *',[id,saleId,type])).rows[0]
const a=await sale(2),b=await sale(3)
assert.equal(a.aligned_invoice_number,a.sale_code.replace('PS-','SCINV-'))
const legacy=await invoice(2,1,'deposit')
const ib=await invoice(3,3,'sale'),ia=await invoice(4,2,'sale')
assert.equal(ia.invoice_number,a.aligned_invoice_number)
assert.equal(ib.invoice_number,b.aligned_invoice_number)
assert.notEqual(legacy.invoice_number,ia.invoice_number)
assert.notEqual(legacy.invoice_number,ib.invoice_number)
await assert.rejects(db.query("update contract_product_sales set aligned_invoice_number='changed' where id=2"),/immutable/)
await db.query("update contract_product_sales set status='inspection_ready' where id=2")
await db.exec(sql)
const c=await sale(4)
assert.ok(Number(c.sale_code.split('-').at(-1))>Number(legacy.invoice_number.split('-').at(-1)))
assert.equal((await invoice(5,4,'sale')).invoice_number,c.aligned_invoice_number)
assert.equal((await db.query('select invoice_number from contract_sale_invoices where id=1')).rows[0].invoice_number,'SCINV-2026-01005')
assert.equal((await db.query('select sale_code from contract_product_sales where id=1')).rows[0].sale_code,'PS-2026-01006')
for(const name of ['reserve_contract_sale_invoice_number','apply_contract_sale_invoice_number','protect_contract_sale_invoice_reservation']) {
 const r=(await db.query(`select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as authenticated,has_function_privilege('service_role',$1,'execute') as service`,[name+'()'])).rows[0]
 assert.deepEqual(r,{anon:false,authenticated:false,service:true})
}
console.log('PASS: future alignment, out-of-order invoices, legacy allocation, existing IDs, immutability, replay and permissions')
await db.close()
