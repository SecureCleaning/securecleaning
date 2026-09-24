// Optional isolated integration check: set PGLITE_MODULE to an installed PGlite module path.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = process.argv[2] || process.cwd()
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS 'SELECT gen_random_uuid()';
  CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY, username text NOT NULL, role text NOT NULL, active boolean NOT NULL);
  CREATE TABLE admin_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_ref text, action text, details jsonb, created_at timestamptz DEFAULT now());
  CREATE TABLE crm_organisations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_name text, updated_at timestamptz DEFAULT now());
  CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid REFERENCES crm_organisations(id) ON DELETE SET NULL, business_name text, contact_name text, email text NOT NULL, updated_at timestamptz DEFAULT now());
  CREATE TABLE sites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid REFERENCES clients(id) ON DELETE SET NULL, organisation_id uuid REFERENCES crm_organisations(id) ON DELETE SET NULL, site_name text, address text, updated_at timestamptz DEFAULT now());
  CREATE TABLE crm_opportunities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES crm_organisations(id) ON DELETE RESTRICT, primary_contact_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, site_id uuid REFERENCES sites(id) ON DELETE SET NULL, previous_opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL, updated_at timestamptz DEFAULT now());
  CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid REFERENCES crm_organisations(id) ON DELETE SET NULL, contact_id uuid REFERENCES clients(id) ON DELETE SET NULL, converted_to_client_id uuid REFERENCES clients(id) ON DELETE SET NULL, site_id uuid REFERENCES sites(id) ON DELETE SET NULL);
  CREATE TABLE crm_opportunity_intakes(opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE, lead_id uuid UNIQUE REFERENCES leads(id) ON DELETE RESTRICT, linked_at timestamptz DEFAULT now(), PRIMARY KEY(opportunity_id,lead_id));
  CREATE TABLE quotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid REFERENCES clients(id) ON DELETE SET NULL, status text, updated_at timestamptz DEFAULT now());
  CREATE TABLE crm_opportunity_quotes(opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE, quote_id uuid UNIQUE REFERENCES quotes(id) ON DELETE RESTRICT, PRIMARY KEY(opportunity_id,quote_id));
  CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL, site_id uuid REFERENCES sites(id) ON DELETE SET NULL, status text, updated_at timestamptz DEFAULT now());
  CREATE TABLE crm_communications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE, contact_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, status text, provider_message_id text, sent_at timestamptz);
  CREATE TABLE crm_opportunity_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE, body text);
  CREATE TABLE contract_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT);
  CREATE TABLE contract_product_sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT, site_id uuid REFERENCES sites(id) ON DELETE RESTRICT);
  CREATE TABLE contract_sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT);
  CREATE TABLE owner_operator_ratings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE);
`)

const migration = readFileSync(`${root}/supabase/client_crm_deletion_migration.sql`, 'utf8')
const bookingLineageFix = readFileSync(`${root}/supabase/client_crm_deletion_booking_lineage_fix_migration.sql`, 'utf8')
await db.exec(migration)
await db.exec(bookingLineageFix)
await db.exec(bookingLineageFix)

const owner = '11111111-1111-4111-8111-111111111111'
await db.query(`INSERT INTO admin_staff_accounts VALUES($1,'test-owner','owner',true)`, [owner])
const actor = JSON.stringify({ id: owner, name: 'test-owner', role: 'owner' })

async function createChain(suffix, communicationStatus = 'sent') {
  const organisation = crypto.randomUUID(), contact = crypto.randomUUID(), site = crypto.randomUUID()
  const opportunity = crypto.randomUUID(), otherOpportunity = crypto.randomUUID()
  const lead = crypto.randomUUID(), otherLead = crypto.randomUUID(), booking = crypto.randomUUID()
  await db.query(`INSERT INTO crm_organisations(id,business_name) VALUES($1,$2)`, [organisation, `Test ${suffix}`])
  await db.query(`INSERT INTO clients(id,organisation_id,email) VALUES($1,$2,$3)`, [contact, organisation, `${suffix}@example.test`])
  await db.query(`INSERT INTO sites(id,client_id,organisation_id,address) VALUES($1,$2,$3,'Test site')`, [site, contact, organisation])
  await db.query(`INSERT INTO crm_opportunities(id,organisation_id,primary_contact_id,site_id) VALUES($1,$3,$2,$4),($5,$3,$2,$4)`, [opportunity, contact, organisation, site, otherOpportunity])
  await db.query(`INSERT INTO leads(id,organisation_id,contact_id,site_id) VALUES($1,$3,$4,$5),($2,$3,$4,$5)`, [lead, otherLead, organisation, contact, site])
  await db.query(`INSERT INTO crm_opportunity_intakes(opportunity_id,lead_id) VALUES($1,$2),($3,$4)`, [opportunity, lead, otherOpportunity, otherLead])
  await db.query(`INSERT INTO crm_communications(opportunity_id,contact_id,status,provider_message_id,sent_at) VALUES($1,$2,$3,'provider-test',now())`, [opportunity, contact, communicationStatus])
  await db.query(`INSERT INTO crm_opportunity_notes(opportunity_id,body) VALUES($1,'Archived note')`, [opportunity])
  await db.query(`INSERT INTO bookings(id,client_id,opportunity_id,site_id,status) VALUES($1,$2,$3,$4,'cancelled')`, [booking, contact, opportunity, site])
  return { organisation, contact, site, opportunity, otherOpportunity, lead, otherLead, booking, email: `${suffix}@example.test` }
}

const success = await createChain('success')
const preview = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [success.opportunity])).rows[0].preview
assert.equal(preview.blocked, false)
assert.equal(preview.opportunities, 2)
assert.equal(preview.contacts, 1)
assert.equal(preview.sites, 1)
assert.equal(preview.leads, 2)
assert.equal(preview.bookings, 1)
await assert.rejects(
  db.query(`SELECT admin_delete_client_crm_record($1,'Remove internal test CRM data',$2::jsonb,true,false,$3)`, [success.opportunity, actor, preview.previewToken]),
  /Owner override is required/,
)
assert.equal((await db.query(`SELECT count(*)::int n FROM crm_organisations WHERE id=$1`, [success.organisation])).rows[0].n, 1)
await db.query(`SELECT admin_delete_client_crm_record($1,'Remove internal test CRM data',$2::jsonb,true,true,$3)`, [success.opportunity, actor, preview.previewToken])
assert.equal((await db.query(`SELECT count(*)::int n FROM crm_organisations WHERE id=$1`, [success.organisation])).rows[0].n, 0)
assert.equal((await db.query(`SELECT count(*)::int n FROM client_crm_deletion_archive WHERE organisation_id=$1`, [success.organisation])).rows[0].n, 1)
assert.equal((await db.query(`SELECT jsonb_array_length(snapshot->'intakeLinks') n FROM client_crm_deletion_archive WHERE organisation_id=$1`, [success.organisation])).rows[0].n, 2)
assert.equal((await db.query(`SELECT count(*)::int n FROM admin_audit_log WHERE entity_ref=$1 AND action='client_crm_deleted'`, [success.organisation])).rows[0].n, 1)

const quoted = await createChain('quote')
const quote = crypto.randomUUID()
await db.query(`INSERT INTO quotes(id,client_id,status) VALUES($1,$2,'pending')`, [quote, quoted.contact])
await db.query(`INSERT INTO crm_opportunity_quotes VALUES($1,$2)`, [quoted.opportunity, quote])
let blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [quoted.opportunity])).rows[0].preview
assert.equal(blocked.blocked, true)
assert.equal(blocked.quotes, 1)
await assert.rejects(db.query(`SELECT admin_delete_client_crm_record($1,'Remove internal test CRM data',$2::jsonb,true,true,$3)`, [quoted.opportunity, actor, blocked.previewToken]), /Linked business or financial records/)
assert.equal((await db.query(`SELECT count(*)::int n FROM client_crm_deletion_archive WHERE organisation_id=$1`, [quoted.organisation])).rows[0].n, 0)

await db.exec(`DELETE FROM crm_opportunity_quotes; DELETE FROM quotes;`)
await db.query(`INSERT INTO contract_products(opportunity_id) VALUES($1)`, [quoted.opportunity])
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [quoted.opportunity])).rows[0].preview
assert.equal(blocked.contractProducts, 1)
assert.equal(blocked.blocked, true)
await db.exec(`DELETE FROM contract_products;`)
await db.query(`INSERT INTO contract_product_sales(opportunity_id,site_id) VALUES($1,$2)`, [quoted.opportunity, quoted.site])
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [quoted.opportunity])).rows[0].preview
assert.equal(blocked.contractSales, 1)
await db.exec(`DELETE FROM contract_product_sales;`)
await db.query(`INSERT INTO contract_sales(booking_id) VALUES($1)`, [quoted.booking])
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [quoted.opportunity])).rows[0].preview
assert.equal(blocked.bookingSales, 1)
await db.exec(`DELETE FROM contract_sales;`)
await db.query(`INSERT INTO owner_operator_ratings(booking_id,client_id) VALUES($1,$2)`, [quoted.booking, quoted.contact])
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [quoted.opportunity])).rows[0].preview
assert.equal(blocked.ratings, 1)

const sending = await createChain('sending', 'sending')
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [sending.opportunity])).rows[0].preview
assert.equal(blocked.blocked, true)
assert.match(blocked.blockers.join(' '), /unresolved delivery outcome/)

const stale = await createChain('stale')
const stalePreview = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [stale.opportunity])).rows[0].preview
const replacementLead = crypto.randomUUID()
await db.query(`DELETE FROM crm_opportunity_intakes WHERE lead_id=$1`, [stale.lead])
await db.query(`DELETE FROM leads WHERE id=$1`, [stale.lead])
await db.query(`INSERT INTO leads(id,organisation_id,contact_id,site_id) VALUES($1,$2,$3,$4)`, [replacementLead, stale.organisation, stale.contact, stale.site])
await db.query(`INSERT INTO crm_opportunity_intakes(opportunity_id,lead_id) VALUES($1,$2)`, [stale.opportunity, replacementLead])
const refreshed = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [stale.opportunity])).rows[0].preview
assert.notEqual(refreshed.previewToken, stalePreview.previewToken)
await assert.rejects(db.query(`SELECT admin_delete_client_crm_record($1,'Remove internal test CRM data',$2::jsonb,true,true,$3)`, [stale.opportunity, actor, stalePreview.previewToken]), /Deletion preview changed/)

const cross = await createChain('cross')
const outside = await createChain('outside')
await db.query(`UPDATE bookings SET site_id=$1 WHERE id=$2`, [cross.site, outside.booking])
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [cross.opportunity])).rows[0].preview
assert.equal(blocked.incomingReferences, 1)
assert.match(blocked.blockers.join(' '), /outside this client chain/)

const staleSite = await createChain('stale-site')
const externalSiteOwner = await createChain('external-site-owner')
await db.query(`UPDATE bookings SET site_id=$1 WHERE id=$2`, [externalSiteOwner.site, staleSite.booking])
const staleSitePreview = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [staleSite.opportunity])).rows[0].preview
assert.equal(staleSitePreview.blocked, false)
assert.equal(staleSitePreview.bookings, 1)
assert.equal(staleSitePreview.crossOrganisationLinks, 0)
await db.query(`SELECT admin_delete_client_crm_record($1,'Remove stale external-site test data',$2::jsonb,true,true,$3)`, [staleSite.opportunity, actor, staleSitePreview.previewToken])
assert.equal((await db.query(`SELECT count(*)::int n FROM bookings WHERE id=$1`, [staleSite.booking])).rows[0].n, 0)
assert.equal((await db.query(`SELECT count(*)::int n FROM sites WHERE id=$1`, [externalSiteOwner.site])).rows[0].n, 1)

const incoming = await createChain('incoming')
const external = await createChain('external')
const incomingSite = crypto.randomUUID(), incomingOpportunity = crypto.randomUUID(), incomingLead = crypto.randomUUID()
await db.query(`INSERT INTO sites(id,client_id,organisation_id,address) VALUES($1,$2,$3,'External site')`, [incomingSite, incoming.contact, external.organisation])
await db.query(`INSERT INTO crm_opportunities(id,organisation_id,primary_contact_id,site_id,previous_opportunity_id) VALUES($1,$2,$3,$4,$5)`, [incomingOpportunity, external.organisation, external.contact, incoming.site, incoming.opportunity])
await db.query(`INSERT INTO leads(id,organisation_id,contact_id,converted_to_client_id,site_id) VALUES($1,$2,$3,$3,$4)`, [incomingLead, incoming.organisation, incoming.contact, incoming.site])
blocked = (await db.query(`SELECT admin_preview_client_crm_deletion($1) preview`, [incoming.opportunity])).rows[0].preview
assert.equal(blocked.blocked, true)
assert.ok(blocked.incomingReferences >= 3)
assert.match(blocked.blockers.join(' '), /outside this client chain/)

await db.exec(`SET ROLE anon;`)
await assert.rejects(db.query(`SELECT admin_preview_client_crm_deletion($1)`, [stale.opportunity]), /permission denied/)
await db.exec(`RESET ROLE;`)
const archivePrivileges = await db.query(`SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='service_role' AND table_name='client_crm_deletion_archive' ORDER BY privilege_type`)
assert.deepEqual(archivePrivileges.rows.map((row) => row.privilege_type), ['INSERT', 'SELECT'])

await db.query(`UPDATE admin_staff_accounts SET active=false WHERE id=$1`, [owner])
await assert.rejects(db.query(`SELECT admin_delete_client_crm_record($1,'Remove internal test CRM data',$2::jsonb,true,true,$3)`, [stale.opportunity, actor, refreshed.previewToken]), /Active owner access required/)

console.log('PASS: CRM deletion migration, booking ownership, archive/audit atomicity, blockers, stale tokens, owner revalidation, cross-client guards and grants')
await db.close()
