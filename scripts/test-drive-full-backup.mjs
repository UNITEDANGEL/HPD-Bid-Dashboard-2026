import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { captureFullBackup, runFullBackup, loadRecovery, planRestore, restoreMissing, makePackage, backupState } from "../lib/drive-backup-client.mjs";
import { validateBackup, validateEnvelope, backupDigest, contentFingerprint, ASSET_STORES } from "../lib/drive-backup-format.mjs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
globalThis.indexedDB = new IDBFactory();
globalThis.localStorage = new MemoryStorage();
const key = "hpd-job-workflow-overrides-v2";
localStorage.setItem(key, JSON.stringify({ TEST1: { notes: "Test only", WorkflowStatus: "Appointment", appointmentHistory: [{ state: "confirmed" }] } }));
const empty = await captureFullBackup();
assert.equal(empty.version, 2); assert.equal(empty.assets.length, 0);
const sample = { ...empty, assets: [
  { db: "hpd-field-photos-v1", store: "photos", record: { id: "test-photo", jobId: "TEST1", kind: "before", mediaType: "image", dataUrl: "data:image/png;base64," + "AAAA".repeat(350000), capturedAt: "2026-09-28T10:00:00Z" } },
  { db: "hpd-field-packets-v1", store: "packets", record: { id: "test-pdf", jobId: "TEST1", mimeType: "application/pdf", fileName: "synthetic.pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=", generatedAt: "2026-09-28T10:00:00Z" } },
] };
assert.equal((await restoreMissing(sample)).added, 2);
assert.deepEqual((await captureFullBackup()).assets, sample.assets);
assert.equal((await restoreMissing(sample)).added, 0, "Repeat restore adds nothing");
const conflicting = { ...sample, stores: { [key]: { TEST1: { notes: "Different" }, TEST2: { notes: "Missing" } } },
  assets: sample.assets.map((a) => ({ ...a, record: { ...a.record, jobId: "DIFFERENT" } })) };
const plan = planRestore(await captureFullBackup(), conflicting);
assert.equal(plan.conflicts.length, 3); assert.equal(plan.additions.length, 1);
const merged = await restoreMissing(conflicting);
assert.equal(merged.added, 1); assert.equal(merged.conflicts, 3);
assert.equal(JSON.parse(localStorage.getItem(key)).TEST1.notes, "Test only");
assert.equal((await captureFullBackup()).assets[0].record.jobId, "TEST1");
const wrapped = { ...empty, stores: { [key]: { overrides: { TEST1: { notes: "Different" } } } } };
assert.equal(planRestore(sample, wrapped).conflicts.length, 1);
assert.throws(() => validateBackup({ ...sample, assets: [{ ...sample.assets[0], db: "credentials" }] }), /Invalid/);
assert.throws(() => validateBackup({ ...sample, assets: [sample.assets[0], sample.assets[0]] }), /Duplicate/);
assert.throws(() => validateEnvelope({ format: "hpd-field-backup-part", version: 1, capturedAt: empty.capturedAt, data: "bad" }), /Invalid/);
let sequence = 0; const saved = new Map(); let uploaded = 0; let failAt = 2;
const api = async (action, body) => {
  if (action.startsWith("backup-id")) {
    const count = Number(new URL(`https://test/${action}`).searchParams.get("count"));
    return { ids: Array.from({ length: count }, () => `synthetic_id_${String(++sequence).padStart(5, "0")}`) };
  }
  if (action === "save-backup") {
    validateEnvelope(body.snapshot); uploaded++;
    if (uploaded === failAt) throw new Error("Synthetic offline failure");
    if (saved.has(body.id)) assert.deepEqual(saved.get(body.id), body.snapshot, "Stable ID retry has same content");
    saved.set(body.id, body.snapshot); return { id: body.id };
  }
  const id = new URL(`https://test/${action}`).searchParams.get("id");
  if (!saved.has(id)) throw new Error("Missing part");
  return { file: { id }, snapshot: saved.get(id) };
};
await assert.rejects(() => runFullBackup({ api }), /offline/);
assert.match((await backupState()).error, /offline/);
const allocated = sequence;
failAt = -1;
const success = await runFullBackup({ api });
assert.equal(sequence, allocated, "Resume retains allocated IDs");
assert.equal(success.summary.media, 1); assert.equal(success.summary.documents, 1);
const count = uploaded;
await runFullBackup({ api }); assert.equal(uploaded, count, "Unchanged files are not uploaded again");
const recovery = await loadRecovery(success.root, api);
assert.deepEqual(recovery.snapshot.assets, sample.assets, "Original photo/PDF bytes retained");
const first = saved.get(success.root).parts[0]; const original = saved.get(first.id);
saved.set(first.id, { ...original, data: "AAAA" });
await assert.rejects(() => loadRecovery(success.root, api), /integrity/);
saved.set(first.id, original);
const deviceOne = globalThis.indexedDB;
globalThis.indexedDB = new IDBFactory(); globalThis.localStorage = new MemoryStorage();
const restored = await restoreMissing(recovery.snapshot);
assert.equal(restored.added, 4, "Two job entries plus photo and PDF on isolated second device");
assert.equal(await contentFingerprint(await captureFullBackup()), await contentFingerprint(recovery.snapshot));
assert.equal((await restoreMissing(recovery.snapshot)).added, 0);
localStorage.setItem(key, JSON.stringify({ TEST1: { notes: "New local edit" } }));
await restoreMissing(recovery.snapshot);
assert.equal(JSON.parse(localStorage.getItem(key)).TEST1.notes, "New local edit", "Conflict preserves newer local edit");
// Schema compatibility: all stores used by existing app APIs exist after empty-device restore.
for (const [dbName, names] of Object.entries(ASSET_STORES)) {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open(dbName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  for (const name of names) assert.ok(db.objectStoreNames.contains(name));
  if (dbName === "hpd-field-photos-v1") assert.ok(db.transaction("photos").objectStore("photos").indexNames.contains("mediaType"));
  db.close();
}
globalThis.indexedDB = deviceOne;
await assert.rejects(() => makePackage(sample, async () => []), /allocation/);
console.log("PASS full backup: IndexedDB photo/PDF fidelity, chunk integrity, interrupted durable resume, stable IDs, unchanged deduplication, isolated second-device restore, conflicts, repeat restore and app schema compatibility.");
