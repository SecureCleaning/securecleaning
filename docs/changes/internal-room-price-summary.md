# Internal room price summary

Baseline: verified Ready production 8ae8596fa59f18ebca781562acce1a878dab598b.

Adds Room prices beside Save in QuoteWorkflowEditor's floating room controls. Opens a compact, read-only native dialog showing all draft rooms in order, their quantities, sqm each and current calculated per-visit values excluding GST. Uses the existing memoized getRoomPricingBreakdown output, so unsaved editor changes are included and no calculation is duplicated. The room subtotal and overall working quote are separately labelled; whole-job add-ons, minimum call-out and final overrides are not allocated to rooms.

The shared editor serves administrators and authorized regional agents. Existing server-side quote access checks remain unchanged. The summary is not added to client documents, public views, email payloads or APIs. Native dialog supplies modal focus containment, Escape dismissal and focus return. Long lists scroll within the summary.

Changed files:
- src/components/admin/QuoteWorkflowEditor.tsx
- src/components/admin/RoomPriceSummary.tsx
- docs/changes/internal-room-price-summary.md

No migration, API/data contract, dependency or environment changes. No production records or user browser drafts changed. Deployment has not been requested for this feature.

Validation: type-check and lint passed; all 611 tests passed (localhost test required sandbox escalation); production build with placeholder DB credentials passed; git diff --check passed. React quality review completed. Browser verification used the actual summary component on a temporary local-only fixture with 26 dummy rooms: open/Close/Escape, native focus return, all rows accessible by internal scrolling, subtotal $260, then changing draft first-room value $10 to $25 updated first row and subtotal to $275 without saving. Temporary route removed and server/tab closed. Screenshot: /private/tmp/sc-room-price-summary.png. Existing live quote untouched. Production integration/browser verification awaits deployment; small screens/long labels may require scrolling.
