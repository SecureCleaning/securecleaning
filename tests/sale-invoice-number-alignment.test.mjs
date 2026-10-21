import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261022094041_align_future_sale_invoice_numbers.sql', import.meta.url), 'utf8')

test('future sale invoices reserve the sale sequence without rewriting existing identifiers', () => {
  assert.match(sql, /LOCK TABLE public\.contract_product_sales, public\.contract_sale_invoices IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS aligned_invoice_number TEXT/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_product_sales_aligned_invoice_number/)
  assert.match(sql, /MAX\(\(SUBSTRING\(sale_code FROM '\(\[0-9\]\+\)\$'\)\)::BIGINT\)/)
  assert.match(sql, /MAX\(\(SUBSTRING\(invoice_number FROM '\(\[0-9\]\+\)\$'\)\)::BIGINT\)/)
  assert.match(sql, /ALTER COLUMN invoice_number SET DEFAULT[\s\S]+nextval\('public\.contract_sale_code_seq'\)/)
  assert.match(sql, /BEFORE INSERT ON public\.contract_product_sales[\s\S]+reserve_contract_sale_invoice_number/)
  assert.match(sql, /NEW\.aligned_invoice_number := REGEXP_REPLACE\(NEW\.sale_code, '\^PS-', 'SCINV-'\)/)
  assert.match(sql, /IF NEW\.invoice_type = 'sale'[\s\S]+NEW\.invoice_number := reserved_number/)
  assert.match(sql, /OLD\.aligned_invoice_number IS DISTINCT FROM NEW\.aligned_invoice_number/)
  assert.doesNotMatch(sql, /UPDATE\s+public\.contract_product_sales\s+SET\s+aligned_invoice_number/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reserve_contract_sale_invoice_number\(\) FROM PUBLIC, anon, authenticated/)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.protect_contract_product_sale_snapshot/ )
  assert.match(sql, /BEGIN;[\s\S]+COMMIT;\s*$/)
})
