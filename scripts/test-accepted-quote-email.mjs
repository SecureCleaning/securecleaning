import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE)
const db = new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TYPE public.quote_status AS ENUM ('pending','sent','accepted');
CREATE TABLE public.quotes (quote_ref text primary key, status public.quote_status, firm_quote_workflow jsonb, updated_at timestamptz);
CREATE TABLE public.admin_audit_log (entity_type text, entity_ref text, action text, details jsonb);`)
await db.exec(readFileSync('supabase/final_quote_scope_workflow_migration.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261127092236_revised_accepted_quote_email.sql','utf8'))
const actor = JSON.stringify({kind:'staff_account',id:'tester',name:'Test'})
const doc = JSON.stringify({inputs:{email:'client@example.com'},firmQuoteDraft:{status:'accepted',finalPerVisit:102}})
await db.query(`INSERT INTO quotes(quote_ref,status,firm_quote_workflow,final_quote_document,final_quote_document_version) VALUES ('accepted','accepted','{"status":"accepted"}', $1,2), ('reviewed','pending','{"status":"reviewed"}',$1,1), ('reconcile','accepted','{"status":"accepted"}',$1,2)`,[doc])
const claim = async (ref,id,version) => (await db.query('SELECT claim_final_quote_send($1,$2,$3,$4,$5) AS ok',[id,ref,actor,'client@example.com',version])).rows[0].ok
const a='00000000-0000-0000-0000-000000000001', b='00000000-0000-0000-0000-000000000002'
assert.equal(await claim('accepted',a,1),false)
assert.equal(await claim('accepted',a,2),true)
assert.equal(await claim('accepted',b,2),false)
await db.query("UPDATE quote_send_attempts SET status='provider_accepted' WHERE id=$1",[a])
assert.equal((await db.query("SELECT finalize_final_quote_send('accepted',$1,2,now()) AS ok",[a])).rows[0].ok,true)
assert.equal(await claim('accepted',b,2),false)
const saved=(await db.query("SELECT status,firm_quote_workflow,final_quote_document FROM quotes WHERE quote_ref='accepted'")).rows[0]
assert.equal(saved.status,'accepted'); assert.equal(saved.firm_quote_workflow.status,'accepted'); assert.deepEqual(saved.final_quote_document,JSON.parse(doc))
assert.equal(await claim('reviewed',b,1),true)
await db.query("UPDATE quote_send_attempts SET status='provider_accepted' WHERE id=$1",[b])
assert.equal((await db.query("SELECT finalize_final_quote_send('reviewed',$1,1,now()) AS ok",[b])).rows[0].ok,true)
assert.equal((await db.query("SELECT status FROM quotes WHERE quote_ref='reviewed'")).rows[0].status,'sent')
const c='00000000-0000-0000-0000-000000000003'
assert.equal(await claim('reconcile',c,2),true)
assert.equal((await db.query("SELECT reconcile_final_quote_send('reconcile',$1,'confirmed_accepted','Verified provider delivery',$2,'provider-id',now()) AS result",[c,actor])).rows[0].result,'accepted')
assert.equal((await db.query("SELECT status FROM quotes WHERE quote_ref='reconcile'")).rows[0].status,'accepted')
for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_function_privilege($1,'public.claim_final_quote_send(uuid,text,jsonb,text,integer)','execute') AS allowed",[role])).rows[0].allowed,false)
await db.close()
console.log('Accepted resend SQL: acceptance, unchanged document, duplicate/stale claims, reconciliation, ordinary send and ACL checks passed.')
