// Isolated PostgreSQL integration test; PGLITE_MODULE points to a test-only install.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE cleaners(id uuid PRIMARY KEY, email text NOT NULL, status text DEFAULT 'approved');
 CREATE TABLE cleaner_documents(cleaner_id uuid REFERENCES cleaners ON DELETE CASCADE);
 CREATE TABLE cleaner_comments(cleaner_id uuid REFERENCES cleaners ON DELETE CASCADE);
 CREATE TABLE cleaner_emails(cleaner_id uuid REFERENCES cleaners ON DELETE CASCADE);
 CREATE TABLE contract_product_sales(cleaner_id uuid REFERENCES cleaners ON DELETE RESTRICT);
 CREATE TABLE contract_product_interests(cleaner_id uuid REFERENCES cleaners ON DELETE RESTRICT);
 CREATE TABLE admin_audit_log(entity_type text, entity_ref text, action text, details jsonb);
 CREATE TABLE cleaner_broadcast_recipients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cleaner_id uuid NOT NULL REFERENCES cleaners ON DELETE RESTRICT, to_email text, cleaner_name_snapshot text);
 CREATE TABLE cleaner_broadcast_suppressions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cleaner_id uuid NOT NULL UNIQUE REFERENCES cleaners ON DELETE CASCADE, email_normalized text NOT NULL, reason text DEFAULT 'unsubscribed' CHECK(reason IN ('unsubscribed','manual')), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
`)
const migration = await readFile(new URL('../supabase/cleaner_deletion_broadcast_history_override_migration.sql', import.meta.url), 'utf8')
await db.exec(migration)
await db.exec(migration)
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
const cleaner = async email => { const id = randomUUID(); await db.query('INSERT INTO cleaners(id,email) VALUES($1,$2)', [id,email]); return id }
const remove = id => scalar("SELECT delete_cleaner_permanently($1,'test-owner','Owner','owner')", [id])
const first = await cleaner(' Retained@Example.com ')
await db.query("INSERT INTO cleaner_broadcast_recipients(cleaner_id,to_email,cleaner_name_snapshot) VALUES($1,'retained@example.com','Snapshot')", [first])
for (const table of ['cleaner_comments','cleaner_emails']) await db.query(`INSERT INTO ${table} VALUES($1)`, [first])
assert.equal(await remove(first), true)
assert.equal(await remove(first), false)
assert.equal(await scalar('SELECT cleaner_id FROM cleaner_broadcast_recipients'), null)
assert.equal(await scalar('SELECT cleaner_name_snapshot FROM cleaner_broadcast_recipients'), 'Snapshot')
assert.equal(await scalar('SELECT email_normalized FROM cleaner_broadcast_suppressions'), 'retained@example.com')
assert.equal(await scalar('SELECT cleaner_id FROM cleaner_broadcast_suppressions'), null)
assert.equal(await scalar('SELECT count(*)::int FROM cleaner_comments'), 0)
assert.equal(await scalar('SELECT count(*)::int FROM cleaner_emails'), 0)
const second = await cleaner('retained@example.com')
assert.equal(await scalar('SELECT cleaner_id FROM cleaner_broadcast_suppressions'), second)
assert.equal(await remove(second), true)
const existing = await cleaner('existing@example.com')
await db.query("INSERT INTO cleaner_broadcast_suppressions(cleaner_id,email_normalized) VALUES($1,'existing@example.com')", [existing])
await db.query("UPDATE cleaners SET email='retained@example.com' WHERE id=$1", [existing])
assert.equal(await scalar('SELECT count(*)::int FROM cleaner_broadcast_suppressions WHERE cleaner_id=$1', [existing]), 1)
assert.equal(await scalar("SELECT count(*)::int FROM cleaner_broadcast_suppressions WHERE cleaner_id IS NULL AND email_normalized='retained@example.com'"), 1)
for (const table of ['cleaner_documents','contract_product_sales','contract_product_interests']) {
 const id = await cleaner(`${table}@example.com`)
 await db.query(`INSERT INTO ${table} VALUES($1)`, [id])
 const before = await scalar('SELECT count(*)::int FROM admin_audit_log')
 await assert.rejects(() => remove(id), table === 'cleaner_documents' ? /cleaner_has_documents/ : /foreign key/)
 assert.equal(await scalar('SELECT count(*)::int FROM cleaners WHERE id=$1', [id]), 1)
 assert.equal(await scalar('SELECT count(*)::int FROM cleaner_broadcast_suppressions WHERE cleaner_id=$1', [id]), 0)
 assert.equal(await scalar('SELECT count(*)::int FROM admin_audit_log'), before)
}
await assert.rejects(() => scalar("SELECT delete_cleaner_permanently($1,'test-agent','Agent','agent')",[existing]), /Unauthorized/)
for (const role of ['anon','authenticated']) {
 assert.equal(await scalar(`SELECT has_function_privilege('${role}','delete_cleaner_permanently(uuid,text,text,text)','EXECUTE')`), false)
 assert.equal(await scalar(`SELECT has_function_privilege('${role}','attach_existing_cleaner_broadcast_suppression()','EXECUTE')`), false)
}
assert.equal(await scalar("SELECT has_function_privilege('service_role','delete_cleaner_permanently(uuid,text,text,text)','EXECUTE')"), true)
await db.close()
console.log('PASS: deletion, audit retention, suppression reattachment, email-change collision, document/sale/offer rollback, role guards, and migration reapplication')
