import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,username text,active boolean,role text);
INSERT INTO admin_staff_accounts VALUES ('00000000-0000-4000-8000-000000000999','Owner',true,'owner');
CREATE TABLE quotes(id uuid PRIMARY KEY,quote_ref text UNIQUE,status text,final_quote_sent_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE contract_products(id uuid PRIMARY KEY,source_quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT);
CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,product_id uuid NOT NULL REFERENCES contract_products(id) ON DELETE RESTRICT,
source_quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,sale_code text,cleaner_id uuid,opportunity_id uuid,site_id uuid,
agreed_purchase_price_inc_gst_cents int,deposit_inc_gst_cents int,product_snapshot jsonb,cleaner_snapshot jsonb,client_snapshot jsonb,site_snapshot jsonb,status text DEFAULT 'draft',price_finalised_at timestamptz);
CREATE TABLE bookings(id uuid PRIMARY KEY,quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL);
CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,winning_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL);
CREATE TABLE crm_opportunity_quotes(quote_id uuid REFERENCES quotes(id) ON DELETE RESTRICT);
CREATE TABLE quote_send_attempts(id uuid PRIMARY KEY,quote_ref text REFERENCES quotes(quote_ref) ON DELETE CASCADE,status text);
CREATE TABLE quote_final_document_versions(quote_ref text REFERENCES quotes(quote_ref) ON DELETE CASCADE,document jsonb);
CREATE TABLE contract_product_versions(product_id uuid REFERENCES contract_products(id) ON DELETE CASCADE,version int);
CREATE TABLE contract_product_interests(product_id uuid REFERENCES contract_products(id) ON DELETE CASCADE,note text);
CREATE TABLE cleaner_broadcast_campaign_products(product_id uuid REFERENCES contract_products(id) ON DELETE RESTRICT);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
CREATE SCHEMA storage; CREATE TABLE storage.objects(name text);
INSERT INTO storage.objects VALUES ('signed-agreement.pdf');
`)
for (const table of ['contract_sale_invoices','contract_sale_payments','contract_sale_payment_allocations','contract_sale_payment_plans','contract_sale_inspections','contract_sale_agreements','contract_commission_assignments','contract_sale_site_assignments']) {
  await db.exec(`CREATE TABLE ${table}(sale_id uuid REFERENCES contract_product_sales(id) ON DELETE RESTRICT,status text)`)
}
const migration = readFileSync(new URL('../../supabase/owner_quote_deletion_override_migration.sql', import.meta.url),'utf8')
await db.exec(migration)
await db.exec(migration)
await db.exec(`CREATE TRIGGER protect_sale BEFORE UPDATE ON contract_product_sales FOR EACH ROW EXECUTE FUNCTION protect_contract_product_sale_snapshot()`)
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const ref = n => `SC-20260921-${String(n).padStart(4,'0')}`
const owner = {id:'00000000-0000-4000-8000-000000000999',name:'Owner',role:'owner'}
const preview = async n => (await db.query('SELECT admin_preview_quote_deletion($1) p',[ref(n)])).rows[0].p
const remove = async (n, mode='keep', override=true, token, actor=owner) => db.query('SELECT admin_delete_quote_with_override($1,$2,$3,$4,$5,$6)',[ref(n),'Internal test cleanup',actor,mode,override,token ?? (await preview(n)).previewToken])
async function seed(n) {
 await db.query(`INSERT INTO quotes(id,quote_ref,status) VALUES($1,$2,'accepted')`,[id(n),ref(n)])
 await db.query('INSERT INTO contract_products VALUES($1,$2,NULL)',[id(n+100),id(n)])
 await db.query('INSERT INTO contract_product_sales(id,product_id,source_quote_id,sale_code,agreed_purchase_price_inc_gst_cents) VALUES($1,$2,$3,$4,1000)',[id(n+200),id(n+100),id(n),`SALE-${n}`])
}
await seed(1)
await db.exec("UPDATE admin_staff_accounts SET active=false")
await assert.rejects(remove(1),/Active owner access/)
await db.exec("UPDATE admin_staff_accounts SET active=true,role='manager'")
await assert.rejects(remove(1),/Active owner access/)
await db.exec("UPDATE admin_staff_accounts SET role='owner'")
await assert.rejects(remove(1,'delete',false),/Owner override/)
await assert.rejects(remove(1,'delete',true,undefined,{...owner,role:'agent'}),/owner identity/)
const stale = (await preview(1)).previewToken
await db.query('INSERT INTO bookings VALUES($1,$2)',[id(401),id(1)])
await assert.rejects(remove(1,'delete',true,stale),/preview changed/)
await db.query('INSERT INTO crm_opportunities VALUES($1,$2)',[id(501),id(1)])
await db.query('INSERT INTO crm_opportunity_quotes VALUES($1)',[id(1)])
await db.query('INSERT INTO contract_product_versions VALUES($1,1)',[id(101)])
await db.query('INSERT INTO contract_product_interests VALUES($1,\'Test\')',[id(101)])
await db.query('INSERT INTO cleaner_broadcast_campaign_products VALUES($1)',[id(101)])
await db.query('INSERT INTO quote_send_attempts VALUES($1,$2,\'finalized\')',[id(601),ref(1)])
await db.query('INSERT INTO quote_final_document_versions VALUES($1,\'{"test":true}\')',[ref(1)])
await remove(1,'delete')
assert.equal((await db.query('SELECT * FROM quotes')).rows.length,0)
assert.equal((await db.query('SELECT * FROM contract_products')).rows.length,0)
assert.equal((await db.query('SELECT * FROM contract_product_sales')).rows.length,0)
assert.equal((await db.query('SELECT quote_id FROM bookings')).rows[0].quote_id,null)
assert.equal((await db.query('SELECT winning_quote_id FROM crm_opportunities')).rows[0].winning_quote_id,null)
assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,1)
const archive=(await db.query('SELECT snapshot FROM quote_deletion_archive')).rows[0].snapshot
assert.equal(archive.sales.length,1)
assert.equal(archive.documentVersions.length,1)
assert.equal(archive.sendAttempts.length,1)
assert.equal(archive.productInterests.length,1)
await assert.rejects(remove(1),/Quote not found/)

await seed(2)
await db.query('INSERT INTO contract_commission_assignments(sale_id) VALUES($1)',[id(202)])
assert.equal((await preview(2)).retentionReasons[0].type,'contract_commission_assignments')
await assert.rejects(remove(2,'delete'),/retained history/)
assert.equal((await db.query('SELECT * FROM quotes WHERE id=$1',[id(2)])).rows.length,1)
// Ordinary writes must still fail even when current_setting is absent or empty.
await assert.rejects(db.query('UPDATE contract_product_sales SET source_quote_id=NULL,deleted_source_quote_ref=$1 WHERE id=$2',[ref(2),id(202)]),/immutable/)
await remove(2,'keep')
const retained=(await db.query('SELECT * FROM contract_product_sales WHERE id=$1',[id(202)])).rows[0]
assert.equal(retained.source_quote_id,null)
assert.equal(retained.deleted_source_quote_ref,ref(2))
assert.equal(retained.agreed_purchase_price_inc_gst_cents,1000)
assert.equal((await db.query('SELECT * FROM contract_commission_assignments')).rows.length,1)
await db.query("UPDATE contract_product_sales SET agreed_purchase_price_inc_gst_cents=2000 WHERE id=$1",[id(202)])
await db.query("INSERT INTO contract_sale_invoices(sale_id,status) VALUES($1,'issued')",[id(202)])
await assert.rejects(db.query('UPDATE contract_product_sales SET agreed_purchase_price_inc_gst_cents=1 WHERE id=$1',[id(202)]),/cannot change/)
await seed(3)
await db.query('INSERT INTO quote_send_attempts VALUES($1,$2,\'claimed\')',[id(603),ref(3)])
await assert.rejects(remove(3),/still being processed/)
assert.equal((await preview(3)).blocked,true)
// New sales from a kept product inherit its historical reference.
await db.query('INSERT INTO contract_product_sales(id,product_id,source_quote_id) VALUES($1,$2,NULL)',[id(900),id(102)])
assert.equal((await db.query('SELECT deleted_source_quote_ref FROM contract_product_sales WHERE id=$1',[id(900)])).rows[0].deleted_source_quote_ref,ref(2))
// Every retained dependency blocks record removal, but never quote-only removal.
let serial=10
for (const table of ['contract_sale_invoices','contract_sale_payments','contract_sale_payment_allocations','contract_sale_payment_plans','contract_sale_inspections','contract_sale_agreements','contract_sale_site_assignments']) {
  const n=serial++
  await seed(n)
  await db.query(`INSERT INTO ${table}(sale_id) VALUES($1)`,[id(n+200)])
  await assert.rejects(remove(n,'delete'),/retained history/)
  await remove(n,'keep')
  assert.equal((await db.query(`SELECT * FROM ${table} WHERE sale_id=$1`,[id(n+200)])).rows.length,1)
}
// Unknown future restrictive dependencies fail atomically without losing quote or audit archive.
await seed(30)
await db.exec('CREATE TABLE future_dependency(product_id uuid REFERENCES contract_products(id) ON DELETE RESTRICT)')
await db.query('INSERT INTO future_dependency VALUES($1)',[id(130)])
await assert.rejects(remove(30,'delete'),/foreign key/)
assert.equal((await db.query('SELECT * FROM contract_product_sales WHERE id=$1',[id(230)])).rows.length,1)
assert.equal((await db.query('SELECT * FROM quote_deletion_archive WHERE quote_ref=$1',[ref(30)])).rows.length,0)
await db.exec('SET ROLE anon')
await assert.rejects(preview(3),/permission denied/)
await assert.rejects(db.query('SELECT * FROM quote_deletion_archive'),/permission denied/)
await db.exec('RESET ROLE')
console.log('PASS: repeatable migration, owner authorization, exact preview, transactional linked deletion, retained sales and commission history, storage preserved, send-in-progress block, anonymous denial.')
await db.close()
