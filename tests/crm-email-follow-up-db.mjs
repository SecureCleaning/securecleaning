// Run with PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/crm-email-follow-up-db.mjs
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE crm_communications(id uuid primary key, opportunity_id uuid,contact_id uuid,to_email text,status text,sent_at timestamptz);
CREATE TABLE crm_email_templates(id uuid primary key,name text unique,description text,category text,purpose text,visibility text,status text,is_system boolean,subject text,body text,current_version int default 1);
CREATE TABLE crm_email_template_versions(template_id uuid,version int,subject text,body text,purpose text,unique(template_id,version));
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`)
const sql=await fs.readFile('supabase/migrations/20261029024001_crm_email_follow_up.sql','utf8')
await db.exec(sql);await db.exec(sql)
assert.equal((await db.query('select count(*)::int n from crm_email_template_versions')).rows[0].n,1)
await db.exec('SET ROLE service_role')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.query(`insert into crm_communications(id,opportunity_id,contact_id,to_email,status,sent_at) values($1,$2,$3,'client@example.test','sent',now()),($4,$2,$3,'client@example.test','sending',null)`,[id(1),id(2),id(3),id(4)])
await assert.rejects(db.query('update crm_communications set follow_up_to_id=$1 where id=$1',[id(4)]),/Follow-up must reference/)
await db.query('update crm_communications set follow_up_to_id=$1 where id=$2',[id(1),id(4)])
await assert.rejects(db.query('update crm_communications set follow_up_to_id=null where id=$1',[id(4)]),/cannot be changed/)
await db.query("update crm_communications set status='sent',sent_at=now() where id=$1",[id(4)])
for(const [opp,contact,to] of [[id(9),id(3),'client@example.test'],[id(2),id(9),'client@example.test'],[id(2),id(3),'other@example.test']]) {
  await assert.rejects(db.query(`insert into crm_communications(id,opportunity_id,contact_id,to_email,status,follow_up_to_id) values($1,$2,$3,$4,'sending',$5)`,[id(5),opp,contact,to,id(1)]),/Follow-up must reference/)
}
await db.query('delete from crm_communications where id=$1',[id(1)])
assert.equal((await db.query('select follow_up_to_id from crm_communications where id=$1',[id(4)])).rows[0].follow_up_to_id,id(1))
await db.exec('SET ROLE anon')
await assert.rejects(db.exec('select * from crm_communications'),/permission denied/)
await db.close()
console.log('CRM follow-up migration passed: repeat application, same-recipient checks, immutable reference, deletion compatibility and denied public access.')
