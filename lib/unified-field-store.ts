export type UnifiedEntityType = "media" | "document" | "visit" | "job_event" | "route" | "route_stop" | "note" | "invoice";

export type UnifiedMutation = {
  id: string;
  entityType: UnifiedEntityType;
  entityId: string;
  action: "upsert" | "delete";
  baseRevision: number;
  createdAt: string;
  attempts: number;
  status: "queued" | "syncing" | "error";
  lastError: string;
};

export type UnifiedStorageStatus = {
  enabled: boolean;
  available: boolean;
  queued: number;
  errors: number;
  migrated: Record<string, number>;
  quota?: number;
  usage?: number;
  lastSyncedAt?: string;
};

export type UnifiedSyncResult = {
  synced: number;
  remaining: number;
  error?: string;
};

const DB_NAME = "uac-field-v1";
const DB_VERSION = 2;
const FLAG_KEY = "hpd-unified-field-store-v1";
const DEVICE_KEY = "hpd-field-device-id-v1";
const MIGRATION_KEY = "legacy-migration-v1";
const ENTITY_STORES = ["jobs", "job_events", "routes", "route_stops", "visits", "notes", "media", "documents", "invoices"] as const;
const ENTITY_STORE_NAMES: Record<UnifiedEntityType, (typeof ENTITY_STORES)[number]> = {
  media: "media",
  document: "documents",
  visit: "visits",
  job_event: "job_events",
  route: "routes",
  route_stop: "route_stops",
  note: "notes",
  invoice: "invoices",
};
const CLOUD_SYNC_ENTITY_TYPES = new Set<UnifiedEntityType>(["visit", "job_event", "route", "route_stop"]);

function browserReady() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

export function unifiedFieldStoreEnabled() {
  if (!browserReady()) return false;
  const envFlag = process.env.NEXT_PUBLIC_UNIFIED_FIELD_STORE;
  if (envFlag === "off" || envFlag === "0" || envFlag === "false") return false;
  return window.localStorage.getItem(FLAG_KEY) !== "off";
}

function makeId(prefix: string) {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function deviceId() {
  const current = window.localStorage.getItem(DEVICE_KEY);
  if (current) return current;
  const next = makeId("device");
  window.localStorage.setItem(DEVICE_KEY, next);
  return next;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!browserReady()) return reject(new Error("Unified field storage is unavailable."));
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ENTITY_STORES.forEach((name) => {
        const store = db.objectStoreNames.contains(name) ? request.transaction?.objectStore(name) : db.createObjectStore(name, { keyPath: "id" });
        if (store && !store.indexNames.contains("jobId")) store.createIndex("jobId", "jobId", { unique: false });
        if (store && !store.indexNames.contains("updatedAt")) store.createIndex("updatedAt", "updatedAt", { unique: false });
      });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("sync_state")) db.createObjectStore("sync_state", { keyPath: "key" });
      const mutations = db.objectStoreNames.contains("mutations")
        ? request.transaction?.objectStore("mutations")
        : db.createObjectStore("mutations", { keyPath: "id" });
      if (mutations && !mutations.indexNames.contains("status")) mutations.createIndex("status", "status", { unique: false });
      if (mutations && !mutations.indexNames.contains("createdAt")) mutations.createIndex("createdAt", "createdAt", { unique: false });
    };
    request.onerror = () => reject(request.error || new Error("Could not open unified field storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Unified storage transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Unified storage transaction was aborted."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unified storage request failed."));
  });
}

function cloudSafeEntity(entityType: UnifiedEntityType, value: Record<string, unknown>) {
  const id = String(value.id || "");
  const jobId = String(value.jobId || "");
  if (entityType === "route") {
    return {
      id,
      acceptedAt: String(value.acceptedAt || value.updatedAt || ""),
      stopCount: Number(value.stop_count || value.stopCount || 0),
      status: String(value.status || "planned"),
    };
  }
  if (entityType === "route_stop") {
    return {
      id,
      routeId: String(value.routeId || ""),
      jobId,
      stopIndex: Number(value.stopIndex || 0),
      status: String(value.status || "planned"),
    };
  }
  if (entityType === "job_event") {
    return {
      id,
      jobId,
      step: String(value.step || ""),
      occurredAt: String(value.occurredAt || value.updatedAt || ""),
    };
  }
  return {
    id,
    jobId,
    status: String(value.status || value.outcome || "visited"),
    occurredAt: String(value.visitedAt || value.occurredAt || value.updatedAt || ""),
  };
}

export async function shadowUpsert(entityType: UnifiedEntityType, value: Record<string, unknown>) {
  if (!unifiedFieldStoreEnabled()) return false;
  const id = String(value.id || "").trim();
  if (!id) throw new Error("Unified storage record needs an id.");
  const storeName = ENTITY_STORE_NAMES[entityType];
  const now = new Date().toISOString();
  const db = await openDb();
  const transaction = db.transaction([storeName, "mutations"], "readwrite");
  transaction.objectStore(storeName).put({ ...value, id, revision: Number(value.revision || 1), deviceId: deviceId(), updatedAt: now, syncStatus: "queued" });
  const mutation: UnifiedMutation = { id: makeId("mutation"), entityType, entityId: id, action: "upsert", baseRevision: Number(value.revision || 0), createdAt: now, attempts: 0, status: "queued", lastError: "" };
  transaction.objectStore("mutations").put(mutation);
  await transactionDone(transaction);
  db.close();
  window.dispatchEvent(new CustomEvent("hpd-unified-storage-change"));
  return true;
}

async function legacyRows(dbName: string, storeName: string) {
  return new Promise<Record<string, unknown>[]>((resolve) => {
    const request = window.indexedDB.open(dbName);
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve([]); return; }
      const rows = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      rows.onerror = () => { db.close(); resolve([]); };
      rows.onsuccess = () => { db.close(); resolve((rows.result || []) as Record<string, unknown>[]); };
    };
  });
}

export async function copyLegacyFieldStorage() {
  if (!unifiedFieldStoreEnabled()) return {};
  const db = await openDb();
  const check = db.transaction("settings", "readonly").objectStore("settings").get(MIGRATION_KEY);
  const previous = await new Promise<any>((resolve) => { check.onsuccess = () => resolve(check.result); check.onerror = () => resolve(null); });
  db.close();
  if (previous?.completedAt) return previous.counts || {};

  const sources = [
    { db: "hpd-field-photos-v1", source: "photos", target: "media" },
    { db: "hpd-field-packets-v1", source: "packets", target: "documents" },
    { db: "hpd-field-visits-v1", source: "visits", target: "visits" },
  ];
  const counts: Record<string, number> = {};
  const unified = await openDb();
  for (const source of sources) {
    const rows = await legacyRows(source.db, source.source);
    if (rows.length) {
      const tx = unified.transaction(source.target, "readwrite");
      rows.forEach((row) => tx.objectStore(source.target).put({ ...row, revision: 1, updatedAt: String(row.capturedAt || row.generatedAt || row.visitedAt || new Date().toISOString()), syncStatus: "legacy-copied" }));
      await transactionDone(tx);
    }
    counts[source.target] = rows.length;
  }
  const done = unified.transaction("settings", "readwrite");
  done.objectStore("settings").put({ key: MIGRATION_KEY, completedAt: new Date().toISOString(), counts });
  await transactionDone(done);
  unified.close();
  return counts;
}

export async function unifiedStorageStatus(): Promise<UnifiedStorageStatus> {
  const enabled = unifiedFieldStoreEnabled();
  if (!enabled) return { enabled: false, available: browserReady(), queued: 0, errors: 0, migrated: {} };
  await copyLegacyFieldStorage();
  const db = await openDb();
  const tx = db.transaction(["mutations", "settings", "sync_state"], "readonly");
  const queuedRequest = tx.objectStore("mutations").index("status").count("queued");
  const errorRequest = tx.objectStore("mutations").index("status").count("error");
  const migrationRequest = tx.objectStore("settings").get(MIGRATION_KEY);
  const syncRequest = tx.objectStore("sync_state").get("last-sync");
  await transactionDone(tx);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const result = { enabled, available: true, queued: queuedRequest.result, errors: errorRequest.result, migrated: migrationRequest.result?.counts || {}, quota: estimate?.quota, usage: estimate?.usage, lastSyncedAt: syncRequest.result?.syncedAt };
  db.close();
  return result;
}

export async function syncUnifiedMutations(workerUrl: string, limit = 50): Promise<UnifiedSyncResult> {
  if (!unifiedFieldStoreEnabled() || !workerUrl) return { synced: 0, remaining: 0 };
  const db = await openDb();
  const all = await requestResult(db.transaction("mutations", "readonly").objectStore("mutations").getAll()) as UnifiedMutation[];
  const batch = all
    .filter((mutation) => CLOUD_SYNC_ENTITY_TYPES.has(mutation.entityType) && mutation.status !== "error" && mutation.attempts < 5)
    .slice(0, Math.max(1, Math.min(50, limit)));
  if (!batch.length) {
    db.close();
    return { synced: 0, remaining: all.filter((mutation) => mutation.status === "queued").length };
  }

  const syncUrl = `${workerUrl.replace(/\/$/, "")}/sync`;
  try {
    const capability = await fetch(syncUrl, { cache: "no-store" });
    const detail = capability.ok ? await capability.json().catch(() => null) as { sync?: boolean } | null : null;
    if (!detail?.sync) {
      db.close();
      return { synced: 0, remaining: all.length, error: "Cloud sync is not enabled on this Worker yet." };
    }
  } catch {
    db.close();
    return { synced: 0, remaining: all.length, error: "Cloud sync Worker is unreachable." };
  }

  const storeNames = Array.from(new Set(batch.map((mutation) => ENTITY_STORE_NAMES[mutation.entityType])));
  const read = db.transaction(storeNames, "readonly");
  const readDone = transactionDone(read);
  const payload = await Promise.all(batch.map(async (mutation) => {
    const entity = await requestResult(read.objectStore(ENTITY_STORE_NAMES[mutation.entityType]).get(mutation.entityId));
    return { ...mutation, entity: cloudSafeEntity(mutation.entityType, (entity || {}) as Record<string, unknown>) };
  }));
  await readDone;

  const marking = db.transaction("mutations", "readwrite");
  batch.forEach((mutation) => marking.objectStore("mutations").put({ ...mutation, status: "syncing" }));
  await transactionDone(marking);

  try {
    const response = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: deviceId(), mutations: payload }),
    });
    if (!response.ok) throw new Error(`Cloud sync returned ${response.status}.`);
    const result = await response.json() as { accepted?: string[]; syncedAt?: string };
    const accepted = new Set(Array.isArray(result.accepted) ? result.accepted : []);
    const syncedAt = result.syncedAt || new Date().toISOString();
    const writeStores = Array.from(new Set(["mutations", "sync_state", ...storeNames]));
    const saved = db.transaction(writeStores, "readwrite");
    batch.forEach((mutation) => {
      if (!accepted.has(mutation.id)) return;
      saved.objectStore("mutations").delete(mutation.id);
      const item = payload.find((row) => row.id === mutation.id)?.entity || {};
      saved.objectStore(ENTITY_STORE_NAMES[mutation.entityType]).put({ ...item, id: mutation.entityId, syncStatus: "synced", syncedAt });
    });
    saved.objectStore("sync_state").put({ key: "last-sync", syncedAt, accepted: accepted.size });
    await transactionDone(saved);
    const remaining = Math.max(0, all.length - accepted.size);
    db.close();
    window.dispatchEvent(new CustomEvent("hpd-unified-storage-change"));
    return { synced: accepted.size, remaining };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloud sync failed.";
    const failed = db.transaction("mutations", "readwrite");
    batch.forEach((mutation) => {
      const attempts = mutation.attempts + 1;
      failed.objectStore("mutations").put({ ...mutation, attempts, status: attempts >= 5 ? "error" : "queued", lastError: message });
    });
    await transactionDone(failed);
    db.close();
    window.dispatchEvent(new CustomEvent("hpd-unified-storage-change"));
    return { synced: 0, remaining: all.length, error: message };
  }
}
