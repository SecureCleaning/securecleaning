// Optional isolated integration check: set PGLITE_MODULE to an installed PGlite module path.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const root=process.argv[2] || process.cwd()
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS 'SELECT gen_random_uuid()';
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END $$;
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,username text,role text,active boolean);
CREATE TABLE crm_email_suppressions(email_normalized text,blocks_all boolean);
CREATE TABLE crm_email_templates(id uuid);CREATE TABLE crm_email_template_versions(id uuid);CREATE TABLE crm_communications(id uuid);
CREATE TABLE cleaner_broadcast_templates(id uuid);CREATE TABLE cleaner_broadcast_campaigns(id uuid);CREATE TABLE cleaner_broadcast_recipients(id uuid);
CREATE TABLE contract_sale_invoice_templates(id text);CREATE TABLE contract_sale_invoices(id uuid);
`)
await db.exec(readFileSync(`${root}/supabase/cleaners_migration.sql`,'utf8'))
await db.exec(readFileSync(`${root}/supabase/audit_log_migration.sql`,'utf8'))
await db.exec(`ALTER TABLE cleaners ADD COLUMN broadcast_unsubscribe_token uuid DEFAULT gen_random_uuid();
CREATE TABLE cleaner_broadcast_suppressions(cleaner_id uuid REFERENCES cleaners(id) ON DELETE CASCADE);
CREATE TABLE cleaner_documents(id uuid PRIMARY KEY,cleaner_id uuid REFERENCES cleaners(id) ON DELETE CASCADE);
CREATE TABLE protected_sales(id uuid PRIMARY KEY,cleaner_id uuid REFERENCES cleaners(id) ON DELETE RESTRICT);`)
for(let i=0;i<2;i++)for(const name of ['rich_email_composer_migration.sql','invoice_email_rich_text_migration.sql','cleaner_email_delivery_migration.sql','cleaner_permanent_deletion_migration.sql'])await db.exec(readFileSync(`${root}/supabase/${name}`,'utf8'))
await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;')
const actor='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333',batch='44444444-4444-4444-8444-444444444444'
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'test-owner','owner',true)`,[actor])
for(const [id,email]of[[a,'a@example.test'],[b,'b@example.test']])await db.query(`INSERT INTO cleaners(id,business_name,contact_name,email,status)VALUES($1,'Test','Test',$2,'approved')`,[id,email])
const messages=[{cleaner_id:a,email:'a@example.test',subject:'Test',body:'Test',html:'<p>Test</p>',text:'Test'},{cleaner_id:b,email:'b@example.test',subject:'Test',body:'Test',html:'<p>Test</p>',text:'Test'}]
const reserve=()=>db.query(`SELECT reserve_cleaner_email_batch($1,$2,$3,$4::jsonb,NULL,NULL) AS ok`,[batch,actor,'a'.repeat(64),JSON.stringify(messages)])
assert.equal((await reserve()).rows[0].ok,true);assert.equal((await reserve()).rows[0].ok,false)
assert.equal((await db.query('SELECT count(*)::int AS n FROM cleaner_emails')).rows[0].n,2)
let ids=(await db.query('SELECT id,cleaner_id FROM cleaner_emails')).rows
const emailA=ids.find(x=>x.cleaner_id===a).id,emailB=ids.find(x=>x.cleaner_id===b).id
await db.query(`UPDATE cleaners SET status='rejected' WHERE id=$1`,[a])
assert.equal((await db.query('SELECT claim_cleaner_email_delivery($1,$2) AS ok',[emailA,actor])).rows[0].ok,false)
await db.query('INSERT INTO cleaner_broadcast_suppressions VALUES($1)',[b])
assert.equal((await db.query('SELECT claim_cleaner_email_delivery($1,$2) AS ok',[emailB,actor])).rows[0].ok,false)
await db.query(`UPDATE cleaners SET status='approved' WHERE id=$1`,[a]);await db.exec('DELETE FROM cleaner_broadcast_suppressions;')
const nextBatch='55555555-5555-4555-8555-555555555555'
await db.query('SELECT reserve_cleaner_email_batch($1,$2,$3,$4::jsonb,NULL,NULL)',[nextBatch,actor,'b'.repeat(64),JSON.stringify([messages[0]])])
const nextEmail=(await db.query('SELECT id FROM cleaner_emails WHERE batch_id=$1',[nextBatch])).rows[0].id
assert.equal((await db.query('SELECT claim_cleaner_email_delivery($1,$2) AS ok',[nextEmail,actor])).rows[0].ok,true)
assert.equal((await db.query('SELECT claim_cleaner_email_delivery($1,$2) AS ok',[nextEmail,actor])).rows[0].ok,false)
await db.query(`SELECT complete_cleaner_email_delivery($1,$2,'unknown',NULL)`,[nextEmail,actor])
assert.equal((await db.query('SELECT delivery_outcome FROM cleaner_emails WHERE id=$1',[nextEmail])).rows[0].delivery_outcome,'unknown')
assert.equal((await db.query('SELECT claim_cleaner_email_delivery($1,$2) AS ok',[nextEmail,actor])).rows[0].ok,false)
await db.exec('SET ROLE anon;')
await assert.rejects(db.query('SELECT claim_cleaner_email_delivery($1,$2)',[nextEmail,actor]),/permission denied/)
await db.exec('RESET ROLE;')
await db.query('INSERT INTO cleaner_documents VALUES(gen_random_uuid(),$1)',[a])
await assert.rejects(db.query(`SELECT delete_cleaner_permanently($1,$2,'test-owner','owner')`,[a,actor]),/cleaner_has_documents/)
await db.exec('DELETE FROM cleaner_documents;')
await db.query('INSERT INTO protected_sales VALUES(gen_random_uuid(),$1)',[a])
const auditBefore=(await db.query('SELECT count(*)::int n FROM admin_audit_log')).rows[0].n
await assert.rejects(db.query(`SELECT delete_cleaner_permanently($1,$2,'test-owner','owner')`,[a,actor]),/foreign key/)
assert.equal((await db.query('SELECT count(*)::int n FROM admin_audit_log')).rows[0].n,auditBefore)
await db.exec('DELETE FROM protected_sales;')
assert.equal((await db.query(`SELECT delete_cleaner_permanently($1,$2,'test-owner','owner') AS ok`,[a,actor])).rows[0].ok,true)
assert.equal((await db.query('SELECT count(*)::int n FROM cleaner_email_batches')).rows[0].n,2)
console.log('PASS: migrations repeatable; reservation replay; rejection/unsubscribe at claim; one-time claim; unknown outcome no retry; anon denial; protected documents/FK rollback; deletion audit atomic; batch ledger retained')
await db.close()
