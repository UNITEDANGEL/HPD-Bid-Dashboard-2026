export type FieldPacketType =
  | "email_evidence_pdf"
  | "affidavit_invoice_pdf"
  | "full_evidence_zip"
  | "application_package_zip"
  | "video_package_zip";

export type FieldPacket = {
  id: string;
  jobId: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  size: number;
  evidenceCount: number;
  imageCount: number;
  videoCount: number;
  packetType: FieldPacketType;
  note: string;
  generatedAt: string;
};

import { shadowUpsert } from "./unified-field-store";

const DB_NAME = "hpd-field-packets-v1";
const STORE_NAME = "packets";

function hasIndexedDb() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("Packet storage is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 3);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (store && !store.indexNames.contains("jobId")) {
        store.createIndex("jobId", "jobId", { unique: false });
      }
      if (store && !store.indexNames.contains("generatedAt")) {
        store.createIndex("generatedAt", "generatedAt", { unique: false });
      }
    };

    request.onerror = () => reject(request.error || new Error("Could not open packet storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Packet storage request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

export function canStoreFieldPackets() {
  return hasIndexedDb();
}

export function bytesToDataUrl(bytes: Uint8Array | ArrayBuffer, mimeType = "application/pdf") {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < view.length; index += chunkSize) {
    const chunk = view.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${mimeType};base64,${window.btoa(binary)}`;
}

export async function saveFieldPacket(packet: Omit<FieldPacket, "id" | "generatedAt"> & Partial<Pick<FieldPacket, "id" | "generatedAt">>) {
  const jobId = String(packet.jobId || "").trim();
  if (!jobId) throw new Error("Packet needs a job id.");

  const generatedAt = packet.generatedAt || new Date().toISOString();
  const row: FieldPacket = {
    id: packet.id || `${jobId}-packet-${generatedAt}-${Math.random().toString(36).slice(2, 8)}`,
    jobId,
    fileName: packet.fileName,
    mimeType: packet.mimeType || "application/pdf",
    dataUrl: packet.dataUrl,
    size: packet.size || 0,
    evidenceCount: packet.evidenceCount || 0,
    imageCount: packet.imageCount || 0,
    videoCount: packet.videoCount || 0,
    packetType: packet.packetType,
    note: packet.note || "",
    generatedAt,
  };

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(row);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save packet."));
    transaction.onabort = () => reject(transaction.error || new Error("Packet save was aborted."));
  });

  db.close();
  await shadowUpsert("document", row as unknown as Record<string, unknown>);
  return row;
}

export async function listFieldPackets(jobId: string) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId || !hasIndexedDb()) return [] as FieldPacket[];

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.indexNames.contains("jobId")
    ? store.index("jobId").getAll(cleanJobId)
    : store.getAll();

  const rows = (await requestToPromise(request)) as FieldPacket[];
  db.close();

  return rows
    .filter((packet) => packet.jobId === cleanJobId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export async function clearFieldPackets(jobId: string, packetTypes?: FieldPacketType[]) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId || !hasIndexedDb()) return 0;

  const rows = await listFieldPackets(cleanJobId);
  const packetTypeSet = packetTypes?.length ? new Set(packetTypes) : null;
  const rowsToDelete = packetTypeSet ? rows.filter((packet) => packetTypeSet.has(packet.packetType)) : rows;
  if (!rowsToDelete.length) return 0;

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  rowsToDelete.forEach((packet) => {
    store.delete(packet.id);
  });

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not clear packets."));
    transaction.onabort = () => reject(transaction.error || new Error("Packet clear was aborted."));
  });

  db.close();
  return rowsToDelete.length;
}
