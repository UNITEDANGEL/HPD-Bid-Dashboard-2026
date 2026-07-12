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
  stamped?: boolean;
  stampError?: string;
};

export type FieldPhoto = FieldMedia;

import { shadowUpsert } from "./unified-field-store";

export type FieldMediaCounts = Record<FieldMediaKind, number> & {
  images: number;
  videos: number;
  total: number;
};

const DB_NAME = "hpd-field-photos-v1";
const STORE_NAME = "photos";
const MAX_IMAGE_SIDE = 1600;
const MAX_VIDEO_SIDE = 960;
const JPEG_QUALITY = 0.76;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
const MAX_STAMPED_VIDEO_SECONDS = 120;
const VIDEO_STAMP_FPS = 24;
const VIDEO_STAMP_BITS_PER_SECOND = 2500000;

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

function readFileAsDataUrl(file: File, fallbackMime = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read evidence file."));
    reader.onload = () => {
      let result = String(reader.result || "");
      if (fallbackMime && result.startsWith("data:;")) {
        result = result.replace("data:;", `data:${fallbackMime};`);
      }
      if (fallbackMime && result.startsWith("data:application/octet-stream;")) {
        result = result.replace("data:application/octet-stream;", `data:${fallbackMime};`);
      }
      resolve(result);
    };
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

export async function compactImageDataUrl(dataUrl: string, maxSide = 1100, quality = 0.62) {
  if (!dataUrl || typeof document === "undefined") return dataUrl;

  try {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
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
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function evidenceFileName(meta: EvidenceStampMeta, mediaType: FieldMediaType, mimeType: string) {
  const normalizedType = String(mimeType || "").toLowerCase();
  const extension = normalizedType.includes("quicktime")
    ? "mov"
    : normalizedType.includes("webm")
      ? "webm"
      : normalizedType.includes("3gpp")
        ? "3gp"
        : normalizedType.includes("mp4")
      ? "mp4"
          : normalizedType.includes("png")
            ? "png"
            : normalizedType.includes("webp")
              ? "webp"
              : normalizedType.includes("heif")
                ? "heif"
                : normalizedType.includes("heic")
                  ? "heic"
                  : mediaType === "video"
                    ? "mp4"
                    : "jpg";
  const location = meta.location || meta.address || meta.borough || "LOCATION";
  const label = meta.label || meta.kind.replace(/_/g, "-") || "EVIDENCE";
  return [
    cleanFilePart(meta.jobId, "OMO"),
    cleanFilePart(location, "LOCATION"),
    cleanFilePart(label, "EVIDENCE"),
    mediaType === "video" ? "VIDEO" : "PHOTO",
    fileTimestamp(meta.capturedAt),
  ].join("_") + `.${extension}`;
}

function fileExtension(file: File) {
  return String(file.name || "").split(".").pop()?.toLowerCase() || "";
}

function mediaTypeForFile(file: File): FieldMediaType | "" {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";

  const extension = fileExtension(file);
  if (["gif", "jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension)) return "image";
  if (["3gp", "m4v", "mp4", "mov", "webm"].includes(extension)) return "video";

  return "";
}

function mimeTypeForFile(file: File, mediaType: FieldMediaType) {
  const type = String(file.type || "").trim();
  if (type) return type;

  const extension = fileExtension(file);
  if (extension === "gif") return "image/gif";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "3gp") return "video/3gpp";
  if (mediaType === "video") return "video/mp4";
  return "image/jpeg";
}

type DetectedMediaFile = {
  mediaType: FieldMediaType;
  mimeType: string;
};

async function sniffMediaFile(file: File): Promise<DetectedMediaFile | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    const text = Array.from(bytes)
      .map((byte) => String.fromCharCode(byte))
      .join("");

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { mediaType: "image", mimeType: "image/jpeg" };
    }
    if (bytes[0] === 0x89 && text.slice(1, 4) === "PNG") {
      return { mediaType: "image", mimeType: "image/png" };
    }
    if (text.startsWith("GIF8")) {
      return { mediaType: "image", mimeType: "image/gif" };
    }
    if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") {
      return { mediaType: "image", mimeType: "image/webp" };
    }
    if (text.slice(4, 8) === "ftyp") {
      const brand = text.slice(8, 12).trim().toLowerCase();
      if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
        return { mediaType: "image", mimeType: brand === "mif1" || brand === "msf1" ? "image/heif" : "image/heic" };
      }
      if (brand === "qt") return { mediaType: "video", mimeType: "video/quicktime" };
      if (brand.startsWith("3gp")) return { mediaType: "video", mimeType: "video/3gpp" };
      return { mediaType: "video", mimeType: "video/mp4" };
    }
  } catch {
    return null;
  }

  return null;
}

async function detectMediaFile(file: File): Promise<DetectedMediaFile | null> {
  const mediaType = mediaTypeForFile(file);
  if (mediaType) return { mediaType, mimeType: mimeTypeForFile(file, mediaType) };
  return sniffMediaFile(file);
}

function stampDisplayText(value: string, maxLength = 70) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function fittedStampText(context: CanvasRenderingContext2D, value: string, maxWidth: number, fontSize: number, weight = 800) {
  let text = stampDisplayText(value, 120);
  let size = fontSize;

  while (size > 10) {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return { text, size };
    size -= 1;
  }

  context.font = `${weight} ${size}px Arial, sans-serif`;
  while (text.length > 8 && context.measureText(`${text.slice(0, -1)}...`).width > maxWidth) {
    text = text.slice(0, -1);
  }

  return { text: text.length > 8 ? `${text}...` : text, size };
}

function drawFittedStampText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  weight = 800
) {
  const fitted = fittedStampText(context, value, maxWidth, fontSize, weight);
  context.font = `${weight} ${fitted.size}px Arial, sans-serif`;
  context.fillText(fitted.text, x, y);
}

function stampStageTitle(kind: FieldMediaKind, label: string) {
  const titles: Record<FieldMediaKind, string> = {
    before: "BEFORE",
    after: "AFTER",
    no_access: "NO ACCESS",
    refused_access: "REFUSED ACCESS",
    completed_by_others: "DONE BY OTHERS",
    general: "FIELD EVIDENCE",
  };
  return titles[kind] || stampDisplayText(label.toUpperCase(), 28) || "FIELD EVIDENCE";
}

function stampEvidenceImage(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, meta: EvidenceStampMeta) {
  const width = canvas.width;
  const height = canvas.height;
  const location = [meta.location, meta.borough].filter(Boolean).join(" - ") || meta.address || "Location not listed";
  const address = meta.address || "Address not listed";
  const captured = new Date(meta.capturedAt);
  const capturedLabel = Number.isNaN(captured.getTime())
    ? meta.capturedAt
    : captured.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
  const stageLabel = stampStageTitle(meta.kind, meta.label);
  const topSize = Math.max(24, Math.round(width * 0.052));
  const subSize = Math.max(12, Math.round(width * 0.021));
  const lineSize = Math.max(13, Math.round(width * 0.021));
  const pad = Math.max(12, Math.round(width * 0.02));
  const textWidth = width - pad * 2;
  const topHeight = topSize + subSize + pad * 1.75;
  const bottomHeight = lineSize * 4.75 + pad * 1.55;
  const bottomY = height - bottomHeight + pad + lineSize;
  const lineGap = lineSize * 1.08;

  context.save();
  context.fillStyle = "rgba(5, 10, 17, 0.84)";
  context.fillRect(0, 0, width, topHeight);
  context.fillRect(0, height - bottomHeight, width, bottomHeight);
  context.fillStyle = "#ffffff";
  drawFittedStampText(context, stageLabel, pad, pad + topSize * 0.82, textWidth, topSize, 900);
  drawFittedStampText(context, meta.label.toUpperCase(), pad, pad + topSize + subSize * 0.95, textWidth, subSize, 800);
  drawFittedStampText(context, `OMO / WORK #: ${meta.jobId}`, pad, bottomY, textWidth, lineSize, 800);
  drawFittedStampText(context, `LOCATION: ${location}`, pad, bottomY + lineGap, textWidth, lineSize, 800);
  drawFittedStampText(context, `ADDRESS: ${address}`, pad, bottomY + lineGap * 2, textWidth, lineSize, 800);
  drawFittedStampText(context, `DATE: ${capturedLabel}`, pad, bottomY + lineGap * 3, textWidth, lineSize, 900);
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
      const targetTime = Math.min(0.35, video.duration || 0);
      if (targetTime <= 0.04) {
        window.clearTimeout(timeout);
        resolve(video);
        return;
      }
      try {
        video.currentTime = targetTime;
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
    video.load();
  });
}

function stampedVideoMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read stamped video."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    if (Math.abs((video.currentTime || 0) - seconds) < 0.04) {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video seek timed out."));
    }, 5000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not seek video evidence."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = seconds;
    } catch {
      cleanup();
      resolve();
    }
  });
}

function waitForVideoFrame(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function recordStampedVideoBySeeking(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  stampMeta: EvidenceStampMeta,
  duration: number
) {
  const seconds = Math.max(2, Math.min(Number.isFinite(duration) && duration > 0 ? duration : 6, 30));
  const fps = 6;
  const frameCount = Math.max(12, Math.ceil(seconds * fps));
  const frameDelay = Math.round(1000 / fps);

  for (let index = 0; index < frameCount; index += 1) {
    const progress = frameCount <= 1 ? 0 : index / (frameCount - 1);
    const targetSecond = Math.max(0, Math.min(seconds * progress, Math.max(0, (duration || seconds) - 0.08)));
    await seekVideo(video, targetSecond);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stampEvidenceImage(canvas, context, stampMeta);
    await waitForVideoFrame(frameDelay);
  }
}

type DecodedImageEvidence = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

type ProcessedEvidenceSource = {
  dataUrl: string;
  type: string;
  size: number;
  stamped?: boolean;
  stampError?: string;
};

async function decodeImageEvidence(file: File, dataUrl: string): Promise<DecodedImageEvidence> {
  let imageError: unknown = null;

  try {
    const image = await loadImage(dataUrl);
    return {
      source: image,
      width: image.width,
      height: image.height,
    };
  } catch (error) {
    imageError = error;
  }

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {}
  }

  throw imageError instanceof Error ? imageError : new Error("Could not load image evidence.");
}

async function processVideoEvidence(file: File, stampMeta: EvidenceStampMeta, mimeType: string) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video stamping is not available in this browser. Use Chrome mobile for stamped video evidence.");
  }

  const recordingMimeType = stampedVideoMimeType();
  if (!recordingMimeType) {
    throw new Error("This browser cannot create stamped evidence videos. Try Chrome and keep the clip short.");
  }

  const original = await readFileAsDataUrl(file, mimeType || "video/mp4");
  const video = await loadVideo(original);
  const rawDuration = Number.isFinite(video.duration) ? video.duration : 0;
  const hasKnownDuration = rawDuration > 0;
  const duration = hasKnownDuration ? rawDuration : 6;
  if (duration > MAX_STAMPED_VIDEO_SECONDS) {
    throw new Error(`Video is too long to stamp on this phone. Keep clips under ${MAX_STAMPED_VIDEO_SECONDS} seconds.`);
  }

  await seekVideo(video, 0);

  const width = Math.max(1, video.videoWidth || 640);
  const height = Math.max(1, video.videoHeight || 360);
  const scale = Math.min(1, MAX_VIDEO_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  const captureStream = canvas.captureStream?.(VIDEO_STAMP_FPS);
  if (!context || !captureStream) {
    throw new Error("This browser cannot stamp videos from the camera. Try Chrome mobile.");
  }

  let sourceStream: MediaStream | undefined;
  try {
    sourceStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    sourceStream?.getAudioTracks().forEach((track) => captureStream.addTrack(track));
  } catch {}

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(captureStream, {
    mimeType: recordingMimeType,
    videoBitsPerSecond: VIDEO_STAMP_BITS_PER_SECOND,
  });

  let frameId = 0;
  let drawing = false;
  let recordingStopped = false;

  const drawFrame = () => {
    if (!drawing) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stampEvidenceImage(canvas, context, stampMeta);
    frameId = window.requestAnimationFrame(drawFrame);
  };

  const recorded = new Promise<Blob>((resolve, reject) => {
    const maxMs = Math.max(8000, duration * 1000 + 6000);
    const timeout = window.setTimeout(() => {
      drawing = false;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
      reject(new Error("Stamped video timed out. Try a shorter clip."));
    }, maxMs);

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Video stamp recording failed."));
    };
    recorder.onstop = () => {
      window.clearTimeout(timeout);
      drawing = false;
      recordingStopped = true;
      const blob = new Blob(chunks, { type: recorder.mimeType || recordingMimeType || "video/webm" });
      if (!blob.size) {
        reject(new Error("Stamped video was empty. Try recording a shorter clip."));
        return;
      }
      resolve(blob);
    };
  });

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  stampEvidenceImage(canvas, context, stampMeta);
  recorder.start(500);
  drawing = true;
  drawFrame();

  try {
    video.muted = true;
    video.playsInline = true;
    const ended = new Promise<void>((resolve) => {
      video.addEventListener("ended", () => resolve(), { once: true });
    });
    try {
      await video.play();
      const shortUnknownDurationWait = new Promise<void>((resolve) => window.setTimeout(resolve, duration * 1000));
      await Promise.race([
        hasKnownDuration ? ended : shortUnknownDurationWait,
        recorded.then(() => undefined),
      ]);
    } catch {
      drawing = false;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
      await recordStampedVideoBySeeking(video, canvas, context, stampMeta, duration);
    }
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await recorded;
    const dataUrl = await blobToDataUrl(blob);
    return {
      dataUrl,
      type: blob.type || "video/webm",
      size: blob.size,
    };
  } finally {
    drawing = false;
    if (frameId) window.cancelAnimationFrame(frameId);
    try {
      if (!recordingStopped && recorder.state !== "inactive") recorder.stop();
    } catch {}
    video.pause();
    video.removeAttribute("src");
    video.load();
    captureStream.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());
  }
}

async function processVideoEvidenceWithFallback(file: File, stampMeta: EvidenceStampMeta, mimeType: string) {
  try {
    const stamped = await processVideoEvidence(file, stampMeta, mimeType);
    return {
      ...stamped,
      stamped: true,
      stampError: "",
    };
  } catch (error) {
    console.warn("Video stamp failed; saving original video for package.", error);
    return {
      dataUrl: await readFileAsDataUrl(file, mimeType || file.type || "video/mp4"),
      type: mimeType || file.type || "video/mp4",
      size: file.size,
      stamped: false,
      stampError: error instanceof Error ? error.message : "Video stamp failed.",
    };
  }
}

async function processImageEvidence(file: File, stampMeta: EvidenceStampMeta, mimeType: string) {
  const original = await readFileAsDataUrl(file, mimeType || "image/jpeg");
  let decoded: DecodedImageEvidence | null = null;

  try {
    decoded = await decodeImageEvidence(file, original);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create image label canvas.");
    context.drawImage(decoded.source, 0, 0, width, height);
    stampEvidenceImage(canvas, context, stampMeta);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return {
      dataUrl,
      type: "image/jpeg",
      size: Math.round((dataUrl.length * 3) / 4),
    };
  } catch (error) {
    throw new Error(error instanceof Error ? `Image label could not be burned in: ${error.message}` : "Image label could not be burned in.");
  } finally {
    decoded?.close?.();
  }
}

async function makeVideoPoster(dataUrl: string, stampMeta: EvidenceStampMeta) {
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
    stampEvidenceImage(canvas, context, stampMeta);
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

  const saved: FieldMedia[] = [];

  for (const file of Array.from(files)) {
    const detected = await detectMediaFile(file);
    if (!detected) continue;
    const { mediaType, mimeType } = detected;
    if (mediaType === "video" && file.size > MAX_VIDEO_BYTES) {
      throw new Error("Video is too large. Keep evidence clips under 90 MB.");
    }

    const capturedAt = new Date().toISOString();
    const defaultLabel = `${evidenceLabel(kind)} ${mediaType === "video" ? "Video" : "Photo"}`;
    const label = meta.label || defaultLabel;
    const stampMeta: EvidenceStampMeta = {
      jobId: cleanJobId,
      kind,
      label,
      address: String(meta.address || "").trim(),
      location: String(meta.location || "").trim(),
      borough: String(meta.borough || "").trim(),
      capturedAt,
    };
    const source: ProcessedEvidenceSource =
      mediaType === "image"
        ? await processImageEvidence(file, stampMeta, mimeType)
        : await processVideoEvidenceWithFallback(file, stampMeta, mimeType);
    const posterDataUrl = mediaType === "video" ? await makeVideoPoster(source.dataUrl, stampMeta) : "";
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
      stamped: source.stamped !== false,
      stampError: source.stampError || "",
    };
    saved.push(evidence);
  }

  if (!saved.length) return saved;

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    saved.forEach((evidence) => {
      store.put(evidence);
    });

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save evidence."));
      transaction.onabort = () => reject(transaction.error || new Error("Evidence save was aborted."));
    });
  } finally {
    db.close();
  }

  await Promise.all(saved.map((evidence) => shadowUpsert("media", evidence as unknown as Record<string, unknown>)));

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

export async function updateFieldEvidence(
  jobId: string,
  mediaId: string,
  updates: Partial<Pick<FieldMedia, "kind" | "evidenceLabel" | "outcome" | "name">>
) {
  const cleanJobId = String(jobId || "").trim();
  const cleanMediaId = String(mediaId || "").trim();
  if (!cleanJobId || !cleanMediaId || !hasIndexedDb()) return null;

  const rows = await listFieldPhotos(cleanJobId);
  const existing = rows.find((media) => media.id === cleanMediaId);
  if (!existing) return null;

  const nextKind = updates.kind || existing.kind || "general";
  const nextLabel = String(updates.evidenceLabel || "").trim() || existing.evidenceLabel || evidenceLabel(nextKind);
  const updated: FieldMedia = {
    ...existing,
    kind: nextKind,
    evidenceLabel: nextLabel,
    outcome: String(updates.outcome ?? existing.outcome ?? "").trim(),
    name: String(updates.name || "").trim() || existing.name,
  };

  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(updated);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not update evidence."));
    transaction.onabort = () => reject(transaction.error || new Error("Evidence update was aborted."));
  });

  db.close();
  await shadowUpsert("media", updated as unknown as Record<string, unknown>);
  return updated;
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
