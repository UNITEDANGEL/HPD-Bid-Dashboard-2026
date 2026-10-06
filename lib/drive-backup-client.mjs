import { ASSET_STORES, BACKUP_KEYS, ROUTE_KEY, captureBackup, validateBackup, validateEnvelope, backupSummary, backupDigest, contentFingerprint, canonical, MAX_PACKAGE_BYTES } from "./drive-backup-format.mjs";

export const AUTO_KEY = "hpd-drive-auto-backup-v1";
export const SYNC_KEY = "hpd-drive-download-missing-v1";
const CONTROL = "hpd-drive-backup-control-v1";
const CHUNK = 256 * 1024;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const request = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || new Error("Local backup storage failed.")); });

async function open(dbName) {
  return new Promise((resolve, reject) => {
    const version = dbName === CONTROL ? 1 : dbName === "uac-field-v1" ? 2 : 3;
    const req = indexedDB.open(dbName, version);
    req.onblocked = () => reject(new Error("Close other app tabs to unlock local storage."));
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      const stores = dbName === CONTROL ? ["state", "parts"] : ASSET_STORES[dbName];
      for (const name of stores) {
        const store = db.objectStoreNames.contains(name) ? req.transaction.objectStore(name) : db.createObjectStore(name, { keyPath: "id" });
        const indexes = dbName === "hpd-field-photos-v1" ? ["jobId", "kind", "mediaType"]
          : ["jobId", dbName === "hpd-field-packets-v1" ? "generatedAt" : dbName === "hpd-field-visits-v1" ? "visitDate" : "updatedAt"];
        if (dbName !== CONTROL) for (const index of indexes) {
          if (!store.indexNames.contains(index)) store.createIndex(index, index);
        }
      }
      if (dbName === "uac-field-v1") {
        for (const name of ["settings", "sync_state"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "key" });
        const store = db.objectStoreNames.contains("mutations") ? req.transaction.objectStore("mutations") : db.createObjectStore("mutations", { keyPath: "id" });
        for (const index of ["status", "createdAt"]) if (!store.indexNames.contains(index)) store.createIndex(index, index);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function controlGet(id) {
  const db = await open(CONTROL);
  try { return await request(db.transaction("state").objectStore("state").get(id)); } finally { db.close(); }
}
async function controlPut(value) {
  const db = await open(CONTROL);
  try { const tx = db.transaction("state", "readwrite"); const complete = done(tx); tx.objectStore("state").put(value); await complete; }
  finally { db.close(); }
}
export async function backupState() {
  const status = (await controlGet("status")) || { id: "status", message: "Not backed up on this device yet." };
  const pending = await controlGet("pending");
  return { ...status, sync: await controlGet("sync"), queued: pending ? pending.ids.length - pending.index : 0 };
}

// Immutable snapshots are imported once. Conflicts remain in Drive for explicit review.
/** @param {{api?: Function, storage?: Storage, shouldContinue?: () => boolean, readState?: Function, writeState?: Function, load?: Function, restore?: Function}} options */
export async function syncMissingRecords({ api = driveApi, storage = localStorage, shouldContinue = () => Boolean(true),
  readState = () => controlGet("sync"), writeState = controlPut, load = loadRecovery, restore = restoreMissing } = {}) {
  let state = (await readState()) || { id: "sync", processed: [], added: 0, conflicts: 0 };
  try {
    const result = await api("backups");
    if (!Array.isArray(result.files)) throw new Error("Invalid Drive backup listing. Local records unchanged.");
    const files = [...result.files].sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
    for (const file of files) {
      if (state.processed.includes(file.id)) continue;
      if (!shouldContinue()) throw new Error("Sync paused. Local records and Drive files are retained.");
      const recovery = await load(file.id, api);
      if (!shouldContinue()) throw new Error("Sync paused. Local records and Drive files are retained.");
      const imported = await restore(recovery.snapshot, storage);
      state = { ...state, processed: [...state.processed, file.id], added: state.added + imported.added,
        conflicts: state.conflicts + imported.conflicts, checkedAt: new Date().toISOString(), error: null };
      await writeState(state);
    }
    state = { ...state, checkedAt: new Date().toISOString(), error: null };
    await writeState(state);
    return state;
  } catch (error) {
    await writeState({ ...state, error: error.message || "Drive download failed. Local records kept." });
    throw error;
  }
}

// Biggest single saved item the automatic backup copies (a photo is well under 1 MB).
export const MAX_BACKUP_RECORD_CHARS = 8 * 1024 * 1024;

// Rough size of a saved item, from its text fields, without copying it.
function recordChars(record) {
  let total = 0;
  for (const value of Object.values(record || {})) if (typeof value === "string") total += value.length;
  return total;
}

// Videos (and anything over MAX_BACKUP_RECORD_CHARS, e.g. a saved package zip) stay out of the
// automatic backup: it runs at app start and every minute, and holding them in memory crashed the
// app. Videos reach Drive with the package. Records are read one at a time, never all at once.
export function backupSkips(record) {
  if (!record || typeof record !== "object") return true;
  if (record.mediaType === "video" || String(record.type || "").startsWith("video/")) return true;
  return recordChars(record) > MAX_BACKUP_RECORD_CHARS;
}

export async function captureFullBackup(storage = localStorage) {
  const base = captureBackup(storage, new Date().toISOString(), 2);
  const assets = [];
  // Video ids come from the photo store's index alone, so a video is never even read. Older
  // versions also kept a full copy of each video in the unified "media" store (same id): skip those.
  let videoIds = new Set();
  {
    const db = await open("hpd-field-photos-v1");
    try {
      const store = db.transaction("photos").objectStore("photos");
      if (store.indexNames.contains("mediaType")) videoIds = new Set((await request(store.index("mediaType").getAllKeys("video"))).map(String));
    } finally { db.close(); }
  }
  for (const [dbName, names] of Object.entries(ASSET_STORES)) {
    const db = await open(dbName);
    try {
      for (const name of names) {
        const store = () => db.transaction(name).objectStore(name);
        const keys = await request(store().getAllKeys());
        for (const key of keys) {
          if ((name === "photos" || name === "media") && videoIds.has(String(key))) continue;
          const record = await request(store().get(key));
          if (backupSkips(record)) continue;
          JSON.stringify(record, (k, value) => {
            if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) throw new Error("Unsupported binary record. Backup stopped instead of omitting file content.");
            return value;
          });
          assets.push({ db: dbName, store: name, record });
        }
      }
    } finally { db.close(); }
  }
  return validateBackup({ ...base, version: 2, assets });
}

export async function driveApi(action, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`/api/drive/${action}`, { ...(body === undefined ? { cache: "no-store" } : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }), signal: AbortSignal.timeout(60000) });
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(30000, Math.max(1000, Number(response.headers.get("Retry-After") || 0) * 1000 || (attempt + 1) * 1500))));
        continue;
      }
      const text = await response.text(); let result;
      try { result = JSON.parse(text); }
      catch { throw new Error(`Drive service returned HTTP ${response.status} instead of a backup response. Pending files are kept.`); }
      if (!response.ok) throw new Error(result.error || `Drive backup failed (HTTP ${response.status}).`);
      return result;
    } catch (e) {
      if (attempt < 2 && (e instanceof TypeError || e.name === "TimeoutError" || e.name === "AbortError")) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1500)); continue;
      }
      throw e;
    }
  }
}
function toBase64(bytes) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(value);
}
export async function makePackage(snapshot, allocate) {
  validateBackup(snapshot);
  const text = JSON.stringify(snapshot); const bytes = new TextEncoder().encode(text);
  const count = Math.ceil(bytes.length / CHUNK);
  const ids = [];
  while (ids.length < count + 1) {
    const requested = Math.min(100, count + 1 - ids.length);
    const next = await allocate(requested);
    if (!Array.isArray(next) || next.length !== requested) throw new Error("Incomplete backup ID allocation.");
    ids.push(...next);
  }
  if (ids.length !== count + 1 || new Set(ids).size !== ids.length || ids.some((id) => !/^[\w-]{10,200}$/.test(id))) throw new Error("Invalid backup ID allocation.");
  const parts = [];
  const refs = [];
  for (let i = 0; i < count; i++) {
    const envelope = { format: "hpd-field-backup-part", version: 1, capturedAt: snapshot.capturedAt, data: toBase64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) };
    validateEnvelope(envelope);
    parts.push({ id: ids[i], snapshot: envelope });
    refs.push({ id: ids[i], sha256: await backupDigest(JSON.stringify(envelope)) });
  }
  const manifest = { format: "hpd-field-backup-manifest", version: 1, capturedAt: snapshot.capturedAt, bytes: bytes.length, sha256: await backupDigest(text), parts: refs };
  validateEnvelope(manifest);
  parts.push({ id: ids[count], snapshot: manifest });
  return { parts, root: ids[count], fingerprint: await contentFingerprint(snapshot), summary: backupSummary(snapshot) };
}

async function persistPackage(pack) {
  const db = await open(CONTROL);
  try {
    const tx = db.transaction(["state", "parts"], "readwrite"); const complete = done(tx);
    tx.objectStore("parts").clear();
    for (const part of pack.parts) tx.objectStore("parts").put(part);
    tx.objectStore("state").put({ id: "pending", ids: pack.parts.map((p) => p.id), root: pack.root, fingerprint: pack.fingerprint, summary: pack.summary, index: 0 });
    await complete;
  } finally { db.close(); }
}

async function sendPending(api, shouldContinue) {
  const pending = await controlGet("pending");
  if (!pending) return false;
  for (; pending.index < pending.ids.length; pending.index++) {
    if (!shouldContinue()) throw new Error("Backup paused. Pending files are kept for retry.");
    const db = await open(CONTROL);
    let part;
    try { part = await request(db.transaction("parts").objectStore("parts").get(pending.ids[pending.index])); } finally { db.close(); }
    if (!part) throw new Error("Pending backup is incomplete. Local job data is unchanged.");
    await api("save-backup", { id: part.id, snapshot: part.snapshot });
    await controlPut({ ...pending, index: pending.index + 1 });
  }
  const db = await open(CONTROL);
  try {
    const tx = db.transaction(["state", "parts"], "readwrite"); const complete = done(tx);
    tx.objectStore("state").put({ id: "status", verifiedAt: new Date().toISOString(), root: pending.root, fingerprint: pending.fingerprint,
      summary: pending.summary, message: "All queued files saved and read back." });
    tx.objectStore("state").delete("pending"); tx.objectStore("parts").clear(); await complete;
  } finally { db.close(); }
  return true;
}

async function resizePending(api) {
  const pending = await controlGet("pending");
  if (!pending) return;
  const db = await open(CONTROL); let parts;
  try { parts = await request(db.transaction("parts").objectStore("parts").getAll()); } finally { db.close(); }
  if (!parts.some((p) => p.snapshot.format === "hpd-field-backup-part" && p.snapshot.data.length > Math.ceil(CHUNK / 3) * 4)) return;
  const saved = new Map(parts.map((p) => [p.id, p]));
  const original = await loadRecovery(pending.root, async (action) => {
    const id = new URL(`https://backup.invalid/${action}`).searchParams.get("id");
    const part = saved.get(id); if (!part) throw new Error("Pending backup cannot be resized safely. Original queue kept.");
    return { file: { id }, snapshot: part.snapshot };
  });
  const replacement = await makePackage(original.snapshot, async (count) => (await api(`backup-id?count=${count}`, {})).ids);
  // Replace the local queue atomically only after reconstructing and validating every original byte.
  await persistPackage(replacement);
}

export async function runFullBackup({ api = driveApi, storage = localStorage, shouldContinue = () => Boolean(true) } = {}) {
  try {
    await resizePending(api);
    await sendPending(api, shouldContinue);
    const snapshot = await captureFullBackup(storage);
    const fingerprint = await contentFingerprint(snapshot);
    const status = await backupState();
    if (status.fingerprint === fingerprint) {
      const { error, ...clean } = status;
      if (error) await controlPut(clean);
      return clean;
    }
    if (!shouldContinue()) throw new Error("Backup paused.");
    const pack = await makePackage(snapshot, async (count) => (await api(`backup-id?count=${count}`, {})).ids);
    await persistPackage(pack);
    await sendPending(api, shouldContinue);
    return backupState();
  } catch (e) {
    const status = await backupState();
    await controlPut({ ...status, error: e.message || "Backup failed; local data kept." });
    throw e;
  }
}

export async function loadRecovery(id, api = driveApi) {
  const root = await api(`backup?id=${encodeURIComponent(id)}`);
  const envelope = validateEnvelope(root.snapshot);
  if (envelope.format === "hpd-field-backup") return { ...root, snapshot: validateBackup(envelope) };
  if (envelope.format !== "hpd-field-backup-manifest") throw new Error("Select a complete backup, not a file part.");
  const bytes = new Uint8Array(envelope.bytes); let offset = 0;
  for (const ref of envelope.parts) {
    const part = validateEnvelope((await api(`backup?id=${encodeURIComponent(ref.id)}`)).snapshot);
    if (part.format !== "hpd-field-backup-part" || await backupDigest(JSON.stringify(part)) !== ref.sha256) throw new Error("Backup part integrity failed.");
    const chunk = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
    if (offset + chunk.length > bytes.length || offset + chunk.length > MAX_PACKAGE_BYTES) throw new Error("Backup size mismatch.");
    bytes.set(chunk, offset); offset += chunk.length;
  }
  if (offset !== bytes.length) throw new Error("Incomplete backup. Nothing restored.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (await backupDigest(text) !== envelope.sha256) throw new Error("Recovery integrity failed.");
  return { ...root, snapshot: validateBackup(JSON.parse(text)) };
}

const rows = (value) => value.overrides && typeof value.overrides === "object" && !Array.isArray(value.overrides) ? value.overrides : value;
export function planRestore(current, incoming) {
  validateBackup(current); validateBackup(incoming);
  const additions = []; const conflicts = []; let identical = 0;
  const blockedJobs = new Set();
  // Different copies of one job in either legacy override store block importing that job anywhere.
  for (const key of BACKUP_KEYS.slice(0, 2)) for (const [id, value] of Object.entries(rows(incoming.stores[key] || {}))) {
    for (const localKey of BACKUP_KEYS.slice(0, 2)) {
      const existing = rows(current.stores[localKey] || {})[id];
      if (existing !== undefined && !equal(existing, value)) blockedJobs.add(id);
    }
  }
  for (const [store, saved] of Object.entries(incoming.stores)) for (const [id, value] of Object.entries(store === ROUTE_KEY ? { route: saved } : rows(saved))) {
    const existing = store === ROUTE_KEY ? current.stores[store] : rows(current.stores[store] || {})[id];
    if (blockedJobs.has(id) || (existing !== undefined && !equal(existing, value))) conflicts.push({ store, id });
    else if (existing !== undefined) identical++;
    else additions.push({ store, id, value });
  }
  const existingAssets = new Map((current.assets || []).map((a) => [JSON.stringify([a.db, a.store, a.record.id]), a]));
  const assets = [];
  for (const asset of incoming.assets || []) {
    const existing = existingAssets.get(JSON.stringify([asset.db, asset.store, asset.record.id]));
    if (existing && !equal(existing, asset)) conflicts.push({ store: asset.store, id: asset.record.id });
    else if (existing) identical++;
    else assets.push(asset);
  }
  return { additions, assets, conflicts, identical };
}

export async function restoreMissing(incoming, storage = localStorage) {
  validateBackup(incoming);
  const before = await captureFullBackup(storage);
  const plan = planRestore(before, incoming);
  // Save a full local recovery point before touching any store. Failure here prevents restore.
  await controlPut({ id: "before-restore", snapshot: before, capturedAt: new Date().toISOString() });
  let added = 0; let skipped = plan.conflicts.length;
  for (const [dbName, names] of Object.entries(ASSET_STORES)) for (const name of names) {
    const assets = plan.assets.filter((a) => a.db === dbName && a.store === name);
    if (!assets.length) continue;
    const db = await open(dbName);
    try {
      const tx = db.transaction(name, "readwrite"); const complete = done(tx); const store = tx.objectStore(name);
      for (const asset of assets) {
        const check = store.get(asset.record.id);
        check.onsuccess = () => { if (check.result === undefined) { store.add(asset.record); added++; } else skipped++; };
      }
      await complete;
    } finally { db.close(); }
  }
  // Re-read localStorage synchronously after IndexedDB work, avoiding stale overwrite of field edits.
  const fresh = planRestore(captureBackup(storage, new Date().toISOString(), 2), { format: "hpd-field-backup", version: 2, capturedAt: incoming.capturedAt, stores: incoming.stores, assets: [] });
  for (const key of BACKUP_KEYS) {
    const changes = fresh.additions.filter((a) => a.store === key);
    if (!changes.length) continue;
    if (key === ROUTE_KEY) {
      storage.setItem(key, JSON.stringify(changes[0].value));
      added++;
      continue;
    }
    const raw = storage.getItem(key); const original = raw ? JSON.parse(raw) : {};
    const merged = { ...rows(original) };
    for (const change of changes) merged[change.id] = change.value;
    storage.setItem(key, JSON.stringify(original.overrides ? { ...original, overrides: merged } : merged));
    added += changes.length;
  }
  return { added, conflicts: skipped + fresh.conflicts.filter((c) => !plan.conflicts.some((p) => p.store === c.store && p.id === c.id)).length };
}

export async function withBackupLock(work) {
  if (!navigator.locks) throw new Error("This browser needs Web Locks for safe multi-tab backup. Use an up-to-date Safari or Chrome.");
  return navigator.locks.request("hpd-drive-backup", { mode: "exclusive", ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("Another app tab is saving or restoring. Try again shortly.");
    return work();
  });
}
