export type FieldMediaKind =
  | "before"
  | "after"
  | "no_access"
  | "refused_access"
  | "completed_by_others"
  | "general";

export type FieldPhotoKind = FieldMediaKind;
export type FieldMediaType = "image" | "video";

export type FieldEvidenceMeta = {
  jobId?: string;
  address?: string;
  location?: string;
  borough?: string;
  outcome?: string;
  label?: string;
};

export type FieldMedia = {
  id: string;
  jobId: string;
  kind: FieldMediaKind;
  mediaType: FieldMediaType;
  evidenceLabel: string;
  address: string;
  location: string;
  borough: string;
  outcome: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  posterDataUrl?: string;
  capturedAt: string;
};

export type FieldPhoto = FieldMedia;

export type FieldMediaCounts = Record<FieldMediaKind, number> & {
  images: number;
  videos: number;
  total: number;
};

const DB_NAME = "hpd-field-photos-v1";
const STORE_NAME = "photos";
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.76;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

type EvidenceStampMeta = {
  jobId: string;
  kind: FieldMediaKind;
  label: string;
  address: string;
  location: string;
  borough: string;
  capturedAt: string;
};

function hasIndexedDb() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function emptyCounts(): FieldMediaCounts {
  return {
    before: 0,
    after: 0,
    no_access: 0,
    refused_access: 0,
    completed_by_others: 0,
    general: 0,
    images: 0,
    videos: 0,
    total: 0,
  };
}

function evidenceLabel(kind: FieldMediaKind) {
  const labels: Record<FieldMediaKind, string> = {
    before: "Before Work Evidence",
    after: "After Work Evidence",
    no_access: "No Access Evidence",
    refused_access: "Refused Access Evidence",
    completed_by_others: "Completed By Others Evidence",
    general: "Field Evidence",
  };
  return labels[kind];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("Evidence storage is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 2);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (store && !store.indexNames.contains("jobId")) {
        store.createIndex("jobId", "jobId", { unique: false });
      }
      if (store && !store.indexNames.contains("kind")) {
        store.createIndex("kind", "kind", { unique: false });
      }
      if (store && !store.indexNames.contains("mediaType")) {
        store.createIndex("mediaType", "mediaType", { unique: false });
      }
    };

    request.onerror = () => reject(request.error || new Error("Could not open evidence storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Evidence storage request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read evidence file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not load image evidence."));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

function cleanFilePart(value: string, fallback = "field") {
  const cleaned = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
  return cleaned || fallback;
}

function fileTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanFilePart(value || new Date().toISOString(), "DATE");
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function evidenceFileName(meta: EvidenceStampMeta, mediaType: FieldMediaType, mimeType: string) {
  const extension = mimeType.includes("quicktime")
    ? "mov"
    : mimeType.includes("mp4")
      ? "mp4"
      : mediaType === "video"
        ? "mp4"
        : "jpg";
  const location = meta.location || meta.address || meta.borough || "LOCATION";
  return [
    cleanFilePart(meta.jobId, "OMO"),
    cleanFilePart(location, "LOCATION"),
    cleanFilePart(meta.kind.replace(/_/g, "-"), "EVIDENCE"),
    fileTimestamp(meta.capturedAt),
  ].join("_") + `.${extension}`;
}

function stampDisplayText(value: string, maxLength = 70) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stampEvidenceImage(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, meta: EvidenceStampMeta) {
  const width = canvas.width;
  const height = canvas.height;
  const location = stampDisplayText([meta.location, meta.borough].filter(Boolean).join(" - ") || meta.address || "Location not listed");
  const address = stampDisplayText(meta.address || "Address not listed");
  const captured = new Date(meta.capturedAt);
  const capturedLabel = Number.isNaN(captured.getTime())
    ? meta.capturedAt
    : captured.toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  const topSize = Math.max(22, Math.round(width * 0.035));
  const lineSize = Math.max(16, Math.round(width * 0.024));
  const pad = Math.max(14, Math.round(width * 0.022));
  const topHeight = topSize + pad * 1.4;
  const bottomHeight = lineSize * 3.4 + pad * 1.7;

  context.save();
  context.fillStyle = "rgba(5, 10, 17, 0.78)";
  context.fillRect(0, 0, width, topHeight);
  context.fillRect(0, height - bottomHeight, width, bottomHeight);
  context.fillStyle = "#ffffff";
  context.font = `900 ${topSize}px Arial, sans-serif`;
  context.fillText(stampDisplayText(meta.label.toUpperCase(), 42), pad, pad + topSize * 0.82);
  context.font = `800 ${lineSize}px Arial, sans-serif`;
  const bottomY = height - bottomHeight + pad + lineSize;
  context.fillText(`OMO / WORK #: ${stampDisplayText(meta.jobId, 36)}`, pad, bottomY);
  context.fillText(`LOCATION: ${location}`, pad, bottomY + lineSize * 1.25);
  context.fillText(`ADDRESS: ${address}  |  ${capturedLabel}`, pad, bottomY + lineSize * 2.5);
  context.restore();
}

function loadVideo(dataUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timeout = window.setTimeout(() => reject(new Error("Video thumbnail timed out.")), 5500);
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.35, video.duration || 0);
      } catch {
        window.clearTimeout(timeout);
        resolve(video);
      }
    };
    video.onseeked = () => {
      window.clearTimeout(timeout);
      resolve(video);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Could not load video evidence."));
    };
    video.src = dataUrl;
  });
}

async function processImageEvidence(file: File, stampMeta: EvidenceStampMeta) {
  const original = await readFileAsDataUrl(file);

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
    stampEvidenceImage(canvas, context, stampMeta);
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

async function makeVideoPoster(dataUrl: string) {
  try {
    const video = await loadVideo(dataUrl);
    const width = Math.max(1, video.videoWidth || 640);
    const height = Math.max(1, video.videoHeight || 360);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return "";
  }
}

export function canStoreFieldPhotos() {
  return hasIndexedDb();
}

export function canStoreFieldEvidence() {
  return hasIndexedDb();
}

export async function saveFieldPhotos(
  jobId: string,
  kind: FieldMediaKind,
  files: FileList | File[],
  meta: FieldEvidenceMeta = {}
) {
  const cleanJobId = String(meta.jobId || jobId || "").trim();
  if (!cleanJobId) return [] as FieldMedia[];

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const saved: FieldMedia[] = [];

  for (const file of Array.from(files).filter((item) => item.type.startsWith("image/") || item.type.startsWith("video/"))) {
    if (file.type.startsWith("video/") && file.size > MAX_VIDEO_BYTES) {
      throw new Error("Video is too large. Keep evidence clips under 90 MB.");
    }

    const capturedAt = new Date().toISOString();
    const mediaType: FieldMediaType = file.type.startsWith("video/") ? "video" : "image";
    const label = meta.label || evidenceLabel(kind);
    const stampMeta: EvidenceStampMeta = {
      jobId: cleanJobId,
      kind,
      label,
      address: String(meta.address || "").trim(),
      location: String(meta.location || "").trim(),
      borough: String(meta.borough || "").trim(),
      capturedAt,
    };
    const source =
      mediaType === "image"
        ? await processImageEvidence(file, stampMeta)
        : { dataUrl: await readFileAsDataUrl(file), type: file.type || "video/mp4", size: file.size };
    const posterDataUrl = mediaType === "video" ? await makeVideoPoster(source.dataUrl) : "";
    const evidenceName = evidenceFileName(stampMeta, mediaType, source.type || file.type || "");

    const evidence: FieldMedia = {
      id: `${cleanJobId}-${kind}-${capturedAt}-${Math.random().toString(36).slice(2, 8)}`,
      jobId: cleanJobId,
      kind,
      mediaType,
      evidenceLabel: label,
      address: stampMeta.address,
      location: stampMeta.location,
      borough: stampMeta.borough,
      outcome: String(meta.outcome || "").trim(),
      name: evidenceName,
      type: source.type || file.type || "application/octet-stream",
      size: source.size || file.size,
      dataUrl: source.dataUrl,
      posterDataUrl,
      capturedAt,
    };
    store.put(evidence);
    saved.push(evidence);
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save evidence."));
    transaction.onabort = () => reject(transaction.error || new Error("Evidence save was aborted."));
  });

  db.close();
  return saved;
}

export async function listFieldPhotos(jobId: string) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId || !hasIndexedDb()) return [] as FieldMedia[];

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.indexNames.contains("jobId")
    ? store.index("jobId").getAll(cleanJobId)
    : store.getAll();

  const rows = (await requestToPromise(request)) as FieldMedia[];
  db.close();

  return rows
    .filter((media) => media.jobId === cleanJobId)
    .map((media) => ({
      ...media,
      mediaType: media.mediaType || (String(media.type || "").startsWith("video/") ? "video" : "image"),
      evidenceLabel: media.evidenceLabel || evidenceLabel(media.kind || "general"),
      address: media.address || "",
      location: media.location || "",
      borough: media.borough || "",
      outcome: media.outcome || "",
    }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function listFieldEvidence(jobId: string) {
  return listFieldPhotos(jobId);
}

export async function clearFieldEvidence(jobId: string) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId || !hasIndexedDb()) return 0;

  const rows = await listFieldPhotos(cleanJobId);
  if (!rows.length) return 0;

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  rows.forEach((media) => {
    store.delete(media.id);
  });

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not clear evidence."));
    transaction.onabort = () => reject(transaction.error || new Error("Evidence clear was aborted."));
  });

  db.close();
  return rows.length;
}

export async function countFieldPhotos(jobId: string) {
  const rows = await listFieldPhotos(jobId);
  return rows.reduce((counts, media) => {
    const kind = media.kind || "general";
    counts[kind] += 1;
    counts.total += 1;
    if (media.mediaType === "video") counts.videos += 1;
    else counts.images += 1;
    return counts;
  }, emptyCounts());
}

export async function countFieldEvidence(jobId: string) {
  return countFieldPhotos(jobId);
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
