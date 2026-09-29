# Private field storage rollout

## Current decision: Google Drive

The user selected their existing Google Drive account on September 28, 2026,
and rejected payment/billing activation. This supersedes the Cloudflare design
below. Do not activate Zero Trust billing, provision R2, or apply the D1 migration.
The empty database is unused and must not be deleted without authorization.

Status: Drive connector access was verified, but the deployed app does NOT yet
have Drive authorization, durable cloud sync, uploads or restore verification.
The connector session must never be copied into the app. Existing local data
remains authoritative until a reviewed import succeeds.

### Implementation sequence

1. Configure separate Google web-app OAuth authorization using `drive.file` and
   authenticated account identity. Restrict sign-in to the approved owner from
   the working plan. Do not reuse or replace Gmail fetch credentials. Verify
   identity server-side, OAuth state/PKCE and authorized origins/redirects. Keep
   refresh tokens encrypted server-side, never in Git or browser localStorage.
2. Create an app-owned private HPD Field Records folder. To use an existing
   folder, have the owner explicitly select it through Google Picker; connector
   visibility does not grant the app access. Never change sharing or publish
   tenant data. Check available quota; stop rather than enable paid overages.
3. Save each operation as an immutable record with stable operation ID, job ID,
   device ID and parent revision IDs. Preserve concurrent branches for explicit
   conflict resolution; never overwrite a shared whole-job CSV with last-writer
   wins. Use stable file IDs for retries and paginate all Drive listings.
4. Integrate the existing job override store with a durable offline outbox.
   Preserve local records before import. Acknowledge cloud save only after a
   successful Drive write/readback; distinguish local, pending, failed and
   conflict states. Include map, Jobs, appointment and paperwork views.
5. Upload original before/after media and immutable generated paperwork versions.
   Link file IDs and checksums to each job only after successful upload. Keep
   signatures, award/maturity dates and archive decisions unchanged.
6. Test denied/expired/revoked authorization, wrong account, quota errors,
   duplicate retries, concurrent edits, pagination and interrupted uploads.
   Verify phone-to-computer and computer-to-phone persistence on isolated jobs,
   and restore an exported package before declaring the feature complete.

The existing `lib/google-drive-status-store.ts` uses Node filesystem credentials
and whole-file CSV replacement. It is not the production static site's private
sync layer. Do not expose that code via an unauthenticated endpoint or automatically
import an older CSV over current notes, appointments, archives or paperwork.

Google Drive is the primary destination, not an independent backup of itself.
Keep downloadable recovery exports; OneDrive backup is a separate future step.
Account storage limits still apply. Do not promise permanent authentication:
Google or the owner can revoke access and reconnection may be necessary.

References:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/drive/api/guides/limits

## Superseded Cloudflare proposal (not activated)

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
