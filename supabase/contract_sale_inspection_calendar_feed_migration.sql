-- Secure Cleaning - publish product-sale inspections to linked agent calendar feeds.
-- Apply after contract_sale_inspection_communications_checklist_migration.sql.

BEGIN;

ALTER TABLE public.contract_sale_inspections
  DROP CONSTRAINT IF EXISTS contract_sale_inspections_calendar_status_check;

ALTER TABLE public.contract_sale_inspections
  ADD CONSTRAINT contract_sale_inspections_calendar_status_check
  CHECK (calendar_status IN ('pending','created','updated','subscription_feed','email_fallback','failed'));

UPDATE public.contract_sale_inspections AS inspection
SET calendar_status = 'subscription_feed',
    calendar_error = NULL
FROM public.admin_staff_accounts AS staff
WHERE inspection.scheduled_by_staff_id = staff.id
  AND inspection.calendar_status = 'email_fallback'
  AND staff.active = TRUE
  AND staff.availability_assignee_id IS NOT NULL;

COMMIT;
