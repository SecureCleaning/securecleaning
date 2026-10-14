# Quote email preview

Baseline: origin/main eb431f4. Implementation isolated at /private/tmp/sc-email-preview-20261014 to preserve unrelated uncommitted work in this checkout. Apply sibling quote-email-preview-20261014.patch to a clean release checkout.

## Changes

- src/components/admin/QuoteWorkflowEditor.tsx: Preview email beside Send final quote, existing EmailPreviewModal, busy state and error handling. Shared by owner and regional-agent views.
- src/lib/email.ts: shared buildUpdatedQuoteEmail renderer; only sendUpdatedQuoteEmail creates customer capability and sends.
- src/app/api/admin/quotes/[ref]/send/route.ts and src/app/api/availability-agent/[assigneeId]/quotes/[ref]/send/route.ts: additive previewOnly=true response {success,preview} with no-store, after existing auth, region, final document, recipient and content validation; before SMS permission, send claims or provider calls.
- tests/quote-email-cc.test.mjs: renderer parity, no preview capability/send, admin/agent authorization, recipient and region enforcement, no consent mutation.

No migrations, environment changes, dependencies or data migrations. No emails/SMS sent, live quotes changed, or deployment performed. Preview links intentionally omit customer capability tokens and rely on staff authentication; sent links retain existing tokens. Closing preview leaves send as an explicit separate action.

## Validation

Initial full suite passed: type-check, lint, 563 tests, production build using placeholder database credentials. Final repeat after busy-state refinement also passed all four checks (563/563 tests). Forward patch application and git diff --no-index --check passed. Release Coordinator read-only review found no blocking issues and independently passed 38 focused tests.

No signed-in browser verification performed. At release, verify admin and authorized regional-agent preview opens with sender/recipient/CC/reply-to, edited subject/message, price and links; close preview and confirm no new email/SMS activity. Do not send to a client as a smoke test. User authorized deployment through Release Coordinator on 14 October 2026. Production and main baseline verified at eb431f4. Live catalog check found no already-reviewed, unsent final quote eligible for a no-write composer smoke test; SC-20261013-41693602 is already sent. Do not publish another quote merely to test the UI. Signed-in preview button/modal verification remains a limitation until an eligible quote is naturally available.
