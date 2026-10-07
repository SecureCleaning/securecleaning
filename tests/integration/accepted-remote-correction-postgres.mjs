import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TYPE quote_status AS ENUM('pending','accepted');
CREATE TABLE quotes(quote_ref text PRIMARY KEY,status quote_status,updated_at timestamptz,inputs jsonb,result jsonb,firm_quote_workflow jsonb,inspection_report jsonb,final_quote_document jsonb,final_quote_document_version int,final_quote_reviewed_at timestamptz,final_quote_reviewed_by jsonb,final_quote_sent_at timestamptz,final_quote_sent_by jsonb,final_quote_sent_to text,final_quote_sent_variant text);
CREATE TABLE admin_staff_accounts(id uuid,active boolean,role text);
CREATE TABLE quote_send_attempts(quote_ref text,status text);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);`)
const sql=readFileSync(new URL('../../supabase/migrations/20261007070456_accepted_remote_quote_correction.sql',import.meta.url),'utf8')
await db.exec(sql);await db.exec(sql)
const owner='00000000-0000-4000-8000-000000000001',actor={id:owner,name:'Owner',kind:'staff_account'},stamp='2026-10-07T01:00:00Z'
await db.query("INSERT INTO admin_staff_accounts VALUES($1,true,'owner')",[owner])
await db.query("INSERT INTO quotes(quote_ref,status,updated_at,inputs,result,firm_quote_workflow) VALUES('SC-TEST','accepted',$1,$2,$3,$4)",[stamp,{frequency:'weekly'},{low:90},{status:'accepted',old:'preserve'}])
const draft={status:'accepted',finalPerVisit:120,revisedInputs:{frequency:'fortnightly'},roomItems:[{id:'room'}]}
const document={variant:'final',version:1,firmQuoteDraft:draft,inputs:draft.revisedInputs,reviewedBy:actor}
const call=async(who=actor,expected=stamp,doc=document)=> (await db.query("SELECT correct_accepted_remote_quote('SC-TEST',$1,'{}',$2,$3,$4,now()) value",[expected,draft,doc,who])).rows[0].value
await assert.rejects(call({...actor,id:'other'}),/active owner/)
assert.equal(await call(actor,'2026-10-06Z'),null)
assert.equal(await call(actor,stamp,{...document,version:2}),null)
await db.exec("INSERT INTO quote_send_attempts VALUES('SC-TEST','claimed')")
assert.equal(await call(),null);await db.exec('DELETE FROM quote_send_attempts')
assert.equal(await call(),1);assert.equal(await call(),null)
const q=(await db.query('SELECT * FROM quotes')).rows[0]
assert.equal(q.status,'accepted');assert.equal(q.inputs.frequency,'weekly');assert.equal(q.final_quote_document.inputs.frequency,'fortnightly');assert.equal(q.final_quote_document_version,1)
const audits=(await db.query('SELECT * FROM admin_audit_log')).rows
assert.equal(audits.length,1);assert.equal(audits[0].details.previousWorkflow.old,'preserve')
const acl=(await db.query("SELECT has_function_privilege('anon','correct_accepted_remote_quote(text,timestamptz,jsonb,jsonb,jsonb,jsonb,timestamptz)','EXECUTE') a,has_function_privilege('service_role','correct_accepted_remote_quote(text,timestamptz,jsonb,jsonb,jsonb,jsonb,timestamptz)','EXECUTE') s")).rows[0]
assert.equal(acl.a,false);assert.equal(acl.s,true)
await db.close();console.log('Accepted remote correction migration, replay, owner access, stale checks, send guard, history and ACL passed')
