# Accepted remote quote corrections

Apply supabase/migrations/20261007070456_accepted_remote_quote_correction.sql before deploying the app. It adds one service-role-only RPC; no existing rows are changed. The RPC independently checks the actor is an active owner, locks the quote, checks updated_at and absence of a final document, requires accepted status and rejects unresolved sends. Original estimate inputs/result remain intact; the previous workflow and inspection are saved in private audit history. Existing version-history triggers handle subsequent final revisions.

The owner sees Save accepted correction + open preview even for accepted remote quotes without a final document. This creates version 1 while retaining Accepted. Subsequent saves use the existing versioned revision path. Non-owners remain locked. The request adds initializeAccepted and expectedUpdatedAt; older requests cannot silently unlock accepted quotes. The workflow read response adds updatedAt.

No email/SMS, product, invoice, agreement or customer acceptance is generated. The live final quote/scope updates when saved. No actual quote variables are changed by deployment; the owner must enter and save the desired values. No dependencies change.

Validate owner correction, repeated versioned save, stale concurrent tabs, non-owner rejection, and preview after deployment using fictional records only unless the owner has specified real changes. Local tests exercise the protected API and the RPC in disposable PGlite. Production mutation and visual end-to-end checks are not performed during implementation.
