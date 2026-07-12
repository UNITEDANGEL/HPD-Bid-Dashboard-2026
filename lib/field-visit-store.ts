export type FieldVisitSource = "auto_nearby" | "manual_here";

export type FieldVisitRecord = {
  id: string;
  jobId: string;
  address: string;
  location: string;
  borough: string;
  jobLat: number;
  jobLng: number;
  userLat: number;
  userLng: number;
  distanceMiles: number;
  accuracy: number;
  visitDate: string;
  visitedAt: string;
  source: FieldVisitSource;
  note: string;
};

import { shadowUpsert } from "./unified-field-store";

const DB_NAME = "hpd-field-visits-v1";
const STORE_NAME = "visits";

function hasIndexedDb() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("Private visit tracking is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (store && !store.indexNames.contains("jobId")) {
        store.createIndex("jobId", "jobId", { unique: false });
      }
      if (store && !store.indexNames.contains("visitDate")) {
        store.createIndex("visitDate", "visitDate", { unique: false });
      }
    };

    request.onerror = () => reject(request.error || new Error("Could not open private visit tracking."));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Private visit tracking request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function canStoreFieldVisits() {
  return hasIndexedDb();
}

export async function listFieldVisits(jobId?: string) {
  if (!hasIndexedDb()) return [] as FieldVisitRecord[];

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const cleanJobId = String(jobId || "").trim();
  const request = cleanJobId && store.indexNames.contains("jobId")
    ? store.index("jobId").getAll(cleanJobId)
    : store.getAll();

  const rows = (await requestToPromise(request)) as FieldVisitRecord[];
  db.close();

  return rows
    .filter((row) => !cleanJobId || row.jobId === cleanJobId)
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
}

export async function saveFieldVisit(record: Omit<FieldVisitRecord, "id" | "visitDate" | "visitedAt"> & Partial<Pick<FieldVisitRecord, "id" | "visitDate" | "visitedAt">>) {
  const jobId = String(record.jobId || "").trim();
  if (!jobId) throw new Error("Visit record needs a work order.");

  const visitedAt = record.visitedAt || new Date().toISOString();
  const visitDate = record.visitDate || todayKey(new Date(visitedAt));
  const row: FieldVisitRecord = {
    id: record.id || `${jobId}-${visitDate}-${record.source || "visit"}`,
    jobId,
    address: record.address || "",
    location: record.location || "",
    borough: record.borough || "",
    jobLat: Number(record.jobLat || 0),
    jobLng: Number(record.jobLng || 0),
    userLat: Number(record.userLat || 0),
    userLng: Number(record.userLng || 0),
    distanceMiles: Number(record.distanceMiles || 0),
    accuracy: Number(record.accuracy || 0),
    visitDate,
    visitedAt,
    source: record.source || "manual_here",
    note: record.note || "",
  };

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(row);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save private visit."));
    transaction.onabort = () => reject(transaction.error || new Error("Private visit save was aborted."));
  });

  db.close();
  await shadowUpsert("visit", row as unknown as Record<string, unknown>);
  return row;
}

export async function fieldVisitSummaryByJob() {
  const rows = await listFieldVisits();
  const summary: Record<string, { latest?: FieldVisitRecord; today?: FieldVisitRecord; count: number }> = {};
  const today = todayKey();

  rows.forEach((row) => {
    const current = summary[row.jobId] || { count: 0 };
    current.count += 1;
    if (!current.latest || row.visitedAt > current.latest.visitedAt) current.latest = row;
    if (row.visitDate === today && (!current.today || row.visitedAt > current.today.visitedAt)) current.today = row;
    summary[row.jobId] = current;
  });

  return summary;
}
