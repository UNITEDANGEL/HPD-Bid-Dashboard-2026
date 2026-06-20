"use client";
const HPD_STATUS_WORKER_URL = "https://hpd-status-worker.uac525.workers.dev";


import * as JobStatus from "../../lib/jobs/status";
import {
  type FieldEvidenceMeta,
  type FieldMediaCounts,
  type FieldMediaKind,
  canStoreFieldPhotos,
  countFieldPhotos,
  saveFieldPhotos,
} from "../../lib/field-photo-store";
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
  const markerLayerRef = useRef<any>(null);
  const userLocationMarkerRef = useRef<any>(null);
  const userLocationAccuracyRef = useRef<any>(null);
  const geolocationWatchRef = useRef<number | null>(null);
  const fieldPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [mappedJobs, setMappedJobs] = useState<MappedJob[]>([]);
  const [selected, setSelected] = useState<MappedJob | null>(null);
  const selectedCardRef = useRef<HTMLDivElement | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
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
const [photoCaptureTarget, setPhotoCaptureTarget] = useState<{
  jobKey: string;
  kind: FieldMediaKind;
  meta: FieldEvidenceMeta;
} | null>(null);
const [fieldPhotoCounts, setFieldPhotoCounts] = useState<Record<string, FieldMediaCounts>>({});
const [fieldCaptureAccept, setFieldCaptureAccept] = useState("image/*,video/*");
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

const [maturityFilter, setMaturityFilter] = useState<"all" | "od0_30" | "od31_60" | "od61_90" | "od90plus">("all");
const [customMaturityMin, setCustomMaturityMin] = useState("");
const [customMaturityMax, setCustomMaturityMax] = useState("");
  const [fullMap, setFullMap] = useState(false);


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

    const maturityFiltered =
      maturityFilter === "all"
        ? rows
        : rows.filter((job) => overdueBucket(job) === maturityFilter);

    if (!needle) return maturityFiltered;

    return maturityFiltered.filter((job) =>
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
  }, [jobs, mappedJobs, search, maturityFilter]);

  const plottedCount = mappedJobs.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;

  const bucketCounts = useMemo(() => {
    const rows = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" } : { ...job };
        });

    return rows.reduce(
      (
        acc: { all: number; od0_30: number; od31_60: number; od61_90: number; od90plus: number },
        job: MappedJob
      ) => {
        const bucket = overdueBucket(job);
        acc.all += 1;
        if (bucket === "od0_30") acc.od0_30 += 1;
        if (bucket === "od31_60") acc.od31_60 += 1;
        if (bucket === "od61_90") acc.od61_90 += 1;
        if (bucket === "od90plus") acc.od90plus += 1;
        return acc;
      },
      { all: 0, od0_30: 0, od31_60: 0, od61_90: 0, od90plus: 0 }
    );
  }, [jobs, mappedJobs]);

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
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        }).setView([40.7128, -74.006], 10);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

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
        markerLayerRef.current = null;
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
          setFullMap(false);
          setDrawerOpen(true);

          setTimeout(() => {
            mapRef.current?.panTo([Number(job._lat), Number(job._lng)], {
              animate: true,
              duration: 0.55,
            });
          }, 40);

          setTimeout(() => {
            document.querySelector(".selected-card")?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }, 160);
        });

        marker.bindPopup(`
          <div style="min-width:210px">
            <strong>${jobKey(job, index)}</strong><br/>
            ${displayAddress(job)}<br/>
            ${job.borough || ""} ${job.trade ? "· " + job.trade : ""}<br/>
            ${JobStatus.statusLabel(job)} ${money(job) ? "· " + money(job) : ""}<br/>Award: ${maturityInfo(job).award}<br/>Counter Start: ${maturityInfo(job).maturity}<br/>Counter: ${jobCounterLabel(job)}
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
            html: '<div class="user-location-dot"><span></span></div>',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
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

      if (followMyLocation) {
        map.setView(latLng, Math.max(map.getZoom(), 15), { animate: true });
      }
    }

    drawUserLocation();
    return () => {
      cancelled = true;
    };
  }, [mapReady, userLocation, followMyLocation]);

  useEffect(() => {
    return () => {
      if (typeof navigator !== "undefined" && geolocationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const key = selected ? jobKey(selected) : "";
    if (!key || !canStoreFieldPhotos()) return;
    let cancelled = false;
    countFieldPhotos(key)
      .then((counts) => {
        if (!cancelled) {
          setFieldPhotoCounts((current) => ({ ...current, [key]: counts }));
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

    workflowServerSave(key, nextPatch)
      .then(() => showActionNotice(notice))
      .catch((error) => {
        console.error(error);
        showActionNotice("Saved on this phone. Server sync needs retry.");
      });
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

  function fieldEvidenceMeta(job: MappedJob, kind: FieldMediaKind): FieldEvidenceMeta {
    return {
      jobId: jobKey(job),
      address: displayAddress(job),
      location: displayLocation(job),
      borough: job.borough || "",
      outcome: workflowLabel(job) || JobStatus.statusLabel(job),
      label: fieldEvidenceLabel(kind),
    };
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

  function requestFieldPhotoCapture(job: MappedJob, kind: FieldMediaKind, accept = "image/*,video/*") {
    const key = jobKey(job);
    if (!key) return;
    if (!canStoreFieldPhotos()) {
      showActionNotice("Evidence storage is not available in this browser.");
      return;
    }

    setFieldCaptureAccept(accept);
    setPhotoCaptureTarget({ jobKey: key, kind, meta: fieldEvidenceMeta(job, kind) });
    window.setTimeout(() => {
      if (fieldPhotoInputRef.current) {
        fieldPhotoInputRef.current.value = "";
        fieldPhotoInputRef.current.click();
      }
    }, 80);
  }

  async function handleFieldPhotoInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    const target = photoCaptureTarget;
    if (!files?.length || !target) return;

    try {
      const saved = await saveFieldPhotos(target.jobKey, target.kind, files, target.meta);
      const counts = await countFieldPhotos(target.jobKey);
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
      workflowStorageSave(target.jobKey, { ...patch, updatedAt: capturedAt });
      applyWorkflowPatchToState(target.jobKey, { ...patch, updatedAt: capturedAt });
      workflowServerSave(target.jobKey, { ...patch, updatedAt: capturedAt }).catch((error) => {
        console.error(error);
      });
      const videoCount = saved.filter((item) => item.mediaType === "video").length;
      const imageCount = saved.length - videoCount;
      showActionNotice(`${imageCount} image(s), ${videoCount} video(s) saved for package.`);
    } catch (error) {
      console.error(error);
      showActionNotice(error instanceof Error ? error.message : "Evidence save failed. Try again.");
    } finally {
      setPhotoCaptureTarget(null);
      event.target.value = "";
    }
  }

  function startFieldJob(job: MappedJob) {
    const iso = new Date().toISOString();
    const takeBefore = window.confirm("Start this job now? Press OK to capture BEFORE images/videos.");
    saveFieldWorkflowPatch(
      job,
      {
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
        BeforePhotosRequestedAt: takeBefore ? iso : "",
        beforePhotosRequestedAt: takeBefore ? iso : "",
        ArchivedFromMap: false,
      },
      "Job started. Work timer is running."
    );
    if (takeBefore) requestFieldPhotoCapture(job, "before", "image/*,video/*");
  }

  function finishFieldJob(job: MappedJob, partial = false) {
    const iso = new Date().toISOString();
    const takeAfter = window.confirm(`${partial ? "Mark partial work complete" : "Mark work complete"}? Press OK to capture AFTER images/videos.`);
    saveFieldWorkflowPatch(
      job,
      {
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
        AfterPhotosRequestedAt: takeAfter ? iso : "",
        afterPhotosRequestedAt: takeAfter ? iso : "",
        ArchivedFromMap: false,
      },
      "Work completed. Generate package when photos are ready."
    );
    if (takeAfter) requestFieldPhotoCapture(job, "after", "image/*,video/*");
  }

  function startNoAccessCounter(job: MappedJob) {
    const when = new Date();
    const iso = when.toISOString();
    const available = new Date(when);
    available.setHours(available.getHours() + 72);
    const takeEvidence = window.confirm("No access? Press OK to capture evidence image/video now.");

    saveFieldWorkflowPatch(
      job,
      {
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
      },
      "No access saved. 72-hour revisit counter started."
    );
    setWorkflowViewFilter("waiting72");
    if (takeEvidence) requestFieldPhotoCapture(job, "no_access", "image/*,video/*");
  }

  function markRefusedAccess(job: MappedJob) {
    const iso = new Date().toISOString();
    const takeEvidence = window.confirm("Refused access? Press OK to capture evidence image/video now.");
    saveFieldWorkflowPatch(
      job,
      {
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
      },
      "Refused access saved. Evidence can be added to package."
    );
    if (takeEvidence) requestFieldPhotoCapture(job, "refused_access", "image/*,video/*");
  }

  function markCompletedByOthers(job: MappedJob) {
    const iso = new Date().toISOString();
    const takeEvidence = window.confirm("Completed by others? Press OK to capture evidence image/video now.");
    saveFieldWorkflowPatch(
      job,
      {
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
      },
      "Completed by others saved. Evidence can be added to package."
    );
    if (takeEvidence) requestFieldPhotoCapture(job, "completed_by_others", "image/*,video/*");
  }

  function startLocationTracking() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("Location unavailable");
      showActionNotice("Location is not available in this browser.");
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 12000,
    };

    const onPosition = (position: GeolocationPosition) => {
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: new Date().toISOString(),
      });
      setLocationStatus(`You are on map · ±${Math.round((position.coords.accuracy || 0) * 3.28084)} ft`);
    };

    const onError = (error: GeolocationPositionError) => {
      console.error(error);
      setLocationStatus("Location blocked");
      showActionNotice("Allow location in the browser to show your marker.");
    };

    setFollowMyLocation(true);
    setLocationStatus("Locating...");
    navigator.geolocation.getCurrentPosition(onPosition, onError, options);
    if (geolocationWatchRef.current === null) {
      geolocationWatchRef.current = navigator.geolocation.watchPosition(onPosition, onError, options);
    }
  }

  function stopLocationTracking() {
    if (typeof navigator !== "undefined" && geolocationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(geolocationWatchRef.current);
    }
    geolocationWatchRef.current = null;
    setFollowMyLocation(false);
    setLocationStatus(userLocation ? "Location paused" : "Location off");
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
    <main className={`map-shell ${fullMap ? "full-map-mode" : ""}`}>
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
            background: transparent;
            border: 0;
          }

          .user-location-dot {
            width: 34px;
            height: 34px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            background: rgba(37, 99, 235, 0.14);
            border: 1px solid rgba(37, 99, 235, 0.25);
            box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.10);
          }

          .user-location-dot span {
            width: 15px;
            height: 15px;
            border-radius: 999px;
            background: #2563eb;
            border: 3px solid #ffffff;
            box-shadow: 0 8px 18px rgba(37, 99, 235, 0.32);
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
          }
        `}
        </style>

      <input
        ref={fieldPhotoInputRef}
        className="field-photo-input"
        type="file"
        accept={fieldCaptureAccept}
        capture="environment"
        multiple
        onChange={handleFieldPhotoInput}
      />

      <header className="map-top">
        <div className="map-title-row">
          <div>
            <h1>Field Operations</h1>
            <p>{message}</p>
          </div>
          <a className="home-btn" href="/">Home</a>
        </div>

        <div className="map-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search OMO, address, borough, trade..."
          />
          <button className="jobs-toggle" type="button" onClick={() => setDrawerOpen((value) => !value)}>
            Jobs
          </button>
        </div>

        <div className="map-filter-row">
          <button className={maturityFilter === "all" ? "active" : ""} type="button" onClick={() => setMaturityFilter("all")}>All {bucketCounts.all}</button>
          <button className={maturityFilter === "od0_30" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od0_30")}>0-30 Days {bucketCounts.od0_30}</button>
          <button className={maturityFilter === "od31_60" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od31_60")}>31-60 Days {bucketCounts.od31_60}</button>
          <button className={maturityFilter === "od61_90" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od61_90")}>61-90 Days {bucketCounts.od61_90}</button>
          <button className={maturityFilter === "od90plus" ? "active" : ""} type="button" onClick={() => setMaturityFilter("od90plus")}>90+ Days {bucketCounts.od90plus}</button>
          <button className="full-btn" type="button" onClick={() => {
            setFullMap((v) => !v);
            setDrawerOpen(false);
            setTimeout(() => mapRef.current?.invalidateSize(), 100);
            setTimeout(() => mapRef.current?.invalidateSize(), 400);
          }}>
            {fullMap ? "Exit Focus" : "Map Focus"}
          </button>
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
            const mapped = filteredJobs.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng));
            if (mapped.length && mapRef.current) {
              const bounds = mapped.map((job) => [Number(job._lat), Number(job._lng)]);
              mapRef.current.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
            }
          }}>Fit</button>
          <button type="button" title="Show my location" onClick={followMyLocation ? stopLocationTracking : startLocationTracking}>
            {followMyLocation ? "Pause" : "Me"}
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
                Generate Invoice Package
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
                <button type="button" onClick={() => requestFieldPhotoCapture(selected, "before", "image/*")}>
                  Before Image
                </button>
                <button type="button" onClick={() => requestFieldPhotoCapture(selected, "before", "video/*")}>
                  Before Video
                </button>
                <button type="button" className="finish-job-btn" onClick={() => finishFieldJob(selected)}>
                  Finish Work
                </button>
                <button type="button" onClick={() => requestFieldPhotoCapture(selected, "after", "image/*")}>
                  After Image
                </button>
                <button type="button" onClick={() => requestFieldPhotoCapture(selected, "after", "video/*")}>
                  After Video
                </button>
                <button type="button" className="finish-job-btn" onClick={() => finishFieldJob(selected, true)}>
                  Partial Finish
                </button>
                <button type="button" className="no-access-job-btn" onClick={() => startNoAccessCounter(selected)}>
                  No Access 72h
                </button>
                <button type="button" className="refused-job-btn" onClick={() => markRefusedAccess(selected)}>
                  Refused Evidence
                </button>
                <button type="button" className="other-done-job-btn" onClick={() => markCompletedByOthers(selected)}>
                  Other Done Evidence
                </button>
              </div>
              <small>Images become stamped PDF evidence pages. Videos are attached to the PDF with a stamped evidence page.</small>
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
                <button type="button" onClick={() => {
                  const key = jobKey(selected);
                  const patch = { __clearWorkflow: true };
                  if (key) {
                    workflowStorageSave(key, patch);
                    workflowServerSave(key, patch).catch((error) => {
                      console.error(error);
                      alert("Cleared on this device, but server clear failed.");
                    });
                  }
                  setDraftWorkflowStatus("");
                  setDraftWorkflowDate("");
                  setDraftWorkflowSaved(false);
                  setSelected((current) => current ? ({
                    ...current,
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
                    OutcomeLockedAt: "",
                    outcomeLockedAt: "",
                  } as MappedJob) : current);
                }}>Clear</button>
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

























































































































































































































