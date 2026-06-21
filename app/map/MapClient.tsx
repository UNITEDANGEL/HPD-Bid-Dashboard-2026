"use client";
const HPD_STATUS_WORKER_URL = "https://hpd-status-worker.uac525.workers.dev";
const MAPTILER_ENV_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
const MAPTILER_KEY_STORAGE_KEY = "hpd-maptiler-browser-key-v1";
const MAP_BASE_STYLE_STORAGE_KEY = "hpd-map-base-style-v1";
const LOCATION_ALWAYS_STORAGE_KEY = "hpd-map-location-always-v1";
const MAP_DAYS_PRESETS = ["7", "14", "30", "60", "90", "180"];
const USER_LOCATION_OVERVIEW_ZOOM = 12;
const FULL_PACKAGE_SAVE_LIMIT_BYTES = 35 * 1024 * 1024;


import * as JobStatus from "../../lib/jobs/status";
import {
  type FieldEvidenceMeta,
  type FieldMedia,
  type FieldMediaCounts,
  type FieldMediaKind,
  canStoreFieldPhotos,
  clearFieldEvidence,
  countFieldPhotos,
  dataUrlToBytes,
  listFieldEvidence,
  saveFieldPhotos,
} from "../../lib/field-photo-store";
import {
  type FieldPacket,
  bytesToDataUrl,
  clearFieldPackets,
  listFieldPackets,
  saveFieldPacket,
} from "../../lib/field-packet-store";
import { paperworkOutcomeFromValue, paperworkQuery } from "../../lib/paperwork";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type JobRecord = {
  [key: string]: any;
  id?: string;
  omo?: string;
  jobId?: string;
  address?: string;
  Address?: string;
  BuildingAddress?: string;
  Building_Address?: string;
  location?: string;
  borough?: string;
  status?: string;
  StatusOverride?: string;
  WorkflowStatus?: string;
  FieldOutcome?: string;
  NoAccessFirstAttemptAt?: string;
  NoAccessSecondAttemptAt?: string;
  SecondAttemptAvailableAt?: string;
  RefusalDate?: string;
  VerifiedByOthersDate?: string;
  ActualWorkStartDate?: string;
  ActualWorkCompletionDate?: string;
  JobStartedAt?: string;
  JobFinishedAt?: string;
  FieldTimerStartedAt?: string;
  BeforePhotoCount?: number | string;
  AfterPhotoCount?: number | string;
  OutcomeLockedAt?: string;
  ArchivedFromMap?: boolean;
  ITBMatchStatus?: string;
  COAParseStatus?: string;
  trade?: string;
  awardDate?: string;
  AwardDate?: string;
  workStartDate?: string;
  WorkStartDate?: string;
  workCompletionDate?: string;
  dueDate?: string;
  bidDueDate?: string;
  bidAmount?: string;
  amountValue?: number;
  tenantPhone?: string;
  phone?: string;
  contractor?: string;
  owner?: string;
  description?: string;
  JobDescription?: string;
  Job_Description?: string;
  COAFile?: string;
  ITBFile?: string;
  PDFFile?: string;
  Latitude?: number | string;
  latitude?: number | string;
  Longitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
};

type MappedJob = JobRecord & {
  _lat?: number;
  _lng?: number;
  _source?: "stored" | "geocoded";
};

type MapBaseStyleId =
  | "maptiler-streets"
  | "maptiler-basic"
  | "maptiler-outdoor"
  | "maptiler-satellite"
  | "osm-color"
  | "carto-voyager";

type MapBaseStyle = {
  id: MapBaseStyleId;
  label: string;
  provider: "maptiler" | "osm" | "carto";
  mapId?: string;
  tileUrl?: string;
  attribution: string;
  maxZoom: number;
};

const MAP_BASE_STYLES: MapBaseStyle[] = [
  {
    id: "maptiler-streets",
    label: "MapTiler Streets",
    provider: "maptiler",
    mapId: "streets-v4",
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 20,
  },
  {
    id: "maptiler-basic",
    label: "MapTiler Basic",
    provider: "maptiler",
    mapId: "basic-v2",
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 20,
  },
  {
    id: "maptiler-outdoor",
    label: "MapTiler Outdoor",
    provider: "maptiler",
    mapId: "outdoor-v2",
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 20,
  },
  {
    id: "maptiler-satellite",
    label: "MapTiler Satellite",
    provider: "maptiler",
    mapId: "satellite",
    attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
    maxZoom: 20,
  },
  {
    id: "osm-color",
    label: "Color Streets",
    provider: "osm",
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  {
    id: "carto-voyager",
    label: "Voyager Backup",
    provider: "carto",
    tileUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
];

const COLOR_STREETS_STYLE = MAP_BASE_STYLES.find((style) => style.id === "osm-color")!;

function mapBaseStyleById(id: string): MapBaseStyle {
  return MAP_BASE_STYLES.find((style) => style.id === id) || MAP_BASE_STYLES[0];
}

function resolveMapBaseStyle(styleId: MapBaseStyleId, mapTilerKey: string): MapBaseStyle {
  const style = mapBaseStyleById(styleId);
  return style.provider === "maptiler" && !mapTilerKey.trim() ? COLOR_STREETS_STYLE : style;
}

function mapTileUrl(style: MapBaseStyle, mapTilerKey: string) {
  if (style.provider === "maptiler") {
    return `https://api.maptiler.com/maps/${style.mapId}/{z}/{x}/{y}.png?key=${encodeURIComponent(mapTilerKey.trim())}`;
  }
  return style.tileUrl || COLOR_STREETS_STYLE.tileUrl!;
}

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

type FullPackagePreview = {
  jobKey: string;
  fileName: string;
  size: number;
  evidenceCount: number;
  imageCount: number;
  videoCount: number;
  beforeCount: number;
  afterCount: number;
  hasInvoice: boolean;
  videoNames: string[];
  skippedMediaCount: number;
  generatedAt: string;
  savedPacketId?: string;
  note: string;
};

type PendingFullPackage = FullPackagePreview & {
  bytes: Uint8Array;
};

type FieldCaptureStep = {
  kind: FieldMediaKind;
  accept: string;
  camera: boolean;
  title: string;
  text: string;
  label: string;
  step: number;
  total: number;
};

type FieldCaptureTarget = {
  jobKey: string;
  kind: FieldMediaKind;
  meta: FieldEvidenceMeta;
  step?: FieldCaptureStep;
};

type InlineCameraSession = {
  target: FieldCaptureTarget;
  mode: "photo" | "video";
};

const FIELD_REQUIRED_PHOTOS = 2;
const FIELD_REQUIRED_VIDEOS = 2;

let zipCrcTable: Uint32Array | null = null;

function zipTextBytes(value: string) {
  return new TextEncoder().encode(value);
}

function zipSafePart(value: string, fallback = "file") {
  const cleaned = String(value || "")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function zipCrc32(bytes: Uint8Array) {
  if (!zipCrcTable) {
    zipCrcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let crc = index;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      zipCrcTable[index] = crc >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = zipCrcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDosTimeDate(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function concatZipChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function buildStoredZip(entries: ZipEntry[]) {
  const chunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const { dosTime, dosDate } = zipDosTimeDate();
  let localOffset = 0;

  entries.forEach((entry) => {
    const path = entry.path.split("/").map((part) => zipSafePart(part, "item")).join("/");
    const nameBytes = zipTextBytes(path);
    const bytes = entry.bytes;
    const crc = zipCrc32(bytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    chunks.push(localHeader, bytes);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + bytes.length;
  });

  const centralOffset = localOffset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  return concatZipChunks([...chunks, ...centralChunks, endHeader]);
}

function escapeMapPopupHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asArray(value: unknown): JobRecord[] {
  if (Array.isArray(value)) return value as JobRecord[];

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) return obj.jobs as JobRecord[];
    if (Array.isArray(obj.data)) return obj.data as JobRecord[];
    if (Array.isArray(obj.records)) return obj.records as JobRecord[];
  }

  return [];
}

function getAny(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}
function boroughFromAddress(address: string) {
  const zipMatch = String(address || "").match(/\b(1\d{4})\b/);
  const zip = zipMatch ? zipMatch[1] : "";
  if (!zip) return "";
  const z = Number(zip);
  if (z >= 10001 && z <= 10282) return "Manhattan";
  if (z >= 10301 && z <= 10314) return "Staten Island";
  if (z >= 10451 && z <= 10475) return "Bronx";
  if (z >= 11004 && z <= 11109) return "Queens";
  if (z >= 11351 && z <= 11697) return "Queens";
  if (z >= 11201 && z <= 11256) return "Brooklyn";
  return "";
}
function normalizeStaticJob(row: JobRecord, index: number): any {
  const anyRow = row as any;
  const omo = getAny(anyRow, "OMO", "omo", "Job_ID", "Job ID", "jobId", "id") || `JOB-${index + 1}`;
  const address = getAny(anyRow, "address", "BuildingAddress", "Building_Address", "Building Address", "Address", "location", "Location");
  const borough = getAny(anyRow, "borough", "Borough", "Boro", "boro") || boroughFromAddress(address);
  const description = getAny(anyRow, "description", "JobDescription", "Job_Description", "Job Description", "Description", "WorkDescription", "ScopeOfWork");
  const amount = getAny(anyRow, "AwardAmount", "awardAmount", "Award Amount", "bidAmount", "BidAmount", "Bid Amount", "Amount", "amountValue");
  const awardDate = getAny(anyRow, "AwardDate", "awardDate", "Award Date", "Award_Date");
  const workStartDate = getAny(anyRow, "WorkStartDate", "workStartDate", "Work Start Date");
  const workCompletionDate = getAny(anyRow, "WorkCompletionDate", "workCompletionDate", "Work Completion Date");
  const lat = getAny(anyRow, "Latitude", "latitude", "lat");
  const lng = getAny(anyRow, "Longitude", "longitude", "lng", "lon");
  return {
    ...row,
    id: omo,
    omo,
    OMO: omo,
    address,
    BuildingAddress: address,
    location: getAny(anyRow, "Location", "location"),
    borough,
    Borough: borough,
    boro: borough,
    description,
    JobDescription: description,
    bidAmount: amount,
    AwardAmount: amount,
    awardDate,
    AwardDate: awardDate,
    workStartDate,
    WorkStartDate: workStartDate,
    workCompletionDate,
    WorkCompletionDate: workCompletionDate,
    latitude: lat,
    Latitude: lat,
    longitude: lng,
    Longitude: lng,
    coaFile: getAny(anyRow, "COAFile", "COA File", "COA_File", "coaFile"),
    COAFile: getAny(anyRow, "COAFile", "COA File", "COA_File", "coaFile"),
    itbFile: getAny(anyRow, "ITBFile", "ITB File", "ITB_File", "itbFile"),
    ITBFile: getAny(anyRow, "ITBFile", "ITB File", "ITB_File", "itbFile"),
    status: getAny(anyRow, "StatusOverride", "status", "ITBMatchStatus", "COAParseStatus") || "Pending",
    StatusOverride: getAny(anyRow, "StatusOverride"),
    WorkflowStatus: getAny(anyRow, "WorkflowStatus", "workflowStatus"),
    workflowStatus: getAny(anyRow, "workflowStatus", "WorkflowStatus"),
  };
}
function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStoredCoords(job: JobRecord) {
  const lat = toNumber(job.Latitude ?? job.latitude ?? job.lat);
  const lng = toNumber(job.Longitude ?? job.longitude ?? job.lng ?? job.lon);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function jobKey(job: JobRecord, index?: number) {
  return job.id || job.omo || job.jobId || `JOB-${index ?? ""}`;
}

function displayAddress(job: JobRecord | null | undefined) {
  if (!job) return "No address listed";
  return (
    (job as any).address ||
    (job as any).BuildingAddress ||
    (job as any).Address ||
    (job as any).Building_Address ||
    (job as any).location ||
    (job as any).Location ||
    "No address listed"
  );
}
function displayLocation(job: JobRecord | null | undefined) {
  if (!job) return "";
  return (
    (job as any).Location ||
    (job as any).location ||
    (job as any).ApartmentUnit ||
    (job as any).Apartment ||
    (job as any).Unit ||
    ""
  );
}
function displayDescription(job: JobRecord | null | undefined) {
  if (!job) return "";
  const raw =
    (job as any).description ||
    (job as any).JobDescription ||
    (job as any).Job_Description ||
    (job as any).Description ||
    (job as any).WorkDescription ||
    (job as any).ScopeOfWork ||
    (job as any)["Job Description"] ||
    (job as any)["Description"] ||
    "";
  return String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
function descriptionStatusLabel(job: JobRecord | null | undefined) {
  const text = displayDescription(job);
  if (!text) return "Description missing";
  if (text.length < 40) return "Description short - check source";
  if (/confirmation of award/i.test(text) && !/essential service|repair|replace|install|remove|restore/i.test(text)) {
    return "Description may need review";
  }
  return "Description ready";
}
function getBestVoice() {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferredNames = [
    "Samantha",
    "Google US English",
    "Microsoft Aria",
    "Microsoft Jenny",
    "Microsoft Zira",
    "Alex",
    "Karen",
    "Daniel"
  ];
  const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang || ""));
  for (const name of preferredNames) {
    const found = englishVoices.find((voice) =>
      `${voice.name} ${voice.lang}`.toLowerCase().includes(name.toLowerCase())
    );
    if (found) return found;
  }
  return englishVoices[0] || voices[0] || null;
}
function speakText(text: string, mode: "full" | "summary" = "full") {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) {
    alert("Text-to-speech is not supported in this browser.");
    return;
  }
  const clean = String(text || "").trim();
  if (!clean) {
    alert("No text available to read.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = getBestVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "en-US";
  utterance.rate = mode === "summary" ? 0.9 : 0.86;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}
function stopSpeaking() {
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
function reloadSpeechVoices() {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) {
    alert("Text-to-speech is not supported in this browser.");
    return;
  }
  window.speechSynthesis.getVoices();
  alert("Voices reloaded. Try Read again.");
}
function jobInfoPopupText(job: JobRecord | null | undefined, type: "amount" | "location" | "dates" | "status" | "docs") {
  if (!job) return "No job selected.";
  if (type === "amount") {
    return [
      `Job: ${jobKey(job)}`,
      `Amount: ${displayAmount(job) || money(job) || "Not listed"}`,
      `Contractor: ${(job as any).contractor || "Not listed"}`,
      `Owner: ${(job as any).owner || "Not listed"}`,
    ].join("\n");
  }
  if (type === "location") {
    return [
      `Job: ${jobKey(job)}`,
      `Address: ${displayAddress(job)}`,
      `Borough: ${(job as any).borough || (job as any).Borough || "Unknown"}`,
      `Location: ${displayLocation(job) || "Not listed"}`,
      `Phone: ${phone(job) || "Not listed"}`,
    ].join("\n");
  }
  if (type === "dates") {
    return [
      `Job: ${jobKey(job)}`,
      `Award Date: ${maturityInfo(job).award}`,
      `COA Counter: ${jobCounterLabel(job)}`,
      `Work Start: ${(job as any).WorkStartDate || (job as any).workStartDate || "Not listed"}`,
      `Work Complete: ${(job as any).WorkCompletionDate || (job as any).workCompletionDate || "Not listed"}`,
      `Work Window: ${workWindowInfo(job).statusLabel}`,
      `Timeline: ${timelineMaturityLabel(job)} / ${timelineOverdueLabel(job)}`,
    ].join("\n");
  }
  if (type === "status") {
    const second = workflowSecondAttemptInfo(job);
    return [
      `Job: ${jobKey(job)}`,
      `Status: ${JobStatus.statusLabel(job)}`,
      `Field Status: ${workflowLabel(job) || "Not set"}`,
      `Next Action: ${nextActionInfo(job).label}`,
      `Detail: ${nextActionInfo(job).detail}`,
      second ? `72h Counter: ${second.label}` : "72h Counter: Not active",
    ].join("\n");
  }
  return [
    `Job: ${jobKey(job)}`,
    `COA: ${((job as any).COAFile || (job as any).coaFile) ? "Available" : "Not listed"}`,
    `ITB: ${((job as any).ITBFile || (job as any).itbFile) ? "Available" : "Not listed"}`,
    `PDF: ${((job as any).PDFFile || (job as any).pdfFile) ? "Available" : "Not listed"}`,
    `Description: ${displayDescription(job) ? "Ready" : "Missing"}`,
  ].join("\n");
}
function openJobInfoPopup(job: JobRecord | null | undefined, type: "amount" | "location" | "dates" | "status" | "docs") {
  if (typeof window === "undefined") return;
  const titles: Record<string, string> = {
    amount: "Amount Details",
    location: "Location Details",
    dates: "Date Timeline",
    status: "Status & Next Action",
    docs: "Document Checklist",
  };
  const text = jobInfoPopupText(job, type);
  window.dispatchEvent(
    new CustomEvent("hpd-open-touch-info", {
      detail: {
        title: titles[type] || "Job Details",
        text,
      },
    })
  );
}
function descriptionSummary(job: JobRecord | null | undefined) {
  const text = displayDescription(job);
  if (!text) return "No description available.";
  const compact = text
    .replace(/\s+/g, " ")
    .replace(/NYC HPD EMERGENCY OPERATIONS DIVISION/gi, "")
    .replace(/ESSENTIAL SERVICE WORK/gi, "")
    .trim();
  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const first = sentences.slice(0, 2).join(" ");
  const fallback = compact.slice(0, 260);
  return first || fallback;
}
function displayAmount(job: JobRecord | null | undefined) {
  if (!job) return "";
  const raw =
    (job as any).AwardAmount ??
    (job as any).awardAmount ??
    (job as any)["Award Amount"] ??
    (job as any).bidAmount ??
    (job as any).BidAmount ??
    (job as any)["Bid Amount"] ??
    (job as any).Amount ??
    (job as any).amountValue ??
    "";
  if (raw === null || raw === undefined) return "";
  const original = String(raw).trim();
  if (!original) return "";
  const cleaned = original.replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return original;
  const suspicious =
    num === 0 ||
    /^0\d/.test(cleaned) ||
    original === "000.00" ||
    original === "090.00";
  const formatted = num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return suspicious ? `${formatted} ⚠ check` : formatted;
}

function cleanAddress(job: JobRecord) {
  const raw =
    (job as any).address ||
    (job as any).BuildingAddress ||
    (job as any).Address ||
    (job as any).Building_Address ||
    (job as any).location ||
    (job as any).Location ||
    "";
  if (!raw.trim()) return "";

  const parts = [raw];

  if (job.borough && !raw.toLowerCase().includes(job.borough.toLowerCase())) {
    parts.push(job.borough);
  }

  if (!/ny|new york/i.test(raw)) {
    parts.push("New York");
  }

  return parts.filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

function markerDateValue(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = raw.replace(/-/g, "/").split("/");
  if (parts.length >= 3) {
    let month = Number(parts[0]);
    let day = Number(parts[1]);
    let year = Number(parts[2]);
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}
function markerOverdueLabel(job: JobRecord) {
  const endRaw =
    (job as any).WorkCompletionDate ||
    (job as any).workCompletionDate ||
    (job as any)["Work Completion Date"] ||
    "";
  const endDate = markerDateValue(endRaw);
  if (!endDate) return "";
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayOnly.getTime() - endDate.getTime()) / 86400000);
  return diffDays > 0 ? `OD ${diffDays}d` : "";
}
function markerPulseClass(job: JobRecord) {
  const status = workflowStatus(job) || legacyWorkflowKind(job);
  const second = workflowSecondAttemptInfo(job);
  if (second?.ready) return "marker-pulse-ready";
  if (second && !second.ready) return "marker-pulse-waiting";
  if (
    status === "WORK_COMPLETED" ||
    status === "COMPLETED_BY_OTHERS" ||
    status === "NO_ACCESS_COMPLETE" ||
    status === "REFUSED_ACCESS" ||
    status === "PARTIAL_WORK_COMPLETED"
  ) {
    return "marker-pulse-status";
  }
  return "";
}
function markerUrgencyClass(job: JobRecord) {
  const second = workflowSecondAttemptInfo(job);
  if (second?.ready) return "marker-urgent-ready";
  if (markerOverdueLabel(job)) return "marker-urgent-overdue";
  const work = workWindowInfo(job);
  if (String(work.statusLabel || "").toLowerCase().includes("due today")) return "marker-urgent-today";
  if (String(work.statusLabel || "").toLowerCase().includes("due in")) return "marker-urgent-soon";
  const status = workflowStatus(job) || legacyWorkflowKind(job);
  if (status === "WORK_COMPLETED" || status === "COMPLETED_BY_OTHERS") return "marker-urgent-complete";
  return "marker-urgent-normal";
}
function escapeMarkerHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function markerWorkflowLabelHtml(job: JobRecord) {
  const counter = jobCounterInfo(job);
  const workflow = workflowLabel(job);
  const label = workflow || counter.label || jobKey(job);
  return escapeMarkerHtml(label);
}
function markerMaturityLabel(job: JobRecord) {
  const awardRaw =
    (job as any).AwardDate ||
    (job as any).awardDate ||
    (job as any)["Award Date"] ||
    "";
  const awardDate = markerDateValue(awardRaw);
  if (!awardDate) return "";
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayOnly.getTime() - awardDate.getTime()) / 86400000);
  return diffDays >= 0 ? `MD ${diffDays}d` : "";
}
function cacheKey(job: JobRecord) {
  return `hpd_geo_${jobKey(job)}_${cleanAddress(job)}`.toLowerCase();
}

function money(job: JobRecord) {
  if (typeof job.amountValue === "number" && Number.isFinite(job.amountValue) && job.amountValue > 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(job.amountValue);
  }

  return job.bidAmount || "";
}

function phone(job: JobRecord) {
  return job.tenantPhone || job.phone || "";
}

function normalizedStatus(jobOrStatus?: JobRecord | string) {
  const raw =
    typeof jobOrStatus === "string"
      ? jobOrStatus
      : jobOrStatus?.StatusOverride ||
        jobOrStatus?.status ||
        jobOrStatus?.ITBMatchStatus ||
        jobOrStatus?.COAParseStatus ||
        "";

  return String(raw).toLowerCase().trim();
}

function statusClass(value?: string) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("completed") || raw.includes("done")) return "ok";
  if (raw.includes("no access")) return "warning";
  if (raw.includes("refused")) return "danger";
  if (raw.includes("award")) return "ok";
  if (raw.includes("pending")) return "pending";
  return "pending";
}
function statusLabel(job: JobRecord) {
  return (
    job.StatusOverride ||
    job.status ||
    job.ITBMatchStatus ||
    job.COAParseStatus ||
    "Pending"
  );
}
function parseAwardDate(value?: string) {
  if (!value) return null;

  const clean = String(value).trim();
  const parts = clean.split(/[\/\-]/).map((part) => Number(part));

  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    let [month, day, year] = parts;
    if (year < 100) year += 2000;

    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(clean);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function maturityInfo(job: JobRecord) {
  const award = parseAwardDate(job.AwardDate || job.awardDate);

  if (!award) {
    return {
      award: "Not listed",
      maturity: "Not listed",
      daysLeft: null as number | null,
      label: "No award date",
      priority: "nodate",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const awardDay = new Date(award);
  awardDay.setHours(0, 0, 0, 0);

  const daysSinceAward = Math.floor((today.getTime() - awardDay.getTime()) / 86400000);

  let label = "";
  let priority = "normal";

  if (daysSinceAward < 0) {
    label = `Starts in ${Math.abs(daysSinceAward)} days`;
    priority = "normal";
  } else if (daysSinceAward === 0) {
    label = "Awarded today";
    priority = "normal";
  } else {
    label = `${daysSinceAward} days since award`;

    if (daysSinceAward >= 90) priority = "overdue";
    else if (daysSinceAward >= 60) priority = "urgent";
    else if (daysSinceAward >= 30) priority = "warning";
    else priority = "normal";
  }

  return {
    award: awardDay.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }),
    maturity: awardDay.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }),
    daysLeft: daysSinceAward,
    label,
    priority,
  };
}

function maturityPriorityClass(job: JobRecord) {
  return `maturity-${maturityInfo(job).priority}`;
}

function maturityMapLabel(job: JobRecord) {
  const counter = jobCounterInfo(job);

  if (counter.mode === "noAccess72") {
    return counter.label;
  }

  const info = maturityInfo(job);

  if (info.daysLeft === null) return "?";

  if (info.daysLeft < 0) {
    return `${Math.abs(info.daysLeft)}d`;
  }

  return `${info.daysLeft}d`;
}


function hoursBetweenNow(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / 3600000);
}
function jobCounterInfo(job: JobRecord) {
  const second = workflowSecondAttemptInfo(job);

  if (second) {
    const availableAt = (job as any).SecondAttemptAvailableAt || (job as any).secondAttemptAvailableAt;
    const hoursLeft = hoursBetweenNow(availableAt);

    if (hoursLeft !== null) {
      if (hoursLeft > 0) {
        return {
          mode: "noAccess72",
          label: `REVISIT IN ${hoursLeft}H`,
          detail: `REVISIT IN ${hoursLeft}H`,
          ready: false,
        };
      }

      const overdueHours = Math.abs(hoursLeft);
      const label = overdueHours <= 72
        ? `REVISIT -${overdueHours}H`
        : `REVISIT -${Math.ceil(overdueHours / 24)}D`;

      return {
        mode: "noAccess72",
        label,
        detail: label,
        ready: true,
      };
    }

    return {
      mode: "noAccess72",
      label: "REVISIT ?",
      detail: "REVISIT ?",
      ready: second.ready,
    };
  }

  const maturity = maturityInfo(job);

  return {
    mode: "maturity",
    label: maturity.label,
    detail: maturity.label,
    ready: false,
  };
}

function jobCounterLabel(job: JobRecord) {
  return jobCounterInfo(job).label;
}

function overdueBucket(job: JobRecord) {
  const info = maturityInfo(job);

  if (info.daysLeft === null) return null;

  const counterDays = Math.max(0, info.daysLeft);

  if (counterDays <= 30) return "od0_30";
  if (counterDays <= 60) return "od31_60";
  if (counterDays <= 90) return "od61_90";
  return "od90plus";
}

function overdueDays(job: JobRecord) {
  const info = maturityInfo(job);
  return info.daysLeft === null ? null : Math.max(0, info.daysLeft);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeJob(job: JobRecord) {
  const query = cleanAddress(job);
  if (!query) return null;

  const key = cacheKey(job);

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch {}

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
    encodeURIComponent(query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const first = Array.isArray(data) ? data[0] : null;

  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  try {
    localStorage.setItem(key, JSON.stringify({ lat, lng, query }));
  } catch {}

  return { lat, lng };
}

const WORKFLOW_STORAGE_KEY = "hpd-job-workflow-overrides-v2";

function workflowStorageRead(): Record<string, any> {
  return {};
}

function workflowStorageWrite(rows: Record<string, any>) {
  // Server is now the source of truth.
}

async function workflowServerSave(key: string, patch: Record<string, any>) {
  if (!key) return;

  const response = await fetch(`${HPD_STATUS_WORKER_URL}/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, patch }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to save job status.");
  }
}

function workflowStorageSave(key: string, patch: Record<string, any>) {
  if (!key) return;

  const rows = workflowStorageRead();

  if (patch.__clearWorkflow) {
    delete rows[key];
  } else {
    rows[key] = {
      ...(rows[key] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  }

  workflowStorageWrite(rows);
}

function workflowStorageApply<T extends JobRecord>(rows: T[]): T[] {
  const saved = workflowStorageRead();

  return rows.map((row) => {
    const key = jobKey(row);
    const patch = key ? saved[key] : null;
    return patch ? ({ ...row, ...patch } as T) : row;
  });
}


function legacyWorkflowKind(job: JobRecord) {
  const raw = String(
    (job as any).WorkflowStatus ||
    (job as any).workflowStatus ||
    (job as any).StatusOverride ||
    (job as any).status ||
    ""
  ).toLowerCase();

  if (raw.includes("refused")) return "REFUSED_ACCESS";
  if (raw.includes("no access") && raw.includes("2")) return "NO_ACCESS_COMPLETE";
  if (raw.includes("no access") && raw.includes("second")) return "NO_ACCESS_COMPLETE";
  if (raw.includes("completed by other") || raw.includes("completed by others") || raw.includes("work completed by other")) return "COMPLETED_BY_OTHERS";
  if (raw.includes("partial work completed")) return "PARTIAL_WORK_COMPLETED";
  if (raw.includes("work completed") || raw === "completed") return "WORK_COMPLETED";

  return "";
}
function workflowStatus(job: JobRecord) {
  return String(
    (job as any).WorkflowStatus ||
      (job as any).workflowStatus ||
      (job as any).FieldOutcome ||
      (job as any).fieldOutcome ||
      (job as any).StatusOverride ||
      job.status ||
      ""
  ).toUpperCase();
}

function workflowLabel(job: JobRecord) {
  const status = workflowStatus(job);

  const labels: Record<string, string> = {
    EN_ROUTE: "En Route",
    VISIT_STARTED: "Visit Started",
    NO_ACCESS_1_WAITING_72H: "No Access 1st - Waiting 72h",
    READY_SECOND_ATTEMPT: "Ready 2nd Attempt",
    NO_ACCESS_COMPLETE: "No Access Complete",
    REFUSED_ACCESS: "Refused Access",
    COMPLETED_BY_OTHERS: "Completed by Others",
    BEFORE_EVIDENCE: "Before Evidence",
    AFTER_EVIDENCE: "After Evidence",
    WORK_STARTED: "Work Started",
    WORK_COMPLETED: "Work Completed",
    PARTIAL_WORK_COMPLETED: "Partial Work Completed",
    PACKAGE_REVIEW: "Package Review",
    SENT_TO_REVIEWER: "Sent to Reviewer",
    APPROVED_BY_YOU: "Approved",
    SENT_TO_HPD: "Sent to HPD",
    ARCHIVED: "Archived",
  };

  return labels[status] || "";
}

function parseJobDate(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/-/g, "/");
  const parts = normalized.split("/").map((part) => part.trim());
  if (parts.length >= 3) {
    let month = Number(parts[0]);
    let day = Number(parts[1]);
    let year = Number(parts[2]);
    if (year < 100) year += 2000;
    if (Number.isFinite(month) && Number.isFinite(day) && Number.isFinite(year)) {
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function daysBetween(from: Date, to: Date) {
  const ms = dateOnly(to).getTime() - dateOnly(from).getTime();
  return Math.round(ms / 86400000);
}
function shortJobDate(value?: string) {
  const date = parseJobDate(value);
  if (!date) return value || "Not listed";
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}
function markerWorkWindowLabel(job: JobRecord) {
  const info = workWindowInfo(job);
  const text = String(info.statusLabel || "").toLowerCase();
  if (text.includes("overdue by")) {
    const match = info.statusLabel.match(/overdue by\s+(\d+)/i);
    return match ? `OD ${match[1]}d` : "OVERDUE";
  }
  if (text.includes("due today")) return "DUE TODAY";
  if (text.includes("due in")) {
    const match = info.statusLabel.match(/due in\s+(\d+)/i);
    return match ? `Due ${match[1]}d` : "DUE";
  }
  if (text.includes("starts today")) return "START TODAY";
  if (text.includes("starts in")) {
    const match = info.statusLabel.match(/starts in\s+(\d+)/i);
    return match ? `Start ${match[1]}d` : "START";
  }
  if (text.includes("started")) {
    const match = info.statusLabel.match(/started\s+(\d+)/i);
    return match ? `Started ${match[1]}d` : "STARTED";
  }
  return "";
}
function markerWorkWindowClass(job: JobRecord) {
  const statusClass = workWindowInfo(job).statusClass;
  if (statusClass === "danger") return "marker-work-danger";
  if (statusClass === "warning") return "marker-work-warning";
  if (statusClass === "ok") return "marker-work-ok";
  return "marker-work-neutral";
}
function nextActionInfo(job: JobRecord | null | undefined) {
  if (!job) {
    return {
      label: "Select a job",
      detail: "Open a job to see the next field action.",
      tone: "neutral",
    };
  }
  const work = workWindowInfo(job);
  const desc = displayDescription(job);
  const workflow = workflowLabel(job);
  const second = workflowSecondAttemptInfo(job);
  if (workflow && /completed|done/i.test(workflow)) {
    return {
      label: "Work marked complete",
      detail: "Review photos, affidavit, and invoice package.",
      tone: "ok",
    };
  }
  if (second?.ready) {
    return {
      label: "2nd attempt ready",
      detail: "72-hour no-access counter matured. Schedule revisit now.",
      tone: "danger",
    };
  }
  if (work.statusLabel.toLowerCase().includes("overdue")) {
    return {
      label: work.statusLabel,
      detail: "Complete the job, mark no access, refused access, or document the field issue.",
      tone: "danger",
    };
  }
  if (work.statusLabel.toLowerCase().includes("due today")) {
    return {
      label: "Due today",
      detail: "Prioritize this job today or document access/status.",
      tone: "warning",
    };
  }
  if (work.statusLabel.toLowerCase().includes("due in")) {
    return {
      label: work.statusLabel,
      detail: "Work window is active. Track completion before deadline.",
      tone: "ok",
    };
  }
  if (work.startLabel.toLowerCase().includes("starts in")) {
    return {
      label: work.startLabel,
      detail: "Prepare crew, materials, access, and route.",
      tone: "neutral",
    };
  }
  if (!desc) {
    return {
      label: "Description missing",
      detail: "Description should be recovered before field work.",
      tone: "danger",
    };
  }
  return {
    label: "Review job",
    detail: "Check scope, dates, access, and status before dispatch.",
    tone: "neutral",
  };
}
function timelineDateLabel(value?: string) {
  const parsed = parseJobDate(value);
  if (!parsed) return value || "—";
  return parsed.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}
function timelineMaturityLabel(job: JobRecord | null | undefined) {
  if (!job) return "—";
  const raw = (job as any).AwardDate || (job as any).awardDate || "";
  const date = parseJobDate(raw);
  if (!date) return "—";
  const today = dateOnly(new Date());
  const diff = daysBetween(date, today);
  return diff >= 0 ? `MD ${diff}d` : "Future";
}
function timelineOverdueLabel(job: JobRecord | null | undefined) {
  if (!job) return "—";
  const raw =
    (job as any).WorkCompletionDate ||
    (job as any).workCompletionDate ||
    "";
  const date = parseJobDate(raw);
  if (!date) return "—";
  const today = dateOnly(new Date());
  const diff = daysBetween(date, today);
  if (diff > 180) return "Check date";
  if (diff > 0) return `OD ${diff}d`;
  if (diff === 0) return "Due today";
  return `Due ${Math.abs(diff)}d`;
}
function workWindowInfo(job: JobRecord) {
  const startRaw = (job as any).WorkStartDate || (job as any).workStartDate || (job as any)["Work Start Date"] || "";
  const endRaw =
    (job as any).WorkCompletionDate ||
    (job as any).workCompletionDate ||
    (job as any)["Work Completion Date"] ||
    "";
  const start = parseJobDate(startRaw);
  const end = parseJobDate(endRaw);
  const today = dateOnly(new Date());
  let startLabel = "Start not listed";
  let endLabel = "End not listed";
  let statusLabel = "Work window not listed";
  let statusClass = "neutral";
  if (start) {
    const startDiff = daysBetween(today, start);
    if (startDiff > 0) startLabel = `Starts in ${startDiff} day${startDiff === 1 ? "" : "s"}`;
    else if (startDiff === 0) startLabel = "Starts today";
    else startLabel = `Started ${Math.abs(startDiff)} day${Math.abs(startDiff) === 1 ? "" : "s"} ago`;
  }
  if (end) {
    const endDiff = daysBetween(today, end);
    if (endDiff > 0) {
      endLabel = `Due in ${endDiff} day${endDiff === 1 ? "" : "s"}`;
      statusLabel = endLabel;
      statusClass = endDiff <= 2 ? "warning" : "ok";
    } else if (endDiff === 0) {
      endLabel = "Due today";
      statusLabel = "Due today";
      statusClass = "warning";
    } else {
      endLabel = `Overdue by ${Math.abs(endDiff)} day${Math.abs(endDiff) === 1 ? "" : "s"}`;
      statusLabel = endLabel;
      statusClass = "danger";
    }
  } else if (start) {
    statusLabel = startLabel;
    statusClass = "neutral";
  }
  return {
    startRaw,
    endRaw,
    startDate: shortJobDate(startRaw),
    endDate: shortJobDate(endRaw),
    startLabel,
    endLabel,
    statusLabel,
    statusClass,
  };
}
function displayWorkflowDate(value?: string) {
  if (!value) return "Not listed";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not listed";

  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function workflowSecondAttemptInfo(job: JobRecord) {
  const firstRaw = (job as any).NoAccessFirstAttemptAt || (job as any).noAccessFirstAttemptAt;
  const availableRaw = (job as any).SecondAttemptAvailableAt || (job as any).secondAttemptAvailableAt;

  if (!firstRaw || !availableRaw) return null;

  const first = new Date(firstRaw);
  const available = new Date(availableRaw);

  if (Number.isNaN(first.getTime()) || Number.isNaN(available.getTime())) return null;

  const now = new Date();
  const msLeft = available.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600000));

  return {
    first,
    available,
    ready: msLeft <= 0,
    hoursLeft,
    label: msLeft <= 0 ? "REVISIT NOW" : `REVISIT IN ${hoursLeft}H`,
  };
}

const CLOSED_WORKFLOW_STATUSES = new Set([
  "NO_ACCESS_COMPLETE",
  "REFUSED_ACCESS",
  "COMPLETED_BY_OTHERS",
  "WORK_COMPLETED",
  "PARTIAL_WORK_COMPLETED",
  "PACKAGE_REVIEW",
  "SENT_TO_REVIEWER",
  "APPROVED_BY_YOU",
  "SENT_TO_HPD",
  "ARCHIVED",
]);

function workflowViewBucket(job: JobRecord) {
  const status = workflowStatus(job) || legacyWorkflowKind(job);
  const archived = Boolean((job as any).ArchivedFromMap || (job as any).archivedFromMap);

  if (archived) return "archived";

  const secondAttempt = workflowSecondAttemptInfo(job);
  if (secondAttempt) return secondAttempt.ready ? "ready2" : "waiting72";

  if (status === "NO_ACCESS_1_WAITING_72H") {
    const info = workflowSecondAttemptInfo(job);
    return info?.ready ? "ready2" : "waiting72";
  }

  if (
    status === "NO_ACCESS_COMPLETE" ||
    status === "REFUSED_ACCESS" ||
    status === "COMPLETED_BY_OTHERS" ||
    status === "WORK_COMPLETED" ||
    status === "PARTIAL_WORK_COMPLETED"
  ) {
    return "final";
  }

  return "active";
}

function shouldShowForWorkflowView(job: JobRecord, view: "active" | "waiting72" | "ready2" | "final" | "archived" | "all") {
  if (view === "all") return true;
  return workflowViewBucket(job) === view;
}

function shouldShowOnActiveMap(job: JobRecord) {
  return workflowViewBucket(job) === "active" || workflowViewBucket(job) === "waiting72" || workflowViewBucket(job) === "ready2" || workflowViewBucket(job) === "final";
}

function applyWorkflowOverrideObjectToRows<T extends JobRecord>(rows: T[], overrides: Record<string, any>): T[] {
  return rows.map((row) => {
    const key = jobKey(row);
    const patch = key ? overrides[key] : null;
    if (!patch) return row;
    if (patch.__clearWorkflow) {
      return {
        ...row,
        WorkflowStatus: "",
        workflowStatus: "",
        FieldOutcome: "",
        fieldOutcome: "",
        StatusOverride: "",
        status: "Pending",
        NoAccessFirstAttemptAt: "",
        noAccessFirstAttemptAt: "",
        NoAccessSecondAttemptAt: "",
        noAccessSecondAttemptAt: "",
        SecondAttemptAvailableAt: "",
        secondAttemptAvailableAt: "",
        RefusalDate: "",
        refusalDate: "",
        JobStartedAt: "",
        jobStartedAt: "",
        JobFinishedAt: "",
        jobFinishedAt: "",
        FieldTimerStartedAt: "",
        fieldTimerStartedAt: "",
        BeforePhotoCount: 0,
        beforePhotoCount: 0,
        AfterPhotoCount: 0,
        afterPhotoCount: 0,
        EvidenceMediaCount: 0,
        evidenceMediaCount: 0,
        ImageEvidenceCount: 0,
        imageEvidenceCount: 0,
        VideoEvidenceCount: 0,
        videoEvidenceCount: 0,
        LastEvidenceCapturedAt: "",
        lastEvidenceCapturedAt: "",
        NoAccessEvidenceCount: 0,
        noAccessEvidenceCount: 0,
        NoAccessEvidenceCapturedAt: "",
        noAccessEvidenceCapturedAt: "",
        RefusedEvidenceCount: 0,
        refusedEvidenceCount: 0,
        RefusedEvidenceCapturedAt: "",
        refusedEvidenceCapturedAt: "",
        CompletedByOthersEvidenceCount: 0,
        completedByOthersEvidenceCount: 0,
        CompletedByOthersEvidenceCapturedAt: "",
        completedByOthersEvidenceCapturedAt: "",
        ArchivedFromMap: false,
      } as T;
    }
    return { ...row, ...patch } as T;
  });
}export default function MapClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapTileLayerRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const userLocationMarkerRef = useRef<any>(null);
  const userLocationAccuracyRef = useRef<any>(null);
  const geolocationWatchRef = useRef<number | null>(null);
  const locationAutoStartedRef = useRef(false);
  const locationOverviewFitRef = useRef(false);
  const markerOverviewTimerRef = useRef<number | null>(null);
  const markerOverviewKeyRef = useRef("");
  const fieldPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const fieldCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const fieldCameraStreamRef = useRef<MediaStream | null>(null);
  const fieldCameraRecorderRef = useRef<MediaRecorder | null>(null);
  const fieldCameraRecordingTargetRef = useRef<FieldCaptureTarget | null>(null);
  const fieldCameraChunksRef = useRef<Blob[]>([]);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [mappedJobs, setMappedJobs] = useState<MappedJob[]>([]);
  const [selected, setSelected] = useState<MappedJob | null>(null);
  const selectedCardRef = useRef<HTMLDivElement | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const mapSwipeStartXRef = useRef<number | null>(null);
  const mapSwipeStartYRef = useRef<number | null>(null);
const [selectedOnly, setSelectedOnly] = useState(false);
const [generatedLinks, setGeneratedLinks] = useState<{ invoice?: string; affidavit?: string }>({});
const [descriptionOpen, setDescriptionOpen] = useState(false);
const [touchInfoOpen, setTouchInfoOpen] = useState(false);
const [touchInfoTitle, setTouchInfoTitle] = useState("");
const [touchInfoText, setTouchInfoText] = useState("");
const [draftWorkflowStatus, setDraftWorkflowStatus] = useState("");
const [draftWorkflowDate, setDraftWorkflowDate] = useState("");
const [draftWorkflowSaved, setDraftWorkflowSaved] = useState(false);
const [workflowViewFilter, setWorkflowViewFilter] = useState<"active" | "waiting72" | "ready2" | "final" | "archived" | "all">("active");
const [countdownTick, setCountdownTick] = useState(0);
const [photoCaptureTarget, setPhotoCaptureTarget] = useState<FieldCaptureTarget | null>(null);
const photoCaptureTargetRef = useRef<FieldCaptureTarget | null>(null);
const fieldCaptureQueueRef = useRef<FieldCaptureStep[]>([]);
const fieldCaptureJobRef = useRef<MappedJob | null>(null);
const fieldCapturePartialRef = useRef(false);
const [fieldPhotoCounts, setFieldPhotoCounts] = useState<Record<string, FieldMediaCounts>>({});
const [fieldEvidenceByJob, setFieldEvidenceByJob] = useState<Record<string, FieldMedia[]>>({});
const [fieldPacketsByJob, setFieldPacketsByJob] = useState<Record<string, FieldPacket[]>>({});
const [fullPackagePreview, setFullPackagePreview] = useState<FullPackagePreview | null>(null);
const pendingFullPackageRef = useRef<PendingFullPackage | null>(null);
const [fieldCaptureAccept, setFieldCaptureAccept] = useState("image/*,video/*");
const [fieldCaptureCamera, setFieldCaptureCamera] = useState(true);
const [fieldCaptureMultiple, setFieldCaptureMultiple] = useState(false);
const [fieldCameraSession, setFieldCameraSession] = useState<InlineCameraSession | null>(null);
const [fieldCameraStatus, setFieldCameraStatus] = useState("");
const [fieldCameraBusy, setFieldCameraBusy] = useState(false);
const [fieldCameraRecording, setFieldCameraRecording] = useState(false);
const [fieldCameraStreamTick, setFieldCameraStreamTick] = useState(0);
const [fieldCaptureGuide, setFieldCaptureGuide] = useState<{
  jobKey: string;
  kind: FieldMediaKind;
  accept: string;
  camera: boolean;
  title: string;
  text: string;
  label?: string;
  step?: number;
  total?: number;
  complete?: boolean;
  completeAction?: "start_work" | "finish_work" | "capture_only";
  partial?: boolean;
} | null>(null);
const [fieldFocusPane, setFieldFocusPane] = useState<"capture" | "evidence" | "package" | "send">("capture");
const [fieldMediaFlashKind, setFieldMediaFlashKind] = useState<FieldMediaKind | "">("");
const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy?: number; updatedAt: string } | null>(null);
const [locationStatus, setLocationStatus] = useState("Location off");
const [followMyLocation, setFollowMyLocation] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading jobs...");
const [actionNotice, setActionNotice] = useState("");
const [dispatchQuestion, setDispatchQuestion] = useState("");
const [dispatchMessages, setDispatchMessages] = useState<Array<{ role: "user" | "assistant"; text: string; jobs?: string[] }>>([
  {
    role: "assistant",
    text: "Ask me what jobs are urgent, overdue, due today, ready for second attempt, no access, or what you should do today.",
  },
]);
const dispatchJobPool = () => {
  return (mappedJobs.length ? mappedJobs : filteredJobs.length ? filteredJobs : jobs) as MappedJob[];
};
const dispatchDueDiff = (job: JobRecord) => {
  const raw = (job as any).WorkCompletionDate || (job as any).workCompletionDate || "";
  const date = parseJobDate(raw);
  if (!date) return null;
  return daysBetween(date, dateOnly(new Date()));
};
const dispatchUrgencyScore = (job: JobRecord) => {
  let score = 0;
  const due = dispatchDueDiff(job);
  const second = workflowSecondAttemptInfo(job);
  const workflow = workflowStatus(job) || legacyWorkflowKind(job);
  if (second?.ready) score += 1000;
  else if (second) score += 350;
  if (due !== null && due > 0) score += 700 + due;
  if (due === 0) score += 600;
  if (due !== null && due < 0 && Math.abs(due) <= 2) score += 250;
  if (workflow.includes("NO_ACCESS")) score += 180;
  if (workflow.includes("REFUSED")) score += 120;
  if (workflow.includes("WORK_COMPLETED") || workflow.includes("COMPLETED_BY_OTHERS")) score -= 500;
  return score;
};
const dispatchJobReason = (job: JobRecord) => {
  const due = dispatchDueDiff(job);
  const second = workflowSecondAttemptInfo(job);
  const workflow = workflowLabel(job) || JobStatus.statusLabel(job);
  if (second?.ready) return "72-hour no-access counter matured — ready for 2nd attempt.";
  if (second) return `${second.label} — waiting on 72-hour no-access counter.`;
  if (due !== null && due > 0) return `Overdue by ${due} day${due === 1 ? "" : "s"}.`;
  if (due === 0) return "Due today.";
  if (due !== null && due < 0 && Math.abs(due) <= 2) return `Due in ${Math.abs(due)} day${Math.abs(due) === 1 ? "" : "s"}.`;
  if (/completed|done/i.test(workflow)) return "Completed/final — review paperwork package.";
  return workflow || "Review job details.";
};
const dispatchJobLine = (job: JobRecord, index: number) => {
  const address = displayAddress(job);
  const borough = (job as any).borough || (job as any).Borough || "Unknown";
  const amount = displayAmount(job);
  const reason = dispatchJobReason(job);
  return `${index + 1}. ${jobKey(job)} — ${borough} — ${reason}\n   ${address}${amount ? ` — ${amount}` : ""}`;
};
const openDispatchJob = (jobId: string) => {
  const pool = dispatchJobPool();
  const job = pool.find((row) => String(jobKey(row)).trim() === String(jobId).trim());
  if (!job) {
    setActionNotice(`Could not find ${jobId}.`);
    return;
  }
  clearMarkerOverviewReturn();
  setSelected(job);
  setSelectedOnly(true);
  setDrawerOpen(true);
  setFullMap(false);
  setGeneratedLinks({});
  setDescriptionOpen(false);
  setActionNotice(`Opened ${jobId}.`);
  if (Number.isFinite(job._lat) && Number.isFinite(job._lng)) {
    window.setTimeout(() => {
      mapRef.current?.panTo([Number(job._lat), Number(job._lng)], {
        animate: true,
        duration: 0.5,
      });
    }, 40);
  }
};
const runDispatchChat = (text?: string) => {
  const question = String(text || dispatchQuestion || "").trim();
  if (!question) return;
  const q = question.toLowerCase();
  let rows = [...dispatchJobPool()];
  let title = "Dispatch Answer";
  let recommendation = "Review the top jobs and open the first priority job.";
  const wantsToday = q.includes("today") || q.includes("now") || q.includes("should i") || q.includes("priority") || q.includes("urgent");
  const wantsOverdue = q.includes("overdue") || q.includes("late") || q.includes("od");
  const wantsReadySecond = q.includes("ready") || q.includes("2nd") || q.includes("second attempt") || q.includes("revisit");
  const wantsNoAccess = q.includes("no access") || q.includes("72");
  const wantsCompleted = q.includes("completed") || q.includes("done") || q.includes("paperwork") || q.includes("invoice") || q.includes("affidavit");
  const wantsDueToday = q.includes("due today");
  const wantsDueSoon = q.includes("due soon") || q.includes("next") || q.includes("this week");
  if (q.includes("bronx")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("bronx"));
  if (q.includes("brooklyn")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("brooklyn"));
  if (q.includes("queens")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("queens"));
  if (q.includes("manhattan")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("manhattan"));
  if (q.includes("staten")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("staten"));
  const wantsRouteMe = q.includes("route me") || q.includes("best route") || q.includes("where should i go") || q.includes("go first") || q.includes("what should i do first") || q.includes("take me");
  if (wantsRouteMe) {
    title = "Route Me Today";
    rows = rows.filter((job) => {
      const due = dispatchDueDiff(job);
      const second = workflowSecondAttemptInfo(job);
      return second?.ready || due === 0 || (due !== null && due > 0) || (due !== null && due < 0 && Math.abs(due) <= 3);
    });
    recommendation = "Open the first job below and tap Waze. Waze will handle live traffic for free. After that, continue down the ranked list.";
  } else if (wantsReadySecond) {
    title = "Ready for 2nd Attempt";
    rows = rows.filter((job) => workflowSecondAttemptInfo(job)?.ready);
    recommendation = "These are the highest no-access priority because the 72-hour counter matured.";
  } else if (wantsNoAccess) {
    title = "No Access / 72-Hour Watchlist";
    rows = rows.filter((job) => {
      const status = workflowStatus(job) || legacyWorkflowKind(job);
      return status.includes("NO_ACCESS") || Boolean(workflowSecondAttemptInfo(job));
    });
    recommendation = "Watch waiting counters and prioritize anything marked ready for 2nd attempt.";
  } else if (wantsCompleted) {
    title = "Completed / Paperwork Review";
    rows = rows.filter((job) => /completed|done/i.test(workflowLabel(job) || JobStatus.statusLabel(job)));
    recommendation = "Review photos, affidavit, invoice package, and documentation before sending.";
  } else if (wantsOverdue) {
    title = "Overdue Jobs";
    rows = rows.filter((job) => {
      const due = dispatchDueDiff(job);
      return due !== null && due > 0;
    });
    recommendation = "Handle the oldest overdue jobs first, unless a 72-hour revisit is ready.";
  } else if (wantsDueToday) {
    title = "Due Today";
    rows = rows.filter((job) => dispatchDueDiff(job) === 0);
    recommendation = "These should be completed or documented today.";
  } else if (wantsDueSoon) {
    title = "Due Soon";
    rows = rows.filter((job) => {
      const due = dispatchDueDiff(job);
      return due !== null && due <= 7 && due >= -2;
    });
    recommendation = "Plan these into the route before they become overdue.";
  } else if (wantsToday) {
    title = "Today’s Dispatch Priority";
    rows = rows.filter((job) => {
      const due = dispatchDueDiff(job);
      const second = workflowSecondAttemptInfo(job);
      return second?.ready || due === 0 || (due !== null && due > 0);
    });
    recommendation = "Start with ready 2nd attempts, then oldest overdue jobs, then due-today jobs.";
  } else {
    title = `Search: ${question}`;
    rows = rows.filter((job) =>
      [
        jobKey(job),
        displayAddress(job),
        (job as any).borough,
        displayDescription(job),
        workflowLabel(job),
        JobStatus.statusLabel(job),
        displayAmount(job),
      ].join(" ").toLowerCase().includes(q)
    );
    recommendation = "I matched jobs based on your question. Ask about urgent, overdue, no access, or due today for better dispatch ranking.";
  }
  rows.sort((a, b) => dispatchUrgencyScore(b) - dispatchUrgencyScore(a));
  const top = rows.slice(0, 8);
  const jobIds = top.map((job) => jobKey(job));
  const answer =
    `${title}\n\n` +
    `${top.length} job(s) found.\n\n` +
    (top.length ? top.map(dispatchJobLine).join("\n\n") : "No matching jobs found.") +
    `\n\nRecommendation:\n${recommendation}`;
  setDispatchMessages((messages) => [
    ...messages,
    { role: "user", text: question },
    { role: "assistant", text: answer, jobs: jobIds },
  ]);
  setDispatchQuestion("");
  setActionNotice("AI Dispatch Chat answered.");
};
const [aiQuestion, setAiQuestion] = useState("");
const [aiAnswer, setAiAnswer] = useState("Ask me what jobs are due, overdue, no access, ready for second attempt, or what you should do today.");
const [aiResults, setAiResults] = useState<MappedJob[]>([]);
const jobDueDiffForAi = (job: JobRecord) => {
  const raw = (job as any).WorkCompletionDate || (job as any).workCompletionDate || "";
  const date = parseJobDate(raw);
  if (!date) return null;
  return daysBetween(date, dateOnly(new Date()));
};
const jobAssistantLineForAi = (job: JobRecord, index: number) => {
  const due = jobDueDiffForAi(job);
  const second = workflowSecondAttemptInfo(job);
  const amount = displayAmount(job);
  const address = displayAddress(job);
  const status = workflowLabel(job) || JobStatus.statusLabel(job);
  const dueText =
    second?.ready ? "READY 2ND ATTEMPT" :
    second ? second.label :
    due === null ? "No due date" :
    due > 0 ? `OD ${due}d` :
    due === 0 ? "Due today" :
    `Due in ${Math.abs(due)}d`;
  return `${index + 1}. ${jobKey(job)} — ${dueText} — ${status} — ${(job as any).borough || "Unknown"} — ${address}${amount ? ` — ${amount}` : ""}`;
};
const openAssistantJob = (job: MappedJob) => {
  clearMarkerOverviewReturn();
  setSelected(job);
  setSelectedOnly(true);
  setDrawerOpen(true);
  setFullMap(false);
  setGeneratedLinks({});
  setDescriptionOpen(false);
  if (Number.isFinite(job._lat) && Number.isFinite(job._lng)) {
    window.setTimeout(() => {
      mapRef.current?.panTo([Number(job._lat), Number(job._lng)], {
        animate: true,
        duration: 0.5,
      });
    }, 40);
  }
};
const runJobAssistant = (questionText?: string) => {
  const question = String(questionText || aiQuestion || "").trim();
  const q = question.toLowerCase();
  const pool = (mappedJobs.length ? mappedJobs : filteredJobs.length ? filteredJobs : jobs) as MappedJob[];
  let rows = [...pool];
  let title = "Job Assistant";
  let recommendation = "Review the highest urgency jobs first.";
  const wantsToday = q.includes("today") || q.includes("now") || q.includes("priority") || q.includes("should i do");
  const wantsOverdue = q.includes("overdue") || q.includes("late") || q.includes("od");
  const wantsNoAccess = q.includes("no access") || q.includes("72") || q.includes("second") || q.includes("revisit");
  const wantsReadySecond = q.includes("ready") || q.includes("2nd") || q.includes("second attempt");
  const wantsCompleted = q.includes("completed") || q.includes("done") || q.includes("finished");
  if (q.includes("bronx")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("bronx"));
  if (q.includes("brooklyn")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("brooklyn"));
  if (q.includes("queens")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("queens"));
  if (q.includes("manhattan")) rows = rows.filter((job) => String((job as any).borough || "").toLowerCase().includes("manhattan"));
  const wantsRouteMe = q.includes("route me") || q.includes("best route") || q.includes("where should i go") || q.includes("go first") || q.includes("what should i do first") || q.includes("take me");
  if (wantsRouteMe) {
    title = "Route Me Today";
    rows = rows.filter((job) => {
      const due = dispatchDueDiff(job);
      const second = workflowSecondAttemptInfo(job);
      return second?.ready || due === 0 || (due !== null && due > 0) || (due !== null && due < 0 && Math.abs(due) <= 3);
    });
    recommendation = "Open the first job below and tap Waze. Waze will handle live traffic for free. After that, continue down the ranked list.";
  } else if (wantsReadySecond) {
    title = "Ready for 2nd Attempt";
    rows = rows.filter((job) => workflowSecondAttemptInfo(job)?.ready);
    recommendation = "These jobs should be revisited now because the 72-hour no-access counter matured.";
  } else if (wantsNoAccess) {
    title = "No Access / 72-Hour Jobs";
    rows = rows.filter((job) => {
      const status = workflowStatus(job) || legacyWorkflowKind(job);
      return status.includes("NO_ACCESS") || Boolean(workflowSecondAttemptInfo(job));
    });
    recommendation = "Track waiting jobs and prioritize any that say REVISIT NOW.";
  } else if (wantsCompleted) {
    title = "Completed / Final Jobs";
    rows = rows.filter((job) => /completed|done/i.test(workflowLabel(job) || JobStatus.statusLabel(job)));
    recommendation = "Review photos, affidavit, and invoice package for completed jobs.";
  } else if (wantsOverdue) {
    title = "Overdue Jobs";
    rows = rows.filter((job) => {
      const due = jobDueDiffForAi(job);
      return due !== null && due > 0;
    });
    recommendation = "Handle the oldest overdue jobs first or document no access/refusal.";
  } else if (wantsToday) {
    title = "Today’s Priority";
    rows = rows.filter((job) => {
      const due = jobDueDiffForAi(job);
      const second = workflowSecondAttemptInfo(job);
      return second?.ready || due === 0 || (due !== null && due > 0);
    });
    recommendation = "Start with ready second attempts, then overdue jobs, then due-today jobs.";
  } else if (q) {
    title = `Search: ${question}`;
    rows = rows.filter((job) =>
      [
        jobKey(job),
        displayAddress(job),
        (job as any).borough,
        displayDescription(job),
        workflowLabel(job),
        JobStatus.statusLabel(job),
        displayAmount(job),
      ].join(" ").toLowerCase().includes(q)
    );
    recommendation = "Matched jobs based on your question text.";
  } else {
    title = "Today’s Priority";
    rows = rows.filter((job) => {
      const due = jobDueDiffForAi(job);
      const second = workflowSecondAttemptInfo(job);
      return second?.ready || due === 0 || (due !== null && due > 0);
    });
  }
  rows.sort((a, b) => {
    const aSecond = workflowSecondAttemptInfo(a)?.ready ? 1 : 0;
    const bSecond = workflowSecondAttemptInfo(b)?.ready ? 1 : 0;
    if (bSecond !== aSecond) return bSecond - aSecond;
    const aDue = jobDueDiffForAi(a);
    const bDue = jobDueDiffForAi(b);
    return (bDue ?? -9999) - (aDue ?? -9999);
  });
  const top = rows.slice(0, 12);
  setAiResults(top);
  const answer =
    `${title}\n\n` +
    `${top.length} job(s) found.\n\n` +
    (top.length ? top.map(jobAssistantLineForAi).join("\n") : "No matching jobs found.") +
    `\n\nRecommendation:\n${recommendation}`;
  setAiAnswer(answer);
  setActionNotice("AI Job Assistant updated.");
};
const [serverWorkflowOverrides, setServerWorkflowOverrides] = useState<Record<string, any>>({});
  const [mapReady, setMapReady] = useState(false);
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
const [hideCompleted, setHideCompleted] = useState(false);
  // HPD_TOUCH_INFO_EVENT_LISTENER
  useEffect(() => {
    function handleTouchInfo(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      setTouchInfoTitle(String(detail.title || "Job Details"));
      setTouchInfoText(String(detail.text || ""));
      setTouchInfoOpen(true);
    }
    window.addEventListener("hpd-open-touch-info", handleTouchInfo as EventListener);
    return () => {
      window.removeEventListener("hpd-open-touch-info", handleTouchInfo as EventListener);
    };
  }, []);

  useEffect(() => {
    const stream = fieldCameraStreamRef.current;
    if (!fieldCameraSession || !stream) return;
    connectFieldCameraStream(stream);
  }, [fieldCameraSession, fieldCameraStreamTick]);

  useEffect(() => {
    return () => {
      stopFieldCameraStream();
    };
  }, []);

const [mapDaysBack, setMapDaysBack] = useState("90");
const [mapShowAllDays, setMapShowAllDays] = useState(false);
const [mapBaseStyle, setMapBaseStyle] = useState<MapBaseStyleId>("maptiler-streets");
const [mapTilerKey, setMapTilerKey] = useState(MAPTILER_ENV_KEY);
const [mapTileStatus, setMapTileStatus] = useState(
  MAPTILER_ENV_KEY ? "MapTiler env key ready." : "MapTiler selected. Add key to load it."
);
  const [fullMap, setFullMap] = useState(false);
const requestedMapBaseStyle = mapBaseStyleById(mapBaseStyle);
const activeMapBaseStyle = resolveMapBaseStyle(mapBaseStyle, mapTilerKey);
const mapTilerKeyReady = Boolean(mapTilerKey.trim());
const needsMapTilerKey = requestedMapBaseStyle.provider === "maptiler" && !mapTilerKeyReady;

function updateMapBaseStyle(styleId: MapBaseStyleId) {
  setMapBaseStyle(styleId);
  setMapTileStatus(`${mapBaseStyleById(styleId).label} selected.`);
  try {
    window.localStorage.setItem(MAP_BASE_STYLE_STORAGE_KEY, styleId);
  } catch {
    // Local storage is optional for private browser modes.
  }
}

function updateMapTilerKey(value: string) {
  const next = value.trim();
  setMapTilerKey(next);
  setMapTileStatus(next ? "MapTiler key saved on this device." : "MapTiler key removed. Voyager is showing.");
  try {
    if (next) window.localStorage.setItem(MAPTILER_KEY_STORAGE_KEY, next);
    else window.localStorage.removeItem(MAPTILER_KEY_STORAGE_KEY);
  } catch {
    // Local storage is optional for private browser modes.
  }
}

function openMapMenu() {
  setMapMenuOpen(true);
  setTimeout(() => mapRef.current?.invalidateSize(), 240);
}

function closeMapMenu() {
  setMapMenuOpen(false);
  setTimeout(() => mapRef.current?.invalidateSize(), 240);
}

function handleMapTouchStart(event: any) {
  const touch = event.touches?.[0];
  if (!touch) return;

  mapSwipeStartXRef.current = touch.clientX;
  mapSwipeStartYRef.current = touch.clientY;
}

function handleMapTouchEnd(event: any) {
  const startX = mapSwipeStartXRef.current;
  const startY = mapSwipeStartYRef.current;
  const touch = event.changedTouches?.[0];

  mapSwipeStartXRef.current = null;
  mapSwipeStartYRef.current = null;

  if (startX === null || startY === null || !touch) return;

  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;

  if (Math.abs(dy) > 80 || Math.abs(dx) < 70) return;
  if (!mapMenuOpen && startX <= 32 && dx > 0) openMapMenu();
  if (mapMenuOpen && dx < 0) closeMapMenu();
}


  useEffect(() => {
    try {
      const savedStyle = window.localStorage.getItem(MAP_BASE_STYLE_STORAGE_KEY);
      if (savedStyle && MAP_BASE_STYLES.some((style) => style.id === savedStyle)) {
        setMapBaseStyle(savedStyle as MapBaseStyleId);
      }

      if (!MAPTILER_ENV_KEY) {
        const savedKey = window.localStorage.getItem(MAPTILER_KEY_STORAGE_KEY);
        if (savedKey) {
          setMapTilerKey(savedKey);
          setMapTileStatus("MapTiler key loaded on this device.");
        }
      }
    } catch {
      // Local storage is optional for private browser modes.
    }
  }, []);


  // LIVE_72H_COUNTDOWN_TICK
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownTick((value) => value + 1);
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);
  // MAP_VIEW_QUERY_SUPPORT
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "archived" || view === "active" || view === "waiting72" || view === "ready2" || view === "final" || view === "all") {
      setWorkflowViewFilter(view);
    }
  }, []);

  // LOAD_WORKFLOW_OVERRIDES_FROM_WORKER
  useEffect(() => {
    let cancelled = false;
    let syncNoticeTimer: number | null = null;
    async function loadServerOverrides() {
      try {
        const response = await fetch(`${HPD_STATUS_WORKER_URL}/overrides`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load workflow overrides: ${response.status}`);
        }
        let data = await response.json();
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            data = {};
          }
        }
        const overrides =
          data?.overrides && typeof data.overrides === "object"
            ? data.overrides
            : {};
        if (cancelled) return;
        setServerWorkflowOverrides(overrides);
        if (Object.keys(overrides).length) {
          setActionNotice("Synced latest job statuses.");
          syncNoticeTimer = window.setTimeout(() => {
            if (!cancelled) setActionNotice("");
          }, 2800);
        }
      } catch (error) {
        console.error(error);
      }
    }
    loadServerOverrides();
    return () => {
      cancelled = true;
      if (syncNoticeTimer) window.clearTimeout(syncNoticeTimer);
    };
  }, []);
  // APPLY_SERVER_OVERRIDES_AFTER_ROWS_LOAD
  useEffect(() => {
    if (!Object.keys(serverWorkflowOverrides).length) return;
    setJobs((rows) => applyWorkflowOverrideObjectToRows(rows, serverWorkflowOverrides));
    setMappedJobs((rows) => applyWorkflowOverrideObjectToRows(rows, serverWorkflowOverrides));
    setSelected((current) =>
      current ? (applyWorkflowOverrideObjectToRows([current], serverWorkflowOverrides)[0] as MappedJob) : current
    );
  }, [serverWorkflowOverrides, jobs.length, mappedJobs.length]);
  // Apply saved workflow statuses after jobs load from static data.
  useEffect(() => {
    if (selected) {
      window.setTimeout(() => {
        selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [selected]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = workflowStorageRead();
    if (!Object.keys(saved).length) return;

    setJobs((rows) => workflowStorageApply(rows));
    setMappedJobs((rows) => workflowStorageApply(rows));
    setSelected((current) => (current ? (workflowStorageApply([current])[0] as MappedJob) : current));
  }, [jobs.length, mappedJobs.length]);

const WORKFLOW_STORAGE_KEY = "hpd-job-workflow-overrides-v1";

function readWorkflowOverrides(): Record<string, any> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeWorkflowOverrides(overrides: Record<string, any>) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(overrides));
}

function saveWorkflowOverride(job: JobRecord, patch: Record<string, any>) {
    const key = jobKey(job);
  if (!key) return;

  const overrides = readWorkflowOverrides();

  if (!patch.WorkflowStatus && !patch.workflowStatus && !patch.StatusOverride) {
    delete overrides[key];
  } else {
    overrides[key] = {
      ...(overrides[key] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  }

  writeWorkflowOverrides(overrides);
}

function applyWorkflowOverridesToRows<T extends JobRecord>(rows: T[]): T[] {
  const overrides = readWorkflowOverrides();

  return rows.map((row) => {
    const key = jobKey(row);
    const patch = key ? overrides[key] : null;
    return patch ? ({ ...row, ...patch } as T) : row;
  });
}

  function mapDateAnchor(job: JobRecord) {
    const candidates = [
      { source: "Work start", raw: (job as any).WorkStartDate || (job as any).workStartDate || (job as any)["Work Start Date"] || "" },
      { source: "Work complete", raw: (job as any).WorkCompletionDate || (job as any).workCompletionDate || (job as any)["Work Completion Date"] || "" },
      { source: "Award", raw: (job as any).AwardDate || (job as any).awardDate || (job as any)["Award Date"] || "" },
    ];

    for (const candidate of candidates) {
      const date = parseJobDate(candidate.raw);
      if (date) return { date: dateOnly(date), source: candidate.source };
    }

    return null;
  }

  function mapDaysBackLimit() {
    const limit = Number(mapDaysBack);
    if (!Number.isFinite(limit) || limit <= 0) return 90;
    return Math.min(9999, Math.round(limit));
  }

  function mapDateAgeDays(job: JobRecord) {
    const anchor = mapDateAnchor(job);
    if (!anchor) return null;
    return daysBetween(anchor.date, dateOnly(new Date()));
  }

  function mapDateFilterLabel() {
    return mapShowAllDays ? "All mapped jobs" : `Last ${mapDaysBackLimit()} days`;
  }

  const filteredJobs = useMemo<MappedJob[]>(() => {
    const needle = search.trim().toLowerCase();

    const rows: MappedJob[] = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords
            ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" }
            : { ...job };
        });

    const limit = mapDaysBackLimit();
    const dateFiltered = mapShowAllDays
      ? rows
      : rows.filter((job) => {
          const age = mapDateAgeDays(job);
          return age !== null && age >= 0 && age <= limit;
        });

    if (!needle) return dateFiltered;

    return dateFiltered.filter((job) =>
      [
        job.id,
        job.omo,
        job.jobId,
        job.address,
        job.location,
        job.borough,
        job.trade,
        job.status,
        job.awardDate,
        job.bidDueDate,
        job.dueDate,
        job.bidAmount,
        job.tenantPhone,
        job.phone,
        job.contractor,
        job.owner,
        job.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [jobs, mappedJobs, search, mapDaysBack, mapShowAllDays]);

  const plottedCount = mappedJobs.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;

  const mapDateCounts = useMemo(() => {
    const rows = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" } : { ...job };
        });

    const limit = mapDaysBackLimit();
    return rows.reduce(
      (acc: { all: number; visible: number; missingDate: number }, job: MappedJob) => {
        acc.all += 1;
        const age = mapDateAgeDays(job);
        if (age === null) acc.missingDate += 1;
        if (mapShowAllDays || (age !== null && age >= 0 && age <= limit)) acc.visible += 1;
        return acc;
      },
      { all: 0, visible: 0, missingDate: 0 }
    );
  }, [jobs, mappedJobs, mapDaysBack, mapShowAllDays]);

  function clearMarkerOverviewReturn() {
    if (markerOverviewTimerRef.current !== null) {
      clearTimeout(markerOverviewTimerRef.current);
      markerOverviewTimerRef.current = null;
    }
    markerOverviewKeyRef.current = "";
  }

  function fitVisibleJobsOnMap(maxZoom = 13, includeUserLocation = false) {
    const map = mapRef.current;
    if (!map) return;

    const bounds = filteredJobs
      .filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng))
      .map((job) => [Number(job._lat), Number(job._lng)] as [number, number]);

    if (includeUserLocation && userLocation) {
      bounds.push([userLocation.lat, userLocation.lng]);
    }

    if (bounds.length) {
      map.fitBounds(bounds, {
        animate: true,
        duration: 0.75,
        padding: [58, 58],
        maxZoom,
      });
      return;
    }

    map.setView([40.7128, -74.006], 10, { animate: true });
  }

  function centerMapOnUserLocation(location = userLocation) {
    const map = mapRef.current;
    if (!map || !location) return false;

    map.flyTo([location.lat, location.lng], USER_LOCATION_OVERVIEW_ZOOM, {
      animate: true,
      duration: 0.75,
    });
    return true;
  }

  function showMyLocationOverview() {
    clearMarkerOverviewReturn();
    setSelectedOnly(false);
    setSelected(null);
    setGeneratedLinks({});
    setDescriptionOpen(false);
    setDrawerOpen(false);
    setFullMap(true);
    mapRef.current?.closePopup?.();

    if (centerMapOnUserLocation()) {
      showActionNotice("Centered on your location with a wider map view.");
    } else {
      startLocationTracking();
      showActionNotice("Starting location. The map will center on you with a wider view.");
    }

    window.setTimeout(() => mapRef.current?.invalidateSize(), 120);
  }

  function returnToMapOverview() {
    setSelectedOnly(false);
    setSelected(null);
    setGeneratedLinks({});
    setDescriptionOpen(false);
    setDrawerOpen(false);
    setFullMap(true);
    mapRef.current?.closePopup?.();
    if (!centerMapOnUserLocation()) {
      fitVisibleJobsOnMap(userLocation ? USER_LOCATION_OVERVIEW_ZOOM : 13, true);
    }
    window.setTimeout(() => mapRef.current?.invalidateSize(), 120);
  }

  function scheduleMarkerOverviewReturn(jobId: string) {
    clearMarkerOverviewReturn();
    markerOverviewKeyRef.current = jobId;
    markerOverviewTimerRef.current = window.setTimeout(() => {
      if (markerOverviewKeyRef.current !== jobId) return;
      markerOverviewTimerRef.current = null;
      markerOverviewKeyRef.current = "";
      returnToMapOverview();
    }, 10000);
  }

  useEffect(() => {
    return () => {
      if (markerOverviewTimerRef.current !== null) {
        clearTimeout(markerOverviewTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selected) {
      window.setTimeout(() => {
        selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [selected]);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const response = await fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`/data/COA_Fetcher_2026.json returned ${response.status}`);

        const data = await response.json();
        const rows = asArray(Array.isArray(data) ? data : data.jobs || data.data || []).map(normalizeStaticJob);

        if (cancelled) return;

        setJobs(rows);

        const initialMapped: MappedJob[] = rows.map((job) => {
          const coords = getStoredCoords(job);
          if (!coords) return { ...job };
          return { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" };
        });

        setMappedJobs(initialMapped);

        const existing = initialMapped.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;
        const missing = rows.length - existing;

        setMessage(`${rows.length} jobs · ${existing} mapped · ${missing} need lookup`);

        const toGeocode = initialMapped
          .filter((job) => !Number.isFinite(job._lat) || !Number.isFinite(job._lng))
          .filter((job) => cleanAddress(job))
          .slice(0, 100);

        let geocoded = 0;

        for (const job of toGeocode) {
          if (cancelled) return;

          await wait(1050);

          const coords = await geocodeJob(job).catch(() => null);
          if (!coords) continue;

          geocoded += 1;

          setMappedJobs((current) =>
            current.map((item) => {
              const sameId = jobKey(item) === jobKey(job);
              const sameAddress = cleanAddress(item) === cleanAddress(job);

              if (sameId || sameAddress) {
                return {
                  ...item,
                  _lat: coords.lat,
                  _lng: coords.lng,
                  _source: "geocoded",
                };
              }

              return item;
            })
          );

          setMessage(`${rows.length} jobs · ${existing + geocoded} mapped · geocoding continues`);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setJobs([]);
          setMappedJobs([]);
          setMessage("Could not load static jobs data. Showing NYC map only.");
        }
      }
    }

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selected) {
      window.setTimeout(() => {
        selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [selected]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapNode.current || mapRef.current) return;

      try {
        const L = await import("leaflet");

        if (cancelled || !mapNode.current) return;

        const map = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        }).setView([40.7128, -74.006], 10);

        const markerLayer = L.layerGroup().addTo(map);

        mapRef.current = map;
        markerLayerRef.current = markerLayer;

        setMapReady(true);

        setTimeout(() => map.invalidateSize(), 250);
        setTimeout(() => map.invalidateSize(), 1000);
      } catch (error) {
        console.error(error);
        if (!cancelled) setMessage("Map failed to initialize.");
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapTileLayerRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function updateBaseLayer() {
      if (!mapReady || !mapRef.current) return;

      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      const map = mapRef.current;
      const requestedStyle = mapBaseStyleById(mapBaseStyle);
      const style = resolveMapBaseStyle(mapBaseStyle, mapTilerKey);
      const tileUrl = mapTileUrl(style, mapTilerKey);
      let tileErrorCount = 0;
      let tileLoaded = false;

      if (mapTileLayerRef.current) {
        map.removeLayer(mapTileLayerRef.current);
        mapTileLayerRef.current = null;
      }

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: style.maxZoom,
        attribution: style.attribution,
      });

      tileLayer.on("tileload", () => {
        if (cancelled || tileLoaded) return;
        tileLoaded = true;
        if (requestedStyle.provider === "maptiler" && style.provider === "carto") {
          setMapTileStatus("MapTiler needs a key. Voyager backup is showing.");
        } else {
          setMapTileStatus(`${style.label} loaded.`);
        }
      });

      tileLayer.on("tileerror", () => {
        tileErrorCount += 1;
        if (tileErrorCount < 3 || cancelled) return;
        setMapTileStatus(`${style.label} could not load. Voyager backup is showing.`);
        if (style.provider === "maptiler") {
          setMapBaseStyle("carto-voyager");
        }
      });

      tileLayer.addTo(map);
      mapTileLayerRef.current = tileLayer;

      if (requestedStyle.provider === "maptiler" && style.provider === "carto") {
        setMapTileStatus("MapTiler needs a key. Voyager backup is showing.");
      } else {
        setMapTileStatus(`${style.label} loading...`);
      }
    }

    updateBaseLayer();

    return () => {
      cancelled = true;
    };
  }, [mapReady, mapBaseStyle, mapTilerKey]);

  useEffect(() => {
    if (selected) {
      window.setTimeout(() => {
        selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [selected]);

  useEffect(() => {
    async function drawMarkers() {
      if (!mapReady || !mapRef.current || !markerLayerRef.current) return;

      const L = await import("leaflet");
      const map = mapRef.current;
      const layer = markerLayerRef.current;

      layer.clearLayers();

      const bounds: [number, number][] = [];

      filteredJobs.forEach((job, index) => {
        if (!Number.isFinite(job._lat) || !Number.isFinite(job._lng)) return;

        const lat = Number(job._lat);
        const lng = Number(job._lng);

        const color = (job.status || "").toLowerCase().includes("award")
          ? "#53e69c"
          : job._source === "geocoded"
            ? "#ffd166"
            : "#42e8f3";

        const info = maturityInfo(job);
        const markerColor = JobStatus.statusColor(job);
        const maturityLabel = markerMaturityLabel(job);
        const overdueLabel = markerOverdueLabel(job);
        const popupJobId = jobKey(job, index);

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "maturity-map-marker",
            html: `<div class="maturity-marker-bubble maturity-${info.priority} ${JobStatus.statusMarkerClass(job)} ${workflowViewBucket(job) === "ready2" ? "marker-ready-revisit" : ""}" style="border-color:${markerColor}">
                    <strong>${markerWorkflowLabelHtml(job)}</strong>
                    <span class="marker-counter-row">
                      ${maturityLabel ? `<span class="marker-md-badge">${maturityLabel}</span>` : ""}
                      ${overdueLabel ? `<span class="marker-overdue-badge">${overdueLabel}</span>` : ""}
                    </span>
                  </div>`,
            iconSize: [104, 64],
            iconAnchor: [52, 32],
            popupAnchor: [0, -18],
          }),
        });

        marker.on("click", () => {
          setSelected(job);
          setSelectedOnly(true);
          setGeneratedLinks({});
          setFullMap(true);
          setDrawerOpen(false);
          setMapMenuOpen(false);
          scheduleMarkerOverviewReturn(popupJobId);

          setTimeout(() => {
            mapRef.current?.flyTo([Number(job._lat), Number(job._lng)], 16, {
              animate: true,
              duration: 0.75,
            });
          }, 40);

        });

        marker.bindPopup(`
          <div class="field-map-popup">
            <strong>${escapeMapPopupHtml(popupJobId)}</strong>
            <span>${escapeMapPopupHtml(displayAddress(job))}</span>
            <small>${escapeMapPopupHtml((job.borough || "Unknown borough") + (job.trade ? " - " + job.trade : ""))}</small>
            <small>${escapeMapPopupHtml((workflowLabel(job) || JobStatus.statusLabel(job)) + (money(job) ? " - " + money(job) : ""))}</small>
            <button type="button" data-map-open-job="${escapeMapPopupHtml(popupJobId)}">Open Job</button>
          </div>
        `);

        marker.addTo(layer);
        bounds.push([lat, lng]);
      });

      if (bounds.length) {
        map.fitBounds(bounds, {
          padding: [34, 34],
          maxZoom: 15,
        });
      } else {
        map.setView([40.7128, -74.006], 10);
      }

      setTimeout(() => map.invalidateSize(), 250);
    }

    drawMarkers();
  }, [mapReady, filteredJobs, countdownTick]);

  useEffect(() => {
    let cancelled = false;

    async function drawUserLocation() {
      if (!mapReady || !mapRef.current || !userLocation) return;
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      const map = mapRef.current;
      const latLng: [number, number] = [userLocation.lat, userLocation.lng];

      if (!userLocationMarkerRef.current) {
        userLocationMarkerRef.current = L.marker(latLng, {
          zIndexOffset: 2000,
          icon: L.divIcon({
            className: "user-location-marker",
            html: '<div class="user-location-dot"><em>You</em><span></span></div>',
            iconSize: [64, 64],
            iconAnchor: [32, 32],
          }),
        }).addTo(map);
      } else {
        userLocationMarkerRef.current.setLatLng(latLng);
      }

      if (!userLocationAccuracyRef.current) {
        userLocationAccuracyRef.current = L.circle(latLng, {
          radius: Math.max(15, userLocation.accuracy || 25),
          color: "#2563eb",
          weight: 1,
          fillColor: "#93c5fd",
          fillOpacity: 0.14,
        }).addTo(map);
      } else {
        userLocationAccuracyRef.current.setLatLng(latLng);
        userLocationAccuracyRef.current.setRadius(Math.max(15, userLocation.accuracy || 25));
      }

      if (!locationOverviewFitRef.current && !selectedOnly && !drawerOpen) {
        locationOverviewFitRef.current = true;
        centerMapOnUserLocation(userLocation);
      }
    }

    drawUserLocation();
    return () => {
      cancelled = true;
    };
  }, [mapReady, userLocation, followMyLocation, selectedOnly, drawerOpen, filteredJobs]);

  useEffect(() => {
    function handlePopupOpen(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.("[data-map-open-job]") as HTMLElement | null;
      if (!button) return;

      const id = button.getAttribute("data-map-open-job") || "";
      const pool = (mappedJobs.length ? mappedJobs : jobs) as MappedJob[];
      const job = pool.find((row) => String(jobKey(row)).trim() === id.trim());
      if (!job) return;

      setMapMenuOpen(false);
      clearMarkerOverviewReturn();
      focusJob(job);
    }

    document.addEventListener("click", handlePopupOpen);
    return () => document.removeEventListener("click", handlePopupOpen);
  }, [jobs, mappedJobs]);

  useEffect(() => {
    return () => {
      if (typeof navigator !== "undefined" && geolocationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || locationAutoStartedRef.current || typeof window === "undefined") return;

    locationAutoStartedRef.current = true;
    const savedPreference = window.localStorage.getItem(LOCATION_ALWAYS_STORAGE_KEY);
    if (savedPreference === "off") {
      setLocationStatus("Location paused");
      return;
    }

    window.localStorage.setItem(LOCATION_ALWAYS_STORAGE_KEY, "on");

    const permissions = (navigator as any).permissions;
    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" })
        .then((permission: PermissionStatus) => {
          if (permission.state === "denied") {
            setLocationStatus("Location blocked in Chrome");
            showActionNotice("Turn on Chrome location permission for this site to see yourself on the map.");
            return;
          }
          startLocationTracking();
        })
        .catch(() => startLocationTracking());
      return;
    }

    startLocationTracking();
  }, [mapReady]);

  useEffect(() => {
    const key = selected ? jobKey(selected) : "";
    if (!key || !canStoreFieldPhotos()) return;
    let cancelled = false;
    Promise.all([countFieldPhotos(key), listFieldEvidence(key), listFieldPackets(key)])
      .then(([counts, evidenceRows, packets]) => {
        if (!cancelled) {
          setFieldPhotoCounts((current) => ({ ...current, [key]: counts }));
          setFieldEvidenceByJob((current) => ({ ...current, [key]: fieldEvidenceCardRows(evidenceRows) }));
          setFieldPacketsByJob((current) => ({ ...current, [key]: packets }));
        }
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const readyCount = jobs.filter((job) => workflowViewBucket(job) === "ready2").length;
    if (!readyCount || typeof window === "undefined") return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const noticeKey = `hpd-ready2-notice-${todayKey}`;
    if (window.localStorage.getItem(noticeKey) === String(readyCount)) return;

    window.localStorage.setItem(noticeKey, String(readyCount));
    showActionNotice(`${readyCount} job(s) are ready for 2nd attempt today.`);

    if ("Notification" in window && window.Notification.permission === "granted") {
      new window.Notification("HPD jobs ready", {
        body: `${readyCount} no-access job(s) are ready for second attempt.`,
      });
    }
  }, [jobs, countdownTick]);

  function showReadyRevisitJobs() {
    setWorkflowViewFilter("ready2");
    setSelectedOnly(false);
    setSelected(null);
    setDrawerOpen(false);
    setFullMap(true);

    window.requestAnimationFrame(() => {
      mapRef.current?.invalidateSize();
    });

    window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 250);
  }
  function updateStatus(job: any, newStatus: string) {
  if (!job?.OMO) return;

  fetch(`${HPD_STATUS_WORKER_URL}/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      omo: job.OMO,
      status: newStatus
    })
  })
    .then(() => {
      // update UI immediately
      job.StatusOverride = newStatus;
      job.status = newStatus;
      setSelected({ ...job });
    })
    .catch(() => alert("Failed to update status"));
}
  function showActionNotice(text: string) {
    setActionNotice(text);
    window.setTimeout(() => setActionNotice(""), 3600);
  }

  function applyWorkflowPatchToState(key: string, patch: Record<string, any>) {
    const applyPatch = (row: any) => (jobKey(row) === key ? { ...row, ...patch } : row);
    setSelected((current) => (current && jobKey(current) === key ? (applyPatch(current) as MappedJob) : current));
    setJobs((rows) => rows.map(applyPatch));
    setMappedJobs((rows) => rows.map(applyPatch));
  }

  function saveFieldWorkflowPatch(job: MappedJob, patch: Record<string, any>, notice: string) {
    const key = jobKey(job);
    if (!key) return;

    const nextPatch = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    workflowStorageSave(key, nextPatch);
    applyWorkflowPatchToState(key, nextPatch);
    setDraftWorkflowSaved(true);
    invalidateFullPackagePreview(key, true);

    workflowServerSave(key, nextPatch)
      .then(() => showActionNotice(notice))
      .catch((error) => {
        console.error(error);
        showActionNotice("Saved on this phone. Server sync needs retry.");
      });
  }

  function clearedFieldWorkflowStatePatch() {
    return {
      WorkflowStatus: "",
      workflowStatus: "",
      FieldOutcome: "",
      fieldOutcome: "",
      StatusOverride: "",
      status: "Pending",
      NoAccessFirstAttemptAt: "",
      noAccessFirstAttemptAt: "",
      NoAccessSecondAttemptAt: "",
      noAccessSecondAttemptAt: "",
      SecondAttemptAvailableAt: "",
      secondAttemptAvailableAt: "",
      RefusalDate: "",
      refusalDate: "",
      VerifiedByOthersDate: "",
      verifiedByOthersDate: "",
      ActualWorkStartDate: "",
      actualWorkStartDate: "",
      ActualWorkCompletionDate: "",
      actualWorkCompletionDate: "",
      JobStartedAt: "",
      jobStartedAt: "",
      JobFinishedAt: "",
      jobFinishedAt: "",
      FieldTimerStartedAt: "",
      fieldTimerStartedAt: "",
      BeforePhotoCount: 0,
      beforePhotoCount: 0,
      AfterPhotoCount: 0,
      afterPhotoCount: 0,
      EvidenceMediaCount: 0,
      evidenceMediaCount: 0,
      ImageEvidenceCount: 0,
      imageEvidenceCount: 0,
      VideoEvidenceCount: 0,
      videoEvidenceCount: 0,
      LastEvidenceCapturedAt: "",
      lastEvidenceCapturedAt: "",
      PhotoPackageStatus: "",
      photoPackageStatus: "",
      BeforePhotosRequestedAt: "",
      beforePhotosRequestedAt: "",
      BeforePhotosCapturedAt: "",
      beforePhotosCapturedAt: "",
      AfterPhotosRequestedAt: "",
      afterPhotosRequestedAt: "",
      AfterPhotosCapturedAt: "",
      afterPhotosCapturedAt: "",
      NoAccessEvidenceCount: 0,
      noAccessEvidenceCount: 0,
      NoAccessEvidenceCapturedAt: "",
      noAccessEvidenceCapturedAt: "",
      RefusedEvidenceCount: 0,
      refusedEvidenceCount: 0,
      RefusedEvidenceCapturedAt: "",
      refusedEvidenceCapturedAt: "",
      CompletedByOthersEvidenceCount: 0,
      completedByOthersEvidenceCount: 0,
      CompletedByOthersEvidenceCapturedAt: "",
      completedByOthersEvidenceCapturedAt: "",
      PackageGeneratedAt: "",
      packageGeneratedAt: "",
      PackageReadyMessage: "",
      packageReadyMessage: "",
      OutcomeLockedAt: "",
      outcomeLockedAt: "",
      ArchivedFromMap: false,
      updatedAt: new Date().toISOString(),
    };
  }

  function emptyFieldMediaCounts(): FieldMediaCounts {
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

  function fieldEvidenceLabel(kind: FieldMediaKind) {
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

  function fieldEvidenceMeta(job: MappedJob, kind: FieldMediaKind, label?: string): FieldEvidenceMeta {
    return {
      jobId: jobKey(job),
      address: displayAddress(job),
      location: displayLocation(job),
      borough: job.borough || "",
      outcome: workflowLabel(job) || JobStatus.statusLabel(job),
      label: label || fieldEvidenceLabel(kind),
    };
  }

  function fieldCaptureGuideText(kind: FieldMediaKind) {
    const labels: Record<FieldMediaKind, string> = {
      before: "Capture the default before set: 2 photos and 2 videos. You can add more before starting work.",
      after: "Capture the default after set: 2 photos and 2 videos. You can add more before completing the job.",
      no_access: "Capture no-access evidence now for the 72-hour record.",
      refused_access: "Capture refused-access evidence now for the affidavit package.",
      completed_by_others: "Capture completed-by-others evidence now for the affidavit package.",
      general: "Capture field evidence now for this job package.",
    };
    return labels[kind];
  }

  function fieldStageLabel(kind: FieldMediaKind) {
    const labels: Record<FieldMediaKind, string> = {
      before: "Before",
      after: "After",
      no_access: "No Access",
      refused_access: "Refused Access",
      completed_by_others: "Done By Others",
      general: "Field",
    };
    return labels[kind];
  }

  function guidedCaptureSteps(kind: FieldMediaKind) {
    const stage = fieldStageLabel(kind);
    const photoSteps = Array.from({ length: FIELD_REQUIRED_PHOTOS }, (_, index) => {
      const number = index + 1;
      return {
        accept: "image/*",
        camera: true,
        title: `${stage} Photo ${number}`,
        text:
          number === 1
            ? `Take ${stage.toLowerCase()} photo ${number} of ${FIELD_REQUIRED_PHOTOS}. The camera will reopen for the next item.`
            : `Take ${stage.toLowerCase()} photo ${number} of ${FIELD_REQUIRED_PHOTOS} from another angle. The camera will reopen again.`,
        label: `${stage} Photo ${number}`,
      };
    });
    const videoSteps = Array.from({ length: FIELD_REQUIRED_VIDEOS }, (_, index) => {
      const number = index + 1;
      return {
        accept: "video/*",
        camera: true,
        title: `${stage} Video ${number}`,
        text:
          number === 1
            ? `Take ${stage.toLowerCase()} video ${number} of ${FIELD_REQUIRED_VIDEOS}. Keep it short so it can be stamped and emailed.`
            : `Take ${stage.toLowerCase()} video ${number} of ${FIELD_REQUIRED_VIDEOS} from another angle. Then choose done or add more.`,
        label: `${stage} Video ${number}`,
      };
    });
    const steps: Array<Omit<FieldCaptureStep, "kind" | "step" | "total">> = [...photoSteps, ...videoSteps];

    return steps.map((step, index) => ({
      ...step,
      kind,
      step: index + 1,
      total: steps.length,
    }));
  }

  function extraVideoCaptureStep(job: MappedJob, kind: FieldMediaKind): FieldCaptureStep {
    const stage = fieldStageLabel(kind);
    const savedVideoCount = fieldEvidenceRowsFor(job).filter((media) => media.kind === kind && media.mediaType === "video").length;
    const number = savedVideoCount + 1;
    return {
      kind,
      accept: "video/*",
      camera: true,
      title: `${stage} Video ${number}`,
      text: `Take another ${stage.toLowerCase()} video angle. It will be labeled and saved with this job.`,
      label: `${stage} Video ${number}`,
      step: 1,
      total: 1,
    };
  }

  function extraPhotoCaptureStep(job: MappedJob, kind: FieldMediaKind): FieldCaptureStep {
    const stage = fieldStageLabel(kind);
    const savedPhotoCount = fieldEvidenceRowsFor(job).filter((media) => media.kind === kind && media.mediaType === "image").length;
    const number = savedPhotoCount + 1;
    return {
      kind,
      accept: "image/*",
      camera: true,
      title: `${stage} Photo ${number}`,
      text: `Take another ${stage.toLowerCase()} photo angle. It will be labeled and saved with this job.`,
      label: `${stage} Photo ${number}`,
      step: 1,
      total: 1,
    };
  }

  function setCaptureGuideForStep(job: MappedJob, step: FieldCaptureStep) {
    const key = jobKey(job);
    if (!key) return;
    setFieldCaptureGuide({
      jobKey: key,
      kind: step.kind,
      accept: step.accept,
      camera: step.camera,
      title: step.title,
      text: step.text,
      label: step.label,
      step: step.step,
      total: step.total,
    });
  }

  function fieldCaptureTargetToken(target: FieldCaptureTarget | null) {
    if (!target) return "";
    return [
      target.jobKey,
      target.kind,
      target.step?.title || "",
      target.meta.label || "",
    ].join("|");
  }

  function inlineCameraModeForAccept(accept: string): "photo" | "video" {
    return accept.includes("video") && !accept.includes("image") ? "video" : "photo";
  }

  function canUseInlineCamera() {
    return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  function fieldCameraFileName(target: FieldCaptureTarget, extension: string) {
    const key = zipSafePart(target.jobKey || target.meta.jobId || "job", "job");
    const label = zipSafePart(target.step?.label || target.meta.label || "evidence", "evidence");
    return `${key}-${label}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  }

  function stopFieldCameraStream() {
    fieldCameraRecorderRef.current = null;
    fieldCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    fieldCameraStreamRef.current = null;
    if (fieldCameraVideoRef.current) {
      fieldCameraVideoRef.current.srcObject = null;
    }
    setFieldCameraRecording(false);
  }

  function closeInlineFieldCamera() {
    stopFieldCameraStream();
    setFieldCameraSession(null);
    setFieldCameraBusy(false);
    setFieldCameraStatus("");
    fieldCameraRecordingTargetRef.current = null;
    fieldCameraChunksRef.current = [];
    photoCaptureTargetRef.current = null;
    setPhotoCaptureTarget(null);
  }

  async function ensureFieldCameraStream() {
    const existing = fieldCameraStreamRef.current;
    if (existing && existing.getVideoTracks().some((track) => track.readyState === "live")) {
      return existing;
    }

    if (!canUseInlineCamera()) {
      throw new Error("In-app camera is not available in this browser.");
    }

    const videoConstraints: MediaTrackConstraints[] = [
      {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      { facingMode: { ideal: "environment" } },
      true as unknown as MediaTrackConstraints,
    ];
    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const video of videoConstraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!stream) {
      const name = lastError instanceof DOMException ? lastError.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error("Android blocked camera permission. Allow Camera for this site in Chrome, then tap Start Job again.");
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new Error("No Android camera was found by Chrome. Try closing other camera apps and reopen the dashboard.");
      }
      throw new Error(lastError instanceof Error ? lastError.message : "Android camera could not open.");
    }
    fieldCameraStreamRef.current = stream;
    setFieldCameraStreamTick((tick) => tick + 1);
    return stream;
  }

  function connectFieldCameraStream(stream: MediaStream) {
    const attach = (attempt = 0) => {
      const video = fieldCameraVideoRef.current;
      if (!video) {
        if (attempt < 8) window.setTimeout(() => attach(attempt + 1), 80);
        return;
      }
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      if (video.srcObject !== stream) video.srcObject = stream;
      video.play().catch((error) => {
        console.error(error);
        setFieldCameraStatus("Tap the preview to wake Android camera.");
      });
    };
    attach();
  }

  async function openInlineFieldCamera(target: FieldCaptureTarget, accept: string) {
    const mode = inlineCameraModeForAccept(accept);
    setFieldCameraSession({ target, mode });
    setFieldCameraBusy(false);
    setFieldCameraRecording(false);
    setFieldCameraStatus(mode === "video" ? "Opening video camera..." : "Opening photo camera...");

    try {
      const stream = await ensureFieldCameraStream();
      connectFieldCameraStream(stream);
      window.setTimeout(() => connectFieldCameraStream(stream), 160);
      setFieldCameraStatus(mode === "video" ? "Ready. Tap Start Video." : "Ready. Tap Capture Photo.");
    } catch (error) {
      console.error(error);
      setFieldCameraSession(null);
      setFieldCameraStatus("");
      showActionNotice(error instanceof Error ? error.message : "Camera could not open. Use the Take button again or Gallery.");
    }
  }

  function preferredRecordingMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const options = [
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
      "video/webm;codecs=vp9",
    ];
    return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function waitForInlineCameraVideoReady(timeoutMs = 2600) {
    const stream = fieldCameraStreamRef.current;
    if (stream) connectFieldCameraStream(stream);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const video = fieldCameraVideoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        return video;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return fieldCameraVideoRef.current;
  }

  function fieldEvidenceRowsFor(job: JobRecord | null) {
    const key = job ? jobKey(job) : "";
    if (!key) return [] as FieldMedia[];
    return [...(fieldEvidenceByJob[key] || [])].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  function fieldEvidenceCardRows(rows: FieldMedia[]) {
    return rows.slice(-12).map((media) => (media.mediaType === "video" ? { ...media, dataUrl: "" } : media));
  }

  function fieldEvidencePreview(media: FieldMedia) {
    return media.mediaType === "video" ? media.posterDataUrl || "" : media.dataUrl;
  }

  function fieldEvidenceRowsByKind(job: JobRecord | null, kind: FieldMediaKind) {
    return fieldEvidenceRowsFor(job).filter((media) => media.kind === kind);
  }

  function latestFieldEvidence(job: JobRecord | null, kind: FieldMediaKind) {
    return fieldEvidenceRowsByKind(job, kind)[0] || null;
  }

  function fieldMediaCountLabel(count: number) {
    return `${count} file${count === 1 ? "" : "s"}`;
  }

  function fieldMediaStateLabel(job: JobRecord, kind: FieldMediaKind) {
    const counts = fieldPhotoCountsFor(job);
    const count = counts[kind] || 0;
    if (count) return "Saved on job card";
    if (kind === "before") return "Required before work";
    if (kind === "after") return "Required when finished";
    return "Evidence optional";
  }

  function fieldEvidenceKindClass(kind: FieldMediaKind) {
    return kind.replace(/_/g, "-");
  }

  function fieldPacketRowsFor(job: JobRecord | null) {
    const key = job ? jobKey(job) : "";
    if (!key) return [] as FieldPacket[];
    return fieldPacketsByJob[key] || [];
  }

  function latestFieldPacket(job: JobRecord | null, packetType?: FieldPacket["packetType"]) {
    const packets = fieldPacketRowsFor(job);
    if (!packetType) return packets[0] || null;
    return packets.find((packet) => packet.packetType === packetType) || null;
  }

  function fieldPacketLabel(packet: FieldPacket) {
    if (packet.packetType === "application_package_zip") return "Application Package ZIP";
    if (packet.packetType === "video_package_zip") return "Video Package ZIP";
    if (packet.packetType === "full_evidence_zip") return "Complete Package ZIP";
    if (packet.packetType === "affidavit_invoice_pdf") return "Invoice/Affidavit PDF";
    return "Legacy Evidence PDF";
  }

  function fieldPacketSummary(packet: FieldPacket) {
    if (packet.packetType === "application_package_zip") return `PDF + ${packet.imageCount} image(s)`;
    if (packet.packetType === "video_package_zip") return `${packet.videoCount} video(s)`;
    if (packet.packetType === "full_evidence_zip") {
      return `${packet.evidenceCount} media file(s) - ${packet.videoCount} video(s)`;
    }
    if (packet.packetType === "affidavit_invoice_pdf") return "Paperwork PDF";
    return `${packet.evidenceCount} evidence file(s)`;
  }

  function fullPackagePreviewFor(job: JobRecord | null) {
    const key = job ? jobKey(job) : "";
    if (!key || !job) return null;
    if (fullPackagePreview?.jobKey === key) return fullPackagePreview;

    const packet = latestFieldPacket(job, "full_evidence_zip");
    if (!packet) return null;

    const counts = fieldPhotoCountsFor(job);
    const evidenceRows = fieldEvidenceRowsFor(job);
    const latestEvidenceAt = evidenceRows.reduce((latest, media) => {
      return media.capturedAt > latest ? media.capturedAt : latest;
    }, "");
    if (!evidenceRows.length || !counts.total || (latestEvidenceAt && packet.generatedAt < latestEvidenceAt)) return null;

    return {
      jobKey: key,
      fileName: packet.fileName,
      size: packet.size,
      evidenceCount: packet.evidenceCount,
      imageCount: packet.imageCount,
      videoCount: packet.videoCount,
      beforeCount: counts.before,
      afterCount: counts.after,
      hasInvoice: Boolean(latestFieldPacket(job, "affidavit_invoice_pdf")),
      videoNames: [],
      skippedMediaCount: 0,
      generatedAt: packet.generatedAt,
      savedPacketId: packet.id,
      note: packet.note || "Saved complete package is ready.",
    } satisfies FullPackagePreview;
  }

  function invalidateFullPackagePreview(key: string, clearStored = false) {
    pendingFullPackageRef.current = null;
    setFullPackagePreview((current) => (current?.jobKey === key ? null : current));
    setFieldPacketsByJob((current) => {
      const rows = current[key] || [];
      if (!rows.length) return current;
      const filtered = clearStored
        ? []
        : rows.filter((packet) => packet.packetType === "affidavit_invoice_pdf");
      return { ...current, [key]: filtered };
    });

    if (clearStored) {
      return clearFieldPackets(key).catch((error) => console.error(error));
    }

    return clearFieldPackets(key, ["full_evidence_zip", "email_evidence_pdf"]).catch((error) => console.error(error));
  }

  function packetSizeLabel(size: number) {
    const value = Number(size || 0);
    if (!value) return "0 KB";
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function focusFieldPane(pane: "capture" | "evidence" | "package" | "send") {
    setFieldFocusPane(pane);
    window.setTimeout(() => {
      document.querySelector(`[data-field-pane="${pane}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }

  function focusFieldMedia(kind?: FieldMediaKind) {
    if (kind) {
      setFieldMediaFlashKind(kind);
      window.setTimeout(() => {
        setFieldMediaFlashKind((current) => (current === kind ? "" : current));
      }, 2200);
    }

    window.setTimeout(() => {
      document.querySelector("[data-field-media-console]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function downloadStoredPacket(packet: FieldPacket) {
    const href = URL.createObjectURL(dataUrlToBlob(packet.dataUrl, packet.mimeType || "application/pdf"));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = packet.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 30000);
    showActionNotice(`Downloaded saved packet: ${packet.fileName}`);
  }

  function safeAttachmentName(name: string, fallback: string) {
    return String(name || fallback)
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || fallback;
  }

  function dataUrlToBlob(dataUrl: string, mimeType = "application/octet-stream") {
    const bytes = dataUrlToBytes(dataUrl);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: mimeType });
  }

  function dataUrlToFile(dataUrl: string, fileName: string, mimeType = "application/octet-stream") {
    return new File([dataUrlToBlob(dataUrl, mimeType)], safeAttachmentName(fileName, "attachment"), { type: mimeType });
  }

  function bytesToBlob(bytes: Uint8Array, mimeType = "application/octet-stream") {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: mimeType });
  }

  function bytesToFile(bytes: Uint8Array, fileName: string, mimeType = "application/octet-stream") {
    return new File([bytesToBlob(bytes, mimeType)], safeAttachmentName(fileName, "attachment"), { type: mimeType });
  }

  function zipPacketFileName(job: JobRecord, suffix = "complete-package") {
    const key = safePacketFilePart(jobKey(job), "OMO");
    const location = safePacketFilePart(displayLocation(job) || displayAddress(job) || (job as any).borough || "LOCATION", "LOCATION");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    return `${key}_${location}_${safePacketFilePart(suffix)}_${stamp}.zip`;
  }

  function mediaHasPackageBytes(media: FieldMedia) {
    const dataUrl = String(media.dataUrl || "");
    const commaIndex = dataUrl.indexOf(",");
    return dataUrl.startsWith("data:") && commaIndex > 0 && dataUrl.slice(commaIndex + 1).trim().length > 0;
  }

  function fullPackageManifestText(
    key: string,
    invoicePacket: FieldPacket,
    includedMedia: FieldMedia[],
    skippedMedia: FieldMedia[]
  ) {
    const lines = [
      "HPD COMPLETE PACKAGE",
      `OMO / WORK #: ${key}`,
      `Generated: ${new Date().toLocaleString("en-US")}`,
      "",
      "PDF",
      `- ${invoicePacket.fileName} (${packetSizeLabel(invoicePacket.size)})`,
      "",
      `MEDIA INCLUDED (${includedMedia.length})`,
      ...includedMedia.map((media, index) => {
        const label = media.mediaType === "video" ? "VIDEO" : "IMAGE";
        const stamp = media.mediaType === "video" ? (media.stamped === false ? "ORIGINAL VIDEO" : "STAMPED VIDEO") : "STAMPED IMAGE";
        return `- ${String(index + 1).padStart(2, "0")} ${label}: ${media.name || "unnamed"} | ${media.evidenceLabel || media.kind} | ${stamp} | ${packetSizeLabel(media.size)}`;
      }),
    ];

    if (skippedMedia.length) {
      lines.push(
        "",
        `MEDIA NOT INCLUDED (${skippedMedia.length})`,
        ...skippedMedia.map((media, index) => {
          const label = media.mediaType === "video" ? "VIDEO" : "IMAGE";
          return `- ${String(index + 1).padStart(2, "0")} ${label}: ${media.name || "unnamed"} had no original bytes saved in browser storage.`;
        })
      );
    }

    return lines.join("\n");
  }

  function mediaExtension(media: FieldMedia) {
    const fromName = String(media.name || "").match(/\.[a-z0-9]{2,5}$/i)?.[0];
    if (fromName) return fromName.toLowerCase();
    const type = String(media.type || "").toLowerCase();
    if (type.includes("quicktime")) return ".mov";
    if (type.includes("webm")) return ".webm";
    if (type.includes("3gpp")) return ".3gp";
    if (type.includes("mp4")) return ".mp4";
    if (type.includes("png")) return ".png";
    if (type.includes("webp")) return ".webp";
    if (type.includes("heic")) return ".heic";
    if (type.includes("heif")) return ".heif";
    return media.mediaType === "video" ? ".mp4" : ".jpg";
  }

  function fullPackageMediaPath(key: string, media: FieldMedia, index: number) {
    const mediaFolder = media.mediaType === "video" ? "videos" : "images";
    const folder = fieldEvidenceKindClass(media.kind || "general");
    const label = zipSafePart(media.evidenceLabel || fieldEvidenceLabel(media.kind || "general"), "evidence");
    const fallbackName = `${safePacketFilePart(key)}-${String(index + 1).padStart(2, "0")}-${folder}${mediaExtension(media)}`;
    const fileName = safeAttachmentName(media.name, fallbackName);
    return `${mediaFolder}/${folder}/${String(index + 1).padStart(2, "0")}-${label}-${fileName}`;
  }

  async function generateFullEvidencePackage(job: MappedJob) {
    const key = jobKey(job);
    if (!key) return;

    try {
      const invoicePacket = latestFieldPacket(job, "affidavit_invoice_pdf");
      if (!invoicePacket) {
        showActionNotice("Open paperwork and tap Generate Package to create the complete package.");
        window.open(paperworkHref(job, "package"), "_blank", "noopener,noreferrer");
        return;
      }

      const evidenceRows = await listFieldEvidence(key);
      if (!evidenceRows.length) {
        showActionNotice("No field media saved yet. Capture before/after photos or videos first.");
        focusFieldPane("capture");
        return;
      }

      const includedMedia = evidenceRows.filter(mediaHasPackageBytes);
      const skippedMedia = evidenceRows.filter((media) => !mediaHasPackageBytes(media));
      const skippedVideos = skippedMedia.filter((media) => media.mediaType === "video");
      if (skippedVideos.length) {
        showActionNotice(`${skippedVideos.length} saved video(s) had no original video bytes. Retake or re-upload the video, then Generate Package again.`);
        focusFieldPane("capture");
        return;
      }
      if (!includedMedia.length) {
        showActionNotice("No package-ready image or video bytes were found. Retake or upload evidence from the job card.");
        focusFieldPane("capture");
        return;
      }

      const workflowValue = String(job.WorkflowStatus || job.workflowStatus || job.FieldOutcome || job.fieldOutcome || "").toUpperCase();
      const needsFullBeforeAfter =
        workflowValue.includes("WORK_COMPLETED") ||
        workflowValue.includes("PARTIAL_WORK_COMPLETED");
      if (needsFullBeforeAfter) {
        const beforeImages = includedMedia.filter((media) => media.kind === "before" && media.mediaType === "image").length;
        const beforeVideos = includedMedia.filter((media) => media.kind === "before" && media.mediaType === "video").length;
        const afterImages = includedMedia.filter((media) => media.kind === "after" && media.mediaType === "image").length;
        const afterVideos = includedMedia.filter((media) => media.kind === "after" && media.mediaType === "video").length;
        const missing: string[] = [];
        if (beforeImages < FIELD_REQUIRED_PHOTOS) missing.push(`before photos ${beforeImages}/${FIELD_REQUIRED_PHOTOS}`);
        if (beforeVideos < FIELD_REQUIRED_VIDEOS) missing.push(`before videos ${beforeVideos}/${FIELD_REQUIRED_VIDEOS}`);
        if (afterImages < FIELD_REQUIRED_PHOTOS) missing.push(`after photos ${afterImages}/${FIELD_REQUIRED_PHOTOS}`);
        if (afterVideos < FIELD_REQUIRED_VIDEOS) missing.push(`after videos ${afterVideos}/${FIELD_REQUIRED_VIDEOS}`);
        if (missing.length) {
          showActionNotice(`Full package needs current evidence: ${missing.join(", ")}.`);
          focusFieldPane("capture");
          return;
        }
      }

      showActionNotice("Generating complete package...");
      const fileName = zipPacketFileName(job);
      const mediaManifest = includedMedia.map((media, index) => ({
        path: fullPackageMediaPath(key, media, index),
        media,
      }));
      const entries: ZipEntry[] = [];

      entries.push({
        path: `invoice-affidavit-package/${safeAttachmentName(invoicePacket.fileName, "affidavit-invoice.pdf")}`,
        bytes: dataUrlToBytes(invoicePacket.dataUrl),
      });
      entries.push({
        path: "PACKAGE-MANIFEST.txt",
        bytes: zipTextBytes(fullPackageManifestText(key, invoicePacket, includedMedia, skippedMedia)),
      });

      mediaManifest.forEach(({ path, media }) => {
        if (!media.dataUrl) return;
        entries.push({
          path,
          bytes: dataUrlToBytes(media.dataUrl),
        });
      });

      const zipBytes = buildStoredZip(entries);
      const imageCount = includedMedia.filter((media) => media.mediaType === "image").length;
      const videoCount = includedMedia.filter((media) => media.mediaType === "video").length;
      const beforeCount = includedMedia.filter((media) => media.kind === "before").length;
      const afterCount = includedMedia.filter((media) => media.kind === "after").length;
      const videoNames = includedMedia.filter((media) => media.mediaType === "video").map((media) => media.name || "Video evidence");
      let savedPacketId = "";
      let note = videoCount
        ? "Package ready for review. Video files are inside the videos folder."
        : "Package ready for review. No video files were found for this OMO.";

      if (zipBytes.byteLength <= FULL_PACKAGE_SAVE_LIMIT_BYTES) {
        try {
          await clearFieldPackets(key, ["full_evidence_zip"]);
          const savedPacket = await saveFieldPacket({
            jobId: key,
            fileName,
            mimeType: "application/zip",
            dataUrl: bytesToDataUrl(zipBytes, "application/zip"),
            size: zipBytes.byteLength,
            evidenceCount: includedMedia.length,
            imageCount,
            videoCount,
            packetType: "full_evidence_zip",
            note: "Complete package: invoice/affidavit PDF plus all saved images and videos.",
          });
          savedPacketId = savedPacket.id;
          setFieldPacketsByJob((current) => ({
            ...current,
            [key]: [
              savedPacket,
              ...(current[key] || []).filter((packet) => packet.packetType !== "full_evidence_zip"),
            ].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
          }));
          note = "Package saved on this phone. Review below, then tap Send Package.";
        } catch (error) {
          console.error(error);
          note = "Package ready for review. Browser storage could not save the ZIP, but Send Package can still share it now.";
        }
      } else {
        note = `Package ready for review. ZIP is ${packetSizeLabel(zipBytes.byteLength)}, so it is held for Send Package instead of duplicating it in phone storage.`;
      }

      const preview: FullPackagePreview = {
        jobKey: key,
        fileName,
        size: zipBytes.byteLength,
        evidenceCount: includedMedia.length,
        imageCount,
        videoCount,
        beforeCount,
        afterCount,
        hasInvoice: true,
        videoNames,
        skippedMediaCount: skippedMedia.length,
        generatedAt: new Date().toISOString(),
        savedPacketId: savedPacketId || undefined,
        note,
      };

      pendingFullPackageRef.current = { ...preview, bytes: zipBytes };
      setFullPackagePreview(preview);
      focusFieldPane("send");
      showActionNotice(`Package generated for review: ${beforeCount} before, ${afterCount} after, ${videoCount} video(s).`);
    } catch (error) {
      console.error(error);
      showActionNotice(error instanceof Error ? error.message : "Full package build failed. Try again.");
    }
  }

  async function shareFullPackageBytes(job: MappedJob, pendingPackage: PendingFullPackage) {
    const key = jobKey(job);
    const zipFile = bytesToFile(pendingPackage.bytes, pendingPackage.fileName, "application/zip");
    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare({ files: [zipFile] }));

    if (!canShareFiles) {
      showActionNotice("This browser cannot share ZIP files directly. Package is ready; use Chrome share on mobile.");
      return;
    }

    try {
      await navigator.share({
        title: `${key} HPD complete package`,
        text: `HPD complete package for ${key}: invoice/affidavit PDF plus ${pendingPackage.evidenceCount} original media file(s), including ${pendingPackage.videoCount} video(s).`,
        files: [zipFile],
      });
      showActionNotice(`Package shared: ${pendingPackage.evidenceCount} media file(s), ${pendingPackage.videoCount} video(s).`);
    } catch (error) {
      console.error(error);
      showActionNotice("Share was cancelled or blocked. Package is still ready for review.");
    }
  }

  async function sendFullEvidencePackage(job: MappedJob) {
    const key = jobKey(job);
    if (!key) return;

    const preview = fullPackagePreviewFor(job);
    if (!preview) {
      showActionNotice("Tap Generate Package first, review it, then send.");
      focusFieldPane("send");
      return;
    }

    const savedPacket = preview.savedPacketId
      ? fieldPacketRowsFor(job).find((packet) => packet.id === preview.savedPacketId)
      : latestFieldPacket(job, "full_evidence_zip");
    if (savedPacket) {
      await shareStoredPackage(job, savedPacket, false);
      return;
    }

    const pendingPackage = pendingFullPackageRef.current;
    if (pendingPackage?.jobKey === key && pendingPackage.fileName === preview.fileName) {
      await shareFullPackageBytes(job, pendingPackage);
      return;
    }

    showActionNotice("Package review expired. Tap Generate Package again, then Send Package.");
  }

  function packagePrimaryLabel(job: MappedJob) {
    return "Generate Package";
  }

  async function runPackagePrimaryAction(job: MappedJob) {
    showActionNotice("Opening package screen: Generate, Preview, Send.");
    window.open(paperworkHref(job, "package"), "_blank", "noopener,noreferrer");
  }

  async function shareStoredPackage(job: MappedJob, packet = latestFieldPacket(job, "affidavit_invoice_pdf") || latestFieldPacket(job), downloadFallback = true) {
    const key = jobKey(job);
    if (!key) return;

    if (!packet) {
      showActionNotice("Open paperwork and tap Generate Package to create the complete package.");
      window.open(paperworkHref(job, "package"), "_blank", "noopener,noreferrer");
      return;
    }

    const isMediaZip = String(packet.mimeType || "").includes("zip");
    const files = [
      dataUrlToFile(packet.dataUrl, packet.fileName, packet.mimeType || (isMediaZip ? "application/zip" : "application/pdf")),
    ];

    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare({ files }));

    if (canShareFiles) {
      try {
        await navigator.share({
          title: `${key} HPD ${fieldPacketLabel(packet).replace(" ZIP", "").toLowerCase()}`,
          text:
            packet.packetType === "video_package_zip"
              ? `HPD video package for ${key}. Videos only.`
              : packet.packetType === "application_package_zip"
                ? `HPD application package for ${key}. Invoice/affidavit PDF plus images.`
                : isMediaZip
                  ? `HPD complete package for ${key}. Includes saved evidence files.`
                  : `HPD invoice/affidavit package for ${key}. Generate Package creates the application and video packages.`,
          files,
        });
        showActionNotice(`Share sheet opened with ${files.length} attachment(s).`);
        return;
      } catch (error) {
        console.error(error);
        if (!downloadFallback) {
          showActionNotice("Share was cancelled or blocked. Package is still ready in preview.");
          return;
        }
        showActionNotice(`Share was cancelled or blocked. Downloading the ${isMediaZip ? "ZIP" : "PDF"} instead.`);
      }
    } else if (!downloadFallback) {
      showActionNotice("This browser cannot share this package directly. Package is still ready in preview.");
      return;
    }

    downloadStoredPacket(packet);
  }

  function safePacketFilePart(value: string, fallback = "packet") {
    const cleaned = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 54);
    return cleaned || fallback;
  }

  function fieldPhotoCountsFor(job: JobRecord) {
    const key = jobKey(job);
    const local = key ? fieldPhotoCounts[key] : null;
    const empty = emptyFieldMediaCounts();
    return {
      ...empty,
      ...(local || {}),
      before: Math.max(
        Number((job as any).BeforePhotoCount || (job as any).beforePhotoCount || 0) || 0,
        local?.before || 0
      ),
      after: Math.max(
        Number((job as any).AfterPhotoCount || (job as any).afterPhotoCount || 0) || 0,
        local?.after || 0
      ),
      no_access: Math.max(
        Number((job as any).NoAccessEvidenceCount || (job as any).noAccessEvidenceCount || 0) || 0,
        local?.no_access || 0
      ),
      refused_access: Math.max(
        Number((job as any).RefusedEvidenceCount || (job as any).refusedEvidenceCount || 0) || 0,
        local?.refused_access || 0
      ),
      completed_by_others: Math.max(
        Number((job as any).CompletedByOthersEvidenceCount || (job as any).completedByOthersEvidenceCount || 0) || 0,
        local?.completed_by_others || 0
      ),
      images: Math.max(Number((job as any).ImageEvidenceCount || (job as any).imageEvidenceCount || 0) || 0, local?.images || 0),
      videos: Math.max(Number((job as any).VideoEvidenceCount || (job as any).videoEvidenceCount || 0) || 0, local?.videos || 0),
      total: Math.max(Number((job as any).EvidenceMediaCount || (job as any).evidenceMediaCount || 0) || 0, local?.total || 0),
    };
  }

  function fieldElapsedLabel(job: JobRecord) {
    void countdownTick;
    const raw =
      (job as any).FieldTimerStartedAt ||
      (job as any).fieldTimerStartedAt ||
      (job as any).JobStartedAt ||
      (job as any).jobStartedAt ||
      "";
    const start = parseWorkflowDate(raw);
    if (!start) return "Not started";
    const minutes = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  function beginGuidedEvidenceCapture(job: MappedJob, kind: FieldMediaKind, options: { partial?: boolean } = {}) {
    const steps = guidedCaptureSteps(kind);
    const firstStep = steps[0];
    if (!firstStep) return;

    fieldCaptureJobRef.current = job;
    fieldCapturePartialRef.current = Boolean(options.partial);
    fieldCaptureQueueRef.current = steps.slice(1);
    setCaptureGuideForStep(job, firstStep);
    requestFieldPhotoCapture(job, kind, firstStep.accept, firstStep.camera, firstStep);
  }

  function setCaptureCompleteGuide(job: MappedJob, kind: FieldMediaKind, partial = false) {
    const key = jobKey(job);
    if (!key) return;

    const action =
      kind === "before"
        ? "start_work"
        : kind === "after"
          ? "finish_work"
          : "capture_only";
    const title =
      kind === "before"
        ? "Before Evidence Saved"
        : kind === "after"
          ? "After Evidence Saved"
          : `${fieldStageLabel(kind)} Evidence Saved`;
    const text =
      kind === "before"
        ? "Default before set saved. Add more angles if needed, or start the job timer now."
        : kind === "after"
          ? "Default after set saved. Add more angles if needed, or complete the job and generate the package."
          : "Evidence saved. Add more angles if needed.";

    setFieldFocusPane("capture");
    setFieldCaptureGuide({
      jobKey: key,
      kind,
      accept: "image/*,video/*",
      camera: true,
      title,
      text,
      label: title,
      complete: true,
      completeAction: action,
      partial,
    });
  }

  function advanceGuidedEvidenceCapture(target: { jobKey: string; kind: FieldMediaKind; step?: FieldCaptureStep }) {
    if (!target.step) return false;

    const nextStep = fieldCaptureQueueRef.current.shift();
    const captureJob = fieldCaptureJobRef.current;
    if (!captureJob || jobKey(captureJob) !== target.jobKey) {
      fieldCaptureQueueRef.current = [];
      fieldCaptureJobRef.current = null;
      setFieldCaptureGuide(null);
      return false;
    }

    if (!nextStep) {
      fieldCaptureQueueRef.current = [];
      return false;
    }

    setFieldFocusPane("capture");
    setCaptureGuideForStep(captureJob, nextStep);
    focusFieldMedia(target.kind);
    showActionNotice(`${target.step.title} captured. Opening ${nextStep.title}. If Chrome does not reopen, tap Take ${nextStep.step}/${nextStep.total}.`);
    requestFieldPhotoCapture(captureJob, nextStep.kind, nextStep.accept, nextStep.camera, nextStep);
    return true;
  }

  function captureExtraPhoto(job: MappedJob, kind: FieldMediaKind, partial = false) {
    const step = extraPhotoCaptureStep(job, kind);
    fieldCaptureQueueRef.current = [];
    fieldCaptureJobRef.current = job;
    fieldCapturePartialRef.current = partial;
    setCaptureGuideForStep(job, step);
    requestFieldPhotoCapture(job, kind, step.accept, step.camera, step);
  }

  function captureExtraVideo(job: MappedJob, kind: FieldMediaKind, partial = false) {
    const step = extraVideoCaptureStep(job, kind);
    fieldCaptureQueueRef.current = [];
    fieldCaptureJobRef.current = job;
    fieldCapturePartialRef.current = partial;
    setCaptureGuideForStep(job, step);
    requestFieldPhotoCapture(job, kind, step.accept, step.camera, step);
  }

  function requestFieldPhotoCapture(
    job: MappedJob,
    kind: FieldMediaKind,
    accept = "image/*,video/*",
    useCamera = true,
    step?: FieldCaptureStep,
    openDelayMs = 0
  ) {
    const key = jobKey(job);
    if (!key) return;
    if (!canStoreFieldPhotos()) {
      showActionNotice("Evidence storage is not available in this browser.");
      return;
    }

    setFieldCaptureAccept(accept);
    setFieldCaptureCamera(useCamera);
    setFieldCaptureMultiple(!useCamera);
    setFieldFocusPane("capture");
    const title = step?.title || fieldEvidenceLabel(kind);
    const text = step?.text || fieldCaptureGuideText(kind);
    const nextTarget = { jobKey: key, kind, meta: fieldEvidenceMeta(job, kind, step?.label), step };
    const nextTargetToken = fieldCaptureTargetToken(nextTarget);
    setFieldCaptureGuide({
      jobKey: key,
      kind,
      accept,
      camera: useCamera,
      title,
      text,
      label: step?.label,
      step: step?.step,
      total: step?.total,
    });
    photoCaptureTargetRef.current = nextTarget;
    setPhotoCaptureTarget(nextTarget);

    if (useCamera && canUseInlineCamera()) {
      void openInlineFieldCamera(nextTarget, accept);
      return;
    }

    const openInput = () => {
      const activeTarget = photoCaptureTargetRef.current;
      const activeToken = fieldCaptureTargetToken(activeTarget);
      if (activeToken !== nextTargetToken || !fieldPhotoInputRef.current) return;

      fieldPhotoInputRef.current.accept = accept;
      fieldPhotoInputRef.current.multiple = !useCamera;
      if (useCamera) {
        fieldPhotoInputRef.current.setAttribute("capture", "environment");
      } else {
        fieldPhotoInputRef.current.removeAttribute("capture");
      }
      fieldPhotoInputRef.current.value = "";
      fieldPhotoInputRef.current.click();
    };

    if (openDelayMs > 0 && typeof window !== "undefined") {
      window.setTimeout(openInput, openDelayMs);
    } else {
      openInput();
    }
  }

  async function saveCapturedFieldMedia(
    target: FieldCaptureTarget,
    capturedFiles: File[],
    hasNextCapture: boolean,
    deferCompleteGuide = false
  ) {
    try {
      const saved = await saveFieldPhotos(target.jobKey, target.kind, capturedFiles, target.meta);
      if (!saved.length) {
        showActionNotice("No supported image/video was saved. Try camera again or choose media from your phone gallery.");
        return false;
      }

      invalidateFullPackagePreview(target.jobKey);
      const counts = await countFieldPhotos(target.jobKey);
      const evidenceRows = await listFieldEvidence(target.jobKey);
      const capturedAt = new Date().toISOString();
      const patch: Record<string, any> = {
        EvidenceMediaCount: counts.total,
        evidenceMediaCount: counts.total,
        ImageEvidenceCount: counts.images,
        imageEvidenceCount: counts.images,
        VideoEvidenceCount: counts.videos,
        videoEvidenceCount: counts.videos,
        LastEvidenceCapturedAt: capturedAt,
        lastEvidenceCapturedAt: capturedAt,
        PhotoPackageStatus: `${fieldEvidenceLabel(target.kind)} staged on this device`,
        photoPackageStatus: `${fieldEvidenceLabel(target.kind)} staged on this device`,
      };

      if (target.kind === "before") {
        patch.BeforePhotoCount = counts.before;
        patch.beforePhotoCount = counts.before;
        patch.BeforePhotosCapturedAt = capturedAt;
        patch.beforePhotosCapturedAt = capturedAt;
      }

      if (target.kind === "after") {
        patch.AfterPhotoCount = counts.after;
        patch.afterPhotoCount = counts.after;
        patch.AfterPhotosCapturedAt = capturedAt;
        patch.afterPhotosCapturedAt = capturedAt;
      }

      if (target.kind === "no_access") {
        patch.NoAccessEvidenceCount = counts.no_access;
        patch.noAccessEvidenceCount = counts.no_access;
        patch.NoAccessEvidenceCapturedAt = capturedAt;
        patch.noAccessEvidenceCapturedAt = capturedAt;
      }

      if (target.kind === "refused_access") {
        patch.RefusedEvidenceCount = counts.refused_access;
        patch.refusedEvidenceCount = counts.refused_access;
        patch.RefusedEvidenceCapturedAt = capturedAt;
        patch.refusedEvidenceCapturedAt = capturedAt;
      }

      if (target.kind === "completed_by_others") {
        patch.CompletedByOthersEvidenceCount = counts.completed_by_others;
        patch.completedByOthersEvidenceCount = counts.completed_by_others;
        patch.CompletedByOthersEvidenceCapturedAt = capturedAt;
        patch.completedByOthersEvidenceCapturedAt = capturedAt;
      }

      setFieldPhotoCounts((current) => ({
        ...current,
        [target.jobKey]: counts,
      }));
      setFieldEvidenceByJob((current) => ({
        ...current,
        [target.jobKey]: fieldEvidenceCardRows(evidenceRows),
      }));
      workflowStorageSave(target.jobKey, { ...patch, updatedAt: capturedAt });
      applyWorkflowPatchToState(target.jobKey, { ...patch, updatedAt: capturedAt });
      workflowServerSave(target.jobKey, { ...patch, updatedAt: capturedAt }).catch((error) => {
        console.error(error);
      });
      const videoCount = saved.filter((item) => item.mediaType === "video").length;
      const imageCount = saved.length - videoCount;
      const unstampedVideoCount = saved.filter((item) => item.mediaType === "video" && item.stamped === false).length;
      const fallbackVideoNote = unstampedVideoCount
        ? ` ${unstampedVideoCount} video(s) were saved as original files because this phone could not burn the label into them.`
        : "";
      if (!hasNextCapture && !deferCompleteGuide) {
        const captureJob =
          fieldCaptureJobRef.current ||
          (selected && jobKey(selected) === target.jobKey ? (selected as MappedJob) : null);
        if (captureJob) {
          setCaptureCompleteGuide(captureJob, target.kind, fieldCapturePartialRef.current);
        } else {
          setFieldCaptureGuide(null);
          setFieldFocusPane("evidence");
        }
        focusFieldMedia(target.kind);
        showActionNotice(
          target.step
            ? `${fieldEvidenceLabel(target.kind)} required set saved.${fallbackVideoNote} Add more, or tap done to continue.`
            : `${fieldEvidenceLabel(target.kind)} saved to job card: ${imageCount} image(s), ${videoCount} video(s).${fallbackVideoNote}`
        );
      }
      return true;
    } catch (error) {
      console.error(error);
      showActionNotice(error instanceof Error ? error.message : "Evidence save failed. Try again.");
      return false;
    }
  }

  function showInlineCaptureComplete(target: FieldCaptureTarget) {
    const captureJob =
      fieldCaptureJobRef.current ||
      (selected && jobKey(selected) === target.jobKey ? (selected as MappedJob) : null);
    if (captureJob) {
      setCaptureCompleteGuide(captureJob, target.kind, fieldCapturePartialRef.current);
    } else {
      setFieldCaptureGuide(null);
      setFieldFocusPane("evidence");
    }
    focusFieldMedia(target.kind);
    showActionNotice(`${fieldEvidenceLabel(target.kind)} required set saved. Add more, or tap done to continue.`);
  }

  async function saveInlineCameraFile(target: FieldCaptureTarget, file: File) {
    const saved = await saveCapturedFieldMedia(target, [file], false, true);
    if (!saved) return false;

    const hasNextCapture = advanceGuidedEvidenceCapture(target);
    if (!hasNextCapture) {
      showInlineCaptureComplete(target);
      closeInlineFieldCamera();
    } else {
      setFieldCameraStatus("Saved. Next camera step ready.");
    }
    return true;
  }

  async function handleFieldPhotoInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    const target = photoCaptureTargetRef.current || photoCaptureTarget;
    const capturedFiles = files ? Array.from(files) : [];
    if (!capturedFiles.length || !target) return;

    event.target.value = "";
    const targetToken = fieldCaptureTargetToken(target);
    const hasNextCapture = advanceGuidedEvidenceCapture(target);

    try {
      await saveCapturedFieldMedia(target, capturedFiles, hasNextCapture);
    } finally {
      const activeTarget = photoCaptureTargetRef.current;
      const activeToken = fieldCaptureTargetToken(activeTarget);
      if (activeToken === targetToken) {
        photoCaptureTargetRef.current = null;
        setPhotoCaptureTarget(null);
      }
    }
  }

  async function captureInlineCameraPhoto() {
    const session = fieldCameraSession;
    if (!session || fieldCameraBusy) return;

    setFieldCameraBusy(true);
    setFieldCameraStatus("Camera waking up...");
    try {
      const video = await waitForInlineCameraVideoReady();
      const width = video?.videoWidth || 0;
      const height = video?.videoHeight || 0;
      if (!video || !width || !height || video.readyState < 2) {
        showActionNotice("Android camera preview is not ready. Tap the preview once, then Capture Photo.");
        setFieldCameraStatus("Tap the preview once, then Capture Photo.");
        return;
      }

      setFieldCameraStatus("Saving photo...");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture camera frame.");
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not create photo file.");

      const file = new File([blob], fieldCameraFileName(session.target, "jpg"), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      await saveInlineCameraFile(session.target, file);
    } catch (error) {
      console.error(error);
      showActionNotice(error instanceof Error ? error.message : "Photo capture failed. Try again.");
      setFieldCameraStatus("Photo capture failed. Try again.");
    } finally {
      setFieldCameraBusy(false);
    }
  }

  function startInlineCameraVideoRecording() {
    const session = fieldCameraSession;
    const stream = fieldCameraStreamRef.current;
    if (!session || !stream || fieldCameraBusy || fieldCameraRecording) return;
    if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
      setFieldCameraStatus("Android camera paused. Reopening camera...");
      void openInlineFieldCamera(session.target, session.mode === "video" ? "video/*" : "image/*");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      showActionNotice("Video recording is not supported in this browser. Use Gallery for video.");
      return;
    }

    const mimeType = preferredRecordingMimeType();
    fieldCameraChunksRef.current = [];
    fieldCameraRecordingTargetRef.current = session.target;
    try {
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      fieldCameraRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) fieldCameraChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishInlineCameraVideoRecording(recorder.mimeType || mimeType || "video/webm");
      };
      recorder.start(500);
      setFieldCameraRecording(true);
      setFieldCameraStatus("Recording video...");
    } catch (error) {
      console.error(error);
      showActionNotice(error instanceof Error ? error.message : "Video recording could not start.");
      fieldCameraRecordingTargetRef.current = null;
      fieldCameraChunksRef.current = [];
    }
  }

  function stopInlineCameraVideoRecording() {
    const recorder = fieldCameraRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setFieldCameraBusy(true);
    setFieldCameraStatus("Saving video...");
    try {
      recorder.requestData();
    } catch {}
    window.setTimeout(() => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch (error) {
        console.error(error);
        setFieldCameraBusy(false);
        setFieldCameraStatus("Video stop failed. Try again.");
      }
    }, 450);
  }

  async function finishInlineCameraVideoRecording(mimeType: string) {
    const target = fieldCameraRecordingTargetRef.current;
    const chunks = fieldCameraChunksRef.current;
    fieldCameraRecorderRef.current = null;
    fieldCameraRecordingTargetRef.current = null;
    fieldCameraChunksRef.current = [];
    setFieldCameraRecording(false);

    if (!target || !chunks.length) {
      setFieldCameraBusy(false);
      setFieldCameraStatus("No video was recorded. Try again.");
      return;
    }

    try {
      const type = mimeType || chunks[0]?.type || "video/webm";
      const blob = new Blob(chunks, { type });
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], fieldCameraFileName(target, extension), {
        type,
        lastModified: Date.now(),
      });
      await saveInlineCameraFile(target, file);
    } catch (error) {
      console.error(error);
      showActionNotice(error instanceof Error ? error.message : "Video save failed. Try again.");
      setFieldCameraStatus("Video save failed. Try again.");
    } finally {
      setFieldCameraBusy(false);
    }
  }

  function clearGuidedCaptureState() {
    setFieldCaptureGuide(null);
    fieldCaptureQueueRef.current = [];
    fieldCaptureJobRef.current = null;
    fieldCapturePartialRef.current = false;
    photoCaptureTargetRef.current = null;
    setPhotoCaptureTarget(null);
  }

  function completeBeforeEvidenceAndStartWork(job: MappedJob) {
    const iso = new Date().toISOString();
    const patch = {
      WorkflowStatus: "WORK_STARTED",
      workflowStatus: "WORK_STARTED",
      FieldOutcome: "WORK_STARTED",
      fieldOutcome: "WORK_STARTED",
      StatusOverride: "Work Started",
      status: "Work Started",
      JobStartedAt: iso,
      jobStartedAt: iso,
      FieldTimerStartedAt: iso,
      fieldTimerStartedAt: iso,
      ActualWorkStartDate: iso,
      actualWorkStartDate: iso,
      BeforePhotosRequestedAt: iso,
      beforePhotosRequestedAt: iso,
      ArchivedFromMap: false,
    };
    setFieldFocusPane("capture");
    setSelectedOnly(true);
    setDrawerOpen(true);
    setFullMap(false);
    clearGuidedCaptureState();
    saveFieldWorkflowPatch(
      job,
      patch,
      "Before evidence done. Job timer started."
    );
  }

  function startFieldJob(job: MappedJob) {
    const iso = new Date().toISOString();
    const patch = {
      WorkflowStatus: "BEFORE_EVIDENCE",
      workflowStatus: "BEFORE_EVIDENCE",
      FieldOutcome: "BEFORE_EVIDENCE",
      fieldOutcome: "BEFORE_EVIDENCE",
      StatusOverride: "Before Evidence",
      status: "Before Evidence",
      BeforePhotosRequestedAt: iso,
      beforePhotosRequestedAt: iso,
      ArchivedFromMap: false,
    };
    const captureJob = { ...job, ...patch } as MappedJob;
    setFieldFocusPane("capture");
    setSelectedOnly(true);
    setDrawerOpen(true);
    setFullMap(false);
    saveFieldWorkflowPatch(
      job,
      patch,
      "Start job: capture 2 before photos and 2 before videos."
    );
    beginGuidedEvidenceCapture(captureJob, "before");
  }

  async function resetFieldJobForTesting(job: MappedJob) {
    const key = jobKey(job);
    if (!key) return;
    const confirmed = window.confirm("Reset this job to Pending and clear saved test evidence on this phone?");
    if (!confirmed) return;

    const resetPatch = clearedFieldWorkflowStatePatch();
    setFieldCaptureGuide(null);
    setFieldFocusPane("capture");
    fieldCaptureQueueRef.current = [];
    fieldCaptureJobRef.current = null;
    fieldCapturePartialRef.current = false;
    photoCaptureTargetRef.current = null;
    setPhotoCaptureTarget(null);
    setDraftWorkflowStatus("");
    setDraftWorkflowDate("");
    setDraftWorkflowSaved(false);
    setFieldPhotoCounts((current) => ({ ...current, [key]: emptyFieldMediaCounts() }));
    setFieldEvidenceByJob((current) => ({ ...current, [key]: [] }));
    workflowStorageSave(key, { __clearWorkflow: true });
    applyWorkflowPatchToState(key, resetPatch);

    try {
      const clearedPackets = await invalidateFullPackagePreview(key, true);
      const cleared = canStoreFieldPhotos() ? await clearFieldEvidence(key) : 0;
      await workflowServerSave(key, { __clearWorkflow: true, updatedAt: resetPatch.updatedAt });
      showActionNotice(`Job reset to Pending. Cleared ${cleared} evidence file(s) and ${clearedPackets || 0} packet(s).`);
    } catch (error) {
      console.error(error);
      showActionNotice("Reset on this phone. Server sync needs retry.");
    }
  }

  function completeAfterEvidenceAndFinishJob(job: MappedJob, partial = false) {
    const iso = new Date().toISOString();
    const patch = {
      WorkflowStatus: partial ? "PARTIAL_WORK_COMPLETED" : "WORK_COMPLETED",
      workflowStatus: partial ? "PARTIAL_WORK_COMPLETED" : "WORK_COMPLETED",
      FieldOutcome: partial ? "PARTIAL_WORK_COMPLETED" : "WORK_COMPLETED",
      fieldOutcome: partial ? "PARTIAL_WORK_COMPLETED" : "WORK_COMPLETED",
      StatusOverride: partial ? "Partial Work Completed" : "Work Completed",
      status: partial ? "Partial Work Completed" : "Work Completed",
      JobFinishedAt: iso,
      jobFinishedAt: iso,
      ActualWorkCompletionDate: iso,
      actualWorkCompletionDate: iso,
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
      AfterPhotosRequestedAt: iso,
      afterPhotosRequestedAt: iso,
      ArchivedFromMap: false,
    };
    setFieldFocusPane("package");
    clearGuidedCaptureState();
    saveFieldWorkflowPatch(
      job,
      patch,
      partial ? "After evidence done. Partial work completed." : "After evidence done. Work completed."
    );
    openPaperworkPreviewForStatus(job, patch, false);
  }

  function finishFieldJob(job: MappedJob, partial = false) {
    const iso = new Date().toISOString();
    const patch = {
      WorkflowStatus: "AFTER_EVIDENCE",
      workflowStatus: "AFTER_EVIDENCE",
      FieldOutcome: "AFTER_EVIDENCE",
      fieldOutcome: "AFTER_EVIDENCE",
      StatusOverride: partial ? "After Evidence - Partial" : "After Evidence",
      status: partial ? "After Evidence - Partial" : "After Evidence",
      PendingCompletionOutcome: partial ? "PARTIAL_WORK_COMPLETED" : "WORK_COMPLETED",
      pendingCompletionOutcome: partial ? "PARTIAL_WORK_COMPLETED" : "WORK_COMPLETED",
      AfterPhotosRequestedAt: iso,
      afterPhotosRequestedAt: iso,
      ArchivedFromMap: false,
    };
    const captureJob = { ...job, ...patch } as MappedJob;
    setFieldFocusPane("capture");
    setSelectedOnly(true);
    setDrawerOpen(true);
    setFullMap(false);
    saveFieldWorkflowPatch(
      job,
      patch,
      partial
        ? "Partial finish: capture 2 after photos and 2 after videos."
        : "Finish job: capture 2 after photos and 2 after videos."
    );
    beginGuidedEvidenceCapture(captureJob, "after", { partial });
  }

  function startNoAccessCounter(job: MappedJob) {
    const when = new Date();
    const iso = when.toISOString();
    const available = new Date(when);
    available.setHours(available.getHours() + 72);
    const patch = {
      WorkflowStatus: "NO_ACCESS_1_WAITING_72H",
      workflowStatus: "NO_ACCESS_1_WAITING_72H",
      FieldOutcome: "NO_ACCESS_1_WAITING_72H",
      fieldOutcome: "NO_ACCESS_1_WAITING_72H",
      StatusOverride: "No Access 1st - Waiting 72h",
      status: "No Access 1st - Waiting 72h",
      NoAccessFirstAttemptAt: iso,
      noAccessFirstAttemptAt: iso,
      SecondAttemptAvailableAt: available.toISOString(),
      secondAttemptAvailableAt: available.toISOString(),
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
      ArchivedFromMap: false,
    };
    const nextJob = { ...job, ...patch } as MappedJob;

    saveFieldWorkflowPatch(
      job,
      patch,
      "No access saved. 72-hour revisit counter started. Capture evidence now."
    );
    setWorkflowViewFilter("waiting72");
    openPaperworkPreviewForStatus(job, patch, false);
    requestFieldPhotoCapture(nextJob, "no_access", "image/*,video/*");
  }

  function markNoAccessSecondAttempt(job: MappedJob) {
    const iso = new Date().toISOString();
    const existingFirstAttempt = job.NoAccessFirstAttemptAt || job.noAccessFirstAttemptAt || "";
    const existingSecondAvailable = job.SecondAttemptAvailableAt || job.secondAttemptAvailableAt || "";
    const patch = {
      WorkflowStatus: "NO_ACCESS_COMPLETE",
      workflowStatus: "NO_ACCESS_COMPLETE",
      FieldOutcome: "NO_ACCESS_COMPLETE",
      fieldOutcome: "NO_ACCESS_COMPLETE",
      StatusOverride: "No Access Complete",
      status: "No Access Complete",
      NoAccessFirstAttemptAt: existingFirstAttempt,
      noAccessFirstAttemptAt: existingFirstAttempt,
      SecondAttemptAvailableAt: existingSecondAvailable,
      secondAttemptAvailableAt: existingSecondAvailable,
      NoAccessSecondAttemptAt: iso,
      noAccessSecondAttemptAt: iso,
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
      ArchivedFromMap: false,
    };
    const nextJob = { ...job, ...patch } as MappedJob;
    saveFieldWorkflowPatch(job, patch, "No access second attempt saved. Capture evidence now.");
    openPaperworkPreviewForStatus(job, patch, false);
    requestFieldPhotoCapture(nextJob, "no_access", "image/*,video/*");
  }

  function markRefusedAccess(job: MappedJob) {
    const iso = new Date().toISOString();
    const patch = {
      WorkflowStatus: "REFUSED_ACCESS",
      workflowStatus: "REFUSED_ACCESS",
      FieldOutcome: "REFUSED_ACCESS",
      fieldOutcome: "REFUSED_ACCESS",
      StatusOverride: "Refused Access",
      status: "Refused Access",
      RefusalDate: iso,
      refusalDate: iso,
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
      ArchivedFromMap: false,
    };
    const nextJob = { ...job, ...patch } as MappedJob;
    saveFieldWorkflowPatch(
      job,
      patch,
      "Refused access saved. Capture evidence now."
    );
    openPaperworkPreviewForStatus(job, patch, false);
    requestFieldPhotoCapture(nextJob, "refused_access", "image/*,video/*");
  }

  function markCompletedByOthers(job: MappedJob) {
    const iso = new Date().toISOString();
    const patch = {
      WorkflowStatus: "COMPLETED_BY_OTHERS",
      workflowStatus: "COMPLETED_BY_OTHERS",
      FieldOutcome: "COMPLETED_BY_OTHERS",
      fieldOutcome: "COMPLETED_BY_OTHERS",
      StatusOverride: "Completed by Others",
      status: "Completed by Others",
      VerifiedByOthersDate: iso,
      verifiedByOthersDate: iso,
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
      ArchivedFromMap: false,
    };
    const nextJob = { ...job, ...patch } as MappedJob;
    saveFieldWorkflowPatch(
      job,
      patch,
      "Completed by others saved. Capture evidence now."
    );
    openPaperworkPreviewForStatus(job, patch, false);
    requestFieldPhotoCapture(nextJob, "completed_by_others", "image/*,video/*");
  }

  function startLocationTracking() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("Location unavailable");
      showActionNotice("Location is not available in this browser.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCATION_ALWAYS_STORAGE_KEY, "on");
    }
    locationOverviewFitRef.current = false;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    };

    const onPosition = (position: GeolocationPosition) => {
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: new Date().toISOString(),
      });
      setLocationStatus(`Live guide · ±${Math.round((position.coords.accuracy || 0) * 3.28084)} ft`);
    };

    const onError = (error: GeolocationPositionError) => {
      console.error(error);
      if (error.code === error.PERMISSION_DENIED) {
        setLocationStatus("Location blocked in Chrome");
        showActionNotice("Chrome blocked location. Open site settings for this page and set Location to Allow.");
        return;
      }
      if (error.code === error.TIMEOUT) {
        setLocationStatus("Location searching...");
        showActionNotice("Still looking for GPS. Keep Chrome open and make sure phone location is on.");
        return;
      }
      setLocationStatus("Location unavailable");
      showActionNotice("Phone location is unavailable right now. Check Chrome and device location settings.");
    };

    setFollowMyLocation(true);
    setLocationStatus("Live location starting...");
    navigator.geolocation.getCurrentPosition(onPosition, onError, options);
    if (geolocationWatchRef.current === null) {
      geolocationWatchRef.current = navigator.geolocation.watchPosition(onPosition, onError, options);
    }
  }

  function sendJobToArchive(job: MappedJob) {
    const key = jobKey(job);
    if (!key) return;

    const patch = {
      ArchivedFromMap: true,
      archivedFromMap: true,
      updatedAt: new Date().toISOString(),
    };

    workflowStorageSave(key, patch);
    workflowServerSave(key, patch)
      .then(() => {
        setDraftWorkflowSaved(true);
        setWorkflowViewFilter("archived");
        showActionNotice("Archived ✓ Moved to Archived view.");
        setSelected((current) =>
          current && jobKey(current) === key
            ? ({ ...current, ...patch } as MappedJob)
            : current
        );
        setJobs((current) =>
          current.map((item) =>
            jobKey(item) === key ? ({ ...item, ...patch } as MappedJob) : item
          )
        );
      })
      .catch((error) => {
        console.error(error);
        alert("Archive save failed. Check connection and try again.");
      });
  }
function localDatetimeValue(date = new Date()) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function isoFromLocalDatetime(value: string) {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function pickDraftWorkflow(status: string) {
    setDraftWorkflowStatus(status);
    setDraftWorkflowDate(localDatetimeValue());
    setDraftWorkflowSaved(false);
  }

  function saveDraftWorkflow(job: MappedJob) {
    if (!draftWorkflowStatus) {
      alert("Select a status first.");
      return;
    }

    const when = new Date(isoFromLocalDatetime(draftWorkflowDate));
    const iso = when.toISOString();
    const available = new Date(when);
    available.setHours(available.getHours() + 72);

    let nextStatus = draftWorkflowStatus;
    let patch: Record<string, any> = {
      StatusOverride: nextStatus,
      status: nextStatus || "Pending",
      ITBMatchStatus: nextStatus || job.ITBMatchStatus,
    };

    if (draftWorkflowStatus === "No Access - 1st Attempt") {
      patch = {
        ...patch,
        WorkflowStatus: "NO_ACCESS_1_WAITING_72H",
        workflowStatus: "NO_ACCESS_1_WAITING_72H",
        FieldOutcome: "NO_ACCESS_1_WAITING_72H",
        fieldOutcome: "NO_ACCESS_1_WAITING_72H",
        StatusOverride: "No Access 1st - Waiting 72h",
        status: "No Access 1st - Waiting 72h",
        NoAccessFirstAttemptAt: iso,
        noAccessFirstAttemptAt: iso,
        SecondAttemptAvailableAt: available.toISOString(),
        secondAttemptAvailableAt: available.toISOString(),
        ArchivedFromMap: false,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }

    if (draftWorkflowStatus === "No Access - 2nd Attempt") {
      const existingFirstAttempt = job.NoAccessFirstAttemptAt || job.noAccessFirstAttemptAt || "";
      const existingSecondAvailable = job.SecondAttemptAvailableAt || job.secondAttemptAvailableAt || "";
      patch = {
        ...patch,
        WorkflowStatus: "NO_ACCESS_COMPLETE",
        workflowStatus: "NO_ACCESS_COMPLETE",
        FieldOutcome: "NO_ACCESS_COMPLETE",
        fieldOutcome: "NO_ACCESS_COMPLETE",
        StatusOverride: "No Access Complete",
        status: "No Access Complete",
        NoAccessFirstAttemptAt: existingFirstAttempt,
        noAccessFirstAttemptAt: existingFirstAttempt,
        SecondAttemptAvailableAt: existingSecondAvailable,
        secondAttemptAvailableAt: existingSecondAvailable,
        NoAccessSecondAttemptAt: iso,
        noAccessSecondAttemptAt: iso,
        ArchivedFromMap: false,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }

    if (draftWorkflowStatus === "Refused Access") {
      patch = {
        ...patch,
        WorkflowStatus: "REFUSED_ACCESS",
        workflowStatus: "REFUSED_ACCESS",
        FieldOutcome: "REFUSED_ACCESS",
        fieldOutcome: "REFUSED_ACCESS",
        RefusalDate: iso,
        refusalDate: iso,
        ArchivedFromMap: false,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }

    if (draftWorkflowStatus === "Completed by Others") {
      patch = {
        ...patch,
        WorkflowStatus: "COMPLETED_BY_OTHERS",
        workflowStatus: "COMPLETED_BY_OTHERS",
        FieldOutcome: "COMPLETED_BY_OTHERS",
        fieldOutcome: "COMPLETED_BY_OTHERS",
        VerifiedByOthersDate: iso,
        verifiedByOthersDate: iso,
        ArchivedFromMap: false,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }

    if (draftWorkflowStatus === "Work Completed") {
      patch = {
        ...patch,
        WorkflowStatus: "WORK_COMPLETED",
        workflowStatus: "WORK_COMPLETED",
        FieldOutcome: "WORK_COMPLETED",
        fieldOutcome: "WORK_COMPLETED",
        ActualWorkCompletionDate: iso,
        actualWorkCompletionDate: iso,
        ArchivedFromMap: false,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }

    if (draftWorkflowStatus === "Partial Work Completed") {
      patch = {
        ...patch,
        WorkflowStatus: "PARTIAL_WORK_COMPLETED",
        workflowStatus: "PARTIAL_WORK_COMPLETED",
        FieldOutcome: "PARTIAL_WORK_COMPLETED",
        fieldOutcome: "PARTIAL_WORK_COMPLETED",
        StatusOverride: "Partial Work Completed",
        status: "Partial Work Completed",
        ActualWorkCompletionDate: iso,
        actualWorkCompletionDate: iso,
        ArchivedFromMap: false,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }
    const key = jobKey(job);

    if (key) {
      workflowStorageSave(key, patch);
      invalidateFullPackagePreview(key, true);
      workflowServerSave(key, patch)
        .then(() => {
          setDraftWorkflowSaved(true);
          showActionNotice("Saved ✓ Status synced to CSV + Google Drive.");
        })
        .catch((error) => {
          console.error(error);
          alert("Saved on this device, but server save failed.");
        });
    }

    const applyPatch = (row: any) => {
      if (jobKey(row) !== key) return row;
      return { ...row, ...patch };
    };

    setSelected((current) => (current && jobKey(current) === key ? applyPatch(current) as MappedJob : current));
    setJobs((rows) => rows.map(applyPatch));
    setMappedJobs((rows) => rows.map(applyPatch));
    openPaperworkPreviewForStatus(job, patch);
  }

function workflowLabel(job: JobRecord) {
  const status = workflowStatus(job);

  const labels: Record<string, string> = {
    EN_ROUTE: "En Route",
    VISIT_STARTED: "Visit Started",
    NO_ACCESS_1_WAITING_72H: "No Access 1st - Waiting 72h",
    READY_SECOND_ATTEMPT: "Ready 2nd Attempt",
    NO_ACCESS_COMPLETE: "No Access Complete",
    REFUSED_ACCESS: "Refused Access",
    COMPLETED_BY_OTHERS: "Completed by Others",
    BEFORE_EVIDENCE: "Before Evidence",
    AFTER_EVIDENCE: "After Evidence",
    WORK_STARTED: "Work Started",
    WORK_COMPLETED: "Work Completed",
    PARTIAL_WORK_COMPLETED: "Partial Work Completed",
    PACKAGE_REVIEW: "Package Review",
    SENT_TO_REVIEWER: "Sent to Reviewer",
    APPROVED_BY_YOU: "Approved",
    SENT_TO_HPD: "Sent to HPD",
    ARCHIVED: "Archived",
  };

  return labels[status] || "";
}

function isClosedWorkflow(job: JobRecord) {
  return CLOSED_WORKFLOW_STATUSES.has(workflowStatus(job));
}

function parseWorkflowDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseJobDate(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/-/g, "/");
  const parts = normalized.split("/").map((part) => part.trim());
  if (parts.length >= 3) {
    let month = Number(parts[0]);
    let day = Number(parts[1]);
    let year = Number(parts[2]);
    if (year < 100) year += 2000;
    if (Number.isFinite(month) && Number.isFinite(day) && Number.isFinite(year)) {
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function daysBetween(from: Date, to: Date) {
  const ms = dateOnly(to).getTime() - dateOnly(from).getTime();
  return Math.round(ms / 86400000);
}
function shortJobDate(value?: string) {
  const date = parseJobDate(value);
  if (!date) return value || "Not listed";
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}
function markerWorkWindowLabel(job: JobRecord) {
  const info = workWindowInfo(job);
  const text = String(info.statusLabel || "").toLowerCase();
  if (text.includes("overdue by")) {
    const match = info.statusLabel.match(/overdue by\s+(\d+)/i);
    return match ? `OD ${match[1]}d` : "OVERDUE";
  }
  if (text.includes("due today")) return "DUE TODAY";
  if (text.includes("due in")) {
    const match = info.statusLabel.match(/due in\s+(\d+)/i);
    return match ? `Due ${match[1]}d` : "DUE";
  }
  if (text.includes("starts today")) return "START TODAY";
  if (text.includes("starts in")) {
    const match = info.statusLabel.match(/starts in\s+(\d+)/i);
    return match ? `Start ${match[1]}d` : "START";
  }
  if (text.includes("started")) {
    const match = info.statusLabel.match(/started\s+(\d+)/i);
    return match ? `Started ${match[1]}d` : "STARTED";
  }
  return "";
}
function markerWorkWindowClass(job: JobRecord) {
  const statusClass = workWindowInfo(job).statusClass;
  if (statusClass === "danger") return "marker-work-danger";
  if (statusClass === "warning") return "marker-work-warning";
  if (statusClass === "ok") return "marker-work-ok";
  return "marker-work-neutral";
}
function nextActionInfo(job: JobRecord | null | undefined) {
  if (!job) {
    return {
      label: "Select a job",
      detail: "Open a job to see the next field action.",
      tone: "neutral",
    };
  }
  const work = workWindowInfo(job);
  const desc = displayDescription(job);
  const workflow = workflowLabel(job);
  const second = workflowSecondAttemptInfo(job);
  if (workflow && /completed|done/i.test(workflow)) {
    return {
      label: "Work marked complete",
      detail: "Review photos, affidavit, and invoice package.",
      tone: "ok",
    };
  }
  if (second?.ready) {
    return {
      label: "2nd attempt ready",
      detail: "72-hour no-access counter matured. Schedule revisit now.",
      tone: "danger",
    };
  }
  if (work.statusLabel.toLowerCase().includes("overdue")) {
    return {
      label: work.statusLabel,
      detail: "Complete the job, mark no access, refused access, or document the field issue.",
      tone: "danger",
    };
  }
  if (work.statusLabel.toLowerCase().includes("due today")) {
    return {
      label: "Due today",
      detail: "Prioritize this job today or document access/status.",
      tone: "warning",
    };
  }
  if (work.statusLabel.toLowerCase().includes("due in")) {
    return {
      label: work.statusLabel,
      detail: "Work window is active. Track completion before deadline.",
      tone: "ok",
    };
  }
  if (work.startLabel.toLowerCase().includes("starts in")) {
    return {
      label: work.startLabel,
      detail: "Prepare crew, materials, access, and route.",
      tone: "neutral",
    };
  }
  if (!desc) {
    return {
      label: "Description missing",
      detail: "Description should be recovered before field work.",
      tone: "danger",
    };
  }
  return {
    label: "Review job",
    detail: "Check scope, dates, access, and status before dispatch.",
    tone: "neutral",
  };
}
function timelineDateLabel(value?: string) {
  const parsed = parseJobDate(value);
  if (!parsed) return value || "—";
  return parsed.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}
function timelineMaturityLabel(job: JobRecord | null | undefined) {
  if (!job) return "—";
  const raw = (job as any).AwardDate || (job as any).awardDate || "";
  const date = parseJobDate(raw);
  if (!date) return "—";
  const today = dateOnly(new Date());
  const diff = daysBetween(date, today);
  return diff >= 0 ? `MD ${diff}d` : "Future";
}
function timelineOverdueLabel(job: JobRecord | null | undefined) {
  if (!job) return "—";
  const raw =
    (job as any).WorkCompletionDate ||
    (job as any).workCompletionDate ||
    "";
  const date = parseJobDate(raw);
  if (!date) return "—";
  const today = dateOnly(new Date());
  const diff = daysBetween(date, today);
  if (diff > 180) return "Check date";
  if (diff > 0) return `OD ${diff}d`;
  if (diff === 0) return "Due today";
  return `Due ${Math.abs(diff)}d`;
}
function workWindowInfo(job: JobRecord) {
  const startRaw = (job as any).WorkStartDate || (job as any).workStartDate || (job as any)["Work Start Date"] || "";
  const endRaw =
    (job as any).WorkCompletionDate ||
    (job as any).workCompletionDate ||
    (job as any)["Work Completion Date"] ||
    "";
  const start = parseJobDate(startRaw);
  const end = parseJobDate(endRaw);
  const today = dateOnly(new Date());
  let startLabel = "Start not listed";
  let endLabel = "End not listed";
  let statusLabel = "Work window not listed";
  let statusClass = "neutral";
  if (start) {
    const startDiff = daysBetween(today, start);
    if (startDiff > 0) startLabel = `Starts in ${startDiff} day${startDiff === 1 ? "" : "s"}`;
    else if (startDiff === 0) startLabel = "Starts today";
    else startLabel = `Started ${Math.abs(startDiff)} day${Math.abs(startDiff) === 1 ? "" : "s"} ago`;
  }
  if (end) {
    const endDiff = daysBetween(today, end);
    if (endDiff > 0) {
      endLabel = `Due in ${endDiff} day${endDiff === 1 ? "" : "s"}`;
      statusLabel = endLabel;
      statusClass = endDiff <= 2 ? "warning" : "ok";
    } else if (endDiff === 0) {
      endLabel = "Due today";
      statusLabel = "Due today";
      statusClass = "warning";
    } else {
      endLabel = `Overdue by ${Math.abs(endDiff)} day${Math.abs(endDiff) === 1 ? "" : "s"}`;
      statusLabel = endLabel;
      statusClass = "danger";
    }
  } else if (start) {
    statusLabel = startLabel;
    statusClass = "neutral";
  }
  return {
    startRaw,
    endRaw,
    startDate: shortJobDate(startRaw),
    endDate: shortJobDate(endRaw),
    startLabel,
    endLabel,
    statusLabel,
    statusClass,
  };
}
function displayWorkflowDate(value?: string) {
  if (!value) return "Not listed";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not listed";

  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}
function secondAttemptInfo(job: JobRecord) {
  const first = parseWorkflowDate((job as any).NoAccessFirstAttemptAt || (job as any).noAccessFirstAttemptAt);
  const available = parseWorkflowDate((job as any).SecondAttemptAvailableAt || (job as any).secondAttemptAvailableAt);

  if (!first || !available) return null;

  const now = new Date();
  const msLeft = available.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600000));

  return {
    first,
    available,
    ready: msLeft <= 0,
    hoursLeft,
    label: msLeft <= 0 ? "REVISIT NOW" : `REVISIT IN ${hoursLeft}H`,
  };
}
function workflowViewBucket(job: JobRecord) {
  const status = workflowStatus(job) || legacyWorkflowKind(job);
  const archived = Boolean((job as any).ArchivedFromMap || (job as any).archivedFromMap);

  if (archived) return "archived";

  const secondAttempt = workflowSecondAttemptInfo(job);
  if (secondAttempt) return secondAttempt.ready ? "ready2" : "waiting72";

  if (status === "NO_ACCESS_1_WAITING_72H") {
    const info = workflowSecondAttemptInfo(job);
    return info?.ready ? "ready2" : "waiting72";
  }

  if (
    status === "NO_ACCESS_COMPLETE" ||
    status === "REFUSED_ACCESS" ||
    status === "COMPLETED_BY_OTHERS" ||
    status === "WORK_COMPLETED" ||
    status === "PARTIAL_WORK_COMPLETED"
  ) {
    return "final";
  }

  return "active";
}

function shouldShowForWorkflowView(job: JobRecord, view: "active" | "waiting72" | "ready2" | "final" | "archived" | "all") {
  if (view === "all") return true;
  return workflowViewBucket(job) === view;
}

function shouldShowOnActiveMap(job: JobRecord) {
  return workflowViewBucket(job) === "active" || workflowViewBucket(job) === "waiting72" || workflowViewBucket(job) === "ready2" || workflowViewBucket(job) === "final";
}

function focusJob(job: MappedJob) {
    clearMarkerOverviewReturn();
    setSelected(job);
          setSelectedOnly(true);
          setGeneratedLinks({});
          setFullMap(false);
          setDrawerOpen(true);

    if (Number.isFinite(job._lat) && Number.isFinite(job._lng) && mapRef.current) {
      mapRef.current.flyTo([Number(job._lat), Number(job._lng)], 16, {
        animate: true,
        duration: 0.65,
      });
    }
  }

  function smoothFocusSelectedCard(job: JobRecord) {
    const key = jobKey(job);

  window.requestAnimationFrame(() => {
    const el = document.querySelector(`[data-job-card="${key}"]`);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  });
}

function wazeDirectionsUrl(job: JobRecord | null | undefined) {
  if (!job) return "#";
  const address = displayAddress(job);
  const borough = (job as any).borough || (job as any).Borough || "";
  const destination = [address, borough, "NY"].filter(Boolean).join(", ");
  return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}
function googleDirectionsUrl(job: JobRecord | null | undefined) {
  if (!job) return "#";

  return directionsUrl(job as JobRecord);
}

function directionsUrl(job: JobRecord) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress(job))}`;
  }

  function paperworkHref(job: JobRecord, doc: "package" | "affidavit" | "invoice" = "package") {
    const outcome = paperworkOutcomeFromValue(workflowStatus(job) || JobStatus.statusLabel(job));
    const query = paperworkQuery(job, outcome);
    const separator = query ? "&" : "";
    return `/paperwork?${query}${separator}doc=${doc}`;
  }

  function paperworkPreviewHref(job: JobRecord, patch: Record<string, any>, doc: "package" | "affidavit" | "invoice" = "package") {
    const nextJob = { ...job, ...patch };
    const outcome = paperworkOutcomeFromValue(
      patch.WorkflowStatus || patch.workflowStatus || patch.FieldOutcome || patch.fieldOutcome || patch.StatusOverride || patch.status || workflowStatus(nextJob)
    );
    const query = paperworkQuery(nextJob, outcome);
    const separator = query ? "&" : "";
    return `/paperwork?${query}${separator}doc=${doc}`;
  }

  function openPaperworkPreviewForStatus(job: JobRecord, patch: Record<string, any>, openPreview = true) {
    const outcome = paperworkOutcomeFromValue(
      patch.WorkflowStatus || patch.workflowStatus || patch.FieldOutcome || patch.fieldOutcome || patch.StatusOverride || patch.status
    );
    if (outcome === "pending") return;

    const href = paperworkPreviewHref(job, patch, "package");
    setGeneratedLinks({ affidavit: href, invoice: href });
    if (openPreview) {
      window.open(href, "_blank", "noopener,noreferrer");
      showActionNotice("Status saved. Invoice/affidavit preview opened.");
      return;
    }
    showActionNotice("Status saved. Evidence capture is opening. Package preview link is ready.");
  }

  function currentSelectedIndex() {
    if (!selected) return -1;
    const key = String(jobKey(selected)).trim();
    return filteredJobs.findIndex((job) => String(jobKey(job)).trim() === key);
  }

  function selectAdjacentJob(direction: "next" | "prev") {
    if (!filteredJobs.length) return;

    const currentIndex = currentSelectedIndex();
    let nextIndex = 0;

    if (currentIndex >= 0) {
      nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    }

    if (nextIndex >= filteredJobs.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = filteredJobs.length - 1;

    const nextJob = filteredJobs[nextIndex];
    if (!nextJob) return;

    clearMarkerOverviewReturn();
    setSelected(nextJob);
    setSelectedOnly(true);
    setDrawerOpen(true);
    setFullMap(false);
    setGeneratedLinks({});
    setDescriptionOpen(false);
    setActionNotice(direction === "next" ? "Next job selected." : "Previous job selected.");

    if (Number.isFinite(nextJob._lat) && Number.isFinite(nextJob._lng)) {
      window.setTimeout(() => {
        mapRef.current?.panTo([Number(nextJob._lat), Number(nextJob._lng)], {
          animate: true,
          duration: 0.45,
        });
      }, 40);
    }
  }

  function handleSelectedTouchStart(event: any) {
    const touch = event.touches?.[0];
    if (!touch) return;

    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  }

  function handleSelectedTouchEnd(event: any) {
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    const touch = event.changedTouches?.[0];

    swipeStartXRef.current = null;
    swipeStartYRef.current = null;

    if (startX === null || startY === null || !touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (Math.abs(dx) < 55) return;
    if (Math.abs(dy) > 75) return;

    if (dx < 0) {
      selectAdjacentJob("next");
    } else {
      selectAdjacentJob("prev");
    }
  }


  function mapDataHealth() {
    const pool = (mappedJobs.length ? mappedJobs : jobs) as MappedJob[];

    function healthZipFromAddress(address: string) {
      const match = String(address || "").match(/\b(10\d{3}|11\d{3}|12\d{3})\b/);
      return match ? match[1] : "";
    }

    function healthExpectedBoroughFromZip(zip: string) {
      const z = Number(zip);
      if (!z) return "";
      if (z >= 10001 && z <= 10282) return "Manhattan";
      if (z >= 10301 && z <= 10314) return "Staten Island";
      if (z >= 10451 && z <= 10475) return "Bronx";
      if (z >= 11004 && z <= 11109) return "Queens";
      if (z >= 11351 && z <= 11697) return "Queens";
      if (z >= 11201 && z <= 11256) return "Brooklyn";
      return "";
    }

    function healthSuspiciousQueensCoord(job: JobRecord) {
      const address = displayAddress(job);
      const zip = healthZipFromAddress(address);
      const expected = healthExpectedBoroughFromZip(zip);
      if (expected !== "Queens") return false;

      const lat = toNumber((job as any).Latitude ?? (job as any).latitude ?? (job as any).lat);
      const lng = toNumber((job as any).Longitude ?? (job as any).longitude ?? (job as any).lng ?? (job as any).lon);

      if (lat === null || lng === null) return true;
      if (lat < 40.52 || lat > 40.82) return true;
      if (lng < -73.97 || lng > -73.70) return true;

      return false;
    }

    const blankBorough = pool.filter((job) => !String((job as any).borough || (job as any).Borough || (job as any).Boro || "").trim());

    const missingCoords = pool.filter((job) => {
      const lat = toNumber((job as any).Latitude ?? (job as any).latitude ?? (job as any).lat);
      const lng = toNumber((job as any).Longitude ?? (job as any).longitude ?? (job as any).lng ?? (job as any).lon);
      return lat === null || lng === null || lat === 0 || lng === 0;
    });

    const badDescriptions = pool.filter((job) => {
      const desc = displayDescription(job).toLowerCase();
      const source = String((job as any).DescriptionSource || (job as any).descriptionSource || "").toLowerCase();

      return (
        !desc ||
        source.includes("needs_manual") ||
        desc.includes("description needs review") ||
        (desc.includes("prepared by") && desc.includes("signature") && desc.includes("permit required"))
      );
    });

    const suspiciousQueens = pool.filter(healthSuspiciousQueensCoord);

    const checkDate = pool.filter((job) =>
      timelineOverdueLabel(job) === "Check date" || workWindowInfo(job).statusLabel === "Check completion date"
    );

    const readySecond = pool.filter((job) => workflowSecondAttemptInfo(job)?.ready);

    const overdue = pool.filter((job) => {
      const label = timelineOverdueLabel(job);
      return /^OD\s+\d+d$/i.test(label);
    });

    const totalIssues = blankBorough.length + missingCoords.length + badDescriptions.length + suspiciousQueens.length + checkDate.length;

    return {
      totalJobs: pool.length,
      totalIssues,
      blankBorough,
      missingCoords,
      badDescriptions,
      suspiciousQueens,
      checkDate,
      readySecond,
      overdue,
    };
  }

  function openHealthGroup(label: string, rows: MappedJob[], recommendation: string) {
    const top = rows.slice(0, 12);
    const jobIds = top.map((job) => jobKey(job));

    const answer =
      `${label}\n\n` +
      `${top.length} job(s) found.\n\n` +
      (top.length ? top.map(dispatchJobLine).join("\n\n") : "No matching jobs found.") +
      `\n\nRecommendation:\n${recommendation}`;

    setDispatchMessages((messages) => [
      ...messages,
      { role: "user", text: label },
      { role: "assistant", text: answer, jobs: jobIds },
    ]);

    setActionNotice(`${label}: ${rows.length} item(s).`);
  }

  const health = mapDataHealth();
  const todayPriorityJobs = [...dispatchJobPool()]
    .sort((a, b) => dispatchUrgencyScore(b) - dispatchUrgencyScore(a))
    .slice(0, 3);
  const readySecondCount = health.readySecond.length;

return (
    <main
      className={`map-shell ${fullMap ? "full-map-mode" : ""}`}
      onTouchStart={handleMapTouchStart}
      onTouchEnd={handleMapTouchEnd}
    >
      <style jsx global>{`
        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .maturity-map-marker {
          background: transparent;
          border: 0;
        }

        .maturity-marker-bubble {
          min-width: 44px;
          min-height: 34px;
          padding: 4px 7px;
          display: grid;
          place-items: center;
          border: 3px solid #42e8f3;
          border-radius: 999px;
          background: rgba(7, 17, 31, 0.94);
          color: #f8fbff;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(8px);
        }

        .maturity-marker-bubble strong {
          font-size: 13px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -0.04em;
        }

        .maturity-marker-bubble.status-marker-completed {
          box-shadow: 0 0 0 4px rgba(83, 230, 156, 0.22), 0 0 28px rgba(83, 230, 156, 0.8), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-refused {
          box-shadow: 0 0 0 4px rgba(255, 77, 95, 0.24), 0 0 30px rgba(255, 77, 95, 0.82), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-noaccess1 {
          box-shadow: 0 0 0 4px rgba(127, 147, 170, 0.25), 0 0 24px rgba(127, 147, 170, 0.72), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-noaccess2 {
          box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.55), 0 0 30px rgba(0, 0, 0, 0.92), 0 12px 30px rgba(0,0,0,.5);
        }

        .maturity-marker-bubble.status-marker-otherdone {
          box-shadow: 0 0 0 4px rgba(184, 117, 255, 0.25), 0 0 28px rgba(184, 117, 255, 0.8), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-pending {
          box-shadow: 0 0 0 4px rgba(255, 209, 102, 0.2), 0 0 24px rgba(255, 209, 102, 0.65), 0 12px 30px rgba(0,0,0,.38);
        }

        .maturity-marker-bubble.status-marker-none {
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
        }

        .maturity-marker-bubble.maturity-overdue {
          background: rgba(80, 8, 16, 0.95);
          color: #ffe4e8;
        }

        .maturity-marker-bubble.maturity-urgent {
          background: rgba(76, 35, 11, 0.95);
          color: #ffe2cf;
        }

        .maturity-marker-bubble.maturity-warning {
          background: rgba(73, 55, 8, 0.95);
          color: #fff0b8;
        }

        .maturity-marker-bubble.maturity-normal {
          background: rgba(7, 17, 31, 0.94);
          color: #e8fbff;
        }

        .maturity-marker-bubble.maturity-nodate {
          background: rgba(40, 46, 58, 0.95);
          color: #d7e4f8;
        }

        .leaflet-container {
          width: 100%;
          height: 100%;
          min-height: 100%;
          background: #0d1826;
          color: #111827;
          z-index: 1;
        }

        .map-shell {
            height: 100dvh;
            width: 100%;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            background: #07111f;
            overflow: hidden;
          }

        .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          z-index: 5;
          padding: max(7px, env(safe-area-inset-top)) 10px 7px;
          display: grid;
          gap: 8px;
          background: rgba(7, 17, 31, 0.95);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
        }

        .map-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .map-title-row h1 {
          margin: 0;
          font-size: clamp(19px, 5.4vw, 30px);
          letter-spacing: -0.06em;
          line-height: 1;
        }

        .map-title-row p {
          margin: 3px 0 0;
          color: #aebbd0;
          font-size: 11px;
          line-height: 1.25;
        }

        .home-btn {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 9px 11px;
          font-weight: 950;
          font-size: 12px;
        }

        .map-search {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .map-search input {
          width: 100%;
          min-height: 38px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          padding: 0 12px;
          font-size: 16px;
          outline: none;
        }

        .jobs-toggle {
          min-height: 38px;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          padding: 0 13px;
        }

        .map-filter-row {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 2px;
            -webkit-overflow-scrolling: touch;
          }

        .map-filter-row button { flex: 0 0 auto; flex: 0 0 auto;
          min-height: 34px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #d7e4f8;
          font-size: 11px;
          font-weight: 950;
          padding: 0 8px;
        }

        .map-filter-row button.active {
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          border-color: transparent;
        }

        .map-filter-row .full-btn {
          background: rgba(83, 230, 156, 0.15);
          color: #caffdf;
          border-color: rgba(83, 230, 156, 0.34);
        }

        .map-shell.full-map-mode {
          grid-template-rows: auto minmax(0, 1fr);
        }

        .map-shell.full-map-mode .status-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.status-actions button {
  padding: 8px;
  font-size: 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: rgba(255,255,255,0.08);
  color: #fff;
}

.status-actions button:hover {
  background: rgba(255,255,255,0.18);
}

.job-drawer {
          display: block;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          max-height: 38dvh;
          overflow-y: auto;
          position: relative;
          z-index: 20;
          }

        .map-shell.full-map-mode .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          padding-bottom: 8px;
        }

        .map-shell.full-map-mode .map-stage:fullscreen {
          width: 100vw;
          height: 100vh;
          background: #050914;
        }

        .map-stage:fullscreen .leaflet-container {
          height: 100vh !important;
        }

        .map-stage {
            position: relative;
            height: 100%;
            min-height: 0;
            width: 100%;
          }

        .map-node {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .map-stats {
            position: absolute;
            z-index: 4;
            left: 10px;
            right: 78px;
            top: 10px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 7px;
            pointer-events: none;
          }

        .map-stat {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(7, 17, 31, 0.82);
          backdrop-filter: blur(12px);
          border-radius: 18px;
          padding: 9px;
        }

        .map-stat strong {
          display: block;
          font-size: 17px;
          line-height: 1;
        }

        .map-stat span {
          display: block;
          margin-top: 4px;
          color: #aebbd0;
          font-size: 10px;
          font-weight: 900;
        }

        .status-legend {
          position: absolute;
          z-index: 6;
          left: 12px;
          bottom: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-width: calc(100% - 82px);
          padding: 7px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 999px;
          background: rgba(7,17,31,.84);
          backdrop-filter: blur(14px);
          box-shadow: 0 14px 42px rgba(0,0,0,.36);
        }

        .status-legend span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #e9f3ff;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
        }

        .dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 12px currentColor;
        }

        .dot.completed { background: #53e69c; color: #53e69c; }
        .dot.refused { background: #ff4d5f; color: #ff4d5f; }
        .dot.noaccess { background: #47a3ff; color: #47a3ff; }
        .dot.second { background: #05070b; color: #ffffff; border: 1px solid #fff; }
        .dot.pending { background: #ffd166; color: #ffd166; }

        .map-shell.full-map-mode {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          z-index: 99999 !important;
          background: #050914 !important;
          display: grid !important;
          grid-template-rows: auto 1fr !important;
          grid-template-columns: 1fr !important;
          padding: 0 !important;
          overflow: hidden !important;
        }

        .map-shell.full-map-mode .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          grid-row: 1 !important;
          grid-column: 1 !important;
          border-radius: 0 !important;
          padding: max(8px, env(safe-area-inset-top)) 10px 8px !important;
        }

        .map-shell.full-map-mode .map-stage {
            position: relative;
            height: 100%;
            min-height: 0;
            width: 100%;
          }

        .job-drawer.closed {
            max-height: 64px;
            overflow: hidden;
          }

        .drawer-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .drawer-head strong {
          font-size: 20px;
        }

        .drawer-head button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 950;
        }

        .job-status-card {
          position: relative;
          overflow: hidden;
          border-left-width: 7px !important;
        }

        .status-card-completed {
          border-left-color: #53e69c !important;
          background: linear-gradient(135deg, rgba(83, 230, 156, 0.14), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-refused {
          border-left-color: #ff4d5f !important;
          background: linear-gradient(135deg, rgba(255, 77, 95, 0.16), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-noaccess {
          border-left-color: #47a3ff !important;
          background: linear-gradient(135deg, rgba(71, 163, 255, 0.16), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-otherdone {
          border-left-color: #b875ff !important;
          background: linear-gradient(135deg, rgba(184, 117, 255, 0.16), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-pending {
          border-left-color: #ffd166 !important;
          background: linear-gradient(135deg, rgba(255, 209, 102, 0.14), rgba(255, 255, 255, 0.07)) !important;
        }

        .status-card-unknown {
          border-left-color: #aebbd0 !important;
        }

        .selected-card,
        .job-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 22px; padding: 17px;
          margin-bottom: 10px;
        }

        .selected-card {
          background: linear-gradient(145deg, rgba(66, 232, 243, 0.16), rgba(71, 163, 255, 0.1));
          border-color: rgba(66, 232, 243, 0.38);
        }

        .job-main-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .job-title {
          display: block;
          font-size: 20px;
          letter-spacing: -0.035em;
        }

        .job-address {
          margin: 7px 0 0;
          color: #f8fbff;
          font-size: 15px;
          line-height: 1.35;
        }

        .job-sub {
          margin: 5px 0 0;
          color: #aebbd0;
          font-size: 13px;
          line-height: 1.35;
        }

        .status {
          flex: 0 0 auto;
          max-width: 110px;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status.status-completed {
          background: rgba(83, 230, 156, 0.16);
          color: #baffd8;
        }

        .status.status-refused {
          background: rgba(255, 77, 95, 0.18);
          color: #ffc7ce;
        }

        .status.status-noaccess {
          background: rgba(71, 163, 255, 0.18);
          color: #d6ebff;
        }

        .status.status-otherdone {
          background: rgba(184, 117, 255, 0.18);
          color: #efdfff;
        }

        .status.status-pending {
          background: rgba(255, 209, 102, 0.16);
          color: #ffe7a3;
        }

        .status.status-unknown {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .status.good {
          background: rgba(83, 230, 156, 0.16);
          color: #baffd8;
        }

        .status.hot {
          background: rgba(66, 232, 243, 0.14);
          color: #c4fbff;
        }

        .status.warn {
          background: rgba(255, 209, 102, 0.14);
          color: #ffe7a3;
        }

        .status.neutral {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .maturity-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 7px 9px;
          font-size: 11px;
          font-weight: 1000;
          white-space: nowrap;
        }

        .maturity-normal {
          background: rgba(83, 230, 156, 0.15);
          color: #baffd8;
        }

        .maturity-warning {
          background: rgba(255, 209, 102, 0.16);
          color: #ffe7a3;
        }

        .maturity-urgent {
          background: rgba(255, 138, 76, 0.18);
          color: #ffd0ba;
        }

        .maturity-overdue {
          background: rgba(255, 107, 122, 0.18);
          color: #ffc2cb;
        }

        .maturity-nodate {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .detail {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.065);
          border-radius: 13px;
          padding: 10px;
          min-width: 0;
        }

        .detail span {
          display: block;
          color: #aebbd0;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .detail strong {
          display: block;
          margin-top: 4px;
          color: #f8fbff;
          font-size: 13px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .status-actions {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin: 12px 0;
        }

        .status-actions button {
          min-height: 38px;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
          color: #f8fbff;
          font-size: 12px;
          font-weight: 900;
        }

        .status-actions button:nth-child(1) {
          border-color: rgba(127,147,170,.45);
        }

        .status-actions button:nth-child(2) {
          border-color: rgba(0,0,0,.75);
        }

        .status-actions button:nth-child(3) {
          border-color: rgba(255,77,95,.6);
        }

        .status-actions button:nth-child(4) {
          border-color: rgba(83,230,156,.6);
        }

        .status-actions button:nth-child(5) {
          border-color: rgba(184,117,255,.6);
        }

        .card-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .card-actions a,
        .card-actions button {
          min-height: 40px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          font-size: 12px;
          text-align: center;
        }

        .card-actions .secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fbff;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .job-card-button {
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 0;
          text-align: left;
        }

        @media (min-width: 920px) {
            .map-shell {
              grid-template-columns: 1fr;
              grid-template-rows: auto minmax(0, 1fr);
            }
            .map-top {
              grid-column: 1;
            }
            .map-stage {
              grid-column: 1;
              grid-row: 2;
            }
            .job-drawer {
              left: 50%;
              right: auto;
              width: min(760px, calc(100vw - 24px));
              transform: translateX(-50%);
            }
          }
        .map-shell.full-map-mode {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          z-index: 99999 !important;
          background: #050914 !important;
          display: grid !important;
          grid-template-rows: auto 1fr !important;
          grid-template-columns: 1fr !important;
          padding: 0 !important;
          overflow: hidden !important;
        }

        .map-shell.full-map-mode .status-filter-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .status-filter-bar button {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .map-top {
          grid-row: 1 !important;
          grid-column: 1 !important;
          border-radius: 0 !important;
          padding: max(8px, env(safe-area-inset-top)) 10px 8px !important;
        }

        .map-shell.full-map-mode .map-stage {
          grid-row: 2 !important;
          grid-column: 1 !important;
          height: 100% !important;
          min-height: 0 !important;
          border-radius: 0 !important;
        }

        .map-shell.full-map-mode .leaflet-container,
        .map-shell.full-map-mode #map {
          height: 100% !important;
          min-height: 100% !important;
        }

        .map-shell.full-map-mode .job-drawer {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          z-index: 100000 !important;
          max-height: 46dvh !important;
          display: block !important;
        }

        .map-shell.full-map-mode .job-drawer.closed {
            max-height: 64px;
            overflow: hidden;
          }
          @media (max-width: 700px) {
            .map-shell {
              grid-template-rows: auto minmax(0, 1fr) !important;
            }

            .map-top {
              padding: max(5px, env(safe-area-inset-top)) 7px 5px !important;
              gap: 5px !important;
            }

            .map-title-row h1 {
              font-size: 18px !important;
            }

            .map-title-row p {
              font-size: 10px !important;
              max-height: 14px;
              overflow: hidden;
            }

            .map-search input {
              min-height: 34px !important;
              font-size: 14px !important;
            }

            .jobs-toggle {
              min-height: 34px !important;
              padding: 0 10px !important;
            }

            .map-filter-row,
            .status-filter-bar {
              gap: 5px !important;
              padding-bottom: 1px !important;
            }

            .map-filter-row button,
            .status-filter-bar button {
              min-height: 30px !important;
              font-size: 10px !important;
              padding: 0 8px !important;
            }

            .map-stats {
              top: 7px !important;
              left: 7px !important;
              right: 68px !important;
              gap: 5px !important;
            }

            .map-stat {
              padding: 6px !important;
              border-radius: 13px !important;
              backdrop-filter: none !important;
              background: rgba(7, 17, 31, 0.72) !important;
            }

            .map-stat strong {
              font-size: 14px !important;
            }

            .map-stat span {
              font-size: 8px !important;
            }

            .status-legend {
              left: 7px !important;
              bottom: 7px !important;
              max-width: calc(100% - 74px) !important;
              padding: 5px !important;
              gap: 5px !important;
              backdrop-filter: none !important;
              border-radius: 14px !important;
            }

            .status-legend span {
              font-size: 9px !important;
            }

            .zoom-panel {
              right: 7px !important;
              bottom: 7px !important;
              gap: 6px !important;
            }

            .zoom-panel button {
              width: 46px !important;
              min-height: 42px !important;
              border-radius: 15px !important;
              font-size: 16px !important;
            }

            .job-drawer {
              left: 6px !important;
              right: 6px !important;
              bottom: 6px !important;
              max-height: 38dvh !important;
              padding: 9px !important;
              border-radius: 20px !important;
              backdrop-filter: none !important;
              box-shadow: 0 -10px 34px rgba(0,0,0,.48) !important;
              -webkit-overflow-scrolling: touch;
            }

            .job-drawer.closed {
              max-height: 52px !important;
            }

            .drawer-head {
              margin-bottom: 6px !important;
            }

            .drawer-head strong {
              font-size: 16px !important;
            }

            .selected-card,
            .job-card {
              border-radius: 16px !important;
              padding: 11px !important;
              margin-bottom: 8px !important;
            }

            .job-title {
              font-size: 17px !important;
            }

            .job-address {
              font-size: 13px !important;
              margin-top: 4px !important;
            }

            .job-sub {
              font-size: 11px !important;
            }

            .detail-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 6px !important;
              margin-top: 8px !important;
            }

            .detail {
              padding: 7px !important;
              border-radius: 10px !important;
            }

            .detail span {
              font-size: 8px !important;
            }

            .detail strong {
              font-size: 11px !important;
            }

            .status-actions {
              gap: 6px !important;
              margin: 8px 0 !important;
            }

            .status-actions button {
              min-height: 34px !important;
              font-size: 11px !important;
              border-radius: 10px !important;
            }

            .card-actions {
              gap: 6px !important;
              margin-top: 8px !important;
            }

            .card-actions a,
            .card-actions button {
              min-height: 36px !important;
              font-size: 11px !important;
              border-radius: 11px !important;
            }

            .maturity-marker-bubble {
              min-width: 38px !important;
              min-height: 30px !important;
              padding: 3px 6px !important;
              border-width: 2px !important;
              box-shadow: 0 8px 20px rgba(0,0,0,.34) !important;
              backdrop-filter: none !important;
            }

            .maturity-marker-bubble strong {
              font-size: 12px !important;
            }
          }
          .selected-card {
            scroll-margin-bottom: 90px;
            animation: selectedCardIn 180ms ease-out;
          }

          @keyframes selectedCardIn {
            from {
              transform: translateY(10px);
              opacity: 0.72;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          .selected-description {
            margin-top: 12px;
            border: 1px solid rgba(66, 232, 243, 0.22);
            background: rgba(255,255,255,0.075);
            border-radius: 18px;
            padding: 12px;
          }

          .description-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 8px;
          }

          .description-head span {
            color: #aebbd0;
            font-size: 10px;
            font-weight: 1000;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .description-head strong {
            color: #c4fbff;
            font-size: 11px;
            font-weight: 1000;
            border: 1px solid rgba(66,232,243,.24);
            background: rgba(66,232,243,.1);
            border-radius: 999px;
            padding: 5px 8px;
          }

          .selected-description p {
            margin: 0;
            color: #f8fbff;
            font-size: 16px;
            line-height: 1.55;
            font-weight: 650;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .job-drawer {
            scroll-behavior: smooth;
          }

          .job-card,
          .selected-card,
          .maturity-marker-bubble {
            transition:
              transform 160ms ease,
              box-shadow 160ms ease,
              border-color 160ms ease,
              background 160ms ease;
          }

          .job-card:active,
          .selected-card:active {
            transform: scale(0.992);
          }

          @media (max-width: 700px) {
            .selected-description {
              max-height: 24dvh;
              overflow: auto;
              -webkit-overflow-scrolling: touch;
              padding: 11px;
              border-radius: 16px;
            }

            .selected-description p {
              font-size: 15px !important;
              line-height: 1.52 !important;
              font-weight: 700;
            }

            .description-head {
              position: sticky;
              top: 0;
              z-index: 2;
              padding-bottom: 6px;
              background: rgba(7,17,31,.96);
              backdrop-filter: none;
            }
          }
          .job-drawer.selected-focus {
            max-height: 70dvh !important;
          }

          .job-drawer.selected-focus .selected-card {
            margin-bottom: 0 !important;
          }

          .job-drawer.selected-focus .drawer-head {
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(7,17,31,.98);
            padding-bottom: 8px;
          }

          @media (max-width: 700px) {
            .job-drawer.selected-focus {
              max-height: 72dvh !important;
            }
          }
          .job-drawer.selected-focus {
            max-height: 70dvh !important;
          }

          .job-drawer.selected-focus .selected-card {
            margin-bottom: 0 !important;
          }

          .job-drawer.selected-focus .drawer-head {
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(7,17,31,.98);
            padding-bottom: 8px;
          }

          @media (max-width: 700px) {
            .job-drawer.selected-focus {
              max-height: 72dvh !important;
            }
          }
          .selected-description {
            touch-action: pan-y;
            overscroll-behavior: contain;
          }

          .selected-description p {
            user-select: text;
          }

          .generated-output-links {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
            margin-top: 10px;
          }

          .generated-output-links a {
            min-height: 42px;
            display: grid;
            place-items: center;
            border-radius: 14px;
            background: rgba(83, 230, 156, 0.16);
            border: 1px solid rgba(83, 230, 156, 0.32);
            color: #caffdf;
            font-weight: 950;
            font-size: 13px;
          }

          @media (max-width: 700px) {
            .job-drawer.selected-focus {
              max-height: 82dvh !important;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch !important;
            }

            .selected-description {
              max-height: 34dvh !important;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch !important;
              touch-action: pan-y !important;
              overscroll-behavior: contain !important;
            }

            .selected-description p {
              font-size: 16px !important;
              line-height: 1.6 !important;
            }
          }
          .description-open-button {
            width: 100%;
            text-align: left;
            cursor: pointer;
          }

          .description-open-button p {
            display: -webkit-box;
            -webkit-line-clamp: 5;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .description-modal {
            position: fixed;
            inset: 0;
            z-index: 200000;
            background: #06101f;
            color: #f8fbff;
            display: grid;
            grid-template-rows: auto 1fr;
            padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
          }

          .description-modal-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 0 12px;
            border-bottom: 1px solid rgba(255,255,255,.14);
          }

          .description-modal-head strong {
            display: block;
            font-size: 20px;
            letter-spacing: -0.04em;
          }

          .description-modal-head span {
            display: block;
            margin-top: 4px;
            color: #aebbd0;
            font-size: 12px;
            line-height: 1.3;
          }

          .description-modal-head button {
            min-height: 42px;
            border: 0;
            border-radius: 999px;
            padding: 0 16px;
            background: linear-gradient(135deg, #42e8f3, #47a3ff);
            color: #04111f;
            font-weight: 1000;
          }

          .description-modal-body {
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 16px 2px 28px;
          }

          .description-modal-body h2 {
            margin: 0 0 14px;
            font-size: 24px;
            letter-spacing: -0.05em;
          }

          .description-modal-body p {
            margin: 0;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            font-size: 19px;
            line-height: 1.62;
            font-weight: 700;
          }

          @media (max-width: 700px) {
            .description-modal-body p {
              font-size: 18px !important;
              line-height: 1.65 !important;
            }
          }
          .no-itb-alert {
            margin: 8px 0 10px;
            border: 1px solid rgba(255, 209, 102, 0.38);
            background: rgba(255, 209, 102, 0.14);
            border-radius: 16px;
            padding: 10px;
            color: #ffe6a3;
          }

          .no-itb-alert strong {
            display: block;
            font-size: 13px;
            font-weight: 1000;
            letter-spacing: 0.04em;
          }

          .no-itb-alert span {
            display: block;
            margin-top: 3px;
            font-size: 11px;
            color: #fff4cf;
            line-height: 1.35;
          }

          .mini-no-itb {
            display: inline-flex;
            align-items: center;
            margin-left: 7px;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(255, 209, 102, 0.16);
            border: 1px solid rgba(255, 209, 102, 0.32);
            color: #ffe6a3;
            font-size: 9px;
            font-weight: 1000;
            vertical-align: middle;
          }

          @media (max-width: 700px) {
            .no-itb-alert {
              padding: 9px;
              border-radius: 14px;
            }

            .no-itb-alert strong {
              font-size: 12px;
            }

            .no-itb-alert span {
              font-size: 10px;
            }
          }
          .no-itb-alert {
            margin: 8px 0 10px;
            border: 1px solid rgba(255, 209, 102, 0.38);
            background: rgba(255, 209, 102, 0.14);
            border-radius: 16px;
            padding: 10px;
            color: #ffe6a3;
          }

          .no-itb-alert strong {
            display: block;
            font-size: 13px;
            font-weight: 1000;
            letter-spacing: 0.04em;
          }

          .no-itb-alert span {
            display: block;
            margin-top: 3px;
            font-size: 11px;
            color: #fff4cf;
            line-height: 1.35;
          }

          .mini-no-itb {
            display: inline-flex;
            align-items: center;
            margin-left: 7px;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(255, 209, 102, 0.16);
            border: 1px solid rgba(255, 209, 102, 0.32);
            color: #ffe6a3;
            font-size: 9px;
            font-weight: 1000;
            vertical-align: middle;
          }

          @media (max-width: 700px) {
            .no-itb-alert {
              padding: 9px;
              border-radius: 14px;
            }

            .no-itb-alert strong {
              font-size: 12px;
            }

            .no-itb-alert span {
              font-size: 10px;
            }
          }
          .ocr-alert {
            margin: 8px 0 10px;
            border: 1px solid rgba(66, 232, 243, 0.34);
            background: rgba(66, 232, 243, 0.12);
            border-radius: 16px;
            padding: 10px;
            color: #c4fbff;
          }

          .ocr-alert strong {
            display: block;
            font-size: 13px;
            font-weight: 1000;
            letter-spacing: 0.04em;
          }

          .ocr-alert span {
            display: block;
            margin-top: 3px;
            font-size: 11px;
            color: #dffcff;
            line-height: 1.35;
          }

          .mini-ocr {
            display: inline-flex;
            align-items: center;
            margin-left: 7px;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(66, 232, 243, 0.14);
            border: 1px solid rgba(66, 232, 243, 0.32);
            color: #c4fbff;
            font-size: 9px;
            font-weight: 1000;
            vertical-align: middle;
          }
          .ocr-alert {
            margin: 8px 0 10px;
            border: 1px solid rgba(66, 232, 243, 0.34);
            background: rgba(66, 232, 243, 0.12);
            border-radius: 16px;
            padding: 10px;
            color: #c4fbff;
          }

          .ocr-alert strong {
            display: block;
            font-size: 13px;
            font-weight: 1000;
            letter-spacing: 0.04em;
          }

          .ocr-alert span {
            display: block;
            margin-top: 3px;
            font-size: 11px;
            color: #dffcff;
            line-height: 1.35;
          }

          .mini-ocr {
            display: inline-flex;
            align-items: center;
            margin-left: 7px;
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(66, 232, 243, 0.14);
            border: 1px solid rgba(66, 232, 243, 0.32);
            color: #c4fbff;
            font-size: 9px;
            font-weight: 1000;
            vertical-align: middle;
          }
          .job-card {
            transition:
              transform 180ms ease,
              border-color 180ms ease,
              box-shadow 180ms ease,
              background 180ms ease;
            will-change: transform;
          }

          .job-card.selected-live {
            transform: translateY(-2px) scale(1.012);
            border-color: rgba(88, 166, 255, 0.86);
            box-shadow:
              0 0 0 1px rgba(88, 166, 255, 0.5),
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 34px rgba(88, 166, 255, 0.24);
            background: linear-gradient(180deg, rgba(18, 35, 64, 0.98), rgba(8, 14, 26, 0.98));
          }

          @media (max-width: 720px) {
            .job-card.selected-live {
              transform: translateY(-1px) scale(1.006);
            }

            .jobs-list,
            .drawer-body,
            aside {
              -webkit-overflow-scrolling: touch;
              scroll-behavior: smooth;
            }
          }
          .job-drawer.closed {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            transform: translateX(110%) !important;
          }

          @media (max-width: 720px) {
            .job-drawer.closed {
              transform: translateY(110%) !important;
            }
          }

          .map-shell.full-map .job-drawer,
          .dashboard.full-map .job-drawer,
          main.full-map .job-drawer {
            display: none !important;
          }
          /* STATUS_GLOW_UPGRADE_2026 */
          @keyframes statusGlowPulse {
            0% {
              box-shadow:
                0 0 0 1px rgba(255,255,255,0.10),
                0 0 18px rgba(255,255,255,0.10),
                0 14px 36px rgba(0,0,0,0.34);
            }
            50% {
              box-shadow:
                0 0 0 5px var(--status-ring-soft),
                0 0 34px var(--status-glow),
                0 0 70px var(--status-glow-wide),
                0 18px 46px rgba(0,0,0,0.44);
            }
            100% {
              box-shadow:
                0 0 0 1px rgba(255,255,255,0.10),
                0 0 18px rgba(255,255,255,0.10),
                0 14px 36px rgba(0,0,0,0.34);
            }
          }

          .job-status-card {
            --status-glow: rgba(255, 209, 102, 0.45);
            --status-glow-wide: rgba(255, 209, 102, 0.20);
            --status-ring-soft: rgba(255, 209, 102, 0.22);
          }

          .job-status-card.status-card-completed,
          .job-status-card.status-card-refused,
          .job-status-card.status-card-noaccess,
          .job-status-card.status-card-otherdone {
            animation: statusGlowPulse 4.8s ease-in-out infinite;
            box-shadow:
              0 0 0 4px var(--status-ring-soft),
              0 0 34px var(--status-glow),
              0 0 78px var(--status-glow-wide),
              0 18px 46px rgba(0,0,0,0.42) !important;
          }

          .job-status-card.status-card-completed {
            --status-glow: rgba(83, 230, 156, 0.75);
            --status-glow-wide: rgba(83, 230, 156, 0.28);
            --status-ring-soft: rgba(83, 230, 156, 0.28);
          }

          .job-status-card.status-card-refused {
            --status-glow: rgba(255, 77, 95, 0.80);
            --status-glow-wide: rgba(255, 77, 95, 0.30);
            --status-ring-soft: rgba(255, 77, 95, 0.30);
          }

          .job-status-card.status-card-noaccess {
            --status-glow: rgba(71, 163, 255, 0.82);
            --status-glow-wide: rgba(71, 163, 255, 0.32);
            --status-ring-soft: rgba(71, 163, 255, 0.32);
          }

          .job-status-card.status-card-otherdone {
            --status-glow: rgba(184, 117, 255, 0.78);
            --status-glow-wide: rgba(184, 117, 255, 0.30);
            --status-ring-soft: rgba(184, 117, 255, 0.30);
          }

          .maturity-marker-bubble.status-marker-completed,
          .maturity-marker-bubble.status-marker-refused,
          .maturity-marker-bubble.status-marker-noaccess1,
          .maturity-marker-bubble.status-marker-noaccess2,
          .maturity-marker-bubble.status-marker-otherdone {
            animation: statusGlowPulse 5.2s ease-in-out infinite;
          }
          .no-access-timer-card {
            grid-column: 1 / -1;
            border: 1px solid rgba(71, 163, 255, 0.36) !important;
            background:
              radial-gradient(circle at top left, rgba(71,163,255,0.28), transparent 42%),
              rgba(71, 163, 255, 0.10) !important;
            box-shadow:
              0 0 0 3px rgba(71,163,255,0.14),
              0 0 32px rgba(71,163,255,0.24) !important;
          }

          .no-access-timer-card strong {
            color: #d6ebff;
            font-size: 15px;
            letter-spacing: 0.02em;
          }

          .no-access-timer-card small {
            display: block;
            margin-top: 6px;
            color: rgba(214, 235, 255, 0.82);
            line-height: 1.35;
          }

          .no-access-ready {
            border-color: rgba(83, 230, 156, 0.50) !important;
            background:
              radial-gradient(circle at top left, rgba(83,230,156,0.30), transparent 42%),
              rgba(83, 230, 156, 0.11) !important;
            box-shadow:
              0 0 0 3px rgba(83,230,156,0.18),
              0 0 38px rgba(83,230,156,0.30) !important;
          }

          .no-access-ready strong {
            color: #baffd8;
          }
          .action-notice {
            position: fixed;
            z-index: 1400;
            left: 50%;
            top: 138px;
            transform: translateX(-50%);
            max-width: calc(100vw - 24px);
            padding: 11px 16px;
            border-radius: 999px;
            border: 1px solid rgba(83, 230, 156, 0.42);
            background: linear-gradient(135deg, rgba(17, 31, 52, 0.96), rgba(16, 74, 64, 0.94));
            color: #dfffee;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.01em;
            box-shadow:
              0 0 0 3px rgba(83, 230, 156, 0.13),
              0 0 34px rgba(83, 230, 156, 0.28),
              0 14px 38px rgba(0,0,0,0.44);
          }
          /* STRONG_MARKER_GLOW_2026 */
          .maturity-map-marker {
            overflow: visible !important;
            pointer-events: auto;
          }

          .maturity-map-marker .maturity-marker-bubble {
            position: relative;
            overflow: visible !important;
            z-index: 2;
          }

          .maturity-map-marker .maturity-marker-bubble::before {
            content: "";
            position: absolute;
            left: 50%;
            top: 50%;
            width: 72px;
            height: 72px;
            transform: translate(-50%, -50%);
            border-radius: 999px;
            background: radial-gradient(circle, var(--marker-glow-core), transparent 62%);
            box-shadow:
              0 0 0 8px var(--marker-ring),
              0 0 34px var(--marker-glow),
              0 0 76px var(--marker-glow-wide);
            opacity: 0.95;
            z-index: -1;
            animation: markerHaloPulse 2.8s ease-in-out infinite;
          }

          @keyframes markerHaloPulse {
            0% {
              transform: translate(-50%, -50%) scale(0.82);
              opacity: 0.58;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.18);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(0.82);
              opacity: 0.58;
            }
          }

          .maturity-marker-bubble.status-marker-completed {
            --marker-glow-core: rgba(83, 230, 156, 0.42);
            --marker-ring: rgba(83, 230, 156, 0.26);
            --marker-glow: rgba(83, 230, 156, 0.86);
            --marker-glow-wide: rgba(83, 230, 156, 0.34);
          }

          .maturity-marker-bubble.status-marker-refused {
            --marker-glow-core: rgba(255, 77, 95, 0.44);
            --marker-ring: rgba(255, 77, 95, 0.28);
            --marker-glow: rgba(255, 77, 95, 0.90);
            --marker-glow-wide: rgba(255, 77, 95, 0.36);
          }

          .maturity-marker-bubble.status-marker-noaccess1,
          .maturity-marker-bubble.status-marker-noaccess2 {
            --marker-glow-core: rgba(71, 163, 255, 0.46);
            --marker-ring: rgba(71, 163, 255, 0.30);
            --marker-glow: rgba(71, 163, 255, 0.92);
            --marker-glow-wide: rgba(71, 163, 255, 0.38);
          }

          .maturity-marker-bubble.status-marker-otherdone {
            --marker-glow-core: rgba(184, 117, 255, 0.44);
            --marker-ring: rgba(184, 117, 255, 0.28);
            --marker-glow: rgba(184, 117, 255, 0.88);
            --marker-glow-wide: rgba(184, 117, 255, 0.36);
          }

          .maturity-marker-bubble.status-marker-pending::before,
          .maturity-marker-bubble.status-marker-none::before {
            display: none;
          }
          /* LIVE_REVISIT_ALERT_2026 */
          .maturity-marker-bubble.marker-ready-revisit {
            min-width: 68px !important;
            height: 42px !important;
            border-color: #53e69c !important;
            background: linear-gradient(135deg, rgba(83,230,156,0.96), rgba(255,209,102,0.92)) !important;
            color: #04101f !important;
            font-weight: 950 !important;
            letter-spacing: -0.04em;
            animation: revisitMarkerPulse 1.15s ease-in-out infinite !important;
          }

          .maturity-marker-bubble.marker-ready-revisit::before {
            width: 104px !important;
            height: 104px !important;
            background: radial-gradient(circle, rgba(83,230,156,0.62), transparent 62%) !important;
            box-shadow:
              0 0 0 12px rgba(83,230,156,0.26),
              0 0 48px rgba(83,230,156,0.96),
              0 0 110px rgba(255,209,102,0.54) !important;
            animation: revisitHaloPulse 1.15s ease-in-out infinite !important;
          }

          @keyframes revisitMarkerPulse {
            0%, 100% {
              transform: scale(1);
              filter: brightness(1);
            }
            50% {
              transform: scale(1.12);
              filter: brightness(1.22);
            }
          }

          @keyframes revisitHaloPulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(0.86);
              opacity: 0.62;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.28);
              opacity: 1;
            }
          }

          .ready-revisit-alert {
            position: fixed;
            z-index: 1401;
            left: 50%;
            top: 184px;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: calc(100vw - 20px);
            padding: 10px 12px;
            border-radius: 18px;
            border: 1px solid rgba(83, 230, 156, 0.52);
            background:
              radial-gradient(circle at top left, rgba(83,230,156,0.30), transparent 38%),
              linear-gradient(135deg, rgba(8, 25, 38, 0.96), rgba(51, 45, 12, 0.94));
            color: #eafff4;
            box-shadow:
              0 0 0 4px rgba(83,230,156,0.13),
              0 0 38px rgba(83,230,156,0.30),
              0 16px 44px rgba(0,0,0,0.50);
            animation: readyAlertPulse 1.8s ease-in-out infinite;
          }

          .ready-revisit-alert strong {
            color: #baffd8;
            font-size: 12px;
            letter-spacing: 0.08em;
            white-space: nowrap;
          }

          .ready-revisit-alert span {
            font-size: 12px;
            font-weight: 750;
            white-space: nowrap;
          }

          .ready-revisit-alert button {
            border: 0;
            border-radius: 999px;
            background: #53e69c;
            color: #04101f;
            font-size: 12px;
            font-weight: 900;
            padding: 7px 10px;
          }

          @keyframes readyAlertPulse {
            0%, 100% {
              box-shadow:
                0 0 0 3px rgba(83,230,156,0.12),
                0 0 26px rgba(83,230,156,0.22),
                0 16px 44px rgba(0,0,0,0.50);
            }
            50% {
              box-shadow:
                0 0 0 7px rgba(83,230,156,0.20),
                0 0 48px rgba(83,230,156,0.42),
                0 16px 44px rgba(0,0,0,0.50);
            }
          }

          @media (max-width: 720px) {
            .ready-revisit-alert {
              top: 176px;
              gap: 7px;
              padding: 8px 9px;
            }

            .ready-revisit-alert span {
              max-width: 155px;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          }
          /* MOBILE_SPACE_UPGRADE_2026 */
          .map-filter-row,
          .status-filter-bar,
          .workflow-filter-bar {
            transform-origin: top center;
          }

          .map-shell.full-map-mode .workflow-filter-bar {
            top: 54px !important;
            padding: 6px !important;
            gap: 5px !important;
          }

          .map-shell.full-map-mode .workflow-filter-bar button {
            min-height: 28px !important;
            padding: 5px 8px !important;
            font-size: 10px !important;
          }

          .map-shell.full-map-mode .map-filter-row,
          .map-shell.full-map-mode .status-filter-bar {
            padding: 4px 6px !important;
            gap: 5px !important;
          }

          .map-shell.full-map-mode .map-filter-row button,
          .map-shell.full-map-mode .status-filter-bar button {
            min-height: 28px !important;
            padding: 4px 8px !important;
            font-size: 10px !important;
          }

          .map-shell.full-map-mode .map-stage {
            min-height: calc(100vh - 72px) !important;
          }

          .selected-focus-advanced {
            width: min(620px, calc(100vw - 12px)) !important;
          }

          .selected-focus-advanced .selected-card {
            max-height: calc(100vh - 118px);
            overflow-y: auto;
            padding: 14px !important;
          }

          .selected-focus-advanced .detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px !important;
          }

          .selected-focus-advanced .job-title {
            font-size: 18px !important;
          }

          .selected-focus-advanced .job-address {
            font-size: 12px !important;
            line-height: 1.25 !important;
          }

          @media (max-width: 720px) {
            .workflow-filter-bar {
              top: 58px !important;
              padding: 5px !important;
            }

            .workflow-filter-bar button {
              min-height: 27px !important;
              padding: 4px 7px !important;
              font-size: 10px !important;
            }

            .selected-focus-advanced .selected-card {
              max-height: calc(100vh - 104px);
              padding: 12px !important;
            }

            .selected-focus-advanced .detail-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .selected-focus-advanced .detail {
              padding: 8px !important;
            }

            .selected-focus-advanced .detail span {
              font-size: 9px !important;
            }

            .selected-focus-advanced .detail strong {
              font-size: 11px !important;
            }
          }
          /* JOB_CARD_VISUAL_UPGRADE_2026 */
          .job-status-card,
          .selected-card,
          .job-card {
            border-radius: 22px !important;
            border: 1px solid rgba(255,255,255,0.16) !important;
            background:
              radial-gradient(circle at top left, rgba(111,180,255,0.16), transparent 36%),
              linear-gradient(180deg, rgba(13, 24, 42, 0.97), rgba(7, 14, 26, 0.98)) !important;
            box-shadow:
              0 18px 48px rgba(0,0,0,0.42),
              inset 0 1px 0 rgba(255,255,255,0.08) !important;
            transform: translateZ(0);
            transition:
              transform 180ms ease,
              box-shadow 180ms ease,
              border-color 180ms ease,
              background 180ms ease !important;
          }

          .job-status-card:hover,
          .selected-card:hover,
          .job-card:hover {
            transform: translateY(-2px) scale(1.008);
            border-color: rgba(111,180,255,0.38) !important;
            box-shadow:
              0 24px 64px rgba(0,0,0,0.52),
              0 0 42px rgba(111,180,255,0.16),
              inset 0 1px 0 rgba(255,255,255,0.10) !important;
          }

          .selected-card .job-title,
          .job-card .job-title {
            font-size: 21px !important;
            line-height: 1.12 !important;
            letter-spacing: -0.03em;
          }

          .selected-card .job-address,
          .job-card .job-address {
            font-size: 14px !important;
            line-height: 1.35 !important;
            color: rgba(232,240,255,0.88) !important;
          }

          .detail {
            border-radius: 16px !important;
            background: rgba(255,255,255,0.075) !important;
            border: 1px solid rgba(255,255,255,0.10) !important;
            padding: 11px !important;
          }

          .detail span {
            font-size: 10px !important;
            font-weight: 800 !important;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(200,215,240,0.72) !important;
          }

          .detail strong {
            font-size: 14px !important;
            line-height: 1.25 !important;
            color: #ffffff !important;
          }

          .status-chip,
          .maturity-chip,
          .job-counter-chip {
            font-size: 13px !important;
            font-weight: 950 !important;
            letter-spacing: -0.02em;
            padding: 8px 11px !important;
            border-radius: 999px !important;
          }

          .card-actions button,
          .card-actions a,
          .status-actions button,
          .save-status-btn {
            min-height: 42px !important;
            border-radius: 15px !important;
            font-size: 13px !important;
            font-weight: 900 !important;
            transition:
              transform 150ms ease,
              filter 150ms ease,
              box-shadow 150ms ease !important;
          }

          .card-actions button:active,
          .card-actions a:active,
          .status-actions button:active,
          .save-status-btn:active {
            transform: scale(0.965);
            filter: brightness(1.12);
          }

          .status-card-noaccess {
            border-color: rgba(71,163,255,0.48) !important;
            background:
              radial-gradient(circle at top left, rgba(71,163,255,0.28), transparent 40%),
              linear-gradient(180deg, rgba(11, 32, 58, 0.98), rgba(6, 14, 28, 0.98)) !important;
          }

          .status-card-completed {
            border-color: rgba(83,230,156,0.48) !important;
            background:
              radial-gradient(circle at top left, rgba(83,230,156,0.24), transparent 40%),
              linear-gradient(180deg, rgba(7, 43, 32, 0.98), rgba(6, 14, 22, 0.98)) !important;
          }

          .status-card-refused {
            border-color: rgba(255,77,95,0.54) !important;
            background:
              radial-gradient(circle at top left, rgba(255,77,95,0.26), transparent 40%),
              linear-gradient(180deg, rgba(54, 13, 22, 0.98), rgba(16, 8, 15, 0.98)) !important;
          }

          .status-card-otherdone {
            border-color: rgba(184,117,255,0.48) !important;
            background:
              radial-gradient(circle at top left, rgba(184,117,255,0.24), transparent 40%),
              linear-gradient(180deg, rgba(35, 18, 58, 0.98), rgba(11, 8, 24, 0.98)) !important;
          }

          .maturity-marker-bubble strong {
            font-size: 11px !important;
            font-weight: 1000 !important;
            letter-spacing: -0.05em;
            white-space: nowrap;
          }

          .maturity-marker-bubble {
            min-width: 86px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          /* COMPACT_STATUS_LABELS_2026 */
          .maturity-marker-bubble {
            min-width: 96px !important;
            max-width: 112px !important;
            height: 38px !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            overflow: visible !important;
          }

          .maturity-marker-bubble strong {
            display: block !important;
            width: 100% !important;
            max-width: 104px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 10px !important;
            line-height: 1.05 !important;
            font-weight: 1000 !important;
            letter-spacing: -0.04em !important;
          }

          .maturity-marker-bubble.marker-ready-revisit {
            min-width: 112px !important;
            max-width: 124px !important;
          }

          .maturity-marker-bubble.marker-ready-revisit strong {
            max-width: 116px !important;
            font-size: 10px !important;
          }

          .status-marker-completed,
          .status-marker-refused,
          .status-marker-noaccess1,
          .status-marker-noaccess2,
          .status-marker-otherdone {
            border-width: 2px !important;
          }
          /* TWO_LINE_MARKER_LABELS_2026 */
          .maturity-marker-bubble {
            min-width: 118px !important;
            max-width: 132px !important;
            height: 46px !important;
            padding: 5px 8px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            overflow: visible !important;
          }

          .maturity-marker-bubble strong {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 1px !important;
            width: 100% !important;
            max-width: 120px !important;
            line-height: 1.02 !important;
            white-space: normal !important;
            overflow: hidden !important;
          }

          .marker-label-main {
            display: block !important;
            max-width: 118px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 9.5px !important;
            font-weight: 1000 !important;
            letter-spacing: -0.035em !important;
            line-height: 1.02 !important;
          }

          .marker-label-date {
            display: block !important;
            max-width: 118px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 11px !important;
            font-weight: 1000 !important;
            letter-spacing: -0.025em !important;
            line-height: 1.02 !important;
          }

          .maturity-marker-bubble.marker-ready-revisit {
            min-width: 124px !important;
            max-width: 138px !important;
          }

          .maturity-marker-bubble.marker-ready-revisit .marker-label-main {
            color: #04101f !important;
            font-size: 10px !important;
          }

          .maturity-marker-bubble.marker-ready-revisit .marker-label-date {
            color: #04101f !important;
            font-size: 12px !important;
          }
          /* WORKFLOW_FILTER_CSS_OK */
          .workflow-filter-bar {
            position: fixed;
            left: 12px;
            right: 12px;
            top: 82px;
            z-index: 1200;
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding: 8px;
            border-radius: 18px;
            background: rgba(4, 12, 28, 0.78);
            border: 1px solid rgba(255,255,255,0.12);
            backdrop-filter: blur(16px);
            box-shadow: 0 18px 50px rgba(0,0,0,0.28);
          }

          .workflow-filter-bar button {
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.86);
            border-radius: 999px;
            padding: 9px 12px;
            font-weight: 900;
            font-size: 12px;
            white-space: nowrap;
          }

          .workflow-filter-bar button.active {
            background: linear-gradient(135deg, #27e2b6, #6fb4ff);
            color: #04101f;
            border-color: transparent;
          }

          /* CLEAN_FIELD_MAP_2026 */
          .map-health-panel,
          .ai-dispatch-chat,
          .ai-job-assistant,
          .status-legend {
            display: none !important;
          }

          .compact-job-card {
            width: 100%;
            text-align: left;
            color: inherit;
            cursor: pointer;
          }

          .compact-job-card .job-main-row {
            align-items: flex-start;
          }

          .selected-card-head {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: flex-start;
            gap: 12px;
          }

          .selected-title-block {
            min-width: 0;
          }

          .selected-chip-stack {
            display: grid;
            gap: 6px;
            justify-items: end;
            min-width: 112px;
          }

          .selected-hero-actions {
            display: grid;
            grid-template-columns: minmax(0, 1.5fr) repeat(3, minmax(0, 0.72fr));
            gap: 8px;
            margin-top: 12px;
          }

          .selected-hero-actions a,
          .selected-hero-actions button {
            min-height: 44px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.08);
            color: #f8fbff;
            font-size: 12px;
            font-weight: 950;
            cursor: pointer;
          }

          .selected-hero-actions .selected-primary-action {
            background: #53e69c;
            color: #03120b;
            border-color: transparent;
            font-size: 13px;
          }

          .selected-overview-grid,
          .selected-alert-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 10px;
          }

          .overview-tile,
          .selected-alert-card {
            min-width: 0;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.07);
            border-radius: 8px;
            padding: 10px;
            color: #f8fbff;
            text-align: left;
          }

          button.overview-tile {
            cursor: pointer;
          }

          .overview-tile span,
          .selected-alert-card span,
          .selected-section-head span,
          .more-job-details summary {
            display: block;
            color: rgba(200,215,240,0.76);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 10px;
            font-weight: 950;
          }

          .overview-tile strong,
          .selected-alert-card strong {
            display: block;
            margin-top: 5px;
            color: #ffffff;
            font-size: 13px;
            line-height: 1.24;
            overflow-wrap: anywhere;
          }

          .overview-tile small,
          .selected-alert-card small {
            display: block;
            margin-top: 4px;
            color: #aebbd0;
            font-size: 11px;
            line-height: 1.28;
          }

          .selected-status-panel,
          .more-job-details {
            margin-top: 10px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.055);
            border-radius: 8px;
            padding: 10px;
          }

          .selected-section-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
          }

          .selected-section-head strong {
            color: #dfffee;
            font-size: 12px;
            text-align: right;
          }

          .selected-status-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
          }

          .selected-status-grid button,
          .description-inline-actions button {
            min-height: 36px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.08);
            color: #f8fbff;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
          }

          .clean-description-card {
            margin-top: 10px;
          }

          .clean-description-card p {
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .description-inline-actions {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
            margin-top: 10px;
          }

          .more-job-details {
            padding: 0;
            overflow: hidden;
          }

          .more-job-details summary {
            cursor: pointer;
            padding: 11px;
            color: #d9e9ff;
          }

          .compact-detail-grid {
            padding: 0 10px 10px;
          }

          .compact-job-status {
            display: grid;
            gap: 6px;
            justify-items: end;
            min-width: 104px;
          }

          .compact-info-strip {
            margin-top: 10px;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .compact-info-strip strong {
            font-size: 12px !important;
            line-height: 1.18 !important;
          }

          .package-ready-card {
            border-color: rgba(83, 230, 156, 0.32) !important;
            background: rgba(83, 230, 156, 0.11) !important;
          }

          .maturity-map-marker .maturity-marker-bubble::before {
            width: 56px !important;
            height: 56px !important;
            opacity: 0.62 !important;
            animation-duration: 6.5s !important;
          }

          .maturity-marker-bubble {
            min-width: 92px !important;
            max-width: 108px !important;
            height: 38px !important;
            padding: 4px 7px !important;
          }

          .marker-label-main {
            max-width: 96px !important;
            font-size: 8.5px !important;
          }

          .marker-label-date {
            max-width: 96px !important;
            font-size: 10px !important;
          }

          .maturity-marker-bubble.marker-ready-revisit {
            min-width: 104px !important;
            max-width: 116px !important;
            height: 40px !important;
            animation-duration: 4.8s !important;
          }

          .maturity-marker-bubble.marker-ready-revisit::before {
            width: 76px !important;
            height: 76px !important;
            box-shadow:
              0 0 0 7px rgba(83,230,156,0.18),
              0 0 34px rgba(83,230,156,0.62),
              0 0 72px rgba(255,209,102,0.34) !important;
            animation-duration: 4.8s !important;
          }

          .ready-revisit-alert {
            animation-duration: 5.8s !important;
          }

          @keyframes revisitMarkerPulse {
            0%, 100% {
              transform: scale(1);
              filter: brightness(1);
            }
            50% {
              transform: scale(1.045);
              filter: brightness(1.08);
            }
          }

          @keyframes revisitHaloPulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(0.92);
              opacity: 0.44;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.12);
              opacity: 0.72;
            }
          }

          @keyframes readyAlertPulse {
            0%, 100% {
              box-shadow:
                0 0 0 2px rgba(83,230,156,0.08),
                0 0 22px rgba(83,230,156,0.18),
                0 16px 44px rgba(0,0,0,0.46);
            }
            50% {
              box-shadow:
                0 0 0 5px rgba(83,230,156,0.14),
                0 0 38px rgba(83,230,156,0.30),
                0 16px 44px rgba(0,0,0,0.46);
            }
          }

          @media (max-width: 720px) {
            .map-stats {
              right: 10px !important;
              grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            }

            .map-stat {
              padding: 7px !important;
              border-radius: 10px !important;
            }

            .map-stat strong {
              font-size: 14px !important;
            }

            .map-stat span {
              font-size: 9px !important;
            }

            .compact-info-strip {
              grid-template-columns: 1fr !important;
            }

            .compact-job-status {
              min-width: 88px;
            }

            .selected-card-head {
              grid-template-columns: 1fr;
            }

            .selected-chip-stack {
              grid-template-columns: repeat(2, max-content);
              justify-items: start;
              min-width: 0;
            }

            .selected-hero-actions {
              grid-template-columns: 1fr 1fr;
            }

            .selected-hero-actions .selected-primary-action {
              grid-column: 1 / -1;
              min-height: 50px;
            }

            .selected-overview-grid,
            .selected-alert-grid,
            .selected-status-grid,
            .description-inline-actions {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          /* LIGHT_INTERACTIVE_MAP_2026 */
          .map-shell,
          .map-shell.full-map-mode {
            background: #eef4f8 !important;
            color: #172033 !important;
          }

          .map-top {
            background: rgba(248, 251, 253, 0.95) !important;
            border-bottom: 1px solid rgba(126, 146, 169, 0.28) !important;
            box-shadow: 0 10px 28px rgba(31, 47, 70, 0.08) !important;
          }

          .map-title-row h1,
          .drawer-head strong,
          .job-title,
          .overview-tile strong,
          .selected-alert-card strong,
          .detail strong {
            color: #172033 !important;
          }

          .map-title-row p,
          .job-sub,
          .job-address,
          .overview-tile small,
          .selected-alert-card small,
          .detail span,
          .more-job-details summary,
          .selected-section-head span {
            color: #5d7088 !important;
          }

          .home-btn,
          .drawer-head button,
          .map-search input,
          .map-filter-row button,
          .workflow-filter-bar button,
          .zoom-panel button {
            background: #ffffff !important;
            color: #172033 !important;
            border: 1px solid rgba(126, 146, 169, 0.32) !important;
            box-shadow: 0 8px 20px rgba(31, 47, 70, 0.08) !important;
          }

          .jobs-toggle,
          .map-filter-row button.active,
          .workflow-filter-bar button.active {
            background: linear-gradient(135deg, #bde7ff, #c8f7dc) !important;
            color: #113047 !important;
            border-color: rgba(75, 133, 168, 0.22) !important;
          }

          .job-drawer {
            background: rgba(248, 251, 253, 0.96) !important;
            border: 1px solid rgba(126, 146, 169, 0.28) !important;
            box-shadow: 0 -16px 48px rgba(31, 47, 70, 0.18) !important;
            color: #172033 !important;
            transition:
              transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
              max-height 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 220ms ease,
              box-shadow 220ms ease !important;
          }

          .job-drawer.closed {
            opacity: 0.94;
            transform: translateY(calc(100% - 64px));
          }

          .workflow-filter-bar {
            background: rgba(248, 251, 253, 0.90) !important;
            border: 1px solid rgba(126, 146, 169, 0.26) !important;
            box-shadow: 0 12px 34px rgba(31, 47, 70, 0.12) !important;
          }

          .selected-card,
          .job-card,
          .job-status-card {
            background: #ffffff !important;
            color: #172033 !important;
            border: 1px solid rgba(126, 146, 169, 0.28) !important;
            box-shadow:
              0 18px 46px rgba(31, 47, 70, 0.14),
              inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
          }

          .selected-card {
            animation: selectedLightCardIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
            transform-origin: bottom center;
          }

          @keyframes selectedLightCardIn {
            0% {
              opacity: 0;
              transform: translateY(18px) scale(0.985);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .compact-job-card,
          .overview-tile,
          .selected-hero-actions a,
          .selected-hero-actions button,
          .selected-status-grid button,
          .description-inline-actions button {
            transition:
              transform 170ms ease,
              box-shadow 170ms ease,
              border-color 170ms ease,
              background-color 170ms ease,
              filter 170ms ease !important;
          }

          .compact-job-card:hover,
          .overview-tile:hover,
          .selected-hero-actions a:hover,
          .selected-hero-actions button:hover,
          .selected-status-grid button:hover,
          .description-inline-actions button:hover {
            transform: translateY(-2px);
            border-color: rgba(64, 126, 170, 0.38) !important;
            box-shadow: 0 14px 30px rgba(31, 47, 70, 0.14) !important;
          }

          .compact-job-card:active,
          .overview-tile:active,
          .selected-hero-actions a:active,
          .selected-hero-actions button:active,
          .selected-status-grid button:active,
          .description-inline-actions button:active {
            transform: scale(0.975);
          }

          .selected-hero-actions a,
          .selected-hero-actions button,
          .selected-status-grid button,
          .description-inline-actions button {
            background: #f8fbfd !important;
            color: #172033 !important;
            border-color: rgba(126, 146, 169, 0.30) !important;
            box-shadow: 0 8px 18px rgba(31, 47, 70, 0.08) !important;
          }

          .selected-hero-actions .selected-primary-action {
            background: linear-gradient(135deg, #6ee7b7, #93c5fd) !important;
            color: #082033 !important;
            box-shadow: 0 14px 32px rgba(54, 148, 130, 0.22) !important;
          }

          .selected-overview-grid,
          .selected-alert-grid {
            gap: 10px;
          }

          .overview-tile,
          .selected-alert-card,
          .selected-status-panel,
          .more-job-details,
          .clean-description-card,
          .workflow-save-panel,
          .detail {
            background: #f8fbfd !important;
            border-color: rgba(126, 146, 169, 0.24) !important;
            color: #172033 !important;
          }

          .package-ready-card {
            background: #ecfdf5 !important;
            border-color: rgba(34, 197, 94, 0.28) !important;
          }

          .no-access-timer-card {
            background: #fff7ed !important;
            border-color: rgba(249, 115, 22, 0.26) !important;
          }

          .status {
            background: #edf5ff !important;
            color: #23415f !important;
          }

          .maturity-pill {
            background: #ecfdf5 !important;
            color: #14532d !important;
          }

          .maturity-marker-bubble {
            background: #ffffff !important;
            color: #172033 !important;
            border-color: #60a5fa !important;
            box-shadow: 0 10px 22px rgba(31, 47, 70, 0.20) !important;
          }

          .maturity-marker-bubble strong,
          .marker-label-main,
          .marker-label-date {
            color: #172033 !important;
          }

          .maturity-marker-bubble.marker-ready-revisit {
            background: linear-gradient(135deg, #bbf7d0, #fde68a) !important;
            color: #17330e !important;
            box-shadow: 0 12px 28px rgba(68, 118, 60, 0.26) !important;
          }

          .ready-revisit-alert {
            background: #ffffff !important;
            color: #172033 !important;
            border-color: rgba(34, 197, 94, 0.28) !important;
            box-shadow: 0 16px 36px rgba(31, 47, 70, 0.16) !important;
          }

          .ready-revisit-alert strong {
            color: #166534 !important;
          }

          .ready-revisit-alert span {
            color: #3c536c !important;
          }

          .ready-revisit-alert button {
            background: #dcfce7 !important;
            color: #14532d !important;
          }

          .field-photo-input {
            position: fixed;
            width: 1px;
            height: 1px;
            opacity: 0;
            pointer-events: none;
          }

          .location-status-pill {
            position: absolute;
            left: 12px;
            bottom: 12px;
            z-index: 900;
            max-width: min(280px, calc(100vw - 130px));
            padding: 9px 12px;
            border-radius: 999px;
            border: 1px solid rgba(126, 146, 169, 0.28);
            background: rgba(255, 255, 255, 0.92);
            color: #3c536c;
            font-size: 12px;
            font-weight: 900;
            box-shadow: 0 10px 24px rgba(31, 47, 70, 0.12);
          }

          .location-status-pill.active {
            color: #1d4ed8;
            border-color: rgba(37, 99, 235, 0.28);
            background: rgba(239, 246, 255, 0.94);
          }

          .user-location-marker {
            background: transparent !important;
            border: 0 !important;
          }

          .user-location-dot {
            position: relative;
            width: 64px;
            height: 64px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            background: rgba(37, 99, 235, 0.14);
            border: 2px solid rgba(255, 255, 255, 0.92);
            box-shadow:
              0 0 0 9px rgba(37, 99, 235, 0.16),
              0 12px 30px rgba(3, 9, 16, 0.32);
          }

          .user-location-dot::before {
            content: "";
            position: absolute;
            inset: 8px;
            border-radius: 999px;
            background: rgba(37, 99, 235, 0.18);
            animation: userLocationGuidePulse 2.8s ease-out infinite;
          }

          .user-location-dot em {
            position: absolute;
            top: -5px;
            left: 50%;
            z-index: 2;
            transform: translateX(-50%);
            padding: 3px 7px;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.95);
            color: #ffffff;
            font-size: 9px;
            font-style: normal;
            font-weight: 1000;
            letter-spacing: 0;
            box-shadow: 0 8px 18px rgba(3, 9, 16, 0.24);
          }

          .user-location-dot span {
            position: relative;
            z-index: 1;
            width: 22px;
            height: 22px;
            border-radius: 999px;
            background: #ef4444;
            border: 4px solid #ffffff;
            box-shadow:
              0 0 0 5px rgba(250, 204, 21, 0.45),
              0 8px 18px rgba(239, 68, 68, 0.36);
          }

          @keyframes userLocationGuidePulse {
            0% {
              transform: scale(0.78);
              opacity: 0.75;
            }
            70% {
              transform: scale(1.35);
              opacity: 0;
            }
            100% {
              transform: scale(1.35);
              opacity: 0;
            }
          }

          .today-route-card,
          .field-workflow-card {
            background: #ffffff !important;
            border: 1px solid rgba(126, 146, 169, 0.28) !important;
            border-radius: 16px;
            color: #172033 !important;
            box-shadow: 0 16px 38px rgba(31, 47, 70, 0.12);
          }

          .today-route-card {
            display: grid;
            gap: 10px;
            padding: 13px;
            margin-bottom: 12px;
          }

          .today-route-card > div:first-child,
          .field-workflow-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }

          .today-route-card span,
          .field-workflow-card span,
          .field-workflow-card small {
            color: #5d7088;
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .today-route-card strong,
          .field-workflow-card strong {
            color: #172033;
          }

          .today-route-card > button {
            min-height: 44px;
            border: 0;
            border-radius: 12px;
            background: linear-gradient(135deg, #6ee7b7, #93c5fd);
            color: #082033;
            font-weight: 1000;
          }

          .today-route-list {
            display: grid;
            gap: 8px;
          }

          .today-route-list button {
            display: grid;
            grid-template-columns: 82px minmax(0, 1fr);
            gap: 8px;
            align-items: center;
            text-align: left;
            min-height: 42px;
            padding: 9px 10px;
            border-radius: 12px;
            border: 1px solid rgba(126, 146, 169, 0.24);
            background: #f8fbfd;
            color: #172033;
          }

          .today-route-list button span {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            text-transform: none;
            letter-spacing: 0;
          }

          .field-workflow-card {
            display: grid;
            gap: 12px;
            padding: 14px;
            margin: 12px 0;
          }

          .field-workflow-head strong {
            display: block;
            margin-top: 3px;
          }

          .field-timer-pill {
            flex: none;
            padding: 8px 10px;
            border-radius: 999px;
            background: #eef6ff;
            color: #1d4ed8 !important;
            border: 1px solid rgba(37, 99, 235, 0.18);
          }

          .field-flow-dock {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 9px;
            scroll-margin-top: 120px;
          }

          .field-flow-dock button {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            align-items: center;
            column-gap: 9px;
            min-height: 72px;
            padding: 10px;
            text-align: left;
            border: 1px solid rgba(126, 146, 169, 0.24);
            border-radius: 12px;
            background: #ffffff;
            color: #172033;
            box-shadow: 0 10px 22px rgba(31, 47, 70, 0.10);
            transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
          }

          .field-flow-dock button:hover,
          .field-flow-dock button.active {
            transform: translateY(-2px) scale(1.015);
            box-shadow: 0 16px 32px rgba(31, 47, 70, 0.18);
          }

          .field-flow-dock .flow-icon {
            grid-row: span 2;
            width: 36px;
            height: 36px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            color: #061019;
            font-size: 15px;
            font-weight: 1000;
          }

          .field-flow-dock button strong {
            color: inherit !important;
            font-size: 13px;
            line-height: 1.1;
          }

          .field-flow-dock button small {
            color: inherit !important;
            opacity: 0.74;
            text-transform: none !important;
            letter-spacing: 0 !important;
            line-height: 1.15;
          }

          .field-flow-dock .capture {
            background: #e8fbf4;
            border-color: rgba(20, 184, 166, 0.28);
            color: #0f5132;
          }

          .field-flow-dock .capture .flow-icon {
            background: #42d6b5;
          }

          .field-flow-dock .evidence {
            background: #e8f2ff;
            border-color: rgba(37, 99, 235, 0.24);
            color: #123c70;
          }

          .field-flow-dock .evidence .flow-icon {
            background: #7db7ff;
          }

          .field-flow-dock .package {
            background: #fff5d8;
            border-color: rgba(217, 119, 6, 0.24);
            color: #684300;
          }

          .field-flow-dock .package .flow-icon {
            background: #f2c86b;
          }

          .field-flow-dock .send {
            background: #f0edff;
            border-color: rgba(124, 58, 237, 0.24);
            color: #4f35a3;
          }

          .field-flow-dock .send .flow-icon {
            background: #a99cff;
          }

          .field-pane {
            scroll-margin-top: 130px;
            transform-origin: center;
            transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
          }

          .field-pane.is-active {
            transform: scale(1.012);
            border-color: rgba(66, 214, 181, 0.44) !important;
            box-shadow: 0 18px 42px rgba(6, 11, 18, 0.22) !important;
          }

          .field-workflow-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .field-workflow-grid div {
            min-height: 62px;
            padding: 10px;
            border-radius: 12px;
            border: 1px solid rgba(126, 146, 169, 0.22);
            background: #f8fbfd;
          }

          .field-workflow-grid strong {
            display: block;
            margin-top: 5px;
            font-size: 13px;
            overflow-wrap: anywhere;
          }

          .field-step-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .field-step-actions button {
            min-height: 48px;
            border-radius: 12px;
            border: 1px solid rgba(126, 146, 169, 0.28);
            background: #f8fbfd;
            color: #172033;
            font-size: 13px;
            font-weight: 1000;
            transition:
              transform 170ms ease,
              box-shadow 170ms ease,
              border-color 170ms ease,
              filter 170ms ease;
          }

          .field-step-actions button:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 26px rgba(31, 47, 70, 0.13);
          }

          .field-step-actions button:active {
            transform: scale(0.975);
          }

          .field-step-actions .start-job-btn {
            background: linear-gradient(135deg, #bbf7d0, #bfdbfe);
            color: #082033;
          }

          .field-step-actions .finish-job-btn {
            background: linear-gradient(135deg, #d9f99d, #86efac);
            color: #12310f;
          }

          .field-step-actions .no-access-job-btn {
            background: #fff7ed;
            color: #9a3412;
            border-color: rgba(249, 115, 22, 0.28);
          }

          .field-step-actions .refused-job-btn {
            background: #fff1f2;
            color: #9f1239;
            border-color: rgba(244, 63, 94, 0.26);
          }

          .field-step-actions .other-done-job-btn {
            background: #f5f3ff;
            color: #5b21b6;
            border-color: rgba(124, 58, 237, 0.24);
          }

          .field-step-actions .packet-job-btn {
            background: #e8f7ff;
            color: #0f3b57;
            border-color: rgba(14, 116, 144, 0.24);
          }

          .field-step-actions .email-job-btn {
            background: #e8fff3;
            color: #0f5132;
            border-color: rgba(22, 163, 74, 0.24);
          }

          .field-step-actions .upload-job-btn {
            background: #f6f0ff;
            color: #4f35a3;
            border-color: rgba(124, 58, 237, 0.22);
          }

          /* BALANCED_FIELD_COMMAND_2026 */
          .map-shell,
          .map-shell.full-map-mode {
            background: #121820 !important;
            color: #f7f9fc !important;
          }

          .map-top {
            background: linear-gradient(180deg, rgba(18, 24, 32, 0.98), rgba(25, 34, 45, 0.96)) !important;
            border-bottom: 1px solid rgba(222, 230, 240, 0.16) !important;
            box-shadow: 0 12px 30px rgba(6, 11, 18, 0.28) !important;
          }

          .map-title-row h1,
          .drawer-head strong,
          .selected-card .job-title,
          .job-card .job-title {
            color: #f8fafc !important;
            letter-spacing: 0 !important;
          }

          .map-title-row p,
          .selected-card .job-address,
          .selected-card .job-sub,
          .job-card .job-address,
          .job-card .job-sub {
            color: #c7d2df !important;
          }

          .home-btn,
          .drawer-head button,
          .map-search input,
          .map-filter-row button,
          .workflow-filter-bar button,
          .zoom-panel button {
            background: rgba(247, 249, 252, 0.08) !important;
            color: #f8fafc !important;
            border: 1px solid rgba(222, 230, 240, 0.16) !important;
            box-shadow: none !important;
          }

          .map-search input::placeholder {
            color: rgba(222, 230, 240, 0.64);
          }

          .jobs-toggle,
          .map-filter-row button.active,
          .workflow-filter-bar button.active {
            background: linear-gradient(135deg, #42d6b5, #7db7ff) !important;
            color: #061019 !important;
            border-color: transparent !important;
          }

          .job-drawer {
            background: linear-gradient(180deg, rgba(18, 24, 32, 0.98), rgba(24, 33, 44, 0.98)) !important;
            border: 1px solid rgba(222, 230, 240, 0.15) !important;
            box-shadow: 0 -18px 52px rgba(6, 11, 18, 0.42) !important;
            color: #f8fafc !important;
          }

          .workflow-filter-bar {
            background: rgba(18, 24, 32, 0.92) !important;
            border: 1px solid rgba(222, 230, 240, 0.14) !important;
            box-shadow: 0 16px 42px rgba(6, 11, 18, 0.30) !important;
          }

          .selected-card,
          .job-card,
          .job-status-card {
            border-radius: 14px !important;
            border: 1px solid rgba(222, 230, 240, 0.16) !important;
            background:
              radial-gradient(circle at top left, rgba(66, 214, 181, 0.14), transparent 34%),
              linear-gradient(180deg, #17202b, #101820) !important;
            color: #f8fafc !important;
            box-shadow:
              0 18px 46px rgba(6, 11, 18, 0.36),
              inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
          }

          .selected-card {
            display: grid;
            gap: 12px;
          }

          .selected-card:hover,
          .job-card:hover {
            border-color: rgba(125, 183, 255, 0.38) !important;
            box-shadow:
              0 24px 62px rgba(6, 11, 18, 0.44),
              0 0 34px rgba(66, 214, 181, 0.12) !important;
          }

          .selected-hero-actions {
            margin-top: 0 !important;
          }

          .selected-hero-actions a,
          .selected-hero-actions button,
          .field-step-actions button,
          .selected-status-grid button,
          .description-inline-actions button {
            border-radius: 8px !important;
            box-shadow: none !important;
          }

          .selected-hero-actions a,
          .selected-hero-actions button {
            background: rgba(247, 249, 252, 0.08) !important;
            border-color: rgba(222, 230, 240, 0.14) !important;
            color: #f8fafc !important;
          }

          .selected-hero-actions .selected-primary-action {
            background: linear-gradient(135deg, #42d6b5, #f2c86b) !important;
            color: #081016 !important;
          }

          .overview-tile,
          .selected-alert-card,
          .selected-status-panel,
          .more-job-details,
          .clean-description-card,
          .workflow-save-panel,
          .detail,
          .field-workflow-card {
            border-radius: 8px !important;
            background: #f7f9fc !important;
            border: 1px solid #d9e1eb !important;
            color: #16202b !important;
            box-shadow: 0 10px 24px rgba(6, 11, 18, 0.14) !important;
          }

          .overview-tile span,
          .selected-alert-card span,
          .selected-section-head span,
          .more-job-details summary,
          .field-workflow-card span,
          .field-workflow-card small,
          .detail span {
            color: #5d6f82 !important;
            letter-spacing: 0 !important;
          }

          .overview-tile strong,
          .selected-alert-card strong,
          .field-workflow-card strong,
          .detail strong,
          .more-job-details summary {
            color: #16202b !important;
          }

          .field-workflow-card {
            gap: 10px !important;
            margin: 0 !important;
            padding: 12px !important;
          }

          .field-workflow-head {
            padding: 10px !important;
            border-radius: 8px;
            background: #16202b;
            border: 1px solid rgba(222, 230, 240, 0.12);
          }

          .field-workflow-head span,
          .field-workflow-head strong {
            color: #f8fafc !important;
          }

          .field-timer-pill {
            background: #f2c86b !important;
            color: #261b03 !important;
            border-color: transparent !important;
          }

          .field-workflow-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .field-workflow-grid div {
            min-height: 58px !important;
            border-radius: 8px !important;
            background: #ffffff !important;
            border-color: #d9e1eb !important;
          }

          .field-step-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .field-step-actions button {
            min-height: 44px !important;
            background: #ffffff !important;
            color: #16202b !important;
            border-color: #d9e1eb !important;
            font-size: 12px !important;
          }

          .field-step-actions .start-job-btn {
            background: linear-gradient(135deg, #42d6b5, #7db7ff) !important;
            color: #061019 !important;
          }

          .field-step-actions .finish-job-btn {
            background: linear-gradient(135deg, #7ddc93, #f2c86b) !important;
            color: #081016 !important;
          }

          .field-step-actions .reset-job-btn {
            background: #1f2935 !important;
            color: #f8fafc !important;
            border-color: rgba(248, 250, 252, 0.22) !important;
          }

          .field-step-actions .no-access-job-btn {
            background: #fff6e6 !important;
            color: #7c3f00 !important;
            border-color: #f3cf99 !important;
          }

          .field-step-actions .refused-job-btn {
            background: #fff1f3 !important;
            color: #8f1d35 !important;
            border-color: #f1b8c3 !important;
          }

          .field-step-actions .other-done-job-btn {
            background: #f0edff !important;
            color: #4f35a3 !important;
            border-color: #cec5ff !important;
          }

          .field-step-actions .packet-job-btn {
            background: #dff3ff !important;
            color: #0f3b57 !important;
            border-color: #a9d9ef !important;
          }

          .field-step-actions .email-job-btn {
            background: #ddfaec !important;
            color: #0f5132 !important;
            border-color: #aee8ca !important;
          }

          .field-step-actions .upload-job-btn {
            background: #f0edff !important;
            color: #4f35a3 !important;
            border-color: #cec5ff !important;
          }

          .field-capture-guide {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            position: sticky;
            top: 8px;
            z-index: 16;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #d7a83d;
            background: linear-gradient(135deg, #fff7df, #e8f7ff);
            color: #16202b;
            box-shadow: 0 18px 42px rgba(5, 11, 20, 0.34);
          }

          .field-capture-guide span,
          .field-capture-guide small {
            display: block;
            color: #5d4a17 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }

          .field-capture-guide strong {
            display: block;
            margin: 3px 0;
            color: #16202b !important;
          }

          .field-capture-guide button {
            min-height: 50px;
            min-width: 132px;
            border: 0;
            border-radius: 8px;
            background: #16202b;
            color: #f8fafc;
            padding: 0 13px;
            font-size: 13px;
            font-weight: 950;
          }

          .field-capture-actions {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .field-capture-actions button {
            min-width: 0;
            white-space: normal;
            line-height: 1.1;
            padding: 9px 10px;
            background: #f8fafc;
            color: #16202b;
            border: 1px solid rgba(22, 32, 43, 0.18);
          }

          .field-capture-actions button.primary {
            background: #16202b;
            color: #f8fafc;
          }

          .field-evidence-gallery {
            display: grid;
            gap: 10px;
            padding: 10px;
            border-radius: 10px;
            border: 1px solid rgba(248, 250, 252, 0.14);
            background:
              radial-gradient(circle at top right, rgba(125, 183, 255, 0.12), transparent 38%),
              #111923;
            color: #f8fafc;
          }

          .field-evidence-gallery.has-evidence {
            border-color: rgba(66, 214, 181, 0.30);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
          }

          .field-evidence-gallery-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          }

          .field-evidence-gallery-head span,
          .field-evidence-gallery-head small {
            color: #aab7c6 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }

          .field-evidence-gallery-head strong {
            display: block;
            margin-top: 2px;
            color: #f8fafc !important;
          }

          .field-evidence-gallery-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .field-evidence-gallery-item {
            min-width: 0;
            overflow: hidden;
            border-radius: 10px;
            border: 1px solid rgba(248, 250, 252, 0.14);
            background: #1b2633;
          }

          .field-evidence-gallery-preview {
            aspect-ratio: 4 / 3;
            display: grid;
            place-items: center;
            overflow: hidden;
            background: #0d141d;
            color: #d8e2ee;
            font-size: 12px;
            font-weight: 950;
          }

          .field-evidence-gallery-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }

          .field-evidence-gallery-meta {
            display: grid;
            gap: 2px;
            padding: 8px;
          }

          .field-evidence-gallery-meta strong {
            color: #f8fafc !important;
            font-size: 12px !important;
            line-height: 1.2;
            overflow-wrap: anywhere;
          }

          .field-evidence-gallery-meta span,
          .field-evidence-gallery-meta small,
          .field-evidence-gallery-empty span {
            color: #aab7c6 !important;
            font-size: 11px !important;
            line-height: 1.2;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }

          .field-evidence-gallery-empty {
            display: grid;
            gap: 2px;
            padding: 12px;
            border-radius: 8px;
            border: 1px dashed rgba(248, 250, 252, 0.18);
            background: rgba(248, 250, 252, 0.05);
          }

          .field-evidence-gallery-empty strong {
            color: #f8fafc !important;
          }

          .field-evidence-rail {
            display: grid;
            gap: 9px;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #d9e1eb;
            background: #ffffff;
          }

          .field-evidence-rail.compact {
            display: none;
          }

          .field-evidence-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          }

          .field-evidence-head small {
            max-width: 48%;
            text-align: right;
            text-transform: none !important;
            letter-spacing: 0 !important;
            line-height: 1.25;
          }

          .field-evidence-list {
            display: grid;
            gap: 8px;
          }

          .field-evidence-item {
            display: grid;
            grid-template-columns: 58px minmax(0, 1fr);
            gap: 9px;
            min-height: 64px;
            padding: 7px;
            border-radius: 8px;
            border: 1px solid #d9e1eb;
            background: #f7f9fc;
          }

          .field-evidence-item.before {
            border-left: 4px solid #42d6b5;
          }

          .field-evidence-item.after {
            border-left: 4px solid #7ddc93;
          }

          .field-evidence-item.no-access {
            border-left: 4px solid #f2c86b;
          }

          .field-evidence-item.refused-access {
            border-left: 4px solid #ef6f86;
          }

          .field-evidence-item.completed-by-others {
            border-left: 4px solid #8f7dff;
          }

          .field-evidence-thumb {
            width: 58px;
            height: 50px;
            display: grid;
            place-items: center;
            overflow: hidden;
            border-radius: 8px;
            background: #16202b;
            color: #f8fafc;
            font-size: 11px;
            font-weight: 950;
          }

          .field-evidence-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }

          .field-evidence-copy {
            min-width: 0;
            display: grid;
            align-content: center;
            gap: 2px;
          }

          .field-evidence-copy strong {
            color: #16202b !important;
            font-size: 13px !important;
            line-height: 1.2;
            overflow-wrap: anywhere;
          }

          .field-evidence-copy span,
          .field-evidence-copy small,
          .field-evidence-empty span {
            color: #5d6f82 !important;
            font-size: 11px !important;
            line-height: 1.2;
            text-transform: none !important;
            letter-spacing: 0 !important;
            overflow-wrap: anywhere;
          }

          .field-evidence-empty {
            display: grid;
            gap: 2px;
            padding: 10px;
            border-radius: 8px;
            border: 1px dashed #b8c4d2;
            background: #f7f9fc;
          }

          .field-evidence-empty strong {
            color: #16202b !important;
          }

          .field-packet-vault,
          .field-send-panel {
            display: grid;
            gap: 10px;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid rgba(126, 146, 169, 0.24);
            background: #ffffff;
            color: #172033;
          }

          .field-packet-head,
          .field-send-panel {
            align-items: center;
          }

          .field-packet-head,
          .field-packet-row {
            display: grid;
            gap: 9px;
          }

          .field-packet-head {
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .field-packet-row {
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .field-send-actions {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .field-send-actions.single {
            grid-template-columns: 1fr;
          }

          .field-send-actions.two {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .field-packet-head small,
          .field-packet-row span,
          .field-packet-row small,
          .field-packet-empty span,
          .field-send-panel small {
            color: #5d7088 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
            line-height: 1.25;
            overflow-wrap: anywhere;
          }

          .field-packet-list {
            display: grid;
            gap: 8px;
          }

          .field-packet-row {
            align-items: center;
            padding: 9px;
            border-radius: 10px;
            border: 1px solid rgba(126, 146, 169, 0.22);
            background: #f8fbfd;
          }

          .field-packet-row strong {
            display: block;
            color: #172033 !important;
            font-size: 12px !important;
            line-height: 1.25;
            overflow-wrap: anywhere;
          }

          .field-packet-row button,
          .field-send-panel button {
            min-height: 40px;
            border: 0;
            border-radius: 9px;
            padding: 0 12px;
            background: #16202b;
            color: #f8fafc;
            font-weight: 950;
          }

          .field-packet-row button:last-child,
          .field-send-panel button {
            background: #0f8d68;
          }

          .field-send-actions button:first-child {
            background: #155eef;
          }

          .field-send-actions button:nth-child(2) {
            background: #0f8d68;
          }

          .field-packet-row.full_evidence_zip {
            border-color: rgba(21, 94, 239, 0.34);
            background: #f1f7ff;
          }

          .field-package-preview {
            display: grid;
            gap: 10px;
            padding: 11px;
            border-radius: 10px;
            border: 1px solid rgba(21, 94, 239, 0.18);
            background: #f1f7ff;
          }

          .field-package-preview > div:first-child {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
          }

          .field-package-preview span {
            color: #5d7088 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }

          .field-package-preview strong {
            color: #172033 !important;
          }

          .field-package-preview-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 7px;
          }

          .field-package-preview-grid span {
            display: grid;
            gap: 2px;
            min-height: 46px;
            align-content: center;
            padding: 7px;
            border-radius: 8px;
            background: #ffffff;
            border: 1px solid rgba(126, 146, 169, 0.22);
            font-size: 10px;
          }

          .field-package-video-list {
            display: grid;
            gap: 5px;
            padding: 9px;
            border-radius: 8px;
            background: #ffffff;
            border: 1px solid rgba(126, 146, 169, 0.22);
          }

          .field-package-video-list strong,
          .field-package-video-list span {
            overflow-wrap: anywhere;
          }

          .field-package-video-list strong {
            color: #172033 !important;
            font-size: 11px !important;
          }

          .field-package-video-list span {
            color: #31526f !important;
            font-size: 11px !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }

          .field-packet-empty {
            display: grid;
            gap: 3px;
            padding: 12px;
            border-radius: 10px;
            border: 1px dashed rgba(126, 146, 169, 0.34);
            background: #f8fbfd;
          }

          /* FIELD_APP_CLEAN_MAP_2026 */
          .job-drawer.selected-focus .workflow-filter-bar {
            display: none !important;
          }

          .selected-card {
            padding: 12px !important;
            background:
              radial-gradient(circle at top left, rgba(66, 214, 181, 0.12), transparent 30%),
              linear-gradient(180deg, #182332, #101821) !important;
          }

          .selected-card-head {
            padding: 11px !important;
            border-radius: 10px;
            background: #0e151e;
            border: 1px solid rgba(248, 250, 252, 0.10);
          }

          .selected-chip-stack .status,
          .selected-chip-stack .maturity-pill {
            background: rgba(248, 250, 252, 0.10) !important;
            color: #f8fafc !important;
            border: 1px solid rgba(248, 250, 252, 0.12);
          }

          .field-workflow-card {
            background: #202b38 !important;
            border-color: rgba(248, 250, 252, 0.12) !important;
            color: #f8fafc !important;
            box-shadow: none !important;
          }

          .field-workflow-card span,
          .field-workflow-card small {
            color: #aab7c6 !important;
          }

          .field-workflow-card strong {
            color: #f8fafc !important;
          }

          .field-workflow-grid div {
            background: #131c26 !important;
            border-color: rgba(248, 250, 252, 0.10) !important;
          }

          .field-flow-dock button {
            background: #131c26 !important;
            color: #f8fafc !important;
            border-color: rgba(248, 250, 252, 0.12) !important;
            box-shadow: none !important;
          }

          .field-flow-dock button.active {
            border-color: rgba(66, 214, 181, 0.44) !important;
            box-shadow: 0 16px 34px rgba(6, 11, 18, 0.34) !important;
          }

          .field-flow-dock .capture {
            background: linear-gradient(135deg, rgba(66, 214, 181, 0.20), #131c26) !important;
          }

          .field-flow-dock .evidence {
            background: linear-gradient(135deg, rgba(125, 183, 255, 0.20), #131c26) !important;
          }

          .field-flow-dock .package {
            background: linear-gradient(135deg, rgba(242, 200, 107, 0.22), #131c26) !important;
          }

          .field-flow-dock .send {
            background: linear-gradient(135deg, rgba(169, 156, 255, 0.22), #131c26) !important;
          }

          .field-packet-vault,
          .field-send-panel {
            background: #131c26 !important;
            border-color: rgba(248, 250, 252, 0.12) !important;
            color: #f8fafc !important;
          }

          .field-packet-row,
          .field-packet-empty {
            background: #1b2633 !important;
            border-color: rgba(248, 250, 252, 0.12) !important;
          }

          .field-packet-row.full_evidence_zip {
            background: #16283d !important;
            border-color: rgba(125, 183, 255, 0.36) !important;
          }

          .field-package-preview {
            background: #16283d !important;
            border-color: rgba(125, 183, 255, 0.36) !important;
          }

          .field-package-preview-grid span {
            background: #1b2633 !important;
            border-color: rgba(248, 250, 252, 0.12) !important;
          }

          .field-packet-row strong,
          .field-packet-empty strong,
          .field-send-panel strong,
          .field-package-preview strong {
            color: #f8fafc !important;
          }

          .field-packet-head small,
          .field-packet-row span,
          .field-packet-row small,
          .field-packet-empty span,
          .field-send-panel small,
          .field-package-preview span {
            color: #aab7c6 !important;
          }

          .selected-overview-grid {
            margin-top: 0 !important;
          }

          .overview-tile,
          .selected-alert-card,
          .selected-status-panel,
          .more-job-details,
          .clean-description-card,
          .workflow-save-panel,
          .detail {
            background: #1b2633 !important;
            border-color: rgba(248, 250, 252, 0.12) !important;
            color: #f8fafc !important;
            box-shadow: none !important;
          }

          .overview-tile span,
          .selected-alert-card span,
          .selected-section-head span,
          .more-job-details summary,
          .detail span {
            color: #aab7c6 !important;
          }

          .overview-tile strong,
          .selected-alert-card strong,
          .selected-section-head strong,
          .more-job-details summary,
          .detail strong {
            color: #f8fafc !important;
          }

          .overview-tile small,
          .selected-alert-card small {
            color: #bac6d3 !important;
          }

          /* FIELD_APP_FULL_INFO_2026 */
          .map-health-panel,
          .ai-dispatch-chat,
          .ai-job-assistant {
            display: grid !important;
          }

          .status-legend {
            display: flex !important;
          }

          .map-stage {
            background:
              linear-gradient(180deg, rgba(12, 18, 26, 0.10), rgba(12, 18, 26, 0.18)),
              #121820 !important;
          }

          .map-node .leaflet-tile {
            filter: saturate(0.92) contrast(0.98) brightness(0.98);
          }

          .map-stats,
          .status-legend,
          .zoom-panel,
          .location-status-pill {
            box-shadow: 0 14px 34px rgba(6, 11, 18, 0.28) !important;
          }

          .job-drawer.selected-focus {
            left: 8px !important;
            right: 8px !important;
            bottom: 8px !important;
            max-height: 92dvh !important;
            padding: 14px !important;
            border-radius: 18px !important;
          }

          .job-drawer.selected-focus .workflow-filter-bar {
            position: static !important;
            display: flex !important;
            margin: 0 0 12px !important;
            background: #111923 !important;
          }

          .selected-focus-advanced .selected-card {
            max-height: none !important;
            overflow: visible !important;
          }

          .selected-card {
            gap: 14px !important;
            padding: 16px !important;
          }

          .selected-card-head {
            padding: 14px !important;
            gap: 14px !important;
          }

          .selected-card .job-title {
            font-size: clamp(30px, 8.2vw, 44px) !important;
            line-height: 1.02 !important;
          }

          .selected-card .job-address {
            font-size: clamp(17px, 4.7vw, 22px) !important;
            line-height: 1.25 !important;
          }

          .selected-card .job-sub {
            font-size: 14px !important;
          }

          .selected-chip-stack .status,
          .selected-chip-stack .maturity-pill {
            min-height: 38px;
            display: inline-grid;
            place-items: center;
            padding: 8px 12px !important;
            font-size: 13px !important;
          }

          .selected-hero-actions {
            grid-template-columns: minmax(0, 1.35fr) repeat(3, minmax(0, 0.78fr)) !important;
            gap: 10px !important;
          }

          .selected-hero-actions a,
          .selected-hero-actions button {
            min-height: 58px !important;
            font-size: 14px !important;
          }

          .field-workflow-card {
            padding: 14px !important;
            gap: 12px !important;
          }

          .field-workflow-head {
            padding: 14px !important;
          }

          .field-workflow-head strong {
            font-size: 18px !important;
          }

          .field-workflow-grid div {
            min-height: 74px !important;
            padding: 12px !important;
          }

          .field-workflow-grid strong {
            font-size: 16px !important;
          }

          .field-step-actions {
            gap: 10px !important;
          }

          .field-step-actions button {
            min-height: 58px !important;
            font-size: 14px !important;
          }

          .field-evidence-gallery {
            padding: 12px !important;
          }

          .field-evidence-gallery-grid {
            gap: 10px !important;
          }

          .field-evidence-gallery-preview {
            aspect-ratio: 16 / 11 !important;
          }

          .field-evidence-gallery-meta {
            padding: 10px !important;
          }

          .field-evidence-gallery-meta strong {
            font-size: 14px !important;
          }

          .field-evidence-gallery-meta small {
            overflow-wrap: anywhere;
          }

          .overview-tile,
          .selected-alert-card,
          .selected-status-panel,
          .more-job-details,
          .clean-description-card,
          .workflow-save-panel,
          .detail {
            padding: 13px !important;
          }

          .overview-tile strong,
          .selected-alert-card strong,
          .detail strong {
            font-size: 15px !important;
          }

          .description-inline-actions button,
          .selected-status-grid button,
          .save-status-btn {
            min-height: 50px !important;
            font-size: 13px !important;
          }

          .job-drawer.selected-focus .action-notice,
          .job-drawer.selected-focus .ready-revisit-alert {
            position: static !important;
            inset: auto !important;
            transform: none !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 8px 0 12px !important;
          }

          .job-drawer.selected-focus .action-notice {
            border-radius: 14px !important;
            text-align: center;
            box-shadow: 0 10px 24px rgba(31, 47, 70, 0.12) !important;
          }

          .job-drawer.selected-focus .ready-revisit-alert {
            display: grid !important;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            border-radius: 16px !important;
            animation-duration: 6s !important;
            box-shadow: 0 10px 26px rgba(31, 47, 70, 0.12) !important;
          }

          .job-drawer.selected-focus .ready-revisit-alert span {
            white-space: normal !important;
            max-width: none !important;
            line-height: 1.25;
          }

          @media (max-width: 720px) {
            .job-drawer {
              border-radius: 20px 20px 0 0 !important;
              box-shadow: 0 -14px 42px rgba(31, 47, 70, 0.20) !important;
            }

            .selected-card,
            .job-card {
              border-radius: 16px !important;
            }

            .job-drawer.selected-focus .action-notice,
            .job-drawer.selected-focus .ready-revisit-alert {
              margin-top: 0 !important;
              padding: 9px 10px !important;
            }

            .job-drawer.selected-focus .ready-revisit-alert {
              grid-template-columns: 1fr auto;
            }

            .job-drawer.selected-focus .ready-revisit-alert strong {
              grid-column: 1 / -1;
            }

            .field-workflow-grid,
            .field-step-actions {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .field-flow-dock {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .field-flow-dock button {
              min-height: 68px;
            }

            .field-media-actions {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .field-capture-guide {
              grid-template-columns: 1fr !important;
            }

            .field-capture-actions {
              grid-template-columns: 1fr !important;
            }

            .field-capture-guide button {
              width: 100%;
            }

            .field-evidence-head {
              display: grid;
            }

            .field-evidence-head small {
              max-width: none;
              text-align: left;
            }

            .field-evidence-item {
              grid-template-columns: 52px minmax(0, 1fr);
            }

            .field-evidence-thumb {
              width: 52px;
              height: 48px;
            }

            .field-packet-head,
            .field-packet-row,
            .field-send-panel,
            .field-send-actions {
              grid-template-columns: 1fr !important;
            }

            .field-package-preview-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .field-packet-row button,
            .field-send-panel button {
              width: 100%;
            }
          }

          /* FULL_PAGE_BALANCED_MAPTILER_2026 */
          .map-shell,
          .map-shell.full-map-mode {
            position: relative !important;
            display: block !important;
            width: 100vw !important;
            height: 100dvh !important;
            min-height: 100dvh !important;
            overflow: hidden !important;
            background: #111922 !important;
          }

          body:has(.map-shell) {
            overflow: hidden !important;
            background: #111922 !important;
          }

          body:has(.map-shell) .site-shell {
            min-height: 100dvh !important;
            padding: 0 !important;
          }

          body:has(.map-shell) .topbar {
            display: none !important;
          }

          body:has(.map-shell) .page-frame {
            display: block !important;
            gap: 0 !important;
          }

          body .site-shell {
            padding: 0 !important;
          }

          body .topbar {
            display: none !important;
          }

          body .page-frame {
            display: block !important;
            gap: 0 !important;
          }

          .map-stage {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100dvh !important;
            min-height: 100dvh !important;
            background: #d8e4ea !important;
          }

          .map-node,
          .map-node .leaflet-container {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            background: #d8e4ea !important;
          }

          .map-node .leaflet-tile {
            filter: saturate(1.04) contrast(1.02) brightness(0.99) !important;
          }

          .map-top {
            position: fixed !important;
            z-index: 960 !important;
            top: calc(env(safe-area-inset-top) + 10px) !important;
            bottom: calc(env(safe-area-inset-bottom) + 10px) !important;
            left: 10px !important;
            right: auto !important;
            width: min(390px, calc(100vw - 48px)) !important;
            max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 20px) !important;
            overflow-y: auto !important;
            padding: 12px !important;
            border-radius: 20px !important;
            background: rgba(17, 25, 34, 0.92) !important;
            border: 1px solid rgba(142, 170, 196, 0.32) !important;
            box-shadow: 0 24px 58px rgba(3, 9, 16, 0.42) !important;
            backdrop-filter: blur(20px) saturate(1.12) !important;
            transform: translateX(calc(-100% - 18px)) !important;
            opacity: 0 !important;
            pointer-events: none !important;
            transition: transform 260ms ease, opacity 220ms ease !important;
          }

          .map-top.open {
            transform: translateX(0) !important;
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          .map-menu-scrim {
            position: fixed !important;
            z-index: 940 !important;
            inset: 0 !important;
            background: rgba(4, 10, 16, 0.30) !important;
            border: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
            transition: opacity 220ms ease !important;
          }

          .map-menu-scrim.open {
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          .map-menu-fab {
            position: fixed !important;
            z-index: 950 !important;
            top: calc(env(safe-area-inset-top) + 10px) !important;
            left: 10px !important;
            min-width: 74px !important;
            height: 44px !important;
            border-radius: 14px !important;
            border: 1px solid rgba(17, 25, 34, 0.18) !important;
            background: rgba(17, 25, 34, 0.88) !important;
            color: #f8fbff !important;
            box-shadow: 0 12px 34px rgba(3, 9, 16, 0.22) !important;
            backdrop-filter: blur(16px) saturate(1.12) !important;
            display: inline-grid !important;
            place-items: center !important;
            font-size: 13px !important;
            font-weight: 1000 !important;
          }

          .map-swipe-hint {
            position: fixed !important;
            z-index: 930 !important;
            top: 0 !important;
            left: 0 !important;
            width: 28px !important;
            height: 100dvh !important;
            pointer-events: none !important;
          }

          .map-swipe-hint::after {
            content: "" !important;
            position: absolute !important;
            top: 46% !important;
            left: 6px !important;
            width: 3px !important;
            height: 64px !important;
            border-radius: 999px !important;
            background: rgba(17, 25, 34, 0.28) !important;
          }

          .map-title-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto auto !important;
            gap: 7px !important;
            align-items: center !important;
          }

          .map-title-row h1 {
            font-size: 17px !important;
            line-height: 1 !important;
            letter-spacing: 0 !important;
            color: #f8fbff !important;
          }

          .map-title-row p {
            margin-top: 3px !important;
            color: #c8d6e3 !important;
            font-size: 11px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .home-btn {
            min-height: 34px !important;
            padding: 0 10px !important;
            border-radius: 11px !important;
            background: rgba(248, 250, 252, 0.09) !important;
            border-color: rgba(248, 250, 252, 0.14) !important;
            color: #f8fbff !important;
          }

          .map-menu-close {
            min-height: 34px !important;
            min-width: 42px !important;
            padding: 0 10px !important;
            border-radius: 11px !important;
            background: rgba(248, 250, 252, 0.09) !important;
            border: 1px solid rgba(248, 250, 252, 0.14) !important;
            color: #f8fbff !important;
            font-size: 13px !important;
            font-weight: 950 !important;
          }

          .map-search {
            grid-template-columns: minmax(0, 1fr) auto !important;
            gap: 7px !important;
          }

          .map-search input,
          .jobs-toggle,
          .map-days-filter button,
          .days-back-control {
            min-height: 40px !important;
            border-radius: 12px !important;
            border: 1px solid rgba(142, 170, 196, 0.30) !important;
            background: rgba(20, 31, 43, 0.94) !important;
            color: #f8fbff !important;
            box-shadow: none !important;
          }

          .map-search input {
            padding: 0 12px !important;
          }

          .jobs-toggle,
          .map-days-filter button.active {
            background: linear-gradient(135deg, #23d3ae, #4da2ff) !important;
            color: #031018 !important;
            border-color: transparent !important;
          }

          .map-days-filter {
            display: grid !important;
            grid-template-columns: minmax(112px, 1fr) auto auto auto !important;
            gap: 7px !important;
            overflow: visible !important;
            padding: 0 !important;
          }

          .days-back-control {
            display: grid !important;
            grid-template-columns: auto minmax(44px, 1fr) !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 0 10px !important;
          }

          .days-back-control span {
            color: #9fb0c4 !important;
            font-size: 10px !important;
            font-weight: 950 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            white-space: nowrap !important;
          }

          .days-back-control input {
            width: 100% !important;
            min-width: 48px !important;
            border: 0 !important;
            outline: 0 !important;
            background: transparent !important;
            color: #f8fbff !important;
            font-size: 17px !important;
            font-weight: 1000 !important;
            text-align: right !important;
          }

          .map-days-filter button {
            padding: 0 10px !important;
            font-size: 12px !important;
            font-weight: 1000 !important;
            white-space: nowrap !important;
          }

          .map-days-filter .full-btn {
            background: rgba(77, 162, 255, 0.18) !important;
            color: #d7ecff !important;
            border-color: rgba(77, 162, 255, 0.34) !important;
          }

          .map-style-panel {
            display: grid !important;
            grid-template-columns: minmax(136px, 0.9fr) minmax(132px, 1fr) minmax(120px, auto) !important;
            align-items: center !important;
            gap: 7px !important;
            margin-top: 7px !important;
          }

          .map-style-select,
          .maptiler-key-control {
            min-height: 38px !important;
            display: grid !important;
            grid-template-columns: auto minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 0 10px !important;
            border-radius: 12px !important;
            border: 1px solid rgba(142, 170, 196, 0.30) !important;
            background: rgba(20, 31, 43, 0.94) !important;
          }

          .map-style-select span,
          .maptiler-key-control span {
            color: #c8d6e3 !important;
            font-size: 10px !important;
            font-weight: 950 !important;
            text-transform: uppercase !important;
            white-space: nowrap !important;
          }

          .map-style-select select,
          .maptiler-key-control input {
            width: 100% !important;
            min-width: 0 !important;
            border: 0 !important;
            outline: 0 !important;
            background: transparent !important;
            color: #f8fbff !important;
            font-size: 13px !important;
            font-weight: 850 !important;
          }

          .map-style-select select option {
            color: #111827 !important;
          }

          .map-style-status,
          .map-style-badge {
            min-height: 38px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 10px !important;
            border-radius: 12px !important;
            border: 1px solid rgba(35, 211, 174, 0.28) !important;
            background: rgba(35, 211, 174, 0.13) !important;
            color: #d9fff4 !important;
            font-size: 11px !important;
            font-weight: 900 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .map-style-panel.needs-key .map-style-status {
            border-color: rgba(255, 193, 7, 0.32) !important;
            background: rgba(255, 193, 7, 0.16) !important;
            color: #ffe8a3 !important;
          }

          .map-stats {
            left: 10px !important;
            right: auto !important;
            top: auto !important;
            bottom: calc(env(safe-area-inset-bottom) + 12px) !important;
            width: min(300px, calc(100vw - 104px)) !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }

          .map-stat {
            min-height: 44px !important;
            padding: 7px 8px !important;
            border-radius: 12px !important;
            background: rgba(8, 13, 20, 0.76) !important;
            border-color: rgba(122, 153, 190, 0.18) !important;
          }

          .map-stat strong {
            font-size: 14px !important;
          }

          .map-stat span {
            font-size: 9px !important;
            color: #9fb0c4 !important;
          }

          .status-legend {
            display: none !important;
          }

          .zoom-panel {
            top: auto !important;
            right: 10px !important;
            bottom: calc(env(safe-area-inset-bottom) + 12px) !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 7px !important;
            padding: 7px !important;
            border-radius: 15px !important;
            background: rgba(8, 13, 20, 0.82) !important;
            border: 1px solid rgba(122, 153, 190, 0.20) !important;
            backdrop-filter: blur(14px) !important;
          }

          .zoom-panel button {
            width: 42px !important;
            height: 38px !important;
            min-height: 38px !important;
            border-radius: 11px !important;
            background: rgba(248, 250, 252, 0.09) !important;
            color: #f8fbff !important;
            border: 1px solid rgba(248, 250, 252, 0.14) !important;
            font-size: 13px !important;
          }

          .location-status-pill {
            left: 10px !important;
            bottom: calc(env(safe-area-inset-bottom) + 70px) !important;
            background: rgba(8, 13, 20, 0.78) !important;
            color: #d7e4f8 !important;
            border-color: rgba(122, 153, 190, 0.18) !important;
          }

          .job-drawer {
            position: fixed !important;
            z-index: 920 !important;
            left: 8px !important;
            right: 8px !important;
            bottom: 8px !important;
            max-height: min(58dvh, 560px) !important;
            border-radius: 18px !important;
            background: rgba(10, 16, 25, 0.94) !important;
            border: 1px solid rgba(122, 153, 190, 0.18) !important;
            box-shadow: 0 -18px 52px rgba(0, 0, 0, 0.46) !important;
            backdrop-filter: blur(18px) saturate(1.08) !important;
          }

          .job-drawer.selected-focus {
            max-height: min(82dvh, 760px) !important;
          }

          .job-drawer.closed {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            transform: translateY(110%) !important;
          }

          @media (max-width: 720px) {
            .map-top {
              left: 7px !important;
              right: auto !important;
              top: calc(env(safe-area-inset-top) + 7px) !important;
              bottom: calc(env(safe-area-inset-bottom) + 7px) !important;
              width: min(362px, calc(100vw - 42px)) !important;
              max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 14px) !important;
              padding: 8px !important;
              border-radius: 16px !important;
              gap: 7px !important;
            }

            .map-menu-fab {
              top: calc(env(safe-area-inset-top) + 8px) !important;
              left: 8px !important;
              height: 42px !important;
              min-width: 70px !important;
            }

            .home-btn {
              display: none !important;
            }

            .map-search input,
            .jobs-toggle,
            .map-days-filter button,
            .days-back-control {
              min-height: 38px !important;
            }

            .map-days-filter {
              grid-template-columns: minmax(0, 1fr) auto auto !important;
            }

            .map-style-panel {
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
              gap: 6px !important;
            }

            .map-style-status,
            .map-style-badge {
              grid-column: 1 / -1 !important;
              min-height: 30px !important;
              justify-content: flex-start !important;
              font-size: 10px !important;
            }

            .map-style-select,
            .maptiler-key-control {
              min-height: 36px !important;
              padding: 0 8px !important;
            }

            .map-style-select span,
            .maptiler-key-control span {
              font-size: 9px !important;
            }

            .map-style-select select,
            .maptiler-key-control input {
              font-size: 12px !important;
            }

            .map-days-filter .full-btn {
              display: none !important;
            }

            .days-back-control {
              padding: 0 9px !important;
            }

            .days-back-control span {
              font-size: 9px !important;
            }

            .days-back-control input {
              font-size: 16px !important;
            }

            .map-stats {
              width: min(244px, calc(100vw - 88px)) !important;
            }

            .map-stat {
              min-height: 40px !important;
              padding: 6px !important;
            }

            .zoom-panel button {
              width: 38px !important;
              height: 36px !important;
              min-height: 36px !important;
            }
          }

          /* FIELD_MAP_REFINEMENT_2026 */
          .map-node .leaflet-tile {
            filter: saturate(1.12) contrast(1.08) brightness(0.91) !important;
          }

          .map-top {
            width: min(286px, calc(100vw - 82px)) !important;
            padding: 8px !important;
            border-radius: 16px !important;
            background: rgba(14, 20, 27, 0.94) !important;
            gap: 6px !important;
          }

          .map-menu-scrim.open {
            background: rgba(3, 8, 14, 0.18) !important;
          }

          .map-menu-fab {
            width: 46px !important;
            min-width: 46px !important;
            height: 42px !important;
            padding: 0 !important;
            border-radius: 14px !important;
          }

          .map-menu-fab-icon {
            display: grid !important;
            gap: 4px !important;
            width: 18px !important;
          }

          .map-menu-fab-icon span {
            display: block !important;
            height: 2px !important;
            border-radius: 999px !important;
            background: #f8fbff !important;
          }

          .map-menu-fab-icon span:nth-child(2) {
            width: 14px !important;
          }

          .map-title-row {
            grid-template-columns: minmax(0, 1fr) auto !important;
          }

          .map-title-row .home-btn {
            display: none !important;
          }

          .map-title-row h1 {
            font-size: 14px !important;
          }

          .map-title-row p {
            font-size: 9px !important;
          }

          .map-menu-close {
            min-width: 34px !important;
            padding: 0 8px !important;
            font-size: 0 !important;
          }

          .map-menu-close::before {
            content: "x";
            font-size: 14px;
          }

          .map-search {
            grid-template-columns: minmax(0, 1fr) 48px !important;
          }

          .map-search input,
          .jobs-toggle,
          .map-days-filter button,
          .days-back-control,
          .map-style-select,
          .maptiler-key-control {
            min-height: 36px !important;
            border-radius: 11px !important;
          }

          .map-search input {
            padding-inline: 10px !important;
            font-size: 12px !important;
          }

          .jobs-toggle,
          .map-days-filter button {
            padding-inline: 8px !important;
            font-size: 10px !important;
          }

          .map-days-filter {
            grid-template-columns: minmax(0, 1fr) auto auto !important;
            gap: 5px !important;
          }

          .map-days-filter .full-btn {
            display: none !important;
          }

          .days-back-control {
            grid-column: 1 / -1 !important;
          }

          .days-back-control input {
            font-size: 18px !important;
          }

          .map-day-presets {
            display: grid !important;
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            gap: 4px !important;
            margin-top: 5px !important;
          }

          .map-day-presets button {
            min-height: 30px !important;
            border-radius: 9px !important;
            border: 1px solid rgba(142, 170, 196, 0.24) !important;
            background: rgba(248, 250, 252, 0.08) !important;
            color: #dbe7f3 !important;
            font-size: 10px !important;
            font-weight: 950 !important;
            padding: 0 2px !important;
          }

          .map-day-presets button.active {
            background: linear-gradient(135deg, #23d3ae, #4da2ff) !important;
            color: #031018 !important;
            border-color: transparent !important;
          }

          .map-style-panel {
            grid-template-columns: 1fr !important;
            gap: 5px !important;
            margin-top: 5px !important;
          }

          .map-style-status,
          .map-style-badge {
            min-height: 28px !important;
            justify-content: flex-start !important;
            font-size: 10px !important;
          }

          .map-stats {
            width: min(244px, calc(100vw - 96px)) !important;
          }

          .zoom-panel .live-location-btn.active {
            background: linear-gradient(135deg, #2563eb, #23d3ae) !important;
            color: #ffffff !important;
            border-color: transparent !important;
            box-shadow: 0 12px 28px rgba(37, 99, 235, 0.24) !important;
          }

          .location-status-pill.active {
            background: rgba(239, 246, 255, 0.96) !important;
            border-color: rgba(37, 99, 235, 0.42) !important;
            color: #1d4ed8 !important;
          }

          .field-map-popup {
            display: grid;
            gap: 4px;
            min-width: 170px;
            max-width: 210px;
            color: #172033;
          }

          .field-map-popup strong {
            font-size: 13px;
          }

          .field-map-popup span,
          .field-map-popup small {
            display: block;
            line-height: 1.25;
          }

          .field-map-popup span {
            font-size: 11px;
          }

          .field-map-popup small {
            color: #526276;
            font-size: 10px;
          }

          .field-map-popup button {
            min-height: 32px;
            border: 0;
            border-radius: 9px;
            background: linear-gradient(135deg, #23d3ae, #4da2ff);
            color: #031018;
            font-weight: 950;
            font-size: 11px;
          }

          .leaflet-popup-content-wrapper {
            border-radius: 14px !important;
            box-shadow: 0 18px 42px rgba(3, 8, 14, 0.26) !important;
          }

          .leaflet-popup-content {
            margin: 12px !important;
          }

          .field-step-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .field-step-actions button {
            min-height: 52px !important;
            font-size: 12px !important;
          }

          .field-media-console {
            display: grid !important;
            gap: 10px !important;
            padding: 12px !important;
            border-radius: 14px !important;
            border: 1px solid rgba(142, 170, 196, 0.22) !important;
            background: linear-gradient(180deg, #111923, #0e151f) !important;
            color: #f8fbff !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
          }

          .field-media-console-head {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: space-between !important;
            gap: 10px !important;
          }

          .field-media-console-head span,
          .field-media-console-head small {
            color: #aab7c6 !important;
            font-size: 11px !important;
            line-height: 1.2 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }

          .field-media-console-head strong {
            display: block !important;
            margin-top: 2px !important;
            color: #f8fbff !important;
            font-size: 15px !important;
            line-height: 1.15 !important;
          }

          .field-media-lanes {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          .field-media-lane {
            min-width: 0 !important;
            display: grid !important;
            gap: 8px !important;
            padding: 9px !important;
            border-radius: 12px !important;
            border: 1px solid rgba(142, 170, 196, 0.20) !important;
            background: rgba(248, 250, 252, 0.06) !important;
          }

          .field-media-lane.before.has-media {
            border-color: rgba(35, 211, 174, 0.52) !important;
          }

          .field-media-lane.after.has-media {
            border-color: rgba(125, 220, 147, 0.52) !important;
          }

          .field-media-lane.needs-media {
            border-style: dashed !important;
          }

          .field-media-lane.just-saved {
            border-color: #facc15 !important;
            background: linear-gradient(180deg, rgba(250, 204, 21, 0.18), rgba(35, 211, 174, 0.10)) !important;
            box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.18), 0 16px 34px rgba(3, 8, 14, 0.24) !important;
            animation: fieldMediaSavedPulse 1.35s ease-in-out 2 !important;
          }

          .field-media-lane.just-saved .field-media-preview {
            box-shadow: inset 0 0 0 2px rgba(250, 204, 21, 0.72) !important;
          }

          @keyframes fieldMediaSavedPulse {
            0%,
            100% {
              transform: translateY(0);
            }

            50% {
              transform: translateY(-2px);
            }
          }

          .field-media-preview {
            position: relative !important;
            min-height: 118px !important;
            aspect-ratio: 4 / 3 !important;
            display: grid !important;
            place-items: center !important;
            overflow: hidden !important;
            border-radius: 10px !important;
            background:
              linear-gradient(135deg, rgba(35, 211, 174, 0.12), rgba(77, 162, 255, 0.10)),
              #08111a !important;
            color: #e7f0fb !important;
            font-size: 17px !important;
            font-weight: 1000 !important;
          }

          .field-media-preview img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
          }

          .field-media-preview b {
            position: absolute !important;
            right: 7px !important;
            bottom: 7px !important;
            padding: 4px 7px !important;
            border-radius: 999px !important;
            background: rgba(3, 8, 14, 0.82) !important;
            color: #f8fbff !important;
            font-size: 9px !important;
          }

          .field-media-copy {
            min-width: 0 !important;
            display: grid !important;
            gap: 2px !important;
          }

          .field-media-copy span,
          .field-media-copy small {
            color: #aab7c6 !important;
            font-size: 11px !important;
            line-height: 1.25 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
            overflow-wrap: anywhere !important;
          }

          .field-media-copy strong {
            color: #ffffff !important;
            font-size: 18px !important;
            line-height: 1.05 !important;
          }

          .field-media-actions {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }

          .field-media-actions button {
            min-height: 38px !important;
            border-radius: 10px !important;
            border: 1px solid rgba(142, 170, 196, 0.24) !important;
            background: rgba(248, 250, 252, 0.10) !important;
            color: #e7f0fb !important;
            font-size: 11px !important;
            font-weight: 1000 !important;
          }

          .field-media-actions button.primary {
            border-color: transparent !important;
            background: linear-gradient(135deg, #23d3ae, #4da2ff) !important;
            color: #041018 !important;
          }

          .field-workflow-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 7px !important;
          }

          .field-workflow-grid div {
            min-height: 50px !important;
            padding: 8px !important;
          }

          .inline-camera-shell {
            position: fixed !important;
            inset: 0 !important;
            z-index: 5000 !important;
            display: grid !important;
            place-items: center !important;
            padding: 14px !important;
            background: rgba(3, 8, 14, 0.78) !important;
            backdrop-filter: blur(10px) !important;
          }

          .inline-camera-panel {
            width: min(760px, 100%) !important;
            max-height: calc(100vh - 28px) !important;
            display: grid !important;
            gap: 12px !important;
            padding: 12px !important;
            border-radius: 18px !important;
            border: 1px solid rgba(142, 170, 196, 0.28) !important;
            background: #0b1220 !important;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42) !important;
          }

          .inline-camera-head,
          .inline-camera-status,
          .inline-camera-actions {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 10px !important;
          }

          .inline-camera-head div {
            min-width: 0 !important;
            display: grid !important;
            gap: 2px !important;
          }

          .inline-camera-head span,
          .inline-camera-status span {
            color: #9fb0c4 !important;
            font-size: 12px !important;
            font-weight: 800 !important;
            letter-spacing: 0 !important;
            text-transform: uppercase !important;
          }

          .inline-camera-head strong {
            color: #ffffff !important;
            font-size: 18px !important;
            line-height: 1.1 !important;
            overflow-wrap: anywhere !important;
          }

          .inline-camera-preview {
            position: relative !important;
            overflow: hidden !important;
            border-radius: 14px !important;
            background: #020617 !important;
            aspect-ratio: 4 / 3 !important;
            border: 1px solid rgba(142, 170, 196, 0.22) !important;
          }

          .inline-camera-preview video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
          }

          .inline-camera-preview.recording {
            box-shadow: inset 0 0 0 3px rgba(239, 68, 68, 0.85) !important;
          }

          .inline-camera-rec {
            position: absolute !important;
            left: 12px !important;
            top: 12px !important;
            padding: 7px 10px !important;
            border-radius: 999px !important;
            background: #ef4444 !important;
            color: #ffffff !important;
            font-size: 12px !important;
            font-weight: 1000 !important;
          }

          .inline-camera-status strong {
            min-width: 54px !important;
            text-align: center !important;
            padding: 7px 10px !important;
            border-radius: 999px !important;
            background: rgba(35, 211, 174, 0.16) !important;
            color: #7ff8df !important;
            font-size: 13px !important;
            font-weight: 1000 !important;
          }

          .inline-camera-head button,
          .inline-camera-actions button {
            min-height: 46px !important;
            border-radius: 12px !important;
            border: 1px solid rgba(142, 170, 196, 0.28) !important;
            background: rgba(248, 250, 252, 0.10) !important;
            color: #eff6ff !important;
            font-size: 13px !important;
            font-weight: 1000 !important;
            padding: 0 14px !important;
          }

          .inline-camera-actions {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(110px, 0.35fr) !important;
          }

          .inline-camera-actions .primary {
            border-color: transparent !important;
            background: linear-gradient(135deg, #23d3ae, #4da2ff) !important;
            color: #041018 !important;
          }

          .inline-camera-actions .danger {
            border-color: transparent !important;
            background: linear-gradient(135deg, #ef4444, #f97316) !important;
            color: #ffffff !important;
          }

          .inline-camera-actions button:disabled,
          .inline-camera-head button:disabled {
            opacity: 0.48 !important;
          }

          @media (max-width: 720px) {
            .map-top {
              width: min(282px, calc(100vw - 82px)) !important;
              padding: 7px !important;
            }

            .map-menu-fab {
              min-width: 44px !important;
              width: 44px !important;
              height: 40px !important;
            }

            .map-stats {
              width: min(218px, calc(100vw - 94px)) !important;
            }

            .field-media-lanes {
              grid-template-columns: 1fr !important;
            }

            .field-media-preview {
              min-height: 140px !important;
            }

            .field-workflow-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .inline-camera-shell {
              padding: 8px !important;
            }

            .inline-camera-panel {
              width: 100% !important;
              max-height: calc(100vh - 16px) !important;
              border-radius: 16px !important;
            }

            .inline-camera-preview {
              aspect-ratio: 3 / 4 !important;
            }

            .inline-camera-actions {
              grid-template-columns: 1fr !important;
            }
          }
        `}
        </style>

      <input
        ref={fieldPhotoInputRef}
        className="field-photo-input"
        type="file"
        accept={fieldCaptureAccept}
        capture={fieldCaptureCamera ? "environment" : undefined}
        multiple={fieldCaptureMultiple}
        onChange={handleFieldPhotoInput}
      />

      {fieldCameraSession ? (
        <div className="inline-camera-shell" role="dialog" aria-modal="true" aria-label="Field evidence camera">
          <div className="inline-camera-panel">
            <div className="inline-camera-head">
              <div>
                <span>{fieldCameraSession.mode === "video" ? "Video Evidence" : "Photo Evidence"}</span>
                <strong>{fieldCameraSession.target.step?.title || fieldCameraSession.target.meta.label || "Field Evidence"}</strong>
              </div>
              <button type="button" onClick={closeInlineFieldCamera} disabled={fieldCameraRecording}>
                Close
              </button>
            </div>
            <div className={`inline-camera-preview ${fieldCameraRecording ? "recording" : ""}`}>
              <video ref={fieldCameraVideoRef} playsInline muted autoPlay />
              {fieldCameraRecording ? <span className="inline-camera-rec">Recording</span> : null}
            </div>
            <div className="inline-camera-status">
              <span>{fieldCameraStatus || "Camera ready."}</span>
              {fieldCameraSession.target.step?.total ? (
                <strong>{fieldCameraSession.target.step.step}/{fieldCameraSession.target.step.total}</strong>
              ) : null}
            </div>
            <div className="inline-camera-actions">
              {fieldCameraSession.mode === "video" ? (
                fieldCameraRecording ? (
                  <button className="danger" type="button" onClick={stopInlineCameraVideoRecording}>
                    Stop & Save Video
                  </button>
                ) : (
                  <button className="primary" type="button" onClick={startInlineCameraVideoRecording} disabled={fieldCameraBusy}>
                    Start Video
                  </button>
                )
              ) : (
                <button className="primary" type="button" onClick={captureInlineCameraPhoto} disabled={fieldCameraBusy}>
                  Capture Photo
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  closeInlineFieldCamera();
                  if (selected && fieldCameraSession) {
                    requestFieldPhotoCapture(
                      selected,
                      fieldCameraSession.target.kind,
                      fieldCameraSession.target.step?.accept || fieldCaptureAccept,
                      false,
                      fieldCameraSession.target.step
                    );
                  }
                }}
                disabled={fieldCameraRecording || fieldCameraBusy}
              >
                Gallery
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button className="map-menu-fab" type="button" aria-label="Open map menu" onClick={openMapMenu}>
        <span className="map-menu-fab-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <span className="map-swipe-hint" aria-hidden="true" />
      <button
        className={`map-menu-scrim ${mapMenuOpen ? "open" : ""}`}
        type="button"
        aria-label="Close map menu"
        onClick={closeMapMenu}
      />

      <header className={`map-top ${mapMenuOpen ? "open" : ""}`}>
        <div className="map-title-row">
          <div>
            <h1>Map</h1>
            <p>{mapDateFilterLabel()} - {filteredJobs.length} visible - {activeMapBaseStyle.label}</p>
          </div>
          <a className="home-btn" href="/">Home</a>
          <button className="map-menu-close" type="button" onClick={closeMapMenu}>
            Close
          </button>
        </div>

        <div className="map-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search OMO, address, borough, trade..."
          />
          <button className="jobs-toggle" type="button" onClick={() => {
            setDrawerOpen((value) => !value);
            closeMapMenu();
          }}>
            Jobs
          </button>
        </div>

        <div className="map-filter-row map-days-filter">
          <label className="days-back-control">
            <span>Days back</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="9999"
              value={mapDaysBack}
              onChange={(event) => {
                setMapShowAllDays(false);
                setMapDaysBack(event.target.value.replace(/[^\d]/g, "").slice(0, 4));
              }}
            />
          </label>
          <button className={!mapShowAllDays ? "active" : ""} type="button" onClick={() => setMapShowAllDays(false)}>
            Show {mapDateCounts.visible}
          </button>
          <button className={mapShowAllDays ? "active" : ""} type="button" onClick={() => setMapShowAllDays(true)}>
            All {mapDateCounts.all}
          </button>
          <button className="full-btn" type="button" onClick={() => {
            setFullMap((v) => !v);
            setDrawerOpen(false);
            setTimeout(() => mapRef.current?.invalidateSize(), 100);
            setTimeout(() => mapRef.current?.invalidateSize(), 400);
          }}>
            {fullMap ? "Focus On" : "Focus Off"}
          </button>
        </div>

        <div className="map-day-presets" aria-label="Quick day filters">
          {MAP_DAYS_PRESETS.map((days) => (
            <button
              key={days}
              className={!mapShowAllDays && mapDaysBackLimit() === Number(days) ? "active" : ""}
              type="button"
              onClick={() => {
                setMapShowAllDays(false);
                setMapDaysBack(days);
              }}
            >
              {days}d
            </button>
          ))}
        </div>

        <div className={`map-style-panel ${needsMapTilerKey ? "needs-key" : ""}`}>
          <label className="map-style-select">
            <span>Style</span>
            <select
              value={mapBaseStyle}
              onChange={(event) => updateMapBaseStyle(event.target.value as MapBaseStyleId)}
            >
              {MAP_BASE_STYLES.map((style) => (
                <option key={style.id} value={style.id}>{style.label}</option>
              ))}
            </select>
          </label>
          {requestedMapBaseStyle.provider === "maptiler" && !MAPTILER_ENV_KEY ? (
            <label className="maptiler-key-control">
              <span>Key</span>
              <input
                value={mapTilerKey}
                onChange={(event) => updateMapTilerKey(event.target.value)}
                placeholder="Paste MapTiler key"
                type="password"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
          ) : null}
          {requestedMapBaseStyle.provider === "maptiler" && MAPTILER_ENV_KEY ? (
            <span className="map-style-badge">Env key</span>
          ) : null}
          <span className="map-style-status">{mapTileStatus}</span>
        </div>
      </header>

      <section className="map-stage">
        <div ref={mapNode} className="map-node" />

        <div className="map-stats">
          <div className="map-stat">
            <strong>{jobs.length}</strong>
            <span>Total</span>
          </div>
          <div className="map-stat">
            <strong>{plottedCount}</strong>
            <span>Mapped</span>
          </div>
          <div className="map-stat">
            <strong>{Math.max(0, jobs.length - plottedCount)}</strong>
            <span>Need geo</span>
          </div>
        </div>

        <div className="status-legend">
          <span><b className="dot completed"></b>Done</span>
          <span><b className="dot refused"></b>Refused</span>
          <span><b className="dot noaccess"></b>No Access</span>
          <span><b className="dot second"></b>2nd</span>
          <span><b className="dot pending"></b>Pending</span>
        </div>

        <div className="zoom-panel">
          <button type="button" onClick={() => mapRef.current?.zoomIn()}>+</button>
          <button type="button" onClick={() => mapRef.current?.zoomOut()}>−</button>
          <button type="button" onClick={() => {
            fitVisibleJobsOnMap(userLocation ? USER_LOCATION_OVERVIEW_ZOOM : 13, true);
          }}>Fit</button>
          <button
            type="button"
            className={`live-location-btn ${followMyLocation ? "active" : ""}`}
            title={userLocation ? "Center on my location" : "Start live location"}
            onClick={showMyLocationOverview}
          >
            Me
          </button>
        </div>

        <div className={`location-status-pill ${userLocation ? "active" : ""}`}>
          <span>{locationStatus}</span>
        </div>
      </section>

      <aside className={`job-drawer ${drawerOpen ? "" : "closed"} ${selectedOnly ? "selected-focus selected-focus-advanced" : ""} ${fullMap && !drawerOpen ? "drawer-hard-hidden" : ""}`}>
        <div className="drawer-head">
          <strong>{selectedOnly && selected ? jobKey(selected) : `${filteredJobs.length} jobs`}</strong>          {selectedOnly ? (
            <button
              type="button"
              onClick={() => {
                setSelectedOnly(false);
                setSelected(null);
                setGeneratedLinks({});
                setDescriptionOpen(false);
                setDrawerOpen(false);
                setFullMap(true);
                window.requestAnimationFrame(() => {
                  document.querySelector(".map-stage")?.classList.add("map-focus-boost");
                  setTimeout(() => {
                    document.querySelector(".map-stage")?.classList.remove("map-focus-boost");
                    mapRef.current?.invalidateSize();
                  }, 320);
                });
              }}
            >
              Back to List
            </button>
          ) : null}
        </div>

        <div className="workflow-filter-bar">
          <button type="button" className={workflowViewFilter === "active" ? "active" : ""} onClick={() => setWorkflowViewFilter("active")}>
            Active
          </button>
          <button type="button" className={workflowViewFilter === "waiting72" ? "active" : ""} onClick={() => setWorkflowViewFilter("waiting72")}>
            Waiting 72h
          </button>
          <button type="button" className={workflowViewFilter === "ready2" ? "active" : ""} onClick={() => setWorkflowViewFilter("ready2")}>
            Ready 2nd
          </button>
          <button type="button" className={workflowViewFilter === "final" ? "active" : ""} onClick={() => setWorkflowViewFilter("final")}>
            Final Status
          </button>
          <button type="button" className={workflowViewFilter === "archived" ? "active" : ""} onClick={() => setWorkflowViewFilter("archived")}>
            Archived
          </button>
          <button type="button" className={workflowViewFilter === "all" ? "active" : ""} onClick={() => setWorkflowViewFilter("all")}>
            All
          </button>
        </div>
        {actionNotice ? <div className="action-notice">{actionNotice}</div> : null}

        {!selectedOnly ? (
          <>
        <section className="today-route-card">
          <div>
            <span>Today</span>
            <strong>{readySecondCount ? `${readySecondCount} revisit ready` : "Best next jobs"}</strong>
          </div>
          <button type="button" onClick={() => runDispatchChat("What should I do today?")}>
            Show Route
          </button>
          <div className="today-route-list">
            {todayPriorityJobs.map((job) => (
              <button type="button" key={jobKey(job)} onClick={() => openDispatchJob(jobKey(job))}>
                <strong>{jobKey(job)}</strong>
                <span>{dispatchJobReason(job)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`map-health-panel ${health.totalIssues ? "has-issues" : "clean"}`}>
          {health.totalIssues === 0 ? (
            <div className="verified-map-badge">
              <span>Verified Map Data</span>
              <strong>All core checks clean</strong>
            </div>
          ) : null}

          <div className="map-health-head">
            <div>
              <span>Map Data Health</span>
              <strong>{health.totalIssues ? `${health.totalIssues} item(s) need attention` : "All core checks clean"}</strong>
            </div>
            <button type="button" onClick={() => runDispatchChat("What should I do today?")}>
              Ask AI
            </button>
          </div>

          <div className="map-health-grid">
            <button type="button" onClick={() => setActionNotice(`${health.badDescriptions.length} bad descriptions found.`)}>
              <span>Bad descriptions</span>
              <strong>{health.badDescriptions.length}</strong>
            </button>
            <button type="button" onClick={() => setActionNotice(`${health.blankBorough.length} blank boroughs found.`)}>
              <span>Blank boroughs</span>
              <strong>{health.blankBorough.length}</strong>
            </button>
            <button type="button" onClick={() => setActionNotice(`${health.missingCoords.length} missing coordinates found.`)}>
              <span>Missing coords</span>
              <strong>{health.missingCoords.length}</strong>
            </button>
            <button type="button" onClick={() => setActionNotice(`${health.suspiciousQueens.length} suspicious borough coordinates found.`)}>
              <span>Borough map check</span>
              <strong>{health.suspiciousQueens.length}</strong>
            </button>
            <button type="button" onClick={() => setActionNotice(`${health.checkDate.length} check-date jobs found.`)}>
              <span>Check-date jobs</span>
              <strong>{health.checkDate.length}</strong>
            </button>
            <button type="button" onClick={() => runDispatchChat("Ready second attempt jobs")}>
              <span>Ready 2nd attempts</span>
              <strong>{health.readySecond.length}</strong>
            </button>
          </div>
        </section>
        <section className="ai-dispatch-chat">
          <div className="dispatch-chat-head">
            <div>
              <span>AI Dispatch Chat</span>
              <strong>Ask what to do next</strong>
            </div>
            <button type="button" onClick={() => speakText(dispatchMessages[dispatchMessages.length - 1]?.text || "", "summary")}>
              🔊 Read
            </button>
          </div>
          <div className="dispatch-chat-messages">
            {dispatchMessages.slice(-4).map((message, index) => (
              <div key={index} className={`dispatch-message ${message.role}`}>
                <pre>{message.text}</pre>
                {message.jobs?.length ? (
                  <div className="dispatch-open-row">
                    {message.jobs.slice(0, 4).map((jobId) => (
                      <button type="button" key={jobId} onClick={() => openDispatchJob(jobId)}>
                        Open {jobId}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="dispatch-chip-row">
            <button type="button" onClick={() => runDispatchChat("What should I do today?")}>Today</button>
            <button type="button" onClick={() => runDispatchChat("Show urgent overdue jobs")}>Urgent</button>
            <button type="button" onClick={() => runDispatchChat("Ready second attempt jobs")}>Ready 2nd</button>
            <button type="button" onClick={() => runDispatchChat("No access 72 hour jobs")}>No Access</button>
            <button type="button" onClick={() => runDispatchChat("Completed jobs needing paperwork")}>Paperwork</button>
          </div>
          <div className="dispatch-input-row">
            <input
              value={dispatchQuestion}
              onChange={(event) => setDispatchQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runDispatchChat();
              }}
              placeholder="Ask: what jobs are urgent today?"
            />
            <button type="button" onClick={() => runDispatchChat()}>Send</button>
          </div>
        </section>
        <section className="ai-job-assistant">
          <div className="ai-head">
            <div>
              <span>AI Job Assistant</span>
              <strong>Ask what needs attention</strong>
            </div>
            <button type="button" onClick={() => speakText(aiAnswer, "summary")}>🔊 Read</button>
          </div>
          <div className="ai-input-row">
            <input
              value={aiQuestion}
              onChange={(event) => setAiQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runJobAssistant();
              }}
              placeholder="Ask: what jobs are due today?"
            />
            <button type="button" onClick={() => runJobAssistant()}>Ask</button>
          </div>
          <div className="ai-chip-row">
            <button type="button" onClick={() => runJobAssistant("what should I do today")}>Today</button>
            <button type="button" onClick={() => runJobAssistant("overdue jobs")}>Overdue</button>
            <button type="button" onClick={() => runJobAssistant("ready second attempt")}>Ready 2nd</button>
            <button type="button" onClick={() => runJobAssistant("no access 72 hour")}>No Access</button>
            <button type="button" onClick={() => runJobAssistant("completed jobs")}>Completed</button>
          </div>
          <pre className="ai-answer">{aiAnswer}</pre>
          {aiResults.length ? (
            <div className="ai-result-list">
              {aiResults.slice(0, 5).map((job) => (
                <button type="button" key={jobKey(job)} onClick={() => openAssistantJob(job)}>
                  <strong>{jobKey(job)}</strong>
                  <span>{workflowLabel(job) || JobStatus.statusLabel(job)} · {timelineOverdueLabel(job)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
          </>
        ) : null}
        {jobs.filter((job) => workflowViewBucket(job) === "ready2").length > 0 ? (
          <div className="ready-revisit-alert">
            <strong>REVISIT READY</strong>
            <span>{jobs.filter((job) => workflowViewBucket(job) === "ready2").length} job(s) need 2nd attempt now.</span>
            <button type="button" onClick={showReadyRevisitJobs}>Show Ready</button>
          </div>
        ) : null}

        {selected ? (
          <div
            key={jobKey(selected)}
            className={`selected-card job-status-card ${JobStatus.statusCardClass(selected)} swipe-enabled-card`}
            onTouchStart={handleSelectedTouchStart}
            onTouchEnd={handleSelectedTouchEnd}
          >
            <div className="selected-card-head">
              <div className="selected-title-block">
                <strong className="job-title">{jobKey(selected)}</strong>
                <p className="job-address">{displayAddress(selected)}</p>
                <p className="job-sub">{selected.borough || "Unknown borough"} · {displayLocation(selected) || "Location not listed"}</p>
              </div>
              <div className="selected-chip-stack">
                <span className={`status ${statusClass(selected.status)}`}>{JobStatus.statusLabel(selected)}</span>
                <span className={`maturity-pill ${maturityPriorityClass(selected)}`}>{jobCounterLabel(selected)}</span>
              </div>
            </div>

            <div className="selected-hero-actions">
              <a className="selected-primary-action" href={paperworkHref(selected, "package")}>
                Generate Package
              </a>
              <a href={wazeDirectionsUrl(selected)} target="_blank" rel="noopener noreferrer">
                Waze
              </a>
              <a href={directionsUrl(selected)} target="_blank" rel="noopener noreferrer">
                Map
              </a>
              <button type="button" onClick={() => sendJobToArchive(selected)}>
                Archive
              </button>
            </div>

            <div className="field-workflow-card">
              <div className="field-workflow-head">
                <div>
                  <span>Field Workflow</span>
                  <strong>{workflowLabel(selected) || "Ready to start"}</strong>
                </div>
                <span className="field-timer-pill">{fieldElapsedLabel(selected)}</span>
              </div>

              <div className="field-media-console" data-field-media-console="true">
                <div className="field-media-console-head">
                  <div>
                    <span>Field Media</span>
                    <strong>Before / After Evidence</strong>
                  </div>
                  <small>{fieldPhotoCountsFor(selected).images} image(s) / {fieldPhotoCountsFor(selected).videos} video(s)</small>
                </div>

                <div className="field-media-lanes">
                  {(["before", "after"] as FieldMediaKind[]).map((kind) => {
                    const latest = latestFieldEvidence(selected, kind);
                    const count = fieldPhotoCountsFor(selected)[kind] || 0;
                    const label = kind === "before" ? "Before" : "After";

                    return (
                      <section className={`field-media-lane ${fieldEvidenceKindClass(kind)} ${count ? "has-media" : "needs-media"} ${fieldMediaFlashKind === kind ? "just-saved" : ""}`} key={kind}>
                        <div className="field-media-preview">
                          {latest && fieldEvidencePreview(latest) ? (
                            <img src={fieldEvidencePreview(latest)} alt="" />
                          ) : (
                            <span>{label}</span>
                          )}
                          {latest?.mediaType === "video" ? <b>VIDEO</b> : null}
                        </div>
                        <div className="field-media-copy">
                          <span>{label} Media</span>
                          <strong>{fieldMediaCountLabel(count)}</strong>
                          <small>{latest ? latest.name : fieldMediaStateLabel(selected, kind)}</small>
                        </div>
                        <div className="field-media-actions">
                          <button type="button" className="primary" onClick={() => beginGuidedEvidenceCapture(selected, kind)}>
                            Required Set
                          </button>
                          <button type="button" onClick={() => captureExtraPhoto(selected, kind)}>
                            Photo +
                          </button>
                          <button type="button" onClick={() => captureExtraVideo(selected, kind)}>
                            Video +
                          </button>
                          <button type="button" onClick={() => requestFieldPhotoCapture(selected, kind, "image/*,video/*", false)}>
                            Gallery
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>

              <div className="field-flow-dock" data-field-pane="capture">
                <button type="button" className={`capture ${fieldFocusPane === "capture" ? "active" : ""}`} onClick={() => focusFieldPane("capture")}>
                  <span className="flow-icon">1</span>
                  <strong>Capture</strong>
                  <small>Before / after</small>
                </button>
                <button type="button" className={`evidence ${fieldFocusPane === "evidence" ? "active" : ""}`} onClick={() => focusFieldPane("evidence")}>
                  <span className="flow-icon">2</span>
                  <strong>Evidence</strong>
                  <small>Job card</small>
                </button>
                <button type="button" className={`package ${fieldFocusPane === "package" ? "active" : ""}`} onClick={() => focusFieldPane("package")}>
                  <span className="flow-icon">3</span>
                  <strong>Package</strong>
                  <small>PDFs / ZIPs</small>
                </button>
                <button type="button" className={`send ${fieldFocusPane === "send" ? "active" : ""}`} onClick={() => focusFieldPane("send")}>
                  <span className="flow-icon">4</span>
                  <strong>Send</strong>
                  <small>Review / send</small>
                </button>
              </div>

              {fieldCaptureGuide && fieldCaptureGuide.jobKey === jobKey(selected) ? (
                <div className={`field-capture-guide field-pane ${fieldFocusPane === "capture" ? "is-active" : ""} ${fieldEvidenceKindClass(fieldCaptureGuide.kind)}`}>
                  <div>
                    <span>Capture Step</span>
                    <strong>{fieldCaptureGuide.title}</strong>
                    <small>{fieldCaptureGuide.text}</small>
                  </div>
                  {fieldCaptureGuide.complete ? (
                    <div className="field-capture-actions">
                      <button type="button" onClick={() => captureExtraPhoto(selected, fieldCaptureGuide.kind, Boolean(fieldCaptureGuide.partial))}>
                        Add Photo
                      </button>
                      <button type="button" onClick={() => captureExtraVideo(selected, fieldCaptureGuide.kind, Boolean(fieldCaptureGuide.partial))}>
                        Add Video
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          if (fieldCaptureGuide.completeAction === "start_work") {
                            completeBeforeEvidenceAndStartWork(selected);
                            return;
                          }
                          if (fieldCaptureGuide.completeAction === "finish_work") {
                            completeAfterEvidenceAndFinishJob(selected, Boolean(fieldCaptureGuide.partial));
                            return;
                          }
                          clearGuidedCaptureState();
                          setFieldFocusPane("evidence");
                        }}
                      >
                        {fieldCaptureGuide.completeAction === "start_work"
                          ? "Before Done / Start Work"
                          : fieldCaptureGuide.completeAction === "finish_work"
                            ? fieldCaptureGuide.partial ? "After Done / Partial" : "After Done / Complete"
                            : "Done"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => requestFieldPhotoCapture(
                        selected,
                        fieldCaptureGuide.kind,
                        fieldCaptureGuide.accept,
                        fieldCaptureGuide.camera,
                        fieldCaptureGuide.step && fieldCaptureGuide.total
                          ? {
                              kind: fieldCaptureGuide.kind,
                              accept: fieldCaptureGuide.accept,
                              camera: fieldCaptureGuide.camera,
                              title: fieldCaptureGuide.title,
                              text: fieldCaptureGuide.text,
                              label: fieldCaptureGuide.label || fieldCaptureGuide.title,
                              step: fieldCaptureGuide.step,
                              total: fieldCaptureGuide.total,
                            }
                          : undefined
                      )}
                    >
                      {fieldCaptureGuide.step && fieldCaptureGuide.total
                        ? `Take ${fieldCaptureGuide.step}/${fieldCaptureGuide.total}`
                        : fieldCaptureGuide.camera ? "Open Camera" : "Open Upload"}
                    </button>
                  )}
                </div>
              ) : null}

              <div data-field-pane="evidence" className={`field-evidence-gallery field-pane ${fieldFocusPane === "evidence" ? "is-active" : ""} ${fieldEvidenceRowsFor(selected).length ? "has-evidence" : "empty"}`}>
                <div className="field-evidence-gallery-head">
                  <div>
                    <span>Job Evidence</span>
                    <strong>{fieldEvidenceRowsFor(selected).length ? "Saved on this job card" : "No evidence saved yet"}</strong>
                  </div>
                  <small>{fieldPhotoCountsFor(selected).images} image(s) / {fieldPhotoCountsFor(selected).videos} video(s)</small>
                </div>
                {fieldEvidenceRowsFor(selected).length ? (
                  <div className="field-evidence-gallery-grid">
                    {fieldEvidenceRowsFor(selected).slice(0, 6).map((media) => (
                      <div className={`field-evidence-gallery-item ${fieldEvidenceKindClass(media.kind)} ${media.mediaType}`} key={`gallery-${media.id}`}>
                        <div className="field-evidence-gallery-preview">
                          {fieldEvidencePreview(media) ? (
                            <img src={fieldEvidencePreview(media)} alt="" />
                          ) : (
                            <span>{media.mediaType === "video" ? "VIDEO" : "IMAGE"}</span>
                          )}
                        </div>
                        <div className="field-evidence-gallery-meta">
                          <strong>{media.evidenceLabel || fieldEvidenceLabel(media.kind)}</strong>
                          <span>{displayWorkflowDate(media.capturedAt)}</span>
                          <small>{media.name}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="field-evidence-gallery-empty">
                    <strong>Start Job opens Before Evidence</strong>
                    <span>Images and videos will appear here with labels after capture.</span>
                  </div>
                )}
              </div>

              <div className="field-workflow-grid">
                <div>
                  <span>Before Media</span>
                  <strong>{fieldPhotoCountsFor(selected).before}</strong>
                </div>
                <div>
                  <span>After Media</span>
                  <strong>{fieldPhotoCountsFor(selected).after}</strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong>{fieldPhotoCountsFor(selected).total}</strong>
                </div>
                <div>
                  <span>Videos</span>
                  <strong>{fieldPhotoCountsFor(selected).videos}</strong>
                </div>
                <div>
                  <span>Started</span>
                  <strong>{displayWorkflowDate(selected.JobStartedAt || selected.jobStartedAt || selected.ActualWorkStartDate || selected.actualWorkStartDate)}</strong>
                </div>
                <div>
                  <span>Finished</span>
                  <strong>{displayWorkflowDate(selected.JobFinishedAt || selected.jobFinishedAt || selected.ActualWorkCompletionDate || selected.actualWorkCompletionDate)}</strong>
                </div>
              </div>

              <div className="field-step-actions">
                <button type="button" className="start-job-btn" onClick={() => startFieldJob(selected)}>
                  Start Job
                </button>
                <button type="button" className="finish-job-btn" onClick={() => finishFieldJob(selected)}>
                  Finish Job
                </button>
                <button type="button" className="finish-job-btn" onClick={() => finishFieldJob(selected, true)}>
                  Partial Work
                </button>
                <button type="button" className="no-access-job-btn" onClick={() => startNoAccessCounter(selected)}>
                  No Access 1st
                </button>
                <button type="button" className="no-access-job-btn" onClick={() => markNoAccessSecondAttempt(selected)}>
                  No Access 2nd
                </button>
                <button type="button" className="refused-job-btn" onClick={() => markRefusedAccess(selected)}>
                  Refused Access
                </button>
                <button type="button" className="other-done-job-btn" onClick={() => markCompletedByOthers(selected)}>
                  Done by Others
                </button>
                <button type="button" className="reset-job-btn" onClick={() => resetFieldJobForTesting(selected)}>
                  Pending / Clear
                </button>
              </div>

              <div data-field-pane="package" className={`field-packet-vault field-pane ${fieldFocusPane === "package" ? "is-active" : ""}`}>
                <div className="field-packet-head">
                  <div>
                    <span>Saved Packages</span>
                    <strong>{fieldPacketRowsFor(selected).length ? `${fieldPacketRowsFor(selected).length} packet(s) saved` : "No packet saved yet"}</strong>
                  </div>
                  <small>{fieldPacketRowsFor(selected)[0] ? packetSizeLabel(fieldPacketRowsFor(selected)[0].size) : "Ready"}</small>
                </div>
                {fieldPacketRowsFor(selected).length ? (
                  <div className="field-packet-list">
                    {fieldPacketRowsFor(selected).slice(0, 3).map((packet) => (
                      <div className={`field-packet-row ${packet.packetType}`} key={packet.id}>
                        <div>
                          <strong>{fieldPacketLabel(packet)}</strong>
                          <span>{packetSizeLabel(packet.size)} - {fieldPacketSummary(packet)} - {displayWorkflowDate(packet.generatedAt)}</span>
                          <small>{packet.fileName} - {packet.note}</small>
                        </div>
                        <button type="button" onClick={() => shareStoredPackage(selected, packet, false)}>{String(packet.mimeType || "").includes("zip") ? "Send" : "Share PDF"}</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="field-packet-empty">
                    <strong>Generate Package from paperwork.</strong>
                    <span>One package screen will create, preview, and send the application ZIP plus video ZIP.</span>
                  </div>
                )}
              </div>

              {(() => {
                const invoicePacket = latestFieldPacket(selected, "affidavit_invoice_pdf");
                const preview = fullPackagePreviewFor(selected);
                const videoCount = fieldPhotoCountsFor(selected).videos;

                return (
                  <div data-field-pane="send" className={`field-send-panel field-pane ${fieldFocusPane === "send" ? "is-active" : ""}`}>
                    <div>
                      <span>Send Package</span>
                      <strong>{preview ? "Package review ready" : invoicePacket ? "Ready to generate package" : "Need package PDF"}</strong>
                      <small>
                        {preview?.fileName || invoicePacket?.fileName || "Tap Generate Package to open the package screen."}
                        {videoCount ? preview ? ` ${videoCount} video file(s) are inside the package ZIP.` : ` ${videoCount} video file(s) will be included when you generate the package.` : ""}
                      </small>
                    </div>
                    {preview ? (
                      <div className="field-package-preview">
                        <div>
                          <span>Review Package</span>
                          <strong>{packetSizeLabel(preview.size)}</strong>
                        </div>
                        <small>Old combined package saved. Use Generate Package for the new Preview and Send flow.</small>
                        <div className="field-package-preview-grid">
                          <span>Before <strong>{preview.beforeCount}</strong></span>
                          <span>After <strong>{preview.afterCount}</strong></span>
                          <span>Photos <strong>{preview.imageCount}</strong></span>
                          <span>Videos <strong>{preview.videoCount}</strong></span>
                          <span>Application <strong>{preview.hasInvoice ? "PDF" : "No"}</strong></span>
                        </div>
                        <div className="field-package-video-list">
                          <strong>Video files</strong>
                          {preview.videoNames.length ? (
                            preview.videoNames.slice(0, 8).map((name, index) => (
                              <span key={`${name}-${index}`}>{name}</span>
                            ))
                          ) : (
                            <span>No video files found in this package.</span>
                          )}
                          {preview.skippedMediaCount ? (
                            <span>{preview.skippedMediaCount} media item(s) were listed in the manifest as not included.</span>
                          ) : null}
                        </div>
                        <small>{preview.note}</small>
                      </div>
                    ) : null}
                    <div className={`field-send-actions ${preview ? "two" : "single"}`}>
                      <button
                        type="button"
                        onClick={() => runPackagePrimaryAction(selected)}
                      >
                        {packagePrimaryLabel(selected)}
                      </button>
                      {preview ? (
                        <button type="button" onClick={() => sendFullEvidencePackage(selected)}>
                          Send Package
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })()}

              <div className="field-evidence-rail compact">
                <div className="field-evidence-head">
                  <div>
                    <span>Saved Evidence</span>
                    <strong>{fieldPhotoCountsFor(selected).total ? `${fieldPhotoCountsFor(selected).total} file(s)` : "None yet"}</strong>
                  </div>
                  <small>{selected.PhotoPackageStatus || selected.photoPackageStatus || "Ready for package."}</small>
                </div>
                {fieldEvidenceRowsFor(selected).length ? (
                  <div className="field-evidence-list">
                    {fieldEvidenceRowsFor(selected).slice(0, 6).map((media) => (
                      <div className={`field-evidence-item ${fieldEvidenceKindClass(media.kind)} ${media.mediaType}`} key={media.id}>
                        <div className="field-evidence-thumb">
                          {fieldEvidencePreview(media) ? (
                            <img src={fieldEvidencePreview(media)} alt="" />
                          ) : (
                            <span>{media.mediaType === "video" ? "VID" : "IMG"}</span>
                          )}
                        </div>
                        <div className="field-evidence-copy">
                          <strong>{media.evidenceLabel || fieldEvidenceLabel(media.kind)}</strong>
                          <span>{media.mediaType.toUpperCase()} - {displayWorkflowDate(media.capturedAt)}</span>
                          <small>{media.address || displayAddress(selected)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="field-evidence-empty">
                    <strong>No saved evidence</strong>
                    <span>Before evidence required.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="selected-overview-grid">
              <button type="button" className="overview-tile" onClick={() => openJobInfoPopup(selected, "amount")}>
                <span>Amount</span>
                <strong>{displayAmount(selected) || money(selected) || "Not listed"}</strong>
              </button>
              <button type="button" className="overview-tile" onClick={() => openJobInfoPopup(selected, "dates")}>
                <span>Work Window</span>
                <strong>{workWindowInfo(selected).statusLabel}</strong>
                <small>{workWindowInfo(selected).startDate} to {workWindowInfo(selected).endDate}</small>
              </button>
              <button type="button" className="overview-tile" onClick={() => openJobInfoPopup(selected, "location")}>
                <span>Location</span>
                <strong>{displayLocation(selected) || "Not listed"}</strong>
                <small>{selected?.borough || "Unknown borough"}</small>
              </button>
              <div className="overview-tile">
                <span>Phone</span>
                <strong>{phone(selected) || "Not listed"}</strong>
              </div>
            </div>

            {(selected.PackageReadyMessage || selected.packageReadyMessage || workflowSecondAttemptInfo(selected) || selected.RefusalDate || selected.refusalDate) ? (
              <div className="selected-alert-grid">
                {selected.PackageReadyMessage || selected.packageReadyMessage ? (
                  <div className="selected-alert-card package-ready-card">
                    <span>Package Message</span>
                    <strong>{selected.PackageReadyMessage || selected.packageReadyMessage}</strong>
                    <small>{displayWorkflowDate(selected.PackageGeneratedAt || selected.packageGeneratedAt)}</small>
                  </div>
                ) : null}
              {workflowSecondAttemptInfo(selected) ? (
                  <div className={`selected-alert-card no-access-timer-card ${workflowSecondAttemptInfo(selected)?.ready ? "no-access-ready" : ""}`}>
                  <span>72h No Access Counter</span>
                  <strong>
                    {workflowSecondAttemptInfo(selected)?.ready
                      ? "REVISIT NOW - READY FOR 2ND ATTEMPT" : workflowSecondAttemptInfo(selected)?.label}
                  </strong>
                  <small>
                    1st Attempt: {displayWorkflowDate(selected.NoAccessFirstAttemptAt || selected.noAccessFirstAttemptAt)}
                    {" · "}
                    Maturity: {displayWorkflowDate(selected.SecondAttemptAvailableAt || selected.secondAttemptAvailableAt)}
                  </small>
                </div>
              ) : null}
              {selected.RefusalDate || selected.refusalDate ? (
                  <div className="selected-alert-card">
                    <span>Refused Access Date</span>
                    <strong>{displayWorkflowDate(selected.RefusalDate || selected.refusalDate)}</strong>
                  </div>
              ) : null}
              </div>
            ) : null}

            {displayDescription(selected) ? (
              <div className="selected-description clean-description-card">
                <div className="description-head">
                  <span>Job Description</span>
                  <strong>{descriptionStatusLabel(selected)}</strong>
                </div>
                <p>{descriptionSummary(selected)}</p>
                <div className="description-inline-actions">
                  <button type="button" onClick={() => setDescriptionOpen(true)}>Open</button>
                  <button type="button" onClick={() => speakText(descriptionSummary(selected), "summary")}>Summary</button>
                  <button type="button" onClick={() => speakText(displayDescription(selected), "full")}>Read Full</button>
                  <button type="button" onClick={stopSpeaking}>Stop</button>
                </div>
              </div>
            ) : (
              <div className="selected-description missing-description-box">
                <div className="description-head">
                  <span>Job Description</span>
                  <strong>Missing</strong>
                </div>
                <p>No job description was found for this row. Check ITB/COA source.</p>
              </div>
            )}

            <div className="selected-status-panel">
              <div className="selected-section-head">
                <span>Update Status</span>
                <strong>{draftWorkflowStatus || workflowLabel(selected) || "Choose field outcome"}</strong>
              </div>
              <div className="selected-status-grid">
                <button type="button" onClick={() => pickDraftWorkflow("No Access - 1st Attempt")}>No Access 1st</button>
                <button type="button" onClick={() => pickDraftWorkflow("No Access - 2nd Attempt")}>No Access 2nd</button>
                <button type="button" onClick={() => pickDraftWorkflow("Refused Access")}>Refused</button>
                <button type="button" onClick={() => pickDraftWorkflow("Work Completed")}>Completed</button>
                <button type="button" onClick={() => pickDraftWorkflow("Partial Work Completed")}>Partial</button>
                <button type="button" onClick={() => pickDraftWorkflow("Completed by Others")}>Other Done</button>
                <button type="button" onClick={() => resetFieldJobForTesting(selected)}>Clear</button>
              </div>
            </div>

            {draftWorkflowStatus ? (
              <div className="workflow-save-panel">
                <div className="detail">
                  <span>Selected Status</span>
                  <strong>{draftWorkflowStatus}</strong>
                </div>
                <label className="workflow-date-input">
                  Status Date / Time
                  <input
                    type="datetime-local"
                    value={draftWorkflowDate}
                    onChange={(event) => {
                      setDraftWorkflowDate(event.target.value);
                      setDraftWorkflowSaved(false);
                    }}
                  />
                </label>
                <button type="button" className="save-status-btn" onClick={() => saveDraftWorkflow(selected)}>
                  Save Status
                </button>
                {draftWorkflowSaved ? <p className="saved-status-note">Saved ✓ Synced to CSV + Google Drive.</p> : null}
              </div>
            ) : null}

            <details className="more-job-details">
              <summary>More job details</summary>
              <div className="detail-grid compact-detail-grid">
                <div className="detail"><span>Award Date</span><strong>{maturityInfo(selected).award}</strong></div>
                <div className="detail"><span>COA Counter</span><strong>{jobCounterLabel(selected)}</strong></div>
                <div className="detail"><span>Work Start</span><strong>{selected.WorkStartDate || selected.workStartDate || "Not listed"}</strong></div>
                <div className="detail"><span>Work Complete</span><strong>{selected.WorkCompletionDate || selected.workCompletionDate || "Not listed"}</strong></div>
                <div className="detail"><span>No Access 1st</span><strong>{displayWorkflowDate(selected.NoAccessFirstAttemptAt || selected.noAccessFirstAttemptAt)}</strong></div>
                <div className="detail"><span>No Access 2nd</span><strong>{displayWorkflowDate(selected.NoAccessSecondAttemptAt || selected.noAccessSecondAttemptAt)}</strong></div>
                <div className="detail"><span>Due Date</span><strong>{selected.bidDueDate || selected.dueDate || "Not listed"}</strong></div>
                <div className="detail"><span>Contractor</span><strong>{selected.contractor || "Not listed"}</strong></div>
                <div className="detail"><span>Owner</span><strong>{selected.owner || "Not listed"}</strong></div>
                <div className="detail"><span>Docs</span><strong>{[(selected.COAFile || selected.coaFile) ? "COA" : "", (selected.ITBFile || selected.itbFile) ? "ITB" : "", (selected.PDFFile || selected.pdfFile) ? "PDF" : ""].filter(Boolean).join(" / ") || "Not listed"}</strong></div>
                <div className="detail"><span>Map Source</span><strong>{selected._source || "unmapped"}</strong></div>
              </div>
            </details>

              {(generatedLinks.invoice || generatedLinks.affidavit) ? (
                <div className="generated-output-links">
                  {generatedLinks.invoice ? <a target="_blank" rel="noreferrer" href={generatedLinks.invoice}>Open Invoice PDF</a> : null}
                  {generatedLinks.affidavit ? <a target="_blank" rel="noreferrer" href={generatedLinks.affidavit}>Open Affidavit PDF</a> : null}
                </div>
              ) : null}
            </div>
          ) : null}

        {!selectedOnly ? filteredJobs.slice(0, 60).map((job, index) => (
          <button
            className={`job-card compact-job-card job-status-card ${JobStatus.statusCardClass(job)}`}
            key={`${jobKey(job, index)}-${index}`}
            type="button"
            onClick={() => focusJob(job)}
          >
            <div className="job-main-row">
              <div>
                <strong className="job-title">{jobKey(job, index)}</strong>
                <p className="job-address">{displayAddress(job)}</p>
                <p className="job-sub">{job.borough || "Unknown borough"} · {displayLocation(job) || "Location not listed"}</p>
              </div>
              <div className="compact-job-status">
                <span className={`status ${statusClass(job.status)}`}>{JobStatus.statusLabel(job)}</span>
                <span className={`maturity-pill ${maturityPriorityClass(job)}`}>{jobCounterLabel(job)}</span>
              </div>
            </div>
            <div className="quick-info-strip compact-info-strip">
              <div><span>Amount</span><strong>{displayAmount(job) || "Not listed"}</strong></div>
              <div><span>Window</span><strong>{workWindowInfo(job).statusLabel}</strong></div>
              <div><span>Action</span><strong>{nextActionInfo(job).label}</strong></div>
            </div>
          </button>
        )) : null}
        </aside>
            {descriptionOpen && selected?.description ? (
          <div className="description-modal">
            <div className="description-modal-head">
              <div>
                <strong>{jobKey(selected)}</strong>
                <span>{displayAddress(selected)}</span>
              </div>
              <button type="button" onClick={() => setDescriptionOpen(false)}>Close</button>
            </div>

            <div className="description-modal-body">
              <h2>Job Description</h2>
              <p>{displayDescription(selected)}</p>
            </div>
          </div>
        ) : null}
      </main>
  );
}

























































































































































































































