# Contract sale electronic acceptance — deferred enhancement

The current authoritative process is to email a versioned agreement and upload the returned signed PDF. A future first-party online acceptance flow does not inherently require third-party signing software, but it must be more than a checkbox.

Before enabling online acceptance, implement and review:

- a single-use, expiring cleaner link bound to one immutable agreement version;
- clear display and downloadable retention of the complete agreement before acceptance;
- positive confirmation of identity, authority and intent to sign;
- an acceptance record containing agreement hash, version, signer name, UTC time and narrowly retained security evidence;
- consent to electronic execution and delivery;
- an emailed copy or durable download supplied immediately after acceptance;
- revocation, expiry and superseded-version handling;
- audit logging, rate limiting and protection against link forwarding or replay;
- privacy disclosure and a retention schedule for IP/device evidence;
- Australian legal review of the execution method and agreement terms.

Do not infer acceptance merely from payment, a site inspection, page viewing or commencement activity.
