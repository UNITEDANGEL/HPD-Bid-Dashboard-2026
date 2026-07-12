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
};

const DB_NAME = "uac-field-v1";
const DB_VERSION = 1;
const FLAG_KEY = "hpd-unified-field-store-v1";
const DEVICE_KEY = "hpd-field-device-id-v1";
const MIGRATION_KEY = "legacy-migration-v1";
const ENTITY_STORES = ["jobs", "job_events", "routes", "route_stops", "visits", "notes", "media", "documents", "invoices"] as const;

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
      if (!db.objectStoreNames.contains("mutations")) {
        const mutations = db.createObjectStore("mutations", { keyPath: "id" });
        mutations.createIndex("status", "status", { unique: false });
        mutations.createIndex("createdAt", "createdAt", { unique: false });
      }
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

export async function shadowUpsert(entityType: UnifiedEntityType, value: Record<string, unknown>) {
  if (!unifiedFieldStoreEnabled()) return false;
  const id = String(value.id || "").trim();
  if (!id) throw new Error("Unified storage record needs an id.");
  const storeName = entityType === "document" ? "documents" : entityType;
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
  const tx = db.transaction(["mutations", "settings"], "readonly");
  const queuedRequest = tx.objectStore("mutations").index("status").count("queued");
  const errorRequest = tx.objectStore("mutations").index("status").count("error");
  const migrationRequest = tx.objectStore("settings").get(MIGRATION_KEY);
  await transactionDone(tx);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const result = { enabled, available: true, queued: queuedRequest.result, errors: errorRequest.result, migrated: migrationRequest.result?.counts || {}, quota: estimate?.quota, usage: estimate?.usage };
  db.close();
  return result;
}
