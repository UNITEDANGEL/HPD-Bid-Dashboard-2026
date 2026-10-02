"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, PDFName, degrees, rgb } from "pdf-lib";
import { dateInputValue, noAccessAttemptProblem, noTelephoneNote, parseFormDate } from "../../lib/no-access";
import { tenantContactInfo } from "../../lib/tenantContact";
import { invoiceMaterials, materialsFromText, materialsToText, type InvoiceMaterial } from "../../lib/invoice-materials";
import { drawInvoicePage } from "../../lib/invoice-pdf";
import { signatureBytes } from "../../lib/signature";
import SignatureCard from "./SignatureCard";
import NotaryCard, { type NotaryApproval } from "./NotaryCard";
import { deliverPackage, googleStatus, sendPackageEmail, type GoogleStatus } from "../../lib/package-delivery";
import { calendarDay } from "../../lib/job-priority";
import { emailMediaCopies, fitEmailVideos, assertEmailPackageSize } from "../../lib/email-package";
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
  invoiceChangeAmount,
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
  tenantPhone: string;
  phone1Date: string;
  phone2Date: string;
  phoneNote: string;
  partialReason: string;
  partialWorkDone: string;
  materialsText: string;
  workStart: string;
  workComplete: string;
  signer: string;
  sourceStatus: string;
  notes: string;
};

const WORK_AFFIDAVIT_TEMPLATE = "/templates/work-performed-affidavit.pdf";
const NO_WORK_AFFIDAVIT_TEMPLATE = "/templates/no-work-performed-affidavit.pdf";
const CONTRACTOR_NAME = "UNITED ANGEL CONSTRUCTION CORP";
const DEFAULT_PACKAGE_SIGNER = "JOTJAGRAJ SINGH";
// Convenience default only -- the notary still types/confirms their own name, signs and
// checks the witness box fresh each time. Never used to prefill a signature or a stamp.
const DEFAULT_NOTARY_NAME = "CHETANPREET MALHI";
// Printed stamp text for the emailed/Drive copy of the package (not a wet-ink impression).
// Drawn under "Notary Public" only when a notary has actually approved this package.
const NOTARY_STAMP_LINES = [
  "CHETANPREET MALHI",
  "Notary Public - State of New York",
  "NO. 01MA0022379",
  "Qualified in Queens County",
  "My Commission Expires June 13, 2029",
];
// Diagonal watermark on every page of the emailed/Drive copy only -- it is a digital
// reproduction, not the wet-ink original the notary stamps and the signer keeps.
const COPY_WATERMARK_TEXT = "COPY";
const AFFIDAVIT_NOTARY_COUNTY = "QUEENS";
const REFUSED_ACCESS_DESCRIPTION_EXAMPLE = "MALE, TALL, DARK HAIR";

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
  pdfPreviewImageUrls: string[];
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
  // Print Copy: no digital signature images, notary stamp/date still filled. Downloaded
  // straight to this device for ink signing -- never routed through Drive/email approval.
  printCopy: boolean;
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
  // Print copy: keep the printed name, leave signature lines blank for ink.
  signatureImage?: boolean;
  // In-person notary approval for this package only. Omitted/null leaves the notary area blank.
  notary?: NotaryApproval | null;
  // The unsigned, ink-ready copy: no "COPY" watermark, and the notary stamp + jurat date
  // always show (dated to today, the moment it's printed) since the notary signs on paper,
  // not through the app.
  printCopy?: boolean;
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

const MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function ordinal(day: number) {
  if (day % 10 === 1 && day % 100 !== 11) return `${day}ST`;
  if (day % 10 === 2 && day % 100 !== 12) return `${day}ND`;
  if (day % 10 === 3 && day % 100 !== 13) return `${day}RD`;
  return `${day}TH`;
}

// Large, faint, diagonal text centered on the page. Rotation pivots around the text's own
// origin, not the page center, so the anchor point is offset backwards by the (rotated) half
// width/height of the text to land the visual center on the page's center.
function drawCenteredWatermark(page: PDFPage, text: string, font: PDFFont, size: number, angleDeg: number) {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, size);
  const textHeight = font.heightAtSize(size);
  const angle = (angleDeg * Math.PI) / 180;
  const offsetX = (textWidth / 2) * Math.cos(angle) - (textHeight / 2) * Math.sin(angle);
  const offsetY = (textWidth / 2) * Math.sin(angle) + (textHeight / 2) * Math.cos(angle);
  page.drawText(text, {
    x: width / 2 - offsetX,
    y: height / 2 - offsetY,
    size,
    font,
    color: rgb(0.78, 0.1, 0.1),
    opacity: 0.16,
    rotate: degrees(angleDeg),
  });
}

// Notary jurat date, ISO ("2026-10-02") in, affidavit-ready pieces out.
function notaryDateParts(isoDate: string) {
  const parsed = parseDateValue(isoDate);
  if (!parsed) return { day: "", month: "", year: "" };
  return {
    day: ordinal(parsed.getDate()),
    month: MONTH_NAMES[parsed.getMonth()],
    year: String(parsed.getFullYear()).slice(-2),
  };
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
    tenantPhone: "",
    phone1Date: "",
    phone2Date: "",
    phoneNote: "",
    partialReason: "",
    partialWorkDone: "",
    materialsText: "",
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

function workDatesProblem(form: PackageForm) {
  const start = parseFormDate(form.workStart || form.workComplete || form.fieldDate);
  const complete = parseFormDate(form.workComplete || form.fieldDate);
  if (start && complete && start.getTime() > complete.getTime()) {
    return `Work start (${displayDate(form.workStart)}) is after work completion (${displayDate(form.workComplete || form.fieldDate)}). Fix the work dates before generating.`;
  }
  return "";
}

function noAccessDetailsProblem(form: PackageForm) {
  const attemptProblem = noAccessAttemptProblem(form.firstAttempt, form.secondAttempt);
  if (attemptProblem) return attemptProblem;
  if (form.tenantPhone && !form.phone1Date) return `Enter the date you called the tenant at ${form.tenantPhone} (item 4b).`;
  return "";
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

  const tenant = tenantContactInfo(job);

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
    tenantPhone: tenant.phone,
    phoneNote: tenant.phone ? "" : noTelephoneNote(tenant.accessType === "common_area", tenant.apartment),
    workStart: displayDate(actualStartAt),
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
    tenantPhone: current.tenantPhone || pulled.tenantPhone,
    phoneNote: current.phoneNote || pulled.phoneNote,
    description: isFallbackPackageDescription(current.description) ? pulled.description : current.description,
    notes: current.notes || pulled.notes,
  };
}

function workflowPatchFromQuery(params: URLSearchParams, outcome: PaperworkOutcome) {
  const status = String(params.get("fieldStatus") || "").trim().toUpperCase();
  const arrivedAt = String(params.get("arrivedAt") || "").trim();
  const visitStartedAt = String(params.get("visitStartedAt") || "").trim();
  const workStartedAt = String(params.get("workStartedAt") || "").trim();
  const workCompletedAt = String(params.get("workCompletedAt") || "").trim();
  const refusedAt = String(params.get("refusedAt") || "").trim();
  const noAccessAt = String(params.get("noAccessAt") || "").trim();
  const patch: Record<string, unknown> = {};

  if (arrivedAt) {
    patch.FieldArrivedAt = arrivedAt;
    patch.fieldArrivedAt = arrivedAt;
    patch.LastFieldVisitAt = arrivedAt;
    patch.lastFieldVisitAt = arrivedAt;
  }
  if (visitStartedAt) {
    patch.VisitStartedAt = visitStartedAt;
    patch.visitStartedAt = visitStartedAt;
  }
  if (workStartedAt) {
    patch.JobStartedAt = workStartedAt;
    patch.jobStartedAt = workStartedAt;
    patch.ActualWorkStartDate = workStartedAt;
    patch.actualWorkStartDate = workStartedAt;
  }

  if (status === "REFUSED_ACCESS" || outcome === "refused_access") {
    const iso = refusedAt || new Date().toISOString();
    return {
      ...patch,
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
    };
  }

  if (status === "NO_ACCESS_1_WAITING_72H" || outcome === "no_access") {
    const iso = noAccessAt || new Date().toISOString();
    return {
      ...patch,
      WorkflowStatus: "NO_ACCESS_1_WAITING_72H",
      workflowStatus: "NO_ACCESS_1_WAITING_72H",
      FieldOutcome: "NO_ACCESS_1_WAITING_72H",
      fieldOutcome: "NO_ACCESS_1_WAITING_72H",
      StatusOverride: "No Access 1st - Waiting 72h",
      status: "No Access 1st - Waiting 72h",
      NoAccessFirstAttemptAt: iso,
      noAccessFirstAttemptAt: iso,
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
    };
  }

  if (status === "WORK_COMPLETED" || outcome === "work_completed") {
    const iso = workCompletedAt || new Date().toISOString();
    return {
      ...patch,
      WorkflowStatus: "WORK_COMPLETED",
      workflowStatus: "WORK_COMPLETED",
      FieldOutcome: "WORK_COMPLETED",
      fieldOutcome: "WORK_COMPLETED",
      StatusOverride: "Work Completed",
      status: "Work Completed",
      ActualWorkCompletionDate: iso,
      actualWorkCompletionDate: iso,
      JobFinishedAt: iso,
      jobFinishedAt: iso,
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
    };
  }

  return patch;
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
  return statusEventDateForJob(job, outcome) || latestEvidenceCapturedAt(rows);
}

function formWithFieldEventDate(form: PackageForm, outcome: PaperworkOutcome, eventDate: string, job: JobRecord | null) {
  const fieldDate = displayDate(eventDate);
  if (!fieldDate) return form;

  const actualStartAt = jobText(job, ["ActualWorkStartDate", "actualWorkStartDate", "JobStartedAt", "jobStartedAt"]);
  const noAccessFirstAt = jobText(job, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt"]);
  const next: PackageForm = {
    ...form,
    invoiceDate: fieldDate,
    fieldDate: form.fieldDate || fieldDate,
  };

  if (outcome === "work_completed" || outcome === "partial_work_completed") {
    return {
      ...next,
      workStart: form.workStart || displayDate(actualStartAt),
      workComplete: form.workComplete || fieldDate,
    };
  }

  if (isNoWorkOutcome(outcome)) {
    return {
      ...next,
      firstAttempt: form.firstAttempt || displayDate(noAccessFirstAt) || fieldDate,
      secondAttempt: form.secondAttempt || fieldDate,
      workComplete: form.workComplete || fieldDate,
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
  if (length > 26) return 7.2;
  if (length > 20) return 7.8;
  if (length > 14) return 8.4;
  return 10;
}

const NO_WORK_MATERIALS: InvoiceMaterial[] = [{ name: "TRASH BAG", qty: "1" }];

// Partial work lists materials for the part that was done; full work reads the whole scope.
function packageMaterials(form: PackageForm, outcome: PaperworkOutcome): InvoiceMaterial[] {
  if (outcome !== "work_completed" && outcome !== "partial_work_completed") return NO_WORK_MATERIALS;
  if (form.materialsText.trim()) return materialsFromText(form.materialsText);
  return invoiceMaterials(outcome === "partial_work_completed" ? form.partialWorkDone : form.description);
}

function partialInvoiceDescription(form: PackageForm) {
  return `PARTIAL WORK COMPLETED:\n${upper(form.partialWorkDone.trim())}`;
}

const PARTIAL_REASON_PRESETS = [
  "ADDITIONAL WORK WAS NEEDED BEYOND THE ORIGINAL SCOPE",
  "CONTRACTOR WAS PREVENTED FROM COMPLETING THE WORK BY ANOTHER PERSON",
  "MATERIAL WAS ON BACKORDER / DELAYED",
  "LIMITED ACCESS PREVENTED COMPLETING ALL WORK",
  "TENANT REQUESTED WORK BE RESCHEDULED",
];

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
  const folder = media.kind === "general" && media.evidenceLabel === "Building exterior" ? "building" : fieldEvidenceKindClass(media.kind || "general");
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

async function renderPdfFirstPageImage(bytes: Uint8Array): Promise<{ imageUrl: string; imageUrls?: string[]; pageCount: number; error: string }> {
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
  const [queryWorkflowPatch, setQueryWorkflowPatch] = useState<Record<string, unknown>>({});
  const [loadedQuery, setLoadedQuery] = useState(false);
  const [autoGeneratePackage, setAutoGeneratePackage] = useState(false);
  const packageBusyRef = useRef(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageReviewed, setPackageReviewed] = useState(false);
  const [packageApproved, setPackageApproved] = useState(false);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  // Signer's saved signature (this device only); read by PDF generation.
  const signatureRef = useRef("");
  const rememberSignature = useCallback((dataUrl: string) => { signatureRef.current = dataUrl; }, []);
  // Notary's in-person approval: never saved, never reused across packages.
  const notaryRef = useRef<NotaryApproval | null>(null);
  const [notaryKey, setNotaryKey] = useState(0);
  const rememberNotary = useCallback((notary: NotaryApproval | null) => { notaryRef.current = notary; }, []);
  const [delivery, setDelivery] = useState<{ working: boolean; message: string; folderLink: string; emailed: boolean; error: string } | null>(null);
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
      packagePreview?.pdfPreviewImageUrls.slice(1).forEach((url) => URL.revokeObjectURL(url));
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
    }

    setSelectedId(job);
    setOutcome(nextOutcome);
    setQueryWorkflowPatch(workflowPatchFromQuery(params, nextOutcome));
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
    const jobWithQueryPatch = Object.keys(queryWorkflowPatch).length ? { ...job, ...queryWorkflowPatch } : job;
    const selectedOutcome =
      outcome === "pending"
        ? paperworkOutcomeFromJob(jobWithQueryPatch)
        : isNoWorkOutcome(outcome)
          ? savedOutcomeForPackage(jobWithQueryPatch, "no_work", outcome)
          : outcome;
    setOutcome(selectedOutcome);
    const nextForm = formFromJob(jobWithQueryPatch, selectedOutcome);
    setForm(includePackageSignature ? nextForm : { ...nextForm, signer: "" });
  }, [jobs, selectedId, includePackageSignature, queryWorkflowPatch]);

  const selectedJob = useMemo(() => {
    const job = findJob(jobs, selectedId);
    return job && Object.keys(queryWorkflowPatch).length ? { ...job, ...queryWorkflowPatch } : job;
  }, [jobs, selectedId, queryWorkflowPatch]);
  const selectedJobId = selectedJob ? getJobId(selectedJob) : "";
  const packageJobLoading = Boolean(selectedId && (!selectedJob || form.jobId !== selectedJobId));
  const canGeneratePackage = Boolean((form.jobId || selectedId) && outcome !== "pending" && !packageJobLoading && !packageBusy);
  const mapBackHref = selectedId ? `/map/?omo=${encodeURIComponent(selectedId)}&view=all&map=1` : "/map/?view=all&map=1";

  useEffect(() => {
    void googleStatus().then(setGoogle);
  }, []);

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
    setPackageReviewed(false);
    setPackageApproved(false);
    setPackagePreview(null);
    setDelivery(null);
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

  async function markPackageGenerated(jobId: string, approved = false, delivery?: { driveLink: string; emailed: boolean }) {
    if (!jobId) return "Package generated.";

    const generatedAt = new Date().toISOString();
    const emailNote = delivery?.emailed ? "Emailed" : "Not emailed";
    const approvedMessage = delivery ? `Reviewed and archived. Saved to Google Drive. ${emailNote}.` : "Reviewed and archived. Not emailed.";
    const patch = {
      ...(approved ? { ArchivedFromMap: true, archivedFromMap: true } : {}),
      ...(delivery ? { PackageDriveLink: delivery.driveLink, ...(delivery.emailed ? { PackageEmailedAt: generatedAt } : {}) } : {}),
      PackageReviewStatus: approved ? "Approved" : "Pending review",
      PackageGeneratedAt: generatedAt,
      packageGeneratedAt: generatedAt,
      PackageReadyMessage: approved ? approvedMessage : "Draft saved. Review affidavit, invoice and media before approval.",
      packageReadyMessage: approved ? approvedMessage : "Draft saved. Review affidavit, invoice and media before approval.",
    };

    saveLocalPackageOverride(jobId, patch);

    try {
      const response = await fetch(`${HPD_STATUS_WORKER_URL}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: jobId, patch }),
      });

      if (!response.ok) throw new Error(await response.text());
      return approved ? (delivery ? "Approved and archived." : "Approved and archived. Not emailed.") : "Draft saved for review. Not archived or emailed.";
    } catch (error) {
      console.error(error);
      return approved ? `Approved on this device; server sync needs retry.${delivery ? "" : " Not emailed."}` : "Draft saved on this device; server sync needs retry. Not archived or emailed.";
    }
  }

  async function generateAffidavitPdf(options: GeneratePdfOptions = {}): Promise<GeneratedPdfResult | null> {
    const downloadPdf = options.downloadPdf !== false;
    const markGenerated = options.markGenerated !== false;
    const activeForm = options.formOverride || form;
    const activeOutcome = options.outcomeOverride || outcome;
    const includeSignature = options.includeSignature !== false;
    const includeSignatureImage = includeSignature && options.signatureImage !== false;
    const printCopy = Boolean(options.printCopy);
    // The notary's stamp text and jurat date are filled whenever a notary approved this
    // package, independent of whether signature IMAGES are drawn. A print copy never has
    // signature pictures (signed in ink instead) and never waits on a digital notary approval
    // either -- the notary signs on paper, so the stamp always shows and the jurat date is
    // always today, the moment the print copy is generated.
    const notary = printCopy
      ? { signature: "", name: options.notary?.name || DEFAULT_NOTARY_NAME, date: todayIsoDate() }
      : options.notary || null;
    const includeNotaryImage = includeSignatureImage && notary;
    const useWorkTemplate = activeOutcome === "work_completed" || activeOutcome === "partial_work_completed";
    const awardDay = calendarDay(getJobDate(selectedJob, "award"));
    if (awardDay === null || awardDay < calendarDay("2026-08-28")!) {
      setPdfStatus(awardDay === null
        ? "Verify the job award date before generating an affidavit. Work dates cannot select the affidavit version."
        : "This award needs the pre-August 28, 2026 affidavit. Legacy field mapping is not yet verified; generation stopped to avoid using the wrong form.");
      return null;
    }
    const templateUrl = useWorkTemplate ? WORK_AFFIDAVIT_TEMPLATE : NO_WORK_AFFIDAVIT_TEMPLATE;
    const jobId = activeForm.jobId || selectedId || "HPD";
    const archiveJobId = activeForm.jobId || selectedId;
    const borough = activeForm.borough || (selectedJob ? getJobBorough(selectedJob) : "");
    const bidValue = amountNumber(activeForm.bidAmount || activeForm.amount);
    const chargeValue = amountNumber(activeForm.amount || activeForm.bidAmount);
    const bidAmount = pdfMoney(bidValue);
    const chargeAmount = pdfMoney(chargeValue);
    const changeAmount = pdfMoney(invoiceChangeAmount(bidValue, chargeValue), true);
    const fieldDate = activeForm.fieldDate || activeForm.workComplete || todayIsoDate();
    // Dates print as MM/DD/YY on HPD paperwork; the form state keeps ISO dates.
    const firstAttempt = displayDate(activeForm.firstAttempt || fieldDate);
    const secondAttempt = displayDate(activeForm.secondAttempt || fieldDate);
    const workStart = displayDate(activeForm.workStart || activeForm.workComplete || activeForm.fieldDate);
    const workComplete = displayDate(activeForm.workComplete || activeForm.fieldDate);
    const invoiceDate = useWorkTemplate ? workComplete || displayDate(fieldDate) : secondAttempt;
    const signer = includeSignature ? activeForm.signer || DEFAULT_PACKAGE_SIGNER : "";
    const locationText = upper(activeForm.location);
    const locationFontSize = pdfLocationFontSize(locationText);

    if (refusedAccessNeedsDescription(activeOutcome, activeForm)) {
      setPdfStatus(`Refused access needs section 7b description of the person. Enter what you observed, for example: ${REFUSED_ACCESS_DESCRIPTION_EXAMPLE}.`);
      return null;
    }

    const datesProblem = useWorkTemplate ? workDatesProblem(activeForm) : "";
    if (datesProblem) {
      setPdfStatus(datesProblem);
      return null;
    }

    if (activeOutcome === "partial_work_completed" && !activeForm.partialWorkDone.trim()) {
      setPdfStatus("Enter what partial work was completed. It prints as the invoice description.");
      return null;
    }

    if (activeOutcome === "partial_work_completed" && !activeForm.partialReason.trim()) {
      setPdfStatus("Enter why the work was only partially completed (item 6) before generating the package.");
      return null;
    }

    const noAccessProblem = activeOutcome === "no_access" ? noAccessDetailsProblem(activeForm) : "";
    if (noAccessProblem) {
      setPdfStatus(noAccessProblem);
      return null;
    }

    setPdfStatus(downloadPdf ? "Preparing affidavit PDF..." : "Preparing invoice/affidavit for package...");

    try {
      const affidavitResponse = await fetch(templateUrl, { cache: "no-store" });
      if (!affidavitResponse.ok) throw new Error(`Template returned HTTP ${affidavitResponse.status}`);

      const affidavitDoc = await PDFDocument.load(await affidavitResponse.arrayBuffer());
      const affidavitForm = affidavitDoc.getForm();
      const affidavitBoldFont = await affidavitDoc.embedFont(StandardFonts.HelveticaBold);

      // The invoice is drawn fresh (lib/invoice-pdf.ts); these collect its values by the old template field names.
      const invoiceValues: Record<string, string> = {};
      const invoiceChecks = new Set<string>();
      const setInvoiceText = (name: string, value: string, _fontSize?: number) => {
        invoiceValues[name] = value || "";
      };

      // One-line blanks print at one size and shrink only if the value would run past the line.
      const setAffidavitText = (name: string, value: string, fontSize = 10.5) => {
        try {
          const field = affidavitForm.getTextField(name);
          const text = value || "";
          const singleLine = field.acroField.getWidgets()[0].getRectangle().height < 20;
          if (singleLine) {
            field.disableMultiline();
            field.setFontSize(fitFontSize(affidavitForm, name, text, affidavitBoldFont, fontSize));
          } else {
            field.enableMultiline();
            field.setFontSize(fontSize);
          }
          field.setText(text);
        } catch {}
      };

      const check = (name: string) => {
        invoiceChecks.add(name);
      };

      const clearFieldBackground = (form: typeof affidavitForm, name: string) => {
        try {
          const widgets = form.getField(name).acroField.getWidgets();
          widgets.forEach((widget) => {
            const mk = widget.dict.lookup(PDFName.of("MK"));
            if (!mk || !("delete" in mk)) return;
            // Drop the border colour too: without a background, pdf-lib draws the template's black BC as a box.
            const appearance = mk as { delete: (key: ReturnType<typeof PDFName.of>) => void };
            appearance.delete(PDFName.of("BG"));
            appearance.delete(PDFName.of("BC"));
          });
        } catch {}
      };

      const widenField = (form: typeof affidavitForm, name: string, extraWidth: number) => {
        try {
          const widgets = form.getField(name).acroField.getWidgets();
          widgets.forEach((widget) => {
            const rect = widget.getRectangle();
            widget.setRectangle({ ...rect, width: rect.width + extraWidth });
          });
        } catch {}
      };

      const showUnderline = (form: typeof affidavitForm, name: string) => {
        clearFieldBackground(form, name);
        try {
          form.getTextField(name).disableMultiline();
        } catch {}
      };

      const adjustFieldRect = (form: typeof affidavitForm, name: string, delta: { dx?: number; dy?: number; dw?: number }) => {
        try {
          const widgets = form.getField(name).acroField.getWidgets();
          widgets.forEach((widget) => {
            const rect = widget.getRectangle();
            widget.setRectangle({
              x: rect.x + (delta.dx || 0),
              y: rect.y + (delta.dy || 0),
              width: rect.width + (delta.dw || 0),
              height: rect.height,
            });
          });
        } catch {}
      };

      // Largest font size (down to minSize) at which a single-line value fits its field.
      const fitFontSize = (form: typeof affidavitForm, name: string, value: string, font: typeof affidavitBoldFont, maxSize: number, minSize = 6) => {
        let width = 0;
        try {
          width = form.getField(name).acroField.getWidgets()[0].getRectangle().width - 4;
        } catch {
          return maxSize;
        }
        let size = maxSize;
        while (size > minSize && font.widthOfTextAtSize(value, size) > width) size -= 0.5;
        return size;
      };

      const clearMaterialRows = () => {
        for (let index = 1; index <= 12; index += 1) {
          setInvoiceText(`M${index}`, "");
          setInvoiceText(`Q${index}`, "");
        }
      };

      clearMaterialRows();
      packageMaterials(activeForm, activeOutcome).forEach((material, index) => {
        setInvoiceText(`M${index + 1}`, material.name);
        setInvoiceText(`Q${index + 1}`, material.qty);
      });
      setInvoiceText("OMO", jobId);
      setInvoiceText("TAX ID", "203444624");
      setInvoiceText("INVOICE #", activeForm.invoiceNo);
      setInvoiceText("TRADE", "GENERAL CONSTRUCTION");
      setInvoiceText("Boro", upper(borough), 10);
      setInvoiceText("Borough", upper(borough), 10);
      setInvoiceText("Apt #", locationText, locationFontSize);
      const invoiceAddress = upper(activeForm.address);
      setInvoiceText("Building Address", invoiceAddress);
      setInvoiceText("BID AMOUNT", bidAmount);
      setInvoiceText("INCREASE DECREASE AMOUNT", changeAmount);
      setInvoiceText("TOTAL CHARGE", chargeAmount);
      setInvoiceText("NAME Please Print", signer.toUpperCase());
      setInvoiceText("TITLE", signer ? "VP" : "");
      check("RC MINI NO");
      check("APPROVED INCREASE DECREASE NO");
      check("PERMIT REQUIRED NO");

      const deponentLine = `I, ${signer.toUpperCase()}`;

      widenField(affidavitForm, "Name of Contractor", 50);
      setAffidavitText("Name of Contractor", CONTRACTOR_NAME, 9);
      showUnderline(affidavitForm, "Name of Contractor");
      adjustFieldRect(affidavitForm, "OMO", { dy: 2 });
      setAffidavitText("OMO", jobId);
      setAffidavitText("OMO Header2", jobId);
      const fullBuildingAddress = [activeForm.address, activeForm.location, activeForm.borough ? `${activeForm.borough}, NY` : "NY"]
        .filter(Boolean)
        .join(", ");
      const affidavitAddress = upper(fullBuildingAddress);
      setAffidavitText("Building Address", affidavitAddress, fitFontSize(affidavitForm, "Building Address", affidavitAddress, affidavitBoldFont, 11));
      showUnderline(affidavitForm, "Building Address");
      setAffidavitText("State", "NEW YORK");
      setAffidavitText("County Of", "QUEENS");
      setAffidavitText("Type or Print Name", signer.toUpperCase());

      if (useWorkTemplate) {
        const workDate = activeForm.workComplete || fieldDate;
        setAffidavitText("Deponent Name", deponentLine);
        showUnderline(affidavitForm, "Deponent Name");
        setAffidavitText("Start Date", activeOutcome === "work_completed" ? workStart : "");
        showUnderline(affidavitForm, "Start Date");
        adjustFieldRect(affidavitForm, "Complete Date", { dx: -20, dy: 2.5 });
        setAffidavitText("Complete Date", activeOutcome === "work_completed" ? workComplete : "");
        showUnderline(affidavitForm, "Complete Date");
        setAffidavitText(
          "Partial Reason",
          activeOutcome === "partial_work_completed" ? upper(activeForm.partialReason) : "",
          9
        );
        showUnderline(affidavitForm, "Partial Reason");
        setAffidavitText("Partial Amount", activeOutcome === "partial_work_completed" ? chargeAmount : "");
        adjustFieldRect(affidavitForm, "Partial Reason", { dy: 4 });
        adjustFieldRect(affidavitForm, "Partial Amount", { dx: 3 });
        showUnderline(affidavitForm, "Partial Amount");
        const notaryDate = notary ? notaryDateParts(notary.date) : { day: "", month: "", year: "" };
        setAffidavitText("Notary Day Month", notary ? `${notaryDate.day} ${notaryDate.month}` : "");
        setAffidavitText("Notary Year", notary ? notaryDate.year : "");

        if (activeOutcome === "partial_work_completed") {
          setAffidavitText("Denied Name", upper(activeForm.deniedName));
          setAffidavitText("Denied Relationship", upper(activeForm.deniedRelationship));
          setAffidavitText("Denied Description", upper(activeForm.deniedDescription));
          setAffidavitText("Denied Actions", activeForm.deniedName ? upper(activeForm.partialReason) : "", 9);
        }

        setInvoiceText("START DATE", activeOutcome === "work_completed" ? workStart : "");
        setInvoiceText("COMPLETE DATE", activeOutcome === "work_completed" ? workComplete : "");
        setInvoiceText(
          "Work Description",
          activeOutcome === "partial_work_completed"
            ? partialInvoiceDescription(activeForm)
            : activeForm.description || activeForm.notes || "Work completed per HPD bid / work order."
        );
      } else {
        const noWorkReason = activeForm.affidavitReason || affidavitReasonForOutcome(activeOutcome);
        const isRefusedAccess = activeOutcome === "refused_access";
        // The form says to write "did not provide" for anything the person would not give.
        const deniedName = isRefusedAccess ? cleanRefusedName(activeForm.deniedName) || "DID NOT PROVIDE" : "";
        const deniedRelationship = isRefusedAccess ? activeForm.deniedRelationship || "SUPER" : "";
        const deniedDescription = isRefusedAccess ? activeForm.deniedDescription : "";
        const deniedPhone = isRefusedAccess ? activeForm.deniedPhone || "DID NOT PROVIDE" : "";

        setAffidavitText("Deponent Name", deponentLine);
        showUnderline(affidavitForm, "Deponent Name");
        setAffidavitText("Service Charge Amount", chargeAmount);
        showUnderline(affidavitForm, "Service Charge Amount");
        const notaryDateNoWork = notary ? notaryDateParts(notary.date) : { day: "", month: "", year: "" };
        setAffidavitText("Notary Day", notary ? notaryDateNoWork.day : "");
        setAffidavitText("Notary Month", notary ? notaryDateNoWork.month : "");
        setAffidavitText("Notary Year", notary ? notaryDateNoWork.year : "");

        if (activeOutcome === "no_access") {
          setAffidavitText("Inaccessible Reason", noWorkReason || "NO ACCESS TO MAKE REPAIRS", 9);
          setAffidavitText("Attempt1 Date", firstAttempt);
          setAffidavitText("Attempt2 Date", secondAttempt);
          if (activeForm.tenantPhone) {
            setAffidavitText("Phone1 Date", displayDate(activeForm.phone1Date));
            setAffidavitText("Phone2 Date", displayDate(activeForm.phone2Date));
          } else {
            // No number to call: the note spans the whole "___ and ___" line.
            const phoneNote = upper(activeForm.phoneNote || noTelephoneNote(false));
            widenField(affidavitForm, "Phone1 Date", 150);
            setAffidavitText("Phone1 Date", phoneNote, fitFontSize(affidavitForm, "Phone1 Date", phoneNote, affidavitBoldFont, 10.5));
            showUnderline(affidavitForm, "Phone1 Date");
            setAffidavitText("Phone2 Date", "");
          }
        }

        if (activeOutcome === "completed_by_others") {
          adjustFieldRect(affidavitForm, "WorkSite Date5", { dx: 14, dw: -14 });
          setAffidavitText("WorkSite Date5", secondAttempt);
        }

        if (isRefusedAccess) {
          setAffidavitText("Denied Date", secondAttempt);
          setAffidavitText("Denied Phone", deniedPhone);
          setAffidavitText("Denied Name", upper(deniedName));
          setAffidavitText("Denied Description", upper(deniedDescription));
          setAffidavitText("Denied Relationship", upper(deniedRelationship));
        }

        setInvoiceText("START DATE", activeOutcome === "no_access" ? firstAttempt : "");
        setInvoiceText("COMPLETE DATE", activeOutcome === "no_access" ? secondAttempt : "");
        setInvoiceText("Work Description", activeForm.description || noWorkReason, 12);
      }

      // The template's opaque white field backgrounds hide printed form text and lines next to the fields.
      affidavitForm.getFields().forEach((field) => clearFieldBackground(affidavitForm, field.getName()));

      affidavitForm.updateFieldAppearances(affidavitBoldFont);
      affidavitForm.flatten();


      // Signer's signature above the page 2 "Signature" line. The notary block is left for the notary.
      if (includeSignatureImage && signatureRef.current) {
        const signatureImage = await affidavitDoc.embedPng(signatureBytes(signatureRef.current));
        const box = useWorkTemplate ? { x: 398, y: 261, width: 150, height: 32 } : { x: 362, y: 347, width: 160, height: 40 };
        const scale = Math.min(box.width / signatureImage.width, box.height / signatureImage.height);
        affidavitDoc.getPages()[1]?.drawImage(signatureImage, { x: box.x, y: box.y, width: signatureImage.width * scale, height: signatureImage.height * scale });
      }

      // Notary's own in-person signature above the "Notary Public" line (email/Drive copy
      // only -- a print copy leaves this blank for wet ink), and the printed stamp text
      // centered below it, which is filled on BOTH copies since it's just typed info, not a
      // signature. The notary's name is not drawn next to "Notary Public" since it's already
      // the first line of the stamp.
      if (notary) {
        const box = useWorkTemplate ? { x: 36, y: 148, width: 146, height: 28 } : { x: 36, y: 197, width: 153, height: 28 };
        const page2 = affidavitDoc.getPages()[1];
        if (includeNotaryImage) {
          const notaryImage = await affidavitDoc.embedPng(signatureBytes(notary.signature));
          const scale = Math.min(box.width / notaryImage.width, box.height / notaryImage.height);
          page2?.drawImage(notaryImage, { x: box.x, y: box.y, width: notaryImage.width * scale, height: notaryImage.height * scale });
        }

        const stampSize = 7;
        const stampWidths = NOTARY_STAMP_LINES.map((line) => affidavitBoldFont.widthOfTextAtSize(line, stampSize));
        const stampCenterX = box.x + Math.max(...stampWidths) / 2;
        const stampTop = useWorkTemplate ? 104 : 142;
        NOTARY_STAMP_LINES.forEach((line, index) => {
          page2?.drawText(line, { x: stampCenterX - stampWidths[index] / 2, y: stampTop - index * 9, size: stampSize, font: affidavitBoldFont });
        });
      }

      // Flattened template widgets can leave dangling annotation references.
      for (const document of [affidavitDoc]) {
        for (const page of document.getPages()) {
          const annotations = page.node.Annots();
          if (!annotations) continue;
          for (let index = annotations.size() - 1; index >= 0; index -= 1) {
            if (!document.context.lookup(annotations.get(index))) annotations.remove(index);
          }
        }
      }

      // Invoice dates: work packages use the work dates; no-work packages use the attempt dates.
      const invoiceStart = useWorkTemplate ? workStart : activeOutcome === "no_access" ? firstAttempt : secondAttempt;
      const invoiceComplete = useWorkTemplate ? workComplete : secondAttempt;

      const pdfDoc = await PDFDocument.create();
      const affidavitPages = await pdfDoc.copyPages(affidavitDoc, affidavitDoc.getPageIndices());
      affidavitPages.forEach((page) => pdfDoc.addPage(page));
      await drawInvoicePage(pdfDoc, {
        omo: invoiceValues["OMO"],
        invoiceNo: invoiceValues["INVOICE #"],
        invoiceDate: invoiceDate,
        taxId: invoiceValues["TAX ID"],
        trade: invoiceValues["TRADE"],
        borough: invoiceValues["Borough"],
        address: invoiceValues["Building Address"],
        location: invoiceValues["Apt #"],
        dateStarted: invoiceStart,
        dateCompleted: invoiceComplete,
        permitRequired: !invoiceChecks.has("PERMIT REQUIRED NO"),
        approvedChange: !invoiceChecks.has("APPROVED INCREASE DECREASE NO"),
        rcMini: !invoiceChecks.has("RC MINI NO"),
        description: invoiceValues["Work Description"],
        materials: Array.from({ length: 12 }, (_, index) => ({ name: invoiceValues[`M${index + 1}`] || "", qty: invoiceValues[`Q${index + 1}`] || "" })).filter((row) => row.name),
        bidAmount: invoiceValues["BID AMOUNT"],
        changeAmount: invoiceValues["INCREASE DECREASE AMOUNT"],
        totalCharge: invoiceValues["TOTAL CHARGE"],
        signerName: invoiceValues["NAME Please Print"],
        title: invoiceValues["TITLE"],
        signature: includeSignatureImage && signatureRef.current ? signatureBytes(signatureRef.current) : undefined,
      });

      // Mark every page of the emailed/Drive copy as a reproduction, not the wet-ink original.
      if (!printCopy) {
        const watermarkFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        pdfDoc.getPages().forEach((page) => drawCenteredWatermark(page, COPY_WATERMARK_TEXT, watermarkFont, 90, 45));
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

  async function generateCompletePackage(includeMediaOverride = includePackageMedia, includeSignatureOverride = includePackageSignature, printCopy = false) {
    if (packageBusyRef.current) return;
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
    if (includeSignature && !printCopy && !signatureRef.current) {
      setPdfStatus("Add your signature first (Your Signature card above). Email packages are always signed; use Print Copy to sign in ink.");
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
      packageBusyRef.current = true;
      setPackageBusy(true);
      const evidenceRows = includeMedia ? await listFieldEvidence(jobId) : [];
      if (!evidenceRows.length && !allowPdfOnlyPackage) {
        setPdfStatus("No saved images or videos were found for this OMO on this device. Capture evidence first, then Generate Package.");
        return;
      }

      let includedMedia = await emailMediaCopies(evidenceRows.filter(mediaHasPackageBytes));
      const skippedMedia = evidenceRows.filter((media) => !mediaHasPackageBytes(media));
      if (skippedMedia.length) {
        setPdfStatus(`${skippedMedia.length} saved media file(s) are missing their original bytes. Package stopped. Restore or re-upload these files before generating the complete package.`);
        return;
      }
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
        signatureImage: !printCopy,
        notary: notaryRef.current,
        printCopy,
      });
      if (!pdf) return;
      // Fresh for every affidavit: never carry an approval into the next package.
      notaryRef.current = null;
      setNotaryKey((key) => key + 1);

      includedMedia = await fitEmailVideos(includedMedia, pdf.bytes.byteLength + 64_000 + includedMedia.length * 2048, setPdfStatus);

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
        label: media.evidenceLabel || (media.mediaType === "video" ? "Video evidence" : "Image evidence"),
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
      assertEmailPackageSize(zipBytes.byteLength);
      await saveFieldPacket({
        jobId: pdf.jobId,
        fileName: zipFileName,
        mimeType: "application/zip",
        dataUrl: bytesToDataUrl(zipBytes, "application/zip"),
        size: zipBytes.byteLength,
        evidenceCount: includedMedia.length,
        imageCount: imageMedia.length,
        videoCount: videoMedia.length,
        packetType: "full_evidence_zip",
        note: "Email copy under 18 MB ZIP budget; media compressed when needed, originals retained separately. Review labels, video/audio and paperwork before forwarding to HPD.",
      });
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
        pdfPreviewImageUrls: pdfPreview.imageUrls?.length ? pdfPreview.imageUrls : pdfPreview.imageUrl ? [pdfPreview.imageUrl] : [],
        pdfPreviewPageCount: pdfPreview.pageCount,
        pdfPreviewError: pdfPreview.error,
        videoPackageFileName,
        videoPackageSize,
        videoNames,
        videoLinks,
        skippedMediaCount: skippedMedia.length,
        note,
        printCopy,
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
    } finally {
      packageBusyRef.current = false;
      setPackageBusy(false);
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

  // Shared by the first send and "Send email again" so both emails match.
  function packageEmailParts(pending: PendingCompletePackage) {
    const statusLabel = packageStatusLabel(outcome);
    const address = [form.address, form.location, form.borough].filter(Boolean).join(", ");
    return {
      folderName: pending.folderName,
      files: pending.folderEntries.map((entry) => ({ name: entry.path.split("/").pop() || entry.path, mimeType: entry.mimeType, bytes: entry.bytes })),
      emailSubject: `${pending.jobId} - ${statusLabel} - ${form.address || "HPD package"}`,
      emailText: (folderLink: string, attachedPhotos: boolean) => [
        `HPD package: ${pending.jobId}`,
        `Outcome: ${statusLabel}`,
        `Address: ${address || "not listed"}`,
        `Total charge: ${form.amount || "$0.00"}`,
        "",
        `Google Drive folder: ${folderLink}`,
        "",
        attachedPhotos
          ? `Attached: affidavit/invoice PDF and ${pending.imageCount} photo(s).`
          : pending.imageCount
            ? "Attached: affidavit/invoice PDF. The photos were too large for one email and are in the Google Drive folder."
            : "Attached: affidavit/invoice PDF.",
        pending.videoCount ? `${pending.videoCount} video(s) are in the Google Drive folder.` : "",
      ].filter((line, index, lines) => line || lines[index - 1]).join("\n"),
    };
  }

  // Resend only the email (Drive already has the package), e.g. after reconnecting Google.
  async function retryPackageEmail() {
    const pending = pendingCompletePackageRef.current;
    const folderLink = delivery?.folderLink;
    if (!pending || !folderLink || packageBusyRef.current) return;
    packageBusyRef.current = true;
    setPackageBusy(true);
    setDelivery((current) => current && { ...current, working: true, message: "Sending email...", error: "" });
    try {
      setGoogle(await googleStatus());
      const result = await sendPackageEmail({ ...packageEmailParts(pending), folderLink });
      if (result.emailed) await markPackageGenerated(pending.jobId, true, { driveLink: folderLink, emailed: true });
      setDelivery({ working: false, folderLink, emailed: result.emailed, message: result.emailed ? `Emailed to ${result.emailTo.join(", ")}` : "", error: result.emailError });
    } catch (error) {
      setDelivery({ working: false, folderLink, emailed: false, message: "", error: error instanceof Error ? error.message : "The email could not be sent." });
    } finally {
      packageBusyRef.current = false;
      setPackageBusy(false);
    }
  }

  // Approve & Save: with Google connected, save the whole package to Drive and email the PDF and
  // photos, then record the approval. Without it, fall back to saving/sharing the files on the device.
  async function approveAndSavePackage() {
    const pending = pendingCompletePackageRef.current;
    if (!pending || packageBusyRef.current) return;
    const status = google || (await googleStatus());
    if (!status.connected) {
      if (canSaveRegularFolder()) await saveCompletePackageFolder();
      else await sendCompletePackage();
      if (packageApproved) return;
      setPackageBusy(true);
      try {
        setPdfStatus(`Approved. ${await markPackageGenerated(pending.jobId, true)}`);
        setPackageApproved(true);
      } catch (error) {
        setPdfStatus(error instanceof Error ? error.message : "Approval could not be saved.");
      } finally {
        setPackageBusy(false);
      }
      return;
    }

    packageBusyRef.current = true;
    setPackageBusy(true);
    setDelivery({ working: true, message: "Starting...", folderLink: "", emailed: false, error: "" });
    try {
      const result = await deliverPackage({
        ...packageEmailParts(pending),
        sendEmail: true,
        onProgress: (message) => setDelivery((current) => ({ ...(current || { folderLink: "", emailed: false, error: "" }), working: true, message })),
      });
      const archive = await markPackageGenerated(pending.jobId, true, { driveLink: result.folderLink, emailed: result.emailed });
      setPackageApproved(true);
      setDelivery({
        working: false,
        message: result.emailed ? `Emailed to ${result.emailTo.join(", ")}` : "",
        folderLink: result.folderLink,
        emailed: result.emailed,
        error: result.emailError,
      });
      setPdfStatus(`Approved. Saved ${result.uploaded} file(s) to Google Drive${result.emailed ? " and emailed" : ""}. ${archive}`);
    } catch (error) {
      setDelivery({ working: false, message: "", folderLink: "", emailed: false, error: error instanceof Error ? error.message : "Google Drive save failed." });
      setPdfStatus("Not approved yet: the package could not be saved to Google Drive. It is still on this device; try again.");
    } finally {
      packageBusyRef.current = false;
      setPackageBusy(false);
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

        .sig-card {
          gap: 10px;
        }

        .sig-preview {
          max-width: 100%;
          max-height: 90px;
          border-radius: 10px;
          background: #ffffff;
          padding: 8px 12px;
          justify-self: start;
        }

        .sig-pad {
          width: 100%;
          height: 160px;
          border-radius: 12px;
          background: #ffffff;
          touch-action: none;
          cursor: crosshair;
        }

        .sig-type {
          display: grid;
          gap: 6px;
          color: #ffffff;
          font-weight: 800;
        }

        .sig-type input {
          min-height: 50px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: #ffffff;
          color: #0b1f4d;
          padding: 0 12px;
          font-size: 18px;
        }

        .sig-type small {
          color: #c9d4e3;
          font-weight: 600;
        }

        .sig-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .sig-actions button {
          flex: 1 1 auto;
          min-height: 50px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .sig-actions .sig-primary {
          border-color: rgba(83, 230, 156, 0.7);
          background: rgba(83, 230, 156, 0.18);
          color: #caffdf;
        }

        .pkg-review {
          display: grid;
          gap: 14px;
        }

        .pkg-review-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .pkg-review-head h3 {
          margin: 4px 0 2px;
          color: #ffffff;
          font-size: 24px;
          line-height: 1.05;
        }

        .pkg-review-head p {
          margin: 0;
          color: #c9d4e3;
          font-size: 14px;
        }

        .pkg-review-status {
          display: inline-block;
          border-radius: 999px;
          padding: 4px 10px;
          background: rgba(255, 209, 102, 0.16);
          color: #ffe8a3;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .pkg-review-status.approved {
          background: rgba(83, 230, 156, 0.18);
          color: #caffdf;
        }

        .pkg-edit {
          min-height: 40px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 10px;
          background: transparent;
          color: #ffffff;
          padding: 0 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .pkg-pages {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: 86%;
          gap: 10px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding-bottom: 4px;
        }

        .pkg-page {
          scroll-snap-align: start;
          display: grid;
          gap: 6px;
          border: 0;
          padding: 0;
          background: transparent;
          cursor: zoom-in;
          text-align: left;
        }

        .pkg-page img {
          width: 100%;
          height: auto;
          border-radius: 6px;
          background: #ffffff;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .pkg-page span {
          color: #c9d4e3;
          font-size: 12px;
          font-weight: 800;
        }

        .pkg-page-missing {
          display: grid;
          gap: 8px;
          border: 1px dashed rgba(255, 255, 255, 0.3);
          border-radius: 10px;
          padding: 14px;
          color: #ffffff;
        }

        .pkg-page-missing a {
          color: #8fd3ff;
          font-weight: 800;
        }

        .pkg-photos {
          display: grid;
          gap: 8px;
          color: #ffffff;
        }

        .pkg-photos small {
          color: #c9d4e3;
        }

        .pkg-photo-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .pkg-photo-grid figure {
          margin: 0;
          display: grid;
          gap: 4px;
        }

        .pkg-photo-grid img {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border-radius: 8px;
        }

        .pkg-photo-grid figcaption {
          color: #c9d4e3;
          font-size: 11px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .pkg-confirm {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ffffff;
          font-weight: 800;
        }

        .pkg-confirm input {
          width: 22px;
          height: 22px;
        }

        .pkg-approve:disabled {
          opacity: 0.45;
        }

        .pkg-delivery {
          display: grid;
          gap: 8px;
          border: 1px solid rgba(83, 230, 156, 0.4);
          border-radius: 12px;
          padding: 12px;
          color: #caffdf;
          font-weight: 800;
        }

        .pkg-delivery.has-error {
          border-color: rgba(255, 209, 102, 0.5);
          color: #ffe8a3;
        }

        .pkg-delivery a {
          display: block;
          border-radius: 10px;
          padding: 12px;
          background: #ffffff;
          color: #0b1b33;
          text-align: center;
          font-weight: 900;
          text-decoration: none;
        }

        .pkg-retry-email {
          min-height: 52px;
          border: 1px solid rgba(255, 209, 102, 0.6);
          border-radius: 12px;
          background: rgba(255, 209, 102, 0.14);
          color: #ffe8a3;
          font-size: 16px;
          font-weight: 900;
          cursor: pointer;
        }

        .pkg-google-note {
          color: #c9d4e3;
        }

        .pkg-google-note a {
          color: #8fd3ff;
          font-weight: 800;
        }

        .pkg-more summary {
          color: #c9d4e3;
          font-weight: 800;
          cursor: pointer;
        }

        .pkg-more-body {
          display: grid;
          gap: 10px;
          margin-top: 10px;
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

      <section className="paperwork-wrap" data-hpd-smoke="paperwork-package-page">
        <header className="paperwork-top">
          <div>
            <p>Field paperwork</p>
            <h1>Invoice + Affidavit Package</h1>
            <p>Select the job, choose one package type, then generate the invoice package.</p>
          </div>
          <nav className="paperwork-nav" aria-label="Paperwork actions">
            <a data-hpd-smoke="paperwork-map-link" href={mapBackHref}>Map</a>
            <a data-hpd-smoke="paperwork-archive-link" href="/outputs">Archive</a>
          </nav>
        </header>

        <section className="paperwork-card" data-hpd-smoke="paperwork-package-card">
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
            <select data-hpd-smoke="paperwork-job-select" value={selectedId} onChange={(event) => chooseJob(event.target.value)}>
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

          <div className="paperwork-package-actions" data-hpd-smoke="paperwork-package-type" aria-label="Package type">
            <button
              className={`package-choice ${outcome === "work_completed" || outcome === "partial_work_completed" ? "active" : ""}`}
              data-hpd-smoke="paperwork-type-work"
              type="button"
              onClick={() => choosePackage("work")}
            >
              <strong>Work Completed</strong>
              <span>Uses ITB description and work-completed affidavit.</span>
            </button>
            <button
              className={`package-choice no-work ${isNoWorkOutcome(outcome) ? "active" : ""}`}
              data-hpd-smoke="paperwork-type-no-work"
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
              <div className="paperwork-grid">
                <label className="paperwork-field">
                  Name Given (7a)
                  <input value={form.deniedName} onChange={(event) => update("deniedName", event.target.value)} placeholder="DID NOT PROVIDE" />
                </label>
                <label className="paperwork-field">
                  Relationship (7a)
                  <input value={form.deniedRelationship} onChange={(event) => update("deniedRelationship", event.target.value)} placeholder="SUPER" />
                </label>
              </div>
              <label className="paperwork-field">
                Their Telephone (7b)
                <input value={form.deniedPhone} onChange={(event) => update("deniedPhone", event.target.value)} placeholder="DID NOT PROVIDE" />
              </label>
            </div>
          ) : null}

          {outcome === "work_completed" || outcome === "partial_work_completed" ? (
            <div
              className={`refused-access-required package-charge-card ${workDatesProblem(form) || (outcome === "partial_work_completed" && (!form.partialReason.trim() || !form.partialWorkDone.trim())) ? "needs-description" : "ready"}`}
              data-hpd-smoke="paperwork-charge-card"
            >
              <div>
                <span>{outcome === "partial_work_completed" ? "Partial Work Charge" : "Work Completed Charge"}</span>
                <strong>Charge and work dates</strong>
                <small>Bid amount {form.bidAmount || "not listed"}. Change the charge if it differs from the bid.</small>
              </div>
              <label className="paperwork-field">
                Charge Amount
                <input
                  data-hpd-smoke="paperwork-charge-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => update("amount", event.target.value)}
                  placeholder={form.bidAmount || "$0.00"}
                />
              </label>
              <div className="paperwork-grid">
                <label className="paperwork-field">
                  Work Started
                  <input
                    type="date"
                    data-hpd-smoke="paperwork-work-start"
                    value={dateInputValue(form.workStart || form.workComplete)}
                    onChange={(event) => update("workStart", displayDate(event.target.value))}
                  />
                </label>
                <label className="paperwork-field">
                  Work Completed
                  <input
                    type="date"
                    data-hpd-smoke="paperwork-work-complete"
                    value={dateInputValue(form.workComplete || form.fieldDate)}
                    onChange={(event) => update("workComplete", displayDate(event.target.value))}
                  />
                </label>
              </div>
              {workDatesProblem(form) ? <small data-hpd-smoke="paperwork-work-dates-status">{workDatesProblem(form)}</small> : null}
              {outcome === "partial_work_completed" ? (
                <label className="paperwork-field">
                  What work was completed? (invoice description)
                  <textarea
                    data-hpd-smoke="paperwork-partial-done"
                    value={form.partialWorkDone}
                    onChange={(event) => update("partialWorkDone", event.target.value)}
                    placeholder="Example: INSTALLED 3 SELF CLOSING HINGES AT APT 1B ENTRANCE DOOR"
                  />
                </label>
              ) : null}
              <label className="paperwork-field">
                Invoice materials - one per line, quantity first
                <textarea
                  data-hpd-smoke="paperwork-materials"
                  rows={8}
                  value={form.materialsText || materialsToText(packageMaterials(form, outcome))}
                  onChange={(event) => update("materialsText", event.target.value)}
                />
                <small>Filled from the {outcome === "partial_work_completed" ? "work completed" : "job scope"}. Edit, add or remove lines; max 12.</small>
                {form.materialsText ? (
                  <button type="button" className="refused-description-default" onClick={() => update("materialsText", "")}>
                    Rebuild From Scope
                  </button>
                ) : null}
              </label>
              {outcome === "partial_work_completed" ? (
                <label className="paperwork-field">
                  Why was the work only partially completed? (item 6)
                  <select
                    data-hpd-smoke="paperwork-partial-reason-preset"
                    value=""
                    onChange={(event) => {
                      if (event.target.value) update("partialReason", event.target.value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">Pick a common reason...</option>
                    {PARTIAL_REASON_PRESETS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                  <textarea
                    data-hpd-smoke="paperwork-partial-reason"
                    value={form.partialReason}
                    onChange={(event) => update("partialReason", event.target.value)}
                    placeholder="Example: ADDITIONAL WORK WAS NEEDED"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {outcome === "no_access" ? (() => {
            const problem = noAccessDetailsProblem(form);
            return (
              <div className={`refused-access-required no-access-card ${problem ? "needs-description" : "ready"}`} data-hpd-smoke="paperwork-no-access-card">
                <div>
                  <span>No Access - Items 4a and 4b</span>
                  <strong>{problem ? "Attempt details needed" : "Attempt details ready"}</strong>
                  <small data-hpd-smoke="paperwork-no-access-status">{problem || "Attempts are at least 72 hours apart."}</small>
                </div>
                <div className="paperwork-grid">
                  <label className="paperwork-field">
                    1st Attempt
                    <input
                      type="date"
                      data-hpd-smoke="paperwork-attempt-1"
                      value={dateInputValue(form.firstAttempt)}
                      onChange={(event) => update("firstAttempt", displayDate(event.target.value))}
                    />
                  </label>
                  <label className="paperwork-field">
                    2nd Attempt (72+ hrs later)
                    <input
                      type="date"
                      data-hpd-smoke="paperwork-attempt-2"
                      value={dateInputValue(form.secondAttempt)}
                      onChange={(event) => update("secondAttempt", displayDate(event.target.value))}
                    />
                  </label>
                </div>
                {form.tenantPhone ? (
                  <>
                    <small>Tenant phone {form.tenantPhone}. Enter the dates you called.</small>
                    <div className="paperwork-grid">
                      <label className="paperwork-field">
                        1st Call
                        <input
                          type="date"
                          data-hpd-smoke="paperwork-call-1"
                          value={dateInputValue(form.phone1Date)}
                          onChange={(event) => update("phone1Date", displayDate(event.target.value))}
                        />
                      </label>
                      <label className="paperwork-field">
                        2nd Call
                        <input
                          type="date"
                          data-hpd-smoke="paperwork-call-2"
                          value={dateInputValue(form.phone2Date)}
                          onChange={(event) => update("phone2Date", displayDate(event.target.value))}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <label className="paperwork-field">
                    No phone number - prints on item 4b
                    <input
                      data-hpd-smoke="paperwork-phone-note"
                      value={form.phoneNote}
                      onChange={(event) => update("phoneNote", event.target.value)}
                      placeholder={noTelephoneNote(true)}
                    />
                  </label>
                )}
              </div>
            );
          })() : null}

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

          {!packagePreview ? <SignatureCard signer={form.signer} onChange={rememberSignature} /> : null}

          {!packagePreview ? (
            <NotaryCard
              key={notaryKey}
              minDate={
                (outcome === "work_completed" || outcome === "partial_work_completed"
                  ? dateInputValue(form.workComplete || form.fieldDate)
                  : dateInputValue(form.secondAttempt || form.fieldDate)) || todayIsoDate()
              }
              defaultName={DEFAULT_NOTARY_NAME}
              onApprove={rememberNotary}
            />
          ) : null}

          {!packagePreview ? (
            <div className="paperwork-generate-choice" data-hpd-smoke="paperwork-generate-choice" aria-label="Package media choice">
              <button className="paperwork-print" data-hpd-smoke="paperwork-generate-full-package" type="button" onClick={() => generateCompletePackage(true)} disabled={!canGeneratePackage}>
                {packageJobLoading ? "Loading Job Data..." : "Generate Email Package"}
              </button>
              <button className="paperwork-secondary paperwork-pdf-only" data-hpd-smoke="paperwork-generate-pdf-only" type="button" onClick={() => generateCompletePackage(false)} disabled={!canGeneratePackage}>
                Affidavit + Invoice Only
              </button>
              <button className="paperwork-secondary paperwork-pdf-only" data-hpd-smoke="paperwork-generate-print" type="button" onClick={() => generateCompletePackage(false, true, true)} disabled={!canGeneratePackage}>
                Print Copy (sign in ink + notary)
              </button>
              <small>{packageJobLoading ? "Loading COA address and ITB page 3 description before package creation." : "Email ZIP limit: 18 MB. Saved media stays unchanged."}</small>
            </div>
          ) : null}
          {packagePreview ? (
            <div className="paperwork-package-review pkg-review" data-hpd-smoke="paperwork-package-review">
              <div className="pkg-review-head">
                <div>
                  <span className={`pkg-review-status ${packageApproved ? "approved" : ""}`}>{packageApproved ? "Approved & saved" : "Review before approving"}</span>
                  <h3>{packagePreview.jobId}</h3>
                  <p>{packageStatusLabel(outcome)} · Total {form.amount || "$0.00"}</p>
                </div>
                <button type="button" className="pkg-edit" data-hpd-smoke="paperwork-package-edit" onClick={clearPackagePreview}>
                  Edit
                </button>
              </div>

              <div className="pkg-pages" data-hpd-smoke="paperwork-package-pages" aria-label="PDF pages">
                {packagePreview.pdfPreviewImageUrls.length ? (
                  packagePreview.pdfPreviewImageUrls.map((url, index) => (
                    <button type="button" className="pkg-page" key={url} onClick={() => setFullScreenPdfOpen(true)}>
                      <img src={url} alt={`${packagePreview.jobId} page ${index + 1}`} />
                      <span>
                        {index === packagePreview.pdfPreviewImageUrls.length - 1 ? "Invoice" : `Affidavit page ${index + 1}`}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="pkg-page-missing">
                    <strong>Preview not available on this device</strong>
                    <a href={packagePreview.pdfUrl} download={packagePreview.pdfFileName}>Open the PDF to review it</a>
                  </div>
                )}
              </div>

              <div className="pkg-photos" data-hpd-smoke="paperwork-package-photos">
                <strong>
                  Photos in package · {packagePreview.imageCount}
                  {packagePreview.videoCount ? ` · ${packagePreview.videoCount} video(s)` : ""}
                </strong>
                {packagePreview.folderLinks.some((link) => link.section === "image") ? (
                  <div className="pkg-photo-grid">
                    {packagePreview.folderLinks
                      .filter((link) => link.section === "image")
                      .map((link) => (
                        <figure key={link.path}>
                          <img src={link.url} alt={link.label || link.name} />
                          <figcaption>{link.label || link.name}</figcaption>
                        </figure>
                      ))}
                  </div>
                ) : (
                  <small>No photos saved for this OMO on this device.</small>
                )}
              </div>

              {packagePreview.printCopy ? (
                <div className="pkg-print-only" data-hpd-smoke="paperwork-package-print-only">
                  <small>
                    Print copy: no digital signature, kept off Google Drive and out of the email package. Download it,
                    print it, and sign/stamp in ink with your notary.
                  </small>
                  <a
                    className="paperwork-print pkg-approve"
                    data-hpd-smoke="paperwork-download-print-copy"
                    href={packagePreview.pdfUrl}
                    download={packagePreview.pdfFileName}
                  >
                    Download PDF for printing
                  </a>
                </div>
              ) : (
                <>
                  <label className="pkg-confirm">
                    <input type="checkbox" checked={packageReviewed} disabled={packageBusy || packageApproved} onChange={(event) => setPackageReviewed(event.target.checked)} />
                    I checked every page and photo.
                  </label>
                  <button
                    type="button"
                    className="paperwork-print pkg-approve"
                    data-hpd-smoke="paperwork-approve-save"
                    disabled={(!packageReviewed && !packageApproved) || packageBusy || Boolean(packageApproved && delivery?.folderLink)}
                    onClick={approveAndSavePackage}
                  >
                    {delivery?.working
                      ? delivery.message
                      : packageApproved
                        ? google?.connected ? "Saved" : "Save Copy Again"
                        : google?.connected ? "Approve, Email & Save to Drive" : "Approve & Save"}
                  </button>
                </>
              )}
              {!packagePreview.printCopy && delivery && !delivery.working ? (
                <div className={`pkg-delivery ${delivery.error ? "has-error" : ""}`} data-hpd-smoke="paperwork-delivery">
                  {delivery.folderLink ? (
                    <a href={delivery.folderLink} target="_blank" rel="noopener noreferrer" data-hpd-smoke="paperwork-drive-link">
                      Open package in Google Drive
                    </a>
                  ) : null}
                  {delivery.emailed ? <span>✓ {delivery.message}</span> : null}
                  {delivery.error ? <span>{delivery.error}</span> : null}
                  {delivery.folderLink && !delivery.emailed ? (
                    <button type="button" className="pkg-retry-email" data-hpd-smoke="paperwork-retry-email" disabled={packageBusy} onClick={retryPackageEmail}>
                      Send email again
                    </button>
                  ) : null}
                </div>
              ) : null}
              {google && !google.connected ? (
                <small className="pkg-google-note">
                  To email the package and save it to Google Drive automatically, <a href="/storage/">connect Google</a> on the main app.
                </small>
              ) : google?.connected && !google.canEmail ? (
                <small className="pkg-google-note">
                  Drive is connected. To also email packages, <a href="/storage/">reconnect Google</a> and allow sending email.
                </small>
              ) : null}

              <details className="pkg-more" data-hpd-smoke="paperwork-package-more">
                <summary>More options</summary>
                <div className="pkg-more-body">
                  <div className="package-delivery-actions">
                    <a data-hpd-smoke="paperwork-save-pdf" href={packagePreview.pdfUrl} download={packagePreview.pdfFileName}>
                      Save PDF only
                    </a>
                    <button type="button" data-hpd-smoke="paperwork-share-files" onClick={sendCompletePackage}>
                      Share Files
                    </button>
                    <button type="button" data-hpd-smoke="paperwork-save-folder" onClick={saveCompletePackageFolder}>
                      Save Folder
                    </button>
                    <button type="button" data-hpd-smoke="paperwork-download-files" onClick={downloadCompletePackageFiles}>
                      Download Files
                    </button>
                    <a data-hpd-smoke="paperwork-save-zip" href={packagePreview.zipUrl} download={packagePreview.zipFileName}>
                      Save ZIP
                    </a>
                    {packagePreview.videoPackageFileName ? (
                      <button type="button" data-hpd-smoke="paperwork-share-video" onClick={sendVideoPackage}>
                        Share Video Files
                      </button>
                    ) : null}
                  </div>
                  {packagePreview.videoLinks.map((video, index) => (
                    <div className="package-video-item" key={`${video.name}-${index}`}>
                      <video src={video.url} controls preload="metadata" playsInline />
                      <small>{video.name}</small>
                    </div>
                  ))}
                  <div className="package-folder-list" data-hpd-smoke="paperwork-folder-contents" aria-label="Folder contents">
                    {packagePreview.folderLinks.map((link) => (
                      <a href={link.url} download={link.name} key={link.path} className={`package-folder-file folder-file-${link.section}`}>
                        <span>{link.path}</span>
                        <b>{packetSizeLabel(link.size)}</b>
                      </a>
                    ))}
                  </div>
                  {packagePreview.skippedMediaCount ? (
                    <small>{packagePreview.skippedMediaCount} media item(s) were listed in the manifest as not included.</small>
                  ) : null}
                </div>
              </details>
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
                <button className="fullscreen-pdf-close" data-hpd-smoke="paperwork-full-screen-close" type="button" onClick={() => setFullScreenPdfOpen(false)}>
                  Close
                </button>
              </div>
              <div className="fullscreen-pdf-body">
                {packagePreview.pdfPreviewImageUrls.length ? (
                  packagePreview.pdfPreviewImageUrls.map((url, index) => (
                    <img key={url} src={url} alt={`${packagePreview.jobId} generated PDF page ${index + 1}`} />
                  ))
                ) : (
                  <div className="fullscreen-pdf-fallback">
                    <strong>PDF created</strong>
                    <span>The PDF preview image could not render cleanly, so the app is hiding the browser PDF object instead of showing an annotation error.</span>
                    <a data-hpd-smoke="paperwork-full-screen-save-pdf" href={packagePreview.pdfUrl} download={packagePreview.pdfFileName}>
                      Save PDF
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <section className="paperwork-preview" hidden={Boolean(packagePreview)}>
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
