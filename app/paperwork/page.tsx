"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { bytesToDataUrl, saveFieldPacket } from "../../lib/field-packet-store";
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
const DEFAULT_PACKAGE_SIGNER = "JOTJAGRAJ SINGH";
const AFFIDAVIT_NOTARY_COUNTY = "QUEENS";
const REFUSED_ACCESS_DESCRIPTION_EXAMPLE = "MALE, TALL, DARK HAIR";
const NO_WORK_COMPLETED_BY_OTHERS_LINE_5_DATE = { x: 272, y: 245, size: 10 } as const;
const INVOICE_APT_LOCATION_WIDGET = { x: 131.695, y: 550.582, shiftY: 5 } as const;
const NO_ACCESS_AFFIDAVIT_DATE_WIDGETS = [
  { field: "START DATE", x: 466.421, y: 299.317, shiftY: 4 },
  { field: "START DATE", x: 483.644, y: 284.65, shiftY: 4 },
  { field: "COMPLETE DATE", x: 144.282, y: 285.36, shiftY: 4 },
  { field: "COMPLETE DATE", x: 143.989, y: 271.614, shiftY: 4 },
] as const;

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

type PackageFileEntry = {
  path: string;
  bytes: Uint8Array;
  mimeType: string;
  label: string;
  section: "pdf" | "manifest" | "image" | "video";
};

type PackageDownloadLink = {
  path: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  label: string;
  section: PackageFileEntry["section"];
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
  folderName: string;
  folderSize: number;
  folderFileCount: number;
  folderLinks: PackageDownloadLink[];
  zipFileName: string;
  zipSize: number;
  zipUrl: string;
  completeFileName: string;
  completeSize: number;
  applicationFileName: string;
  applicationSize: number;
  applicationMediaCount: number;
  imageCount: number;
  videoCount: number;
  beforeCount: number;
  afterCount: number;
  pdfFileName: string;
  pdfSize: number;
  pdfUrl: string;
  pdfPreviewImageUrl: string;
  pdfPreviewPageCount: number;
  pdfPreviewError: string;
  videoPackageFileName: string;
  videoPackageSize: number;
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
  folderEntries: PackageFileEntry[];
  applicationEntries: PackageFileEntry[];
  videoEntries: PackageFileEntry[];
  zipBytes: Uint8Array;
  completeShareFiles: File[];
  applicationShareFiles: File[];
  videoShareFiles: File[];
};

type GeneratePdfOptions = {
  downloadPdf?: boolean;
  markGenerated?: boolean;
  formOverride?: PackageForm;
  outcomeOverride?: PaperworkOutcome;
  includeSignature?: boolean;
};

function shiftInvoiceAptLocationWidget(pdfForm: any) {
  try {
    const field = pdfForm.getTextField("Apt #");
    const widgets = field?.acroField?.getWidgets?.() || [];

    widgets.forEach((widget: any) => {
      const rect = widget?.getRectangle?.();
      if (!rect) return;

      const isInvoiceAptLocation =
        Math.abs(rect.x - INVOICE_APT_LOCATION_WIDGET.x) < 2 &&
        Math.abs(rect.y - INVOICE_APT_LOCATION_WIDGET.y) < 3;
      if (!isInvoiceAptLocation) return;

      widget.setRectangle({
        x: rect.x,
        y: rect.y + INVOICE_APT_LOCATION_WIDGET.shiftY,
        width: rect.width,
        height: rect.height,
      });
    });
  } catch {}
}

function shiftNoAccessAffidavitDateWidgets(pdfForm: any) {
  NO_ACCESS_AFFIDAVIT_DATE_WIDGETS.forEach((target) => {
    try {
      const field = pdfForm.getTextField(target.field);
      const widgets = field?.acroField?.getWidgets?.() || [];

      widgets.forEach((widget: any) => {
        const rect = widget?.getRectangle?.();
        if (!rect) return;

        const isTargetWidget =
          Math.abs(rect.x - target.x) < 2 &&
          Math.abs(rect.y - target.y) < 3;
        if (!isTargetWidget) return;

        widget.setRectangle({
          x: rect.x,
          y: rect.y + target.shiftY,
          width: rect.width,
          height: rect.height,
        });
      });
    } catch {}
  });
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
    signer: DEFAULT_PACKAGE_SIGNER,
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
  ]) || (outcome === "refused_access" ? REFUSED_ACCESS_DESCRIPTION_EXAMPLE : "");
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

function isFallbackPackageDescription(value: string) {
  const raw = String(value || "").trim();
  return !raw || raw === "Work completed per HPD bid / work order." || raw === "Select a job and field outcome to prepare paperwork.";
}

function formWithLoadedJobData(current: PackageForm, job: JobRecord, outcome: PaperworkOutcome) {
  const pulled = formFromJob(job, outcome);
  const sameJob = current.jobId === pulled.jobId;
  if (!sameJob) return pulled;

  return {
    ...current,
    jobId: pulled.jobId,
    address: current.address || pulled.address,
    location: current.location || pulled.location,
    borough: current.borough || pulled.borough,
    amount: current.amount || pulled.amount,
    bidAmount: current.bidAmount || pulled.bidAmount,
    fieldDate: current.fieldDate || pulled.fieldDate,
    firstAttempt: current.firstAttempt || pulled.firstAttempt,
    secondAttempt: current.secondAttempt || pulled.secondAttempt,
    workStart: current.workStart || pulled.workStart,
    workComplete: current.workComplete || pulled.workComplete,
    sourceStatus: current.sourceStatus || pulled.sourceStatus,
    description: isFallbackPackageDescription(current.description) ? pulled.description : current.description,
    notes: current.notes || pulled.notes,
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

function pdfLocationFontSize(value: string) {
  const length = upper(value).replace(/\s+/g, " ").trim().length;
  if (length > 26) return 6.2;
  if (length > 20) return 6.8;
  if (length > 14) return 7.4;
  return 9;
}

function oathSigner(value: string) {
  const raw = String(value || DEFAULT_PACKAGE_SIGNER).trim();
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

function packageStatusSlug(outcome: PaperworkOutcome) {
  if (outcome === "work_completed") return "work-completed";
  if (outcome === "partial_work_completed") return "partial-work-completed";
  if (outcome === "no_access") return "no-access";
  if (outcome === "refused_access") return "refused-access";
  if (outcome === "completed_by_others") return "work-completed-by-others";
  return "pending";
}

function packageStatusLabel(outcome: PaperworkOutcome) {
  if (outcome === "work_completed") return "Work Completed";
  if (outcome === "partial_work_completed") return "Partial Work Completed";
  if (outcome === "no_access") return "No Access";
  if (outcome === "refused_access") return "Refused Access";
  if (outcome === "completed_by_others") return "Work Completed By Others";
  return "Pending";
}

function fullPackageMediaPath(jobId: string, media: FieldMedia, index: number, statusSlug = "field-status") {
  const mediaFolder = media.mediaType === "video" ? "videos" : "images";
  const folder = fieldEvidenceKindClass(media.kind || "general");
  const label = zipSafePart(media.evidenceLabel || "Field Evidence", "evidence");
  const fallbackName = `${safeFilename(jobId)}-${statusSlug}-${String(index + 1).padStart(2, "0")}-${folder}${mediaExtension(media)}`;
  const fileName = safeAttachmentName(media.name, fallbackName);
  return `${mediaFolder}/${folder}/${String(index + 1).padStart(2, "0")}-${statusSlug}-${label}-${fileName}`;
}

function packageFolderName(form: PackageForm, jobId: string, outcome: PaperworkOutcome) {
  const location = safeFilename(form.location || form.address || form.borough || "LOCATION");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${safeFilename(jobId)}_${packageStatusSlug(outcome)}_${location}_package_${stamp}`;
}

function packageZipFileName(form: PackageForm, jobId: string, outcome: PaperworkOutcome) {
  return `${packageFolderName(form, jobId, outcome)}.zip`;
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

function bytesToFile(bytes: Uint8Array, fileName: string, mimeType = "application/octet-stream") {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buffer], fileName, { type: mimeType });
}

function bytesToObjectUrl(bytes: Uint8Array, mimeType = "application/octet-stream") {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

function packageFlatFileName(path: string) {
  return path
    .split("/")
    .map((part) => zipSafePart(part, "file"))
    .filter(Boolean)
    .join("__");
}

function packageEntriesSize(entries: PackageFileEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
}

function packageEntryToDownloadLink(entry: PackageFileEntry, folderName: string): PackageDownloadLink {
  return {
    path: entry.path,
    name: packageFlatFileName(`${folderName}/${entry.path}`),
    url: bytesToObjectUrl(entry.bytes, entry.mimeType),
    size: entry.bytes.byteLength,
    mimeType: entry.mimeType,
    label: entry.label,
    section: entry.section,
  };
}

function packageEntryToFile(entry: PackageFileEntry, folderName: string) {
  return bytesToFile(entry.bytes, packageFlatFileName(`${folderName}/${entry.path}`), entry.mimeType);
}

function canSaveRegularFolder() {
  return typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";
}

async function writePackageEntryToDirectory(rootHandle: any, entry: PackageFileEntry) {
  const parts = entry.path.split("/").filter(Boolean).map((part) => zipSafePart(part, "file"));
  if (!parts.length) return;

  let directory = rootHandle;
  for (const folder of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(folder, { create: true });
  }

  const fileHandle = await directory.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  const buffer = entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength) as ArrayBuffer;
  await writable.write(new Blob([buffer], { type: entry.mimeType }));
  await writable.close();
}

async function saveEntriesAsRegularFolder(folderName: string, entries: PackageFileEntry[]) {
  if (!canSaveRegularFolder()) {
    throw new Error("This browser cannot save a real folder. Use Download Files or Share Files.");
  }

  const rootHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
  const packageHandle = await rootHandle.getDirectoryHandle(zipSafePart(folderName, "HPD-package"), { create: true });
  for (const entry of entries) {
    await writePackageEntryToDirectory(packageHandle, entry);
  }
}

async function renderPdfFirstPageImage(bytes: Uint8Array): Promise<{ imageUrl: string; pageCount: number; error: string }> {
  const renderer = await import("./pdf-preview-renderer");
  return renderer.renderPdfFirstPageImage(bytes);
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
  const [includePackageMedia, setIncludePackageMedia] = useState(true);
  const [includePackageSignature, setIncludePackageSignature] = useState(true);
  const [pdfStatus, setPdfStatus] = useState("");
  const [packagePreview, setPackagePreview] = useState<CompletePackagePreview | null>(null);
  const [packagePreviewOpen, setPackagePreviewOpen] = useState(false);
  const [fullScreenPdfOpen, setFullScreenPdfOpen] = useState(false);
  const pendingCompletePackageRef = useRef<PendingCompletePackage | null>(null);
  const autoGenerateStartedRef = useRef(false);
  const packagePreviewPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (packagePreview?.pdfUrl) URL.revokeObjectURL(packagePreview.pdfUrl);
      if (packagePreview?.pdfPreviewImageUrl) URL.revokeObjectURL(packagePreview.pdfPreviewImageUrl);
      if (packagePreview?.zipUrl) URL.revokeObjectURL(packagePreview.zipUrl);
      packagePreview?.folderLinks.forEach((link) => URL.revokeObjectURL(link.url));
      packagePreview?.videoLinks.forEach((link) => URL.revokeObjectURL(link.url));
    };
  }, [packagePreview]);

  useEffect(() => {
    if (!packagePreview || !packagePreviewOpen || typeof window === "undefined") return;

    const focusTimer = window.setTimeout(() => {
      packagePreviewPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => window.clearTimeout(focusTimer);
  }, [packagePreview, packagePreviewOpen]);

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
    const mediaParam = String(params.get("media") || params.get("evidence") || "").toLowerCase();
    const signatureParam = String(params.get("signature") || params.get("signatures") || params.get("signer") || "").toLowerCase();
    const queryIncludesSignature = !["none", "no", "0", "false", "unsigned", "without"].includes(signatureParam);
    const shouldAutoGeneratePackage = ["package", "1", "true", "yes"].includes(autoParam);
    let nextOutcome = paperworkOutcomeFromValue(params.get("outcome") || "");

    if (nextOutcome === "pending") {
      if (packageParam.includes("no")) nextOutcome = "no_access";
      else if (packageParam.includes("work")) nextOutcome = "work_completed";
      else if (shouldAutoGeneratePackage) nextOutcome = "work_completed";
    }

    setSelectedId(job);
    setOutcome(nextOutcome);
    setIncludePackageMedia(!["none", "no", "0", "false", "pdf", "pdf-only"].includes(mediaParam));
    setIncludePackageSignature(queryIncludesSignature);
    setAutoGeneratePackage(shouldAutoGeneratePackage);
    setForm((current) => ({
      ...current,
      affidavitType: affidavitTemplateLabel(nextOutcome),
      affidavitReason: affidavitReasonForOutcome(nextOutcome),
      description: invoiceDescriptionForOutcome(null, nextOutcome),
      signer: queryIncludesSignature ? current.signer || DEFAULT_PACKAGE_SIGNER : "",
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
    const nextForm = formFromJob(job, selectedOutcome);
    setForm(includePackageSignature ? nextForm : { ...nextForm, signer: "" });
  }, [jobs, selectedId, includePackageSignature]);

  const selectedJob = useMemo(() => findJob(jobs, selectedId), [jobs, selectedId]);
  const selectedJobId = selectedJob ? getJobId(selectedJob) : "";
  const packageJobLoading = Boolean(selectedId && (!selectedJob || form.jobId !== selectedJobId));
  const canGeneratePackage = Boolean((form.jobId || selectedId) && outcome !== "pending" && !packageJobLoading);

  useEffect(() => {
    if (!autoGeneratePackage || autoGenerateStartedRef.current) return;
    if (!selectedId || !jobs.length || !selectedJob || !form.jobId) return;
    if (outcome === "pending") {
      const savedOutcome = paperworkOutcomeFromJob(selectedJob);
      if (savedOutcome !== "pending") {
        setOutcome(savedOutcome);
        setForm((current) => ({
          ...current,
          ...formFromJob(selectedJob, savedOutcome),
          signer: includePackageSignature ? current.signer || DEFAULT_PACKAGE_SIGNER : "",
        }));
        setPdfStatus("Saved field status found. Preparing the package.");
        return;
      }
      setPdfStatus("Pick Work Completed or No Work Completed before generating this package.");
      return;
    }

    autoGenerateStartedRef.current = true;
    setPdfStatus(
      includePackageSignature
        ? "Auto-generating package. If no media is saved, I will create the affidavit/invoice folder files so the first tap still finishes."
        : "Auto-generating unsigned package. Signer fields will stay blank in the affidavit/invoice PDF."
    );
    window.setTimeout(() => {
      void generateCompletePackage(includePackageMedia, includePackageSignature);
    }, 250);
  }, [autoGeneratePackage, selectedId, jobs.length, selectedJob, form.jobId, includePackageMedia, includePackageSignature, outcome]);

  function clearPackagePreview() {
    setPackagePreview(null);
    setPackagePreviewOpen(false);
    setFullScreenPdfOpen(false);
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
    const nextForm = formFromJob(job, nextOutcome);
    setForm(includePackageSignature ? nextForm : { ...nextForm, signer: "" });
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
      signer: includePackageSignature ? current.signer : "",
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
    const activeOutcome = options.outcomeOverride || outcome;
    const includeSignature = options.includeSignature !== false;
    const useWorkTemplate = activeOutcome === "work_completed" || activeOutcome === "partial_work_completed";
    const templateUrl = useWorkTemplate ? WORK_AFFIDAVIT_TEMPLATE : NO_WORK_AFFIDAVIT_TEMPLATE;
    const jobId = activeForm.jobId || selectedId || "HPD";
    const archiveJobId = activeForm.jobId || selectedId;
    const borough = activeForm.borough || (selectedJob ? getJobBorough(selectedJob) : "");
    const bidValue = amountNumber(activeForm.bidAmount || activeForm.amount);
    const chargeValue = amountNumber(activeForm.amount || activeForm.bidAmount);
    const bidAmount = pdfMoney(bidValue);
    const chargeAmount = pdfMoney(chargeValue);
    const changeAmount = activeOutcome === "partial_work_completed"
      ? pdfMoney(Math.max(0, bidValue - chargeValue))
      : isNoWorkOutcome(activeOutcome)
        ? pdfMoney(chargeValue - bidValue, true)
        : "0.00";
    const fieldDate = activeForm.fieldDate || activeForm.workComplete || todayIsoDate();
    const firstAttempt = activeForm.firstAttempt || fieldDate;
    const secondAttempt = activeForm.secondAttempt || fieldDate;
    const invoiceDate = useWorkTemplate ? activeForm.workComplete || fieldDate : secondAttempt;
    const signer = includeSignature ? activeForm.signer || DEFAULT_PACKAGE_SIGNER : "";
    const swornSigner = signer ? oathSigner(signer) : "";
    const locationText = upper(activeForm.location);
    const locationFontSize = pdfLocationFontSize(locationText);

    if (refusedAccessNeedsDescription(activeOutcome, activeForm)) {
      setPdfStatus(`Refused access needs section 7b description of the person. Enter what you observed, for example: ${REFUSED_ACCESS_DESCRIPTION_EXAMPLE}.`);
      return null;
    }

    setPdfStatus(downloadPdf ? "Preparing affidavit PDF..." : "Preparing invoice/affidavit for package...");

    try {
      const response = await fetch(templateUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Template returned HTTP ${response.status}`);

      const pdfDoc = await PDFDocument.load(await response.arrayBuffer());
      const pdfForm = pdfDoc.getForm();
      shiftInvoiceAptLocationWidget(pdfForm);
      if (!useWorkTemplate && activeOutcome === "no_access") {
        shiftNoAccessAffidavitDateWidgets(pdfForm);
      }

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
      const materials = activeOutcome === "partial_work_completed" ? PARTIAL_MATERIALS : useWorkTemplate ? WORK_MATERIALS : ["TRASH BAG"];
      materials.forEach((material, index) => setText(`M${index + 1}`, material));
      setText("OMO", jobId);
      setText("TAX ID", "203444624");
      setText("INVOICE #", activeForm.invoiceNo);
      setText("TRADE", "GENERAL CONSTRUCTION");
      setText("Boro", upper(borough), 9);
      setText("Borough", upper(borough), 9);
      setText("Apt #", locationText, locationFontSize);
      setText("Building Address", upper(activeForm.address), activeForm.address.length > 42 ? 8 : 10);
      setText("BID AMOUNT", bidAmount);
      setText("INCREASE DECREASE AMOUNT", changeAmount);
      setText("TOTAL CHARGE", chargeAmount);
      setText("NAME Please Print", signer.toUpperCase());
      setText("TITLE", signer ? "VP" : "");
      check("RC MINI NO");
      check("APPROVED INCREASE DECREASE NO");
      check("PERMIT REQUIRED NO");

      if (useWorkTemplate) {
        const workDate = activeForm.workComplete || fieldDate;
        setText("COUNTY OF", AFFIDAVIT_NOTARY_COUNTY, 9);
        setText("being duly sworn deposes and says", signer ? `I,  ${swornSigner}/ United Angel Construction Corp` : "");
        setText("Apt#", locationText, locationFontSize);
        setText("State", "NY");
        setText("PARTIAL WORK DESC", "");
        setText("AMOUNT", "");
        setText("PARTIAL REFUSED AMOUNT", activeOutcome === "partial_work_completed" ? chargeAmount : "");
        setText("relationship to building", "");
        setText("Description of individual", "");
        setText("eg malefemale", "");
        setText("MONTH", monthName(workDate));
        setText("DAY", dayOfMonth(workDate));
        setText("Type or Print Name", signer.toUpperCase());
        setText("START DATE", activeOutcome === "work_completed" ? activeForm.workStart || activeForm.fieldDate : "");
        setText("COMPLETE DATE", activeOutcome === "work_completed" ? activeForm.workComplete || activeForm.fieldDate : "");
        setText("Work Description", activeForm.description || activeForm.notes || "Work completed per HPD bid / work order.");
      } else {
        const noWorkReason = activeForm.affidavitReason || affidavitReasonForOutcome(activeOutcome);
        const isRefusedAccess = activeOutcome === "refused_access";
        const deniedName = isRefusedAccess ? cleanRefusedName(activeForm.deniedName) : "";
        const deniedRelationship = isRefusedAccess ? activeForm.deniedRelationship || "SUPER" : "";
        const deniedDescription = isRefusedAccess ? activeForm.deniedDescription : "";
        const deniedPhone = isRefusedAccess ? activeForm.deniedPhone : "";

        setText("inaccessibility was due to 1", activeOutcome === "no_access" ? "NO ACCESS TO MAKE REPAIRS" : "");
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
        setText("I swear statement", signer ? `I     ${swornSigner} / United Angel Construction Corp` : "");
        setText("START DATE", activeOutcome === "no_access" ? firstAttempt : "");
        setText("COMPLETE DATE", activeOutcome === "no_access" ? secondAttempt : "");
        setText("Work Description", activeForm.description || noWorkReason, 11);
      }

      pdfForm.updateFieldAppearances();
      pdfForm.flatten();

      const pdfPages = pdfDoc.getPages();
      const checkboxPage = pdfPages[2] || pdfPages[0];
      if (!useWorkTemplate && activeOutcome === "completed_by_others" && pdfPages[0]) {
        pdfPages[0].drawText(secondAttempt, NO_WORK_COMPLETED_BY_OTHERS_LINE_5_DATE);
      }
      if (useWorkTemplate && activeOutcome === "partial_work_completed" && checkboxPage) {
        pdfPages[0]?.drawText(activeForm.workStart || activeForm.fieldDate, { x: 126, y: 481, size: 10 });
        checkboxPage.drawText(invoiceDate, { x: 411, y: 635, size: 10 });
        checkboxPage.drawText(activeForm.workStart || activeForm.fieldDate, { x: 411, y: 618, size: 10 });
        checkboxPage.drawText(activeForm.workComplete || activeForm.fieldDate, { x: 423, y: 595, size: 10 });
      }
      if (!useWorkTemplate && activeOutcome !== "no_access" && checkboxPage) {
        checkboxPage.drawText(secondAttempt, { x: 411, y: 635, size: 10 });
        checkboxPage.drawText(secondAttempt, { x: 411, y: 618, size: 10 });
        checkboxPage.drawText(secondAttempt, { x: 423, y: 595, size: 10 });
      }

      const bytes = await pdfDoc.save();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const pdfBytes = new Uint8Array(buffer);
      const dataUrl = bytesToDataUrl(pdfBytes, "application/pdf");
      const fileName = `${safeFilename(jobId)}-${packageStatusSlug(activeOutcome)}-affidavit-invoice.pdf`;

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

  async function generateCompletePackage(includeMediaOverride = includePackageMedia, includeSignatureOverride = includePackageSignature) {
    const activeOutcome = outcome;
    const activeJob = selectedJob;
    if (selectedId && !activeJob) {
      setPdfStatus("Still loading COA/ITB job data. Wait a moment, then generate the package.");
      return;
    }

    const includeSignature = includeSignatureOverride !== false;
    const activeFormBase = activeJob ? formWithLoadedJobData(form, activeJob, activeOutcome) : form;
    const activeForm = includeSignature ? activeFormBase : { ...activeFormBase, signer: "" };
    if (activeJob && activeForm !== form) setForm(activeForm);
    const jobId = activeForm.jobId || selectedId;
    if (!jobId) {
      setPdfStatus("Select a job before generating the package.");
      return;
    }
    if (activeOutcome === "pending") {
      setPdfStatus("Pick Work Completed or No Work Completed before generating this package.");
      return;
    }

    clearPackagePreview();
    setFullScreenPdfOpen(false);
    const includeMedia = Boolean(includeMediaOverride);
    const isWorkOutcome = activeOutcome === "work_completed" || activeOutcome === "partial_work_completed";
    const mediaOptionalForOutcome = isWorkOutcome || isNoWorkOutcome(activeOutcome);
    setIncludePackageMedia(includeMedia);
    setIncludePackageSignature(includeSignature);
    const allowPdfOnlyPackage = !includeMedia || mediaOptionalForOutcome;
    setPdfStatus(
      !includeMedia
        ? includeSignature
          ? "Generating affidavit and invoice only. No images or videos will be attached."
          : "Generating unsigned affidavit and invoice only. No images or videos will be attached."
        : mediaOptionalForOutcome
          ? includeSignature
            ? "Generating package. If no saved media exists, I will create the affidavit/invoice folder files."
            : "Generating unsigned package. Signer fields will stay blank in the affidavit/invoice PDF."
        : includeSignature
          ? "Generating package: affidavit, invoice, images, and videos..."
          : "Generating unsigned package: affidavit, invoice, images, and videos..."
    );

    try {
      const evidenceRows = includeMedia ? await listFieldEvidence(jobId) : [];
      if (!evidenceRows.length && !allowPdfOnlyPackage) {
        setPdfStatus("No saved images or videos were found for this OMO on this device. Capture evidence first, then Generate Package.");
        return;
      }

      const includedMedia = evidenceRows.filter(mediaHasPackageBytes);
      const skippedMedia = evidenceRows.filter((media) => !mediaHasPackageBytes(media));
      const skippedVideos = skippedMedia.filter((media) => media.mediaType === "video");
      if (skippedVideos.length && !allowPdfOnlyPackage) {
        setPdfStatus(
          `${skippedVideos.length} saved video(s) had no original video bytes in browser storage, so I stopped the package instead of sending it without video. Retake or re-upload the video from the job card, then Generate Package again.`
        );
        return;
      }
      if (!includedMedia.length && !allowPdfOnlyPackage) {
        setPdfStatus("No package-ready image or video bytes were found for this OMO. Retake or upload evidence from the job card.");
        return;
      }

      const packageEventDate = fieldEventDateForPackage(activeJob, activeOutcome, includedMedia);
      const packageForm = formWithFieldEventDate(activeForm, activeOutcome, packageEventDate, activeJob);
      setForm(packageForm);

      const pdf = await generateAffidavitPdf({
        downloadPdf: false,
        markGenerated: false,
        formOverride: packageForm,
        outcomeOverride: activeOutcome,
        includeSignature,
      });
      if (!pdf) return;

      const imageMedia = includedMedia.filter((media) => media.mediaType === "image");
      const videoMedia = includedMedia.filter((media) => media.mediaType === "video");
      const folderName = packageFolderName(packageForm, pdf.jobId, activeOutcome);
      const zipFileName = packageZipFileName(packageForm, pdf.jobId, activeOutcome);
      const statusLabel = packageStatusLabel(activeOutcome);
      const applicationFileName = `${folderName}_application-files`;
      const videoPackageFileName = videoMedia.length ? `${folderName}_video-files` : "";

      const pdfEntry: PackageFileEntry = {
        path: `invoice-affidavit-package/${safeAttachmentName(pdf.fileName, "invoice-affidavit.pdf")}`,
        bytes: pdf.bytes,
        mimeType: "application/pdf",
        label: "Invoice / Affidavit PDF",
        section: "pdf",
      };

      const manifestEntry: PackageFileEntry = {
        path: "PACKAGE-MANIFEST.txt",
        bytes: zipTextBytes(packageManifestText(pdf.jobId, pdf, includedMedia, skippedMedia)),
        mimeType: "text/plain",
        label: "Package manifest",
        section: "manifest",
      };

      const mediaEntries: PackageFileEntry[] = includedMedia.map((media, index) => ({
        path: fullPackageMediaPath(pdf.jobId, media, index, packageStatusSlug(activeOutcome)),
        bytes: dataUrlToBytes(media.dataUrl),
        mimeType: media.type || (media.mediaType === "video" ? "video/mp4" : "image/jpeg"),
        label: media.mediaType === "video" ? "Video evidence" : "Image evidence",
        section: media.mediaType === "video" ? "video" : "image",
      }));

      const applicationManifestEntry: PackageFileEntry = {
        path: "PACKAGE-MANIFEST.txt",
        bytes: zipTextBytes(packageManifestText(pdf.jobId, pdf, imageMedia, skippedMedia.filter((media) => media.mediaType !== "video"))),
        mimeType: "text/plain",
        label: "Application manifest",
        section: "manifest",
      };

      const videoManifestEntry: PackageFileEntry | null = videoMedia.length
        ? {
            path: "VIDEO-MANIFEST.txt",
            bytes: zipTextBytes(videoPackageManifestText(pdf.jobId, videoMedia)),
            mimeType: "text/plain",
            label: "Video manifest",
            section: "manifest",
          }
        : null;

      const folderEntries: PackageFileEntry[] = [pdfEntry, manifestEntry, ...mediaEntries];
      const applicationEntries: PackageFileEntry[] = [
        pdfEntry,
        applicationManifestEntry,
        ...mediaEntries.filter((entry) => entry.section === "image"),
      ];
      const videoEntries: PackageFileEntry[] = videoManifestEntry
        ? [videoManifestEntry, ...mediaEntries.filter((entry) => entry.section === "video")]
        : [];

      const zipBytes = buildStoredZip(folderEntries.map((entry) => ({
        path: `${folderName}/${entry.path}`,
        bytes: entry.bytes,
      })));
      const zipUrl = bytesToObjectUrl(zipBytes, "application/zip");
      const pdfUrl = bytesToObjectUrl(pdf.bytes, "application/pdf");
      const pdfPreview = await renderPdfFirstPageImage(pdf.bytes);
      const imageCount = imageMedia.length;
      const videoCount = videoMedia.length;
      const beforeCount = includedMedia.filter((media) => media.kind === "before").length;
      const afterCount = includedMedia.filter((media) => media.kind === "after").length;
      const folderLinks = folderEntries.map((entry) => packageEntryToDownloadLink(entry, folderName));
      const completeShareFiles = folderEntries.map((entry) => packageEntryToFile(entry, folderName));
      const applicationShareFiles = applicationEntries.map((entry) => packageEntryToFile(entry, folderName));
      const videoFiles = videoEntries.map((entry) => packageEntryToFile(entry, folderName));
      const videoNames = videoFiles.map((file) => file.name);
      const videoLinks = videoFiles.map((file) => ({
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
      }));
      const folderSize = packageEntriesSize(folderEntries);
      const applicationSize = packageEntriesSize(applicationEntries);
      const videoPackageSize = packageEntriesSize(videoEntries);
      const note = includedMedia.length
        ? videoCount
          ? "Regular folder package is ready with the affidavit/invoice PDF, labeled images, labeled videos, and manifest."
          : "Regular folder package is ready with the affidavit/invoice PDF and labeled images. No videos were found for this OMO."
        : includeSignature
          ? "PDF-only folder package is ready. No images or videos were attached."
          : "Unsigned PDF-only folder package is ready. No images or videos were attached.";

      const preview: CompletePackagePreview = {
        jobId: pdf.jobId,
        folderName,
        folderSize,
        folderFileCount: folderEntries.length,
        folderLinks,
        zipFileName,
        zipSize: zipBytes.byteLength,
        zipUrl,
        completeFileName: folderName,
        completeSize: folderSize,
        applicationFileName,
        applicationSize,
        applicationMediaCount: imageMedia.length,
        imageCount,
        videoCount,
        beforeCount,
        afterCount,
        pdfFileName: pdf.fileName,
        pdfSize: pdf.size,
        pdfUrl,
        pdfPreviewImageUrl: pdfPreview.imageUrl,
        pdfPreviewPageCount: pdfPreview.pageCount,
        pdfPreviewError: pdfPreview.error,
        videoPackageFileName,
        videoPackageSize,
        videoNames,
        videoLinks,
        skippedMediaCount: skippedMedia.length,
        note,
      };

      pendingCompletePackageRef.current = {
        ...preview,
        folderEntries,
        applicationEntries,
        videoEntries,
        zipBytes,
        completeShareFiles,
        applicationShareFiles,
        videoShareFiles: videoFiles,
      };
      setPackagePreview(preview);
      setPackagePreviewOpen(true);
      const archiveMessage = await markPackageGenerated(pdf.jobId);
      setPdfStatus(`${includedMedia.length ? "Folder Package Created" : "PDF-only Folder Created"} for ${statusLabel}. Review the PDF, then save/share the folder files or optional ZIP. ${archiveMessage}`);
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
      `${message} Preview is open with Save Folder, Share Files, and Download Files buttons.`
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

  async function sendZipPackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send the ZIP.");
      return;
    }

    const zipFile = bytesToFile(pending.zipBytes, pending.zipFileName, "application/zip");
    const fileToShare = canSharePackageFiles([zipFile])
      ? zipFile
      : bytesToFile(pending.zipBytes, pending.zipFileName, "application/octet-stream");

    if (!canSharePackageFiles([fileToShare])) {
      showPackageShareFallback("This device blocked ZIP sharing.");
      return;
    }

    try {
      await navigator.share({
        title: `${pending.jobId} HPD optional ZIP`,
        text: `Optional ZIP for ${pending.jobId}. File name includes status: ${pending.zipFileName}.`,
        files: [fileToShare],
      });
      setPdfStatus(`Optional ZIP opened in share sheet: ${pending.zipFileName}`);
    } catch (error) {
      console.error(error);
      showPackageShareFallback("ZIP send was cancelled or blocked.");
    }
  }

  async function saveCompletePackageFolder() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then save the folder.");
      return;
    }

    try {
      await saveEntriesAsRegularFolder(pending.folderName, pending.folderEntries);
      setPdfStatus(`Saved regular folder: ${pending.folderName}`);
    } catch (error) {
      console.error(error);
      setPackagePreviewOpen(true);
      setPdfStatus(error instanceof Error ? error.message : "Could not save the regular folder. Use Download Files.");
    }
  }

  function downloadPackageEntries(entries: PackageFileEntry[], folderName: string, message: string) {
    if (!entries.length || typeof document === "undefined") {
      setPdfStatus("No package files are ready. Generate Package again.");
      return;
    }

    entries.forEach((entry, index) => {
      window.setTimeout(() => {
        const url = bytesToObjectUrl(entry.bytes, entry.mimeType);
        const link = document.createElement("a");
        link.href = url;
        link.download = packageFlatFileName(`${folderName}/${entry.path}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      }, index * 250);
    });

    setPdfStatus(message);
  }

  function downloadCompletePackageFiles() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then download the files.");
      return;
    }

    downloadPackageEntries(
      pending.folderEntries,
      pending.folderName,
      `Downloading ${pending.folderEntries.length} regular package file(s): PDF, manifest, images, and videos.`
    );
  }

  async function sendCompletePackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }

    await sharePackageFiles(
      pending.completeShareFiles,
      `${pending.jobId} HPD package files`,
      `HPD package files for ${pending.jobId}: affidavit/invoice PDF, images, videos, and manifests.`,
      `Regular package files opened in share sheet: ${pending.folderFileCount} file(s).`
    );
  }

  async function sendApplicationPackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }

    await sharePackageFiles(
      pending.applicationShareFiles,
      `${pending.jobId} HPD application package`,
      `HPD application files for ${pending.jobId}: affidavit/invoice PDF plus images.`,
      `Application files opened in share sheet: ${pending.applicationShareFiles.length} file(s).`
    );
  }

  async function sendVideoPackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending) {
      setPdfStatus("Generate Package first, review it, then send.");
      return;
    }
    if (!pending.videoShareFiles.length) {
      setPdfStatus("No video files were generated for this OMO.");
      return;
    }

    await sharePackageFiles(
      pending.videoShareFiles,
      `${pending.jobId} HPD video files`,
      `HPD video files for ${pending.jobId}: ${pending.videoCount} video(s).`,
      `Video files opened in share sheet: ${pending.videoShareFiles.length} file(s).`
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

        .paperwork-generate-choice button:disabled {
          cursor: wait;
          opacity: 0.58;
          filter: saturate(0.65);
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

        .package-review-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .package-review-strip span {
          display: grid;
          gap: 3px;
          border: 1px solid rgba(125, 211, 252, 0.22);
          background: rgba(224, 242, 254, 0.07);
          border-radius: 8px;
          padding: 10px;
        }

        .package-review-strip b {
          color: #93c5fd;
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .package-review-strip strong {
          color: #ffffff;
          font-size: 13px;
          line-height: 1.15;
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

        .package-main-actions {
          grid-template-columns: 1fr;
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

        .package-pdf-preview-card {
          display: grid;
          gap: 10px;
          border: 1px solid rgba(83, 230, 156, 0.28);
          border-radius: 8px;
          background:
            linear-gradient(135deg, rgba(83, 230, 156, 0.10), rgba(125, 211, 252, 0.08)),
            rgba(2, 6, 23, 0.72);
          padding: 12px;
        }

        .package-pdf-preview-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
        }

        .package-pdf-preview-head span {
          display: block;
          color: #53e69c;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .package-pdf-preview-head strong {
          display: block;
          margin-top: 3px;
          color: #ffffff;
          font-size: 14px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .package-pdf-preview-head small {
          display: block;
          margin-top: 3px;
          color: #cbd5e1;
          line-height: 1.35;
        }

        .package-pdf-preview-head a,
        .package-pdf-preview-head button,
        .package-pdf-actions a,
        .package-pdf-actions button {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid rgba(125, 211, 252, 0.38);
          background: rgba(224, 242, 254, 0.10);
          color: #e0f2fe;
          padding: 0 12px;
          text-decoration: none;
          font-size: 12px;
          font-weight: 950;
          text-align: center;
          font-family: inherit;
          cursor: pointer;
        }

        .package-pdf-frame {
          width: 100%;
          min-height: 520px;
          border: 1px solid rgba(226, 232, 240, 0.20);
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
        }

        .package-pdf-frame iframe {
          width: 100%;
          min-height: 520px;
          border: 0;
        }

        .package-pdf-fallback-card,
        .fullscreen-pdf-fallback {
          display: grid;
          gap: 10px;
          align-content: center;
          justify-items: center;
          min-height: 320px;
          border: 1px solid rgba(226, 232, 240, 0.20);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.90), rgba(8, 47, 73, 0.72));
          color: #f8fbff;
          text-align: center;
          padding: 22px;
        }

        .package-pdf-fallback-card strong,
        .fullscreen-pdf-fallback strong {
          font-size: 16px;
        }

        .package-pdf-fallback-card span,
        .fullscreen-pdf-fallback span {
          max-width: 520px;
          color: #c8d7eb;
          line-height: 1.45;
        }

        .package-pdf-fallback-card a,
        .fullscreen-pdf-fallback a {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #53e69c;
          color: #041316;
          padding: 0 16px;
          font-weight: 950;
          text-decoration: none;
        }

        .package-pdf-image {
          width: 100%;
          display: block;
          border: 1px solid rgba(226, 232, 240, 0.24);
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        }

        .package-pdf-fallback-note {
          display: block;
          color: #fde68a;
          line-height: 1.35;
        }

        .package-pdf-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .fullscreen-pdf-overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: grid;
          background: rgba(2, 6, 23, 0.94);
          backdrop-filter: blur(10px);
          padding: 12px;
        }

        .fullscreen-pdf-shell {
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 10px;
          border: 1px solid rgba(125, 211, 252, 0.26);
          border-radius: 8px;
          background: #07111f;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.4);
          overflow: hidden;
        }

        .fullscreen-pdf-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        }

        .fullscreen-pdf-bar span {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .fullscreen-pdf-bar strong {
          display: block;
          color: #ffffff;
          font-size: 13px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .fullscreen-pdf-close {
          min-height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          padding: 0 14px;
          font-weight: 950;
          font-family: inherit;
          cursor: pointer;
        }

        .fullscreen-pdf-body {
          min-height: 0;
          overflow: auto;
          padding: 10px;
          text-align: center;
        }

        .fullscreen-pdf-body img {
          width: min(100%, 980px);
          height: auto;
          border-radius: 8px;
          background: #ffffff;
        }

        .fullscreen-pdf-body object,
        .fullscreen-pdf-body iframe {
          width: min(100%, 980px);
          min-height: 80vh;
          border: 0;
          border-radius: 8px;
          background: #ffffff;
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

        .package-folder-list {
          display: grid;
          gap: 7px;
          border: 1px solid rgba(124, 246, 198, 0.22);
          background: rgba(2, 13, 24, 0.58);
          border-radius: 10px;
          padding: 10px;
        }

        .package-folder-list-head,
        .package-folder-file {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
        }

        .package-folder-list-head strong {
          color: #ffffff;
          font-size: 13px;
        }

        .package-folder-list-head span {
          color: #7cf6c6;
          font-size: 12px;
          font-weight: 900;
        }

        .package-folder-file {
          min-height: 38px;
          padding: 8px 9px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(255, 255, 255, 0.045);
          color: #e8f7ff;
          text-decoration: none;
        }

        .package-folder-file span {
          overflow-wrap: anywhere;
          font-size: 12px;
          line-height: 1.25;
        }

        .package-folder-file b {
          color: #dfffea;
          font-size: 12px;
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
          .package-review-strip,
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

        /* SIMPLE_PACKAGE_UI_V1_2 */
        .paperwork-wrap {
          gap: 16px;
        }

        .paperwork-top {
          border-radius: 18px;
        }

        .paperwork-card {
          border-radius: 20px;
          padding: 16px;
        }

        .paperwork-package-badge {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          width: max-content;
          max-width: 100%;
          padding: 0 12px;
          border-radius: 999px;
        }

        .paperwork-source-status,
        .paperwork-pdf-status {
          border-radius: 14px;
          padding: 12px 13px;
          line-height: 1.35;
        }

        .paperwork-package-actions {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .package-choice {
          min-height: 72px;
          border-radius: 16px;
          padding: 14px;
        }

        .package-choice strong {
          font-size: 20px;
        }

        .paperwork-summary-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .paperwork-summary-tile {
          min-height: 76px;
          border-radius: 16px;
          padding: 13px;
        }

        .paperwork-summary-tile strong {
          font-size: 21px;
          line-height: 1.08;
        }

        .refused-access-required {
          border-radius: 16px;
          padding: 14px;
        }

        .paperwork-field input,
        .paperwork-field textarea,
        .paperwork-field select {
          min-height: 50px;
          border-radius: 14px;
          font-size: 16px;
        }

        .paperwork-print {
          min-height: 70px;
          border-radius: 18px;
          font-size: 20px;
        }

        .paperwork-generate-choice {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .paperwork-generate-choice .paperwork-print,
        .paperwork-generate-choice .paperwork-secondary {
          width: 100%;
          min-height: 70px;
          border-radius: 18px;
          font-size: 20px;
        }

        .paperwork-generate-choice small {
          color: #aebbd0;
          line-height: 1.35;
        }

        .paperwork-pdf-only {
          background: rgba(250, 204, 21, 0.16);
          border-color: rgba(250, 204, 21, 0.32);
          color: #fef3c7;
        }

        .paperwork-package-review {
          border-radius: 22px;
          padding: 16px;
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(9, 15, 25, 0.98)),
            #0f172a;
        }

        .package-created-head {
          grid-template-columns: 1fr;
          align-items: start;
          gap: 10px;
          border-radius: 18px;
          padding: 15px;
          background:
            linear-gradient(135deg, rgba(52, 211, 153, 0.16), rgba(56, 189, 248, 0.12)),
            rgba(248, 250, 252, 0.04);
        }

        .package-created-head h3 {
          font-size: clamp(34px, 10vw, 54px);
        }

        .package-created-head p {
          font-size: 14px;
          line-height: 1.38;
        }

        .package-created-head > span:last-child {
          justify-self: start;
          min-height: 40px;
          border-radius: 999px;
          padding: 0 13px;
        }

        .package-main-actions {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .package-main-actions button {
          min-height: 72px;
          border-radius: 18px;
          font-size: 20px;
        }

        .package-preview-panel {
          border-radius: 18px;
          padding: 0;
        }

        .package-pdf-preview-card {
          border-radius: 18px;
          padding: 12px;
        }

        .package-pdf-preview-head {
          grid-template-columns: 1fr;
        }

        .package-pdf-preview-head a,
        .package-pdf-preview-head button,
        .package-pdf-actions a,
        .package-pdf-actions button {
          min-height: 52px;
          border-radius: 14px;
          font-size: 14px;
        }

        .package-pdf-frame {
          min-height: 460px;
          border-radius: 12px;
        }

        .package-pdf-frame iframe {
          min-height: 460px;
        }

        .package-pdf-image {
          border-radius: 12px;
        }

        .package-pdf-actions {
          grid-template-columns: 1fr;
        }

        .package-content-list {
          gap: 10px;
        }

        .package-content-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 8px;
          border-radius: 16px;
          padding: 14px;
        }

        .package-content-row strong {
          font-size: 16px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .package-content-row b {
          justify-self: start;
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          padding: 0 10px;
          border-radius: 999px;
        }

        .package-folder-list {
          border-radius: 16px;
          padding: 12px;
        }

        .package-folder-list-head,
        .package-folder-file {
          grid-template-columns: minmax(0, 1fr);
          gap: 5px;
        }

        .package-folder-file {
          min-height: 48px;
          border-radius: 14px;
        }

        .package-folder-file span {
          font-size: 13px;
        }

        .package-primary-delivery,
        .package-secondary-delivery {
          grid-template-columns: 1fr;
          gap: 10px;
          border-radius: 16px;
        }

        .package-primary-delivery button,
        .package-primary-delivery a,
        .package-secondary-delivery button,
        .package-secondary-delivery a {
          min-height: 64px;
          border-radius: 16px;
          font-size: 16px;
        }

        .package-backup-details {
          border-radius: 16px;
        }

        .package-video-preview {
          border-radius: 16px;
        }

        .package-video-list {
          gap: 10px;
        }

        .package-video-item {
          border-radius: 16px;
          padding: 10px;
        }

        @media (max-width: 720px) {
          .hpd-paperwork-shell {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            padding-inline: 12px;
          }

          .paperwork-wrap {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            grid-template-columns: minmax(0, 1fr);
          }

          .paperwork-top {
            min-width: 0;
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
          }

          .paperwork-top > div,
          .paperwork-card,
          .paperwork-package-review,
          .package-created-head,
          .package-content-row {
            min-width: 0;
          }

          .paperwork-top h1 {
            max-width: 100%;
            overflow-wrap: anywhere;
            font-size: clamp(32px, 10vw, 44px);
            line-height: 1.04;
          }

          .paperwork-top p {
            max-width: 100%;
            overflow-wrap: anywhere;
          }

          .paperwork-nav {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            justify-content: stretch;
          }

          .paperwork-nav a {
            min-width: 0;
            text-align: center;
          }

          .package-created-head h3 {
            font-size: clamp(30px, 10vw, 44px);
          }
        }

        @media (max-width: 720px) {
          .paperwork-readable-phone-guard {
            --readable: 1;
          }

          .hpd-paperwork-shell {
            padding: max(14px, env(safe-area-inset-top)) 10px max(24px, env(safe-area-inset-bottom));
            font-size: 17px;
          }

          .paperwork-wrap {
            gap: 12px;
          }

          .paperwork-top {
            border-radius: 18px;
            padding: 16px;
          }

          .paperwork-top h1 {
            font-size: 38px;
            line-height: 1.02;
          }

          .paperwork-top p,
          .paperwork-card p,
          .paperwork-field span,
          .preview-muted,
          .paperwork-package-review p {
            font-size: 16px;
            line-height: 1.4;
          }

          .paperwork-nav {
            grid-template-columns: 1fr;
          }

          .paperwork-nav a,
          .paperwork-nav button,
          .paperwork-print,
          .paperwork-secondary {
            min-height: 58px;
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 14px;
            font-size: 16px;
            line-height: 1.15;
          }

          .paperwork-card,
          .paperwork-preview,
          .paperwork-package-review {
            border-radius: 22px;
            padding: 18px;
          }

          .paperwork-package-badge {
            min-height: 42px;
            padding: 0 13px;
            font-size: 15px;
          }

          .package-choice {
            min-height: 94px;
            border-radius: 18px;
            padding: 17px;
          }

          .package-choice strong {
            font-size: 22px;
            line-height: 1.1;
          }

          .package-choice span {
            font-size: 15px;
            line-height: 1.35;
          }

          .paperwork-summary-tile {
            min-height: 88px;
            border-radius: 18px;
            padding: 15px;
          }

          .paperwork-summary-tile span,
          .paperwork-summary-tile small {
            font-size: 13px;
            line-height: 1.32;
          }

          .paperwork-summary-tile strong {
            font-size: 22px;
            line-height: 1.1;
          }

          .paperwork-field input,
          .paperwork-field textarea,
          .paperwork-field select {
            min-height: 56px;
            border-radius: 16px;
            font-size: 17px;
          }

          .paperwork-generate-choice .paperwork-print,
          .paperwork-generate-choice .paperwork-secondary {
            min-height: 76px;
            border-radius: 20px;
            font-size: 21px;
          }

          .paperwork-generate-choice small {
            font-size: 14px;
            line-height: 1.35;
          }

          .package-created-head h3 {
            font-size: 40px;
            line-height: 1.02;
          }

          .package-main-actions button {
            min-height: 76px;
            border-radius: 20px;
            font-size: 21px;
          }

          .package-content-row strong {
            font-size: 17px;
            line-height: 1.22;
          }

          .package-content-row span,
          .package-content-row small,
          .package-content-row b,
          .package-folder-file span,
          .package-folder-file b {
            font-size: 14px;
            line-height: 1.35;
          }

          .package-primary-delivery button,
          .package-primary-delivery a,
          .package-secondary-delivery button,
          .package-secondary-delivery a {
            min-height: 68px;
            border-radius: 18px;
            font-size: 17px;
          }

          .package-pdf-preview-head strong {
            font-size: 17px;
          }

          .package-pdf-preview-head small {
            font-size: 14px;
          }

          .package-pdf-preview-head a,
          .package-pdf-preview-head button,
          .package-pdf-actions a,
          .package-pdf-actions button {
            min-height: 58px;
            border-radius: 16px;
            font-size: 15px;
          }
        }

        @media (max-width: 390px) {
          .paperwork-top h1 {
            font-size: 34px;
          }

          .package-created-head h3 {
            font-size: 36px;
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
            <div className="paperwork-generate-choice" aria-label="Package media choice">
              <button className="paperwork-print" type="button" onClick={() => generateCompletePackage(true)} disabled={!canGeneratePackage}>
                {packageJobLoading ? "Loading Job Data..." : "Generate Full Package"}
              </button>
              <button className="paperwork-secondary paperwork-pdf-only" type="button" onClick={() => generateCompletePackage(false)} disabled={!canGeneratePackage}>
                Affidavit + Invoice Only
              </button>
              <small>{packageJobLoading ? "Loading COA address and ITB page 3 description before package creation." : "Use the second button when you want no images or videos attached."}</small>
            </div>
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
              <div className="package-review-strip" aria-label="Package review flow">
                <span>
                  <b>Review</b>
                  <strong>PDF visible</strong>
                </span>
                <span>
                  <b>Folder</b>
                  <strong>{packagePreview.folderFileCount} files</strong>
                </span>
                <span>
                  <b>Next</b>
                  <strong>Share / Save</strong>
                </span>
              </div>
              {packagePreviewOpen ? (
                <div className="package-preview-panel" ref={packagePreviewPanelRef}>
                  <div className="package-pdf-preview-card">
                    <div className="package-pdf-preview-head">
                      <div>
                        <span>Actual PDF Created</span>
                        <strong>{packagePreview.pdfFileName}</strong>
                        <small>
                          {packetSizeLabel(packagePreview.pdfSize)} affidavit/invoice PDF generated from this job
                          {packagePreview.pdfPreviewPageCount ? ` · Page 1 of ${packagePreview.pdfPreviewPageCount}` : ""}
                        </small>
                      </div>
                      <button type="button" onClick={() => setFullScreenPdfOpen(true)}>
                        Open PDF
                      </button>
                    </div>
                    {packagePreview.pdfPreviewImageUrl ? (
                      <img
                        className="package-pdf-image"
                        src={packagePreview.pdfPreviewImageUrl}
                        alt={`${packagePreview.jobId} generated affidavit invoice PDF page 1`}
                      />
                    ) : (
                      <div className="package-pdf-fallback-card">
                        <strong>PDF created</strong>
                        <span>Preview image could not render cleanly on this device, so the app is hiding the browser PDF object instead of showing an annotation error.</span>
                        <a href={packagePreview.pdfUrl} download={packagePreview.pdfFileName}>
                          Save PDF
                        </a>
                      </div>
                    )}
                    {packagePreview.pdfPreviewError ? (
                      <small className="package-pdf-fallback-note">
                        PDF image preview is not available on this device. Use Full Screen PDF or Save PDF below.
                      </small>
                    ) : null}
                    <div className="package-pdf-actions">
                      <button type="button" onClick={() => setFullScreenPdfOpen(true)}>
                        Full Screen PDF
                      </button>
                      <a href={packagePreview.pdfUrl} download={packagePreview.pdfFileName}>
                        Save PDF
                      </a>
                    </div>
                  </div>
                  <div className="package-content-list">
                    <div className="package-content-row primary-package-row">
                      <div>
                        <span>Regular Folder</span>
                        <strong>{packagePreview.folderName}</strong>
                        <small>Affidavit/invoice PDF, all labeled images, all labeled videos, and manifest</small>
                      </div>
                      <b>{packetSizeLabel(packagePreview.folderSize)}</b>
                    </div>
                    <div className="package-content-row">
                      <div>
                        <span>Optional ZIP</span>
                        <strong>{packagePreview.zipFileName}</strong>
                        <small>Same folder contents compressed; filename includes the status</small>
                      </div>
                      <b>{packetSizeLabel(packagePreview.zipSize)}</b>
                    </div>
                    {(packagePreview.imageCount || packagePreview.videoCount) ? (
                      <div className="package-content-row">
                        <div>
                          <span>Evidence Included</span>
                          <strong>{packagePreview.imageCount} image(s) / {packagePreview.videoCount} video(s)</strong>
                          <small>Before, after, and video evidence saved from this device</small>
                        </div>
                        <b>{packagePreview.beforeCount} before / {packagePreview.afterCount} after</b>
                      </div>
                    ) : null}
                    {packagePreview.videoPackageFileName ? (
                      <div className="package-content-row">
                        <div>
                          <span>Video Files</span>
                          <strong>{packagePreview.videoPackageFileName}</strong>
                          <small>Before/after labeled video evidence</small>
                        </div>
                        <b>{packetSizeLabel(packagePreview.videoPackageSize)}</b>
                      </div>
                    ) : null}
                  </div>
                  <div className="package-folder-list" aria-label="Folder contents">
                    <div className="package-folder-list-head">
                      <strong>Folder Contents</strong>
                      <span>{packagePreview.folderFileCount} file(s)</span>
                    </div>
                    {packagePreview.folderLinks.map((link) => (
                      <a href={link.url} download={link.name} key={link.path} className={`package-folder-file folder-file-${link.section}`}>
                        <span>{link.path}</span>
                        <b>{packetSizeLabel(link.size)}</b>
                      </a>
                    ))}
                  </div>
                  <div className="package-delivery-actions package-primary-delivery">
                    <button type="button" onClick={sendCompletePackage}>
                      Share Files
                    </button>
                    <button type="button" onClick={saveCompletePackageFolder}>
                      Save Folder
                    </button>
                    <button type="button" onClick={downloadCompletePackageFiles}>
                      Download Files
                    </button>
                  </div>
                  <details className="package-backup-details">
                    <summary>Backup / separate files</summary>
                    <div className="package-delivery-actions package-secondary-delivery">
                      <button type="button" onClick={sendZipPackage}>
                        Share ZIP
                      </button>
                      <a href={packagePreview.zipUrl} download={packagePreview.zipFileName}>
                        Save ZIP
                      </a>
                      <button type="button" onClick={sendApplicationPackage}>
                        Share Application Files
                      </button>
                      {packagePreview.videoPackageFileName ? (
                        <button type="button" onClick={sendVideoPackage}>
                          Share Video Files
                        </button>
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
                        <p>{packagePreview.videoPackageFileName || "No video files generated for this OMO."}</p>
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

        {packagePreview && fullScreenPdfOpen ? (
          <div className="fullscreen-pdf-overlay" role="dialog" aria-modal="true" aria-label={`${packagePreview.jobId} generated PDF viewer`}>
            <div className="fullscreen-pdf-shell">
              <div className="fullscreen-pdf-bar">
                <div>
                  <span>PDF Preview</span>
                  <strong>{packagePreview.pdfFileName}</strong>
                </div>
                <button className="fullscreen-pdf-close" type="button" onClick={() => setFullScreenPdfOpen(false)}>
                  Close
                </button>
              </div>
              <div className="fullscreen-pdf-body">
                {packagePreview.pdfPreviewImageUrl ? (
                  <img
                    src={packagePreview.pdfPreviewImageUrl}
                    alt={`${packagePreview.jobId} generated affidavit invoice PDF full screen page 1`}
                  />
                ) : (
                  <div className="fullscreen-pdf-fallback">
                    <strong>PDF created</strong>
                    <span>The PDF preview image could not render cleanly, so the app is hiding the browser PDF object instead of showing an annotation error.</span>
                    <a href={packagePreview.pdfUrl} download={packagePreview.pdfFileName}>
                      Save PDF
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

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
