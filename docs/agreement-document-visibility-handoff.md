# Agent document visibility and reuse

Source b3b0, verified clean production baseline a12dc24c21c439cd270382d80d58e5fc8282aa10 / Ready dpl_6R4o6zsGhiNR8ygUtRD3u3UEk9RX. User approved implementation; no new deployment request yet.

## Changes

- Agent/admin Agreement tab now includes Current agreement documents: current signed PDF, updated/replaced label, agreement update timestamp, active supporting PDFs with upload dates and versions, overall document update date, refresh control.
- GET agreement-documents?view=current uses existing sale/region authorization and an explicit safe response mapping. Supporting downloads recheck active membership; removed/voided evidence and private history/reasons/actors/storage paths remain excluded. Existing admin history route and write restrictions remain.
- Admin Replace incorrect upload now offers Choose a new PDF or Use uploaded file. This reuses the stored supporting PDF in the existing atomic correction RPC, with reason, review checkbox, expected revision/path and audit history. Changing Replace/Add preserves a selected local file, avoiding needless reselection.
- Add supporting document remains a supporting attachment; it is visible to agents but does not silently establish signature acceptance. An already uploaded file can be made the signed replacement without uploading again. It remains listed as supporting too; both links reference the same private object.

## Files and rollout

Modified agreement document route/service/UI, ContractSalesWorkspace, DB test. New AgreementDocumentSummary, agreementDocumentVisibility, visibility tests, migration 20261028223817_reuse_supporting_agreement_document.sql. Migration updates the existing RPC to validate a selected support event belongs to the exact sale/agreement and is not removed; it derives filename/path server-side, then applies normal replacement rules. Apply before app. No row backfill/live corrections, environment or dependency changes.

## Verification

657/657 tests; type-check, lint, production build and diff-check passed. PGlite synthetic DB tests cover existing correction behaviours plus reuse, missing/removed source rejection, caller-path override rejection, clearing correction flag and preserved active-plan records. Visibility tests cover redaction, replacement dates, support-only semantics, removed/void filtering and current-version selection.

Local browser test rendered real React components with synthetic fetch responses, never production APIs: confirmed supporting document/upload date visible, selected existing support, entered reason/review, saved without any file upload, observed updated signed PDF/date and cleared pending warning. Temporary harness /tmp/sc-doc-ui, screenshot /tmp/sc-doc-ui/verified.png. This is a component interaction test, not authenticated production end-to-end verification. No live customer file, record, payment, email or calendar changes. Staff-authenticated production smoke test remains for release verification.
