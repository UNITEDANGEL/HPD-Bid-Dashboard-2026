export type FieldPhotoKind = "before" | "after";

export type FieldPhoto = {
  id: string;
  jobId: string;
  kind: FieldPhotoKind;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  capturedAt: string;
};

const DB_NAME = "hpd-field-photos-v1";
const STORE_NAME = "photos";
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.76;

function hasIndexedDb() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("Photo storage is not available in this browser."));
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
    };

    request.onerror = () => reject(request.error || new Error("Could not open photo storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Photo storage request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read photo."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not load photo for compression."));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

async function compressImage(file: File) {
  const original = await readFileAsDataUrl(file);
  if (!file.type.startsWith("image/")) {
    return { dataUrl: original, type: file.type || "application/octet-stream", size: file.size };
  }

  try {
    const image = await loadImage(original);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { dataUrl: original, type: file.type, size: file.size };
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return {
      dataUrl,
      type: "image/jpeg",
      size: Math.round((dataUrl.length * 3) / 4),
    };
  } catch {
    return { dataUrl: original, type: file.type, size: file.size };
  }
}

export function canStoreFieldPhotos() {
  return hasIndexedDb();
}

export async function saveFieldPhotos(jobId: string, kind: FieldPhotoKind, files: FileList | File[]) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return [] as FieldPhoto[];

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const saved: FieldPhoto[] = [];

  for (const file of Array.from(files).filter((item) => item.type.startsWith("image/"))) {
    const compressed = await compressImage(file);
    const capturedAt = new Date().toISOString();
    const photo: FieldPhoto = {
      id: `${cleanJobId}-${kind}-${capturedAt}-${Math.random().toString(36).slice(2, 8)}`,
      jobId: cleanJobId,
      kind,
      name: file.name || `${kind}-photo.jpg`,
      type: compressed.type,
      size: compressed.size,
      dataUrl: compressed.dataUrl,
      capturedAt,
    };
    store.put(photo);
    saved.push(photo);
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save photos."));
    transaction.onabort = () => reject(transaction.error || new Error("Photo save was aborted."));
  });

  db.close();
  return saved;
}

export async function listFieldPhotos(jobId: string) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId || !hasIndexedDb()) return [] as FieldPhoto[];

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.indexNames.contains("jobId")
    ? store.index("jobId").getAll(cleanJobId)
    : store.getAll();

  const rows = (await requestToPromise(request)) as FieldPhoto[];
  db.close();

  return rows
    .filter((photo) => photo.jobId === cleanJobId)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function countFieldPhotos(jobId: string) {
  const rows = await listFieldPhotos(jobId);
  return rows.reduce(
    (counts, photo) => {
      counts[photo.kind] += 1;
      return counts;
    },
    { before: 0, after: 0 } as Record<FieldPhotoKind, number>
  );
}

export function dataUrlToBytes(dataUrl: string) {
  const [, payload = ""] = dataUrl.split(",");
  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
