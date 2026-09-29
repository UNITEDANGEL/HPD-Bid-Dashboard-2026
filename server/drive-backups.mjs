import { validateBackup, backupSummary, backupDigest, MAX_BACKUP_BYTES } from "../lib/drive-backup-format.mjs";

const API = "https://www.googleapis.com/drive/v3";
const KIND = "hpd-field-backup-v1";
const FIELDS = "id,name,createdTime,size,appProperties,ownedByMe,shared,trashed,mimeType";
const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
const reply = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function fail(message, status = 503) { const error = new Error(message); error.status = status; throw error; }

async function boundedText(response) {
  if (Number(response.headers.get("Content-Length")) > MAX_BACKUP_BYTES) fail("Backup exceeds the 2 MB record limit.", 413);
  const reader = response.body?.getReader();
  if (!reader) fail("Backup body is missing.", 400);
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BACKUP_BYTES) { await reader.cancel(); fail("Backup exceeds the 2 MB record limit.", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

// Immutable files only: never PATCH, delete, share, or replace an existing backup.
export async function handleDriveBackups(request, action, authHeaders, fetcher) {
  const call = (url, options = {}) => fetcher(url, { ...options, headers: { ...authHeaders, ...options.headers }, signal: AbortSignal.timeout(20000) });
  const getJson = async (url) => {
    const response = await call(url);
    if (!response.ok) fail(`Drive backup request failed (HTTP ${response.status}). Local records are unchanged.`);
    return response.json();
  };
  const metadata = async (id) => {
    if (!validId(id)) fail("Invalid backup ID.", 400);
    const file = await getJson(`${API}/files/${id}?fields=${FIELDS}`);
    if (!file.ownedByMe || file.shared || file.trashed || file.mimeType !== "application/json"
      || ![KIND, `${KIND}-test`].includes(file.appProperties?.hpdKind)) fail("Not a private HPD backup owned by this account.", 403);
    return file;
  };
  const read = async (id) => {
    const file = await metadata(id);
    if (Number(file.size) > MAX_BACKUP_BYTES) fail("Backup exceeds the 2 MB record limit.", 413);
    const response = await call(`${API}/files/${id}?alt=media`);
    if (!response.ok) fail(`Drive backup download failed (HTTP ${response.status}).`);
    const text = await boundedText(response);
    if (await backupDigest(text) !== file.appProperties.sha256) fail("Backup integrity check failed. No records restored.", 409);
    let snapshot;
    try { snapshot = validateBackup(JSON.parse(text)); } catch { fail("Invalid backup contents. No records restored.", 400); }
    return { file, snapshot };
  };
  try {
    if (action === "backups") {
      const files = []; let pageToken = ""; const seen = new Set();
      do {
        const query = new URLSearchParams({ q: `trashed = false and 'me' in owners and appProperties has { key='hpdKind' and value='${KIND}' }`,
          fields: `nextPageToken,files(${FIELDS})`, pageSize: "100", orderBy: "createdTime desc" });
        if (pageToken) query.set("pageToken", pageToken);
        const result = await getJson(`${API}/files?${query}`);
        files.push(...(result.files || []).filter((f) => f.ownedByMe && !f.shared && !f.trashed && f.appProperties?.hpdKind === KIND));
        pageToken = result.nextPageToken || "";
        if (pageToken && (seen.has(pageToken) || seen.size >= 99)) fail("Too many backup pages. Listing stopped without changing files.");
        seen.add(pageToken);
      } while (pageToken);
      return reply({ files: files.map(({ id, name, createdTime, size }) => ({ id, name, createdTime, size })) });
    }
    if (action === "backup") return reply(await read(new URL(request.url).searchParams.get("id")));
    if (action === "backup-id") {
      const result = await getJson(`${API}/files/generateIds?count=1&space=drive&type=files`);
      if (!validId(result.ids?.[0])) fail("Drive did not allocate a backup ID.");
      return reply({ id: result.ids[0] });
    }
    const testing = action === "test-backup";
    let id; let snapshot;
    if (testing) {
      const result = await getJson(`${API}/files/generateIds?count=1&space=drive&type=files`);
      id = result.ids?.[0];
      snapshot = { format: "hpd-field-backup", version: 1, capturedAt: new Date().toISOString(), stores: {} };
    } else {
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail("JSON backup required.", 415);
      let body;
      try { body = JSON.parse(await boundedText(request)); }
      catch (e) { if (e.status) throw e; fail("Invalid backup request.", 400); }
      id = body.id;
      try { snapshot = validateBackup(body.snapshot); } catch (e) { fail(e.message, 400); }
      if (!backupSummary(snapshot).records) fail("No local job updates to back up.", 400);
    }
    if (!validId(id)) fail("Invalid backup ID.", 400);
    const text = JSON.stringify(snapshot);
    const digest = await backupDigest(text);
    const quota = await getJson(`${API}/about?fields=storageQuota`);
    if (quota.storageQuota?.limit && Number(quota.storageQuota.limit) - Number(quota.storageQuota.usage || 0) < new TextEncoder().encode(text).length) {
      fail("Google Drive storage is full. No paid storage was enabled.", 507);
    }
    const boundary = `hpd_${crypto.randomUUID()}`;
    const meta = { id, name: `${testing ? "HPD TEST" : "HPD Field Records"} ${snapshot.capturedAt.replace(/[:.]/g, "-")}.json`, mimeType: "application/json",
      appProperties: { hpdKind: testing ? `${KIND}-test` : KIND, sha256: digest } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    const upload = await call("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
    // A retry uses the same preallocated ID. 409 is only success if readback matches.
    if (!upload.ok && upload.status !== 409) fail(`Drive backup upload failed (HTTP ${upload.status}). Local records were kept; retry is safe.`);
    const verified = await read(id);
    if (verified.file.appProperties.sha256 !== digest) fail("Backup ID already belongs to different content. Nothing was replaced.", 409);
    return reply({ id, verifiedAt: new Date().toISOString(), ...backupSummary(snapshot), test: testing });
  } catch (e) {
    return reply({ error: e.status ? e.message : "Drive backup failed. Local records and previous backups were kept." }, e.status || 503);
  }
}
