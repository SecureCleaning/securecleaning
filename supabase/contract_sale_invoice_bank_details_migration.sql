-- Apply after the tax-invoice, rich-text and commission/plan migrations.
-- Additive; restores columns also present in the earlier unreleased preview/history migration.
BEGIN;
ALTER TABLE public.contract_sale_invoice_templates
 ADD COLUMN IF NOT EXISTS bank_account_name text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_bsb text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_account_number text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS payment_reference_template text NOT NULL DEFAULT '{invoice_number}';
ALTER TABLE public.contract_sale_invoices
 ADD COLUMN IF NOT EXISTS bank_account_name_snapshot text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_name_snapshot text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_bsb_snapshot text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_account_number_snapshot text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS payment_reference_template_snapshot text NOT NULL DEFAULT '{invoice_number}';
CREATE TABLE IF NOT EXISTS public.contract_sale_invoice_bank_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invoice_id uuid NOT NULL REFERENCES public.contract_sale_invoices(id) ON DELETE RESTRICT,
 actor_staff_id uuid NOT NULL REFERENCES public.admin_staff_accounts(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 bank_account_name_snapshot text NOT NULL CHECK(length(trim(bank_account_name_snapshot)) BETWEEN 2 AND 160),
 bank_name_snapshot text NOT NULL CHECK(length(bank_name_snapshot)<=120),
 bank_bsb_snapshot text NOT NULL CHECK(bank_bsb_snapshot ~ '^[0-9]{3}-[0-9]{3}$'),
 bank_account_number_snapshot text NOT NULL CHECK(bank_account_number_snapshot ~ '^[0-9 -]+$' AND length(regexp_replace(bank_account_number_snapshot,'[^0-9]','','g')) BETWEEN 4 AND 16),
 payment_reference_template_snapshot text NOT NULL CHECK(length(payment_reference_template_snapshot) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS contract_sale_invoice_bank_revisions_invoice_idx ON public.contract_sale_invoice_bank_revisions(invoice_id,id DESC);
ALTER TABLE public.contract_sale_invoice_bank_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_sale_invoice_bank_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT ON public.contract_sale_invoice_bank_revisions TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.contract_sale_invoice_bank_revisions_id_seq TO service_role;
CREATE OR REPLACE FUNCTION public.guard_contract_invoice_bank_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Bank revision history is immutable.'; END IF;
 PERFORM 1 FROM admin_staff_accounts WHERE id=NEW.actor_staff_id AND active AND role::text='owner' FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM contract_product_sales s JOIN contract_sale_invoices i ON i.sale_id=s.id
 WHERE i.id=NEW.invoice_id AND i.status::text<>'void' AND s.status::text<>'cancelled' FOR UPDATE OF s,i;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select a current invoice.'; END IF;
 INSERT INTO admin_audit_log(entity_type,entity_ref,action,details) VALUES
 ('contract_sale_invoice',NEW.invoice_id::text,'contract_sale.invoice_bank.applied',jsonb_build_object('actorId',NEW.actor_staff_id,'revisionId',NEW.id));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_invoice_bank_revision() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_invoice_bank_revision_guard ON public.contract_sale_invoice_bank_revisions;
CREATE TRIGGER contract_invoice_bank_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contract_sale_invoice_bank_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_contract_invoice_bank_revision();
CREATE OR REPLACE FUNCTION public.guard_contract_invoice_bank_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF ROW(OLD.bank_account_name_snapshot,OLD.bank_name_snapshot,OLD.bank_bsb_snapshot,OLD.bank_account_number_snapshot,OLD.payment_reference_template_snapshot)
 IS DISTINCT FROM ROW(NEW.bank_account_name_snapshot,NEW.bank_name_snapshot,NEW.bank_bsb_snapshot,NEW.bank_account_number_snapshot,NEW.payment_reference_template_snapshot) THEN
 RAISE EXCEPTION 'Original invoice bank details are immutable. Record a bank revision.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_invoice_bank_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_invoice_bank_snapshot_guard ON public.contract_sale_invoices;
CREATE TRIGGER contract_invoice_bank_snapshot_guard BEFORE UPDATE ON public.contract_sale_invoices FOR EACH ROW EXECUTE FUNCTION public.guard_contract_invoice_bank_snapshot();
COMMIT;
