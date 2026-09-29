# Private field storage rollout

Status: schema prepared locally; authentication, provisioning, API, client sync,
media uploads, backup automation and cross-device verification are NOT enabled.

## Storage and access

- Use a dedicated Cloudflare D1 database, separate from fetched public job data.
- Apply migrations/private-sync/0001_field_records.sql only to that database.
- Keep R2 object storage private, with no r2.dev public URL or public domain.
- Authorize the one user-designated email from the project working plan through
  Cloudflare Access. Keep the allowlist in server configuration, not browser input.
- Verify Access JWT signature, expiry, issuer and application audience, then
  verify the email allowlist. An email header by itself is not authentication.
- All API operations must be owner-scoped. Reject missing auth/configuration;
  require the expected same-origin Origin for writes. No wildcard CORS.
- Do not reuse the legacy worker's origin-only protection for private records.

## Write contract

- Every write carries an operation ID and the revision last read by the client.
- Reject stale revisions with a conflict response; never silently overwrite.
- Commit the revision update and event in the same database transaction/batch.
- Duplicate operation IDs must return the original acknowledgement, not replay.
- Preserve appointment, note and visit history; never infer completion/archive.
- Store files under immutable server-generated object keys; validate size/type
  and checksum. Metadata alone is not proof that upload completed.

## Migration and offline behavior

- Export and preserve browser records before any import or merge.
- Do not auto-upload local records until the owner signs in and reviews import.
- Maintain a durable client outbox; acknowledge Saved to cloud only after server
  confirmation. Other states are Waiting to sync, Conflict and Save failed.
- Test two separate client sessions, offline retries, duplicates and sign-out.
- Include Jobs, map, paperwork and appointment views in shared-state integration.

## Recovery and release gates

- Configure D1 recovery plus scheduled exports and an independent backup copy.
- Preserve immutable document versions and file checksums; test a full restore.
- Verify unauthorized, expired-token and wrong-email requests cannot read/write.
- Run synthetic-only tests before importing real records. Schema test command:
  node scripts/test-private-sync-schema.cjs (Node 22.15+).
- Verify signed-in phone/computer continuity before calling the rollout complete.

Reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
