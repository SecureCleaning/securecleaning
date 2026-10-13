# Quote metric validation correction

Baseline c2c9cb6. No migration, environment or dependency changes.

Read-only investigation of SC-20261013-41693602 found a saved `Entrance Doors` metric key. It is a legitimate configured field ID: roomTypeConfig retains trimmed user-defined IDs. The new security validator's identifier-only dictionary rule rejected spaces, causing the generic invalid/oversized response before final review/email preparation. The saved quote has 20 rooms and its checked labels/custom-field counts are within limits.

Changes: src/lib/securityInput.ts accepts bounded printable metric keys specifically in room.metrics; tests/input-hardening.test.mjs adds compatibility and security regressions. Other dictionaries stay strict. Keys are still limited to 128 characters and 100 entries; blank/control-character and prototype-related names are rejected. Values remain finite bounded nonnegative numbers or booleans; nested objects reject. Request-body limits and route authorization are unchanged. No public API shape changes; this restores valid existing workflow payload compatibility for both admin and regional-agent routes.

Validation: full type-check, lint, test, build and diff whitespace checks. No production writes, email sends, SMS sends or authenticated browser submission during development. Release verification should load the quote and confirm preparation works without sending a client message unless separately requested. User authorized deployment through the release coordinator on 14 October 2026. Current main and production were verified at c2c9cb6; unrelated product pricing work is excluded. Preparing/publishing a final quote writes data, so release verification must not invoke that action or send a message.
