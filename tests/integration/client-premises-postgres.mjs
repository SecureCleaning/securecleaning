// Isolated migration test. PGLITE_MODULE can point to a temporary installation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TYPE city_type AS ENUM('sydney','melbourne'); CREATE TYPE premises_type AS ENUM('office','other');
CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,role text,active boolean);
CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
CREATE TABLE crm_organisations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_name text,phone text,updated_at timestamptz DEFAULT now());
CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organisation_id uuid,business_name text,contact_name text,first_name text,last_name text,position_title text,email text,phone text,address text,city city_type,is_primary_contact boolean,updated_at timestamptz DEFAULT now());
CREATE TABLE sites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,organisation_id uuid,site_name text,address text NOT NULL,suburb text,postcode text,city city_type NOT NULL,is_active boolean,crm_site_key text,premises_type premises_type,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX site_key_unique ON sites(organisation_id,crm_site_key) WHERE organisation_id IS NOT NULL AND crm_site_key IS NOT NULL;
CREATE TABLE crm_opportunities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organisation_id uuid,primary_contact_id uuid,site_id uuid,assigned_staff_id uuid,stage text,cycle_number int,previous_opportunity_id uuid,cycle_reason text,assignment_method text,notes text,closed_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,business_name text,contact_name text,phone text,city city_type,source text,notes text,follow_up_status text,follow_up_notes text,converted_to_client_id uuid,organisation_id uuid,contact_id uuid,site_id uuid,address text,suburb text,postcode text,state text,source_provider text,source_reference text,source_explanation text,source_obtained_at timestamptz,contact_basis text);
CREATE TABLE crm_opportunity_intakes(opportunity_id uuid,lead_id uuid);
`)
const foundation=readFileSync('supabase/client_crm_foundation_migration.sql','utf8')
function fn(source,name) { const start=source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`); assert.ok(start>=0); return source.slice(start,source.indexOf('$$;',start)+3) }
for(const name of ['crm_normalize_phone','crm_site_identity_key','crm_promote_provisional_opportunity','create_client_crm_opportunity']) await db.exec(fn(foundation,name))
await db.exec(fn(readFileSync('supabase/client_crm_agent_partial_profile_migration.sql','utf8'),'update_client_crm_profile'))
await db.exec(readFileSync('supabase/migrations/20261019045622_client_premises_catalog_and_lead_csv.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261027025310_opportunity_cleaning_preferences.sql','utf8'))
const owner='00000000-0000-4000-8000-000000000001',agent='00000000-0000-4000-8000-000000000002'
await db.query("INSERT INTO admin_staff_accounts VALUES($1,'owner',true),($2,'agent',true)",[owner,agent])
const values={p_business_name:'Example',p_contact_name:'Jane Test',p_email:'jane@example.com',p_phone:'0400000000',p_address:'1 Example St',p_suburb:'Sydney',p_postcode:'2000',p_city:'sydney',p_source:'manual',p_source_provider:'',p_source_reference:'',p_source_explanation:'Enquiry',p_contact_basis:'enquiry',p_assigned_staff_id:agent,p_assignment_method:'manual_override',p_notes:'',p_actor_id:owner,p_actor_role:'owner'}
const save=async(operation,values,type,other='',key=null)=>(await db.query('SELECT save_crm_record_with_premises($1,$2::jsonb,$3,$4,$5) id',[operation,JSON.stringify(values),type,other,key])).rows[0].id
const id=await save('create',{...values,p_cleaning_frequency:'3x_week',p_cleaning_time_preference:'weekend'},'education','','row-1')
assert.equal(await save('create',values,'education','','row-1'),id)
assert.deepEqual((await db.query('SELECT cleaning_frequency,cleaning_time_preference FROM crm_opportunities WHERE id=$1',[id])).rows[0], {cleaning_frequency:'3x_week',cleaning_time_preference:'weekend'})
await assert.rejects(save('create',{...values,p_email:'bad-time@example.com',p_cleaning_time_preference:'noon'},'office'),/cleaning_time_preference/)
const unspecified=await save('create',{...values,p_email:'unspecified@example.com',p_business_name:'Unspecified'},'office')
assert.deepEqual((await db.query('SELECT cleaning_frequency,cleaning_time_preference FROM crm_opportunities WHERE id=$1',[unspecified])).rows[0], {cleaning_frequency:null,cleaning_time_preference:'after_hours'})
await assert.rejects(save('create',{...values,p_email:'bad-frequency@example.com',p_business_name:'Bad frequency',p_cleaning_frequency:'invalid'},'office'),/cleaning_frequency/)
assert.equal((await db.query("SELECT count(*)::int n FROM clients WHERE email='bad-frequency@example.com'")).rows[0].n,0)

assert.equal((await db.query('SELECT count(*)::int n FROM crm_opportunities')).rows[0].n,2)
assert.equal((await db.query('SELECT premises_type FROM sites')).rows[0].premises_type,'education')
await assert.rejects(save('create',{...values,p_email:'invalid-category@example.com'},'nonexistent'),/available premises/)
assert.equal((await db.query('SELECT count(*)::int n FROM clients')).rows[0].n,2,'invalid selection rolls back the entire create')
const snapshot=(await db.query('SELECT o.*,c.updated_at contact_time,g.updated_at org_time,s.updated_at site_time FROM crm_opportunities o JOIN clients c ON c.id=o.primary_contact_id JOIN crm_organisations g ON g.id=o.organisation_id JOIN sites s ON s.id=o.site_id WHERE o.id=$1',[id])).rows[0]
const edit={...values,p_opportunity_id:id,p_expected_opportunity_updated_at:snapshot.updated_at,p_expected_organisation_updated_at:snapshot.org_time,p_expected_contact_updated_at:snapshot.contact_time,p_expected_site_updated_at:snapshot.site_time,p_first_name:'Jane',p_last_name:'Test',p_position_title:'',p_site_name:'Example'}
await save('update',edit,'other','Exhibition space')
assert.equal((await db.query('SELECT premises_type_other FROM sites WHERE id=$1',[snapshot.site_id])).rows[0].premises_type_other,'Exhibition space')
await assert.rejects(save('update',edit,'office'),/changed/)
await assert.rejects(db.query("SELECT save_crm_premises_option($1,'new','New',true,null)",[agent]),/Administrator/)
const option=(await db.query("SELECT save_crm_premises_option($1,'museum','Museum',true,null) value",[owner])).rows[0].value
await db.query("SELECT save_crm_premises_option($1,'museum','Museum',false,$2)",[owner,option.updated_at])
await assert.rejects(db.query("SELECT save_crm_premises_option($1,'museum','Changed',true,$2)",[owner,option.updated_at]),/List changed/)
await assert.rejects(save('create',{...values,p_email:'inactive@example.com'},'museum'),/available premises/)
await assert.rejects(db.query("SELECT save_crm_premises_option($1,'other','Other',false,now())",[owner]),/Other must remain/)
await save('create',{...values,p_email:'partial@example.com',p_business_name:'Partial',p_address:''},'office')
assert.equal((await db.query("SELECT count(*)::int n FROM sites WHERE premises_type='office' AND address='' ")).rows[0].n,1)
for (const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`)
  await assert.rejects(db.query('SELECT * FROM crm_lead_import_rows'),/permission denied/)
  await assert.rejects(db.query('SELECT * FROM crm_premises_types'),/permission denied/)
  await assert.rejects(save('create',values,'office'),/permission denied/)
  await db.exec('RESET ROLE')
}
await db.close()
console.log('PASS: premises migration, actual legacy create/profile functions, rollback, retries, stale updates and role restrictions')
