# Cleaner purchase agreement document corrections

Baseline: verified production f38f3b9966b3601f663262b5b1ca7e2ba0a6dd42, Ready dpl_5cCZbU1Ae2v2wGw7GRoSmMVtgMqX. Source: b3b0 checkout. User approved implementation, not deployment in this turn.

## Behaviour

Owners/managers can open Manage signed documents in Product Sales / Agreement, choose Replace incorrect upload, Add supporting document, Remove incorrect upload, or Remove supporting document, enter a reason, preview a selected PDF, and confirm review. PDFs retain existing 10 MB/type/signature checks. No emails, calendar actions or payment changes occur.

Replacement changes the current signed PDF, preserving prior evidence in restricted append-only history. Removal makes the agreement unsigned, retains its old evidence, and flags correction pending to all sale viewers. A new handover is blocked at the database even if another old agreement is signed. Existing completed handovers and plans are not reversed. Replacing the removed upload clears the flag. First-signature uploads retain their original workflow; after removal the ordinary upload endpoint directs users to the admin correction action.

Supporting documents never establish acceptance. Removing them archives their evidence. A version selector permits corrections to an earlier agreement; history remains visible across agreement versions, with actor, time, reason and downloadable before/after PDFs, available only to owners/managers. Changes to contract terms still require the existing agreement version workflow.

## Files / contracts

- New AgreementDocuments component; small insertion in ContractSalesWorkspace.
- New agreementDocumentPolicy and agreementDocuments services.
- New GET/POST /api/admin/contract-sales/agreement-documents: authenticated admin list, restricted history PDF download and multipart correction action.
- contractSales adds optional agreement.documentCorrectionPending and blocks ordinary re-upload after a removal.
- Migration 20261027232911_contract_sale_agreement_documents.sql adds document_revision/document_correction_pending, a private append-only events table, transactional correction RPC, narrow immutable-evidence trigger exception, payment-plan trigger preservation and handover guard.
- tests/agreement-documents.test.mjs; standalone tests/agreement-documents-db.mjs.

## Rollout

Migration MUST precede application release (the sale loader selects the new column). No historical PDFs are rewritten or removed; existing rows gain revision 0/pending false. No new environment variables or project dependencies. Forward migration reviewed locally; production application/migration left to release coordinator.

## Verification

Full suite: 653 passed. Type check, lint and production build passed using synthetic build environment. Isolated PGlite database exercised replacement, supporting uploads/removal, removed-signature restoration, stale revisions, denied agent/anonymous access, immutable evidence/history, atomic audit insertion (including forced audit-failure rollback), handover block and unchanged active/completed payment-plan rows. It uses synthetic minimal prerequisite tables, the actual migration and existing agreement triggers. Run with PGLITE_MODULE pointing at an installed PGlite module; no production credentials needed.

Authenticated browser/upload verification has not been performed. No live sale, upload, payment or message was changed. Release smoke test should use a dedicated fixture and confirm preview, correction, download and cross-version history. Network-ambiguous correction failures retain uploaded private objects rather than risking deletion of a committed replacement; refresh history before retrying. Unreferenced failed-upload objects may require later administrative cleanup.
