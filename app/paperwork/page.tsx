"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { bytesToDataUrl, clearFieldPackets, saveFieldPacket } from "../../lib/field-packet-store";
import { type FieldMedia, dataUrlToBytes, listFieldEvidence } from "../../lib/field-photo-store";
import {
  type PaperworkOutcome,
  HPD_STATUS_WORKER_URL,
  affidavitReasonForOutcome,
  affidavitTemplateLabel,
  applySavedWorkflowStatuses,
  defaultPaperworkInvoiceNo,
  formatCurrency,
  getJobAddress,
  getJobAmount,
  getJobBorough,
  getJobDate,
  getJobDescription,
  getJobId,
  getJobLocation,
  getJobWorkflowStatus,
  invoiceDescriptionForOutcome,
  isNoWorkOutcome,
  noWorkServiceChargeForJob,
  paperworkOutcomeFromJob,
  paperworkOutcomeFromValue,
} from "../../lib/paperwork";

type JobRecord = Record<string, unknown>;

type PackageForm = {
  invoiceNo: string;
  invoiceDate: string;
  contractor: string;
  customer: string;
  jobId: string;
  address: string;
  location: string;
  borough: string;
  amount: string;
  bidAmount: string;
  description: string;
  affidavitType: string;
  affidavitReason: string;
  fieldDate: string;
  firstAttempt: string;
  secondAttempt: string;
  deniedName: string;
  deniedRelationship: string;
  deniedDescription: string;
  deniedPhone: string;
  workStart: string;
  workComplete: string;
  signer: string;
  sourceStatus: string;
  notes: string;
};

const WORK_AFFIDAVIT_TEMPLATE = "/templates/work-completed-affidavit.pdf";
const NO_WORK_AFFIDAVIT_TEMPLATE = "/templates/no-work-completed-affidavit.pdf";
const COMPLETE_PACKAGE_SAVE_LIMIT_BYTES = 35 * 1024 * 1024;
const AFFIDAVIT_NOTARY_COUNTY = "QUEENS";
const REFUSED_ACCESS_DESCRIPTION_EXAMPLE = "MALE, TALL, DARK HAIR";
const NO_WORK_COMPLETED_BY_OTHERS_LINE_5_DATE = { x: 272, y: 245, size: 10 } as const;

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

type GeneratedPdfResult = {
  jobId: string;
  fileName: string;
  bytes: Uint8Array;
  dataUrl: string;
  size: number;
};

type CompletePackagePreview = {
  jobId: string;
  completeFileName: string;
  completeSize: number;
  completeUrl: string;
  applicationFileName: string;
  applicationSize: number;
  applicationUrl: string;
  applicationMediaCount: number;
  imageCount: number;
  videoCount: number;
  beforeCount: number;
  afterCount: number;
  pdfFileName: string;
  videoPackageFileName: string;
  videoPackageSize: number;
  videoPackageUrl: string;
  videoNames: string[];
  videoLinks: Array<{
    name: string;
    url: string;
    size: number;
  }>;
  skippedMediaCount: number;
  applicationPacketId?: string;
  videoPacketId?: string;
  note: string;
};

type PendingCompletePackage = CompletePackagePreview & {
  completeBytes: Uint8Array;
  applicationBytes: Uint8Array;
  videoBytes?: Uint8Array;
  applicationShareFiles: File[];
  videoShareFiles: File[];
};

type GeneratePdfOptions = {
  downloadPdf?: boolean;
  markGenerated?: boolean;
  formOverride?: PackageForm;
};

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateValue(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function displayDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = parseDateValue(raw);
  if (!parsed) return raw;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const year = String(parsed.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function displayDateTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = parseDateValue(raw);
  if (!parsed) return raw;
  return parsed.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function monthName(value: string) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleString("en-US", { month: "long" }).toUpperCase() : "";
}

function dayOfMonth(value: string) {
  const parsed = parseDateValue(value);
  return parsed ? String(parsed.getDate()).padStart(2, "0") : "";
}

function initialForm(): PackageForm {
  return {
    invoiceNo: defaultPaperworkInvoiceNo(),
    invoiceDate: todayIsoDate(),
    contractor: "United Angel Construction Corp.",
    customer: "HPD / OMO",
    jobId: "",
    address: "",
    location: "",
    borough: "",
    amount: "",
    bidAmount: "",
    description: "Select a job and field outcome to prepare paperwork.",
    affidavitType: affidavitTemplateLabel("pending"),
    affidavitReason: affidavitReasonForOutcome("pending"),
    fieldDate: todayIsoDate(),
    firstAttempt: "",
    secondAttempt: "",
    deniedName: "",
    deniedRelationship: "",
    deniedDescription: "",
    deniedPhone: "",
    workStart: "",
    workComplete: "",
    signer: "",
    sourceStatus: "",
    notes: "",
  };
}

function cleanRefusedName(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(super|superintendent|building super|unknown|n\/a|na|none)$/i.test(raw)) return "";
  return raw;
}

function refusedAccessRelationship(job: JobRecord, outcome: PaperworkOutcome) {
  const explicit = jobText(job, [
    "RelationshipToBuilding",
    "relationshipToBuilding",
    "BuildingRelationship",
    "buildingRelationship",
    "DeniedRelationship",
    "deniedRelationship",
    "RefusedRelationship",
    "refusedRelationship",
    "RefusedByRelationship",
    "refusedByRelationship",
    "DeniedByRelationship",
    "deniedByRelationship",
    "IndividualRelationship",
    "individualRelationship",
  ]);
  if (explicit) return explicit;
  return outcome === "refused_access" ? "SUPER" : "";
}

function refusedAccessDescription(value: string) {
  return String(value || "").trim();
}

function refusedAccessNeedsDescription(outcome: PaperworkOutcome, form: PackageForm) {
  return outcome === "refused_access" && !refusedAccessDescription(form.deniedDescription);
}

function formFromJob(job: JobRecord, outcome: PaperworkOutcome): PackageForm {
  const jobId = getJobId(job);
  const firstAttemptAt = String(job.NoAccessFirstAttemptAt || job.noAccessFirstAttemptAt || "").trim();
  const secondAttemptAt = String(job.NoAccessSecondAttemptAt || job.noAccessSecondAttemptAt || "").trim();
  const refusedAt = String(job.RefusalDate || job.refusalDate || "").trim();
  const verifiedByOthersAt = String(job.VerifiedByOthersDate || job.verifiedByOthersDate || "").trim();
  const actualStartAt = String(job.ActualWorkStartDate || job.actualWorkStartDate || "").trim();
  const actualCompleteAt = String(job.ActualWorkCompletionDate || job.actualWorkCompletionDate || "").trim();
  const lastEvidenceAt = String(job.LastEvidenceCapturedAt || job.lastEvidenceCapturedAt || "").trim();
  const deniedName = cleanRefusedName(jobText(job, [
    "DeniedName",
    "deniedName",
    "DeniedByName",
    "deniedByName",
    "RefusedByName",
    "refusedByName",
    "AccessDeniedByName",
    "accessDeniedByName",
    "SuperName",
    "superName",
    "BuildingSuperName",
    "buildingSuperName",
    "SuperintendentName",
    "superintendentName",
    "OwnerEmployeeName",
    "ownerEmployeeName",
    "AgentName",
    "agentName",
  ]));
  const deniedRelationship = refusedAccessRelationship(job, outcome);
  const deniedDescription = jobText(job, [
    "DeniedDescription",
    "deniedDescription",
    "DeniedByDescription",
    "deniedByDescription",
    "RefusedAccessDescription",
    "refusedAccessDescription",
    "RefusedByDescription",
    "refusedByDescription",
    "DescriptionOfIndividual",
    "descriptionOfIndividual",
    "IndividualDescription",
    "individualDescription",
    "PersonDescription",
    "personDescription",
  ]);
  const deniedPhone = jobText(job, [
    "DeniedPhone",
    "deniedPhone",
    "DeniedByPhone",
    "deniedByPhone",
    "RefusedPhone",
    "refusedPhone",
    "RefusedByPhone",
    "refusedByPhone",
    "IndividualPhone",
    "individualPhone",
    "SuperPhone",
    "superPhone",
    "SuperintendentPhone",
    "superintendentPhone",
  ]);
  const lockedAt = String(job.OutcomeLockedAt || job.outcomeLockedAt || "").trim();
  const sourceStatus = getJobWorkflowStatus(job);
  const fieldDate = lastEvidenceAt || lockedAt || secondAttemptAt || refusedAt || verifiedByOthersAt || actualCompleteAt || firstAttemptAt;
  const noWorkCompleteAt = lastEvidenceAt || secondAttemptAt || refusedAt || verifiedByOthersAt || lockedAt;
  const workCompleteAt = lastEvidenceAt || actualCompleteAt || lockedAt || getJobDate(job, "complete");
  const bidAmount = formatCurrency(getJobAmount(job));
  const chargeAmount = isNoWorkOutcome(outcome) ? formatCurrency(noWorkServiceChargeForJob(job)) : bidAmount;

  return {
    ...initialForm(),
    invoiceNo: defaultPaperworkInvoiceNo(jobId),
    jobId,
    address: getJobAddress(job),
    location: getJobLocation(job),
    borough: getJobBorough(job),
    amount: chargeAmount,
    bidAmount,
    description: invoiceDescriptionForOutcome(job, outcome),
    affidavitType: affidavitTemplateLabel(outcome),
    affidavitReason: affidavitReasonForOutcome(outcome),
    fieldDate: displayDate(fieldDate) || todayIsoDate(),
    firstAttempt: displayDate(firstAttemptAt || (outcome === "no_access" ? lockedAt : "")),
    secondAttempt: displayDate(noWorkCompleteAt),
    deniedName,
    deniedRelationship,
    deniedDescription,
    deniedPhone,
    workStart: displayDate(actualStartAt || getJobDate(job, "start")),
    workComplete: displayDate(outcome === "work_completed" || outcome === "partial_work_completed" ? workCompleteAt : noWorkCompleteAt),
    sourceStatus,
    notes: getJobDescription(job).slice(0, 650),
  };
}

function jobText(job: JobRecord | null | undefined, keys: string[]) {
  if (!job) return "";

  for (const key of keys) {
    const value = job[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function latestEvidenceCapturedAt(rows: FieldMedia[]) {
  return rows.reduce((latest, media) => {
    const parsed = parseDateValue(media.capturedAt);
    if (!parsed) return latest;
    const current = latest ? parseDateValue(latest) : null;
    return !current || parsed.getTime() > current.getTime() ? media.capturedAt : latest;
  }, "");
}

function firstDateText(job: JobRecord | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = jobText(job, [key]);
    if (value && parseDateValue(value)) return value;
  }

  return "";
}

function statusEventDateForJob(job: JobRecord | null | undefined, outcome: PaperworkOutcome) {
  const common = ["LastEvidenceCapturedAt", "lastEvidenceCapturedAt", "OutcomeLockedAt", "outcomeLockedAt", "updatedAt", "UpdatedAt"];

  if (outcome === "work_completed" || outcome === "partial_work_completed") {
    return firstDateText(job, [
      "AfterPhotosCapturedAt",
      "afterPhotosCapturedAt",
      "ActualWorkCompletionDate",
      "actualWorkCompletionDate",
      "JobFinishedAt",
      "jobFinishedAt",
      ...common,
    ]);
  }

  if (outcome === "refused_access") {
    return firstDateText(job, ["RefusalDate", "refusalDate", "RefusedEvidenceCapturedAt", "refusedEvidenceCapturedAt", ...common]);
  }

  if (outcome === "completed_by_others") {
    return firstDateText(job, [
      "VerifiedByOthersDate",
      "verifiedByOthersDate",
      "CompletedByOthersEvidenceCapturedAt",
      "completedByOthersEvidenceCapturedAt",
      ...common,
    ]);
  }

  if (outcome === "no_access") {
    return firstDateText(job, [
      "NoAccessSecondAttemptAt",
      "noAccessSecondAttemptAt",
      "NoAccessEvidenceCapturedAt",
      "noAccessEvidenceCapturedAt",
      ...common,
      "NoAccessFirstAttemptAt",
      "noAccessFirstAttemptAt",
    ]);
  }

  return firstDateText(job, common);
}

function fieldEventDateForPackage(job: JobRecord | null | undefined, outcome: PaperworkOutcome, rows: FieldMedia[]) {
  return latestEvidenceCapturedAt(rows) || statusEventDateForJob(job, outcome);
}

function formWithFieldEventDate(form: PackageForm, outcome: PaperworkOutcome, eventDate: string, job: JobRecord | null) {
  const fieldDate = displayDate(eventDate);
  if (!fieldDate) return form;

  const actualStartAt = jobText(job, ["ActualWorkStartDate", "actualWorkStartDate", "JobStartedAt", "jobStartedAt"]);
  const noAccessFirstAt = jobText(job, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt"]);
  const next: PackageForm = {
    ...form,
    invoiceDate: fieldDate,
    fieldDate,
  };

  if (outcome === "work_completed" || outcome === "partial_work_completed") {
    return {
      ...next,
      workStart: displayDate(actualStartAt) || fieldDate,
      workComplete: fieldDate,
    };
  }

  if (isNoWorkOutcome(outcome)) {
    return {
      ...next,
      firstAttempt: displayDate(noAccessFirstAt) || form.firstAttempt || fieldDate,
      secondAttempt: fieldDate,
      workComplete: fieldDate,
    };
  }

  return next;
}

function cleanAmount(value: string) {
  const cleaned = String(value || "").replace(/[$,\s]/g, "").trim();
  return cleaned || "0";
}

function amountNumber(value: string) {
  const parsed = Number(cleanAmount(value).replace(/[()]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pdfMoney(value: number | string, negativeStyle = false) {
  const numeric = typeof value === "number" ? value : amountNumber(value);
  const formatted = Math.abs(numeric).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (negativeStyle && numeric < 0) return `(${formatted})`;
  return formatted;
}

function upper(value: string) {
  return String(value || "").toUpperCase();
}

function oathSigner(value: string) {
  const raw = String(value || "JOTJAGRAJ SINGH").trim();
  return raw
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

const WORK_MATERIALS = ["TRASH BAG", "WD 40", "SELF SCREWS", "PLEASE SEE ATTACHED DESCRIPTION", "", "ADJUSTMENTS/ ALIGNMENT"];
const PARTIAL_MATERIALS = ["TRASH BAG", "WD 40", "SELF SCREWS", "PLEASE SEE ATTACHED DESCRIPTION", "STRIKE PLATE", "ADJUST AND ALIGN"];

function safeFilename(value: string) {
  return String(value || "HPD")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function packetSizeLabel(size: number) {
  const value = Number(size || 0);
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

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

let zipCrcTable: Uint32Array | null = null;

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
  centralChunks.forEach((chunk) => chunks.push(chunk));
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  chunks.push(end);

  return concatZipChunks(chunks);
}

function safeAttachmentName(name: string, fallback: string) {
  return String(name || fallback)
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function mediaExtension(media: FieldMedia) {
  const name = String(media.name || "");
  const match = name.match(/\.[a-z0-9]+$/i);
  if (match) return match[0].toLowerCase();
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

function fieldEvidenceKindClass(kind = "general") {
  return kind.replace(/_/g, "-");
}

function fullPackageMediaPath(jobId: string, media: FieldMedia, index: number) {
  const mediaFolder = media.mediaType === "video" ? "videos" : "images";
  const folder = fieldEvidenceKindClass(media.kind || "general");
  const label = zipSafePart(media.evidenceLabel || "Field Evidence", "evidence");
  const fallbackName = `${safeFilename(jobId)}-${String(index + 1).padStart(2, "0")}-${folder}${mediaExtension(media)}`;
  const fileName = safeAttachmentName(media.name, fallbackName);
  return `${mediaFolder}/${folder}/${String(index + 1).padStart(2, "0")}-${label}-${fileName}`;
}

function completePackageFileName(form: PackageForm, jobId: string) {
  const location = safeFilename(form.location || form.address || form.borough || "LOCATION");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${safeFilename(jobId)}_${location}_complete-package_${stamp}.zip`;
}

function splitPackageFileName(form: PackageForm, jobId: string, suffix: "application-package" | "video-package") {
  const location = safeFilename(form.location || form.address || form.borough || "LOCATION");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${safeFilename(jobId)}_${location}_${suffix}_${stamp}.zip`;
}

function bytesToFile(bytes: Uint8Array, fileName: string, mimeType = "application/zip") {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buffer], fileName, { type: mimeType });
}

function bytesToObjectUrl(bytes: Uint8Array, mimeType = "application/octet-stream") {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

function mediaHasPackageBytes(media: FieldMedia) {
  const dataUrl = String(media.dataUrl || "");
  const commaIndex = dataUrl.indexOf(",");
  return dataUrl.startsWith("data:") && commaIndex > 0 && dataUrl.slice(commaIndex + 1).trim().length > 0;
}

function packageManifestText(
  jobId: string,
  pdf: GeneratedPdfResult,
  includedMedia: FieldMedia[],
  skippedMedia: FieldMedia[]
) {
  const lines = [
    "HPD COMPLETE PACKAGE",
    `OMO / WORK #: ${jobId}`,
    `Generated: ${new Date().toLocaleString("en-US")}`,
    "",
    "PDF",
    `- ${pdf.fileName} (${packetSizeLabel(pdf.size)})`,
    "",
    `MEDIA INCLUDED (${includedMedia.length})`,
    ...includedMedia.map((media, index) => {
      const label = media.mediaType === "video" ? "VIDEO" : "IMAGE";
      const stamp = media.mediaType === "video" ? (media.stamped === false ? "ORIGINAL VIDEO" : "STAMPED VIDEO") : "STAMPED IMAGE";
      const captured = displayDate(media.capturedAt) || media.capturedAt || "date not saved";
      return `- ${String(index + 1).padStart(2, "0")} ${label}: ${media.name || "unnamed"} | ${media.evidenceLabel || media.kind} | ${captured} | ${stamp} | ${packetSizeLabel(media.size)}`;
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

function videoPackageManifestText(jobId: string, videos: FieldMedia[]) {
  return [
    "HPD VIDEO PACKAGE",
    `OMO / WORK #: ${jobId}`,
    `Generated: ${new Date().toLocaleString("en-US")}`,
    "",
    `VIDEOS INCLUDED (${videos.length})`,
    ...videos.map((media, index) => {
      const stamp = media.stamped === false ? "ORIGINAL VIDEO - label is in filename and manifest" : "STAMPED VIDEO";
      const captured = displayDate(media.capturedAt) || media.capturedAt || "date not saved";
      return `- ${String(index + 1).padStart(2, "0")} VIDEO: ${media.name || "unnamed"} | ${media.evidenceLabel || media.kind} | ${captured} | ${stamp} | ${packetSizeLabel(media.size)}`;
    }),
  ].join("\n");
}

function findJob(rows: JobRecord[], id: string) {
  const target = id.trim().toLowerCase();
  if (!target) return null;

  return (
    rows.find((job) => {
      const candidates = [getJobId(job), String(job.OMO || ""), String(job.omo || ""), String(job.id || "")];
      return candidates.some((candidate) => candidate.trim().toLowerCase() === target);
    }) || null
  );
}

function savedOutcomeForPackage(job: JobRecord | null, packageType: "work" | "no_work", current: PaperworkOutcome = "pending") {
  const saved = job ? paperworkOutcomeFromJob(job) : "pending";

  if (packageType === "work") {
    return saved === "partial_work_completed" ? saved : "work_completed";
  }

  if (isNoWorkOutcome(saved)) return saved;
  if (isNoWorkOutcome(current)) return current;
  return "no_access";
}

function packageTypeForOutcome(outcome: PaperworkOutcome) {
  return isNoWorkOutcome(outcome) ? "no_work" : "work";
}

function noWorkSourceLine(outcome: PaperworkOutcome, form: PackageForm) {
  if (!isNoWorkOutcome(outcome)) return "No access, refused access, or done by others from saved JSON.";
  if (outcome === "refused_access") {
    const who = [form.deniedName, form.deniedRelationship].filter(Boolean).join(" / ");
    return `Refused access${who ? ` by ${who}` : ""}${form.secondAttempt ? ` on ${form.secondAttempt}` : ""}.`;
  }
  if (outcome === "completed_by_others") {
    return `Work completed by others${form.secondAttempt ? ` verified ${form.secondAttempt}` : ""}.`;
  }
  return `No access${form.firstAttempt ? ` 1st ${form.firstAttempt}` : ""}${form.secondAttempt ? ` / 2nd ${form.secondAttempt}` : ""}.`;
}

function saveLocalPackageOverride(jobId: string, patch: Record<string, unknown>) {
  if (typeof window === "undefined" || !jobId) return;

  try {
    const key = "hpd-job-workflow-overrides-v2";
    const raw = window.localStorage.getItem(key);
    const rows = raw ? JSON.parse(raw) : {};
    rows[jobId] = {
      ...(rows[jobId] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {}
}

export default function PaperworkPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [outcome, setOutcome] = useState<PaperworkOutcome>("pending");
  const [form, setForm] = useState<PackageForm>(initialForm);
  const [loadedQuery, setLoadedQuery] = useState(false);
  const [autoGeneratePackage, setAutoGeneratePackage] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [packagePreview, setPackagePreview] = useState<CompletePackagePreview | null>(null);
  const [packagePreviewOpen, setPackagePreviewOpen] = useState(false);
  const pendingCompletePackageRef = useRef<PendingCompletePackage | null>(null);
  const autoGenerateStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (packagePreview?.completeUrl) URL.revokeObjectURL(packagePreview.completeUrl);
      if (packagePreview?.applicationUrl) URL.revokeObjectURL(packagePreview.applicationUrl);
      if (packagePreview?.videoPackageUrl) URL.revokeObjectURL(packagePreview.videoPackageUrl);
      packagePreview?.videoLinks.forEach((link) => URL.revokeObjectURL(link.url));
    };
  }, [packagePreview]);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const res = await fetch("/data/COA_Fetcher_2026.json", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        const rows = await applySavedWorkflowStatuses(asArray(data));
        if (!cancelled) setJobs(rows);
      } catch (error) {
        console.error(error);
      }
    }

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || loadedQuery) return;

    const params = new URLSearchParams(window.location.search);
    const job = params.get("job") || "";
    const packageParam = String(params.get("package") || params.get("type") || "").toLowerCase();
    const autoParam = String(params.get("auto") || params.get("generate") || "").toLowerCase();
    let nextOutcome = paperworkOutcomeFromValue(params.get("outcome") || "");

    if (nextOutcome === "pending") {
      if (packageParam.includes("no")) nextOutcome = "no_access";
      else if (packageParam.includes("work")) nextOutcome = "work_completed";
    }

    setSelectedId(job);
    setOutcome(nextOutcome);
    setAutoGeneratePackage(["package", "1", "true", "yes"].includes(autoParam));
    setForm((current) => ({
      ...current,
      affidavitType: affidavitTemplateLabel(nextOutcome),
      affidavitReason: affidavitReasonForOutcome(nextOutcome),
      description: invoiceDescriptionForOutcome(null, nextOutcome),
    }));
    setLoadedQuery(true);
  }, [loadedQuery]);

  useEffect(() => {
    if (!selectedId || !jobs.length) return;
    const job = findJob(jobs, selectedId);
    if (!job) return;
    const selectedOutcome =
      outcome === "pending"
        ? paperworkOutcomeFromJob(job)
        : isNoWorkOutcome(outcome)
          ? savedOutcomeForPackage(job, "no_work", outcome)
          : outcome;
    setOutcome(selectedOutcome);
    setForm(formFromJob(job, selectedOutcome));
  }, [jobs, selectedId]);

  const selectedJob = useMemo(() => findJob(jobs, selectedId), [jobs, selectedId]);

  useEffect(() => {
    if (!autoGeneratePackage || autoGenerateStartedRef.current) return;
    if (!selectedId || !jobs.length || !selectedJob || !form.jobId) return;

    autoGenerateStartedRef.current = true;
    setPdfStatus("Auto-generating package from saved evidence...");
    window.setTimeout(() => {
      void generateCompletePackage();
    }, 250);
  }, [autoGeneratePackage, selectedId, jobs.length, selectedJob, form.jobId]);

  function clearPackagePreview() {
    setPackagePreview(null);
    setPackagePreviewOpen(false);
    pendingCompletePackageRef.current = null;
  }

  function chooseJob(id: string) {
    clearPackagePreview();
    setSelectedId(id);
    const job = findJob(jobs, id);
    if (!job) return;

    const nextOutcome =
      outcome === "pending"
        ? paperworkOutcomeFromJob(job)
        : savedOutcomeForPackage(job, packageTypeForOutcome(outcome), outcome);
    setOutcome(nextOutcome);
    setForm(formFromJob(job, nextOutcome));
  }

  function chooseOutcome(value: string) {
    clearPackagePreview();
    const nextOutcome = paperworkOutcomeFromValue(value);
    setOutcome(nextOutcome);
    setForm((current) => ({
      ...current,
      amount: isNoWorkOutcome(nextOutcome) ? formatCurrency(noWorkServiceChargeForJob(selectedJob)) : current.bidAmount || current.amount,
      description: invoiceDescriptionForOutcome(selectedJob, nextOutcome),
      affidavitType: affidavitTemplateLabel(nextOutcome),
      affidavitReason: affidavitReasonForOutcome(nextOutcome),
    }));
  }

  function choosePackage(packageType: "work" | "no_work") {
    const nextOutcome = savedOutcomeForPackage(selectedJob, packageType, outcome);
    chooseOutcome(nextOutcome);
  }

  function update(key: keyof PackageForm, value: string) {
    clearPackagePreview();
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function markPackageGenerated(jobId: string) {
    if (!jobId) return "Package generated.";

    const generatedAt = new Date().toISOString();
    const patch = {
      ArchivedFromMap: true,
      archivedFromMap: true,
      PackageGeneratedAt: generatedAt,
      packageGeneratedAt: generatedAt,
      PackageReadyMessage: "Invoice package generated. Send to RER.",
      packageReadyMessage: "Invoice package generated. Send to RER.",
    };

    saveLocalPackageOverride(jobId, patch);

    try {
      const response = await fetch(`${HPD_STATUS_WORKER_URL}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: jobId, patch }),
      });

      if (!response.ok) throw new Error(await response.text());
      return "Archived on map. Send to RER.";
    } catch (error) {
      console.error(error);
      return "Downloaded. Archived on this device; server sync needs retry.";
    }
  }

  async function generateAffidavitPdf(options: GeneratePdfOptions = {}): Promise<GeneratedPdfResult | null> {
    const downloadPdf = options.downloadPdf !== false;
    const markGenerated = options.markGenerated !== false;
    const activeForm = options.formOverride || form;
    const useWorkTemplate = outcome === "work_completed" || outcome === "partial_work_completed";
    const templateUrl = useWorkTemplate ? WORK_AFFIDAVIT_TEMPLATE : NO_WORK_AFFIDAVIT_TEMPLATE;
    const jobId = activeForm.jobId || selectedId || "HPD";
    const archiveJobId = activeForm.jobId || selectedId;
    const borough = activeForm.borough || (selectedJob ? getJobBorough(selectedJob) : "");
    const bidValue = amountNumber(activeForm.bidAmount || activeForm.amount);
    const chargeValue = amountNumber(activeForm.amount || activeForm.bidAmount);
    const bidAmount = pdfMoney(bidValue);
    const chargeAmount = pdfMoney(chargeValue);
    const changeAmount = outcome === "partial_work_completed"
      ? pdfMoney(Math.max(0, bidValue - chargeValue))
      : isNoWorkOutcome(outcome)
        ? pdfMoney(chargeValue - bidValue, true)
        : "0.00";
    const fieldDate = activeForm.fieldDate || activeForm.workComplete || todayIsoDate();
    const firstAttempt = activeForm.firstAttempt || fieldDate;
    const secondAttempt = activeForm.secondAttempt || fieldDate;
    const invoiceDate = useWorkTemplate ? activeForm.workComplete || fieldDate : secondAttempt;
    const signer = activeForm.signer || "JOTJAGRAJ SINGH";
    const swornSigner = oathSigner(signer);

    if (refusedAccessNeedsDescription(outcome, activeForm)) {
      setPdfStatus(`Refused access needs section 7b description of the person. Enter what you observed, for example: ${REFUSED_ACCESS_DESCRIPTION_EXAMPLE}.`);
      return null;
    }

    setPdfStatus(downloadPdf ? "Preparing affidavit PDF..." : "Preparing invoice/affidavit for package...");

    try {
      const response = await fetch(templateUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Template returned HTTP ${response.status}`);

      const pdfDoc = await PDFDocument.load(await response.arrayBuffer());
      const pdfForm = pdfDoc.getForm();

      const setText = (name: string, value: string, fontSize = name === "Work Description" ? 8 : 10) => {
        try {
          const field = pdfForm.getTextField(name);
          field.enableMultiline();
          field.setFontSize(fontSize);
          field.setText(value || "");
        } catch {}
      };

      const check = (name: string) => {
        try {
          pdfForm.getCheckBox(name).check();
        } catch {}
      };

      const clearMaterialRows = () => {
        for (let index = 1; index <= 12; index += 1) {
          setText(`M${index}`, "");
          setText(`Q${index}`, "");
        }
      };

      clearMaterialRows();
      const materials = outcome === "partial_work_completed" ? PARTIAL_MATERIALS : useWorkTemplate ? WORK_MATERIALS : ["TRASH BAG"];
      materials.forEach((material, index) => setText(`M${index + 1}`, material));
      setText("OMO", jobId);
      setText("TAX ID", "203444624");
      setText("INVOICE #", activeForm.invoiceNo);
      setText("TRADE", "GENERAL CONSTRUCTION");
      setText("Boro", upper(borough), 9);
      setText("Borough", upper(borough), 9);
      setText("Apt #", upper(activeForm.location));
      setText("Building Address", upper(activeForm.address), activeForm.address.length > 42 ? 8 : 10);
      setText("BID AMOUNT", bidAmount);
      setText("INCREASE DECREASE AMOUNT", changeAmount);
      setText("TOTAL CHARGE", chargeAmount);
      setText("NAME Please Print", signer.toUpperCase());
      setText("TITLE", "VP");
      check("RC MINI NO");
      check("APPROVED INCREASE DECREASE NO");
      check("PERMIT REQUIRED NO");

      if (useWorkTemplate) {
        const workDate = activeForm.workComplete || fieldDate;
        setText("COUNTY OF", AFFIDAVIT_NOTARY_COUNTY, 9);
        setText("being duly sworn deposes and says", `I,  ${swornSigner}/ United Angel Construction Corp`);
        setText("Apt#", upper(activeForm.location));
        setText("State", "NY");
        setText("PARTIAL WORK DESC", "");
        setText("AMOUNT", "");
        setText("PARTIAL REFUSED AMOUNT", outcome === "partial_work_completed" ? chargeAmount : "");
        setText("relationship to building", "");
        setText("Description of individual", "");
        setText("eg malefemale", "");
        setText("MONTH", monthName(workDate));
        setText("DAY", dayOfMonth(workDate));
        setText("Type or Print Name", signer.toUpperCase());
        setText("START DATE", outcome === "work_completed" ? activeForm.workStart || activeForm.fieldDate : "");
        setText("COMPLETE DATE", outcome === "work_completed" ? activeForm.workComplete || activeForm.fieldDate : "");
        setText("Work Description", activeForm.description || activeForm.notes || "Work completed per HPD bid / work order.");
      } else {
        const noWorkReason = activeForm.affidavitReason || affidavitReasonForOutcome(outcome);
        const isRefusedAccess = outcome === "refused_access";
        const deniedName = isRefusedAccess ? cleanRefusedName(activeForm.deniedName) : "";
        const deniedRelationship = isRefusedAccess ? activeForm.deniedRelationship || "SUPER" : "";
        const deniedDescription = isRefusedAccess ? activeForm.deniedDescription : "";
        const deniedPhone = isRefusedAccess ? activeForm.deniedPhone : "";

        setText("inaccessibility was due to 1", outcome === "no_access" ? "NO ACCESS TO MAKE REPAIRS" : "");
        setText("inaccessibility was due to 2", "");
        setText("COUNTY OF", AFFIDAVIT_NOTARY_COUNTY, 9);
        setText("AMOUNT", chargeAmount);
        setText("ARRIVE DATE", "");
        setText("REFUSE DATE", "");
        setText("DENIED DATE", isRefusedAccess ? secondAttempt : "");
        // Section 7 refused access: 7a name/relationship, 7b description, 7c telephone.
        setText("DENIED TEL", deniedPhone);
        setText("DENIED NAME", upper(deniedName));
        setText("Description of individual DENIED", upper(deniedDescription));
        setText("BUILDING RELATIONSHIP", upper(deniedRelationship));
        setText("Sworn to me this", dayOfMonth(secondAttempt));
        setText("day of", monthName(secondAttempt));
        setText("Type or Print Name", signer.toUpperCase());
        setText("State", "NY");
        setText("I swear statement", `I     ${swornSigner} / United Angel Construction Corp`);
        setText("START DATE", outcome === "no_access" ? firstAttempt : "");
        setText("COMPLETE DATE", outcome === "no_access" ? secondAttempt : "");
        setText("Work Description", activeForm.description || noWorkReason, 11);
      }

      pdfForm.updateFieldAppearances();
      pdfForm.flatten();

      const pdfPages = pdfDoc.getPages();
      const checkboxPage = pdfPages[2] || pdfPages[0];
      if (!useWorkTemplate && outcome === "completed_by_others" && pdfPages[0]) {
        pdfPages[0].drawText(secondAttempt, NO_WORK_COMPLETED_BY_OTHERS_LINE_5_DATE);
      }
      if (useWorkTemplate && outcome === "partial_work_completed" && checkboxPage) {
        pdfPages[0]?.drawText(activeForm.workStart || activeForm.fieldDate, { x: 126, y: 481, size: 10 });
        checkboxPage.drawText(invoiceDate, { x: 411, y: 635, size: 10 });
        checkboxPage.drawText(activeForm.workStart || activeForm.fieldDate, { x: 411, y: 618, size: 10 });
        checkboxPage.drawText(activeForm.workComplete || activeForm.fieldDate, { x: 423, y: 595, size: 10 });
      }
      if (!useWorkTemplate && outcome !== "no_access" && checkboxPage) {
        checkboxPage.drawText(secondAttempt, { x: 411, y: 635, size: 10 });
        checkboxPage.drawText(secondAttempt, { x: 411, y: 618, size: 10 });
        checkboxPage.drawText(secondAttempt, { x: 423, y: 595, size: 10 });
      }

      const bytes = await pdfDoc.save();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const pdfBytes = new Uint8Array(buffer);
      const dataUrl = bytesToDataUrl(pdfBytes, "application/pdf");
      const fileName = `${safeFilename(jobId)}-${useWorkTemplate ? "work-completed" : "no-work-completed"}-affidavit.pdf`;

      try {
        await saveFieldPacket({
          jobId,
          fileName,
          mimeType: "application/pdf",
          dataUrl,
          size: bytes.byteLength,
          evidenceCount: 0,
          imageCount: 0,
          videoCount: 0,
          packetType: "affidavit_invoice_pdf",
          note: "Invoice/affidavit PDF saved on this device and included when you generate the complete package.",
        });
      } catch (error) {
        console.error(error);
      }

      if (downloadPdf) {
        const blob = new Blob([buffer], { type: "application/pdf" });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(href);
      }

      if (markGenerated) {
        const archiveMessage = await markPackageGenerated(archiveJobId);
        setPdfStatus(`Invoice/affidavit PDF saved${downloadPdf ? " and downloaded" : ""}. ${archiveMessage}`);
      }

      return {
        jobId,
        fileName,
        bytes: pdfBytes,
        dataUrl,
        size: bytes.byteLength,
      };
    } catch (error) {
      console.error(error);
      setPdfStatus(error instanceof Error ? error.message : "Could not generate affidavit PDF.");
      return null;
    }
  }

  async function generateCompletePackage() {
    const jobId = form.jobId || selectedId;
    if (!jobId) {
      setPdfStatus("Select a job before generating the package.");
      return;
    }

    clearPackagePreview();
    setPdfStatus("Generating package: affidavit, invoice, images, and videos...");

    try {
      const evidenceRows = await listFieldEvidence(jobId);
      if (!evidenceRows.length) {
        setPdfStatus("No saved images or videos were found for this OMO on this device. Capture evidence first, then Generate Package.");
        return;
      }

      const includedMedia = evidenceRows.filter(mediaHasPackageBytes);
      const skippedMedia = evidenceRows.filter((media) => !mediaHasPackageBytes(media));
      const skippedVideos = skippedMedia.filter((media) => media.mediaType === "video");
      if (skippedVideos.length) {
        setPdfStatus(
          `${skippedVideos.length} saved video(s) had no original video bytes in browser storage, so I stopped the package instead of sending it without video. Retake or re-upload the video from the job card, then Generate Package again.`
        );
        return;
      }
      if (!includedMedia.length) {
        setPdfStatus("No package-ready image or video bytes were found for this OMO. Retake or upload evidence from the job card.");
        return;
      }

      const packageEventDate = fieldEventDateForPackage(selectedJob, outcome, includedMedia);
      const packageForm = formWithFieldEventDate(form, outcome, packageEventDate, selectedJob);
      setForm(packageForm);

      const pdf = await generateAffidavitPdf({ downloadPdf: false, markGenerated: false, formOverride: packageForm });
      if (!pdf) return;

      const imageMedia = includedMedia.filter((media) => media.mediaType === "image");
      const videoMedia = includedMedia.filter((media) => media.mediaType === "video");
      const completeFileName = completePackageFileName(packageForm, pdf.jobId);
      const applicationFileName = splitPackageFileName(packageForm, pdf.jobId, "application-package");
      const videoPackageFileName = splitPackageFileName(packageForm, pdf.jobId, "video-package");

      const completeEntries: ZipEntry[] = [
        {
          path: `invoice-affidavit-package/${safeAttachmentName(pdf.fileName, "invoice-affidavit.pdf")}`,
          bytes: pdf.bytes,
        },
        {
          path: "PACKAGE-MANIFEST.txt",
          bytes: zipTextBytes(packageManifestText(pdf.jobId, pdf, includedMedia, skippedMedia)),
        },
      ];

      includedMedia.forEach((media, index) => {
        completeEntries.push({
          path: fullPackageMediaPath(pdf.jobId, media, index),
          bytes: dataUrlToBytes(media.dataUrl),
        });
      });

      const applicationEntries: ZipEntry[] = [
        {
          path: `invoice-affidavit-package/${safeAttachmentName(pdf.fileName, "invoice-affidavit.pdf")}`,
          bytes: pdf.bytes,
        },
        {
          path: "PACKAGE-MANIFEST.txt",
          bytes: zipTextBytes(packageManifestText(pdf.jobId, pdf, imageMedia, skippedMedia.filter((media) => media.mediaType !== "video"))),
        },
      ];

      imageMedia.forEach((media, index) => {
        applicationEntries.push({
          path: fullPackageMediaPath(pdf.jobId, media, index),
          bytes: dataUrlToBytes(media.dataUrl),
        });
      });

      const videoEntries: ZipEntry[] = videoMedia.length
        ? [
            {
              path: "VIDEO-MANIFEST.txt",
              bytes: zipTextBytes(videoPackageManifestText(pdf.jobId, videoMedia)),
            },
            ...videoMedia.map((media, index) => ({
              path: fullPackageMediaPath(pdf.jobId, media, index),
              bytes: dataUrlToBytes(media.dataUrl),
            })),
          ]
        : [];

      const completeBytes = buildStoredZip(completeEntries);
      const applicationBytes = buildStoredZip(applicationEntries);
      const videoBytes = videoEntries.length ? buildStoredZip(videoEntries) : undefined;
      const completeUrl = bytesToObjectUrl(completeBytes, "application/zip");
      const applicationUrl = bytesToObjectUrl(applicationBytes, "application/zip");
      const videoPackageUrl = videoBytes ? bytesToObjectUrl(videoBytes, "application/zip") : "";
      const imageCount = imageMedia.length;
      const videoCount = videoMedia.length;
      const beforeCount = includedMedia.filter((media) => media.kind === "before").length;
      const afterCount = includedMedia.filter((media) => media.kind === "after").length;
      const pdfShareFile = bytesToFile(pdf.bytes, pdf.fileName, "application/pdf");
      const imageShareFiles = imageMedia.map((media, index) => {
        const fileName = safeAttachmentName(media.name, `${safeFilename(pdf.jobId)}-image-${index + 1}${mediaExtension(media)}`);
        return bytesToFile(dataUrlToBytes(media.dataUrl), fileName, media.type || "image/jpeg");
      });
      const applicationShareFiles = [pdfShareFile, ...imageShareFiles];
      const videoFiles = videoMedia.map((media, index) => {
        const fileName = safeAttachmentName(media.name, `${safeFilename(pdf.jobId)}-video-${index + 1}${mediaExtension(media)}`);
        return bytesToFile(dataUrlToBytes(media.dataUrl), fileName, media.type || "video/mp4");
      });
      const videoNames = videoFiles.map((file) => file.name);
      const videoLinks = videoFiles.map((file) => ({
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
      }));
      let applicationPacketId = "";
      let videoPacketId = "";
      let completeStored = false;
      let note = videoCount
        ? "Complete ZIP is ready with the affidavit/invoice, images, and videos."
        : "Complete ZIP is ready with the affidavit/invoice and images. No videos were found for this OMO.";

      if (applicationBytes.byteLength <= COMPLETE_PACKAGE_SAVE_LIMIT_BYTES) {
        try {
          await clearFieldPackets(pdf.jobId, ["full_evidence_zip", "application_package_zip", "video_package_zip"]);
          if (completeBytes.byteLength <= COMPLETE_PACKAGE_SAVE_LIMIT_BYTES) {
            const savedCompletePacket = await saveFieldPacket({
              jobId: pdf.jobId,
              fileName: completeFileName,
              mimeType: "application/zip",
              dataUrl: bytesToDataUrl(completeBytes, "application/zip"),
              size: completeBytes.byteLength,
              evidenceCount: includedMedia.length,
              imageCount,
              videoCount,
              packetType: "full_evidence_zip",
              note: "Complete ZIP package: invoice/affidavit PDF plus all saved images and videos.",
            });
            completeStored = Boolean(savedCompletePacket.id);
          }

          const savedApplicationPacket = await saveFieldPacket({
            jobId: pdf.jobId,
            fileName: applicationFileName,
            mimeType: "application/zip",
            dataUrl: bytesToDataUrl(applicationBytes, "application/zip"),
            size: applicationBytes.byteLength,
            evidenceCount: imageMedia.length,
            imageCount,
            videoCount: 0,
            packetType: "application_package_zip",
            note: "Application package: invoice/affidavit PDF plus all saved images.",
          });
          applicationPacketId = savedApplicationPacket.id;

          if (videoBytes && videoBytes.byteLength <= COMPLETE_PACKAGE_SAVE_LIMIT_BYTES) {
            const savedVideoPacket = await saveFieldPacket({
              jobId: pdf.jobId,
              fileName: videoPackageFileName,
              mimeType: "application/zip",
              dataUrl: bytesToDataUrl(videoBytes, "application/zip"),
              size: videoBytes.byteLength,
              evidenceCount: videoMedia.length,
              imageCount: 0,
              videoCount,
              packetType: "video_package_zip",
              note: "Video package: all saved videos only.",
            });
            videoPacketId = savedVideoPacket.id;
          }

          if (completeStored) {
            note = videoCount
              ? "Complete ZIP saved on this phone with application and video ZIP backups."
              : "Complete ZIP saved on this phone. No videos were found.";
          } else {
            note = `Complete ZIP is ${packetSizeLabel(completeBytes.byteLength)}, so it is ready for Send but not duplicated in phone storage.`;
          }
        } catch (error) {
          console.error(error);
          note = "Packages are ready for review. Browser storage could not save every ZIP, but the send buttons can still share them now.";
        }
      } else {
        note = `Application package is ${packetSizeLabel(applicationBytes.byteLength)}, so it is held only for sending instead of duplicating it in phone storage.`;
      }

      const preview: CompletePackagePreview = {
        jobId: pdf.jobId,
        completeFileName,
        completeSize: completeBytes.byteLength,
        completeUrl,
        applicationFileName,
        applicationSize: applicationBytes.byteLength,
        applicationUrl,
        applicationMediaCount: imageMedia.length,
        imageCount,
        videoCount,
        beforeCount,
        afterCount,
        pdfFileName: pdf.fileName,
        videoPackageFileName: videoBytes ? videoPackageFileName : "",
        videoPackageSize: videoBytes?.byteLength || 0,
        videoPackageUrl,
        videoNames,
        videoLinks,
        skippedMediaCount: skippedMedia.length,
        applicationPacketId: applicationPacketId || undefined,
        videoPacketId: videoPacketId || undefined,
        note,
      };

      pendingCompletePackageRef.current = { ...preview, completeBytes, applicationBytes, videoBytes, applicationShareFiles, videoShareFiles: videoFiles };
      setPackagePreview(preview);
      setPackagePreviewOpen(false);
      const archiveMessage = await markPackageGenerated(pdf.jobId);
      setPdfStatus(`Package Created. Tap Preview, then Send. ${archiveMessage}`);
    } catch (error) {
      console.error(error);
      setPdfStatus(error instanceof Error ? error.message : "Could not generate complete package.");
    }
  }

  function canSharePackageFiles(files: File[]) {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    if (!navigator.canShare) return true;
    try {
      return navigator.canShare({ files });
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function showPackageShareFallback(message: string) {
    const pending = pendingCompletePackageRef.current;
    setPackagePreviewOpen(true);
    setPdfStatus(
      `${message} Preview is open with Complete ZIP send/save buttons.`
    );
  }

  async function sharePackageFiles(files: File[], title: string, text: string, successMessage: string) {
    const canShareFiles = canSharePackageFiles(files);

    if (!canShareFiles) {
      const canShareSeparately = files.length > 1 && files.some((file) => canSharePackageFiles([file]));
      showPackageShareFallback(
        canShareSeparately
          ? "Android cannot send all attachments in one share sheet. Send Application Files and Video Files one at a time from Preview."
          : "Android blocked direct sending."
      );
      return;
    }

    try {
      await navigator.share({ title, text, files });
      setPdfStatus(successMessage);
    } catch (error) {
      console.error(error);
      showPackageShareFallback("Send was cancelled or blocked.");
    }
  }

  async function shareZipBytes(bytes: Uint8Array, fileName: string, title: string, text: string, successMessage: string) {
    const zipFile = bytesToFile(bytes, fileName, "application/zip");
    const genericZipFile = bytesToFile(bytes, fileName, "application/octet-stream");
    const fileToShare = canSharePackageFiles([zipFile])
      ? zipFile
      : canSharePackageFiles([genericZipFile])
        ? genericZipFile
        : null;

    if (!fileToShare) {
      showPackageShareFallback("Android blocked ZIP sharing.");
      return;
    }

    try {
      await navigator.share({ title, text, files: [fileToShare] });
      setPdfStatus(successMessage);
    } catch (error) {
      console.error(error);
      showPackageShareFallback("ZIP send was cancelled or blocked.");
    }
  }

  async function shareAndroidEvidenceFiles(
    files: File[],
    title: string,
    text: string,
    successMessage: string,
    emptyMessage: string
  ) {
    if (!files.length) {
      setPdfStatus(emptyMessage);
      return;
    }

    await sharePackageFiles(files, title, text, successMessage);
  }

  async function sendCompletePackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }

    await shareZipBytes(
      pending.completeBytes,
      pending.completeFileName,
      `${pending.jobId} HPD complete ZIP`,
      `HPD complete ZIP for ${pending.jobId}: affidavit/invoice PDF, images, and ${pending.videoCount} video(s).`,
      `Complete ZIP sent from share sheet: ${pending.completeFileName}`
    );
  }

  async function sendApplicationPackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }

    await shareZipBytes(
      pending.applicationBytes,
      pending.applicationFileName,
      `${pending.jobId} HPD application package`,
      `HPD application package for ${pending.jobId}: affidavit/invoice plus images.`,
      `Application package sent: ${pending.applicationFileName}`
    );
  }

  async function sendVideoPackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }
    if (!pending.videoBytes) {
      setPdfStatus("No video package was generated for this OMO.");
      return;
    }

    await shareZipBytes(
      pending.videoBytes,
      pending.videoPackageFileName,
      `${pending.jobId} HPD video package`,
      `HPD video package for ${pending.jobId}: ${pending.videoCount} video(s).`,
      `Video package sent: ${pending.videoPackageFileName}`
    );
  }

  async function sendEvidenceFilesBackup() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }

    await shareAndroidEvidenceFiles(
      [...pending.applicationShareFiles, ...pending.videoShareFiles],
      `${pending.jobId} HPD evidence files`,
      `Backup evidence files for ${pending.jobId}: affidavit/invoice PDF, images, and ${pending.videoCount} video(s).`,
      `Backup files opened in share sheet: PDF, ${pending.imageCount} image(s), and ${pending.videoCount} video(s).`,
      "No application or video files were generated. Generate Package again."
    );
  }

  const packageTone = outcome === "work_completed" || outcome === "partial_work_completed" ? "work" : outcome === "pending" ? "pending" : "no-work";

  return (
    <main className="hpd-paperwork-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          background: #07111f;
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

        .hpd-paperwork-shell {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
          background:
            linear-gradient(180deg, rgba(7, 17, 31, 0.98), rgba(5, 9, 20, 1)),
            #07111f;
        }

        .paperwork-wrap {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(300px, 0.88fr) minmax(0, 1.12fr);
          gap: 14px;
        }

        .paperwork-top {
          grid-column: 1 / -1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .paperwork-top h1 {
          margin: 8px 0 4px;
          font-size: clamp(34px, 8vw, 58px);
          line-height: 1;
          letter-spacing: 0;
        }

        .paperwork-top p,
        .paperwork-card p,
        .paperwork-field span,
        .preview-muted {
          color: #aebbd0;
        }

        .paperwork-nav {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .paperwork-nav a,
        .paperwork-print,
        .paperwork-secondary {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 10px 12px;
          color: #f8fbff;
          font-weight: 850;
          cursor: pointer;
        }

        .paperwork-print {
          background: #53e69c;
          color: #03120b;
          border-color: transparent;
        }

        .paperwork-package-review {
          display: grid;
          gap: 14px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(8, 13, 24, 0.98)),
            #0f172a;
          border-radius: 8px;
          padding: 14px;
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
        }

        .paperwork-package-review h3,
        .paperwork-package-review p {
          margin: 0;
        }

        .paperwork-package-review p {
          color: #cfe7da;
          line-height: 1.35;
        }

        .package-created-head {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 12px;
        }

        .package-created-head span {
          flex: 0 0 auto;
          border-radius: 999px;
          background: #e0f2fe;
          color: #03120b;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 950;
        }

        .package-created-head .package-kicker {
          display: inline-flex;
          width: fit-content;
          margin-bottom: 5px;
          border-radius: 999px;
          background: rgba(83, 230, 156, 0.15);
          color: #8ff0bf;
          padding: 5px 8px;
          text-transform: uppercase;
          letter-spacing: 0;
        }

        .package-created-head h3 {
          font-size: 24px;
          line-height: 1.05;
        }

        .package-review-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .package-review-grid span {
          display: grid;
          gap: 4px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px;
          color: #aebbd0;
          font-size: 11px;
          font-weight: 850;
        }

        .package-review-grid strong {
          color: #ffffff;
          font-size: 18px;
        }

        .package-review-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .package-delivery-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          border: 1px solid rgba(83, 230, 156, 0.22);
          background: rgba(83, 230, 156, 0.08);
          border-radius: 8px;
          padding: 10px;
        }

        .package-delivery-actions button,
        .package-delivery-actions a {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid rgba(83, 230, 156, 0.38);
          background: rgba(15, 23, 42, 0.78);
          color: #dfffea;
          padding: 0 10px;
          text-align: center;
          text-decoration: none;
          font-size: 12px;
          font-weight: 950;
          line-height: 1.2;
          cursor: pointer;
        }

        .package-delivery-actions button:first-child {
          background: #53e69c;
          color: #03120b;
          border-color: transparent;
        }

        .package-delivery-actions .package-backup-send {
          background: rgba(224, 242, 254, 0.08);
          color: #bfdbfe;
          border-color: rgba(147, 197, 253, 0.32);
        }

        .package-preview-panel {
          display: grid;
          gap: 12px;
        }

        .package-content-list {
          display: grid;
          gap: 8px;
        }

        .package-content-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.055);
          border-radius: 8px;
          padding: 11px;
        }

        .package-content-row.primary-package-row {
          border-color: rgba(83, 230, 156, 0.42);
          background: rgba(83, 230, 156, 0.10);
        }

        .package-content-row span {
          display: block;
          margin-bottom: 4px;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .package-content-row strong {
          display: block;
          color: #ffffff;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .package-content-row small {
          display: block;
          margin-top: 4px;
          color: #aebbd0;
          line-height: 1.35;
        }

        .package-content-row b {
          color: #dfffea;
          font-size: 13px;
          white-space: nowrap;
        }

        .package-review-split {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .package-review-card {
          display: grid;
          gap: 9px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(3, 18, 11, 0.18);
          border-radius: 8px;
          padding: 10px;
        }

        .package-review-card h4,
        .package-review-card p {
          margin: 0;
        }

        .package-review-card h4 {
          color: #ffffff;
          font-size: 14px;
        }

        .package-review-card p {
          color: #cfe7da;
          font-size: 12px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .package-review-files {
          display: grid;
          gap: 6px;
        }

        .package-review-files strong,
        .package-review-files span,
        .package-review-files a {
          overflow-wrap: anywhere;
        }

        .package-review-files span,
        .package-review-files a {
          color: #dfffea;
          font-size: 12px;
          line-height: 1.3;
        }

        .package-review-files a {
          display: inline-flex;
          width: fit-content;
          border-radius: 7px;
          border: 1px solid rgba(83, 230, 156, 0.35);
          padding: 6px 8px;
          text-decoration: none;
          font-weight: 900;
        }

        .package-video-preview {
          display: grid;
          gap: 11px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(3, 18, 11, 0.12);
          border-radius: 8px;
          padding: 11px;
        }

        .package-video-preview h4,
        .package-video-preview p {
          margin: 0;
        }

        .package-video-preview h4 {
          color: #ffffff;
          font-size: 14px;
        }

        .package-video-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
        }

        .package-video-head p {
          color: #aebbd0;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .package-video-head span {
          flex: 0 0 auto;
          color: #dfffea;
          font-size: 12px;
          font-weight: 950;
        }

        .package-video-list {
          display: grid;
          gap: 10px;
        }

        .package-video-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(160px, 0.85fr);
          gap: 10px;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          padding: 9px;
        }

        .package-video-item video {
          width: 100%;
          max-height: 240px;
          border-radius: 8px;
          background: #000000;
        }

        .package-video-meta {
          display: grid;
          gap: 5px;
          min-width: 0;
        }

        .package-video-meta strong {
          color: #ffffff;
        }

        .package-video-meta span,
        .package-video-meta small,
        .package-video-empty {
          color: #dfffea;
          overflow-wrap: anywhere;
          line-height: 1.35;
        }

        .package-video-meta a {
          display: inline-flex;
          width: fit-content;
          border-radius: 7px;
          border: 1px solid rgba(83, 230, 156, 0.45);
          color: #dfffea;
          padding: 7px 9px;
          text-decoration: none;
          font-weight: 950;
        }

        .package-review-actions button {
          min-height: 48px;
          border: 0;
          border-radius: 8px;
          background: #e0f2fe;
          color: #07111f;
          font-weight: 950;
          cursor: pointer;
        }

        .package-review-actions button:last-child {
          background: #53e69c;
          color: #03120b;
        }

        .paperwork-card,
        .paperwork-preview {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(16, 28, 48, 0.94);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24);
        }

        .paperwork-card {
          display: grid;
          gap: 12px;
          align-content: start;
        }

        .paperwork-field {
          display: grid;
          gap: 7px;
          font-weight: 800;
          font-size: 13px;
        }

        .paperwork-field input,
        .paperwork-field select,
        .paperwork-field textarea {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 8px;
          padding: 12px;
          font-size: 16px;
          outline: none;
        }

        .paperwork-field textarea {
          min-height: 96px;
          resize: vertical;
        }

        .paperwork-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .paperwork-package-badge {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 950;
          color: #07111f;
        }

        .paperwork-package-badge.work {
          background: #53e69c;
        }

        .paperwork-package-badge.no-work {
          background: #ffd166;
        }

        .paperwork-package-badge.pending {
          background: #cbd5e1;
        }

        .paperwork-package-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .package-choice {
          min-height: 86px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.075);
          color: #f8fbff;
          border-radius: 8px;
          padding: 13px;
          text-align: left;
          cursor: pointer;
        }

        .package-choice strong,
        .package-choice span {
          display: block;
        }

        .package-choice strong {
          font-size: 16px;
          line-height: 1.1;
        }

        .package-choice span {
          margin-top: 7px;
          color: #aebbd0;
          font-size: 12px;
          line-height: 1.35;
        }

        .package-choice.active {
          border-color: transparent;
          color: #03120b;
          background: #53e69c;
        }

        .package-choice.no-work.active {
          background: #ffd166;
          color: #151006;
        }

        .package-choice.active span {
          color: rgba(3, 18, 11, 0.74);
        }

        .paperwork-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .paperwork-summary-tile {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          padding: 10px;
          min-width: 0;
        }

        .paperwork-summary-tile span,
        .paperwork-summary-tile small {
          color: #aebbd0;
        }

        .paperwork-summary-tile span {
          display: block;
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .paperwork-summary-tile strong {
          display: block;
          margin-top: 5px;
          overflow-wrap: anywhere;
        }

        .paperwork-summary-tile small {
          display: block;
          margin-top: 4px;
          line-height: 1.3;
        }

        .paperwork-advanced {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          overflow: hidden;
        }

        .paperwork-advanced summary {
          cursor: pointer;
          padding: 12px;
          font-weight: 950;
          color: #d9e9ff;
        }

        .paperwork-advanced-body {
          display: grid;
          gap: 12px;
          padding: 0 12px 12px;
        }

        .paperwork-pdf-status {
          margin: 0;
          border: 1px solid rgba(83, 230, 156, 0.28);
          background: rgba(83, 230, 156, 0.1);
          color: #caffdf;
          border-radius: 8px;
          padding: 10px;
          font-weight: 850;
        }

        .paperwork-source-status {
          margin: 0;
          border: 1px solid rgba(255, 209, 102, 0.28);
          background: rgba(255, 209, 102, 0.1);
          color: #ffe8a3;
          border-radius: 8px;
          padding: 10px;
          font-weight: 850;
        }

        .refused-access-required {
          display: grid;
          gap: 12px;
          border: 1px solid rgba(255, 209, 102, 0.34);
          background:
            linear-gradient(135deg, rgba(255, 209, 102, 0.14), rgba(255, 255, 255, 0.055)),
            rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 13px;
        }

        .refused-access-required.ready {
          border-color: rgba(83, 230, 156, 0.34);
          background:
            linear-gradient(135deg, rgba(83, 230, 156, 0.14), rgba(255, 255, 255, 0.055)),
            rgba(255, 255, 255, 0.05);
        }

        .refused-access-required span,
        .refused-access-required small {
          display: block;
          color: #ffe8a3;
          line-height: 1.35;
        }

        .refused-access-required.ready span,
        .refused-access-required.ready small {
          color: #caffdf;
        }

        .refused-access-required span {
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .refused-access-required strong {
          display: block;
          margin-top: 4px;
          color: #ffffff;
          font-size: 16px;
          line-height: 1.15;
        }

        .refused-description-default {
          min-height: 46px;
          border: 0;
          border-radius: 10px;
          background: #ffd166;
          color: #151006;
          font-size: 13px;
          font-weight: 950;
          cursor: pointer;
        }

        .paperwork-sheet {
          background: #ffffff;
          color: #111827;
          border-radius: 8px;
          padding: 22px;
          display: grid;
          gap: 18px;
        }

        .preview-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid #d1d5db;
          padding-bottom: 14px;
        }

        .preview-head h2,
        .preview-section h3 {
          margin: 0;
          letter-spacing: 0;
        }

        .preview-head p,
        .preview-section p {
          margin: 4px 0 0;
        }

        .preview-section {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 14px;
        }

        .preview-table {
          display: grid;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .preview-row {
          display: grid;
          grid-template-columns: 1fr 170px;
        }

        .preview-row > div {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }

        .preview-row:last-child > div {
          border-bottom: 0;
        }

        .preview-row.header {
          background: #f3f4f6;
          font-weight: 950;
        }

        .preview-total {
          margin-left: auto;
          font-size: 24px;
          font-weight: 950;
        }

        @media (max-width: 880px) {
          .paperwork-wrap {
            grid-template-columns: 1fr;
          }

          .paperwork-top {
            display: grid;
          }

          .paperwork-nav {
            justify-content: stretch;
          }

          .paperwork-nav a,
          .paperwork-nav button {
            flex: 1 1 auto;
            text-align: center;
          }
        }

        @media (max-width: 560px) {
          .paperwork-grid,
          .paperwork-package-actions,
          .paperwork-summary-grid,
          .package-review-grid,
          .package-review-split,
          .package-review-actions,
          .package-delivery-actions,
          .package-content-row,
          .package-video-item,
          .preview-row,
          .preview-head {
            grid-template-columns: 1fr;
            display: grid;
          }

          .package-created-head,
          .package-video-head {
            display: grid;
          }
        }

        /* VISUAL_FLOW_V1_1_PACKAGE */
        .paperwork-print {
          min-height: 58px;
          font-size: 17px;
          border-radius: 12px;
          box-shadow: 0 16px 36px rgba(83, 230, 156, 0.20);
        }

        .paperwork-package-review {
          gap: 16px;
          border-color: rgba(83, 230, 156, 0.30);
          background:
            linear-gradient(180deg, rgba(16, 28, 48, 0.98), rgba(8, 13, 24, 0.98)),
            #101c30;
          padding: 18px;
        }

        .package-created-head {
          align-items: center;
          padding: 14px;
          border: 1px solid rgba(83, 230, 156, 0.22);
          border-radius: 12px;
          background: rgba(83, 230, 156, 0.08);
        }

        .package-created-head h3 {
          margin-top: 4px;
          font-size: clamp(28px, 8vw, 44px);
          line-height: 1;
        }

        .package-created-head > span:last-child {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          background: #53e69c;
          color: #03120b;
        }

        .package-main-actions {
          gap: 10px;
        }

        .package-main-actions button {
          min-height: 62px;
          border-radius: 12px;
          font-size: 16px;
        }

        .package-main-actions button:first-child {
          background: #e0f2fe;
          color: #07111f;
        }

        .package-main-actions button:last-child {
          background: linear-gradient(135deg, #53e69c, #7dd3fc);
          color: #03120b;
          box-shadow: 0 16px 34px rgba(83, 230, 156, 0.22);
        }

        .package-preview-panel {
          gap: 14px;
        }

        .package-content-row {
          border-radius: 12px;
          padding: 14px;
        }

        .package-content-row.primary-package-row {
          border-color: rgba(83, 230, 156, 0.56);
          background:
            linear-gradient(135deg, rgba(83, 230, 156, 0.18), rgba(125, 211, 252, 0.10)),
            rgba(255, 255, 255, 0.05);
        }

        .package-content-row.primary-package-row strong {
          font-size: 15px;
        }

        .package-primary-delivery {
          grid-template-columns: 1.35fr 0.85fr;
          padding: 12px;
          border-radius: 12px;
        }

        .package-primary-delivery button,
        .package-primary-delivery a {
          min-height: 58px;
          border-radius: 12px;
          font-size: 14px;
        }

        .package-backup-details {
          border: 1px solid rgba(148, 163, 184, 0.20);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.045);
          overflow: hidden;
        }

        .package-backup-details summary {
          cursor: pointer;
          padding: 12px 14px;
          color: #bfdbfe;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .package-secondary-delivery {
          margin: 0 12px 12px;
          border-color: rgba(147, 197, 253, 0.20);
          background: rgba(147, 197, 253, 0.06);
        }

        @media (max-width: 560px) {
          .paperwork-package-review {
            padding: 14px;
          }

          .package-main-actions,
          .package-primary-delivery,
          .package-secondary-delivery {
            grid-template-columns: 1fr;
          }

          .package-main-actions button,
          .package-primary-delivery button,
          .package-primary-delivery a {
            min-height: 58px;
          }
        }

        @media print {
          .paperwork-top,
          .paperwork-card {
            display: none !important;
          }

          .hpd-paperwork-shell {
            background: #ffffff !important;
            padding: 0 !important;
          }

          .paperwork-wrap {
            display: block !important;
            max-width: none !important;
          }

          .paperwork-preview {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .paperwork-sheet {
            border-radius: 0 !important;
          }
        }
      `}</style>

      <section className="paperwork-wrap">
        <header className="paperwork-top">
          <div>
            <p>Field paperwork</p>
            <h1>Invoice + Affidavit Package</h1>
            <p>Select the job, choose one package type, then generate the invoice package.</p>
          </div>
          <nav className="paperwork-nav" aria-label="Paperwork actions">
            <a href="/map">Map</a>
            <a href="/outputs">Archive</a>
          </nav>
        </header>

        <section className="paperwork-card">
          <span className={`paperwork-package-badge ${packageTone}`}>{affidavitTemplateLabel(outcome)}</span>
          {form.sourceStatus ? (
            <p className="paperwork-source-status">
              Saved status: <strong>{form.sourceStatus}</strong>
            </p>
          ) : null}
          {pdfStatus ? (
            <p className="paperwork-pdf-status" aria-live="polite">
              {pdfStatus}
            </p>
          ) : null}

          <label className="paperwork-field">
            Select Job
            <select value={selectedId} onChange={(event) => chooseJob(event.target.value)}>
              <option value="">Manual package</option>
              {jobs.slice(0, 700).map((job, index) => {
                const id = getJobId(job, `JOB-${index + 1}`);
                return (
                  <option value={id} key={`${id}-${index}`}>
                    {id} - {getJobAddress(job) || getJobBorough(job) || "No address"}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="paperwork-package-actions" aria-label="Package type">
            <button
              className={`package-choice ${outcome === "work_completed" || outcome === "partial_work_completed" ? "active" : ""}`}
              type="button"
              onClick={() => choosePackage("work")}
            >
              <strong>Work Completed</strong>
              <span>Uses ITB description and work-completed affidavit.</span>
            </button>
            <button
              className={`package-choice no-work ${isNoWorkOutcome(outcome) ? "active" : ""}`}
              type="button"
              onClick={() => choosePackage("no_work")}
            >
              <strong>No Work Completed</strong>
              <span>{noWorkSourceLine(outcome, form)}</span>
            </button>
          </div>

          <div className="paperwork-summary-grid">
            <div className="paperwork-summary-tile">
              <span>Job</span>
              <strong>{form.jobId || "Select job"}</strong>
              <small>{form.address || "Address from JSON"}</small>
            </div>
            <div className="paperwork-summary-tile">
              <span>Status</span>
              <strong>{form.affidavitReason}</strong>
              <small>{form.sourceStatus || "Choose package"}</small>
            </div>
            <div className="paperwork-summary-tile">
              <span>Charge</span>
              <strong>{form.amount || "$0.00"}</strong>
              <small>{isNoWorkOutcome(outcome) ? "Service charge from bid amount" : "Bid amount from ITB/COA"}</small>
            </div>
          </div>

          {outcome === "refused_access" ? (
            <div className={`refused-access-required ${refusedAccessNeedsDescription(outcome, form) ? "needs-description" : "ready"}`}>
              <div>
                <span>Section 7b Required</span>
                <strong>{refusedAccessNeedsDescription(outcome, form) ? "Describe the person who refused access" : "Person description recorded"}</strong>
                <small>Use the JSON value when it exists. If it is missing, enter exactly what you observed in the field.</small>
              </div>
              <label className="paperwork-field">
                Description of Individual
                <input
                  value={form.deniedDescription}
                  onChange={(event) => update("deniedDescription", event.target.value)}
                  placeholder={`Example: ${REFUSED_ACCESS_DESCRIPTION_EXAMPLE}`}
                />
                <button type="button" className="refused-description-default" onClick={() => update("deniedDescription", REFUSED_ACCESS_DESCRIPTION_EXAMPLE)}>
                  Use Male Tall Dark Hair
                </button>
              </label>
            </div>
          ) : null}

          <details className="paperwork-advanced">
            <summary>Review pulled JSON fields</summary>
            <div className="paperwork-advanced-body">
          <div className="paperwork-grid">
            <label className="paperwork-field">
              Invoice Number
              <input value={form.invoiceNo} onChange={(event) => update("invoiceNo", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Invoice Date
              <input value={form.invoiceDate} onChange={(event) => update("invoiceDate", event.target.value)} />
            </label>
          </div>

          <label className="paperwork-field">
            Job / OMO
            <input value={form.jobId} onChange={(event) => update("jobId", event.target.value)} />
          </label>

          <label className="paperwork-field">
            Address
            <input value={form.address} onChange={(event) => update("address", event.target.value)} />
          </label>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Location
              <input value={form.location} onChange={(event) => update("location", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Borough
              <input value={form.borough} onChange={(event) => update("borough", event.target.value)} />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Bid Amount
              <input value={form.bidAmount} onChange={(event) => update("bidAmount", event.target.value)} placeholder="$0.00" />
            </label>
            <label className="paperwork-field">
              Charge Amount
              <input value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="$0.00" />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Signer
              <input value={form.signer} onChange={(event) => update("signer", event.target.value)} placeholder="Printed name" />
            </label>
          </div>

          <label className="paperwork-field">
            Invoice Description
            <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Work Start
              <input value={form.workStart} onChange={(event) => update("workStart", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Work Complete / Field Date
              <input value={form.workComplete} onChange={(event) => update("workComplete", event.target.value)} />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              No Access 1st Attempt
              <input value={form.firstAttempt} onChange={(event) => update("firstAttempt", event.target.value)} />
            </label>
            <label className="paperwork-field">
              No Access 2nd / Refusal Date
              <input value={form.secondAttempt} onChange={(event) => update("secondAttempt", event.target.value)} />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Denied By Name
              <input value={form.deniedName} onChange={(event) => update("deniedName", event.target.value)} />
            </label>
            <label className="paperwork-field">
              Relationship
              <input value={form.deniedRelationship} onChange={(event) => update("deniedRelationship", event.target.value)} placeholder="SUPER" />
            </label>
          </div>

          <div className="paperwork-grid">
            <label className="paperwork-field">
              Individual Description
              <input value={form.deniedDescription} onChange={(event) => update("deniedDescription", event.target.value)} placeholder="MALE TALL DARK HAIR" />
            </label>
            <label className="paperwork-field">
              Telephone
              <input value={form.deniedPhone} onChange={(event) => update("deniedPhone", event.target.value)} />
            </label>
          </div>

          <label className="paperwork-field">
            Affidavit Reason
            <input value={form.affidavitReason} onChange={(event) => update("affidavitReason", event.target.value)} />
          </label>

          <label className="paperwork-field">
            Notes / Scope
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>
            </div>
          </details>

          {!packagePreview ? (
            <button className="paperwork-print" type="button" onClick={generateCompletePackage}>
              Generate Package
            </button>
          ) : null}
          {packagePreview ? (
            <div className="paperwork-package-review">
              <div className="package-created-head">
                <div>
                  <span className="package-kicker">Package ready</span>
                  <h3>{packagePreview.jobId}</h3>
                  <p>{packagePreview.note}</p>
                </div>
                <span>{packagePreview.imageCount} image(s) / {packagePreview.videoCount} video(s)</span>
              </div>
              <div className="package-review-actions package-review-actions-simple package-main-actions">
                <button type="button" onClick={() => setPackagePreviewOpen(true)} aria-expanded={packagePreviewOpen}>
                  Preview Package
                </button>
                <button type="button" onClick={sendCompletePackage}>Send ZIP</button>
              </div>
              {packagePreviewOpen ? (
                <div className="package-preview-panel">
                  <div className="package-content-list">
                    <div className="package-content-row primary-package-row">
                      <div>
                        <span>Complete ZIP</span>
                        <strong>{packagePreview.completeFileName}</strong>
                        <small>Affidavit/invoice PDF, all labeled images, all labeled videos, and manifest</small>
                      </div>
                      <b>{packetSizeLabel(packagePreview.completeSize)}</b>
                    </div>
                    <div className="package-content-row">
                      <div>
                        <span>Application ZIP</span>
                        <strong>{packagePreview.applicationFileName}</strong>
                        <small>Affidavit/invoice PDF plus all labeled images</small>
                      </div>
                      <b>{packetSizeLabel(packagePreview.applicationSize)}</b>
                    </div>
                    <div className="package-content-row">
                      <div>
                        <span>Invoice / Affidavit PDF</span>
                        <strong>{packagePreview.pdfFileName}</strong>
                        <small>Borough, address, OMO, dates, amount, and description</small>
                      </div>
                      <b>PDF</b>
                    </div>
                    <div className="package-content-row">
                      <div>
                        <span>Video ZIP</span>
                        <strong>{packagePreview.videoPackageFileName || "No video package"}</strong>
                        <small>{packagePreview.videoCount ? "Before/after labeled video evidence" : "No videos found on this phone for this OMO"}</small>
                      </div>
                      <b>{packagePreview.videoPackageSize ? packetSizeLabel(packagePreview.videoPackageSize) : "0 KB"}</b>
                    </div>
                  </div>
                  <div className="package-delivery-actions package-primary-delivery">
                    <button type="button" onClick={sendCompletePackage}>
                      Send Complete ZIP
                    </button>
                    <a href={packagePreview.completeUrl} download={packagePreview.completeFileName}>
                      Save Complete ZIP
                    </a>
                  </div>
                  <details className="package-backup-details">
                    <summary>Backup / separate files</summary>
                    <div className="package-delivery-actions package-secondary-delivery">
                      <button type="button" onClick={sendApplicationPackage}>
                        Send Application ZIP
                      </button>
                      {packagePreview.videoPackageUrl ? (
                        <button type="button" onClick={sendVideoPackage}>
                          Send Video ZIP
                        </button>
                      ) : null}
                      <a href={packagePreview.applicationUrl} download={packagePreview.applicationFileName}>
                        Save Application ZIP
                      </a>
                      {packagePreview.videoPackageUrl ? (
                        <a href={packagePreview.videoPackageUrl} download={packagePreview.videoPackageFileName}>
                          Save Video ZIP
                        </a>
                      ) : null}
                      <button type="button" className="package-backup-send" onClick={sendEvidenceFilesBackup}>
                        Backup: Send Files
                      </button>
                    </div>
                  </details>
                  <div className="package-review-grid">
                    <span>PDF <strong>1</strong></span>
                    <span>Images <strong>{packagePreview.imageCount}</strong></span>
                    <span>Before <strong>{packagePreview.beforeCount}</strong></span>
                    <span>After <strong>{packagePreview.afterCount}</strong></span>
                    <span>Videos <strong>{packagePreview.videoCount}</strong></span>
                  </div>
                  <div className="package-video-preview">
                    <div className="package-video-head">
                      <div>
                        <h4>Video Preview</h4>
                        <p>{packagePreview.videoPackageFileName || "No video package generated for this OMO."}</p>
                      </div>
                      <span>{packetSizeLabel(packagePreview.videoPackageSize)}</span>
                    </div>
                    <div className="package-video-list">
                      {packagePreview.videoLinks.length ? (
                        packagePreview.videoLinks.map((video, index) => (
                          <div className="package-video-item" key={`${video.name}-${index}`}>
                            <video src={video.url} controls preload="metadata" playsInline />
                            <div className="package-video-meta">
                              <strong>Video {index + 1}</strong>
                              <span>{video.name}</span>
                              <small>{packetSizeLabel(video.size)}</small>
                              <a href={video.url} download={video.name} target="_blank" rel="noopener noreferrer">
                                Open / Save Video
                              </a>
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="package-video-empty">
                          No videos found for this OMO on this phone. Retake or upload the video from the job card, then Generate Package again.
                        </span>
                      )}
                    </div>
                    {packagePreview.skippedMediaCount ? (
                      <p>{packagePreview.skippedMediaCount} media item(s) were listed in the manifest as not included.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="paperwork-preview">
          <div className="paperwork-sheet">
            <div className="preview-head">
              <div>
                <h2>FIELD DOCUMENT PACKAGE</h2>
                <p className="preview-muted">{form.contractor}</p>
              </div>
              <div>
                <strong>{form.invoiceNo}</strong>
                <p className="preview-muted">{form.invoiceDate}</p>
              </div>
            </div>

            <section className="preview-section">
              <h3>{form.affidavitType}</h3>
              <p>
                <strong>OMO:</strong> {form.jobId || "Not entered"}
              </p>
              <p>
                <strong>Address:</strong> {[form.address, form.location, form.borough].filter(Boolean).join(" - ") || "Not entered"}
              </p>
              <p>
                <strong>{outcome === "work_completed" || outcome === "partial_work_completed" ? "Work status" : "No work reason"}:</strong> {form.affidavitReason}
              </p>
              {outcome === "work_completed" || outcome === "partial_work_completed" ? (
                <p>
                  <strong>Work dates:</strong> {form.workStart || "Start not entered"} to {form.workComplete || "Complete not entered"}
                </p>
              ) : (
                <p>
                  <strong>Access dates:</strong> 1st {form.firstAttempt || "not entered"} / 2nd or refusal {form.secondAttempt || "not entered"}
                </p>
              )}
              <p>
                <strong>Signer:</strong> {form.signer || "Not entered"}
              </p>
            </section>

            <section className="preview-section">
              <h3>Invoice</h3>
              <p>
                <strong>Bill To:</strong> {form.customer}
              </p>
              <div className="preview-table">
                <div className="preview-row header">
                  <div>Description</div>
                  <div>Amount</div>
                </div>
                <div className="preview-row">
                  <div>{form.description}</div>
                  <div>
                    <strong>{form.amount || "$0.00"}</strong>
                  </div>
                </div>
              </div>
              <div className="preview-total">Total: {form.amount || "$0.00"}</div>
            </section>

            <section className="preview-section">
              <h3>Notes</h3>
              <p>{form.notes || "No notes entered."}</p>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
