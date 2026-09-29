# Private field storage rollout

## Current decision: Google Drive

The user selected their existing Google Drive account on September 28, 2026,
and rejected payment/billing activation. This supersedes the Cloudflare design
below. Do not activate Zero Trust billing, provision R2, or apply the D1 migration.
The empty database is unused and must not be deleted without authorization.

Status: app Drive authorization and renewal are verified in production. Durable
cloud sync and in-app restore/merge are not yet enabled.
The connector session must never be copied into the app. Existing local data
remains authoritative until a reviewed import succeeds.

### Implementation sequence

Full backup increment (deployment verification tracked in the working plan):
`DriveAutoBackup` checks once a minute while open/visible/online after an explicit
per-device opt-in. It backs up the four record stores plus saved photos/videos,
generated PDF/ZIP packets, visits and unified field records from their existing
IndexedDB stores. Unsaved forms and arbitrary localStorage/auth/settings are not
included. It is automatic one-way BACKUP, not background execution with the app
closed and not automatic two-way sync. Every device must connect and opt in.

Version-2 snapshots are split into 1 MB byte chunks and an integrity manifest,
with a 128 MB full-package limit and existing Drive quota checks. Unsupported
binary field types fail instead of disappearing during JSON serialization. Each
part gets a preallocated stable ID; the entire pending package is persisted in a
separate IndexedDB queue before upload. Retries reuse IDs and exact content. Parts
are not shown as complete backups; the manifest is uploaded last. The last content
fingerprint skips unchanged uploads. Web Locks serialize backup/restore across tabs.
No filenames, snapshots or credentials are committed to Git. No billing changes.

Recovery reassembles and verifies every part and the full digest before preview.
Restore saves a local pre-restore snapshot, adds missing entries/files only, and
preserves all differing existing records for conflict review. IndexedDB reads/adds
share a readwrite transaction, and localStorage is reread synchronously before
merging missing entries. Cross-store restore is not globally atomic; a quota/error
can leave some missing records already added, and a repeat skips them safely.
No restore propagates deletes, overwrites existing versions, or auto-archives jobs.
Real two-way updates/deletion/conflict resolution remain a separate journal/revision
project; do not claim complete cross-device sync. Original app DB versions/indexes
are preserved. The control queue never becomes a field-data authority.

Tests: `node scripts/test-drive-full-backup.mjs` uses isolated fake IndexedDB to
cover photo/PDF byte fidelity, multi-part integrity, interrupted resume, stable IDs,
unchanged deduplication, missing-only restore, conflict preservation, repeat restore
and the existing stores' index compatibility. Real browser tests must separately
verify enabling, full upload/readback, reload preference and restore preview.

Manual backup increment: authenticated `/api/drive/{backup-id,save-backup,backups,backup,test-backup}`
uses the same approved Google identity and private session. A review screen precedes
every real upload. Four explicit localStorage stores are included: workflow overrides
v1/v2, field-command workflow stamps, and visit drafts. No general localStorage dump,
credentials, IndexedDB media, PDFs or signatures. This is NOT a complete application
backup or automatic sync. Other-origin/browser records are not included.

Backups are immutable JSON files in private My Drive root, tagged with appProperties.
This initial increment does not create or inherit permissions from a folder. IDs are
allocated by Drive and saved with the exact snapshot locally before upload, so retries
use the same ID. No PATCH/delete/permission writes exist. SHA-256 and actual readback
must match before reporting success; ownedByMe and shared=false are required. File
listings are paginated; quota and 2 MB body limits fail closed. Interrupted pending
backups remain on-device for an explicit retry. Existing local records are unchanged.

Storage offers a synthetic empty-file write/readback test, manual backup review,
paginated backup listing, integrity-checked recovery preview and JSON download.
Test files are excluded from real backup listings. In-app restore and conflict-aware
merge, outbox autosaving and real two-device transfer remain separate release gates.
Never label a successful empty-file probe as a completed job backup. Tests:
`node scripts/test-drive-auth.mjs` and `node scripts/test-drive-backups.mjs`.

Authorization increment: `/storage/` (also More > Google Drive) and the
`/api/drive/{session,start,callback,disconnect}` Pages Functions are implemented.
The local Next preview intentionally reports setup pending. These handlers never
write job files and always return `syncEnabled: false`. Synthetic tests:
`node scripts/test-drive-auth.mjs`.

Production configuration required before the Connect button is enabled:

- A separate Google **Web application** OAuth client; leave Desktop Gmail clients unchanged.
- Exact redirect: `https://hpd-bid-dashboard-2026.pages.dev/api/drive/callback`.
- `HPD_DRIVE_APP_ORIGIN=https://hpd-bid-dashboard-2026.pages.dev`.
- `HPD_DRIVE_ALLOWED_EMAIL`: approved owner from the working plan.
- `HPD_DRIVE_CLIENT_ID`, `HPD_DRIVE_CLIENT_SECRET`: new client's server-only settings.
- `HPD_DRIVE_ENCRYPTION_KEY`: independent random 32-byte base64url secret.
- `HPD_DRIVE_SESSIONS`: dedicated private KV binding for encrypted authorization
  sessions only, not job records. Use existing free capacity; do not enable billing.

Setting up the client/secrets/binding requires explicit security-access approval.
No credentials should be pasted in chat, committed, or included in static output.
The Google flow requests openid/email/drive.file, state and S256 PKCE. It checks
identity directly with Google's userinfo endpoint and rejects unverified or
unapproved email. Browser cookies hold opaque session IDs, not Google tokens.
Encrypted sessions expire after 30 days; this does not guarantee Google consent
will remain valid for 30 days. Disconnect removes this device's session only,
not Google-wide consent or other devices. KV deletion can propagate with delay;
do not treat it as immediate global revocation. Upload endpoints,
outbox integration, global revocation and actual cross-device sync are pending.

Renewal increment: authenticated same-origin POST `/api/drive/check` now exchanges
the stored refresh token, rechecks Google identity and performs a read-only Drive
about request. Successful verification records `verifiedAt` and renews the opaque
device cookie/encrypted KV session for 30 days. Missing replacement refresh tokens
preserve the existing token. Transient failures preserve credentials; Google's
`invalid_grant` clears the unusable device session and asks for reconnection.
The app checks on use/focus/online and hourly while open, only renewing when the
last successful verification is at least six hours old. Offline use never opens
consent. Storage includes a manual Check connection action. No credentials are
stored in localStorage, and neither check nor renewal uploads job records.
This is a rolling active-use session, not permanent authentication: after 30 days
without renewal, cleared cookies, revoked consent or Google policy changes,
sign-in can be required. Cloud job saving is still not enabled.

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
