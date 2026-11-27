# Cove commission migration preservation evidence

Verified 27 November 2026 by SC Release Coordinator.

- Baseline production: cd7a3b52d145e7dc96856b61d3c0c05c29bff3ac.
- Repository migration: 20261127010756_enquiry_source_commission_rules.sql.
- Applied database history: 20261127022338, enquiry_source_commission_rules. These identify the same migration; do not replay because timestamps differ.
- Production connector reported success. New rule: Cove Commercial Cleaning, Renata account 72bddeab-8e0e-4bb2-bee4-c48cafbeede6, 6000 basis points, active, revision 1.
- All 11 existing sales have NULL commission_source_snapshot. No backfill, retry, source edit, assignment correction, customer write or send was performed.
- RLS enabled; anon/authenticated SELECT denied, anon rule save and authenticated retry execution denied; service_role SELECT allowed.
- All 32 before/after table counts and digests matched exactly. Digests cover sorted hashes of each complete JSON row, excluding only the newly added commission_source_snapshot key. No customer content is recorded here.
- Coordinator validation: type-check, lint, 932 tests, isolated actual SQL migration tests, production build and diff check passed. Live authenticated visual QA remains separate.

| Table | Rows | Matching before/after MD5 |
|---|---:|---|
| clients | 191 | 92be43a81c0173f2d54f739450f5c6ba |
| contract_commission_assignments | 9 | e06ba42557328e6be35aad4e4c02c6f3 |
| contract_commission_claims | 7 | 5cfab412fc96f5961231ddd54c2f3977 |
| contract_commission_invoice_allocations | 7 | d6fad1af1d1b1a997e51a18ae383fcc8 |
| contract_commission_payouts | 7 | 425a8b54c5dac1a800e83425f07767e3 |
| contract_commission_received_invoices | 1 | 42026f7de680f686f44e9690b79b8e2e |
| contract_commission_revisions | 1 | 63411358ab1b3c156292fc3c3017d8b2 |
| contract_commission_settings | 1 | 5e36924bcc467efcf3bcc9f5f925bcf0 |
| contract_product_sales | 11 | bf15e743868d77894d333d3fd7d9d336 |
| contract_products | 21 | 4f34f42ae7f7cb5664378ed298b09b99 |
| contract_sale_agreements | 14 | ed5ee8ba3ac1d1fa73d539035a470009 |
| contract_sale_client_service_agreements | 1 | 546a641becea551c083b1be751087807 |
| contract_sale_inspections | 9 | a423ddc6f87abf1c71a849476bf8a13d |
| contract_sale_invoice_bank_revisions | 1 | 6c86e28f1920a05d0525eb84d664c87e |
| contract_sale_invoice_email_deliveries | 9 | fe37face7296b97723aa43ccaea60ada |
| contract_sale_invoices | 10 | 109cea435af85cec40e44c6337729575 |
| contract_sale_payment_allocations | 14 | d4246d73a70be1480b0bfa452b37d6ec |
| contract_sale_payment_plan_instalments | 12 | e3a6037607eb13870fad572f7e8a526f |
| contract_sale_payment_plans | 5 | 89281c9b6bae450fca91e6f26fad2a63 |
| contract_sale_payments | 16 | 6839e5c72846c9f3a03270e47700244d |
| contract_sale_price_amendments | 2 | d2986102846b0a25b20279f6e6a962ad |
| contract_sale_site_assignments | 5 | 19c71040f925def5ddda893231e2a7de |
| contract_sales | 0 | d41d8cd98f00b204e9800998ecf8427e |
| crm_lead_import_rows | 125 | 31391bd547c6c45adfa5af12e0bb08f3 |
| crm_opportunities | 191 | b618e988d3567290f4ea4ee965d8996e |
| crm_opportunity_intakes | 192 | f747afc2acfe45221272d565b2f56be6 |
| crm_opportunity_notes | 73 | 8427c61552d7af741280dec5185b61ad |
| crm_opportunity_quotes | 31 | 74a0d88a99cfa11d5e43c731cae1eb33 |
| crm_organisations | 191 | 1de7f209dd761da36ac1ba315430c175 |
| leads | 192 | 467c3d04734dded42910da18b0e70b77 |
| quotes | 31 | 78e2923de3eadb313db95d69dce2ecbe |
| sites | 181 | fc6d07b24e38712db841b4d896f5a6ce |
