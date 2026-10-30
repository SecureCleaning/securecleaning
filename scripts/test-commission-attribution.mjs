// Isolated in-memory PostgreSQL. No project connection, credentials or email provider.
// PGLITE_MODULE_PATH=/absolute/path/to/pglite/dist/index.js node scripts/test-commission-attribution.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
if (!process.env.PGLITE_MODULE_PATH) throw new Error('Set PGLITE_MODULE_PATH to the local test-only PGlite installation.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const scalar=async sql=>(await db.query(sql)).rows[0]
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE admin_staff_accounts(id uuid PRIMARY KEY,active boolean,role text,availability_assignee_id text);
    CREATE TABLE quotes(id uuid PRIMARY KEY,final_quote_sent_by jsonb,final_quote_sent_at timestamptz,quote_ref text);
    CREATE TABLE quote_final_document_versions(quote_ref text,document_version integer,sent_by jsonb,sent_at timestamptz,sent_variant text);
    CREATE TABLE quote_send_attempts(id uuid,quote_ref text,status text,actor jsonb,document_variant text,finalized_at timestamptz);
    CREATE TABLE contract_product_sales(id uuid PRIMARY KEY,sale_code text,status text,source_quote_id uuid,created_by_staff_id uuid,product_id uuid);
    CREATE TABLE contract_commission_settings(id boolean PRIMARY KEY,win_bps integer,sale_bps integer);
    CREATE TABLE contract_commission_assignments(sale_id uuid PRIMARY KEY,win_agent_id uuid,sale_agent_id uuid,win_bps integer,sale_bps integer,created_by uuid,created_at timestamptz);
    CREATE TABLE admin_audit_log(entity_type text,entity_ref text,action text,details jsonb);
    CREATE TABLE contract_sale_invoices(id uuid PRIMARY KEY,sale_id uuid,total_inc_gst_cents integer,gst_component_cents integer,status text);
    CREATE TABLE contract_sale_payment_allocations(invoice_id uuid,amount_cents integer);
    CREATE TABLE contract_sale_payment_plans(id uuid PRIMARY KEY,sale_id uuid,status text);
    CREATE TABLE contract_sale_agreements(payment_plan_id uuid,status text);
    CREATE TABLE contract_commission_claims(sale_id uuid,agent_id uuid,amount_cents integer);
    CREATE TABLE contract_commission_payouts(sale_id uuid,agent_id uuid,amount_cents integer);
    INSERT INTO admin_staff_accounts VALUES('${id(1)}',true,'agent','profile1'),('${id(2)}',true,'agent','profile2');
    INSERT INTO contract_commission_settings VALUES(true,2000,2000);
    INSERT INTO quotes VALUES('${id(3)}',null,null,'Q-original');
    INSERT INTO quotes VALUES('${id(40)}',null,null,'Q-repair');
    INSERT INTO quote_send_attempts VALUES('${id(41)}','Q-repair','finalized','{"kind":"staff_account","id":"${id(1)}"}','final',now());
    INSERT INTO contract_product_sales VALUES('${id(42)}','PS-2026-01007','active_payment_plan','${id(40)}','${id(2)}',null);
    INSERT INTO contract_product_sales VALUES('${id(4)}','PS-history','completed','${id(3)}','${id(2)}',null);
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261029215838_commission_attribution_review.sql',import.meta.url),'utf8'))
  const repaired=await scalar(`SELECT * FROM contract_commission_assignments WHERE sale_id='${id(42)}'`)
  assert.equal(repaired.win_agent_id,id(1));assert.equal(repaired.sale_agent_id,id(2));assert.equal(repaired.win_bps,2000)
  // Remove only isolated fixture rows so subsequent generic counts remain explicit.
  await db.exec(`DELETE FROM contract_commission_assignments WHERE sale_id='${id(42)}'; DELETE FROM contract_product_sales WHERE id='${id(42)}'; DELETE FROM admin_audit_log WHERE entity_ref='${id(42)}'`)
  let r=await scalar(`SELECT * FROM contract_commission_attribution_status WHERE sale_id='${id(4)}'`)
  assert.equal(r.has_assignment,false);assert.equal(r.win_agent_id,null);assert.equal(r.sale_agent_id,id(2))
  await db.exec(`UPDATE contract_product_sales SET status='active_payment_plan' WHERE id='${id(4)}'`)
  assert.equal((await scalar('SELECT count(*)::int n FROM contract_commission_assignments')).n,0)
  await db.exec(`UPDATE quotes SET final_quote_sent_by='{"kind":"staff_account","id":"${id(1)}"}',final_quote_sent_at=now() WHERE id='${id(3)}'`)
  r=await scalar('SELECT * FROM contract_commission_assignments')
  assert.equal(r.win_agent_id,id(1));assert.equal(r.sale_agent_id,id(2));assert.equal(r.win_bps,2000)
  await db.exec(`UPDATE contract_commission_settings SET win_bps=2500; UPDATE contract_product_sales SET status='completed' WHERE id='${id(4)}'; UPDATE quotes SET final_quote_sent_at=now() WHERE id='${id(3)}';`)
  assert.equal((await scalar('SELECT win_bps FROM contract_commission_assignments')).win_bps,2000)
  assert.equal((await scalar('SELECT count(*)::int n FROM admin_audit_log')).n,1)
  // Revising a sent quote clears current-version fields but not commission evidence.
  await db.exec(`INSERT INTO quote_send_attempts VALUES('${id(20)}','Q-original','finalized','{"kind":"staff_account","id":"${id(1)}"}','final',now()); UPDATE quotes SET final_quote_sent_by=null,final_quote_sent_at=null WHERE id='${id(3)}'; INSERT INTO contract_product_sales VALUES('${id(21)}','PS-revised','active_payment_plan','${id(3)}','${id(2)}',null)`)
  assert.equal((await scalar(`SELECT win_agent_id FROM contract_commission_assignments WHERE sale_id='${id(21)}'`)).win_agent_id,id(1))
  // A failed attempt by another agent cannot steal the retained attribution.
  await db.exec(`INSERT INTO quote_send_attempts VALUES('${id(22)}','Q-original','failed','{"kind":"staff_account","id":"${id(2)}"}','final',now());`)
  assert.equal((await scalar(`SELECT win_agent_id FROM contract_commission_attribution_status WHERE sale_id='${id(21)}'`)).win_agent_id,id(1))
  await db.exec(`INSERT INTO quotes VALUES('${id(23)}',null,null,'Q-archived'); INSERT INTO quote_final_document_versions VALUES('Q-archived',1,'{"kind":"staff_account","id":"${id(1)}"}',now(),'final'); INSERT INTO contract_product_sales VALUES('${id(24)}','PS-archived','active_payment_plan','${id(23)}','${id(2)}',null)`)
  assert.equal((await scalar(`SELECT win_agent_id FROM contract_commission_assignments WHERE sale_id='${id(24)}'`)).win_agent_id,id(1))
  // The original sender keeps site-winning credit even if another agent resends.
  await db.exec(`INSERT INTO quote_send_attempts VALUES('${id(25)}','Q-original','finalized','{"kind":"staff_account","id":"${id(2)}"}','final',now()+interval '1 day'); UPDATE quotes SET final_quote_sent_by='{"kind":"staff_account","id":"${id(2)}"}',final_quote_sent_at=now()+interval '1 day' WHERE id='${id(3)}'; INSERT INTO contract_product_sales VALUES('${id(26)}','PS-after-resend','active_payment_plan','${id(3)}','${id(2)}',null)`)
  assert.equal((await scalar(`SELECT win_agent_id FROM contract_commission_assignments WHERE sale_id='${id(26)}'`)).win_agent_id,id(1))
  // Two accounts matching a legacy session must never pick a winner arbitrarily.
  await db.exec(`INSERT INTO admin_staff_accounts VALUES('${id(5)}',true,'agent','profile1'); INSERT INTO quotes VALUES('${id(6)}','{"kind":"agent_session","id":"profile1"}',now(),'Q-ambiguous'); INSERT INTO contract_product_sales VALUES('${id(7)}','PS-ambiguous','completed','${id(6)}','${id(2)}',null);`)
  assert.equal((await scalar(`SELECT has_assignment FROM contract_commission_attribution_status WHERE sale_id='${id(7)}'`)).has_assignment,false)
  await db.exec(`INSERT INTO contract_product_sales VALUES('${id(8)}','PS-cancelled','cancelled','${id(3)}','${id(2)}',null)`)
  assert.equal((await scalar(`SELECT has_assignment FROM contract_commission_attribution_status WHERE sale_id='${id(8)}'`)).has_assignment,false)
  assert.equal((await scalar("SELECT has_table_privilege('anon','contract_commission_attribution_status','SELECT') allowed")).allowed,false)
  assert.equal((await scalar("SELECT has_function_privilege('authenticated','try_assign_contract_sale_commission(uuid)','EXECUTE') allowed")).allowed,false)
  // Exercise the actual production commission view with successive allocated receipts.
  const source=readFileSync(new URL('../supabase/contract_sale_commissions_plans_migration.sql',import.meta.url),'utf8')
  await db.exec(source.slice(source.indexOf('CREATE OR REPLACE VIEW contract_commission_balances AS'),source.indexOf('CREATE OR REPLACE FUNCTION manage_contract_commission')))
  await db.exec(`INSERT INTO contract_sale_invoices VALUES('${id(9)}','${id(4)}',330000,30000,'part_paid'); INSERT INTO contract_sale_payment_plans VALUES('${id(10)}','${id(4)}','awaiting_acceptance'); INSERT INTO contract_sale_agreements VALUES('${id(10)}','sent'); INSERT INTO contract_sale_payment_allocations VALUES('${id(9)}',50000);`)
  const earned=async()=>Number((await scalar('SELECT sum(earned_cents) n FROM contract_commission_balances')).n)
  assert.equal(await earned(),0)
  await db.exec(`UPDATE contract_sale_payment_plans SET status='active'; UPDATE contract_sale_agreements SET status='signed'`)
  assert.equal(await earned(),18182)
  await db.exec(`INSERT INTO contract_commission_claims VALUES('${id(4)}','${id(1)}',9091); INSERT INTO contract_sale_payment_allocations VALUES('${id(9)}',100000)`)
  assert.equal(await earned(),54545)
  assert.equal(Number((await scalar('SELECT sum(earned_cents-claimed_cents) n FROM contract_commission_balances')).n),45454)
  await db.exec(`INSERT INTO contract_sale_payment_allocations VALUES('${id(9)}',180000); UPDATE contract_sale_payment_plans SET status='completed'`)
  assert.equal(await earned(),120000)
  await db.exec(`UPDATE contract_product_sales SET status='cancelled' WHERE id='${id(4)}'`)
  assert.equal(await earned(),0)
  console.log('PASS: historical flags, missing attribution, late sender retry, immutable existing rates, idempotent audit, ambiguous identities, cancelled sales, restricted permissions, progressive signed-plan receipts, claimed balance and cancellation.')
} finally {await db.close()}
