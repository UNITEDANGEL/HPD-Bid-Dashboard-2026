import assert from "node:assert/strict";
import { handleDriveBackups } from "../server/drive-backups.mjs";
import { captureBackup, validateBackup, backupSummary, backupDigest, MAX_BACKUP_BYTES } from "../lib/drive-backup-format.mjs";

const origin = "https://app.example.test";
const key = "hpd-job-workflow-overrides-v2";
const source = new Map([[key, JSON.stringify({ SYNTHETIC: { WorkflowStatus: "Appointment", notes: "test only", history: [{ status: "No access" }] } })], ["token", "NEVER-UPLOAD"]]);
const snapshot = captureBackup({ getItem: (k) => source.get(k) ?? null }, "2026-09-28T12:00:00.000Z");
assert.deepEqual(backupSummary(snapshot), { jobs: 1, records: 1, stores: 1 });
assert.ok(!JSON.stringify(snapshot).includes("NEVER-UPLOAD"));
assert.throws(() => captureBackup({ getItem: () => "invalid" }), /Unreadable/);
assert.throws(() => validateBackup({ ...snapshot, stores: { token: {} } }), /Unsupported/);
assert.throws(() => validateBackup({ ...snapshot, capturedAt: "bad" }), /Unsupported/);
assert.throws(() => validateBackup(JSON.parse(JSON.stringify(snapshot).replace('"SYNTHETIC"', '"__proto__"'))), /Unsafe/);
assert.throws(() => validateBackup({ ...snapshot, stores: { [key]: { note: "x".repeat(MAX_BACKUP_BYTES) } } }), /2 MB/);
const files = new Map(); let uploads = 0; let quotaFull = false; let failUpload = false; let shared = false; let corrupt = false;
const id = "synthetic_file_id_001";
const fetcher = async (url, options) => {
  assert.equal(options.headers.Authorization, "Bearer test-access");
  assert.notEqual(options.method, "PATCH"); assert.notEqual(options.method, "DELETE");
  if (url.includes("generateIds")) return Response.json({ ids: [id] });
  if (url.includes("about?")) return Response.json({ storageQuota: { limit: "10000", usage: quotaFull ? "10000" : "0" } });
  if (url.includes("/upload/")) {
    uploads++;
    if (failUpload) return Response.json({}, { status: 503 });
    const boundary = options.headers["Content-Type"].split("boundary=")[1];
    const parts = options.body.split(`--${boundary}`);
    const meta = JSON.parse(parts[1].split("\r\n\r\n")[1]);
    const text = parts[2].split("\r\n\r\n")[1].replace(/\r\n$/, "");
    assert.ok(!meta.parents, "New files stay in private My Drive root, not an inherited shared folder");
    if (files.has(meta.id)) return Response.json({}, { status: 409 });
    files.set(meta.id, { ...meta, text }); return Response.json({ id: meta.id });
  }
  if (url.includes("/files?")) {
    const query = new URL(url).searchParams;
    assert.match(query.get("q"), /'me' in owners/);
    if (!query.has("pageToken")) return Response.json({ files: [], nextPageToken: "second" });
    return Response.json({ files: [...files.values()].map((f) => ({ ...f, text: undefined, ownedByMe: true, shared, size: String(f.text.length), createdTime: snapshot.capturedAt })) });
  }
  const fileId = new URL(url).pathname.split("/").pop();
  const file = files.get(fileId);
  if (!file) return Response.json({}, { status: 404 });
  if (url.includes("alt=media")) return new Response(corrupt ? file.text + " " : file.text);
  return Response.json({ ...file, text: undefined, ownedByMe: true, shared, size: String(file.text.length) });
};
const invoke = (action, payload, method = payload ? "POST" : "GET") => handleDriveBackups(new Request(`${origin}/api/drive/${action}`, {
  method, headers: { "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}),
}), action.split("?")[0], { Authorization: "Bearer test-access" }, fetcher);
assert.equal((await invoke("backup-id", {})).status, 200);
let result = await invoke("save-backup", { id, snapshot });
assert.equal(result.status, 200); assert.equal((await result.json()).jobs, 1);
assert.equal(files.size, 1);
assert.equal((await invoke("save-backup", { id, snapshot })).status, 200);
assert.equal(files.size, 1, "Exact retry does not duplicate");
assert.equal((await invoke("save-backup", { id, snapshot: { ...snapshot, capturedAt: "2026-09-29T12:00:00Z" } })).status, 409);
assert.equal((await (await invoke("backups")).json()).files.length, 1, "Reads all pages");
assert.deepEqual((await (await invoke(`backup?id=${id}`)).json()).snapshot, snapshot);
shared = true;
assert.equal((await invoke(`backup?id=${id}`)).status, 403);
assert.equal((await (await invoke("backups")).json()).files.length, 0);
shared = false; corrupt = true;
assert.equal((await invoke(`backup?id=${id}`)).status, 409);
corrupt = false; quotaFull = true;
const before = uploads;
assert.equal((await invoke("save-backup", { id, snapshot })).status, 507);
assert.equal(uploads, before);
quotaFull = false; failUpload = true;
assert.equal((await invoke("save-backup", { id, snapshot })).status, 503);
failUpload = false;
assert.equal((await invoke("save-backup", { id: "../bad", snapshot })).status, 400);
assert.equal((await invoke("save-backup", { id, snapshot: { ...snapshot, stores: {} } })).status, 400);
assert.equal((await invoke("save-backup", { id, snapshot: { ...snapshot, stores: { token: {} } } })).status, 400);
files.clear();
result = await invoke("test-backup", {});
assert.equal(result.status, 200); assert.equal((await result.json()).test, true);
assert.equal((await (await invoke("backups")).json()).files.length, 0, "Synthetic probes excluded from job backups");
assert.equal(source.get(key), JSON.stringify(snapshot.stores[key]), "Source unchanged");
const part = { format: "hpd-field-backup-part", version: 1, capturedAt: snapshot.capturedAt, data: Buffer.from(JSON.stringify(snapshot)).toString("base64") };
const partId = "synthetic_part_002";
assert.equal((await invoke("save-backup", { id: partId, snapshot: part })).status, 200);
assert.equal((await (await invoke("backups")).json()).files.length, 0, "Chunks excluded from root backup list");
assert.deepEqual((await (await invoke(`backup?id=${partId}`)).json()).snapshot, part);
const manifest = { format: "hpd-field-backup-manifest", version: 1, capturedAt: snapshot.capturedAt,
  bytes: Buffer.byteLength(JSON.stringify(snapshot)), sha256: await backupDigest(JSON.stringify(snapshot)),
  parts: [{ id: partId, sha256: await backupDigest(JSON.stringify(part)) }] };
assert.equal((await invoke("save-backup", { id: "synthetic_manifest_003", snapshot: manifest })).status, 200);
assert.equal((await (await invoke("backups")).json()).files.length, 1, "Complete manifest listed");
console.log("PASS Drive backups: allowlisted stores, invalid/oversize/prototype input, immutable retries, conflicts, paginated list, private ownership, integrity, quota, failed upload, readback and synthetic-only probe.");
