# Phase 1 Storage and Workflow Audit

Date: 2026-07-12  
Status: complete, read-only audit  
Scope: current map, field workflow, paperwork, media, routing, browser persistence, Cloudflare components, and local-file exports.

## Executive summary

The application works as a capable browser-first field tool, but it does not yet have one durable system of record. Job source data is shipped as static JSON, workflow changes are split between browser local storage and a public Cloudflare KV worker, field visits/photos/videos/generated packets are isolated in three IndexedDB databases on each browser, and an approved day plan exists only in session storage. Consequently, changing browser, clearing site data, losing a phone, or working on desktop and iPhone can leave records missing or inconsistent.

The recommended target is local-first rather than cloud-only: one versioned IndexedDB database provides immediate offline operation; authenticated Cloudflare D1 is the canonical structured-data service; R2 stores media and generated documents; and a Windows backup agent exports encrypted, verifiable snapshots to the local HDD. Every mutation receives a stable ID, device ID, timestamps, revision, sync state, and audit entry.

No production data, source records, Cloudflare resources, browser data, or live application behavior was modified in this phase.

## Current sources of truth

| Area | Current storage | Scope | Main limitation |
|---|---|---|---|
| Imported HPD jobs | `data/COA_Fetcher_2026.json` and public copies | Build/deployment | Snapshot, duplicated files, no transactional updates |
| Workflow/status overrides | browser localStorage plus `hpd-status-worker` KV | Browser plus shared cloud | Two writers, last merge wins, no revision/conflict model |
| Photos and videos | IndexedDB `hpd-field-photos-v1`, store `photos`, schema v2 | One origin/browser | Data URLs inflate storage; no cloud copy or device recovery |
| Generated packets | IndexedDB `hpd-field-packets-v1`, store `packets`, schema v1 | One origin/browser | Large PDF/ZIP data URLs; no remote archive |
| Field visits | IndexedDB `hpd-field-visits-v1`, store `visits`, schema v1 | One origin/browser | Private to device; deterministic ID can overwrite same-day visits |
| Approved route plan | sessionStorage `hpd-plan-my-day-approved` | One tab/session | Lost when session ends; not transferable to iPhone |
| Location and preferences | multiple localStorage keys | One origin/browser | Not portable; location permission remains browser-controlled |
| Paperwork draft rows | localStorage workflow keys | One origin/browser | Can diverge from KV and other devices |
| Local HDD output | File System Access API directory picker | Selected desktop browser only | Requires user selection; not supported uniformly on iPhone |

## Browser persistence inventory

Observed local keys include map style, MapTiler browser key, location preference and last coordinate, field-visit tracking preference, AI day-agent log, appointment alert phone, geocode cache, workflow overrides, and one-time notices. These values have no common schema version, ownership record, expiry policy, export manifest, or centralized quota handling.

IndexedDB media records include job and evidence metadata, MIME type, byte size, capture time, and image/video content encoded as a data URL. Packets similarly store whole PDF or ZIP payloads as data URLs. This is convenient locally but uses substantially more quota than Blob storage and makes incremental synchronization difficult.

## Current data flow

1. The deployed bundle loads an HPD job snapshot from JSON.
2. The map merges local workflow overrides with overrides fetched from the Cloudflare status worker.
3. A field action writes workflow state locally and posts a patch to the worker.
4. Evidence, visits, and generated packets remain only in that browser's IndexedDB.
5. Plan My Day computes a route using browser location, the planner endpoint, and OSRM; acceptance is session-only.
6. Paperwork can generate local files and, on supported desktop browsers, write them to a user-selected directory.

There is no durable transaction spanning a status update, visit, evidence capture, route stop, and paperwork generation.

## Cloud and API audit

- The current status worker uses Cloudflare KV binding `HPD_STATUS_OVERRIDES` and exposes list, put, and delete operations.
- Its CORS policy permits all origins. The inspected worker contract does not enforce identity, authentication, roles, or per-record authorization.
- KV is useful for cache/configuration but is not an ideal relational system of record for jobs, invoices, assignments, and ordered event history.
- Routing uses the public OSRM service and should retain a timeout/offline fallback.
- AI planning can use an optional OpenAI endpoint; deterministic planning must remain the free baseline.
- GitHub/Google tokens are server environment concerns and must never enter browser storage or exports.

## Risk register

| Severity | Risk | Required control |
|---|---|---|
| Critical | Cloud workflow mutation lacks verified user/device authorization | Authentication, roles, signed sessions, restricted CORS, server validation |
| Critical | Field media and packets can exist on only one phone/browser | Offline queue plus resumable R2 sync and verified backup |
| High | Local and KV workflow patches can silently overwrite each other | Revisions, idempotency keys, conflict detection, append-only events |
| High | Browser/site-data clearing can remove operational evidence | Remote acknowledgement before local purge; recovery UI |
| High | Data URLs increase quota pressure | Store Blob payloads; thumbnails separately; quota monitoring |
| High | Approved routes disappear with the tab session | Persist route/stop records and sync assignments |
| Medium | Static job copies can drift | Import batch/version table and source checksum |
| Medium | Device clock differences distort chronology | Server timestamps plus client-captured timestamps |
| Medium | GPS and tenant information are sensitive | Least privilege, retention limits, encryption, audit trail |
| Medium | Desktop directory writes are browser-dependent | Dedicated Windows backup/export agent with manifest verification |

## Proposed canonical structured schema (D1)

All mutable tables use UUID/ULID identifiers, `created_at`, `updated_at`, `revision`, `deleted_at`, and source/device metadata where applicable.

| Table | Purpose and essential fields |
|---|---|
| `users` | identity, display name, role, active state |
| `devices` | user, device label, platform, last sync, revoked state |
| `import_batches` | source, checksum, imported time, row/error counts |
| `jobs` | external OMO/job ID, address/unit/borough, description, award/due dates, amounts, canonical workflow state |
| `job_assignments` | job, assignee, assigned date, priority, state |
| `job_events` | append-only job, event type, payload JSON, actor/device, client and server time |
| `appointments` | job, tenant/contact fields, scheduled time, alert state |
| `routes` | owner/date, start/end, planner version, state |
| `route_stops` | route, job, sequence, planned/actual arrival, duration, outcome |
| `visits` | job, route stop, GPS/accuracy/distance, source, arrival/departure |
| `notes` | job, author, body, visibility |
| `media_assets` | job, kind, MIME, byte size, hash, R2 key, thumbnail key, capture/upload state |
| `documents` | job, document/packet type, R2 key, hash, generation metadata |
| `invoices` | job/customer, number, status, totals, dates, document link |
| `invoice_lines` | invoice, description, quantity, unit price, amount |
| `sync_mutations` | idempotency key, device, entity/action, base revision, status/error |
| `audit_events` | actor/device, action, entity, before/after metadata, server time |
| `tombstones` | deleted entity identity and revision for offline propagation |

## Proposed browser database

Replace the three independent databases with one versioned database, tentatively `uac-field-v1`, containing stores for `jobs`, `job_events`, `routes`, `route_stops`, `visits`, `notes`, `media`, `documents`, `invoices`, `settings`, `mutations`, and `sync_state`.

Rules:

- UI writes locally first in one transaction, then queues an idempotent mutation.
- Media uses Blob objects and a content hash; thumbnails are separate.
- A record is marked synced only after server acknowledgement.
- Conflicts never silently overwrite evidence or events. Workflow conflicts are surfaced or resolved by explicit state rules.
- Existing localStorage and IndexedDB data is copied, verified, and retained until migration checks pass.

## Proposed R2 object layout

`org/{org_id}/jobs/{job_id}/media/{yyyy}/{mm}/{asset_id}-{sha256}.{ext}`  
`org/{org_id}/jobs/{job_id}/thumbnails/{asset_id}.jpg`  
`org/{org_id}/jobs/{job_id}/documents/{document_type}/{document_id}-{sha256}.{ext}`  
`org/{org_id}/backups/{yyyy}/{mm}/{dd}/{backup_id}/manifest.json`

Database rows hold metadata and hashes; R2 holds binary objects. Uploads must be authenticated, size/type validated, hash-verified, and retryable.

## Local HDD backup design

The browser alone cannot guarantee continuous writes to an arbitrary Windows directory. A later Windows backup agent should pull authenticated, versioned exports and R2 objects into:

`UAC-Backup/YYYY/MM/DD/<backup-id>/database/`  
`UAC-Backup/YYYY/MM/DD/<backup-id>/media/`  
`UAC-Backup/YYYY/MM/DD/<backup-id>/documents/`  
`UAC-Backup/YYYY/MM/DD/<backup-id>/manifest.json`

Each manifest records file hashes, counts, schema version, source revision, start/end time, and verification result. Use daily incremental backups, periodic full snapshots, multiple retained generations, and a tested restore procedure. Sensitive backups should be encrypted and access-controlled.

## Retention and recovery rules

- Never delete unsynced local evidence automatically.
- Keep tombstones long enough for every active device to receive deletions.
- Treat generated invoices/affidavits and their source facts as immutable revisions.
- Allow media purge only after remote hash verification and backup-policy satisfaction.
- Provide device recovery status: local-only, queued, synced, backed up, or error.
- Record export and restore tests in the audit log.

## Phased migration and rollback

1. Add the unified IndexedDB layer behind a feature flag; copy existing stores without deleting them.
2. Validate counts, IDs, sizes, and hashes; keep legacy readers available for rollback.
3. Add authenticated D1 sync for structured data and shadow-write while KV remains readable.
4. Reconcile results, then switch canonical reads to D1; retain a time-boxed KV rollback path.
5. Add R2 uploads and verify hashes before allowing any local cleanup.
6. Add desktop/iPhone workflows on the same sync contract.
7. Add the Windows backup agent and complete a documented restore drill.

Cloudflare free-tier capacity and limits must be checked against the actual job count, mutation volume, media volume, and retention policy before resources are provisioned. The architecture should degrade safely when a free-tier limit is reached instead of losing writes.

## Phase 1 exit checklist

- [x] Identified browser databases and storage keys.
- [x] Identified static job sources and duplicated snapshots.
- [x] Traced workflow, route, evidence, paperwork, and local-file flows.
- [x] Identified the current Cloudflare KV contract and authentication gap.
- [x] Defined canonical structured tables, browser stores, and R2 layout.
- [x] Defined migration, rollback, retention, sync, and HDD backup principles.
- [x] Confirmed no migration or production mutation occurred.

## Recommended Phase 2 scope

Build only the unified local IndexedDB foundation and offline mutation queue behind a feature flag. Migrate/copy legacy browser data non-destructively, add quota/sync-state UI, and test on iPhone-sized and desktop browsers. Do not provision D1/R2 or remove the existing stores in Phase 2.
