"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import AppointmentEditor from "./AppointmentEditor";
import TodayRoute from "./TodayRoute";
import BidsMode from "./BidsMode";
import { fetchRoadRoute, type RoadRoute } from "../../lib/road-route";
import { BuildingHero, SavedPackageLink } from "./BuildingPhoto";
import VideoBackupLine from "./VideoBackupLine";
import JobSafeLine from "./JobSafeLine";
import { nextRouteStop, type RouteJob, type RoutePoint } from "../../lib/day-route";
import { CURRENT_JOB_KEY, parseCurrentJob, type CurrentJob } from "../../lib/current-job";
import { activeAppointment, appointmentCalendarHref, appointmentLabel, appointmentPatch, appointmentTiming, nyToday, type Appointment } from "../../lib/appointments";
import { jobPriority, maturityDate, matchesAwardLookback, JOB_DATE_FIELDS, JobDateField, jobDate, matchesJobDateRange, calendarDay, jobDateWarning, currentYearRange } from "../../lib/job-priority";
import { fieldStatusLabel } from "../../lib/field-status";
import { lockedMessage, paperworkLock } from "../../lib/paperwork-lock";
import { jobStages, nextStep } from "../../lib/job-stages";
import { loadConversations, loadNotices, loadPrivate, noticePdfUrl, privateDocUrl, withPrivate, type HpdThread, type NoticeEmail } from "../../lib/private-data";
import ItbPages from "./ItbPages";
import { buildPriorities, dueText, type PriorityItem } from "../../lib/priorities";
import { listCorrections, removeCorrection, type SavedCorrection, updateCorrection } from "../../lib/correction-store";
import { markCorrectedCopy } from "../../lib/correction-copy";
import { followUpOf, followUpReport, recoveredStatus, paperworkRejections, type FollowUp, type PipPayment, type HpdJobStatus, type HpdRequest, type SentPaperwork } from "../../lib/job-followup";
import { JOB_QUEUES, jobQueue, matchesJobQueue, visitState } from "../../lib/job-queue";
import { nextFieldAction, paperworkNextHref, paperworkGenerateHref, FIELD_OUTCOMES, fieldOutcomePatch, arrivalVisitPatch, secondTryState, newYorkDay } from "../../lib/field-next-action";
import { canReadAloud, readAloud, stopReading } from "../../lib/read-aloud";
import { visitLocationFields, type GpsFix } from "../../lib/visit-record";
import { adoptServerOverrides, flushOverrideOutbox, mergeOverrideMaps, queueOverrideSync } from "../../lib/override-sync";
import { fetchServerWorkflowOverrides, HPD_STATUS_WORKER_URL, startOverPatch } from "../../lib/paperwork";
import { longestCleanDescription } from "../../lib/description-quality";
import { clearFieldEvidence, countAllFieldEvidence, listFieldEvidenceLite, redateFieldEvidence, saveFieldPhotos, type FieldMediaKind } from "../../lib/field-photo-store";
import { AUTO_KEY as DRIVE_AUTO_BACKUP_KEY, backupState } from "../../lib/drive-backup-client.mjs";
import { googleStatus, sendTextEmail } from "../../lib/package-delivery";
import { daySummary, type SummaryRow } from "../../lib/day-summary";
import { fieldStats, type StatsPeriod } from "../../lib/field-stats";
import { cleanJobLocationText } from "../../lib/jobLocation";
import { cleanTenantContactName, cleanTenantPhone } from "../../lib/tenantContact";
import { formatBytes, phoneStorage, type PhoneStorage } from "../../lib/phone-storage";
import { clearFieldPackets } from "../../lib/field-packet-store";
import { FREED_KEY } from "../../lib/free-space";
import PlanMyDayDrawer from "../map/PlanMyDayDrawer";
import JobAssistant from "./JobAssistant";
import "../map/plan-my-day.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./job-card-v2.css";
import { testFirstUpgrades, upgradeOn } from "../../lib/rollout";
import { buildBoard, urgentRows, type BoardMarks, type BoardStep } from "../../lib/notice-board";
import { PAY_STEPS, money, trackPayments } from "../../lib/payment-track";
import NoticeBoard from "./NoticeBoard";
import { milesLabel, nextJob } from "../../lib/next-job";
import { isTestJob, isTestModeJob, setTestJobLocation, setTestModeJob, testJobLocation, testJobPlace, TEST_JOB_ID, withTestJob } from "../../lib/test-job";

type JobRecord = Record<string, unknown>;

type BoroughKey = "MN" | "BK" | "QN" | "BX" | "SI";

const FIELD_WORKFLOW_STORAGE_KEY = "hpd-field-command-workflow";
const SHARED_WORKFLOW_STORAGE_KEY = "hpd-job-workflow-overrides-v2";
// United Angel's office (120-17 91st Ave, Richmond Hill): where the day's route starts when the phone
// has no location yet.
const OFFICE_LOCATION = { lat: 40.696592, lng: -73.827292 };

const BOROUGHS: { key: BoroughKey; label: string; center: [number, number]; color: string }[] = [
  { key: "MN", label: "Manhattan", center: [40.7831, -73.9712], color: "#2dd4bf" },
  { key: "BK", label: "Brooklyn", center: [40.6782, -73.9442], color: "#ff9f0a" },
  { key: "QN", label: "Queens", center: [40.7282, -73.7949], color: "#bf5af2" },
  { key: "BX", label: "Bronx", center: [40.8448, -73.8648], color: "#ff453a" },
  { key: "SI", label: "Staten Is.", center: [40.5795, -74.1502], color: "#30d158" },
];

const STATUS_FILTERS = JOB_QUEUES;

// Borough bar icons (one tap each).
const BOROUGH_ICONS: Record<BoroughKey, string> = { MN: "🏙️", BK: "🌉", QN: "👑", BX: "⚾", SI: "⛴️" };

// One-tap date windows for the quick filters, on whichever date type is picked.
const QUICK_DATE_RANGES = [
  { key: "year", label: "This year" },
  { key: "next30", label: "Next 30 days" },
  { key: "last15", label: "Last 15 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "last45", label: "Last 45 days" },
  { key: "last60", label: "Last 60 days" },
  { key: "last90", label: "Last 90 days" },
  { key: "all", label: "All dates" },
] as const;
type QuickDateKey = (typeof QUICK_DATE_RANGES)[number]["key"];

function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function quickDateBounds(key: QuickDateKey, today: string) {
  if (key === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  if (key === "next30") return { from: today, to: shiftDay(today, 30) };
  if (key === "last15") return { from: shiftDay(today, -15), to: today };
  if (key === "last30") return { from: shiftDay(today, -30), to: today };
  if (key === "last45") return { from: shiftDay(today, -45), to: today };
  if (key === "last60") return { from: shiftDay(today, -60), to: today };
  if (key === "last90") return { from: shiftDay(today, -90), to: today };
  return { from: "", to: "" };
}

function value(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const v = job[key];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return "";
}

function numberValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const n = Number(job[key]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

const JOBS_URL = "/data/COA_Fetcher_2026.json";
// Where the map was last left (center + zoom), so it reopens right there.
const MAP_VIEW_KEY = "hpd-map-view-v1";

function savedMapView(): { lat: number; lng: number; zoom: number } | null {
  try {
    const view = JSON.parse(localStorage.getItem(MAP_VIEW_KEY) || "null");
    return view && [view.lat, view.lng, view.zoom].every((n) => typeof n === "number" && Number.isFinite(n)) ? view : null;
  } catch {
    return null;
  }
}
const JOBS_CACHE = "hpd-jobs-v1";

function jobId(job: JobRecord) {
  return value(job, ["OMO", "omo", "OMONumber", "id", "Id"]) || "HPD JOB";
}

function jobAddress(job: JobRecord) {
  return value(job, ["BuildingAddress", "Address", "address", "Location", "location"]) || "Address not captured";
}

// Shown when the ITB's scope couldn't be read (e.g. a scanned ITB with only the blank form's text).
const OUTCOME_ICONS: Record<string, string> = { NO_ACCESS_1_WAITING_72H: "🔒", REFUSED_ACCESS: "⛔", WORK_COMPLETED_BY_OTHERS: "👥" };

// The version this app was built as (set by the Cloudflare build; empty in development).
const BUILT_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT || "";
const BUILT_NUMBER = process.env.NEXT_PUBLIC_APP_NUMBER || "";
const BUILT_AT = process.env.NEXT_PUBLIC_APP_BUILT_AT || "";
// "Updated Oct 16, 4:10 PM · #312": when this version was made, in New York time.
const versionLabel = () => {
  const when = BUILT_AT ? new Date(BUILT_AT).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return [when ? `Updated ${when}` : "", BUILT_NUMBER ? `#${BUILT_NUMBER}` : BUILT_COMMIT ? `v${BUILT_COMMIT}` : ""].filter(Boolean).join(" · ");
};
type WhatsNew = { date: string; title: string; items: string[] }[];
// When Claude picks up a new request: the check runs every 5 minutes from 7 AM to 11 PM (New York time).
const pickupLabel = () => {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  return h >= 7 && h < 23 ? "Claude will start within about 5-10 minutes" : "Claude will start at 7 AM";
};

function itbFileName(job: JobRecord | null | undefined) {
  const raw = String((job as Record<string, unknown> | null)?.ITBFile || (job as Record<string, unknown> | null)?.itbFile || "").trim();
  const name = raw.split(/[\\/]/).pop()?.trim() || "";
  return /\.pdf$/i.test(name) ? name : "";
}
const SCOPE_MISSING = "Couldn't read the scope from this job's ITB. Open the ITB under Job documents; type the scope on the paperwork page.";

function jobScope(job: JobRecord) {
  const picked = longestCleanDescription(job, [
    "ItbPage3Description",
    "JobDescription",
    "Job_Description",
    "Description",
    "description",
    "Scope",
    "scope",
  ])
    .replace(/^job description:\s*/i, "")
    .replace(/^:\s*/, "")
    .trim();
  return picked || SCOPE_MISSING;
}

// "YYYY-MM-DD" in local time, for date inputs.
function localDay(iso?: string) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

// Any field step recorded today (trip, arrival, visit, work, package).
function workedToday(job: JobRecord) {
  const today = new Date().toDateString();
  return ["TravelStartedAt", "FieldArrivedAt", "VisitStartedAt", "JobStartedAt", "LastFieldVisitAt", "ActualWorkCompletionDate", "PackageGeneratedAt", "PackageApprovedAt"]
    .some((key) => {
      const at = Date.parse(value(job, [key]));
      return Number.isFinite(at) && new Date(at).toDateString() === today;
    });
}

// Automatic data check, run on every job download: anything that would stop the field work or
// the paperwork is listed in the "jobs need a check" alert on the map.
function jobDataIssues(job: JobRecord) {
  const issues: string[] = [];
  if (jobScope(job) === SCOPE_MISSING) issues.push("No readable scope (description)");
  if (!jobLatLng(job)) issues.push("Not on the map (address not located)");
  if (jobAddress(job) === "Address not captured") issues.push("No address");
  if (!(jobAwardAmount(job) > 0)) issues.push("No award amount");
  return issues;
}

function packageStatusText(job: JobRecord) {
  const status = value(job, ["PackageReviewStatus", "packageReviewStatus"]);
  const message = value(job, ["PackageReadyMessage", "packageReadyMessage"]);
  if (/approved/i.test(status)) return message || "Approved";
  if (status) return "Draft ready - review and approve";
  return "Review and generate the package";
}

function tenantInfo(job: JobRecord) {
  // ITB extraction junk (HPD's fax line, page text glued to names, non-phone figures) is dropped.
  const apt = cleanJobLocationText(value(job, ["ItbTenantApartment", "ApartmentUnit", "Apartment", "Apt", "apt"]));
  const name = cleanTenantContactName(value(job, ["ItbTenantName", "TenantName", "tenantName", "Tenant", "tenant"]));
  const phone = cleanTenantPhone(value(job, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "Phone", "phone"]));
  const accessType = value(job, ["ItbTenantAccessType", "TenantAccessType"]);
  const status = value(job, ["ItbTenantContactStatus", "TenantContactStatus"]);
  const commonArea = accessType.toLowerCase().includes("common") || status.toLowerCase().includes("common");
  const cleanName = !commonArea && name && name.toUpperCase() !== "T" ? name : "";
  return {
    apt,
    name: cleanName,
    phone,
    commonArea,
    label: commonArea ? "Public area" : "Tenant contact",
    summary: commonArea
      ? "No tenant appointment needed"
      : [apt ? `Apt ${apt}` : "", cleanName, phone || "Request contact from HPD"]
          .filter(Boolean)
          .join(" · "),
  };
}

function jobBorough(job: JobRecord): BoroughKey | "NYC" {
  const raw = value(job, ["Borough", "borough", "Boro", "boro"]).toUpperCase();
  if (raw.includes("BROOKLYN") || raw === "BK") return "BK";
  if (raw.includes("MANHATTAN") || raw === "MN") return "MN";
  if (raw.includes("BRONX") || raw === "BX") return "BX";
  if (raw.includes("QUEENS") || raw === "QN") return "QN";
  if (raw.includes("STATEN") || raw === "SI") return "SI";
  const zip = jobAddress(job).match(/\b\d{5}\b/)?.[0] || "";
  const z = Number(zip);
  if (z >= 10001 && z <= 10282) return "MN";
  if (z >= 10451 && z <= 10475) return "BX";
  if (z >= 11201 && z <= 11256) return "BK";
  if ((z >= 11004 && z <= 11109) || (z >= 11351 && z <= 11697)) return "QN";
  if (z >= 10301 && z <= 10314) return "SI";
  return "NYC";
}

function jobStatus(job: JobRecord) {
  return (
    value(job, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status", "JobStatus"]) || "Active"
  );
}

function readJsonObject(key: string) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readSharedWorkflowOverrides() {
  const parsed = readJsonObject(SHARED_WORKFLOW_STORAGE_KEY);
  const overrides = parsed.overrides && typeof parsed.overrides === "object" && !Array.isArray(parsed.overrides)
    ? parsed.overrides
    : parsed;
  return overrides as Record<string, Record<string, unknown>>;
}

function writeSharedWorkflowPatch(id: string, patch: Record<string, unknown>) {
  if (typeof window === "undefined" || !id) return;
  const previous = readSharedWorkflowOverrides();
  window.localStorage.setItem(
    SHARED_WORKFLOW_STORAGE_KEY,
    JSON.stringify({
      ...previous,
      [id]: {
        ...(previous[id] || {}),
        ...patch,
        updatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    })
  );
  // Send it to the status server (now, or once the phone is back online).
  queueOverrideSync(id);
  scheduleOverrideSync();
}

let overrideSyncTimer = 0;
function scheduleOverrideSync(delay = 800) {
  if (typeof window === "undefined") return;
  window.clearTimeout(overrideSyncTimer);
  overrideSyncTimer = window.setTimeout(() => { void flushOverrideOutbox(HPD_STATUS_WORKER_URL); }, delay);
}

type StatusKey = "complete" | "noaccess" | "refused" | "pending" | "awarded" | "open" | "appointment" | "done" | "others" | "partial";

const STATUS_ICON_PATHS: Record<StatusKey, string> = {
  complete:
    '<g transform="rotate(45 12 12)"><rect x="10" y="2" width="4" height="9" rx="1" fill="#fff"/><rect x="6" y="9" width="12" height="5" rx="1.5" fill="#fff"/></g>',
  noaccess:
    '<rect x="6" y="11" width="12" height="9" rx="2" fill="#fff"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
  refused: '<path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  pending:
    '<circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M12 8v4.5l3 2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  awarded:
    '<path d="M12 3.5l2.47 5.18 5.53.63-4.1 3.86 1.08 5.5L12 15.9l-4.98 2.77 1.08-5.5-4.1-3.86 5.53-.63L12 3.5z" fill="#fff"/>',
  open: '<circle cx="12" cy="12" r="4.5" fill="#fff"/>',
  appointment: '<rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="white" stroke-width="2"/><path d="M8 3v5M16 3v5M4 10h16" fill="none" stroke="white" stroke-width="2"/>',
  // Completed job: a check mark, so it's clear at a glance there's nothing left to do there.
  done: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  others: '<circle cx="8.5" cy="8" r="3" fill="#fff"/><circle cx="16" cy="9" r="2.6" fill="#fff"/><path d="M3 19c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2zM13.5 19c.3-2.5 1.5-4.2 3.2-4.6 2 .2 3.6 1.9 4.1 4.6z" fill="#fff"/>',
  partial: '<circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="#fff"/>',
};

const DONE_COLOR = "#16a34a";

// Pin colors and icons you can read from far away (owner's scheme):
// blue = new, green = completed, red = refused, grey = no access, purple = completed by others.
const PIN_STYLES: { key: StatusKey; label: string; color: string }[] = [
  { key: "awarded", label: "New", color: "#2563eb" },
  { key: "done", label: "Completed", color: DONE_COLOR },
  { key: "refused", label: "Refused", color: "#dc2626" },
  { key: "noaccess", label: "No access", color: "#6b7280" },
  { key: "others", label: "Done by others", color: "#8b5cf6" },
  { key: "appointment", label: "Appointment", color: "#d97706" },
  { key: "partial", label: "Partial", color: "#ea580c" },
];

function pinStyle(job: JobRecord): { key: StatusKey; label: string; color: string } {
  const status = `${jobStatus(job)} ${value(job, ["FieldOutcome", "fieldOutcome", "WorkflowStatus"])}`.toLowerCase().replace(/[_-]+/g, " ");
  const pick = (key: StatusKey) => PIN_STYLES.find((style) => style.key === key)!;
  if (/by others/.test(status)) return pick("others");
  if (/refused/.test(status)) return pick("refused");
  if (/no access/.test(status)) return pick("noaccess");
  if (/partial/.test(status)) return pick("partial");
  if (/appointment|scheduled/.test(status) && !/cancel|missed/.test(status)) return pick("appointment");
  if (jobQueue(job) === "completed") return pick("done");
  return pick("awarded");
}

const STATUS_META: { key: StatusKey; label: string; color: string; match: (s: string, job: JobRecord) => boolean }[] = [
  { key: "complete", label: "Completed", color: "#30d158", match: (s) => s.includes("complete") },
  { key: "noaccess", label: "No Access", color: "#ff9f0a", match: (s) => s.includes("no access") },
  { key: "refused", label: "Refused", color: "#ff453a", match: (s) => s.includes("refused") },
  { key: "pending", label: "Pending", color: "#0a84ff", match: (s) => s.includes("pending") },
  {
    key: "awarded",
    label: "Awarded",
    color: "#0a84ff",
    match: (s, job) => s.includes("award") || jobAwardAmount(job) > 0,
  },
  { key: "open", label: "Pending", color: "#0a84ff", match: () => true },
];

function jobStatusMeta(job: JobRecord) {
  const specific = fieldStatusLabel(jobStatus(job));
  if (specific) return specific;
  // No status in the app: HPD's closing reason (and the paperwork you sent) says where it stands.
  const rec = job.HpdClosedReason || job.PaperworkSentAt ? recoveredStatus(job, { closedReason: String(job.HpdClosedReason || "") }, job.PaperworkSentAt ? { sentAt: String(job.PaperworkSentAt), count: 1 } : undefined) : null;
  if (rec && rec.kind !== "sent") {
    const key: StatusKey = rec.kind === "noaccess" ? "noaccess" : rec.kind === "refused" ? "refused" : rec.kind === "partial" ? "partial" : rec.kind === "others" ? "others" : "complete";
    const base = STATUS_META.find((m) => m.key === key) || STATUS_META[0];
    return { ...base, key, label: rec.label, color: key === "noaccess" ? "#ff9f0a" : key === "refused" ? "#ff453a" : "#30d158" };
  }
  const s = jobStatus(job).toLowerCase().replace(/_/g, " ");
  return STATUS_META.find((meta) => meta.match(s, job)) || STATUS_META[STATUS_META.length - 1];
}

function dueOnMap(job: JobRecord) {
  if (jobQueue(job) === "archived") return false;
  if (secondTryState(job)?.due) return true;
  const appointment = pinStyle(job).key === "appointment" ? activeAppointment(job) : null;
  if (!appointment) return false;
  const timing = appointmentTiming(appointment);
  return !timing.past && timing.days <= 1;
}

function shortClock(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}

// Map pin: a teardrop in the status color with a white symbol you can read from far away, and a
// small chip: how late open work is, the time of an appointment (glowing as it gets close), or
// "2nd try" when a no-access job is due back.
function jobPinHtml(job: JobRecord, meta: { key: StatusKey; color: string }, priority: { days: number | null; pending: boolean }, visits: number) {
  const classes = ["fc-pin", `is-${meta.key}`];
  let chip = "";
  let symbol = meta.key === "awarded" ? HARDHAT_ICON_PATH : STATUS_ICON_PATHS[meta.key];
  const appointment = meta.key === "appointment" ? activeAppointment(job) : null;
  const timing = appointment ? appointmentTiming(appointment) : null;
  const second = meta.key === "noaccess" ? secondTryState(job) : null;
  if (appointment && timing && !timing.past) {
    chip = timing.soon ? (timing.startsIn > 0 ? `${timing.startsIn}m` : "now") : timing.today ? shortClock(appointment.start) : timing.days === 1 ? "tmrw" : appointmentLabel(appointment).slice(0, 3);
    if (timing.soon) classes.push("is-soon");
    else if (timing.today) classes.push("is-today");
  } else if (second?.due) {
    chip = "2nd try";
    classes.push("is-due");
  } else if (job.HpdClosedReason && !fieldStatusLabel(jobStatus(job))) {
    chip = "HPD ✓";
    classes.push("is-hpd-closed");
  } else if (job.PaperworkSentAt && !fieldStatusLabel(jobStatus(job))) {
    chip = "sent ✓";
    classes.push("is-paper-sent");
  } else if (priority.pending && priority.days !== null) {
    chip = priority.days > 0 ? `${priority.days}d` : priority.days === 0 ? "today" : `in ${-priority.days}d`;
    classes.push(priority.days > 30 ? "is-late" : priority.days > 0 ? "is-overdue" : "is-upcoming");
  }
  if (meta.key === "done") symbol = STATUS_ICON_PATHS.done;
  // The test job: its own purple flask pin with a TEST tag, whatever step it is at.
  let color = meta.color;
  if (job.IsTestJob === true || String(job.IsTestJob) === "true") {
    classes.push("is-test");
    symbol = FLASK_ICON_PATH;
    color = "#7c3aed";
    chip = "TEST";
  }
  return `<div class="${classes.join(" ")}" style="--pin:${color}"><span class="fc-pin-head"><svg viewBox="0 0 24 24" aria-hidden="true">${symbol}</svg></span>${chip ? `<span class="fc-pin-chip">${chip}</span>` : ""}${visits ? `<span class="fc-pin-visits">${visits}</span>` : ""}</div>`;
}

function jobAwardAmount(job: JobRecord) {
  const raw = value(job, ["AwardAmount", "COAAwardAmount", "Amount", "amount"]);
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function boroughColor(key: BoroughKey | "NYC") {
  return BOROUGHS.find((b) => b.key === key)?.color || "#8e8e93";
}

function directionsHref(job: JobRecord) {
  const ll = jobLatLng(job);
  const query = ll ? `${ll.lat},${ll.lng}` : jobAddress(job);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving&dir_action=navigate`;
}

// Today's route as the route panel saved it on this phone (stop IDs in order), or [] if it is
// from another day or there is none.
function todayRouteIds(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null");
    return saved?.settings?.date === nyToday() && Array.isArray(saved.ids) ? saved.ids.filter((id: unknown) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function wazeHref(job: JobRecord) {
  const ll = jobLatLng(job);
  if (ll) return `https://waze.com/ul?ll=${ll.lat},${ll.lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(jobAddress(job))}&navigate=yes`;
}

function formatSavedTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // The job card is internal, so it keeps the time. Anything that goes out (PDFs, email, Drive
  // file names) shows the date only.
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusGroup(job: JobRecord) {
  const s = jobStatus(job).toLowerCase().replace(/_/g, " ");
  if (s.includes("partial") || s.includes("progress")) return "open";
  if (s.includes("appointment")) return "pending";
  if (s.includes("no access") || s.includes("refused")) return "closed";
  if (s.includes("complet")) return "closed";
  if (s.includes("pending")) return "pending";
  if (s.includes("award") || jobAwardAmount(job) > 0) return "awarded";
  return "open";
}

function jobLatLng(job: JobRecord) {
  const lat = numberValue(job, ["Latitude", "latitude", "Lat", "lat", "_lat"]);
  const lng = numberValue(job, ["Longitude", "longitude", "Lng", "lng", "Lon", "lon", "_lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 40 || lat > 41 || lng > -73 || lng < -75) return null;
  return { lat, lng };
}

function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BidsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

// HPD notices: a bell (the envelope is the invitations-to-bid button).
function NoticesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

// HPD email threads by kind (scripts/fetch_hpd_conversations.py). Rejection notices and award letters have their
// own screens, so they're not listed with the conversations.
const CORRECTION_KINDS = ["correction"] as const;
const REQUEST_KINDS = ["paperwork", "past due"] as const;
const MESSAGE_KINDS = ["AEP", "work order", "message"] as const;

function CloseOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 14l2 2 4-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><path d="M12 15v2" />
    </svg>
  );
}

function FollowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" /><path d="M8.5 10.5l1.5 1.5 3-3" /><path d="M8 16h8" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="20" x2="5" y2="12" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="19" y1="20" x2="19" y2="9" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.2 18 15 8a3 3 0 0 1 3-1.5" />
    </svg>
  );
}

function NavigateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l18-8-8 18-2.5-7.5L3 11z" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PhotosIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

function DocumentsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M15 9.5c0-1.4-1.34-2.5-3-2.5s-3 1.1-3 2.5 1.34 2.5 3 2.5 3 1.1 3 2.5-1.34 2.5-3 2.5-3-1.1-3-2.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}


const LIGHT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const DARK_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

function individualPinOffset(index: number, count: number) {
  const columns = Math.min(3, count);
  const rows = Math.ceil(count / columns);
  return { x: ((index % columns) - (columns - 1) / 2) * 62, y: (Math.floor(index / columns) - (rows - 1) / 2) * 48 };
}

function reservePinLabel(x: number, y: number, occupied: { x: number; y: number }[]) {
  if (occupied.some(p => Math.abs(p.x - x) < 58 && Math.abs(p.y - y) < 44)) return false;
  occupied.push({ x, y });
  return true;
}

function groupByLocation(
  points: { job: JobRecord; lng: number; lat: number }[],
) {
  const locations = new Map<string, { lng: number; lat: number; jobs: JobRecord[] }>();
  for (const point of points) {
    const key = `${point.lat}|${point.lng}`;
    const existing = locations.get(key);
    if (existing) existing.jobs.push(point.job);
    else locations.set(key, { lat: point.lat, lng: point.lng, jobs: [point.job] });
  }
  return [...locations.values()];
}

const FLASK_ICON_PATH =
  '<path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17.3A1.9 1.9 0 0 0 7.3 20.2h9.4a1.9 1.9 0 0 0 1.7-2.9L13.5 8.7V3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
  '<path d="M7.6 15h8.8l1.4 2.6a.8.8 0 0 1-.7 1.2H6.9a.8.8 0 0 1-.7-1.2z" fill="#fff"/>';

const HARDHAT_ICON_PATH =
  '<path d="M4 12.5A8 8 0 0 1 20 12.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="2.5" y="12" width="19" height="2.6" rx="1.3" fill="#fff"/>' +
  '<rect x="11" y="6.5" width="2" height="3.5" rx="1" fill="#fff"/>';

function boroughLabelHtml(label: string, dark: boolean) {
  const style = dark
    ? "color:rgba(255,255,255,.88);text-shadow:0 1px 4px rgba(0,0,0,.9),0 1px 8px rgba(0,0,0,.7);"
    : "color:rgba(71,85,105,.85);text-shadow:0 1px 0 rgba(255,255,255,.55),-1px 0 0 rgba(255,255,255,.4),1px 0 0 rgba(255,255,255,.4),0 -1px 0 rgba(255,255,255,.4);";
  return `<span style="display:inline-block;${style}font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;pointer-events:none;">${label}</span>`;
}

export default function FieldCommandClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const jobSheetRef = useRef<HTMLDivElement | null>(null);
  const sheetTouchStart = useRef<number | null>(null);
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, { outcome: string; note: string }>>({});
  const [outcomeMessage, setOutcomeMessage] = useState("");
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const appointmentRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapFramingRef = useRef("");
  const restoredMapViewRef = useRef(false);
  const tileLayerRef = useRef<any>(null);
  const vectorLayerRef = useRef<any>(null);
  const darkTilesRef = useRef(false);
  const layerGroupRef = useRef<any>(null);
  const boroughLabelLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const dayRouteLayerRef = useRef<any>(null);
  const dayRouteRequest = useRef(0);
  const [routeMapReady, setRouteMapReady] = useState(false);
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  // Latest GPS fix with its accuracy and time: saved with each visit as proof of where the phone was.
  const lastFixRef = useRef<GpsFix | null>(null);
  // The map follows you from the moment it opens; dragging the map pauses it, Me resumes it.
  const followMeRef = useRef(true);
  const centeredOnMeRef = useRef(false);
  const pointsRef = useRef<{ job: JobRecord; lng: number; lat: number }[]>([]);
  const renderMarkersRef = useRef<() => void>(() => {});
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  // Follow-up: the report sheet, and the map filter it can set (overdue, due this week, ...).
  const [followOpen, setFollowOpen] = useState(false);
  const [followFilter, setFollowFilter] = useState<"" | "notices" | "hpd-asked" | "overdue" | "due-week" | "recent" | "sent" | "hpd-closed">("");
  // The HPD notices layer: jobs with rejected paperwork or an open HPD request, on the map and in a list.
  const [noticesOpen, setNoticesOpen] = useState(false);
  // HPD's own notice emails + their PDFs (private route), shown inside the app one notice at a time.
  const [noticeMail, setNoticeMail] = useState<Record<string, NoticeEmail[]> | null | undefined>(undefined);
  // Email threads with HPD staff (work orders, corrections, AEP...), loaded when signed in. One opens as a chat.
  const [threads, setThreads] = useState<HpdThread[] | null | undefined>(undefined);
  const [threadView, setThreadView] = useState<{ ids: string[]; title: string } | null>(null);
  const [threadsAll, setThreadsAll] = useState(false);
  useEffect(() => { loadConversations().then((d) => setThreads(d ? d.threads : null)); }, []);
  const threadsFor = (omo: string) => (threads || []).filter((t) => t.omos.includes(omo));
  const [noticesTab, setNoticesTab] = useState<"priority" | "rejected" | "corrections" | "requests" | "messages" | "print" | "money">("priority");
  // Priority list (lib/priorities): what HPD is waiting on, most urgent first; "Handled" (two taps) hides an item
  // on this phone.
  const [prioDone, setPrioDone] = useState<Record<string, string>>({});
  const [prioArmed, setPrioArmed] = useState("");
  useEffect(() => { try { setPrioDone(JSON.parse(localStorage.getItem("hpd-priority-done") || "{}")); } catch { /* private mode */ } }, []);
  // A reply to the vendor tracker about one notice (e.g. Lewis's 24-hour notice), written for the owner to check:
  // "Send to me first" or Send (two taps). Only to an @hpd.nyc.gov address (the server checks).
  const [prioReply, setPrioReply] = useState<{ key: string; omo: string; to: string; name: string; subject: string; text: string; armed: boolean; status: string } | null>(null);
  const startPrioReply = (it: PriorityItem) => {
    const t = (threads || []).find((x) => x.id === it.threadId);
    const hpdMsgs = (t?.messages || []).filter((m) => m.hpd && !m.mine);
    const to = (hpdMsgs.map((m) => (/([a-z0-9._%+-]+@hpd\.nyc\.gov)/i.exec(m.text) || [])[1]).find(Boolean) || "").toLowerCase();
    const first = (it.who || "").split(/\s+/)[0] || "";
    const job = findAnyJob(it.omo);
    const when = it.sentAt ? new Date(`${it.sentAt}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) : "";
    const body = it.sentAt
      ? `The affidavit and invoice for this job were sent on ${when}. Please let us know if you need anything else or if you did not receive them.`
      : `We are working on this job and will send the affidavit and invoice as soon as it is completed. Please let us know if you need anything else in the meantime.`;
    setPrioReply({ key: it.key, omo: it.omo, to, name: it.who, armed: false, status: "",
      subject: `RE: ${t?.subject || `OMO# ${it.omo}`}`.slice(0, 200),
      text: `Hello${first ? ` ${first}` : ""},\n\nRe: OMO# ${it.omo}${job ? ` - ${jobAddress(job)}` : ""}\n\n${body}\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`,
    });
  };
  const sendPrioReply = async (toSelf: boolean) => {
    if (!prioReply) return;
    if (!toSelf && !prioReply.armed) { setPrioReply({ ...prioReply, armed: true }); return; }
    setPrioReply({ ...prioReply, status: "Sending…" });
    try {
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toSelf ? { toSelf: true, subject: prioReply.subject, text: prioReply.text } : { to: prioReply.to, subject: prioReply.subject, text: prioReply.text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      if (toSelf) { setPrioReply({ ...prioReply, armed: false, status: `✓ Sent to you (${d.to}). Nothing went to HPD.` }); return; }
      const next = { ...prioDone, [`replied:${prioReply.key}`]: new Date().toISOString() };
      setPrioDone(next);
      try { localStorage.setItem("hpd-priority-done", JSON.stringify(next)); } catch { /* private mode */ }
      setPrioReply({ ...prioReply, armed: false, status: `✓ Sent to ${d.to}.` });
    } catch (e) {
      setPrioReply({ ...prioReply, armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}. Nothing went out.` });
    }
  };
  const markPrioDone = (key: string) => {
    if (prioArmed !== key) { setPrioArmed(key); return; }
    const next = { ...prioDone, [key]: new Date().toISOString() };
    setPrioDone(next); setPrioArmed("");
    try { localStorage.setItem("hpd-priority-done", JSON.stringify(next)); } catch { /* private mode */ }
  };
  // "It's fixed and in the mail" note to whoever signed HPD's notice: shown first, sent with a second tap.
  const [ack, setAck] = useState<{ omo: string; to: string; name: string; subject: string; text: string; armed: boolean; status: string } | null>(null);
  const [ackSent, setAckSent] = useState<Record<string, string>>({});
  useEffect(() => { try { setAckSent(JSON.parse(localStorage.getItem("hpd-ack-sent-v1") || "{}")); } catch { /* private mode */ } }, []);
  // The copy HPD gets by email: "COPY" on every page and a yellow box with what was corrected (the printed original
  // stays clean for the ink signature).
  const correctedCopy = async (c: SavedCorrection) => {
    const rj = rejections.find((x) => x.omo === c.omo);
    return markCorrectedCopy(await c.pdf.arrayBuffer(), { omo: c.omo, rejectedAt: c.rejectedAt || rj?.at || "", reason: c.reason || rj?.reason || "", changes: c.changes || [], fixedOn: new Date(c.savedAt).toLocaleDateString("en-US") });
  };
  const copyBase64 = async (c: SavedCorrection) => {
    const bytes = await correctedCopy(c);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const openCorrectedCopy = async (c: SavedCorrection) => {
    const win = window.open("", "_blank");
    const bytes = await correctedCopy(c);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    if (win) win.location.href = url; else window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };
  const markPrinted = async (c: SavedCorrection) => { await updateCorrection(c.omo, { printedAt: c.printedAt ? undefined : new Date().toISOString() }); setToPrint(await listCorrections()); };
  const startAck = (omo: string, reason: string) => {
    const mail = noticeMail?.[omo]?.[0];
    const name = (mail?.signer || "").replace(/,\s*CCAP$/i, "").trim();
    const nice = name ? name.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase()).replace(/\bJr\b/, "Jr.") : "";
    const job = findAnyJob(omo);
    const rj = openRejections.find((x) => x.omo === omo);
    setAck({
      omo, to: mail?.replyTo || "", name: mail?.signer || "",
      subject: `RE: OMO# ${omo} rejection: corrected paperwork in the mail`,
      text: `Hello${nice ? ` ${nice}` : ""},\n\nRe: OMO# ${omo}${job ? ` - ${jobAddress(job)}` : ""}\n\nThe rejection you sent${rj?.at ? ` on ${rj.at}` : ""}${reason ? ` ("${reason.slice(0, 160)}")` : ""} has been corrected. A copy of the corrected affidavit and invoice is attached. The original, signed and notarized, is printed and on its way to you in the mail.\n\nPlease let us know when you receive it.\n\nThank you,\nUnited Angel Construction Corp`,
      armed: false, status: "",
    });
  };
  // The same email to your own Gmail first (to check it, or forward it yourself). Nothing goes to HPD.
  const sendAckToMe = async () => {
    if (!ack) return;
    setAck({ ...ack, status: "Sending to you…" });
    try {
      const saved = toPrint.find((x) => x.omo === ack.omo);
      const data = saved?.pdf ? await copyBase64(saved) : "";
      const attachment = data ? { name: `${ack.omo} corrected affidavit and invoice (copy).pdf`, data } : undefined;
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toSelf: true, subject: ack.subject, text: ack.text, attachment }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      setAck({ ...ack, armed: false, status: `✓ Sent to you (${d.to}). Check it in Gmail; nothing went to HPD.` });
    } catch (e) {
      setAck({ ...ack, armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}.` });
    }
  };
  const sendAck = async () => {
    if (!ack) return;
    if (!ack.armed) { setAck({ ...ack, armed: true }); return; }
    setAck({ ...ack, status: "Sending…" });
    try {
      // The copy of the fixed paperwork (the original is printed, signed in ink and mailed).
      const saved = toPrint.find((x) => x.omo === ack.omo);
      const data = saved?.pdf ? await copyBase64(saved) : "";
      const attachment = data ? { name: `${ack.omo} corrected affidavit and invoice (copy).pdf`, data } : undefined;
      const r = await fetch("/api/drive/hpd-reply", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: ack.to, subject: ack.subject, text: ack.text, attachment }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.error || `HTTP ${r.status}`);
      const next = { ...ackSent, [ack.omo]: new Date().toISOString() };
      setAckSent(next);
      try { localStorage.setItem("hpd-ack-sent-v1", JSON.stringify(next)); } catch { /* private mode */ }
      await updateCorrection(ack.omo, { emailedAt: next[ack.omo], emailedTo: ack.to });
      setToPrint(await listCorrections());
      setAck(null);
    } catch (e) {
      setAck({ ...ack, armed: false, status: `Not sent: ${e instanceof Error ? e.message : "error"}. Nothing went out.` });
    }
  };
  const threadsOf = (kinds: readonly string[]) => (threads || []).filter((t) => kinds.includes(t.kind));
  // A list of HPD email threads of some kinds, waiting-on-you first; 8 shown, then "Show all".
  const threadSection = (key: string, title: string, kinds: readonly string[], note: string) => {
    const list = [...threadsOf(kinds)].sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.lastAt.localeCompare(a.lastAt));
    return (
      <section className="fc-follow-section is-conversations" data-hpd-smoke={`fc-threads-${key}`} key={key}>
        <h4>{title}{list.length ? ` (${list.filter((t) => t.waiting).length} waiting on you)` : ""}</h4>
        {note ? <p className="fc-follow-note">{note}</p> : null}
        {threads === null ? <p className="fc-follow-note" data-hpd-smoke="fc-conversations-signin">Your emails with HPD are private. <a href="/storage/">Sign in with Google</a> on this phone to see them here.</p>
          : threads === undefined ? <p className="fc-follow-note">Loading…</p>
          : !list.length ? <p className="fc-follow-note">None.</p>
          : (
            <>
              <ul className="fc-thread-list">
                {list.slice(0, threadsAll ? 300 : 8).map((t) => (
                  <li key={t.id} className={t.waiting ? "is-waiting" : ""}>
                    <button type="button" data-hpd-smoke="fc-thread-row" onClick={() => setThreadView({ ids: [t.id], title: t.subject })}>
                      <b>{t.waiting ? "🔴 " : ""}{t.subject || "(no subject)"}</b>
                      <span>{t.people.join(", ") || "HPD"}{t.omos.length ? ` · ${t.omos.slice(0, 3).join(", ")}` : ""}</span>
                      <small>{new Date(t.lastAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} · {t.count} message{t.count === 1 ? "" : "s"}{t.waiting ? " · HPD wrote last" : " · you replied"}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {list.length > 8 ? <button type="button" className="fc-follow-paper" data-hpd-smoke="fc-threads-more" onClick={() => setThreadsAll((v) => !v)}>{threadsAll ? "Show fewer" : `Show all ${list.length}`}</button> : null}
            </>
          )}
      </section>
    );
  };
  const [noticeView, setNoticeView] = useState("");
  useEffect(() => { if (noticesOpen && noticeMail === undefined) loadNotices().then((d) => setNoticeMail(d)); }, [noticesOpen, noticeMail]);
  // Tenant names / phones are private: null while loading, false when this phone isn't signed in with Google.
  const [privateOk, setPrivateOk] = useState<boolean | null>(null);
  // Corrected paperwork saved on this phone to print and sign in ink (lib/correction-store.ts).
  const [toPrint, setToPrint] = useState<SavedCorrection[]>([]);
  const [printArmed, setPrintArmed] = useState("");
  useEffect(() => { if (noticesOpen) listCorrections().then(setToPrint); }, [noticesOpen]);
  function openCorrectionPdf(c: SavedCorrection) {
    const url = URL.createObjectURL(c.pdf);
    // Same-site file: a plain new tab (with "noopener" the PDF tab can open blank).
    if (!window.open(url, "_blank")) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  async function correctionSent(c: SavedCorrection) {
    if (printArmed !== c.omo) { setPrintArmed(c.omo); return; } // second tap confirms (iPhone blocks confirm boxes)
    const patch = { CorrectionSentAt: new Date().toISOString() };
    try { writeSharedWorkflowPatch(c.omo, patch); mergeWorkflowPatchIntoScreen(c.omo, patch); } catch {}
    // Kept in the folder as done (with the dates), so you can see it was printed, emailed and mailed.
    await updateCorrection(c.omo, { mailedAt: patch.CorrectionSentAt });
    setPrintArmed("");
    setToPrint(await listCorrections());
  }
  const [followShowAll, setFollowShowAll] = useState(false);
  // HPD's closing reason for each job and when you sent HPD its paperwork (nightly files).
  const followRef = useRef<{ hpd: Record<string, HpdJobStatus>; sent: Record<string, SentPaperwork>; asked: Record<string, HpdRequest> } | null>(null);
  const reapplyFollowRef = useRef<(() => void) | null>(null);
  // Every HPD email about every OMO (requests, rejections), also jobs that aren't on the map.
  const [askedMap, setAskedMap] = useState<Record<string, HpdRequest>>({});
  // Older jobs (2024-2025) with HPD notices: on the notices layer, not in the 2026 work lists.
  const [olderJobs, setOlderJobs] = useState<JobRecord[]>([]);
  // The 2024-2025 layer (scripts/build-older-jobs-layer.mjs): shown on the map only when turned on.
  const [showOlderLayer, setShowOlderLayer] = useState(false);
  // Notices button (owner, 16 Oct): first asks what you're looking for, then the map shows just those jobs.
  type NoticeKind = "" | "all" | "priority" | "rejected" | "corrections" | "print";
  const [noticeChooser, setNoticeChooser] = useState(false);
  // After a pick the picker shrinks to a thin bar so the map is in view (owner, 17 Oct: "take me to the map").
  const [noticeMini, setNoticeMini] = useState(false);
  const noticeMiniRef = useRef(false);
  noticeMiniRef.current = noticeMini;
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("");
  // The 24 / 72-hour board (17 Oct) and the steps ticked by hand on this phone.
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardShow, setBoardShow] = useState<"all" | "ppn" | "docs">("all");
  // Morning summary (owner, 17 Oct): the first time the app opens each day, what needs doing today, one tap to each.
  const [summaryToday, setSummaryToday] = useState(false);
  useEffect(() => {
    // Automated test browsers open it with ?today=1 (so it doesn't cover the map buttons they tap).
    if (new URLSearchParams(window.location.search).get("today") === "1") { setSummaryToday(true); return; }
    if (navigator.webdriver) return;
    try { if (localStorage.getItem("hpd-summary-seen") !== new Date().toLocaleDateString("en-CA")) setSummaryToday(true); } catch { setSummaryToday(true); }
  }, []);
  const closeSummary = () => { setSummaryToday(false); try { localStorage.setItem("hpd-summary-seen", new Date().toLocaleDateString("en-CA")); } catch { /* private mode */ } };
  const [boardMarks, setBoardMarks] = useState<BoardMarks>({});
  useEffect(() => { try { setBoardMarks(JSON.parse(localStorage.getItem("hpd-notice-board-v1") || "{}")); } catch { /* private mode */ } }, []);
  // Every button / link pops for a moment when touched (iPhone has no hover); the touch listener turns on :active in Safari.
  useEffect(() => {
    const pop = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button, a, [role=button]") as HTMLElement | null;
      if (!el || el.closest(".leaflet-pane")) return;
      el.classList.remove("fc-tap-pop");
      void el.offsetWidth;
      el.classList.add("fc-tap-pop");
      window.setTimeout(() => el.classList.remove("fc-tap-pop"), 320);
    };
    const noop = () => {};
    document.addEventListener("pointerdown", pop, { passive: true });
    document.addEventListener("touchstart", noop, { passive: true });
    return () => { document.removeEventListener("pointerdown", pop); document.removeEventListener("touchstart", noop); };
  }, []);
  const markBoard = (key: string, step: BoardStep, on: boolean) => {
    setBoardMarks((cur) => {
      const row = { ...(cur[key] || {}) };
      if (on) row[step] = new Date().toISOString(); else delete row[step];
      const next = { ...cur, [key]: row };
      try { localStorage.setItem("hpd-notice-board-v1", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };
  // Jobs that glow on the map for the picked notice kind, with their tag (e.g. "24h · 5h left").
  const glowRef = useRef<Map<string, { tag: string; cls: string }>>(new Map());
  // The days menu on the borough bar (owner, 16 Oct): one small button, the choices open under it.
  const [daysMenuOpen, setDaysMenuOpen] = useState(false);
  const [olderLayer, setOlderLayer] = useState<JobRecord[] | null>(null);
  useEffect(() => {
    if (!showOlderLayer || olderLayer) return;
    fetch("/data/jobs_2024_2025.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => setOlderLayer(Array.isArray(d?.jobs) ? d.jobs : [])).catch(() => setOlderLayer([]));
  }, [showOlderLayer, olderLayer]);
  // Paid / not paid per OMO, from PIP (scripts/import_pip_agreements.mjs).
  const [pipMap, setPipMap] = useState<Record<string, PipPayment>>({});
  useEffect(() => {
    fetch("/data/pip_paid.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => setPipMap(d?.jobs || {})).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/data/COA_older.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).then((rows) => setOlderJobs(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);
  useEffect(() => {
    Promise.all([
      fetch("/data/hpd_job_status.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/data/sent_paperwork.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/data/hpd_requests.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([hpd, sent, asked]) => {
      followRef.current = { hpd: hpd?.jobs || {}, sent: sent?.jobs || {}, asked: asked?.jobs || {} };
      setAskedMap(asked?.jobs || {});
      reapplyFollowRef.current?.();
    });
  }, []);
  const [calendarDate, setCalendarDate] = useState(nyToday);

  useEffect(() => {
    const refreshDate = () => setCalendarDate(nyToday());
    const timer = window.setInterval(refreshDate, 30000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);
  const [borough, setBorough] = useState<BoroughKey | "ALL">("ALL");
  const [status, setStatus] = useState("pending");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dataCheckOpen, setDataCheckOpen] = useState(false);
  // Bumped when Test mode is switched, so the card re-reads it from the phone.
  const [testModeVersion, setTestModeVersion] = useState(0);
  // Status and borough filters come back as they were left.
  const quickFiltersLoaded = useRef(false);
  useEffect(() => {
    try {
      // v2: v1 could hold a borough forced by an old job link, hiding every other job; start fresh once.
      localStorage.removeItem("hpd-map-quick-filters-v1");
      const saved = JSON.parse(localStorage.getItem("hpd-map-quick-filters-v2") || "null");
      if (saved && STATUS_FILTERS.some(({ key }) => key === saved.status)) setStatus(saved.status);
      if (saved && (saved.borough === "ALL" || BOROUGHS.some(({ key }) => key === saved.borough))) setBorough(saved.borough);
    } catch {}
    quickFiltersLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!quickFiltersLoaded.current) return;
    try { localStorage.setItem("hpd-map-quick-filters-v2", JSON.stringify({ status, borough })); } catch {}
  }, [status, borough]);
  const requestedJobLoaded = useRef(false);
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{ field: JobDateField; from: string; to: string; preset?: boolean }>(currentYearRange);
  useEffect(() => { setDateRange(previous => previous.preset ? currentYearRange() : previous); }, [calendarDate]);
  const [customDateRange, setCustomDateRange] = useState(false);
  const [dateFilterLoaded, setDateFilterLoaded] = useState(false);
  useEffect(() => {
    try {
      const range = JSON.parse(localStorage.getItem("hpd-map-date-range-v2") || "null");
      if (range && Object.hasOwn(JOB_DATE_FIELDS, range.field) && typeof range.from === "string" && typeof range.to === "string"
        && (!range.from || calendarDay(range.from) !== null) && (!range.to || calendarDay(range.to) !== null)) setDateRange(range.preset ? currentYearRange() : range);
      const saved = range ? localStorage.getItem("hpd-map-award-days") : null;
      if (saved !== null && /^\d+$/.test(saved) && Number(saved) <= 3650) {
        setDaysBack(Number(saved));
        setCustomDateRange(![30,90,180,365].includes(Number(saved)));
      }
    } catch { /* Map filtering remains available without device storage. */ }
    setDateFilterLoaded(true);
  }, []);
  useEffect(() => {
    if (!dateFilterLoaded) return;
    try {
      if (daysBack === null) localStorage.removeItem("hpd-map-award-days");
      else localStorage.setItem("hpd-map-award-days", String(daysBack));
    } catch { /* Keep the current filter when storage is unavailable. */ }
  }, [daysBack, dateFilterLoaded]);
  useEffect(() => {
    if (!dateFilterLoaded) return;
    try { localStorage.setItem("hpd-map-date-range-v2", JSON.stringify(dateRange)); } catch { /* Filtering still works without storage. */ }
  }, [dateRange, dateFilterLoaded]);
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [currentJob,setCurrentJob] = useState<CurrentJob|null>(null);
  const currentJobRef=useRef<CurrentJob|null>(null);
  const resumeInitialized=useRef(false);
  const navigationDeparted=useRef(false);
  const [darkTiles, setDarkTiles] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  // Which version is running (from /version.json, written by every deploy).
  const [appVersion, setAppVersion] = useState(BUILT_COMMIT);
  // What's new (public/data/whats-new.json, written with every change) and "App updated" once per new version.
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null | undefined>(undefined);
  const [justUpdated, setJustUpdated] = useState(false);
  // Ask for a change from inside the app: saved on the status server (key CHANGE-REQUEST-<time>) and on this
  // phone; the next upgrade session reads them all (scripts/list-change-requests.mjs).
  const [changeText, setChangeText] = useState("");
  const [changeStatus, setChangeStatus] = useState("");
  const [myRequests, setMyRequests] = useState<{ at: string; text: string }[]>([]);
  useEffect(() => { try { setMyRequests(JSON.parse(localStorage.getItem("hpd-change-requests") || "[]")); } catch { /* private mode */ } }, []);
  // Your requests with their answers (status + dated progress notes), from the status server: CHANGE-REQUEST-<id>
  // and CHANGE-REPLY-<id> (scripts/reply-change-request.mjs). "New" = an update after you last opened the list.
  type ChangeThread = { id: string; at: string; text: string; status: string; updates: { at: string; text: string }[]; steps: { text: string; done: boolean }[]; workingAt: string };
  const [changeThreads, setChangeThreads] = useState<ChangeThread[] | null>(null);
  const [repliesSeen, setRepliesSeen] = useState("");
  const loadChangeThreads = async () => {
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/overrides`, { cache: "no-store" });
      const all = (await r.json())?.overrides || {};
      const list: ChangeThread[] = Object.entries(all).filter(([k]) => k.startsWith("CHANGE-REQUEST-")).map(([k, v]) => {
        const id = k.slice(15); const req = v as { at?: string; text?: string }; const rep = all[`CHANGE-REPLY-${id}`] as { status?: string; updates?: { at: string; text: string }[]; steps?: { text: string; done: boolean }[]; workingAt?: string } | undefined;
        return { id, at: String(req.at || ""), text: String(req.text || ""), status: rep?.status || "Received", updates: Array.isArray(rep?.updates) ? rep!.updates : [], steps: Array.isArray(rep?.steps) ? rep!.steps : [], workingAt: String(rep?.workingAt || "") };
      }).sort((a, b) => b.at.localeCompare(a.at));
      setChangeThreads(list);
    } catch { setChangeThreads(null); }
  };
  useEffect(() => { try { setRepliesSeen(localStorage.getItem("hpd-replies-seen") || ""); } catch { /* private mode */ } void loadChangeThreads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const newReplies = (changeThreads || []).filter((t) => t.updates.some((u) => u.at > repliesSeen)).length;
  const askForChange = async () => {
    const text = changeText.trim();
    if (!text) return;
    const at = new Date().toISOString();
    const list = [{ at, text }, ...myRequests].slice(0, 50);
    setMyRequests(list);
    try { localStorage.setItem("hpd-change-requests", JSON.stringify(list)); } catch { /* private mode */ }
    setChangeText("");
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-REQUEST-${at.replace(/[^0-9]/g, "").slice(0, 14)}`, patch: { at, text: text.slice(0, 2000), version: BUILT_NUMBER || BUILT_COMMIT } }) });
      setChangeStatus(r.ok ? `📥 Received. ${pickupLabel()}; progress shows below.` : "Saved on this phone; it will be sent when the server answers.");
      if (r.ok) void loadChangeThreads();
    } catch { setChangeStatus("Saved on this phone (offline)."); }
  };
  const loadWhatsNew = async () => {
    if (whatsNew) return whatsNew;
    try { const r = await fetch("/data/whats-new.json", { cache: "no-cache" }); const d = r.ok ? await r.json() : null; setWhatsNew(Array.isArray(d?.versions) ? d.versions : null); return d?.versions; } catch { setWhatsNew(null); return null; }
  };
  useEffect(() => {
    const id = BUILT_COMMIT || "";
    if (!id) return;
    let seen = "";
    try { seen = localStorage.getItem("hpd-version-seen") || ""; localStorage.setItem("hpd-version-seen", id); } catch { return; }
    if (seen && seen !== id) { setJustUpdated(true); void loadWhatsNew(); window.setTimeout(() => setJustUpdated(false), 12000); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A newer version is live but a job card is open: offer it instead of waiting.
  const [updateReady, setUpdateReady] = useState(false);
  const appVersionRef = useRef("");
  const latestCommitRef = useRef("");
  const safeToReloadRef = useRef(true);
  const [plannerRequest,setPlannerRequest] = useState(0);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => { setSpeechOk(canReadAloud()); }, []);
  const selectedJobKey = selectedJob ? jobId(selectedJob) : "";
  // Switching or closing the job card stops reading the old description.
  useEffect(() => { stopReading(); setReading(false); setScopeOpen(false); }, [selectedJobKey]);
  const [controlsOpen, setControlsOpen] = useState(false);
  // The route button on the map opens Today's route (one route on the map, with its stop list).
  const [routeOpenRequest, setRouteOpenRequest] = useState(0);
  const [routeCloseRequest, setRouteCloseRequest] = useState(0);
  const [routeOpen, setRouteOpen] = useState(false);
  // The envelope button flips the map to upcoming invitations to bid (BidsMode).
  const [bidsOpen, setBidsOpen] = useState(false);
  // How many invitations are open (shown on the Bids button like the Notices count), and how many are due today / tomorrow.
  const [bidsDue, setBidsDue] = useState<{ today: number; tomorrow: number; open: number }>({ today: 0, tomorrow: 0, open: 0 });
  useEffect(() => {
    const load = () => fetch("/data/upcoming_bids.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const day = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const nowMin = (() => { const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number); return h * 60 + m; })();
      const minutes = (t: string) => { const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60; };
      const bids: { bidDue: string; bidDueTime: string }[] = Array.isArray(d?.bids) ? d.bids : [];
      setBidsDue({
        today: bids.filter((b) => b.bidDue === day(0) && minutes(b.bidDueTime) > nowMin).length,
        tomorrow: bids.filter((b) => b.bidDue === day(1)).length,
        open: bids.filter((b) => b.bidDue > day(0) || (b.bidDue === day(0) && minutes(b.bidDueTime) > nowMin)).length,
      });
    }).catch(() => {});
    load();
    const t = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);
  // The home screen's "Invitations to bid" / "Bid stats" buttons open the map straight on the invitations.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("bids") !== "1") return;
    setBidsOpen(true);
    // The tab goes by sessionStorage: changing the address twice reset the screen.
    try { if (params.get("tab")) sessionStorage.setItem("hpd-bids-tab", String(params.get("tab"))); } catch {}
    try { window.history.replaceState(null, "", window.location.pathname); } catch {}
  }, []);
  const [workflowStamps, setWorkflowStamps] = useState<Record<string, { arrived?: string; visit?: string; work?: string; status?: string }>>({});
  const [workflowLoaded, setWorkflowLoaded] = useState(false);
  const [jobsLoadFailed, setJobsLoadFailed] = useState(false);
  const [mediaCounts, setMediaCounts] = useState<Record<string, { before: number; after: number; total: number; beforeVideos?: number; afterVideos?: number; beforeDay?: string; afterDay?: string }>>({});
  // Up to 3 thumbnails per stage for the Media & Documents card.
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, { before: string[]; after: string[] }>>({});
  const [mediaBusy, setMediaBusy] = useState("");
  useEffect(() => { if (!mediaBusy) refreshBackupRef.current(); }, [mediaBusy]);
  const [mediaMessage, setMediaMessage] = useState("");
  // Photos and videos live on this phone until the package is sent: show whether the Drive
  // backup (Storage settings) is copying them, and turn it on with one tap.
  const [backup, setBackup] = useState<{ auto: boolean; total: number; verifiedAt: string; error: string; queued: number } | null>(null);
  const refreshBackupRef = useRef<() => void>(() => {});
  refreshBackupRef.current = () => {
    void (async () => {
      let auto = false;
      try { auto = window.localStorage.getItem(DRIVE_AUTO_BACKUP_KEY) === "on"; } catch {}
      const [total, state] = await Promise.all([
        countAllFieldEvidence().catch(() => 0),
        backupState().catch(() => null) as Promise<{ verifiedAt?: string; error?: string; queued?: number } | null>,
      ]);
      setBackup({ auto, total, verifiedAt: state?.verifiedAt || "", error: state?.error || "", queued: state?.queued || 0 });
    })();
  };
  useEffect(() => {
    const refresh = () => refreshBackupRef.current();
    refresh();
    for (const event of ["hpd-drive-backup-status", "hpd-drive-backup-settings", "focus"]) window.addEventListener(event, refresh);
    return () => { for (const event of ["hpd-drive-backup-status", "hpd-drive-backup-settings", "focus"]) window.removeEventListener(event, refresh); };
  }, []);
  // Space the app uses on this phone: warn before it runs out (new photos and videos would not save).
  const [phoneSpace, setPhoneSpace] = useState<PhoneStorage | null>(null);
  useEffect(() => {
    const refresh = () => { void phoneStorage().then(setPhoneSpace); };
    refresh();
    for (const event of ["focus", "hpd-video-saved", "hpd-video-backup-status"]) window.addEventListener(event, refresh);
    return () => { for (const event of ["focus", "hpd-video-saved", "hpd-video-backup-status"]) window.removeEventListener(event, refresh); };
  }, []);
  useEffect(() => { if (!mediaBusy) void phoneStorage().then(setPhoneSpace); }, [mediaBusy]);
  async function turnOnDriveBackup() {
    const google = await googleStatus();
    if (!google.connected) {
      setMediaMessage("Connect Google Drive first, then turn on the backup.");
      window.location.assign("/storage/");
      return;
    }
    try { window.localStorage.setItem(DRIVE_AUTO_BACKUP_KEY, "on"); } catch {
      setMediaMessage("Couldn't turn on the backup on this phone.");
      return;
    }
    window.dispatchEvent(new Event("hpd-drive-backup-settings"));
    setMediaMessage("☁️ Drive backup is on: photos, videos and job steps are copied to your Google Drive automatically.");
    refreshBackupRef.current();
  }
  const [clearJobId, setClearJobId] = useState("");
  const [clearText, setClearText] = useState("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoCameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaChoiceRef = useRef<HTMLDivElement | null>(null);
  const [mediaChoiceInStep, setMediaChoiceInStep] = useState(false);
  // After a job finishes, its package opens for review by itself after a short countdown.
  const [autoPackage, setAutoPackage] = useState<{ id: string; outcome: string; seconds: number } | null>(null);
  useEffect(() => {
    if (!autoPackage) return;
    if (autoPackage.seconds <= 0) { openAutoPackage(autoPackage); return; }
    const timer = window.setTimeout(() => setAutoPackage((current) => current && { ...current, seconds: current.seconds - 1 }), 1000);
    return () => window.clearTimeout(timer);
  }, [autoPackage]);
  function openAutoPackage(entry: { id: string; outcome: string }) {
    setAutoPackage(null);
    openPackageSheet(entry.id, paperworkGenerateHref(entry.id, entry.outcome));
  }
  // The package (review, sign, notary, email) opens in a sheet over the map, so the job card and the
  // map stay where they are; "Back to job" or an approved package closes it.
  const [packageSheet, setPackageSheet] = useState<{ id: string; href: string } | null>(null);
  function openPackageSheet(id: string, href: string) {
    const url = `${href}${href.includes("?") ? "&" : "?"}embed=1`;
    setPackageSheet({ id, href: url });
  }
  function packageLinkClick(id: string, href: string) {
    return (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      openPackageSheet(id, href);
    };
  }
  // The original ITB scope page (page 3 image, published by the fetcher), one tap from the description.
  const [itbPage, setItbPage] = useState<{ id: string; fileName: string; image: string; pdf: string; page: number; failed: boolean } | null>(null);
  const itbManifestRef = useRef<Record<string, { page?: number; pageImage?: string; pdf?: string }> | null>(null);
  async function openItbPage(job: JobRecord) {
    const fileName = itbFileName(job);
    if (!fileName) return;
    if (!itbManifestRef.current) {
      try {
        const response = await fetch("/data/itb_source_manifest.json");
        itbManifestRef.current = (await response.json()).entries || {};
      } catch {
        itbManifestRef.current = null;
      }
    }
    const entry = itbManifestRef.current?.[fileName] || {};
    const page = Number(entry.page || 3) || 3;
    setItbPage({ id: jobId(job), fileName, image: privateDocUrl(entry.pageImage || ""), pdf: privateDocUrl(entry.pdf || `/documents/itb/${encodeURIComponent(fileName)}`), page, failed: false });
  }
  function closePackageSheet() {
    const sheet = packageSheet;
    setPackageSheet(null);
    if (!sheet) return;
    // The package page saves its changes (approved, emailed) on this phone: show them on the card.
    try {
      const saved = readSharedWorkflowOverrides()[sheet.id];
      if (saved) mergeWorkflowPatchIntoScreen(sheet.id, saved);
    } catch {}
  }
  const closePackageSheetRef = useRef(closePackageSheet);
  closePackageSheetRef.current = closePackageSheet;
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !event.data || event.data.type !== "hpd-package-approved") return;
      closePackageSheetRef.current();
      setMediaMessage(event.data.emailed ? `${event.data.job || "Job"} package approved and emailed ✓` : `${event.data.job || "Job"} package approved ✓`);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const [mediaChoice, setMediaChoice] = useState<FieldMediaKind | null>(null);
  const pendingMediaKindRef = useRef<FieldMediaKind>("before");

  // Tapping Waze / Google is recorded on the job itself: "On the way", with the date and time.
  function recordTravel(job: JobRecord, via: "Waze" | "Google") {
    const id = jobId(job);
    const now = new Date().toISOString();
    const latest = { ...job, ...(readSharedWorkflowOverrides()[id] || {}) };
    const history = Array.isArray(latest.FieldVisitHistory) ? latest.FieldVisitHistory : [];
    const patch = { TravelStartedAt: now, TravelVia: via, FieldVisitHistory: [...history, { recordedAt: now, outcome: null, note: `On the way (${via})` }] };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
    rememberNavigation(id);
  }

  function rememberNavigation(id:string) {
    const entry={id,startedAt:Date.now(),pendingReturn:true};
    currentJobRef.current=entry;setCurrentJob(entry);navigationDeparted.current=false;
    try {localStorage.setItem(CURRENT_JOB_KEY,JSON.stringify(entry));}
    catch {setMediaMessage('Current job could not be saved on this device.');}
  }
  function resumeCurrentJob(entry:CurrentJob) {
    const match=jobs.find(job=>jobId(job)===entry.id);
    if(!match)return;
    const updated={...entry,pendingReturn:false};
    currentJobRef.current=updated;setCurrentJob(updated);
    try {localStorage.setItem(CURRENT_JOB_KEY,JSON.stringify(updated));} catch {}
    setChromeOpen(false);setControlsOpen(false);setAgendaOpen(false);
    setSelectedJob(match);setSheetExpanded(false);
  }
  useEffect(()=>{
    if(!jobs.length||!workflowLoaded)return;
    if(!resumeInitialized.current){
      resumeInitialized.current=true;
      let entry:CurrentJob|null=null;
      try {entry=parseCurrentJob(localStorage.getItem(CURRENT_JOB_KEY));}catch {}
      currentJobRef.current=entry;setCurrentJob(entry);
      if(entry?.pendingReturn&&!new URLSearchParams(window.location.search).has('omo'))resumeCurrentJob(entry);
    }
    const returnToJob=()=>{
      if(document.hidden||!navigationDeparted.current)return;
      navigationDeparted.current=false;
      const entry=currentJobRef.current;
      if(entry?.pendingReturn&&parseCurrentJob(JSON.stringify(entry)))resumeCurrentJob(entry);
    };
    const hidden=()=>{if(document.hidden)navigationDeparted.current=true;else returnToJob();};
    const blur=()=>{navigationDeparted.current=true;};
    window.addEventListener('blur',blur);window.addEventListener('focus',returnToJob);
    window.addEventListener('pageshow',returnToJob);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',blur);window.removeEventListener('focus',returnToJob);window.removeEventListener('pageshow',returnToJob);document.removeEventListener('visibilitychange',hidden);};
  },[jobs,workflowLoaded]);

  useEffect(() => { setMediaChoice(null); }, [selectedJob ? jobId(selectedJob) : ""]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    let latestRows: JobRecord[] | null = null;
    let serverOverrides: Record<string, JobRecord> = {};
    // Tenant names / phones come from the signed-in private route (not the public job file).
    let privateJobs: Record<string, Record<string, unknown>> | null = null;
    loadPrivate().then((bundle) => {
      setPrivateOk(Boolean(bundle));
      privateJobs = bundle?.jobs || null;
      if (privateJobs && latestRows) { latestRows = withPrivate(latestRows, privateJobs); applyOverrides(); }
    });
    function showRows(data: unknown) {
      const body = data as { jobs?: unknown; data?: unknown; records?: unknown } | unknown[];
      const rows = Array.isArray(body) ? body : body?.jobs || body?.data || body?.records;
      if (!Array.isArray(rows)) throw new Error("Invalid job response");
      latestRows = withTestJob(withPrivate(rows as JobRecord[], privateJobs));
      setJobsLoadFailed(false);
      applyOverrides();
    }
    reapplyFollowRef.current = () => applyOverrides();
    function applyOverrides() {
      if (cancelled || !latestRows) return;
      // Field by field, newer wins: the server's entry never wipes out steps saved on this phone.
      const overrides = mergeOverrideMaps(readSharedWorkflowOverrides(), serverOverrides);
      const follow = followRef.current;
      const next = latestRows.map((row: JobRecord) => {
        const id = jobId(row);
        const extra = follow ? { HpdClosedReason: follow.hpd[id]?.closedReason || "", PaperworkSentAt: follow.sent[id]?.sentAt || "", HpdAskedAt: follow.asked[id]?.askedAt || "", HpdAskedBy: follow.asked[id]?.by || "", HpdAskedFor: follow.asked[id]?.kind || "", HpdAskedTs: follow.asked[id]?.askedTs || 0, HpdRepliedTs: follow.asked[id]?.repliedTs || 0 } : {};
        return { ...row, ...(overrides[id] || {}), ...extra, ...(id === TEST_JOB_ID ? testJobPlace() : {}) };
      });
      setJobs((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    // Pins show at once from the copy saved on this phone last time, then refresh from the network.
    if (typeof caches !== "undefined") {
      caches.open(JOBS_CACHE).then((cache) => cache.match(JOBS_URL)).then((saved) => saved?.json())
        .then((data) => { if (data && !latestRows) showRows(data); })
        .catch(() => {});
    }
    function refreshJobs() {
      if (loading) return;
      loading = true;
      // no-cache: the phone keeps the file and the server answers "unchanged" quickly when it is.
      fetch(JOBS_URL, { cache: "no-cache" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Job refresh failed");
          // Copy before reading: once the body is read it can't be copied into the phone's cache.
          if (typeof caches !== "undefined") {
            const copy = response.clone();
            caches.open(JOBS_CACHE).then((cache) => cache.put(JOBS_URL, copy)).catch(() => {});
          }
          showRows(await response.json());
        })
        .catch(() => { if (!latestRows) setJobsLoadFailed(true); /* Otherwise keep the last loaded jobs. */ })
        .finally(() => { loading = false; });
      // Saved field statuses merge in when they arrive; they never hold up the pins.
      fetchServerWorkflowOverrides()
        .then((overrides) => { serverOverrides = overrides as Record<string, JobRecord>; adoptServerOverrides(serverOverrides); applyOverrides(); })
        .catch(() => {});
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === SHARED_WORKFLOW_STORAGE_KEY) refreshJobs();
    };
    // Steps saved with no signal go to the status server when the phone is back online.
    const syncSaved = () => scheduleOverrideSync(0);
    refreshJobs();
    syncSaved();
    window.addEventListener("focus", refreshJobs);
    window.addEventListener("focus", syncSaved);
    window.addEventListener("online", syncSaved);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => { refreshJobs(); syncSaved(); }, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshJobs);
      window.removeEventListener("focus", syncSaved);
      window.removeEventListener("online", syncSaved);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FIELD_WORKFLOW_STORAGE_KEY);
      if (saved) setWorkflowStamps(JSON.parse(saved));
      const drafts = window.localStorage.getItem("hpd-field-visit-drafts");
      if (drafts) setOutcomeDrafts(JSON.parse(drafts));
    } catch {}
    setWorkflowLoaded(true);
  }, []);

  useEffect(() => {
    if (!workflowLoaded) return;
    try {
      window.localStorage.setItem(FIELD_WORKFLOW_STORAGE_KEY, JSON.stringify(workflowStamps));
    } catch {}
  }, [workflowStamps, workflowLoaded]);

  useEffect(() => {
    if (!workflowLoaded) return;
    try { window.localStorage.setItem("hpd-field-visit-drafts", JSON.stringify(outcomeDrafts)); }
    catch { setOutcomeMessage("Draft could not be saved on this device. Keep this screen open."); }
  }, [outcomeDrafts, workflowLoaded]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => matchesJobQueue(job, "pending")),
    [jobs]
  );

  const overdueCount = useMemo(
    () => activeJobs.filter((job) => {
      const days = jobPriority(job).days;
      return days !== null && days > 30;
    }).length,
    [activeJobs, calendarDate]
  );

  const openJobKey = selectedJob ? jobId(selectedJob) : "";
  // Where each job stands for follow-up (HPD status + paperwork sent are on the jobs once loaded).
  const followUps = useMemo(() => {
    const map = new Map<string, FollowUp>();
    for (const job of jobs) {
      if (isTestJob(jobId(job))) continue;
      map.set(jobId(job), followUpOf(job, job.HpdClosedReason !== undefined ? { closedReason: String(job.HpdClosedReason || "") } : undefined, job.PaperworkSentAt ? { sentAt: String(job.PaperworkSentAt), count: 1 } : undefined, calendarDate, job.HpdAskedAt ? { askedAt: String(job.HpdAskedAt), count: 1, by: String(job.HpdAskedBy || ""), kind: String(job.HpdAskedFor || ""), askedTs: Number(job.HpdAskedTs || 0), repliedTs: Number(job.HpdRepliedTs || 0) } : undefined));
    }
    return map;
  }, [jobs, calendarDate]);
  const followReport = useMemo(() => followUpReport(
    jobs.filter((j) => !isTestJob(jobId(j))),
    Object.fromEntries(jobs.filter((j) => j.HpdClosedReason !== undefined).map((j) => [jobId(j), { closedReason: String(j.HpdClosedReason || "") }])),
    Object.fromEntries(jobs.filter((j) => j.PaperworkSentAt).map((j) => [jobId(j), { sentAt: String(j.PaperworkSentAt), count: 1 }])),
    calendarDate,
    Object.fromEntries(jobs.filter((j) => j.HpdAskedAt).map((j) => [jobId(j), { askedAt: String(j.HpdAskedAt), count: 1, by: String(j.HpdAskedBy || ""), kind: String(j.HpdAskedFor || ""), askedTs: Number(j.HpdAskedTs || 0), repliedTs: Number(j.HpdRepliedTs || 0) }])),
  ), [jobs, calendarDate]);
  const rejections = useMemo(() => paperworkRejections(askedMap, [...jobs, ...olderJobs], pipMap), [askedMap, jobs, olderJobs, pipMap]);
  const findAnyJob = (omo: string) => jobs.find((j) => jobId(j) === omo) || olderJobs.find((j) => jobId(j) === omo) || (olderLayer || []).find((j) => jobId(j) === omo);
  const openRejections = rejections.filter((r) => !r.answered);
  const [showAnsweredRejections, setShowAnsweredRejections] = useState(false);
  const [openNotice, setOpenNotice] = useState("");
  const senderName = (by: string) => (/^Department of Housing/i.test(by) ? "HPD Accounts Payable" : by);
  // Jobs HPD closed or PIP paid: nothing left to do on them.
  const closedJobs = new Set([...Object.entries(followRef.current?.hpd || {}).filter(([, h]) => (h as { closedReason?: string })?.closedReason).map(([o]) => o), ...Object.entries(pipMap).filter(([, p]) => p?.status === "paid").map(([o]) => o)]);
  const priorities: PriorityItem[] = buildPriorities({
    threads: (threads || []) as unknown as Parameters<typeof buildPriorities>[0]["threads"],
    rejections: openRejections.map((r) => ({ omo: r.omo, at: r.at, reason: r.reason || "", by: senderName(r.by || "HPD") })),
    toPrint, sent: (followRef.current?.sent || {}) as Record<string, { sentAt?: string }>, done: prioDone,
    // Nothing to do on jobs HPD closed or PIP paid.
    closed: closedJobs,
  });
  const boardRows = threads ? buildBoard({ threads, sent: (followRef.current?.sent || {}) as Record<string, { sentAt?: string }>, marks: boardMarks, closed: closedJobs }) : [];
  const boardOpenRows = boardRows.filter((r) => r.next);
  const boardUrgent = urgentRows(boardRows);
  // For the morning summary: notices due by tonight (or overdue) with nothing sent, missing documents waiting.
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const dueToday = boardOpenRows.filter((r) => r.kind === "ppn" && !r.steps.sent.done && r.dueAt && Date.parse(r.dueAt) <= endOfToday.getTime()).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const docsWaiting = boardOpenRows.filter((r) => r.kind === "docs" && !r.steps.sent.done);
  const waitingOnThem = boardOpenRows.filter((r) => r.next === "confirmed").length;
  // Vendor tracking's list (Due now); rejected paperwork and printing are Procurement's tabs.
  const vendorTodo = priorities.filter((p) => p.kind === "24h" || p.kind === "72h" || p.kind === "missing");
  // Rejections tracked to the money (17 Oct): rejected -> fixed -> printed -> emailed -> mailed -> paid in PIP.
  const payTrack = trackPayments({ rejections, corrections: toPrint, sent: (followRef.current?.sent || {}) as Record<string, { sentAt?: string }> });
  const heldBy = new Map(payTrack.rows.filter((r) => r.status === "held").map((r) => [r.omo, r.held]));
  const noticeSets: Record<Exclude<NoticeKind, "">, Set<string>> = {
    priority: new Set([...vendorTodo.map((p) => p.omo), ...followReport.hpdAsked.map((r) => r.omo)]),
    rejected: new Set(openRejections.map((r) => r.omo)),
    corrections: new Set(threadsOf(CORRECTION_KINDS).filter((t) => t.waiting).flatMap((t) => t.omos)),
    print: new Set(toPrint.filter((c) => !c.mailedAt).map((c) => c.omo)),
    all: new Set<string>(),
  };
  noticeSets.all = new Set([...noticeSets.priority, ...noticeSets.rejected, ...noticeSets.corrections, ...noticeSets.print]);
  const noticeSetKey = noticeKind ? [...noticeSets[noticeKind]].sort().join(",") : "";
  const NOTICE_KINDS = [
    { key: "all", icon: "📩", short: "All notices", title: "All notices", note: "Everything on the map at once" },
    { key: "priority", icon: "🔥", short: "Priority", title: "Priority · vendor tracking", note: "Lewis / Gafur want the affidavit, invoice or an update" },
    { key: "rejected", icon: "💵", short: "Payment rejected", title: "Payment rejected", note: "Procurement rejected the invoice / affidavit: fix & resend" },
    { key: "corrections", icon: "✏️", short: "Corrections", title: "Corrections", note: "HPD staff asked you to correct paperwork" },
    { key: "print", icon: "🖨", short: "Print & mail", title: "Print & mail", note: "Fixed paperwork to sign in ink and mail" },
  ] as const;
  // Earliest Priority item per job (24-hour before 72-hour before missing documents).
  const prioByOmo = new Map<string, PriorityItem>();
  for (const it of vendorTodo) if (!prioByOmo.has(it.omo)) prioByOmo.set(it.omo, it);
  const glow = new Map<string, { tag: string; cls: string }>();
  if (followFilter === "notices" && noticeKind) {
    for (const omo of noticeSets[noticeKind]) {
      const kind = noticeKind !== "all" ? noticeKind
        : noticeSets.priority.has(omo) ? "priority" : noticeSets.rejected.has(omo) ? "rejected" : noticeSets.corrections.has(omo) ? "corrections" : "print";
      const it = prioByOmo.get(omo);
      const due = it ? dueText(it.dueAt) : "";
      const tag = kind === "priority"
        ? (it ? (it.kind === "missing" ? "🔥 Docs" : `🔥 ${it.kind === "24h" ? "24h" : "72h"} · ${due.replace(" left", "").replace("overdue ", "-")}`) : "🔥 Asked")
        : kind === "rejected" ? (heldBy.get(omo) ? `💵 ${money(heldBy.get(omo) || 0)}` : "💵 Fix") : kind === "corrections" ? "✏️ Fix" : "🖨 Mail";
      glow.set(omo, { tag, cls: `is-glow is-glow-${kind}${kind === "priority" && it?.kind === "24h" ? " is-glow-24h" : ""}${kind === "priority" && /overdue/.test(due) ? " is-glow-late" : ""}` });
    }
  }
  glowRef.current = glow;
  const glowKey = [...glow].map(([o, g]) => `${o}:${g.tag}`).join("|");
  // Narrow the map to one kind; the picker stays so you can switch like the other filters.
  const pickNotices = (kind: NoticeKind) => {
    setSelectedJob(null);
    setFollowFilter("notices");
    setNoticeKind(kind);
    if (kind && kind !== "all") setNoticesTab(kind);
    setNoticeChooser(true);
    setNoticeMini(true);
  };
  // The nearest 24 / 72-hour deadline (for the timer on the Priority chip).
  const nextDue = vendorTodo.filter((p) => p.dueAt).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))[0];
  const followMatch = (job: JobRecord) => {
    if (followFilter === "notices" && noticeKind) return noticeSets[noticeKind].has(jobId(job));
    const f = followUps.get(jobId(job));
    if (!f) return false;
    if (followFilter === "recent") return followReport.recent.some((r) => r.omo === f.omo);
    if (followFilter === "hpd-asked") return f.hpdAsked;
    if (followFilter === "notices") return f.hpdAsked || openRejections.some((r) => r.omo === f.omo);
    return f.state === followFilter;
  };

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const olderOnNotices = followFilter !== "notices" ? []
      : noticeKind ? olderJobs.filter((j) => noticeSets[noticeKind].has(jobId(j)))
      : olderJobs.filter((j) => openRejections.some((r) => r.omo === jobId(j)));
    // 2024-2025 jobs: only with the "2024-25" button on (and no follow-up filter), same borough / search.
    if (showOlderLayer && !followFilter && olderLayer) {
      return olderLayer.filter((job) => (borough === "ALL" || jobBorough(job) === borough) && (!q || [jobId(job), jobAddress(job)].join(" ").toLowerCase().includes(q)));
    }
    return [...jobs, ...olderOnNotices].filter((job) => {
      // Follow-up filter (from the report or the quick filters): only those jobs, any status or date.
      if (followFilter) {
        if (!followMatch(job)) return false;
        if (borough !== "ALL" && jobBorough(job) !== borough) return false;
        if (q && ![jobId(job), jobAddress(job)].join(" ").toLowerCase().includes(q)) return false;
        return true;
      }
      // A job never drops off the map while you work it: the open job, and any job worked
      // today, stay visible whatever its new status (until you archive it).
      if (jobId(job) === openJobKey || (workedToday(job) && jobQueue(job) !== "archived")) return true;
      // Due now (an appointment today or tomorrow, a no-access 2nd try that's due) shows whatever
      // the status and date filters; the borough and the search still apply.
      // The test job is always on the map (any status, date or borough filter); search still applies.
      const isTheTestJob = jobId(job) === TEST_JOB_ID;
      if (!dueOnMap(job) && !isTheTestJob) {
        if (!matchesJobQueue(job, status)) return false;
        if (!matchesAwardLookback(job, daysBack)) return false;
        if (!matchesJobDateRange(job, dateRange.field, dateRange.from, dateRange.to)) return false;
      }
      if (borough !== "ALL" && jobBorough(job) !== borough && !isTheTestJob) return false;
      if (q) {
        const haystack = [jobId(job), jobAddress(job), jobBorough(job), jobStatus(job)].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, borough, status, search, daysBack, dateRange, calendarDate, openJobKey, followFilter, followUps, followReport, showOlderLayer, olderLayer, olderJobs, openRejections, noticeKind, noticeSetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The open job card has priority over "follow me": stop following and show the job's pin in
  // the open strip of map between the search bar and the top of the card. The locate button
  // turns following back on.
  const openJobKeyRef = useRef("");
  openJobKeyRef.current = openJobKey;
  function showJobAboveCard(lat: number, lng: number, minZoom = 16) {
    const map = mapRef.current;
    if (!map) return;
    followMeRef.current = false;
    centeredOnMeRef.current = true;
    map.setView([lat, lng], Math.max(map.getZoom(), minZoom), { animate: false });
    // Measure once the card is laid out, and again after its slide-up animation settles.
    const place = () => {
      if (!mapRef.current) return;
      const container = map.getContainer().getBoundingClientRect();
      const cardTop = document.querySelector("#fc-job-card")?.getBoundingClientRect().top ?? container.bottom;
      const searchBottom = document.querySelector(".fc-search-row")?.getBoundingClientRect().bottom ?? container.top;
      const target = (Math.max(searchBottom, container.top) + Math.min(cardTop, container.bottom)) / 2 - container.top;
      const pin = map.latLngToContainerPoint([lat, lng]);
      if (Math.abs(pin.y - target) > 4) map.panBy([0, Math.round(pin.y - target)], { animate: false });
    };
    window.setTimeout(place, 200);
    window.setTimeout(place, 800);
  }
  // The view before a card opened: closing the card puts the map back there, so the other
  // jobs are right where they were. A tapped pin keeps your zoom (only search/links zoom in).
  const viewBeforeCardRef = useRef<{ center: [number, number]; zoom: number; follow: boolean } | null>(null);
  const pinTapRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!openJobKey) {
      const before = viewBeforeCardRef.current;
      viewBeforeCardRef.current = null;
      if (before && map) {
        map.setView(before.center, before.zoom, { animate: false });
        followMeRef.current = before.follow;
      }
      return;
    }
    if (map && !viewBeforeCardRef.current) {
      const center = map.getCenter();
      viewBeforeCardRef.current = { center: [center.lat, center.lng], zoom: map.getZoom(), follow: followMeRef.current };
    }
    const job = jobs.find((row) => jobId(row) === openJobKey);
    const at = job ? jobLatLng(job) : null;
    if (at) showJobAboveCard(at.lat, at.lng, pinTapRef.current ? 0 : 16);
    pinTapRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openJobKey, routeMapReady]);

  // Automatic update: an iPhone app left in the background keeps running the old version, so
  // whenever you come back to it (and every 10 minutes) check /version.json; if a newer version
  // was deployed, reload -- only when no job card is open and nothing is saving.
  safeToReloadRef.current = !selectedJob && !mediaBusy && !autoPackage && !packageSheet && !itbPage;
  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const { commit } = await response.json() as { commit?: string };
        if (!commit || stopped) return;
        // The version this app was built as; older builds didn't carry it, so they learn it here.
        if (!appVersionRef.current) appVersionRef.current = BUILT_COMMIT || commit;
        setAppVersion(appVersionRef.current);
        if (commit === appVersionRef.current) return;
        latestCommitRef.current = commit;
        // Reload by itself once per new version; if the old version is still what loads (no
        // signal, old copy), stop and offer the Update button instead of reloading over and over.
        let tried = "";
        try { tried = sessionStorage.getItem("hpd-reloaded-for") || ""; } catch {}
        if (safeToReloadRef.current && !document.hidden && tried !== commit) {
          try { sessionStorage.setItem("hpd-reloaded-for", commit); } catch {}
          window.location.reload();
        } else setUpdateReady(true);
      } catch { /* offline: try again later */ }
    }
    void check();
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // An iPhone app resumed from the background fires pageshow: check right away.
    window.addEventListener("pageshow", onVisible);
    const timer = window.setInterval(check, 5 * 60 * 1000);
    return () => { stopped = true; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); window.removeEventListener("pageshow", onVisible); window.clearInterval(timer); };
  }, []);

  // Open jobs in the current view (finished and test jobs are skipped) that need a data check.
  const dataIssues = useMemo(() => filteredJobs
    .filter((job) => !isTestJob(jobId(job)) && !["done", "others"].includes(pinStyle(job).key))
    .map((job) => ({ job, issues: jobDataIssues(job) }))
    .filter((row) => row.issues.length), [filteredJobs]);

  // Finished in the field (an outcome is saved) but the package isn't approved yet: these get
  // closed out later, e.g. at the desk. Every job counts here, whatever the map filters.
  const closeOutJobs = useMemo(() => jobs.filter((job) => {
    const outcome = value(job, ["FieldOutcome", "fieldOutcome"]);
    return Boolean(FIELD_OUTCOMES[outcome]) && outcome !== "APPOINTMENT_REQUESTED" && !secondTryState(job)
      && !value(job, ["PackageApprovedAt"]) && !/approved/i.test(value(job, ["PackageReviewStatus"])) && jobQueue(job) !== "archived";
  }), [jobs]);
  const [closeOutOpen, setCloseOutOpen] = useState(false);
  // No access once: the job comes back for a 2nd try 72 hours later (due ones first).
  const secondTryJobs = useMemo(() => jobs
    .map((job) => ({ job, second: secondTryState(job) }))
    .filter((row): row is { job: JobRecord; second: NonNullable<ReturnType<typeof secondTryState>> } => Boolean(row.second) && jobQueue(row.job) !== "archived")
    .sort((a, b) => a.second.dueDay.localeCompare(b.second.dueDay)), [jobs]);
  const [secondTryOpen, setSecondTryOpen] = useState(false);
  // Stats sheet (chart button on the map): visits, outcomes, packages and money for today / this
  // week / this month, plus what is still open. The test job never counts.
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("today");
  const stats = useMemo(() => (statsOpen ? fieldStats(jobs, statsPeriod, { skip: (job) => isTestJob(jobId(job)) }) : null), [statsOpen, statsPeriod, jobs]);
  const statsOpenWork = useMemo(() => {
    if (!statsOpen) return null;
    const real = (job: JobRecord) => !isTestJob(jobId(job));
    return {
      toVisit: jobs.filter((job) => real(job) && jobQueue(job) === "pending" && pinStyle(job).key === "awarded").length,
      secondDue: secondTryJobs.filter((row) => real(row.job) && row.second.due).length,
      secondWaiting: secondTryJobs.filter((row) => real(row.job) && !row.second.due).length,
      closeOut: closeOutJobs.filter(real).length,
    };
  }, [statsOpen, jobs, secondTryJobs, closeOutJobs]);
  // Your past awards (description + amount) for the bid price help.
  const bidHistory = useMemo(() => jobs.filter((job) => !isTestJob(jobId(job))).map((job) => ({ id: jobId(job), description: value(job, ["ItbPage3Description", "JobDescription", "description"]), amount: jobAwardAmount(job), address: jobAddress(job) })), [jobs]);
  // End-of-day summary sheet (map menu): today's work, close-outs and what's due tomorrow.
  const [summaryOpen, setSummaryOpen] = useState(false);
  // One screen at a time: a map button closes whatever else is open (bids, notices, stats, today, follow-up,
  // summary, route, the job card, menus) before opening its own. Tapping it again closes it (back to the map).
  const closeScreens = (keep = "") => {
    if (keep !== "bids") setBidsOpen(false);
    if (keep !== "notices") { setNoticesOpen(false); setNoticeChooser(false); }
    if (keep !== "board") setBoardOpen(false);
    if (summaryToday) closeSummary();
    if (keep !== "stats") setStatsOpen(false);
    if (keep !== "agenda") setAgendaOpen(false);
    if (keep !== "follow") setFollowOpen(false);
    if (keep !== "summary") setSummaryOpen(false);
    if (keep !== "closeout") setCloseOutOpen(false);
    if (keep !== "secondtry") setSecondTryOpen(false);
    if (keep !== "route") setRouteCloseRequest((n) => n + 1);
    setSelectedJob(null);
    setFiltersOpen(false);
    setChromeOpen(false);
    setControlsOpen(false);
  };
  const [summaryStatus, setSummaryStatus] = useState("");
  const summary = useMemo(() => (summaryOpen ? daySummary(jobs, { id: jobId, address: jobAddress }) : null), [summaryOpen, jobs]);
  async function emailSummary() {
    if (!summary) return;
    setSummaryStatus("Sending…");
    const google = await googleStatus();
    if (!google.connected || !google.canEmail) { setSummaryStatus("Google isn't connected for email on this phone: use Share, or connect Google in Backup & recovery."); return; }
    const result = await sendTextEmail(`HPD field summary · ${summary.dayLabel}`, summary.text);
    setSummaryStatus(result.emailed ? `✉️ Emailed to ${result.emailTo.join(", ") || "you"}.` : result.error);
  }
  async function shareSummary() {
    if (!summary) return;
    try {
      if (navigator.share) { await navigator.share({ title: `HPD field summary · ${summary.dayLabel}`, text: summary.text }); return; }
      await navigator.clipboard.writeText(summary.text);
      setSummaryStatus("Copied: paste it into a message or email.");
    } catch { /* closed the share sheet */ }
  }
  // Appointments today (and anything within the next 2 hours), soonest first. A minute clock keeps
  // the countdowns on the pins and in the map alert current.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setMinuteTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (minuteTick) renderMarkersRef.current(); }, [minuteTick]);
  const upcomingAppointments = useMemo(() => jobs
    .map((job) => {
      const appointment = pinStyle(job).key === "appointment" ? activeAppointment(job) : null;
      return appointment ? { job, appointment, timing: appointmentTiming(appointment) } : null;
    })
    .filter((row): row is { job: JobRecord; appointment: Appointment; timing: ReturnType<typeof appointmentTiming> } => Boolean(row) && !row!.timing.past && (row!.timing.today || row!.timing.soon))
    .sort((a, b) => a.timing.startsIn - b.timing.startsIn),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [jobs, minuteTick]);

  function openIssueJob(job: JobRecord) {
    setCloseOutOpen(false);
    setDataCheckOpen(false);
    setSelectedJob(job);
    setSheetExpanded(false);
    const at = jobLatLng(job);
    if (at && mapRef.current) { followMeRef.current = false; mapRef.current.setView([at.lat, at.lng], Math.max(mapRef.current.getZoom(), 16)); }
  }

  useEffect(() => {
    if (!jobs.length || requestedJobLoaded.current) return;
    requestedJobLoaded.current = true;
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("omo") || params.get("job") || params.get("q") || "").trim().toUpperCase();
    // Open the linked job once, then take it out of the address: the iPhone app reopens the last
    // address, and a job left in it kept coming back. No forced search or borough either -- they
    // hid every other job.
    if (requested) {
      try { window.history.replaceState(null, "", window.location.pathname); } catch {}
    }
    if (!requested || selectedJob) return;
    const match = jobs.find((job) => jobId(job).toUpperCase() === requested);
    if (match) setSelectedJob(match);
  }, [jobs, selectedJob]);

  const boroughCounts = useMemo(() => {
    const counts: Record<BoroughKey, number> = { MN: 0, BK: 0, QN: 0, BX: 0, SI: 0 };
    jobs.forEach((job) => {
      const b = jobBorough(job);
      if (b in counts) counts[b as BoroughKey] += 1;
    });
    return counts;
  }, [jobs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, followup: 0, completed: 0, archived: 0 };
    jobs.forEach((job) => {
      const g = jobQueue(job);
      if (g in counts) counts[g] += 1;
    });
    return counts;
  }, [jobs]);

  const mappedCount = useMemo(() => jobs.filter((job) => jobLatLng(job)).length, [jobs]);

  const quickDateKey = daysBack !== null
    ? null
    : QUICK_DATE_RANGES.find(({ key }) => {
        const bounds = quickDateBounds(key, calendarDate);
        return bounds.from === dateRange.from && bounds.to === dateRange.to;
      })?.key ?? null;
  const activeFilterCount = (status !== "pending" ? 1 : 0) + (borough !== "ALL" ? 1 : 0)
    + (dateRange.field !== "award" || quickDateKey !== "year" ? 1 : 0);

  function applyQuickDate(key: QuickDateKey) {
    setDaysBack(null);
    setCustomDateRange(false);
    const bounds = quickDateBounds(key, calendarDate);
    setDateRange(key === "year" && dateRange.field === "award" ? currentYearRange() : { field: dateRange.field, preset: false, ...bounds });
  }

  function resetQuickFilters() {
    setFollowFilter("");
    setStatus("pending");
    setBorough("ALL");
    setDaysBack(null);
    setCustomDateRange(false);
    setDateRange(currentYearRange());
  }

  useEffect(() => {
    const previousBg = document.body.style.background;
    document.body.style.background = "#05070c";
    return () => {
      document.body.style.background = previousBg;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      if (!mapNode.current) return;
      const leafletModule = await import("leaflet");
      const L = (leafletModule as any).default || leafletModule;
      if (cancelled || !mapNode.current) return;

      const points = filteredJobs
        .map((job) => {
          const ll = jobLatLng(job);
          return ll ? { job, lng: ll.lng, lat: ll.lat } : null;
        })
        .filter((p): p is { job: JobRecord; lng: number; lat: number } => p !== null);
      pointsRef.current = points;

      if (!mapRef.current) {
        const lastView = savedMapView();
        const map = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: true,
        }).setView(lastView ? [lastView.lat, lastView.lng] : [40.72, -73.95], lastView ? lastView.zoom : 10);
        // Reopening starts where the map was left, not zoomed out to the whole city.
        if (lastView) restoredMapViewRef.current = true;
        map.on("dragstart", () => { followMeRef.current = false; });
        map.on("moveend", () => {
          const center = map.getCenter();
          try { localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })); } catch {}
        });
        mapRef.current = map;
        setRouteMapReady(true);
        tileLayerRef.current = L.tileLayer(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL, { maxZoom: 20, maxNativeZoom: darkTiles ? 16 : 19, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, contributors' }).addTo(map);
        // Keep raster streets underneath until the vector map is ready, including on unsupported devices.
        import("@maplibre/maplibre-gl-leaflet").then(async ({ maplibreGL }) => {
          const { setWorkerUrl } = await import("maplibre-gl");
          setWorkerUrl("/map-worker/maplibre-gl-worker.mjs");
          if (mapRef.current !== map) return;
          let vector: any;
          try {
            vector = maplibreGL({
              style: "https://tiles.openfreemap.org/styles/liberty",
              attributionControl: false,
              interactive: false,
              pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
            }).addTo(map);
            vectorLayerRef.current = vector;
            vector.getContainer().style.opacity = darkTilesRef.current ? "0" : "1";
            const gl = vector.getMaplibreMap();
            gl.once("style.load", () => {
              for (const layer of gl.getStyle().layers) {
                if (layer.type === "symbol" && layer["source-layer"] === "poi") gl.setLayoutProperty(layer.id, "visibility", "none");
                if (layer.type === "background") gl.setPaintProperty(layer.id, "background-color", "#eef0ed");
                if (layer.type === "fill") {
                  const colors: Record<string, string> = {
                    water: "#a5d7e5", landuse_residential: "#e9ede8", building: "#d3d9d5",
                    park: "#b8d8ab", landcover_wood: "#a9ce9e", landcover_grass: "#c5dfb8",
                  };
                  if (colors[layer.id]) gl.setPaintProperty(layer.id, "fill-color", colors[layer.id]);
                }
                if (layer.type === "line" && /^(road|bridge|tunnel)_/.test(layer.id) && !/rail|path/.test(layer.id)) {
                  gl.setPaintProperty(layer.id, "line-color", layer.id.endsWith("_casing") ? "#cbd2d0" : "#ffffff");
                }
              }
            });
            gl.once("load", () => {
              if (mapRef.current !== map || vectorLayerRef.current !== vector) return;
              vector.getContainer().dataset.ready = "true";
              vector.getContainer().style.opacity = darkTilesRef.current ? "0" : "1";
              if (!darkTilesRef.current) tileLayerRef.current?.remove();
              map.attributionControl.addAttribution('<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>');
            });
            gl.on("error", (event: { error?: Error }) => {
              console.warn("Clean Streets map unavailable; using street-map fallback.", event.error?.message);
              // A failed style or tile must not leave an empty map above the fallback.
              if (mapRef.current === map && vectorLayerRef.current === vector) {
                vector.getContainer().style.opacity = "0";
                vector.getContainer().dataset.ready = "false";
                tileLayerRef.current?.addTo(map);
              }
            });
          } catch {
            vector?.remove();
            vectorLayerRef.current = null;
          }
        }).catch(() => { /* Raster streets remain available if the vector bundle cannot load. */ });
        L.control.scale({ position: "bottomright", metric: false, imperial: true }).addTo(map);

        map.createPane("boroughLabels");
        map.getPane("boroughLabels").style.zIndex = "350";
        map.getPane("boroughLabels").style.pointerEvents = "none";

        boroughLabelLayerRef.current = L.layerGroup(
          BOROUGHS.map((b) =>
            L.marker(b.center, {
              icon: L.divIcon({ className: "", html: boroughLabelHtml(b.label, darkTiles), iconSize: [140, 24], iconAnchor: [70, 12] }),
              interactive: false,
              pane: "boroughLabels",
            })
          )
        ).addTo(map);

        const updateBoroughLabelVisibility = () => {
          const visible = map.getZoom() <= 12;
          boroughLabelLayerRef.current?.eachLayer((layer: any) => {
            layer.setOpacity(visible ? 1 : 0);
          });
        };
        map.on("zoomend", updateBoroughLabelVisibility);
        updateBoroughLabelVisibility();

        layerGroupRef.current = L.layerGroup().addTo(map);

        renderMarkersRef.current = () => {
          if (!layerGroupRef.current) return;
          layerGroupRef.current.clearLayers();
          const occupied: { x: number; y: number }[] = [];
          let focusDistance = Math.min(map.getSize().x, map.getSize().y) * 0.35;
          let focusElement: HTMLElement | null = null;
          // Once per redraw, not per job: the visible area (plus a margin).
          const visibleArea = map.getBounds().pad(0.1);
          groupByLocation(pointsRef.current).forEach((location) => {
            // Off-screen places are skipped before any per-job work (status, visits, priority).
            if (!visibleArea.contains([location.lat, location.lng]) && map.getZoom() < 17) return;
            location.jobs.forEach((job, index) => {
              const offset = map.getZoom() >= 17 ? individualPinOffset(index, location.jobs.length) : { x: 0, y: 0 };
              const origin = map.latLngToLayerPoint([location.lat, location.lng]);
              const position = map.layerPointToLatLng(L.point(origin.x + offset.x, origin.y + offset.y));
              if (!visibleArea.contains(position)) return;
              const meta = { ...jobStatusMeta(job), ...pinStyle(job) };
              const visit = visitState(job);
              const priority = jobPriority(job);
              const title = `${jobId(job)} - ${meta.label} - ${priority.label} - ${visit.label} - ${visit.count} visits`;
              const screen = map.latLngToContainerPoint(position);
              const showLabel = reservePinLabel(screen.x, screen.y, occupied);
              const lit = glowRef.current.get(jobId(job));
              const html = (showLabel || lit
                ? jobPinHtml(job, meta, priority, visit.count)
                : `<span class="fc-job-dot" style="--pin-color:${meta.color}"></span>`)
                + (lit ? `<span class="fc-glow-tag">${lit.tag}</span>` : "");
              if (map.getZoom() >= 17 && location.jobs.length > 1) {
                L.polyline([[location.lat, location.lng], position], { color: meta.color, weight: 1, opacity: 0.7, interactive: false }).addTo(layerGroupRef.current);
              }
              // Pins grow as you zoom in; the one nearest the middle of the screen is the focus.
              const zoomClass = map.getZoom() >= 18 ? " is-z18" : map.getZoom() >= 16 ? " is-z16" : "";
              // The pin's tip sits on the building.
              const big = showLabel || Boolean(lit);
              const icon = L.divIcon({ className: (big ? "fc-label-marker" : "fc-dot-marker") + zoomClass + (lit ? ` ${lit.cls}` : ""), html, iconSize: big ? [36, 42] : [14, 14], iconAnchor: big ? [18, 40] : [7, 7] });
              const marker = L.marker(position, { icon, title: lit ? `${title} - ${lit.tag}` : title, zIndexOffset: lit ? 3000 : showLabel ? 1000 : 0 });
              marker.on("click", () => {
                if (!big || location.jobs.length > 1) map.setView([location.lat, location.lng], Math.max(17, map.getZoom()));
                else pinTapRef.current = true;
                setSelectedJob(job);
              });
              marker.addTo(layerGroupRef.current);
              marker.getElement()?.setAttribute("aria-label", title);
              if (big && map.getZoom() >= 15) {
                const size = map.getSize();
                const distance = Math.hypot(screen.x - size.x / 2, screen.y - size.y / 2);
                if (distance < focusDistance) { focusDistance = distance; focusElement = marker.getElement() || null; }
              }
            });
          });
          focusElement?.classList.add("is-focus");
        };

        // Recompute visible labels after movement; retain individual dots for crowded jobs.
        map.on("moveend", () => renderMarkersRef.current());

      }

      const map = mapRef.current;

      // Only a borough tap or a search moves the map. Date windows (30/60/90) and status
      // filters just change which pins show; the map stays on you.
      // The HPD notices layer frames its jobs too (they're spread over the city).
      const framing = `${borough}|${search}|${followFilter === "notices" ? `notices-${noticeKind}` : ""}|${showOlderLayer ? "older" : ""}`;
      if (mapFramingRef.current !== framing && points.length && restoredMapViewRef.current && !mapFramingRef.current) {
        // First load after reopening: keep the saved view; later filter/search changes still frame.
        mapFramingRef.current = framing;
      } else if (mapFramingRef.current !== framing && points.length) {
        mapFramingRef.current = framing;
        const openJob = openJobKeyRef.current ? points.find((point) => jobId(point.job) === openJobKeyRef.current) : null;
        if (openJob) {
          // A job card is open: it has priority, keep its pin in view above the card.
          showJobAboveCard(openJob.lat, openJob.lng);
        } else if (points.length === 1) {
          map.setView([points[0].lat, points[0].lng], 15);
        } else if (points.length > 1 && borough === "ALL" && !search.trim() && followFilter !== "notices" && !showOlderLayer) {
          // Back to All: return to you, never to a fixed point in the city.
          const me = lastPositionRef.current;
          if (me) { followMeRef.current = true; map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15)); }
        } else if (points.length > 1) {
          const bounds = points.map((p) => [p.lat, p.lng]) as [number, number][];
          if (followFilter === "notices") map.fitBounds(bounds, { paddingTopLeft: [16, 150], paddingBottomRight: [84, noticeMiniRef.current ? 110 : 360], maxZoom: 15 });
          else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
      }
      renderMarkersRef.current();
    }

    draw();
    return () => {
      cancelled = true;
    };
  }, [filteredJobs, borough, search, status, daysBack, dateRange, followFilter, showOlderLayer]);

  useEffect(() => {
    darkTilesRef.current = darkTiles;
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.options.maxNativeZoom = darkTiles ? 16 : 19;
    tileLayerRef.current.setUrl(darkTiles ? DARK_TILE_URL : LIGHT_TILE_URL);
    const container = vectorLayerRef.current?.getContainer();
    const useVector = !darkTiles && container?.dataset.ready === "true";
    if (container) container.style.opacity = useVector ? "1" : "0";
    if (useVector) tileLayerRef.current.remove();
    else tileLayerRef.current.addTo(mapRef.current);
  }, [darkTiles]);
  // The glow follows the picked notice kind and the countdowns.
  useEffect(() => { renderMarkersRef.current?.(); }, [glowKey]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    vectorLayerRef.current = null;
  }, []);

  useEffect(() => {
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
  }, [borough, status, search, daysBack, dateRange, jobs]);

  useEffect(() => {
    if (selectedJob) {
      const match = jobs.find((job) => jobId(job) === jobId(selectedJob));
      if (!match) setSelectedJob(null);
      else if (match !== selectedJob) setSelectedJob(match);
    }
  }, [jobs, selectedJob]);

  useEffect(() => {
    setScopeOpen(false);
    setSheetExpanded(false);
    if (selectedJob) setControlsOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedJob]);


  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize({ pan: false });
      const point = selectedJob && jobLatLng(selectedJob);
      if (point && !sheetExpanded) {
        map.panInside([point.lat, point.lng], { paddingTopLeft: [24, 24], paddingBottomRight: [60, (jobSheetRef.current?.offsetHeight || 280) + 20] });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedJob, sheetExpanded]);

  useEffect(() => {
    if (!selectedJob) return;
    refreshMediaCounts(selectedJob);
  }, [selectedJob]);

  useEffect(() => {
    if (locateStatus !== "error") return;
    const timer = setTimeout(() => setLocateStatus("idle"), 4000);
    return () => clearTimeout(timer);
  }, [locateStatus]);

  const mappedFilteredCount = useMemo(
    () => filteredJobs.filter((job) => jobLatLng(job)).length,
    [filteredJobs]
  );

  function toggleTileStyle() {
    setDarkTiles((prev) => !prev);
  }

  async function placeUserMarker(latitude: number, longitude: number) {
    lastPositionRef.current = { lat: latitude, lng: longitude };
    if (!mapRef.current) return;
    const leafletModule = await import("leaflet");
    const L = (leafletModule as any).default || leafletModule;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([latitude, longitude]);
      return;
    }
    const icon = L.divIcon({
      className: "fc-you-marker",
      html: '<div class="fc-you-are-here"><span class="fc-you-are-here-pulse"></span><span class="fc-you-are-here-dot"></span><span class="fc-you-are-here-label">You</span></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    userMarkerRef.current = L.marker([latitude, longitude], { icon, interactive: false, zIndexOffset: 1000 }).addTo(mapRef.current);
  }

  useEffect(() => {
    if (!routeMapReady || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocateStatus("idle");
        const { latitude, longitude } = position.coords;
        placeUserMarker(latitude, longitude);
        lastPositionRef.current = { lat: latitude, lng: longitude };
        lastFixRef.current = { lat: latitude, lng: longitude, accuracy: position.coords.accuracy || 0, at: Date.now() };
        autoArriveRef.current(latitude, longitude, position.coords.accuracy || 0);
        if (!mapRef.current) return;
        if (!centeredOnMeRef.current) {
          // Opening the app: go straight to where you are.
          centeredOnMeRef.current = true;
          if (followMeRef.current) mapRef.current.setView([latitude, longitude], Math.max(mapRef.current.getZoom(), 15));
        } else if (followMeRef.current) {
          // Follow mode: keep the map on you as you move.
          mapRef.current.panTo([latitude, longitude], { animate: true });
        }
      },
      () => setLocateStatus("error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [routeMapReady]);

  // Step 1: arrival records the time and where you are, shows you on the map and how far the job is.
  // Automatic arrival: you tapped Waze/Google for the open job and your phone is now within 75 m
  // of it, so "I have arrived" is saved for you (time + GPS), once.
  const autoArriveRef = useRef<(lat: number, lng: number, accuracy: number) => void>(() => {});
  const autoArrivedRef = useRef<Set<string>>(new Set());
  autoArriveRef.current = (lat, lng, accuracy) => {
    const job = selectedJob;
    if (!job) return;
    const id = jobId(job);
    if (workflowStamps[id]?.arrived || value(job, ["FieldArrivedAt"]) || !value(job, ["TravelStartedAt"]) || autoArrivedRef.current.has(id)) return;
    const at = jobLatLng(job);
    if (!at || accuracy > 100) return;
    const meters = distanceMiles({ lat, lng }, at) * 1609.34;
    if (meters > 75) return;
    autoArrivedRef.current.add(id);
    saveWorkflowStamp(job, "arrived");
    const patch = { ArrivedLatitude: lat, ArrivedLongitude: lng, ArrivedAccuracyMeters: Math.round(accuracy), ArrivedAutomatically: true,
      FieldVisitHistory: visitHistoryWith(job, "Arrived (automatic, by GPS)", { lat, lng, accuracy, at: Date.now() }) };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
    setOutcomeMessage(`📍 You're at the job (${Math.round(meters * 3.28)} ft away): arrival saved automatically.`);
  };

  // The job's visit history plus one entry (no outcome), carrying where the phone was.
  function visitHistoryWith(job: JobRecord, note: string, fix: GpsFix | null) {
    const id = jobId(job);
    const latest = { ...job, ...(readSharedWorkflowOverrides()[id] || {}) };
    const history = Array.isArray(latest.FieldVisitHistory) ? latest.FieldVisitHistory : [];
    return [...history, { recordedAt: new Date().toISOString(), outcome: null, note, ...visitLocationFields(fix, jobLatLng(job)) }];
  }
  // Adds the phone's location to the newest visit-history entry of an outcome patch.
  function withVisitLocation(job: JobRecord, patch: Record<string, unknown>) {
    const history = Array.isArray(patch.FieldVisitHistory) ? [...patch.FieldVisitHistory] : null;
    if (!history?.length) return patch;
    history[history.length - 1] = { ...history[history.length - 1], ...visitLocationFields(lastFixRef.current, jobLatLng(job)) };
    return { ...patch, FieldVisitHistory: history };
  }

  function markArrived(job: JobRecord) {
    const id = jobId(job);
    saveWorkflowStamp(job, "arrived");
    const saveArrivalAt = (latitude: number, longitude: number, accuracy: number) => {
      lastPositionRef.current = { lat: latitude, lng: longitude };
      lastFixRef.current = { lat: latitude, lng: longitude, accuracy, at: Date.now() };
      const patch = { ArrivedLatitude: latitude, ArrivedLongitude: longitude, ArrivedAccuracyMeters: Math.round(accuracy),
        FieldVisitHistory: visitHistoryWith(job, "Arrived", lastFixRef.current) };
      try { writeSharedWorkflowPatch(id, patch); } catch {}
      mergeWorkflowPatchIntoScreen(id, patch);
      const at = jobLatLng(job);
      if (at) {
        const feet = Math.round(distanceMiles({ lat: latitude, lng: longitude }, at) * 5280);
        setOutcomeMessage(feet < 1000 ? `Arrived. You're about ${feet} ft from the job.` : `Arrived. Location saved, but you're ${(feet / 5280).toFixed(1)} mi from the job address.`);
      }
    };
    // The map is already following the phone: a fix from the last 30 seconds is used right away.
    const fix = lastFixRef.current;
    if (fix && fix.at && Date.now() - fix.at < 30_000) {
      saveArrivalAt(fix.lat, fix.lng, fix.accuracy || 0);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        void placeUserMarker(latitude, longitude);
        saveArrivalAt(latitude, longitude, accuracy);
      },
      () => setOutcomeMessage("Arrived. Time saved; location wasn't available."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 }
    );
  }

  function locateMe() {
    followMeRef.current = true;
    if (!navigator.geolocation) {
      setLocateStatus("error");
      return;
    }
    if (lastPositionRef.current && mapRef.current) {
      mapRef.current.flyTo([lastPositionRef.current.lat, lastPositionRef.current.lng], 15);
      return;
    }
    setLocateStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocateStatus("idle");
        const { latitude, longitude } = position.coords;
        placeUserMarker(latitude, longitude);
        mapRef.current?.flyTo([latitude, longitude], 15);
      },
      () => setLocateStatus("error"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  // numbers: each open stop's place on the route (finished stops keep theirs); done: finished stops (✓).
  async function drawDayRoute(stops: RouteJob[], origin: RoutePoint, numbers?: number[], done: RouteJob[] = []): Promise<RoadRoute | null> {
    const request = ++dayRouteRequest.current;
    const leafletModule = await import("leaflet");
    if (request !== dayRouteRequest.current || !mapRef.current) return null;
    const L = (leafletModule as any).default || leafletModule;
    dayRouteLayerRef.current?.remove();
    dayRouteLayerRef.current = null;
    if (!stops.length && !done.length) return null;
    for (const [name, z] of [["fc-route-path", "610"], ["fc-route-stops", "620"]]) {
      const pane = mapRef.current.getPane(name) || mapRef.current.createPane(name);
      pane.style.zIndex = z;
    }
    const points = [origin, ...stops];
    const stopMarkers = () => [
      L.marker([origin.lat, origin.lng], { pane: "fc-route-stops", interactive: false, icon: L.divIcon({ className: "fc-route-start", html: "", iconSize: [18, 18], iconAnchor: [9, 9] }) }),
      ...done.map((job) => L.marker([job.lat, job.lng], {
        icon: L.divIcon({ className: "fc-route-done", html: "✓", iconSize: [26, 26], iconAnchor: [13, 13] }),
        pane: "fc-route-stops", title: `Done: ${job.id}`, zIndexOffset: 1500,
      }).on("click", () => setSelectedJob(jobs.find((row) => jobId(row) === job.id) || null))),
      ...stops.map((job, index) => L.marker([job.lat, job.lng], {
        icon: L.divIcon({ className: `fc-route-number${index === 0 ? " is-next" : ""}`, html: String(numbers?.[index] ?? index + 1), iconSize: [32, 32], iconAnchor: [16, 16] }),
        pane: "fc-route-stops", title: `Route stop ${numbers?.[index] ?? index + 1}: ${job.id}`, zIndexOffset: 2000,
      }).on("click", () => setSelectedJob(jobs.find((row) => jobId(row) === job.id) || null))),
    ];
    const show = (layers: any[]) => {
      dayRouteLayerRef.current?.remove();
      dayRouteLayerRef.current = L.featureGroup(layers).addTo(mapRef.current);
    };
    // Right away: just the numbered stops. No straight stop-to-stop lines; the street route follows.
    show(stopMarkers());
    // Fit the route into the part of the map above the route panel and below the pills.
    mapRef.current.fitBounds(dayRouteLayerRef.current.getBounds(), { paddingTopLeft: [28, 150], paddingBottomRight: [56, Math.round(window.innerHeight * 0.38) + 90], maxZoom: 15 });
    if (!stops.length) return null;
    const road = await fetchRoadRoute(points);
    if (!road || request !== dayRouteRequest.current || !mapRef.current) return request === dayRouteRequest.current ? road : null;
    // The street route: white casing, blue line, a direction arrow halfway along each leg.
    const arrows = road.legs.flatMap((leg) => {
      if (leg.path.length < 2) return [];
      const mid = Math.floor(leg.path.length / 2);
      const a = mapRef.current.project(leg.path[Math.max(0, mid - 1)], 15);
      const b = mapRef.current.project(leg.path[Math.min(leg.path.length - 1, mid + 1)], 15);
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      return [L.marker(leg.path[mid], { pane: "fc-route-stops", interactive: false, icon: L.divIcon({ className: "fc-route-direction", html: `<span style="transform:rotate(${angle}deg)"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }) })];
    });
    show([
      L.polyline(road.path, { pane: "fc-route-path", color: "#ffffff", weight: 9, opacity: 0.95, lineJoin: "round", interactive: false }),
      L.polyline(road.path, { pane: "fc-route-path", color: "#1267df", weight: 5, opacity: 1, lineJoin: "round", interactive: false }),
      ...arrows,
      ...stopMarkers(),
    ]);
    return road;
  }

  const routeJobs = useMemo<RouteJob[]>(() => jobs.flatMap(job => {
    const point = jobLatLng(job); if (!point || isTestJob(jobId(job))) return [];
    const queue = jobQueue(job);
    // Finished today (an outcome saved today that still stands): shown as done on Today's route.
    const today = nyToday();
    const history = (Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : []) as { recordedAt?: string; outcome?: string | null }[];
    const last = [...history].reverse().find((entry) => entry?.outcome && newYorkDay(entry.recordedAt) === today);
    const done = last && queue !== 'pending' && FIELD_OUTCOMES[String(last.outcome)] ? { at: String(last.recordedAt), label: FIELD_OUTCOMES[String(last.outcome)] } : undefined;
    return [{id:jobId(job),address:jobAddress(job),borough:jobBorough(job),...point,days:jobPriority(job).days,pending:queue==='pending',closed:queue==='completed'||queue==='archived',blocked:visitState(job).blocked,appointment:job.Appointment as Appointment|undefined,done}];
  }), [jobs, calendarDate]);

  // "Everything is correct": takes a finished job off the active map. Only offered once its
  // paperwork is approved; archived jobs stay under Status > Archive.
  async function archiveJob(job: JobRecord) {
    const id = jobId(job);
    if (!window.confirm(`Archive ${id}? Only do this if the work, paperwork and email are all correct.`)) return;
    const now = new Date().toISOString();
    const patch = { ArchivedFromMap: true, archivedFromMap: true, ArchivedAt: now, archivedAt: now };
    try { writeSharedWorkflowPatch(id, patch); }
    catch { setOutcomeMessage("Could not archive on this device. Please retry."); return; }
    mergeWorkflowPatchIntoScreen(id, patch);
    setSelectedJob(null);
    // Saved on this device and queued: sent to the status server now or once back online.
    void flushOverrideOutbox(HPD_STATUS_WORKER_URL);
  }

  function mergeWorkflowPatchIntoScreen(id: string, patch: Record<string, unknown>) {
    setJobs((prev) => prev.map((row) => (jobId(row) === id ? { ...row, ...patch } : row)));
    setSelectedJob((prev) => (prev && jobId(prev) === id ? { ...prev, ...patch } : prev));
  }

  function workflowPatchForAction(
    key: "arrived" | "visit" | "work" | "status" | "complete",
    iso: string,
    statusLabel?: string
  ) {
    if (key === "arrived") {
      return arrivalVisitPatch(iso);
    }
    if (key === "visit") {
      return {
        WorkflowStatus: "VISIT_STARTED",
        workflowStatus: "VISIT_STARTED",
        FieldOutcome: "VISIT_STARTED",
        fieldOutcome: "VISIT_STARTED",
        StatusOverride: "Visit Started",
        status: "Visit Started",
        VisitStartedAt: iso,
        visitStartedAt: iso,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }
    if (key === "work") {
      return {
        WorkflowStatus: "WORK_STARTED",
        workflowStatus: "WORK_STARTED",
        FieldOutcome: "WORK_STARTED",
        fieldOutcome: "WORK_STARTED",
        StatusOverride: "Work In Progress",
        status: "Work In Progress",
        JobStartedAt: iso,
        jobStartedAt: iso,
        ActualWorkStartDate: iso,
        actualWorkStartDate: iso,
        FieldTimerStartedAt: iso,
        fieldTimerStartedAt: iso,
        OutcomeLockedAt: iso,
        outcomeLockedAt: iso,
      };
    }
    if (key === "complete") {
      return {
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
        PackageReviewStatus: "Pending",
      };
    }
    if (String(statusLabel || "").toLowerCase().includes("refused")) {
      return {
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
        PackageReviewStatus: "Pending",
      };
    }
    return {
      WorkflowStatus: "NO_ACCESS_1_WAITING_72H",
      workflowStatus: "NO_ACCESS_1_WAITING_72H",
      FieldOutcome: "NO_ACCESS_1_WAITING_72H",
      fieldOutcome: "NO_ACCESS_1_WAITING_72H",
      StatusOverride: "No Access 1st - Waiting 72h",
      status: "No Access 1st - Waiting 72h",
      NoAccessFirstAttemptAt: iso,
      noAccessFirstAttemptAt: iso,
      SecondAttemptAvailableAt: new Date(new Date(iso).getTime() + 72 * 60 * 60 * 1000).toISOString(),
      secondAttemptAvailableAt: new Date(new Date(iso).getTime() + 72 * 60 * 60 * 1000).toISOString(),
      OutcomeLockedAt: iso,
      outcomeLockedAt: iso,
    };
  }

  function saveWorkflowStamp(job: JobRecord, key: "arrived" | "visit" | "work" | "status", statusLabel?: string) {
    const id = jobId(job);
    const now = new Date().toISOString();
    const patch = workflowPatchForAction(key, now, statusLabel);
    try { writeSharedWorkflowPatch(id, patch); }
    catch {
      setOutcomeMessage("Could not save this step on this device. Please retry.");
      return;
    }
    setWorkflowStamps((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: now,
        ...(statusLabel ? { status: statusLabel } : {}),
      },
    }));
    mergeWorkflowPatchIntoScreen(id, patch);
  }

  function openAppointment() {
    setAppointmentOpen(true);
    setSheetExpanded(true);
    requestAnimationFrame(() => appointmentRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function saveAppointment(job: JobRecord, appointment: Appointment) {
    const id = jobId(job);
    const latest = { ...job, ...readSharedWorkflowOverrides()[id] };
    const patch = appointmentPatch(latest, appointment);
    writeSharedWorkflowPatch(id, patch);
    mergeWorkflowPatchIntoScreen(id, patch);
    setWorkflowStamps(prev => ({ ...prev, [id]: { ...prev[id], status: patch.status } }));
    if (["requested", "confirmed"].includes(appointment.state)) {
      setAppointmentOpen(false);
      setOutcomeMessage(`📅 ${id}: appointment saved for ${appointmentLabel(appointment)}. Tap "🔔 Add to Calendar" so your iPhone reminds you even with the app closed; the pin also lights up on the map as the time gets close.`);
    }
  }

  // Records an outcome right away (no draft, no page change).
  function setJobOutcome(job: JobRecord, outcome: string, note: string) {
    if (paperworkLock(job).locked && !isTestJob(jobId(job))) { setOutcomeMessage(lockedMessage(jobId(job), paperworkLock(job))); return; }
    const id = jobId(job);
    try {
      const patch = withVisitLocation(job, fieldOutcomePatch(job, outcome, note, new Date().toISOString()));
      writeSharedWorkflowPatch(id, patch);
      mergeWorkflowPatchIntoScreen(id, patch);
      setWorkflowStamps((prev) => ({ ...prev, [id]: { ...prev[id], status: FIELD_OUTCOMES[outcome] } }));
      const waiting = secondTryState({ ...job, ...patch });
      setOutcomeMessage(waiting ? secondTryMessage(id, waiting.dueLabel) : `✅ ${id}: ${FIELD_OUTCOMES[outcome]}. This job is finished.`);
      if (outcome !== "APPOINTMENT_REQUESTED" && !waiting) setAutoPackage({ id, outcome, seconds: 6 });
    } catch (error) {
      setOutcomeMessage(error instanceof Error ? error.message : "Could not save the outcome. Try again.");
    }
  }

  function secondTryMessage(id: string, dueLabel: string) {
    return `🔒 ${id}: no access saved as the 1st try. Come back from ${dueLabel} for the 2nd try; the affidavit needs both.`;
  }
  // 2nd visit after a no-access try: the door opened, so the job goes back to the normal work steps.
  function gotInOnSecondTry(job: JobRecord) {
    if (paperworkLock(job).locked && !isTestJob(jobId(job))) { setOutcomeMessage(lockedMessage(jobId(job), paperworkLock(job))); return; }
    const id = jobId(job);
    const now = new Date().toISOString();
    const latest = { ...job, ...(readSharedWorkflowOverrides()[id] || {}) };
    const history = Array.isArray(latest.FieldVisitHistory) ? latest.FieldVisitHistory : [];
    const patch = { ...arrivalVisitPatch(now), FieldOutcome: "", fieldOutcome: "", WorkflowStatus: "", workflowStatus: "", StatusOverride: "Got access on the 2nd try", status: "Got access on the 2nd try",
      PackageReviewStatus: "", OutcomeLockedAt: "", outcomeLockedAt: "", FieldVisitHistory: [...history, { recordedAt: now, outcome: null, note: "Got access on the 2nd try", ...visitLocationFields(lastFixRef.current, jobLatLng(job)) }] };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
    // Getting in counts as today's arrival and visit start, so the card goes straight to the before photos.
    setWorkflowStamps((prev) => ({ ...prev, [id]: { ...prev[id], arrived: now, visit: now, status: "" } }));
    setOutcomeMessage(`🚪 ${id}: got in. Take the before photos to start the work.`);
    requestMediaUpload("before", true);
  }

  function saveVisitOutcome(job: JobRecord, review = false) {
    const id = jobId(job);
    const draft = outcomeDrafts[id] || { outcome: "", note: "" };
    if (draft.outcome && paperworkLock(job).locked && !isTestJob(id)) { setOutcomeMessage(lockedMessage(id, paperworkLock(job))); return; }
    try {
      const patch = withVisitLocation(job, fieldOutcomePatch(job, draft.outcome, draft.note, new Date().toISOString()));
      writeSharedWorkflowPatch(id, patch);
      mergeWorkflowPatchIntoScreen(id, patch);
      if (draft.outcome) setWorkflowStamps((prev) => ({ ...prev, [id]: { ...prev[id], status: FIELD_OUTCOMES[draft.outcome] } }));
      setOutcomeDrafts((prev) => ({ ...prev, [id]: { outcome: "", note: "" } }));
      const waiting = draft.outcome ? secondTryState({ ...job, ...patch }) : null;
      setOutcomeMessage(waiting ? secondTryMessage(id, waiting.dueLabel) : draft.outcome
        ? `✅ ${id} is ${FIELD_OUTCOMES[draft.outcome]}. This job is finished.`
        : "Note saved on this device.");
      if (draft.outcome && draft.outcome !== "APPOINTMENT_REQUESTED" && !review && !waiting) setAutoPackage({ id, outcome: draft.outcome, seconds: 6 });
      if (review && !waiting) openPackageSheet(id, paperworkGenerateHref(id, draft.outcome));
    } catch (error) {
      setOutcomeMessage(error instanceof Error ? error.message : "Save failed. Your draft is still here.");
    }
  }

  async function refreshMediaCounts(job: JobRecord) {
    const id = jobId(job);
    // Lite: videos are counted, never read (reading them crashed the app on big videos).
    const rows = await listFieldEvidenceLite(id);
    setMediaCounts((prev) => ({
      ...prev,
      [id]: {
        before: rows.filter((media) => media.kind === "before").length,
        after: rows.filter((media) => media.kind === "after").length,
        total: rows.length,
        beforeVideos: rows.filter((media) => media.kind === "before" && media.mediaType === "video").length,
        beforeDay: localDay(rows.find((media) => media.kind === "before" && media.capturedAt)?.capturedAt),
        afterDay: localDay(rows.find((media) => media.kind === "after" && media.capturedAt)?.capturedAt),
        afterVideos: rows.filter((media) => media.kind === "after" && media.mediaType === "video").length,
      },
    }));
    const thumbs = (kind: string) => rows
      .filter((media) => media.kind === kind)
      .map((media) => media.dataUrl)
      .filter(Boolean)
      .slice(-3);
    setMediaThumbs((prev) => ({ ...prev, [id]: { before: thumbs("before"), after: thumbs("after") } }));
  }

  // From a guided step the photo/video buttons open right inside that step, glowing.
  async function changeMediaDate(job: JobRecord, kind: "before" | "after", day: string) {
    if (!day) return;
    setMediaBusy(kind);
    try {
      const count = await redateFieldEvidence(jobId(job), kind, day);
      await refreshMediaCounts(job);
      if (kind === "before") {
        // The before photos are when the work started: the affidavit's work start follows them.
        const [y, m, d] = day.split("-").map(Number);
        const startedAt = new Date(y, m - 1, d, 12).toISOString();
        const patch = { ActualWorkStartDate: startedAt, actualWorkStartDate: startedAt, JobStartedAt: startedAt, jobStartedAt: startedAt };
        try { writeSharedWorkflowPatch(jobId(job), patch); } catch {}
        mergeWorkflowPatchIntoScreen(jobId(job), patch);
      }
      const [y, m, d] = day.split("-");
      setMediaMessage(`📅 ${count} ${kind} photo/video date(s) changed to ${m}/${d}/${y}. Photos show the new date; the affidavit uses it too.`);
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : "The date could not be changed.");
    } finally {
      setMediaBusy(null);
    }
  }

  function requestMediaUpload(kind: FieldMediaKind, fromStep = false) {
    setAutoPackage(null);
    setMediaChoice(kind);
    setMediaChoiceInStep(fromStep);
    requestAnimationFrame(() => (fromStep ? document.querySelector(".jc-step-media") : mediaChoiceRef.current)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  function chooseMediaSource(source: "camera" | "library" | "video-camera" | "video-library") {
    if (!mediaChoice || mediaBusy) return;
    const kind = mediaChoice;
    pendingMediaKindRef.current = kind;
    if (source === "video-camera") videoCameraInputRef.current?.click();
    else if (source === "video-library") videoLibraryInputRef.current?.click();
    else if (source === "camera") cameraInputRef.current?.click();
    else mediaInputRef.current?.click();
    setMediaChoice(null);
  }

  async function handleMediaFiles(files: FileList | null) {
    if (!selectedJob || !files?.length) return;
    const kind = pendingMediaKindRef.current;
    const id = jobId(selectedJob);
    setMediaBusy(kind);
    setMediaMessage("");
    try {
      const saved = await saveFieldPhotos(id, kind, Array.from(files), {
        jobId: id,
        address: jobAddress(selectedJob),
        location: jobAddress(selectedJob),
        borough: String(jobBorough(selectedJob)),
        outcome: workflowStamps[id]?.status || jobStatus(selectedJob),
        label: kind === "before" ? "Before Work Evidence" : "After Work Evidence",
      });
      await refreshMediaCounts(selectedJob);
      const unstamped = saved.filter(item => item.mediaType === "video" && item.stamped === false).length;
      setMediaMessage(saved.length ? `${kind === "before" ? "Before" : "After"} media saved: ${saved.length}.${unstamped ? ` ${unstamped} video(s) saved as originals without burned-in labels; review before submitting.` : ""}` : "No image or video was saved.");
      // Before photos mark the work start (date used on the affidavit); no separate "Start work" tap.
      if (kind === "before" && saved.length && !workflowStamps[id]?.work) saveWorkflowStamp(selectedJob, "work", "Work Started");
      // After photos/videos = the work is done: the job finishes by itself (Work completed; switch
      // to Partial on the card if needed) and waits on the map to be closed out with the package.
      if (kind === "after" && saved.length) {
        const current = value(selectedJob, ["FieldOutcome", "fieldOutcome"]);
        if (!["WORK_COMPLETED", "PARTIAL_WORK"].includes(current)) setJobOutcome(selectedJob, "WORK_COMPLETED", "Finished: after photos/videos taken");
        // Already finished and you added more after shots: offer the package again.
        else if (!value(selectedJob, ["PackageApprovedAt"])) setAutoPackage({ id, outcome: current, seconds: 6 });
        setMediaChoice(null);
      }
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : "Media save failed.");
    } finally {
      setMediaBusy("");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (videoCameraInputRef.current) videoCameraInputRef.current.value = "";
      if (videoLibraryInputRef.current) videoLibraryInputRef.current.value = "";
    }
  }

  // The test job's location: "Move here" puts it where you stand (arrive / distance / directions
  // then work wherever you test); "Back to 100 Gold St" restores the default.
  const [testPlaceVersion, setTestPlaceVersion] = useState(0);
  function moveTestJob(here: boolean) {
    const apply = (location: { lat: number; lng: number } | null) => {
      setTestJobLocation(location);
      const place = testJobPlace();
      setJobs((rows) => rows.map((row) => jobId(row) === TEST_JOB_ID ? { ...row, ...place } : row));
      setSelectedJob((row) => row && jobId(row) === TEST_JOB_ID ? { ...row, ...place } : row);
      setTestPlaceVersion((v) => v + 1);
      const lat = Number(place.Latitude), lng = Number(place.Longitude);
      if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lng)) showJobAboveCard(lat, lng);
      setMediaMessage(location ? "Test job moved to where you are: you can arrive and run every step here." : "Test job is back at 100 Gold Street.");
    };
    if (!here) { apply(null); return; }
    // The map already follows your location: use that fix when it is fresh (instant).
    const fix = lastFixRef.current;
    if (fix && Date.now() - fix.at < 120000) { apply({ lat: fix.lat, lng: fix.lng }); return; }
    if (!navigator.geolocation) { setMediaMessage("This phone can't share its location."); return; }
    setMediaMessage("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => apply({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setMediaMessage("Couldn't get your location. Allow location for this app, then try again."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  // Test job only: start it over in one tap (no typing CLEAR), to run the whole flow again.
  async function resetTestJob(job: JobRecord) {
    if (!window.confirm("Reset the test job? Its steps, outcome, package and photos/videos on this phone are cleared. Drive copies and sent emails stay.")) return;
    setClearText("CLEAR");
    await clearWorkflow(job, true);
  }

  function beginClearWorkflow(job: JobRecord) {
    setClearJobId(jobId(job));
    setClearText("");
    // The confirm box lives in the full card: open it and bring the box into view.
    setSheetExpanded(true);
    window.setTimeout(() => document.querySelector(".fc-clear-confirm")?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }

  // Undo a saved outcome (e.g. No access, then access was given) without wiping the visit:
  // arrival, photos and visit history stay; a history line records what was cleared, and the
  // job is open for work again.
  function clearOutcome(job: JobRecord) {
    if (paperworkLock(job).locked && !isTestJob(jobId(job))) { setOutcomeMessage(lockedMessage(jobId(job), paperworkLock(job))); return; }
    const id = jobId(job);
    const previous = FIELD_OUTCOMES[value(job, ["FieldOutcome", "fieldOutcome", "WorkflowStatus"])] || value(job, ["StatusOverride", "status"]) || "outcome";
    if (!window.confirm(`Clear "${previous}" for ${id}? Photos and visit history are kept.`)) return;
    const now = new Date();
    const stamps = workflowStamps[id] || {};
    const statusLabel = stamps.work ? "Work Started" : stamps.arrived ? "Arrived" : "Pending";
    const history = Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory : [];
    const patch: Record<string, unknown> = {
      WorkflowStatus: "", workflowStatus: "", FieldOutcome: "", fieldOutcome: "",
      StatusOverride: statusLabel, status: statusLabel,
      OutcomeLockedAt: "", outcomeLockedAt: "", RefusalDate: "", NoAccessFirstAttemptAt: "", SecondAttemptAvailableAt: "",
      PackageReviewStatus: "",
      FieldVisitHistory: [...history, { recordedAt: now.toISOString(), outcome: null, note: `Outcome cleared (was ${previous}).` }],
      // Lets the job be worked again even if an earlier visit was No access / Refused.
      RevisitApprovedAt: new Date(now.getTime() + 1000).toISOString(),
    };
    try { writeSharedWorkflowPatch(id, patch); }
    catch { setOutcomeMessage("Could not clear the outcome on this device. Please retry."); return; }
    mergeWorkflowPatchIntoScreen(id, patch);
    setWorkflowStamps((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status: statusLabel } }));
    setOutcomeMessage(`Outcome cleared. ${id} is open again.`);
  }

  // Start over: clears the outcome, arrival, trip, package status AND every photo/video saved for
  // this job on the phone, here and on the status server, so the job is Pending again.
  async function clearWorkflow(job: JobRecord, confirmed = false) {
    const id = jobId(job);
    // "Start over" can't wipe a job whose paperwork was sent (the test job can always be reset).
    if (paperworkLock(job).locked && !isTestJob(id)) { setMediaMessage(lockedMessage(id, paperworkLock(job))); setClearJobId(""); return; }
    if (!confirmed && clearText.trim().toUpperCase() !== "CLEAR") {
      setMediaMessage("Type CLEAR to start this job over.");
      return;
    }
    const patch = startOverPatch();
    setWorkflowStamps((prev) => ({ ...prev, [id]: {} }));
    setOutcomeDrafts((prev) => ({ ...prev, [id]: { outcome: "", note: "" } }));
    // No __clearWorkflow flag: it would keep wiping the new steps recorded after starting over.
    try { writeSharedWorkflowPatch(id, { ...patch, __clearWorkflow: false }); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
    setClearJobId("");
    setClearText("");
    let removed = 0;
    try { removed = await clearFieldEvidence(id); } catch { /* reported below */ }
    // The package zip saved on this phone goes too; everything already in Google Drive stays there.
    try { await clearFieldPackets(id); } catch {}
    try { const freed = JSON.parse(window.localStorage.getItem(FREED_KEY) || "{}"); delete freed[id]; window.localStorage.setItem(FREED_KEY, JSON.stringify(freed)); } catch {}
    await refreshMediaCounts(job);
    // The start-over entry was queued by writeSharedWorkflowPatch; send it now.
    const serverCleared = (await flushOverrideOutbox(HPD_STATUS_WORKER_URL)).waiting === 0;
    setMediaMessage(`${id} started over: outcome, steps and package cleared; ${removed} photo/video file(s) removed from this phone (copies already in Google Drive are kept).${serverCleared ? "" : " The status server didn't answer; it will be cleared next time you're online."}`);
    setOutcomeMessage("");
  }


  return (
    <main className={`fc-app fc-reference fc-full-map fc-clean-streets ${bidsOpen ? "fc-bids-mode" : ""} ${chromeOpen ? "fc-chrome-open" : ""} ${selectedJob ? "fc-has-job" : ""} ${controlsOpen ? "fc-controls-open" : ""} ${sheetExpanded ? "fc-sheet-expanded" : ""}`}>
      <button type="button" className="fc-reveal-controls" aria-label={chromeOpen ? "Hide all map controls" : "Show map controls"} title={chromeOpen ? "Hide controls" : "Map menu"} aria-expanded={chromeOpen} onClick={() => { setChromeOpen((open) => !open); setControlsOpen(false); setSelectedJob(null); }}><MenuIcon /></button>
      <div className="fc-search-row">
        <div className="fc-search-field">
          <SearchIcon />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address or job" aria-label="Search jobs" />
        </div>
        <button type="button" className={`fc-filter-btn ${filtersOpen ? "is-open" : ""}`} data-hpd-smoke="fc-filter-button" aria-label="Filters" aria-expanded={filtersOpen} aria-controls="fc-quick-filters" onClick={() => { setFiltersOpen((open) => !open); setChromeOpen(false); }}>
          <FilterIcon />
          {activeFilterCount ? <span className="fc-filter-badge">{activeFilterCount}</span> : null}
        </button>
      </div>
      {!selectedJob && !filtersOpen ? (
        <nav className="fc-borough-bar" data-hpd-smoke="fc-borough-bar" aria-label="Borough and date">
          <div className="fc-bar-boroughs">
            <button type="button" className={borough === "ALL" ? "is-active" : ""} aria-pressed={borough === "ALL"} onClick={() => setBorough("ALL")}>
              <span aria-hidden="true">🗽</span><small>All</small>
            </button>
            {BOROUGHS.map(({ key, label, color }) => (
              <button key={key} type="button" className={borough === key ? "is-active" : ""} aria-pressed={borough === key} aria-label={label} style={{ "--boro": color } as CSSProperties} onClick={() => setBorough(borough === key ? "ALL" : key)}>
                <span aria-hidden="true">{BOROUGH_ICONS[key]}</span><small>{key}</small>
              </button>
            ))}
          </div>
          <div className="fc-bar-days">
            <button type="button" className={`fc-days-btn${daysMenuOpen ? " is-open" : ""}${showOlderLayer ? " is-older" : ""}`} data-hpd-smoke="fc-days-menu-btn" aria-expanded={daysMenuOpen} aria-label="Pick the days" onClick={() => setDaysMenuOpen((o) => !o)}>
              <span aria-hidden="true">📅</span><small>{showOlderLayer ? "2024-25" : quickDateKey === "year" ? "Year" : quickDateKey === "all" ? "All" : quickDateKey?.startsWith("last") ? `${quickDateKey.slice(4)}d` : quickDateKey === "next30" ? "Next 30" : "Custom"} ▾</small>
            </button>
            {daysMenuOpen ? (
              <div className="fc-days-menu" role="menu" data-hpd-smoke="fc-days-menu">
                {(["last15", "last30", "last45", "last60", "last90", "year", "all"] as const).map((key) => (
                  <button key={key} type="button" role="menuitemradio" aria-checked={quickDateKey === key && !showOlderLayer} className={quickDateKey === key && !showOlderLayer ? "is-active" : ""} data-hpd-smoke={`fc-days-${key}`} onClick={() => { applyQuickDate(key); setShowOlderLayer(false); setDaysMenuOpen(false); }}>
                    {QUICK_DATE_RANGES.find((r) => r.key === key)?.label}
                  </button>
                ))}
                <button type="button" role="menuitem" data-hpd-smoke="fc-days-custom" onClick={() => { setDaysMenuOpen(false); setFiltersOpen(true); }}>Custom dates…</button>
                <button type="button" role="menuitemcheckbox" aria-checked={showOlderLayer} className={showOlderLayer ? "is-active fc-older-chip" : "fc-older-chip"} data-hpd-smoke="fc-older-layer" title="Your 2024-2025 jobs (HPD Open Data + PIP paid status)" onClick={() => { setSelectedJob(null); setFollowFilter(""); setShowOlderLayer((v) => !v); setDaysMenuOpen(false); }}>
                  {showOlderLayer ? `✓ 2024-25 jobs · ${olderLayer ? olderLayer.length : "…"}` : "2024-25 jobs"}
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      ) : null}
      {filtersOpen ? (
        <section id="fc-quick-filters" className="fc-quick-filters" data-hpd-smoke="fc-quick-filters" aria-label="Quick filters">
          <div className="fc-quick-head">
            <strong>{filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}</strong>
            <button type="button" onClick={resetQuickFilters}>Reset</button>
            <button type="button" onClick={() => setFiltersOpen(false)}>Done</button>
          </div>
          <span className="fc-quick-label">Follow-up</span>
          <div className="fc-quick-chips" data-hpd-smoke="fc-follow-chips">
            {([["", "Off", null], ["hpd-asked", "HPD asked", followReport.counts.hpdAsked], ["overdue", "Overdue", followReport.counts.overdue], ["due-week", "Due this week", followReport.counts.dueWeek], ["recent", "Awarded 30 days", followReport.counts.recent], ["sent", "Waiting on HPD", followReport.counts.waitingOnHpd], ["hpd-closed", "Closed at HPD", followReport.counts.hpdClosed]] as const).map(([key, label, count]) => (
              <button key={key || "off"} type="button" className={followFilter === key ? "is-active" : ""} aria-pressed={followFilter === key} data-hpd-smoke={`fc-follow-${key || "off"}`} onClick={() => setFollowFilter(key)}>
                {label}{count !== null ? <> <b>{count}</b></> : null}
              </button>
            ))}
          </div>
          <span className="fc-quick-label">Status</span>
          <div className="fc-quick-chips">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button key={key} type="button" className={status === key ? "is-active" : ""} aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label} <b>{key === "all" ? jobs.length : statusCounts[key] || 0}</b>
              </button>
            ))}
          </div>
          <span className="fc-quick-label">Borough</span>
          <div className="fc-quick-chips">
            <button type="button" className={borough === "ALL" ? "is-active" : ""} aria-pressed={borough === "ALL"} onClick={() => setBorough("ALL")}>All</button>
            {BOROUGHS.map(({ key, label }) => (
              <button key={key} type="button" className={borough === key ? "is-active" : ""} aria-pressed={borough === key} onClick={() => setBorough(key)}>
                {label} <b>{boroughCounts[key]}</b>
              </button>
            ))}
          </div>
          <span className="fc-quick-label">Date</span>
          <div className="fc-quick-chips">
            {(Object.keys(JOB_DATE_FIELDS) as JobDateField[]).map((field) => (
              <button key={field} type="button" className={dateRange.field === field ? "is-active" : ""} aria-pressed={dateRange.field === field} onClick={() => setDateRange({ ...dateRange, preset: false, field })}>
                {JOB_DATE_FIELDS[field]}
              </button>
            ))}
          </div>
          <div className="fc-quick-chips">
            {QUICK_DATE_RANGES.map((range) => (
              <button key={range.key} type="button" className={quickDateKey === range.key ? "is-active" : ""} aria-pressed={quickDateKey === range.key} onClick={() => applyQuickDate(range.key)}>
                {range.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {chromeOpen && !controlsOpen && <nav className="fc-organized-menu" aria-label="Map menu">
        <strong>Map menu</strong>
        <button type="button" onClick={()=>{setChromeOpen(false);setControlsOpen(false);setPlannerRequest(value=>value+1);}}><ListIcon />Plan my day</button>
        <button type="button" data-hpd-smoke="fc-test-job-open" onClick={() => { setChromeOpen(false); setControlsOpen(false); const test = jobs.find((row) => jobId(row) === TEST_JOB_ID); if (test) openIssueJob(test); }}>🧪 Test job ({TEST_JOB_ID})</button>
        <button type="button" data-hpd-smoke="fc-summary-open" onClick={() => { setChromeOpen(false); setControlsOpen(false); setSummaryStatus(""); setSummaryOpen(true); }}><ListIcon />Today&apos;s summary</button>
        <button type="button" data-hpd-smoke="fc-stats-menu-open" onClick={() => { setChromeOpen(false); setControlsOpen(false); setStatsOpen(true); setSelectedJob(null); }}><StatsIcon />My stats</button>
        <button type="button" data-hpd-smoke="fc-bids-menu-open" onClick={() => { setChromeOpen(false); setControlsOpen(false); setSelectedJob(null); setBidsOpen(true); }}><BidsIcon />Invitations to bid</button>
        <button type="button" aria-controls="field-map-filters" onClick={() => setControlsOpen(true)}><ListIcon />Filters</button>
        <Link href="/jobs/"><ListIcon />Jobs</Link>
        <Link href="/alerts/"><BellIcon />Alerts</Link>
        <Link href="/storage/"><MenuIcon />Backup &amp; recovery</Link>
        <Link href="/more/"><MenuIcon />More</Link>
        {appVersion ? <small className="fc-app-version" data-hpd-smoke="fc-app-version">Version {appVersion}</small> : null}
      </nav>}
      <section id="field-map-filters" className="fc-control-drawer" aria-label="Map filters">
      <header className="fc-topbar">
        <div className="fc-topbar-row">
          <div className="fc-brand-text">
            <span className="fc-brand-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3z" fill="rgba(255,255,255,.14)" />
              </svg>
              <b>HPD</b>
            </span>
            <div className="fc-brand-copy">
              <p className="fc-eyebrow">HPD Bid Dashboard 2026</p>
              <h1 className="fc-title">FIELD COMMAND</h1>
            </div>
          </div>
          <div className="fc-topbar-actions">
            <Link href="/alerts" className="fc-icon-btn" aria-label="Alerts">
              <BellIcon />
              {overdueCount > 0 ? <span className="fc-icon-badge">{overdueCount}</span> : null}
            </Link>
            <Link href="/more" className="fc-icon-btn" aria-label="More">
              <MenuIcon />
            </Link>
          </div>
        </div>
        <div className="fc-live-row">
          <div className="fc-live-copy">
            <span className="fc-live-dot">Loaded</span>
            <span className="fc-active-count">{activeJobs.length} Active Jobs</span>
          </div>
        </div>
      </header>

      <div className="fc-borough-row" role="group" aria-label="Borough filter">
        <button type="button" className={`fc-borough-chip ${borough === "ALL" ? "is-active" : ""}`} onClick={() => setBorough("ALL")}>
          <strong>All</strong>
          <span>{jobs.length}</span>
        </button>
        {BOROUGHS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`fc-borough-chip fc-${key.toLowerCase()} ${borough === key ? "is-active" : ""}`}
            onClick={() => setBorough(key)}
          >
            <strong>{label}</strong>
            <span>{boroughCounts[key]}</span>
          </button>
        ))}
      </div>

        <div className="fc-award-filter">
          <div className="fc-date-custom">
          <label htmlFor="award-range">Awarded</label>
          <select id="award-range" aria-label="Award date range" value={dateRange.preset ? "year" : customDateRange || (daysBack !== null && ![30,90,180,365].includes(daysBack)) ? "custom" : daysBack ?? "all"} onChange={(event) => {
            const selected = event.target.value;
            setDateRange(selected === "year" ? currentYearRange() : { field: "award", from: "", to: "" });
            setCustomDateRange(selected === "custom");
            if (selected !== "custom") setDaysBack(selected === "all" || selected === "year" ? null : Number(selected));
          }}>
            <option value="year">Current year</option>
            <option value="all">All dates</option>
            {[30,90,180,365].map((days) => <option key={days} value={days}>Last {days} days</option>)}
            <option value="custom">Custom</option>
          </select>
          {customDateRange || (daysBack !== null && ![30,90,180,365].includes(daysBack)) ? <input id="award-lookback" aria-label="Custom days back" title="Days back" type="number" inputMode="numeric" min="0" max="3650" step="1" placeholder="Days" value={daysBack ?? ""} onChange={(event) => {
            const raw = event.target.value;
            if (!raw) setDaysBack(null);
            else if (event.target.validity.valid) setDaysBack(Number(raw));
          }} /> : null}
          <output aria-live="polite">{filteredJobs.length ? `${filteredJobs.length} jobs` : "No matches"}</output>
          </div>
          <div className="fc-date-picker">
            <label>Date type<select aria-label="Date type" value={dateRange.field} onChange={(e) => setDateRange({ ...dateRange, preset: false, field: e.target.value as JobDateField })}>
              {Object.entries(JOB_DATE_FIELDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <div className="fc-date-bounds">
              <label>From<input type="date" aria-label="Date from" value={dateRange.from} onChange={(e) => { setDaysBack(null); setDateRange({ ...dateRange, preset: false, from: e.target.value }); }} /></label>
              <label>Through<input type="date" aria-label="Date through" value={dateRange.to} onChange={(e) => { setDaysBack(null); setDateRange({ ...dateRange, preset: false, to: e.target.value }); }} /></label>
            </div>
            {dateRange.from && dateRange.to && dateRange.from > dateRange.to ? <span role="alert">From must be on or before Through.</span> : null}
            <button type="button" onClick={() => { setDateRange(currentYearRange()); setDaysBack(null); setCustomDateRange(false); }}>Current year</button>
            <button type="button" onClick={() => { setDateRange({ field: "award", from: "", to: "" }); setDaysBack(null); setCustomDateRange(false); }}>All dates</button>
          </div>
        </div>
        <div className="fc-pill-row fc-status-pill-row" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`fc-pill ${status === key ? "is-active" : ""}`}
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              <strong>{label}</strong>
              <span>{key === "all" ? jobs.length : statusCounts[key] || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="fc-map-wrap">
        <div ref={mapNode} className={`fc-map-node ${darkTiles ? "is-dark" : ""}`} />
        {/* onTouchStart lets iPhone Safari show the pressed (zoomed) state with its callout before the tap lands. */}
        {/* Jobs ready to close out and 2nd tries: two round buttons (bottom left) instead of bars across the map. */}
        {(closeOutJobs.length || secondTryJobs.length) && !selectedJob ? (
          <div className="fc-work-fabs" onTouchStart={() => undefined}>
            {closeOutJobs.length ? (
              <button type="button" className="fc-work-fab is-closeout" data-hpd-smoke="fc-close-out" aria-label="Ready to close out" aria-pressed={closeOutOpen} onClick={() => { if (closeOutOpen) { setCloseOutOpen(false); return; } closeScreens("closeout"); setCloseOutOpen(true); }}>
                <CloseOutIcon /><span className="fc-fab-label">Close out</span><span className="fc-follow-badge" data-hpd-smoke="fc-close-out-count">{closeOutJobs.length}</span>
              </button>
            ) : null}
            {secondTryJobs.length ? (
              <button type="button" className="fc-work-fab is-secondtry" data-hpd-smoke="fc-second-try" aria-label="2nd tries" aria-pressed={secondTryOpen} onClick={() => { if (secondTryOpen) { setSecondTryOpen(false); return; } closeScreens("secondtry"); setSecondTryOpen(true); }}>
                <LockIcon /><span className="fc-fab-label">2nd try</span><span className={`fc-follow-badge${secondTryJobs.some((row) => row.second.due) ? " is-rejected" : ""}`} data-hpd-smoke="fc-second-try-count">{secondTryJobs.length}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="fc-map-controls" onTouchStart={() => undefined}>
          <button
            type="button"
            className="fc-map-fab fc-route-fab"
            aria-label="Today's route" data-tip="Today's route: plan your stops"
            title="Today's route"
            data-hpd-smoke="fc-route-open"
            aria-pressed={routeOpen}
            onClick={() => { if (routeOpen) { setRouteCloseRequest((n) => n + 1); return; } closeScreens("route"); setRouteOpenRequest((n) => n + 1); }}
          >
            <RouteIcon /><span className="fc-fab-label">Route</span>
          </button>
          <button type="button" className="fc-map-fab" aria-label="Today's appointments" data-tip="Today's appointments" title="Today's appointments" aria-pressed={agendaOpen} onClick={() => { if (agendaOpen) { setAgendaOpen(false); return; } closeScreens("agenda"); setAgendaOpen(true); }}><ListIcon /><span className="fc-fab-label">Today</span></button>
          <button type="button" className="fc-map-fab" data-hpd-smoke="fc-stats-open" aria-label="My stats" data-tip="My stats: jobs and money" title="My stats" aria-pressed={statsOpen} onClick={() => { if (statsOpen) { setStatsOpen(false); return; } closeScreens("stats"); setStatsOpen(true); }}><StatsIcon /><span className="fc-fab-label">Stats</span></button>
          <button type="button" className={`fc-map-fab fc-notices-fab${followFilter === "notices" ? " is-active" : ""}${boardUrgent.length ? " is-urgent" : ""}`} data-hpd-smoke="fc-notices-open" data-urgent={boardUrgent.length || undefined} aria-label="HPD notices" data-tip="HPD notices: rejections and requests" aria-pressed={noticesOpen || noticeChooser} title="HPD notices: rejected paperwork and requests" onClick={() => {
            // Asks what you're looking for (Priority, Payment rejected, Corrections, Print); the pick shows those
            // jobs on the map right away. Tapping again closes. ✕ on the map goes back to every job.
            if (noticesOpen) { setNoticesOpen(false); return; }
            if (noticeChooser) { setNoticeChooser(false); setFollowFilter(""); setNoticeKind(""); return; }
            closeScreens("notices");
            setFollowFilter("notices");
            setNoticeKind("all");
            setNoticeChooser(true);
            setNoticeMini(false);
          }}>
            <NoticesIcon /><span className="fc-fab-label">Notices</span>{boardUrgent.length ? <span className="fc-urgent-tag" data-hpd-smoke="fc-urgent-tag">⏱ {boardUrgent.length} &lt;6h</span> : null}{openRejections.length + followReport.counts.hpdAsked ? <span className={`fc-follow-badge${openRejections.length ? " is-rejected" : ""}`}>{openRejections.length + followReport.counts.hpdAsked}</span> : null}
          </button>
          <button type="button" className={`fc-map-fab fc-follow-fab${followFilter ? " is-active" : ""}`} data-hpd-smoke="fc-follow-open" aria-label="Follow-up report" data-tip="Follow-up: overdue jobs" title="Follow-up report" aria-pressed={followOpen} onClick={() => { if (followOpen) { setFollowOpen(false); return; } closeScreens("follow"); setFollowOpen(true); }}>
            <FollowIcon /><span className="fc-fab-label">Follow-up</span>{followReport.counts.overdue + followReport.counts.dueWeek ? <span className="fc-follow-badge" data-hpd-smoke="fc-follow-badge">{followReport.counts.overdue + followReport.counts.dueWeek}</span> : null}
          </button>
          <button type="button" className={`fc-map-fab ${bidsOpen ? "is-active" : ""}`} data-hpd-smoke="fc-bids-open" aria-label="Invitations to bid" data-tip={bidsDue.open ? `Invitations to bid: ${bidsDue.open} open${bidsDue.today ? `, ${bidsDue.today} due today` : ""}` : "Invitations to bid"} aria-pressed={bidsOpen} title="Invitations to bid" onClick={() => { if (bidsOpen) { setBidsOpen(false); return; } closeScreens("bids"); setBidsOpen(true); }}><BidsIcon /><span className="fc-fab-label">Bids</span>{bidsDue.open ? <span className={`fc-follow-badge ${bidsDue.today ? "is-bids-today" : "is-bids-tomorrow"}`} data-hpd-smoke="fc-bids-badge" title={`${bidsDue.open} open${bidsDue.today ? ` · ${bidsDue.today} due today` : ""}${bidsDue.tomorrow ? ` · ${bidsDue.tomorrow} due tomorrow` : ""}`}>{bidsDue.open}</span> : null}</button>
          <button
            type="button"
            className={`fc-map-fab ${darkTiles ? "is-active" : ""}`}
            aria-label="Toggle map style" data-tip="Change the map style"
            onClick={toggleTileStyle}
          >
            <LayersIcon /><span className="fc-fab-label">Map</span>
          </button>
          <button
            type="button"
            className={`fc-map-fab ${locateStatus === "loading" ? "is-busy" : ""}`}
            aria-label="Locate me" data-tip="Show where I am"
            onClick={locateMe}
          >
            <LocateIcon /><span className="fc-fab-label">Locate</span>
          </button>
          <div className="fc-map-fab fc-visible-fab" aria-label="Visible jobs">
            <strong>{filteredJobs.length}</strong>
            <span>Visible Jobs</span>
          </div>
        </div>
        {/* Status messages stack below the search box instead of overlapping each other. */}
        <div className="fc-map-hints" hidden={filtersOpen}>
          {locateStatus === "error" ? (
            <p className="fc-map-hint fc-map-hint-warn">Couldn&apos;t get your location</p>
          ) : null}

          {!jobs.length ? (
            <p className={`fc-map-hint ${jobsLoadFailed ? "fc-map-hint-warn" : ""}`} role="status">{jobsLoadFailed ? "Couldn't load jobs. Check the connection; retrying." : "Loading jobs..."}</p>
          ) : !filteredJobs.length ? (
            <p className="fc-map-hint">No jobs match these filters</p>
          ) : null}

          {filteredJobs.length > 0 && !mappedFilteredCount ? (
            <p className="fc-map-hint">No mapped jobs match these filters</p>
          ) : null}

          {backup && !backup.auto && backup.total > 0 && !selectedJob ? (
            <div className="fc-data-check fc-backup-pill" data-hpd-smoke="fc-backup-pill">
              <button type="button" className="fc-map-hint fc-map-hint-warn" onClick={() => void turnOnDriveBackup()}>
                ☁️ {backup.total} photo{backup.total === 1 ? "" : "s"}/video{backup.total === 1 ? "" : "s"} only on this phone · Back up to Drive
              </button>
            </div>
          ) : null}
          {phoneSpace && phoneSpace.level !== "ok" && !selectedJob ? (
            <div className="fc-data-check fc-space-pill" data-hpd-smoke="fc-space-pill">
              <Link href="/storage/" className="fc-map-hint fc-map-hint-warn">
                ⚠ Phone space {phoneSpace.level === "full" ? "almost full" : "running low"} · {formatBytes(phoneSpace.free)} left for the app
              </Link>
            </div>
          ) : null}
          {upcomingAppointments.length && !selectedJob ? (() => {
            const next = upcomingAppointments[0];
            const when = next.timing.soon ? (next.timing.startsIn > 0 ? `in ${next.timing.startsIn} min` : "now") : appointmentLabel(next.appointment).split(" · ")[1];
            return (
              <div className={`fc-data-check fc-appointment-pill ${next.timing.soon ? "is-soon" : ""}`} data-hpd-smoke="fc-appointment-pill">
                <button type="button" className="fc-map-hint" onClick={() => openIssueJob(next.job)}>
                  📅 {next.timing.soon ? "Appointment" : "Next appointment"} {when} · {jobId(next.job)}{upcomingAppointments.length > 1 ? ` · ${upcomingAppointments.length} today` : ""}
                </button>
              </div>
            );
          })() : null}
          {dataIssues.length && !selectedJob ? (
            <div className="fc-data-check" data-hpd-smoke="fc-data-check">
              <button type="button" className="fc-map-hint fc-map-hint-warn" aria-expanded={dataCheckOpen} onClick={() => { setDataCheckOpen((open) => !open); setCloseOutOpen(false); }}>
                ⚠ {dataIssues.length} job{dataIssues.length === 1 ? "" : "s"} need{dataIssues.length === 1 ? "s" : ""} a check {dataCheckOpen ? "▴" : "▾"}
              </button>
              {dataCheckOpen ? (
                <ul className="fc-data-check-list">
                  {dataIssues.slice(0, 40).map(({ job, issues }) => (
                    <li key={jobId(job)}>
                      <button type="button" onClick={() => openIssueJob(job)}>
                        <b>{jobId(job)}</b> <span>{jobAddress(job)}</span>
                        <small>{issues.join(" · ")}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {!selectedJob ? (
          <div className="fc-legend">
            {PIN_STYLES.map((meta) => (
              <span key={meta.key} className="fc-legend-chip">
                <span
                  className="fc-legend-dot"
                  style={{ background: meta.color }}
                  dangerouslySetInnerHTML={{ __html: `<svg width="10" height="10" viewBox="0 0 24 24">${STATUS_ICON_PATHS[meta.key]}</svg>` }}
                />
                {meta.label}
              </span>
            ))}
          </div>
        ) : null}

        <div hidden={!!selectedJob || agendaOpen || chromeOpen}>
          {currentJob&&jobs.some(job=>jobId(job)===currentJob.id)&&<div className="fc-current-job"><button type="button" onClick={()=>resumeCurrentJob(currentJob)}>Resume current job · {currentJob.id}</button><button type="button" aria-label="Dismiss current job" onClick={()=>{currentJobRef.current=null;setCurrentJob(null);try{localStorage.removeItem(CURRENT_JOB_KEY);}catch{}}}>&times;</button></div>}
          <TodayRoute jobs={routeJobs} mapReady={routeMapReady} getOrigin={() => {
            // Your location; else the map center if it's in the city; else the office.
            const location = userMarkerRef.current?.getLatLng?.();
            if (location) return {point:{lat:location.lat,lng:location.lng},label:'your location'};
            const center = mapRef.current?.getCenter();
            if (center && center.lat > 40.49 && center.lat < 40.92 && center.lng > -74.26 && center.lng < -73.7) return {point:{lat:center.lat,lng:center.lng},label:'map center (location not set)'};
            return {point:OFFICE_LOCATION,label:'the office, 120-17 91st Ave (location not set)'};
          }} openRequest={routeOpenRequest} closeRequest={routeCloseRequest} onOpenChange={setRouteOpen} onNavigate={rememberNavigation} onPreview={drawDayRoute} onSelect={id => {setSelectedJob(jobs.find(job=>jobId(job)===id)||null);setSheetExpanded(false);}} />
        </div>
        {agendaOpen ? <aside className="fc-appointment-agenda" aria-label="Today's appointments">
          <header><strong>Today&apos;s appointments</strong><button type="button" aria-label="Close appointments" onClick={() => setAgendaOpen(false)}>&times;</button></header>
          <p>{nyToday()} · New York · This device</p>
          {(() => {
            const today = jobs.filter(row => { const a = row.Appointment as Appointment | undefined; return a && a.date === nyToday() && ['requested', 'confirmed'].includes(a.state); }).sort((a, b) => (a.Appointment as Appointment).start.localeCompare((b.Appointment as Appointment).start));
            return today.length ? today.map(row => { const a = row.Appointment as Appointment; return <button type="button" key={jobId(row)} onClick={() => { setAgendaOpen(false); setStatus('all'); setDaysBack(null); setSearch(jobId(row)); setSelectedJob(row); setSheetExpanded(false); }}><strong>{a.start}-{a.end} · {a.state}</strong><span>{jobId(row)} · {jobAddress(row)}</span></button>; }) : <p>No appointments saved for today.</p>;
          })()}
        </aside> : null}
        {selectedJob ? (() => {
          const id = jobId(selectedJob);
          const scope = jobScope(selectedJob);
          const tenant = tenantInfo(selectedJob);
          const stamps = workflowStamps[id] || {};
          const counts = mediaCounts[id] || { before: 0, after: 0, total: 0 };
          const next = nextFieldAction(stamps, counts, jobStatus(selectedJob));
          const draft = outcomeDrafts[id] || { outcome: "", note: "" };
          const paperworkHref = paperworkNextHref(id, value(selectedJob, ["WorkflowStatus", "workflowStatus", "FieldOutcome", "fieldOutcome"]));
          const hasScope = scope !== SCOPE_MISSING;
          return (
            <div ref={jobSheetRef} id="fc-job-card" className="fc-job-sheet fc-job-sheet-flow" aria-label="Selected job">
              <button type="button" className="fc-sheet-handle" aria-label={sheetExpanded ? "Collapse job details" : "Expand job details"} aria-expanded={sheetExpanded} onTouchStart={(event) => { sheetTouchStart.current = event.touches[0].clientY; }} onTouchEnd={(event) => {
                const start = sheetTouchStart.current;
                sheetTouchStart.current = null;
                if (start !== null && Math.abs(event.changedTouches[0].clientY - start) > 30) {
                  event.preventDefault();
                  setSheetExpanded(event.changedTouches[0].clientY < start);
                }
              }} onTouchCancel={() => { sheetTouchStart.current = null; }} onClick={() => setSheetExpanded((expanded) => !expanded)}><span /></button>
              <button type="button" className="fc-job-sheet-close" aria-label="Close" title="Close job details" onClick={() => setSelectedJob(null)}>
                <span aria-hidden="true">&times;</span>
              </button>
              {(() => {
                const omo = jobId(selectedJob);
                const it = prioByOmo.get(omo);
                const rj = openRejections.find((r) => r.omo === omo);
                if (!it && !rj) return null;
                const due = it ? dueText(it.dueAt) : "";
                const outcomes = [["work_completed", "✅ Work completed"], ["refused_access", "🚫 Refused access"], ["no_access", "🚪 No access"], ["completed_by_others", "👷 Completed by others"], ["partial_work_completed", "🔁 Partly done / going back"]] as const;
                return (
                  <div className={`fc-prio-card${it?.kind === "24h" ? " is-24h" : ""}${/overdue/.test(due) ? " is-late" : ""}`} data-hpd-smoke="fc-prio-card">
                    {it ? <>
                      <p className="fc-prio-card-head"><b>🔥 PRIORITY</b> · {it.title}{it.who ? ` · ${it.who}` : ""}</p>
                      {due ? <p className="fc-prio-card-due" data-hpd-smoke="fc-prio-card-due">⏱ {due}</p> : <p className="fc-prio-card-due">Asked {new Date(it.askedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</p>}
                      <p className="fc-prio-card-want">{it.want}</p>
                      <p className={`fc-prio-sent${it.sentAt ? " is-sent" : ""}`}>{it.sentAt ? `✓ Paperwork already sent ${it.sentAt}` : "⚠️ No paperwork sent for this job yet"}</p>
                      <p className="fc-prio-card-q">What happened? Pick it, put the date, and the affidavit (copy + original) is made for you to check:</p>
                      <div className="fc-prio-outcomes" data-hpd-smoke="fc-prio-outcomes">
                        {outcomes.map(([k, label]) => <a key={k} href={`/paperwork/?job=${encodeURIComponent(omo)}&outcome=${k}`} data-hpd-smoke={`fc-prio-outcome-${k}`}>{label}</a>)}
                      </div>
                      <div className="fc-notice-actions">
                        {it.threadId ? <button type="button" onClick={() => setThreadView({ ids: [it.threadId], title: `${omo}: ${it.title}` })}>💬 Their email</button> : null}
                        <button type="button" onClick={() => { setNoticesTab("priority"); setNoticesOpen(true); }}>✉ Reply / Handled</button>
                      </div>
                    </> : null}
                    {rj ? <>
                      <p className="fc-prio-card-head is-pay"><b>💵 PAYMENT REJECTED</b> · {rj.at}</p>
                      {rj.reason ? <p className="fc-prio-card-want">{rj.reason}</p> : null}
                      <div className="fc-notice-actions"><a className="is-autofix" href={`/paperwork/?job=${encodeURIComponent(omo)}&fix=${encodeURIComponent(rj.at)}&auto=1`}>✨ Auto-fix &amp; preview</a></div>
                    </> : null}
                  </div>
                );
              })()}
              <header className="jc-hero">
                {/* First thing on the card: what the building looks like, then where it is and how to get there. */}
                <BuildingHero key={id} id={id} address={jobAddress(selectedJob)} borough={String(jobBorough(selectedJob))} point={jobLatLng(selectedJob)} />
                <div className="jc-hero-top">
                  <strong className="jc-omo">{id}</strong>
                  <span className="jc-status" style={{ "--jc-status": jobStatusMeta(selectedJob).color } as CSSProperties}>
                    <i aria-hidden="true" />{stamps.status || jobStatusMeta(selectedJob).label}
                  </span>
                </div>
                <span className="jc-borough">{BOROUGHS.find((item) => item.key === jobBorough(selectedJob))?.label || "NYC"}</span>
                <p className="jc-address">{jobAddress(selectedJob)}</p>
              </header>

              {testModeVersion >= 0 && isTestJob(jobId(selectedJob)) ? (
                <div className="jc-test-banner" data-hpd-smoke="jc-test-banner">
                  <p>🧪 {jobId(selectedJob) === TEST_JOB_ID ? "TEST JOB: sample only, never a real work order." : "TEST MODE is on for this job."} Packages are marked TEST and filed in Drive under &quot;TEST jobs / {jobId(selectedJob)}&quot;; emails say TEST.</p>
                  {jobId(selectedJob) === TEST_JOB_ID && testFirstUpgrades().length ? (
                    <p data-hpd-smoke="jc-test-first">✨ Trying here first: {testFirstUpgrades().map((upgrade) => upgrade.about).join(" · ")}</p>
                  ) : null}
                  {jobId(selectedJob) === TEST_JOB_ID && testPlaceVersion >= 0 ? (
                    <p className="jc-test-actions">
                      <button type="button" data-hpd-smoke="jc-test-move-here" onClick={() => moveTestJob(true)}>📍 Move test job here</button>
                      {testJobLocation() ? <button type="button" data-hpd-smoke="jc-test-move-back" onClick={() => moveTestJob(false)}>↩ Back to 100 Gold St</button> : null}
                      <button type="button" data-hpd-smoke="jc-test-reset" onClick={() => void resetTestJob(selectedJob)}>🔄 Reset test job</button>
                    </p>
                  ) : <p>Use Start over to clear everything and run it again.</p>}
                </div>
              ) : null}
              <section className="jc-description" aria-label="Job description" data-hpd-smoke="jc-description">
                <div className="jc-section-head">
                  <strong>Job Description</strong>
                  {hasScope && scope.length > 260 ? <button type="button" className="jc-description-more" onClick={() => setScopeOpen((open) => !open)}>{scopeOpen ? "Less" : "All"}</button> : null}
                </div>
                <p className={`jc-description-text ${scopeOpen ? "is-open" : ""} ${hasScope ? "" : "is-missing"}`} data-hpd-smoke="jc-description-text">{scope}</p>
                {(hasScope && speechOk) || itbFileName(selectedJob) ? (
                  <div className="jc-description-actions">
                    {hasScope && speechOk ? <>
                      <button type="button" className="jc-read" data-hpd-smoke="jc-description-read" onClick={() => setReading(readAloud(`Job ${id}. ${jobAddress(selectedJob)}. ${scope}`, () => setReading(false)))}>
                        {reading ? "🔊 Reading..." : "🔊 Read aloud"}
                      </button>
                      <button type="button" data-hpd-smoke="jc-description-stop" onClick={() => { stopReading(); setReading(false); }} disabled={!reading}>Stop</button>
                    </> : null}
                    {itbFileName(selectedJob) ? <button type="button" data-hpd-smoke="jc-itb-page" onClick={() => void openItbPage(selectedJob)}>📄 ITB page</button> : null}
                  </div>
                ) : null}
              </section>

              {(() => {
                // Guided steps: arrive -> start visit -> what happened (start work = before media, or a
                // no-work outcome) -> finish work (after media) -> check media & finish -> package.
                // Final outcomes with no work. An appointment is not final: the job waits for the visit.
                const noWorkOutcomes = ["NO_ACCESS_1_WAITING_72H", "REFUSED_ACCESS", "WORK_COMPLETED_BY_OTHERS"];
                const appointment = activeAppointment(selectedJob);
                const appointmentWhen = appointment ? appointmentTiming(appointment) : null;
                const workOutcomes = ["WORK_COMPLETED", "PARTIAL_WORK"];
                // Only a real outcome counts; "VISIT_STARTED" / "WORK_STARTED" are progress markers.
                const rawOutcome = value(selectedJob, ["FieldOutcome", "fieldOutcome"]);
                const savedOutcome = [...noWorkOutcomes, ...workOutcomes].includes(rawOutcome) ? rawOutcome : "";
                const workStarted = Boolean(stamps.work) || counts.before > 0;
                const steps = [
                  { done: Boolean(stamps.arrived) },
                  { done: Boolean(stamps.visit) },
                  { done: workStarted || noWorkOutcomes.includes(savedOutcome) || workOutcomes.includes(savedOutcome) },
                  { done: counts.after > 0 || noWorkOutcomes.includes(savedOutcome) || workOutcomes.includes(savedOutcome) },
                  { done: Boolean(savedOutcome) },
                  { done: Boolean(value(selectedJob, ["PackageApprovedAt"])) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"])) },
                ];
                const current = steps.findIndex((step) => !step.done);
                const secondTry = secondTryState(selectedJob);
                const secondTrySaved = value(selectedJob, ["NoAccessSecondAttemptAt"]);
                const stepClass = (index: number) => `jc-step ${steps[index].done ? "is-done" : index === current ? "is-current" : "is-later"}`;
                const num = (index: number) => <span className="jc-step-num" aria-hidden="true">{steps[index].done ? "✓" : index + 1}</span>;
                const outcomeForm = (keys: string[]) => keys.includes(draft.outcome) ? (
                  <div className="jc-step-form">
                    <label>Note (optional)<textarea value={draft.note} rows={2} onChange={(event) => setOutcomeDrafts((prev) => ({ ...prev, [id]: { ...draft, note: event.target.value } }))} /></label>
                    <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-save-outcome" disabled={Boolean(mediaBusy)} onClick={() => saveVisitOutcome(selectedJob, false)}>Save: {FIELD_OUTCOMES[draft.outcome]}<span aria-hidden="true">&rarr;</span></button>
                  </div>
                ) : null;
                // The before/after photo and video buttons, glowing inside the step that asked for them.
                const stepMedia = (kind: "before" | "after") => mediaChoice === kind && mediaChoiceInStep ? (
                  <div className="jc-step-media" data-hpd-smoke={`jc-step-media-${kind}`}>
                    <strong>{kind === "before" ? "📸 BEFORE: take a photo or video of the condition now. This starts the job." : "📸 AFTER: take a photo or video of the finished work. This finishes the job."}</strong>
                    <div className="jc-step-media-grid">
                      <button type="button" className="jc-glow" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("camera")}><PhotosIcon />Take {kind} photo</button>
                      <button type="button" className="jc-glow" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("video-camera")}>🎥 Record {kind} video</button>
                      <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("library")}><DocumentsIcon />Add photos</button>
                      <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("video-library")}>Add videos</button>
                    </div>
                    <button type="button" className="jc-step-media-cancel" onClick={() => setMediaChoice(null)}>Cancel</button>
                  </div>
                ) : null;
                return (
                  <ol className="jc-steps" data-hpd-smoke="jc-steps" aria-label="Job steps">
                    {/* Step 0: go there. The tap on Waze / Google is recorded with the date. */}
                    {value(selectedJob, ["TravelStartedAt"]) || !stamps.arrived ? (
                      <li className={`jc-step jc-step-travel ${value(selectedJob, ["TravelStartedAt"]) ? "is-done" : "is-current"}`} data-hpd-smoke="jc-step-travel">
                        <span className="jc-step-num" aria-hidden="true">🚗</span>
                        <div>
                          <b>{value(selectedJob, ["TravelStartedAt"]) ? "On the way" : "Go there"}</b>
                          <small>{value(selectedJob, ["TravelStartedAt"]) ? `${value(selectedJob, ["TravelVia"]) || "Navigation"} · ${formatSavedTime(value(selectedJob, ["TravelStartedAt"]))}` : "Open directions; the trip is saved on this job"}</small>
                          {!stamps.arrived ? (
                            <div className="jc-step-nav">
                              <a className="jc-btn jc-btn-waze" data-hpd-smoke="jc-step-waze" href={wazeHref(selectedJob)} onClick={()=>recordTravel(selectedJob, "Waze")} target="_blank" rel="noreferrer">Waze</a>
                              <a className="jc-btn jc-btn-google" href={directionsHref(selectedJob)} onClick={()=>recordTravel(selectedJob, "Google")} target="_blank" rel="noreferrer">Google</a>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ) : null}
                    <li className={stepClass(0)}>
                      {num(0)}
                      <div>
                        <b>I have arrived</b>
                        <small>{stamps.arrived ? `Arrived ${formatSavedTime(stamps.arrived)}${value(selectedJob, ["ArrivedLatitude"]) ? " · location saved" : ""}` : "Saves the time and your location"}</small>
                        {current === 0 ? <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-arrived" disabled={!workflowLoaded} onClick={() => markArrived(selectedJob)}>I have arrived<span aria-hidden="true">&rarr;</span></button> : null}
                      </div>
                    </li>
                    <li className={stepClass(1)}>
                      {num(1)}
                      <div>
                        <b>Start visit</b>
                        <small>{stamps.visit ? `Started ${formatSavedTime(stamps.visit)}` : "Head to the job site; read the description above"}</small>
                        {current === 1 ? <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-visit" onClick={() => saveWorkflowStamp(selectedJob, "visit")}>Start visit<span aria-hidden="true">&rarr;</span></button> : null}
                      </div>
                    </li>
                    <li className={stepClass(2)}>
                      {num(2)}
                      <div>
                        <b>Outcome</b>
                        <small>{noWorkOutcomes.includes(savedOutcome) ? FIELD_OUTCOMES[savedOutcome] : workStarted ? `Work started${stamps.work ? ` ${formatSavedTime(stamps.work)}` : ""} · before: ${counts.before - (counts.beforeVideos || 0)} photo(s), ${counts.beforeVideos || 0} video(s)` : "Do the work (before photos/video), or record why not"}</small>
                        {appointment && !savedOutcome && !workStarted ? (
                          <p className={`jc-step-appointment ${appointmentWhen?.soon ? "is-soon" : ""}`} data-hpd-smoke="jc-step-appointment">
                            📅 Appointment {appointmentLabel(appointment)}
                            {appointmentWhen?.soon ? (appointmentWhen.startsIn > 0 ? ` · starts in ${appointmentWhen.startsIn} min` : " · now") : appointmentWhen?.past ? " · time passed" : ""}
                            {!appointmentWhen?.past ? (
                              <a className="jc-calendar-add" data-hpd-smoke="jc-calendar-add" href={appointmentCalendarHref(id, jobAddress(selectedJob), appointment, typeof window === "undefined" ? "" : window.location.origin)} target="_blank" rel="noreferrer">
                                🔔 Add to Calendar <small>(alerts 1 h and 15 min before, even with the app closed)</small>
                              </a>
                            ) : null}
                          </p>
                        ) : null}
                        {current === 2 ? (
                          <>
                            <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-start-work" disabled={Boolean(mediaBusy)} onClick={() => requestMediaUpload("before", true)}>🔨 Do the work: before photo / video<span aria-hidden="true">&rarr;</span></button>
                            {stepMedia("before")}
                            <div className="jc-step-choices">
                              {noWorkOutcomes.map((key) => (
                                <button key={key} type="button" className={draft.outcome === key ? "is-picked" : ""} onClick={() => setOutcomeDrafts((prev) => ({ ...prev, [id]: { note: prev[id]?.note || "", outcome: key } }))}>{OUTCOME_ICONS[key]} {FIELD_OUTCOMES[key]}</button>
                              ))}
                              <button type="button" className={appointmentOpen ? "is-picked" : ""} data-hpd-smoke="jc-step-appointment-open" onClick={() => (appointmentOpen ? setAppointmentOpen(false) : openAppointment())}>📅 {appointment ? "Change appointment" : "Need appointment"}</button>
                            </div>
                            {outcomeForm(noWorkOutcomes)}
                          </>
                        ) : !savedOutcome && !workStarted && current < 2 ? (
                          <button type="button" className="jc-step-more" data-hpd-smoke="jc-step-appointment-open" onClick={() => (appointmentOpen ? setAppointmentOpen(false) : openAppointment())}>📅 {appointment ? "Change appointment" : "Set an appointment"}</button>
                        ) : null}
                        <div ref={appointmentRef}>
                          {appointmentOpen && !savedOutcome ? <AppointmentEditor key={id} job={selectedJob} jobs={jobs.map(row => ({ ...row, id: jobId(row) }))} id={id} address={jobAddress(selectedJob)} contact={tenant.name} phone={tenant.phone} note={draft.note} save={a => saveAppointment(selectedJob, a)} /> : null}
                        </div>
                        {workStarted && !savedOutcome && current > 2 ? <button type="button" className="jc-step-more" data-hpd-smoke="jc-step-more-before" disabled={Boolean(mediaBusy)} onClick={() => requestMediaUpload("before", true)}>+ More before photos / video</button> : null}
                        {current > 2 ? stepMedia("before") : null}
                      </div>
                    </li>
                    {/* No access: the affidavit needs a 2nd try at least 72 hours after the 1st. */}
                    {secondTry || (savedOutcome === "NO_ACCESS_1_WAITING_72H" && secondTrySaved) ? (
                      <li className={`jc-step ${secondTry ? "is-current" : "is-done"}`} data-hpd-smoke="jc-step-second-try">
                        <span className="jc-step-num" aria-hidden="true">{secondTry ? "🔒" : "✓"}</span>
                        <div>
                          <b>{secondTry ? (secondTry.due ? "2nd try is due" : `2nd try from ${secondTry.dueLabel}`) : "2nd try saved"}</b>
                          <small>{secondTry
                            ? `1st try ${secondTry.firstLabel}: no access. ${secondTry.due ? "Knock again; if there's still no access, save the 2nd try." : "The affidavit needs a 2nd try at least 72 hours later."}`
                            : `No access on both tries (2nd ${formatSavedTime(secondTrySaved)}) · ready for the affidavit`}</small>
                          {secondTry && secondTry.due ? (
                            <div className="jc-step-choices">
                              <button type="button" className="jc-glow" data-hpd-smoke="jc-step-second-no-access" onClick={() => setJobOutcome(selectedJob, "NO_ACCESS_1_WAITING_72H", "2nd try: no access")}>🔒 Still no access: save 2nd try</button>
                              <button type="button" data-hpd-smoke="jc-step-second-got-in" disabled={Boolean(mediaBusy)} onClick={() => gotInOnSecondTry(selectedJob)}>🚪 Got in: start work</button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ) : null}
                    {!noWorkOutcomes.includes(savedOutcome) ? (
                      <>
                        <li className={stepClass(3)}>
                          {num(3)}
                          <div>
                            <b>Finish work</b>
                            <small>{counts.after ? `After: ${counts.after - (counts.afterVideos || 0)} photo(s), ${counts.afterVideos || 0} video(s)` : "Take the after photos and video"}</small>
                            {current === 3 ? <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-after" disabled={Boolean(mediaBusy)} onClick={() => requestMediaUpload("after", true)}>Finish work: after photo / video<span aria-hidden="true">&rarr;</span></button> : null}
                            {counts.after > 0 && !value(selectedJob, ["PackageApprovedAt"]) ? <button type="button" className="jc-step-more" data-hpd-smoke="jc-step-more-after" disabled={Boolean(mediaBusy)} onClick={() => requestMediaUpload("after", true)}>+ More after photos / video</button> : null}
                            {stepMedia("after")}
                          </div>
                        </li>
                        <li className={stepClass(4)}>
                          {num(4)}
                          <div>
                            <b>{workOutcomes.includes(savedOutcome) ? "✅ Job finished" : "Finish the job"}</b>
                            <small>{savedOutcome ? `${FIELD_OUTCOMES[savedOutcome]} · close it out with the package` : `${counts.before} before · ${counts.after} after`}</small>
                            {workOutcomes.includes(savedOutcome) && !steps[5].done ? (
                              <button type="button" className="jc-step-more" data-hpd-smoke="jc-step-switch-outcome" onClick={() => setJobOutcome(selectedJob, savedOutcome === "WORK_COMPLETED" ? "PARTIAL_WORK" : "WORK_COMPLETED", "Changed on the job card")}>
                                {savedOutcome === "WORK_COMPLETED" ? "It was partial work" : "It was fully completed"}
                              </button>
                            ) : null}
                            {current === 4 ? (
                              <>
                                <div className="jc-step-choices">
                                  {workOutcomes.map((key) => (
                                    <button key={key} type="button" className={draft.outcome === key ? "is-picked" : ""} data-hpd-smoke={`jc-step-${key.toLowerCase()}`} onClick={() => setOutcomeDrafts((prev) => ({ ...prev, [id]: { note: prev[id]?.note || "", outcome: key } }))}>{FIELD_OUTCOMES[key]}</button>
                                  ))}
                                </div>
                                {outcomeForm(workOutcomes)}
                              </>
                            ) : null}
                          </div>
                        </li>
                      </>
                    ) : null}
                    <li className={stepClass(5)}>
                      {num(5)}
                      <div>
                        <b>Package</b>
                        <small>{steps[5].done ? "Paperwork approved" : secondTry ? "After the 2nd try" : "Affidavit + invoice, signed and emailed"}</small>
                        {current === 5 && !secondTry ? <a href={paperworkHref} onClick={packageLinkClick(id, paperworkHref)} className="fc-next-action jc-glow" data-hpd-smoke="jc-step-package">Make the package<span aria-hidden="true">&rarr;</span></a> : null}
                      </div>
                    </li>
                    {outcomeMessage ? <p className="fc-save-message" role="status">{outcomeMessage}</p> : null}
                    {mediaMessage ? <p className={`fc-save-message ${/fail|too |could not|couldn|error|not saved|no image/i.test(mediaMessage) ? "is-error" : ""}`} role="status" data-hpd-smoke="jc-media-message">{mediaBusy ? "Saving... keep this screen open. " : ""}{mediaMessage}</p> : mediaBusy ? <p className="fc-save-message" role="status">Saving {mediaBusy} photos/videos... keep this screen open.</p> : null}
                  </ol>
                );
              })()}

              {/* Right under the steps: where the job stands, and its before/after photos and videos. */}
              <div className="jc-status-media" data-hpd-smoke="jc-status-media" role="group" aria-label="Job status and media">
                {(() => {
                  const outcome = value(selectedJob, ["FieldOutcome", "fieldOutcome"]);
                  const label = FIELD_OUTCOMES[outcome];
                  const approved = Boolean(value(selectedJob, ["PackageApprovedAt"])) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"]));
                  const booked = activeAppointment(selectedJob);
                  if (booked && !FIELD_OUTCOMES[outcome.replace(/^APPOINTMENT_.*/, "")] && !counts.before) {
                    const when = appointmentTiming(booked);
                    return (
                      <div className={`jc-status-line is-appointment ${when.soon ? "is-soon" : ""}`} data-hpd-smoke="jc-status-line">
                        <strong>📅 Appointment · {appointmentLabel(booked)}</strong>
                        <span>{when.past ? "The time has passed: record what happened, or change the appointment" : when.soon ? (when.startsIn > 0 ? `Starts in ${when.startsIn} min` : "Happening now") : booked.state === "confirmed" ? "Confirmed · the job waits for it" : "Requested · the job waits for it"}</span>
                      </div>
                    );
                  }
                  if (!label) return <p className="jc-status-line" data-hpd-smoke="jc-status-line">{counts.before ? "🔨 Work in progress" : "Not started yet"}</p>;
                  const waiting = secondTryState(selectedJob);
                  if (waiting) return (
                    <div className="jc-status-line is-waiting" data-hpd-smoke="jc-status-line">
                      <strong>🔒 No access · 1st try {waiting.firstLabel}</strong>
                      <span>{waiting.due ? "2nd try is due now" : `2nd try from ${waiting.dueLabel}`}</span>
                    </div>
                  );
                  const icon = outcome === "WORK_COMPLETED" ? "✅" : outcome === "PARTIAL_WORK" ? "◐" : outcome === "REFUSED_ACCESS" ? "⛔" : outcome === "NO_ACCESS_1_WAITING_72H" ? "🔒" : outcome === "WORK_COMPLETED_BY_OTHERS" ? "👥" : "📅";
                  return (
                    <div className={`jc-status-line ${approved ? "is-approved" : "is-closeout"}`} data-hpd-smoke="jc-status-line">
                      <strong>{icon} {label}</strong>
                      <span>{approved ? "Package approved and sent" : outcome === "APPOINTMENT_REQUESTED" ? "Waiting on the appointment" : "Outcome saved · ready to close out"}</span>
                      {!approved && outcome !== "APPOINTMENT_REQUESTED" && !(autoPackage && autoPackage.id === id) ? <a className="jc-status-go" data-hpd-smoke="jc-status-package" href={paperworkGenerateHref(id, outcome)} onClick={packageLinkClick(id, paperworkGenerateHref(id, outcome))}>Review package →</a> : null}
                      {!approved ? <button type="button" className="jc-status-change" data-hpd-smoke="fc-clear-outcome" onClick={() => clearOutcome(selectedJob)}>Change outcome</button> : null}
                    </div>
                  );
                })()}
                {upgradeOn("next-job", id) && FIELD_OUTCOMES[value(selectedJob, ["FieldOutcome", "fieldOutcome"])] ? (() => {
                  // Next stop: the next open stop on Today's route; with no route (or none left),
                  // the closest open job to where you are (or to this job without a fix).
                  const openJob = (jobIdValue: string) => { const row = jobs.find((r) => jobId(r) === jobIdValue); return Boolean(row) && jobQueue(row!) === "pending" && !isTestJob(jobIdValue) && Boolean(jobLatLng(row!)); };
                  const onRoute = nextRouteStop(todayRouteIds(), id, openJob);
                  const routeTarget = onRoute ? jobs.find((row) => jobId(row) === onRoute.id) : null;
                  if (onRoute && routeTarget) {
                    return (
                      <div className="jc-next-job is-route" data-hpd-smoke="jc-next-job" data-next-source="route">
                        <strong>➡ Next on your route · stop {onRoute.stop} of {onRoute.of} · {onRoute.id}</strong>
                        <span>{jobAddress(routeTarget)} · {onRoute.left === 1 ? "last stop left" : `${onRoute.left} stops left`}</span>
                        <span className="jc-next-actions">
                          <a className="jc-next-waze" data-hpd-smoke="jc-next-waze" href={wazeHref(routeTarget)} target="_blank" rel="noreferrer" onClick={() => rememberNavigation(onRoute.id)}>Waze</a>
                          <a href={directionsHref(routeTarget)} target="_blank" rel="noreferrer" onClick={() => rememberNavigation(onRoute.id)}>Google</a>
                          <button type="button" data-hpd-smoke="jc-next-open" onClick={() => openIssueJob(routeTarget)}>Open job</button>
                        </span>
                      </div>
                    );
                  }
                  const fix = lastFixRef.current;
                  const from = fix && Date.now() - fix.at < 600000 ? { lat: fix.lat, lng: fix.lng } : jobLatLng(selectedJob);
                  if (!from) return null;
                  const spots = jobs.map((row) => { const at = jobLatLng(row); return { id: jobId(row), lat: at ? at.lat : NaN, lng: at ? at.lng : NaN, open: jobQueue(row) === "pending" && !isTestJob(jobId(row)) }; });
                  const best = nextJob(spots, id, from);
                  const target = best ? jobs.find((row) => jobId(row) === best.id) : null;
                  if (!best || !target) return <p className="jc-next-job is-none" data-hpd-smoke="jc-next-job">➡ No other open job with a location nearby.</p>;
                  return (
                    <div className="jc-next-job" data-hpd-smoke="jc-next-job" data-next-source="closest">
                      <strong>➡ Next closest job · {best.id}</strong>
                      <span>{jobAddress(target)} · {milesLabel(best.miles)}</span>
                      <span className="jc-next-actions">
                        <a className="jc-next-waze" data-hpd-smoke="jc-next-waze" href={wazeHref(target)} target="_blank" rel="noreferrer" onClick={() => rememberNavigation(best.id)}>Waze</a>
                        <a href={directionsHref(target)} target="_blank" rel="noreferrer" onClick={() => rememberNavigation(best.id)}>Google</a>
                        <button type="button" data-hpd-smoke="jc-next-open" onClick={() => openIssueJob(target)}>Open job</button>
                      </span>
                    </div>
                  );
                })() : null}
                {autoPackage && autoPackage.id === id ? (
                  <div className="jc-auto-package" role="status" data-hpd-smoke="jc-auto-package">
                    <strong>📦 Opening the package for review in {autoPackage.seconds}s…</strong>
                    <div>
                      <button type="button" className="jc-glow" data-hpd-smoke="jc-auto-package-now" onClick={() => openAutoPackage(autoPackage)}>Open now</button>
                      <button type="button" data-hpd-smoke="jc-auto-package-wait" onClick={() => setAutoPackage(null)}>Wait, add more</button>
                    </div>
                  </div>
                ) : null}
                <div className="jc-stages" role="group" aria-label="Job photos and videos">
                  {(["before", "after"] as const).map((kind) => {
                    const thumbs = mediaThumbs[id]?.[kind] || [];
                    return (
                      <button type="button" key={kind} className={`jc-stage ${mediaChoice === kind ? "is-open" : ""} ${next.key === kind ? "is-next" : ""}`} aria-expanded={mediaChoice === kind} onClick={() => requestMediaUpload(kind)} disabled={Boolean(mediaBusy)}>
                        <span className="jc-thumbs">
                          {thumbs.length ? thumbs.map((src, index) => <img key={index} src={src} alt="" />) : <PhotosIcon />}
                        </span>
                        <b>{kind === "before" ? "Before" : "After"}</b>
                        <small>{counts[kind] ? `${counts[kind]} saved · add more` : "Tap to add"}</small>
                      </button>
                    );
                  })}
                </div>
                {backup && counts.total > 0 ? (
                  <p className={`jc-backup ${backup.auto && !backup.error ? "is-on" : "is-off"}`} data-hpd-smoke="jc-backup">
                    {!backup.auto ? (
                      <>⚠ These photos are only on this phone. <button type="button" data-hpd-smoke="jc-backup-on" onClick={() => void turnOnDriveBackup()}>Back up to Drive</button></>
                    ) : backup.error ? (
                      <>⚠ Drive backup: {backup.error}</>
                    ) : backup.queued ? (
                      <>☁️ Backing up to Drive… {backup.queued} part{backup.queued === 1 ? "" : "s"} left</>
                    ) : backup.verifiedAt ? (
                      <>☁️ Drive backup on · last backup {formatSavedTime(backup.verifiedAt)} (photos and job steps)</>
                    ) : (
                      <>☁️ Drive backup on · first backup starting</>
                    )}
                    {backup.auto ? <VideoBackupLine jobId={id} /> : null}
                  </p>
                ) : null}
                {phoneSpace?.level === "full" ? (
                  <p className="jc-backup is-off" data-hpd-smoke="jc-space">⚠ This phone is almost out of space for the app ({formatBytes(phoneSpace.free)} left): new photos and videos may not save. <Link href="/storage/">See storage</Link></p>
                ) : null}
                {mediaChoice && !mediaChoiceInStep ? <div ref={mediaChoiceRef} className="fc-photo-choice jc-choice" role="group" aria-label={`${mediaChoice} photo source`}>
                  <div className="fc-photo-choice-heading"><strong>{mediaChoice === "before" ? "Before work" : "After work"}</strong><button type="button" aria-label="Cancel photo selection" onClick={() => setMediaChoice(null)}>&times;</button></div>
                  <div className="fc-photo-source-actions">
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("camera")}><PhotosIcon />Take photo</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("library")}><DocumentsIcon />Add photos</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("video-camera")}>Record video</button>
                    <button type="button" disabled={Boolean(mediaBusy)} onClick={() => chooseMediaSource("video-library")}>Add videos</button>
                  </div>
                </div> : null}
                {(["before", "after"] as const).some((kind) => counts[kind] > 0) ? (
                  <div className="jc-media-dates" data-hpd-smoke="jc-media-dates">
                    {(["before", "after"] as const).filter((kind) => counts[kind] > 0).map((kind) => (
                      <label key={kind}>
                        📅 {kind === "before" ? "Before" : "After"} date
                        <input type="date" data-hpd-smoke={`jc-media-date-${kind}`} value={counts[`${kind}Day`] || ""} disabled={Boolean(mediaBusy)}
                          onChange={(event) => void changeMediaDate(selectedJob, kind, event.target.value)} />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              {jobQueue(selectedJob) === "completed" ? (
                <section className="jc-done" data-hpd-smoke="jc-completed" aria-label="Job completed">
                  <strong>✓ Completed. No need to come back.</strong>
                  {value(selectedJob, ["PackageApprovedAt"]) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"])) ? (
                    <>
                      <span>Paperwork approved{value(selectedJob, ["PackageApprovedAt"]) ? ` ${formatSavedTime(value(selectedJob, ["PackageApprovedAt"]))}` : ""}.</span>
                      <button type="button" data-hpd-smoke="jc-archive" onClick={() => void archiveJob(selectedJob)}>Everything is correct: Archive</button>
                    </>
                  ) : (
                    <a href={paperworkHref} onClick={packageLinkClick(id, paperworkHref)} data-hpd-smoke="jc-done-paperwork">Paperwork not approved yet: finish the package →</a>
                  )}
                </section>
              ) : null}

              {/* Job info: everything about the job in one place, one after the other. */}
              <div className="jc-info" data-hpd-smoke="jc-info" role="group" aria-label="Job info">
                <div className="jc-section-head"><strong>Job info</strong></div>
                <div className="jc-facts">
                  <div className="jc-fact">
                    <small>Maturity</small>
                    <strong>{maturityDate(selectedJob) || "Not available"}</strong>
                    <span className="jc-priority" data-priority={jobPriority(selectedJob).band}>{jobPriority(selectedJob).label}</span>
                  </div>
                  <div className="jc-fact">
                    <small>COA Amount</small>
                    <strong>{jobAwardAmount(selectedJob) > 0 ? `${"$"}${jobAwardAmount(selectedJob).toLocaleString()}` : "Not listed"}</strong>
                  </div>
                  <div className="jc-fact jc-fact-wide">
                    <small>Tenant</small>
                    <strong data-hpd-smoke="jc-tenant">{tenant.name || (tenant.phone ? "Name not listed" : privateOk === false ? "Private: sign in with Google (Storage page) to see" : "Not listed")}</strong>
                    {tenant.phone ? <span>{tenant.phone} <a className="fc-call-btn" href={`tel:${tenant.phone}`}>Call</a></span> : tenant.summary.replace(tenant.name, "").replace(/^\s*·\s*/, "").trim() ? <span>{tenant.summary.replace(tenant.name, "").replace(/^\s*·\s*/, "").trim()}</span> : null}
                  </div>
                </div>
                {jobDateWarning(selectedJob) && <p className="jc-warning" role="status">{jobDateWarning(selectedJob)}</p>}
              {(() => {
                const fu = followUpOf(selectedJob, selectedJob.HpdClosedReason ? { closedReason: String(selectedJob.HpdClosedReason) } : undefined, selectedJob.PaperworkSentAt ? { sentAt: String(selectedJob.PaperworkSentAt), count: 1 } : undefined, calendarDate, selectedJob.HpdAskedAt ? { askedAt: String(selectedJob.HpdAskedAt), count: 1, by: String(selectedJob.HpdAskedBy || ""), kind: String(selectedJob.HpdAskedFor || ""), askedTs: Number(selectedJob.HpdAskedTs || 0), repliedTs: Number(selectedJob.HpdRepliedTs || 0) } : undefined);
                const md = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(2, 4)}` : "-");
                const left = fu.daysLeft === null ? "" : fu.state === "done" || fu.state === "hpd-closed" ? "" : fu.daysLeft < 0 ? `${-fu.daysLeft} days overdue` : fu.daysLeft === 0 ? "due today" : `${fu.daysLeft} days left`;
                return (
                  <div className={`jc-key-dates is-${fu.state}`} data-hpd-smoke="jc-key-dates">
                    {(() => {
                      // Where this job stands: Awarded -> Work done -> Paperwork sent -> HPD closed -> Paid.
                      const rj = rejections.find((r) => r.omo === fu.omo);
                      const stages = jobStages({ ...selectedJob, AwardDate: fu.awardDay || selectedJob.AwardDate, WorkCompletionDate: fu.maturityDay || selectedJob.WorkCompletionDate, HpdClosedReason: fu.hpdReason || selectedJob.HpdClosedReason || "", PaperworkSentAt: fu.sentAt || selectedJob.PaperworkSentAt || "" }, pipMap[fu.omo], rj || null);
                      return (
                        <div className="jc-journey" data-hpd-smoke="jc-journey">
                          <ol>
                            {stages.map((st) => (
                              <li key={st.key} className={`is-${st.tone}`} data-stage={st.key} data-tone={st.tone}>
                                <i aria-hidden="true">{st.tone === "done" ? "✓" : st.tone === "bad" ? "!" : st.tone === "now" ? "●" : ""}</i>
                                <b>{st.label}</b>
                                <small>{st.detail}</small>
                              </li>
                            ))}
                          </ol>
                          <p className="jc-journey-next" data-hpd-smoke="jc-journey-next">Next: {nextStep(stages)}</p>
                          {(() => { const ts = threadsFor(fu.omo); if (!ts.length) return null; const waiting = ts.filter((t) => t.waiting).length; return (
                            <button type="button" className={`jc-threads${waiting ? " is-waiting" : ""}`} data-hpd-smoke="jc-threads" onClick={() => setThreadView({ ids: ts.map((t) => t.id), title: `${fu.omo}: emails with HPD` })}>
                              💬 Emails with HPD ({ts.length}){waiting ? ` · ${waiting} waiting on you` : ""}
                            </button>
                          ); })()}
                        </div>
                      );
                    })()}
                    <div><span>Awarded</span><b>{md(fu.awardDay)}</b></div>
                    <div><span>Start</span><b>{md(fu.startDay)}</b></div>
                    <div><span>Complete by</span><b>{md(fu.maturityDay)}</b></div>
                    <p>{left ? <strong>{left}</strong> : null}{left ? " · " : ""}{fu.status}{fu.sentAt ? ` · paperwork sent to HPD ${md(fu.sentAt)}` : ""}{fu.hpdReason ? ` · HPD: closed (${fu.hpdReason})` : selectedJob.HpdClosedReason === "" && followRef.current ? " · HPD: still open" : ""}</p>
                    {pipMap[fu.omo] ? (
                      <p className={`jc-pip is-${pipMap[fu.omo].status.replace(/ /g, "-")}`} data-hpd-smoke="jc-pip">
                        💵 PIP: {pipMap[fu.omo].status === "paid" ? `paid $${pipMap[fu.omo].paid.toLocaleString()}` : pipMap[fu.omo].status === "partly paid" ? `partly paid $${pipMap[fu.omo].paid.toLocaleString()}, $${pipMap[fu.omo].outstanding.toLocaleString()} still open` : pipMap[fu.omo].outstanding > 0 ? `not paid yet ($${pipMap[fu.omo].outstanding.toLocaleString()} open)` : "closed with $0 paid"}
                      </p>
                    ) : null}
                    {(() => {
                      const rj = rejections.find((r) => r.omo === fu.omo);
                      return rj ? (
                        <p className={`jc-rejected${rj.answered ? " is-answered" : ""}`} data-hpd-smoke="jc-rejected">
                          {rj.answered ? (rj.correctedAt ? `✓ Rejected paperwork corrected ${rj.correctedAt}` : "✓ Paperwork was rejected, you answered HPD") : `❗ Payment paperwork REJECTED by HPD${rj.attempt ? ` (${rj.attempt} ATTEMPT)` : ""}`} · {md(rj.at)} · {senderName(rj.by)}: {rj.reason || "see HPD's email"}
                          {!rj.answered ? <a href={`/paperwork/?job=${encodeURIComponent(fu.omo)}&fix=${encodeURIComponent(rj.at)}`}> Fix &amp; resend →</a> : null}
                        </p>
                      ) : null;
                    })()}
                    {fu.askedAt && !rejections.some((r) => r.omo === fu.omo) ? (
                      <p className={`jc-hpd-notice${fu.hpdAsked ? " is-open" : ""}${/rejected/.test(fu.askedFor) ? " is-rejected" : ""}`} data-hpd-smoke="jc-hpd-notice">
                        📩 {senderName(fu.askedBy || "HPD")} · {fu.askedFor || "email"} · {md(fu.askedAt)}{fu.hpdAsked ? " · waiting on you" : " · answered"}
                        {fu.hpdAsked ? <a href={`/paperwork/?job=${encodeURIComponent(fu.omo)}`}> Open paperwork →</a> : null}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
              {(() => {
                const lock = paperworkLock(selectedJob);
                if (!lock.locked && !lock.revisions.length) return null;
                const day = (iso: string) => (iso && iso !== "approved" ? new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) : "");
                return (
                  <div className={`jc-lock ${lock.locked ? "is-locked" : "is-revising"}`} data-hpd-smoke="jc-lock">
                    {lock.locked
                      ? <><strong>🔒 Paperwork sent to HPD{day(lock.approvedAt) ? ` ${day(lock.approvedAt)}` : ""}</strong><span>{lock.emailedAt ? `Emailed ${day(lock.emailedAt)}${lock.emailedTo ? ` to ${lock.emailedTo}` : ""}. ` : ""}Locked: the outcome and dates can&apos;t change. To change them, open the paperwork and tap Revise.</span></>
                      : <><strong>✏️ Paperwork being revised</strong><span>The version sent {day(lock.revisions[lock.revisions.length - 1].approvedAt)} is kept. Reason: {lock.revisions[lock.revisions.length - 1].reason}</span></>}
                    {lock.revisions.length ? <small>Revised {lock.revisions.length}x · earlier versions are kept in the job&apos;s record</small> : null}
                  </div>
                );
              })()}
              <div className="fc-visit-summary jc-visit" style={{borderLeftColor:visitState(selectedJob).color}}>
                <strong>{visitState(selectedJob).label} · {visitState(selectedJob).count} recorded visits</strong>
                {visitState(selectedJob).lastAt && <span>Last visit: {/^\d{4}-\d{2}-\d{2}$/.test(visitState(selectedJob).lastAt) ? visitState(selectedJob).lastAt : formatSavedTime(visitState(selectedJob).lastAt)}</span>}
                {visitState(selectedJob).count > 0 && <span>{FIELD_OUTCOMES[visitState(selectedJob).lastOutcome] || visitState(selectedJob).lastOutcome}</span>}
                {visitState(selectedJob).note && <span>{visitState(selectedJob).note}</span>}
                {visitState(selectedJob).kind === "blocked" && <span>Excluded from routes. Review required before returning.</span>}
                {["blocked","return"].includes(visitState(selectedJob).kind) && <button type="button" onClick={() => {
                  if (!window.confirm("Approve a return visit to this job? Existing visit records will be kept.")) return;
                  const patch = {RevisitApprovedAt:new Date().toISOString()};
                  try { writeSharedWorkflowPatch(jobId(selectedJob),patch); mergeWorkflowPatchIntoScreen(jobId(selectedJob),patch); }
                  catch { setOutcomeMessage("Return approval could not be saved. Try again."); }
                }}>Approve return visit</button>}
              </div>
                {Array.isArray(selectedJob.FieldVisitHistory) && selectedJob.FieldVisitHistory.length > 0 ? <details className="fc-visit-history"><summary>Visit history ({selectedJob.FieldVisitHistory.length})</summary><ol>{selectedJob.FieldVisitHistory.map((entry: { recordedAt?: string; outcome?: string; note?: string }, index: number) => <li key={index}><time>{entry.recordedAt ? formatSavedTime(entry.recordedAt) : "Date not recorded"}</time><strong>{FIELD_OUTCOMES[entry.outcome || ""] || "Visit note"}</strong><p>{entry.note}</p></li>)}</ol></details> : null}
              <details className="jc-dates">
                <summary>Job dates</summary>
                <dl>
                  <div><dt>Award date</dt><dd>{value(selectedJob, ["AwardDate", "awardDate"]) || "Not available"}</dd></div>
                  <div><dt>Maturity date{!["MaturityDate", "maturityDate", "DueDate", "dueDate"].some(key => selectedJob[key] !== undefined && selectedJob[key] !== null) ? " (contract finish)" : ""}</dt><dd>{maturityDate(selectedJob) || "Not available"}</dd></div>
                  <div><dt>Contract start</dt><dd>{jobDate(selectedJob, "start") || "Not available"}</dd></div>
                  <div><dt>Contract finish</dt><dd>{jobDate(selectedJob, "finish") || "Not available"}</dd></div>
                  <div><dt>Actual work start</dt><dd>{value(selectedJob, ["ActualWorkStartDate", "actualWorkStartDate"]) || "Not recorded"}</dd></div>
                  <div><dt>Actual work finish</dt><dd>{value(selectedJob, ["ActualWorkCompletionDate", "actualWorkCompletionDate"]) || "Not recorded"}</dd></div>
                </dl>
              </details>
              </div>

              <JobAssistant key={`assistant-${id}`} job={selectedJob} id={id} media={mediaCounts[id] || null} />
              <div className="jc-media-docs" role="group" aria-label="Documents">
                <div className="jc-section-head">
                  <strong>Documents</strong>
                  <span>{counts.total} photo/video saved</span>
                </div>
                <SavedPackageLink key={id} id={id} />
                <div className="jc-docs">
                  <a className="jc-doc jc-doc-primary" href={paperworkHref} onClick={packageLinkClick(id, paperworkHref)}>
                    <DocumentsIcon />
                    <span><b>Affidavit + Invoice</b><small>{packageStatusText(selectedJob)}</small></span>
                    <i aria-hidden="true">&rarr;</i>
                  </a>
                  {value(selectedJob, ["PackageDriveLink"]) ? (
                    <a className="jc-doc" href={value(selectedJob, ["PackageDriveLink"])} target="_blank" rel="noreferrer">
                      <DocumentsIcon />
                      <span><b>Package in Google Drive</b><small>Saved approved package</small></span>
                      <i aria-hidden="true">&#8599;</i>
                    </a>
                  ) : null}
                  <JobSafeLine jobId={id} emailedAt={value(selectedJob, ["PackageEmailedAt"])} emailedTo={value(selectedJob, ["PackageEmailedTo"])} inInbox={String(selectedJob.PackageEmailInInbox) === "true"} />
                  <Link className="jc-doc" href={`/jobs/${id}`}>
                    <DocumentsIcon />
                    <span><b>Job documents</b><small>ITB, COA and saved files</small></span>
                    <i aria-hidden="true">&rarr;</i>
                  </Link>
                </div>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="fc-hidden-file"
                  onChange={(event) => void handleMediaFiles(event.target.files)}
                />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
                <input ref={videoCameraInputRef} type="file" accept="video/*" capture="environment" className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
                <input ref={videoLibraryInputRef} type="file" accept="video/*,.mov,.mp4,.m4v,.webm" multiple className="fc-hidden-file" onChange={(event) => void handleMediaFiles(event.target.files)} />
              </div>

              {/* More: the less common actions, at the very bottom. */}
              <div className="fc-card-footer jc-footer" data-hpd-smoke="jc-more">
              <button type="button" className="fc-outcome-link" data-hpd-smoke="jc-start-over" onClick={() => beginClearWorkflow(selectedJob)}>Start over</button>
              {jobId(selectedJob) !== TEST_JOB_ID ? (
                <button type="button" className={`fc-outcome-link ${isTestModeJob(jobId(selectedJob)) ? "is-on" : ""}`} data-hpd-smoke="jc-test-mode" aria-pressed={isTestModeJob(jobId(selectedJob))}
                  onClick={() => { const on = !isTestModeJob(id); setTestModeJob(id, on); setTestModeVersion((v) => v + 1); setMediaMessage(on ? `Test mode ON for ${id}: packages go to Drive "TEST jobs / ${id}" and are marked TEST.` : `Test mode OFF for ${id}: packages go to the normal Drive folders.`); }}>
                  🧪 Test {isTestModeJob(jobId(selectedJob)) ? "ON" : "off"}
                </button>
              ) : null}
              <button type="button" className="fc-job-details-toggle" aria-expanded={sheetExpanded} onClick={() => setSheetExpanded((expanded) => !expanded)}>{sheetExpanded ? "Less" : "Details"}<span aria-hidden="true">{sheetExpanded ? "⌄" : "⌃"}</span></button>
              </div>
              {clearJobId === id ? (
                <section className="fc-clear-confirm" aria-label="Confirm start over">
                  <p className="fc-clear-warn">Start over clears the outcome, every step, the package status and ALL photos/videos of this job on this phone. Drive and sent emails are not touched. Type CLEAR to confirm.</p>
                  <input
                    value={clearText}
                    onChange={(event) => setClearText(event.target.value)}
                    placeholder="Type CLEAR"
                    autoCapitalize="characters"
                  />
                  <button type="button" data-hpd-smoke="jc-start-over-confirm" onClick={() => void clearWorkflow(selectedJob)} disabled={clearText.trim().toUpperCase() !== "CLEAR"}>
                    Start over
                  </button>
                  <button type="button" onClick={() => setClearJobId("")}>
                    Keep
                  </button>
                </section>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {/* Which version is running, always visible on the map: you can tell at a glance it's the newest. */}
      {appVersion && !selectedJob ? <button type="button" className="fc-version-tag" data-hpd-smoke="fc-version-tag" onClick={() => { setWhatsNewOpen(true); void loadWhatsNew(); void loadChangeThreads(); const now = new Date().toISOString(); window.setTimeout(() => { setRepliesSeen(now); try { localStorage.setItem("hpd-replies-seen", now); } catch { /* private mode */ } }, 4000); }}>{versionLabel() || `v${appVersion}`} · what&apos;s new{newReplies ? <b className="fc-version-new" data-hpd-smoke="fc-version-new"> · 💬 {newReplies} new update{newReplies === 1 ? "" : "s"}</b> : null}</button> : null}
      {justUpdated && !selectedJob && !whatsNewOpen ? (
        <div className="fc-updated-banner" role="status" data-hpd-smoke="fc-updated-banner">
          <span>✨ App updated{whatsNew?.[0]?.items?.[0] ? `: ${whatsNew[0].items[0]}` : ""}</span>
          <button type="button" onClick={() => { setWhatsNewOpen(true); setJustUpdated(false); }}>What&apos;s new</button>
          <button type="button" aria-label="Dismiss" onClick={() => setJustUpdated(false)}>✕</button>
        </div>
      ) : null}
      {whatsNewOpen ? (
        <div className="fc-package-sheet fc-summary-sheet fc-whatsnew-sheet" role="dialog" aria-label="What's new" data-hpd-smoke="fc-whatsnew">
          <header>
            <button type="button" aria-label="Close" onClick={() => setWhatsNewOpen(false)}>Close</button>
            <strong>✨ What&apos;s new</strong>
          </header>
          <div className="fc-summary-body">
            <p className="fc-follow-note" data-hpd-smoke="fc-whatsnew-version">This version: {versionLabel() || `v${appVersion}`}{BUILT_COMMIT ? ` (${BUILT_COMMIT})` : ""}. Every version is kept.</p>
            <section className="fc-ask-change" data-hpd-smoke="fc-ask-change">
              <h4>💡 Ask for a change</h4>
              <textarea rows={3} data-hpd-smoke="fc-ask-change-text" placeholder="What should be better? e.g. make the notice text bigger, add 15 days to the filter…" value={changeText} onChange={(e) => setChangeText(e.target.value)} />
              <button type="button" data-hpd-smoke="fc-ask-change-save" disabled={!changeText.trim()} onClick={() => void askForChange()}>Save my request</button>
              {changeStatus ? <p className="fc-follow-note" data-hpd-smoke="fc-ask-change-status">{changeStatus}</p> : null}
            </section>
            <section className="fc-change-threads" data-hpd-smoke="fc-change-threads">
              <h4>💬 Your requests and progress</h4>
              {changeThreads === null ? <p className="fc-follow-note">Couldn&apos;t load them right now.</p>
                : !changeThreads.length ? (myRequests.length ? <ul>{myRequests.slice(0, 5).map((r) => <li key={r.at}>{r.text}</li>)}</ul> : <p className="fc-follow-note">No requests yet.</p>)
                : changeThreads.map((t) => (
                  <article key={t.id} className={`fc-change-thread is-${t.status.toLowerCase().replace(/[^a-z]+/g, "-")}`} data-hpd-smoke="fc-change-thread">
                    <p className="fc-change-ask"><small>You · {new Date(t.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>{t.text}</p>
                    <b className="fc-change-status" data-hpd-smoke="fc-change-status">{t.status === "Done" ? "✅" : t.status === "Working on it" ? "🔧" : "📥"} {t.status}{t.status === "Received" && !t.updates.length ? <small className="fc-change-pickup" data-hpd-smoke="fc-change-pickup"> · {pickupLabel()}</small> : null}</b>
                    {t.workingAt && Date.now() - Date.parse(t.workingAt) < 30 * 60000 ? <p className="fc-change-working" data-hpd-smoke="fc-change-working"><i aria-hidden="true" /> Claude is working on this right now (since {new Date(t.workingAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})</p> : null}
                    {t.steps.length ? (() => {
                      const done = t.steps.filter((x) => x.done).length;
                      const pct = Math.round((done / t.steps.length) * 100);
                      return (
                        <div className="fc-change-progress" data-hpd-smoke="fc-change-progress">
                          <div className="fc-change-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                          <small data-hpd-smoke="fc-change-count">{done} of {t.steps.length} steps · {pct}%</small>
                          <ol>{t.steps.map((x) => <li key={x.text} className={x.done ? "is-done" : ""}>{x.done ? "✓" : "○"} {x.text}</li>)}</ol>
                        </div>
                      );
                    })() : null}
                    {t.updates.map((u) => (
                      <div key={u.at} className={`fc-change-update${u.at > repliesSeen ? " is-new" : ""}`} data-hpd-smoke="fc-change-update">
                        <small>Update · {new Date(u.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}{u.at > repliesSeen ? " · new" : ""}</small>
                        <p>{u.text}</p>
                      </div>
                    ))}
                  </article>
                ))}
            </section>
            {whatsNew === null ? <p className="fc-follow-note">Couldn&apos;t load the list of changes.</p> : !whatsNew ? <p className="fc-follow-note">Loading…</p> : whatsNew.map((v) => (
              <section key={v.date + v.title} className="fc-whatsnew-day" data-hpd-smoke="fc-whatsnew-day">
                <h4>{v.date} · {v.title}</h4>
                <ul>{v.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
      <BidsMode
        open={bidsOpen}
        map={mapRef.current}
        history={bidHistory}
        onClose={() => setBidsOpen(false)}
      />
      {closeOutOpen ? (
        <div className="fc-package-sheet fc-summary-sheet fc-work-sheet" role="dialog" aria-label="Ready to close out" data-hpd-smoke="fc-close-out-sheet">
          <header>
            <button type="button" aria-label="Close" onClick={() => setCloseOutOpen(false)}>Close</button>
            <strong>📋 {closeOutJobs.length} job{closeOutJobs.length === 1 ? "" : "s"} ready to close out</strong>
          </header>
          <div className="fc-summary-body">
            <p className="fc-follow-note">Visit result saved, package not approved yet. Tap a job to open it, or Package to make the paperwork.</p>
            <ul className="fc-data-check-list fc-work-list">
              {closeOutJobs.map((job) => {
                const outcome = value(job, ["FieldOutcome", "fieldOutcome"]);
                return (
                  <li key={jobId(job)} className="fc-close-out-row">
                    <button type="button" onClick={() => { setCloseOutOpen(false); openIssueJob(job); }}>
                      <b>{jobId(job)}</b> <span>{jobAddress(job)}</span>
                      <small>{FIELD_OUTCOMES[outcome]}{isTestJob(jobId(job)) ? " · TEST" : ""}</small>
                    </button>
                    <a className="fc-close-out-go" data-hpd-smoke="fc-close-out-package" href={paperworkGenerateHref(jobId(job), outcome)} onClick={packageLinkClick(jobId(job), paperworkGenerateHref(jobId(job), outcome))}>Package →</a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
      {secondTryOpen ? (
        <div className="fc-package-sheet fc-summary-sheet fc-work-sheet" role="dialog" aria-label="2nd tries" data-hpd-smoke="fc-second-try-sheet">
          <header>
            <button type="button" aria-label="Close" onClick={() => setSecondTryOpen(false)}>Close</button>
            <strong>🔒 {secondTryJobs.length} 2nd tr{secondTryJobs.length === 1 ? "y" : "ies"}{secondTryJobs.some((row) => row.second.due) ? ` · ${secondTryJobs.filter((row) => row.second.due).length} due now` : ""}</strong>
          </header>
          <div className="fc-summary-body">
            <p className="fc-follow-note">No access on the 1st try: the 2nd try is allowed 3 days later.</p>
            <ul className="fc-data-check-list fc-work-list">
              {secondTryJobs.map(({ job, second }) => (
                <li key={jobId(job)} className={second.due ? "is-due" : ""}>
                  <button type="button" onClick={() => { setSecondTryOpen(false); openIssueJob(job); }}>
                    <b>{jobId(job)}</b> <span>{jobAddress(job)}</span>
                    <small>{second.due ? "Due now" : `From ${second.dueLabel}`} · 1st try {second.firstLabel}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {threadView ? (
        <div className="fc-package-sheet fc-summary-sheet fc-thread-viewer" role="dialog" aria-label="Conversation with HPD" data-hpd-smoke="fc-thread-viewer">
          <header>
            <button type="button" data-hpd-smoke="fc-thread-close" onClick={() => setThreadView(null)}>← Back</button>
            <strong>💬 {threadView.title}</strong>
          </header>
          <div className="fc-summary-body">
            {(threads || []).filter((t) => threadView.ids.includes(t.id)).map((t) => (
              <article key={t.id} className="fc-thread" data-hpd-smoke="fc-thread">
                {threadView.ids.length > 1 ? <h4>{t.subject}</h4> : null}
                <p className="fc-follow-note">{t.kind}{t.omos.length ? ` · ${t.omos.join(", ")}` : ""} · {t.waiting ? "HPD wrote last: waiting on your answer" : "you answered last"}</p>
                {t.messages.map((m, i) => (
                  <div key={i} className={`fc-msg ${m.mine ? "is-mine" : "is-hpd"}`} data-hpd-smoke="fc-msg">
                    <small>{m.from} · {new Date(m.at).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" })}</small>
                    <p>{m.text || "(no text)"}</p>
                    {m.files.length ? <small className="fc-msg-files">📎 {[...new Set(m.files)].join(", ")}</small> : null}
                  </div>
                ))}
                <div className="fc-thread-actions">
                  <a className="fc-follow-paper is-gmail" data-hpd-smoke="fc-thread-gmail" href={`https://mail.google.com/mail/u/0/#all/${t.id}`} target="_blank" rel="noreferrer">↩ Reply in Gmail</a>
                  {t.omos.filter((o) => findAnyJob(o)).slice(0, 3).map((o) => <button key={o} type="button" className="fc-follow-paper" onClick={() => { setThreadView(null); setNoticesOpen(false); const j = findAnyJob(o); if (j) setSelectedJob(j); }}>Open job {o} →</button>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {noticeView ? (
        <div className="fc-package-sheet fc-summary-sheet fc-notice-viewer" role="dialog" aria-label={`HPD's notice for ${noticeView}`} data-hpd-smoke="fc-notice-viewer">
          <header>
            <button type="button" data-hpd-smoke="fc-notice-viewer-close" onClick={() => setNoticeView("")}>← Notices</button>
            <strong>HPD&apos;s notice · {noticeView}</strong>
          </header>
          <div className="fc-summary-body">
            {noticeMail === null ? <p className="fc-follow-note" data-hpd-smoke="fc-notice-signin">HPD&apos;s notices are private (they name people and addresses). <a href="/storage/">Sign in with Google</a> on this phone to see them here.</p>
              : noticeMail === undefined ? <p className="fc-follow-note">Loading HPD&apos;s notice…</p>
              : !noticeMail[noticeView]?.length ? <p className="fc-follow-note">This notice hasn&apos;t been read from your email yet. <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(noticeView)}`} target="_blank" rel="noreferrer">Open it in Gmail ↗</a></p>
              : noticeMail[noticeView].map((m, i) => (
                <article key={i} className="fc-notice-mail" data-hpd-smoke="fc-notice-mail">
                  <p className="fc-notice-meta"><b>{m.subject}</b><span>{new Date(m.date).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" })} · {m.from.replace(/<.*>/, "").replace(/"/g, "").trim()}</span></p>
                  {m.body ? <pre className="fc-notice-body">{m.body}</pre> : null}
                  {m.files.map((f) => <ItbPages key={f.file} pdfUrl={noticePdfUrl(f.file)} pageCount={12} everyPage title={f.name} />)}
                </article>
              ))}
            {(() => { const rj = openRejections.find((x) => x.omo === noticeView); return rj && findAnyJob(noticeView) ? <a className="fc-follow-paper" data-hpd-smoke="fc-notice-fix" href={`/paperwork/?job=${encodeURIComponent(noticeView)}&fix=${encodeURIComponent(rj.at)}`}>Fix &amp; resend this one →</a> : null; })()}
          </div>
        </div>
      ) : null}
      {noticeChooser && !noticesOpen && !selectedJob ? (
        <div className={`fc-notice-chooser${noticeMini ? " is-mini" : ""}`} role="dialog" aria-label="Notices on the map" data-hpd-smoke="fc-notice-chooser">
          <header>
            <strong data-hpd-smoke="fc-notice-chooser-title">{NOTICE_KINDS.find((k) => k.key === (noticeKind || "all"))?.icon} {NOTICE_KINDS.find((k) => k.key === (noticeKind || "all"))?.short}{noticeMini ? ` · ${filteredJobs.length}` : `: ${filteredJobs.length} on the map${noticeKind && noticeSets[noticeKind].size > filteredJobs.length ? ` (of ${noticeSets[noticeKind].size})` : ""}`}</strong>
            {!noticeMini ? <button type="button" className="fc-notice-mini-btn" data-hpd-smoke="fc-today-open" onClick={() => { setNoticeChooser(false); setSummaryToday(true); }}>☀️ Today</button> : null}
            {noticeMini ? <button type="button" className="fc-notice-mini-btn" data-hpd-smoke="fc-notice-change" onClick={() => setNoticeMini(false)}>Change ▴</button> : null}
            {noticeMini ? <button type="button" className="fc-notice-mini-btn" data-hpd-smoke="fc-notice-mini-list" onClick={() => setNoticesOpen(true)}>List</button> : null}
            <button type="button" data-hpd-smoke="fc-notice-chooser-close" aria-label="Close" title="Back to all jobs" onClick={() => { setNoticeChooser(false); setFollowFilter(""); setNoticeKind(""); }}>✕</button>
          </header>
          <button type="button" className={`fc-board-open${boardUrgent.length ? " is-hot" : ""}`} data-hpd-smoke="fc-notice-board-open" onClick={() => { closeScreens("board"); setBoardShow("all"); setBoardOpen(true); }}>
            <span aria-hidden="true">⏱</span><b>Vendor tracking board</b><small>{boardOpenRows.filter((r) => r.kind === "ppn").length} notices · {boardOpenRows.filter((r) => r.kind === "docs").length} missing docs{boardUrgent.length ? ` · ${boardUrgent.length} under 6 h` : ""}</small>
          </button>
          <div className="fc-notice-picks">
            {NOTICE_KINDS.map((k) => (
              <button key={k.key} type="button" title={k.note} aria-pressed={noticeKind === k.key} className={`fc-notice-pick is-${k.key}${noticeKind === k.key ? " is-on" : ""}`} data-hpd-smoke={`fc-notice-pick-${k.key}`} onClick={() => pickNotices(k.key)}>
                <span className="fc-notice-pick-icon" aria-hidden="true">{k.icon}</span>
                <b>{k.short}</b>
                <em>{noticeSets[k.key].size}</em>
                {k.key === "priority" && nextDue ? <small className="fc-notice-pick-timer" data-hpd-smoke="fc-notice-timer">⏱ {dueText(nextDue.dueAt)}</small> : null}
                {k.key === "rejected" && payTrack.summary.held ? <small className="fc-notice-pick-timer is-money" data-hpd-smoke="fc-notice-held">{money(payTrack.summary.held)} held</small> : null}
              </button>
            ))}
            <button type="button" className="fc-notice-pick is-list" data-hpd-smoke="fc-notice-pick-list" onClick={() => setNoticesOpen(true)}>
              <span className="fc-notice-pick-icon" aria-hidden="true">📋</span><b>The list</b>
            </button>
          </div>
        </div>
      ) : null}
      {noticesOpen ? (
        <div className="fc-package-sheet fc-summary-sheet fc-notices-sheet" role="dialog" aria-label="HPD notices" data-hpd-smoke="fc-notices-sheet">
          <header>
            <strong>📩 HPD notices</strong>
            <button type="button" aria-label="Close" onClick={() => setNoticesOpen(false)}>Close (keep on map)</button>
            <button type="button" data-hpd-smoke="fc-notices-show-all" onClick={() => { setNoticesOpen(false); setNoticeChooser(false); setFollowFilter(""); setNoticeKind(""); }}>Show all jobs</button>
          </header>
          <div className="fc-summary-body fc-follow-body" data-hpd-smoke="fc-notices-body">
            {/* Two departments, never mixed (owner, 16 Oct): PROCUREMENT pays you (job done, invoice sent; they reject
                the invoice / affidavit and you correct it) and VENDOR TRACKING (Lewis, Gafur) asks for documents or updates. */}
            <nav className="fc-notice-tabs fc-notice-depts" role="tablist" data-hpd-smoke="fc-notice-tabs">
              {([
                ["procure", "💵 Procurement", "Pays you. Job done, invoice sent: fix what they rejected.", [
                  ["rejected", "❗ Rejected", openRejections.length],
                  ["corrections", "✏️ Corrections", threadsOf(CORRECTION_KINDS).filter((t) => t.waiting).length],
                  ["print", "🖨 Print & mail", toPrint.filter((c) => !c.mailedAt).length],
                  ["money", `💰 To get paid · ${money(payTrack.summary.held)}`, 0],
                ]],
                ["vendor", "🔥 Vendor tracking = Priority", "Lewis / Gafur asking for the affidavit, invoice or an update.", [
                  ["priority", "🔥 Priority", vendorTodo.length],
                  ["requests", "📧 Their emails", followReport.hpdAsked.length + threadsOf(REQUEST_KINDS).filter((t) => t.waiting).length],
                  ["messages", "💬 Messages", threadsOf(MESSAGE_KINDS).filter((t) => t.waiting).length],
                ]],
              ] as const).map(([dept, title, note, tabsRaw]) => {
                const tabs = tabsRaw as readonly (readonly [typeof noticesTab, string, number])[];
                const on = tabs.some(([key]) => key === noticesTab);
                const total = tabs.reduce((a, [, , n]) => a + n, 0);
                return (
                  <div key={dept} className={`fc-notice-dept is-${dept}${on ? " is-on" : ""}`} data-hpd-smoke={`fc-notice-dept-${dept}`}>
                    <button type="button" className="fc-notice-dept-head" onClick={() => { const k = tabs[0][0]; setNoticesTab(k); setNoticeKind(k === "money" ? "rejected" : k === "priority" || k === "rejected" || k === "corrections" || k === "print" ? k : ""); }}><strong>{title}</strong>{total ? <b>{total}</b> : null}<small>{note}</small></button>
                    <div className="fc-notice-dept-tabs">
                      {tabs.map(([key, label, n]) => (
                        <button key={key} type="button" role="tab" aria-selected={noticesTab === key} className={noticesTab === key ? "is-active" : ""} data-hpd-smoke={`fc-notice-tab-${key}`} onClick={() => { setNoticesTab(key); setNoticeKind(key === "money" ? "rejected" : key === "priority" || key === "rejected" || key === "corrections" || key === "print" ? key : ""); }}>{label}{n ? <b>{n}</b> : null}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
            {noticesTab === "priority" ? (
              <section className="fc-follow-section is-priority" data-hpd-smoke="fc-priorities">
                <h4>🔥 Vendor tracking is waiting on these ({vendorTodo.length})</h4>
                <p className="fc-follow-note">Most urgent first: 24-hour notices, 72-hour notices, missing documents. Payment problems (rejected invoice / affidavit) are under 💵 Procurement. Do each one, then tap Handled.{threads === null ? " Sign in with Google on this phone to see HPD's emails here." : ""}</p>
                {!vendorTodo.length ? <p className="fc-follow-note">Nothing waiting. 🎉</p> : (
                  <ol className="fc-prio-list">
                    {vendorTodo.map((it) => {
                      const job = findAnyJob(it.omo);
                      const due = dueText(it.dueAt);
                      return (
                        <Fragment key={it.key}>
                        <li className={`is-${it.kind}${/overdue/.test(due) ? " is-overdue" : ""}`} data-hpd-smoke="fc-prio-item" data-kind={it.kind}>
                          <div className="fc-prio-head"><b>{it.omo}</b><span>{job ? jobAddress(job) : ""}</span></div>
                          <p className="fc-prio-title">{it.kind === "24h" ? "🔥" : it.kind === "72h" ? "⏰" : it.kind === "rejection" ? "❗" : it.kind === "print" ? "🖨" : "📎"} {it.title}{it.who ? ` · ${it.who}` : ""}</p>
                          {due ? <p className="fc-prio-due" data-hpd-smoke="fc-prio-due">⏱ {due}</p> : <p className="fc-prio-asked">Asked {new Date(it.askedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</p>}
                          <p className="fc-prio-want">{it.want}</p>
                          {it.kind !== "print" ? <p className={`fc-prio-sent${it.sentAt ? " is-sent" : ""}`} data-hpd-smoke="fc-prio-sent">{it.sentAt ? `✓ Paperwork already sent ${it.sentAt}: answer them with that date` : "⚠️ No paperwork sent for this job yet"}</p> : null}
                          <div className="fc-notice-actions">
                            {job ? <button type="button" data-hpd-smoke="fc-prio-open" onClick={() => { setNoticesOpen(false); setSelectedJob(job); }}>Open job</button> : null}
                            {it.kind === "rejection" && job ? <a className="is-autofix" href={`/paperwork/?job=${encodeURIComponent(it.omo)}&fix=${encodeURIComponent(it.askedAt)}&auto=1`}>✨ Auto-fix &amp; preview</a> : null}
                            {(it.kind === "24h" || it.kind === "72h" || it.kind === "missing") && job ? <a href={`/paperwork/?job=${encodeURIComponent(it.omo)}`} data-hpd-smoke="fc-prio-paperwork">📄 Make the paperwork</a> : null}
                            {it.kind === "print" ? <button type="button" onClick={() => setNoticesTab("print")}>🖨 Print folder</button> : null}
                            {it.threadId ? <button type="button" data-hpd-smoke="fc-prio-email" onClick={() => setThreadView({ ids: [it.threadId], title: `${it.omo}: ${it.title}` })}>💬 HPD&apos;s email</button> : null}
                            {it.threadId && (it.kind === "24h" || it.kind === "72h" || it.kind === "missing") ? (prioDone[`replied:${it.key}`] ? <span className="fc-prio-replied" data-hpd-smoke="fc-prio-replied">✉ Replied {new Date(prioDone[`replied:${it.key}`]).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> : <button type="button" data-hpd-smoke="fc-prio-reply" onClick={() => startPrioReply(it)}>✉ Reply to {(it.who || "HPD").split(/\s+/)[0]}</button>) : null}
                            <button type="button" className={prioArmed === it.key ? "is-armed" : ""} data-hpd-smoke="fc-prio-done" onClick={() => markPrioDone(it.key)}>{prioArmed === it.key ? "Tap again: handled" : "✓ Handled"}</button>
                          </div>
                          {prioReply?.key === it.key ? (
                            <div className="fc-ack" data-hpd-smoke="fc-prio-reply-box">
                              <b>Email to {prioReply.name || "HPD"}{prioReply.to ? ` <${prioReply.to}>` : ""}</b>
                              {!prioReply.to ? <p className="fc-ack-status">No @hpd.nyc.gov address found in their email: use 💬 HPD&apos;s email -&gt; Reply in Gmail.</p> : null}
                              <label>Subject<input data-hpd-smoke="fc-prio-reply-subject" value={prioReply.subject} onChange={(e) => setPrioReply({ ...prioReply, subject: e.target.value, armed: false })} /></label>
                              <label>Message<textarea data-hpd-smoke="fc-prio-reply-text" rows={8} value={prioReply.text} onChange={(e) => setPrioReply({ ...prioReply, text: e.target.value, armed: false })} /></label>
                              <div className="fc-ack-actions">
                                <button type="button" className={prioReply.armed ? "is-armed" : ""} data-hpd-smoke="fc-prio-reply-send" disabled={!prioReply.to || prioReply.status === "Sending…"} onClick={() => void sendPrioReply(false)}>{prioReply.armed ? `✅ Tap again: send to ${prioReply.to}` : "✉ Send"}</button>
                                <button type="button" data-hpd-smoke="fc-prio-reply-me" disabled={prioReply.status === "Sending…"} onClick={() => void sendPrioReply(true)}>📨 Send to me first</button>
                                <button type="button" onClick={() => setPrioReply(null)}>Close</button>
                              </div>
                              {prioReply.status ? <p className="fc-ack-status" data-hpd-smoke="fc-prio-reply-status">{prioReply.status}</p> : null}
                            </div>
                          ) : null}
                        </li>
                        </Fragment>
                      );
                    })}
                  </ol>
                )}
              </section>
            ) : null}
            {noticesTab === "corrections" ? threadSection("corrections", "✏️ HPD asked for corrections", CORRECTION_KINDS, "HPD staff emails asking you to correct an affidavit / invoice (the automatic rejection notices are under Rejected).") : null}
            {noticesTab === "messages" ? threadSection("messages", "💬 Messages with HPD", MESSAGE_KINDS, "AEP, work orders and other emails with HPD staff.") : null}
            {noticesTab === "print" && !toPrint.length ? <p className="fc-follow-note" data-hpd-smoke="fc-notices-to-print-empty">Nothing waiting to print. Fixed rejections land here after you check the preview and save them.</p> : null}
            {noticesTab === "print" && toPrint.length ? (
              <section className="fc-follow-section is-to-print" data-hpd-smoke="fc-notices-to-print">
                <h4>🖨 Print folder: fixed rejections ({toPrint.filter((c) => !c.mailedAt).length} to finish)</h4>
                <p className="fc-follow-note">Each fixed rejection: print the original and sign it in ink with the notary, email HPD a copy, mail the original. The steps are kept here with their dates.</p>
                <ul className="fc-print-list">
                  {toPrint.filter((c) => !c.mailedAt).map((c) => {
                    const d = (x?: string) => (x ? new Date(x).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "");
                    const signer = noticeMail?.[c.omo]?.[0]?.signer?.replace(/,\s*CCAP$/i, "") || "HPD";
                    return (
                      <li key={c.omo} data-hpd-smoke="fc-to-print-row">
                        <div className="fc-print-head"><b>{c.omo}</b><span>{findAnyJob(c.omo) ? jobAddress(findAnyJob(c.omo)!) : ""}</span></div>
                        {c.reason ? <p className="fc-print-reason">HPD: {c.reason}</p> : null}
                        <ol className="fc-print-steps" data-hpd-smoke="fc-print-steps">
                          <li className="is-done">✓ Fixed {d(c.savedAt)}</li>
                          <li className={c.printedAt ? "is-done" : ""}>{c.printedAt ? `✓ Printed ${d(c.printedAt)}` : "Print"}</li>
                          <li className={c.emailedAt ? "is-done" : ""}>{c.emailedAt ? `✓ Copy emailed ${d(c.emailedAt)}` : "Email copy"}</li>
                          <li>Mail original</li>
                        </ol>
                        <div className="fc-to-print-actions">
                          <button type="button" data-hpd-smoke="fc-to-print-open" onClick={() => openCorrectionPdf(c)}>📄 Open / print (original)</button>
                          <button type="button" data-hpd-smoke="fc-to-print-copy" onClick={() => void openCorrectedCopy(c)}>👁 See the copy HPD gets</button>
                          <button type="button" data-hpd-smoke="fc-to-print-printed" onClick={() => void markPrinted(c)}>{c.printedAt ? "↺ Not printed" : "✓ Printed"}</button>
                          {c.emailedAt ? null : <button type="button" data-hpd-smoke="fc-ack-open" onClick={() => startAck(c.omo, c.reason || "")}>✉ Email copy to {signer}</button>}
                          <button type="button" className={printArmed === c.omo ? "is-armed" : ""} data-hpd-smoke="fc-to-print-sent" onClick={() => void correctionSent(c)}>{printArmed === c.omo ? "Tap again: original mailed" : "📮 Original mailed"}</button>
                        </div>
                        {c.emailedAt ? <small className="fc-ack-done" data-hpd-smoke="fc-ack-done">✉ Copy emailed to {c.emailedTo || signer} · {new Date(c.emailedAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</small> : null}
                        {ack?.omo === c.omo ? (
                          <div className="fc-ack" data-hpd-smoke="fc-ack">
                            <b>Email to {ack.name || "HPD"}{ack.to ? ` <${ack.to}>` : ""}</b>
                            <small className="fc-ack-attach" data-hpd-smoke="fc-ack-attach">📎 {c.omo} corrected affidavit and invoice (copy).pdf</small>
                            {!ack.to ? <p className="fc-ack-status">The app doesn&apos;t have the sender&apos;s address for this notice yet. Reply to HPD&apos;s notice in Gmail instead.</p> : null}
                            <label>Subject<input data-hpd-smoke="fc-ack-subject" value={ack.subject} onChange={(e) => setAck({ ...ack, subject: e.target.value, armed: false })} /></label>
                            <label>Message<textarea data-hpd-smoke="fc-ack-text" rows={9} value={ack.text} onChange={(e) => setAck({ ...ack, text: e.target.value, armed: false })} /></label>
                            <div className="fc-ack-actions">
                              <button type="button" className={ack.armed ? "is-armed" : ""} data-hpd-smoke="fc-ack-send" disabled={!ack.to || ack.status === "Sending…"} onClick={() => void sendAck()}>{ack.armed ? `✅ Tap again: send to ${ack.to}` : "✉ Send"}</button>
                              <button type="button" data-hpd-smoke="fc-ack-me" disabled={ack.status === "Sending to you…"} onClick={() => void sendAckToMe()}>📨 Send to me first</button>
                              <button type="button" onClick={() => setAck(null)}>Cancel</button>
                            </div>
                            {ack.status ? <p className="fc-ack-status" data-hpd-smoke="fc-ack-status">{ack.status}</p> : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {toPrint.some((c) => c.mailedAt) ? (
                  <details className="fc-print-done" data-hpd-smoke="fc-print-done">
                    <summary>✓ Done ({toPrint.filter((c) => c.mailedAt).length}): printed, copy emailed, original mailed</summary>
                    <ul>
                      {toPrint.filter((c) => c.mailedAt).map((c) => (
                        <li key={c.omo} data-hpd-smoke="fc-print-done-row">
                          <b>{c.omo}</b> <span>fixed {new Date(c.savedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}{c.printedAt ? ` · printed ${new Date(c.printedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""}{c.emailedAt ? ` · copy emailed ${new Date(c.emailedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""} · mailed {new Date(c.mailedAt!).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                          <button type="button" onClick={() => void removeCorrection(c.omo).then(async () => setToPrint(await listCorrections()))}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            ) : null}
            {noticesTab === "money" ? (
              <section className="fc-follow-section is-money" data-hpd-smoke="fc-money">
                <h4>💰 To get paid: rejections until HPD pays</h4>
                <div className="fc-money-sum" data-hpd-smoke="fc-money-sum">
                  <span className="is-held"><b>{money(payTrack.summary.held)}</b>held by {payTrack.summary.withAmount}{payTrack.summary.notInPip ? ` (+${payTrack.summary.notInPip} not in PIP yet)` : ""}</span>
                  <span className="is-fix"><b>{payTrack.summary.toFix}</b>to fix</span>
                  <span><b>{payTrack.summary.inTheMail}</b>in the mail</span>
                  <span className="is-paid"><b>{money(payTrack.summary.paid)}</b>paid after a rejection (90 days)</span>
                </div>
                <p className="fc-follow-note">Each rejection until the money comes in: ✏️ fix → 🖨 print &amp; sign in ink → ✉ email the copy → 📮 mail the original → 💵 paid. Paid comes from PIP (updated by the app every day).{payTrack.summary.lostCount ? ` ${payTrack.summary.lostCount} closed by HPD with $0 paid are at the bottom: dispute those with HPD.` : ""}</p>
                <ol className="fc-money-list">
                  {payTrack.rows.map((r) => {
                    const job = findAnyJob(r.omo);
                    return (
                      <li key={`${r.omo}-${r.at}`} className={`is-${r.status}`} data-hpd-smoke="fc-money-row" data-next={r.next || r.status}>
                        <div className="fc-money-top"><b>{r.omo}</b><strong>{r.status === "held" ? (r.inPip ? `${money(r.held)} held` : "Not in PIP yet") : r.status === "paid" ? `✓ ${money(r.paid)} paid` : "⚠️ Closed, $0 paid"}</strong></div>
                        <p className="fc-money-addr">{r.address || (job ? jobAddress(job) : "")} · rejected {r.at}{r.attempt ? ` · ${r.attempt.toLowerCase()}` : ""}</p>
                        {r.reason ? <p className="fc-money-reason">{r.reason}</p> : null}
                        <ol className="fc-money-steps">
                          {PAY_STEPS.map((st) => (
                            <li key={st.key} className={`${r.steps[st.key].done ? "is-done" : ""}${r.next === st.key ? " is-next" : ""}`}><span aria-hidden="true">{r.steps[st.key].done ? "✓" : st.icon}</span><small>{st.label}{r.steps[st.key].at ? ` ${new Date(r.steps[st.key].at.length === 10 ? `${r.steps[st.key].at}T12:00:00` : r.steps[st.key].at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""}</small></li>
                          ))}
                        </ol>
                        <div className="fc-notice-actions">
                          {r.next === "fixed" && job ? <a className="is-autofix" data-hpd-smoke="fc-money-fix" href={`/paperwork/?job=${encodeURIComponent(r.omo)}&fix=${encodeURIComponent(r.at)}&auto=1`}>✨ Auto-fix &amp; preview</a> : null}
                          {r.next === "printed" || r.next === "emailed" || r.next === "mailed" ? <button type="button" data-hpd-smoke="fc-money-print" onClick={() => { setNoticesTab("print"); setNoticeKind("print"); }}>🖨 Print folder: {PAY_STEPS.find((x) => x.key === r.next)?.label.toLowerCase()}</button> : null}
                          {r.next === "paid" ? <span className="fc-money-wait">Waiting for HPD to pay</span> : null}
                          {job ? <button type="button" onClick={() => { setNoticesOpen(false); setSelectedJob(job); }}>Open job</button> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
            {noticesTab === "rejected" ? (<>
            <p className="fc-follow-note">💵 Procurement (they pay you): the job is done and the invoice was sent, but the invoice / affidavit was rejected. Fix it and send it again. The map shows these jobs; tap ✕ on the map to show all jobs again.</p>
            <section className="fc-follow-section is-rejected" data-hpd-smoke="fc-notices-rejected">
              <h4>❗ Rejected paperwork · fix &amp; resend ({openRejections.length})</h4>
              {openRejections.length ? <ol>{openRejections.map((r) => (
                <li key={r.omo}>
                  <button type="button" data-hpd-smoke="fc-notice-row" onClick={() => { const job = findAnyJob(r.omo); if (job) { setNoticesOpen(false); setSelectedJob(job); } else setOpenNotice((o) => (o === r.omo ? "" : r.omo)); }}>
                    <span><b>{r.omo}</b> <em className="is-late">rejected {r.at}</em>{findAnyJob(r.omo) ? " · tap to open the job" : " · tap for details"}</span>
                    {r.pay ? <span className={`fc-pip is-${r.pay}`} data-hpd-smoke="fc-notice-pip">{r.pay === "payable" ? `💵 Not paid: $${r.openAmount.toLocaleString()} still open in PIP. Fix & resend to get paid` : r.pay === "lost" ? "⚠️ HPD closed it with $0 paid (PIP). Dispute with HPD to recover it" : `💵 Paid $${r.paidAmount.toLocaleString()} (PIP)`}</span> : null}
                    <span>{r.address || "older job (details in HPD's email)"}{!jobs.some((j) => jobId(j) === r.omo) && findAnyJob(r.omo) ? " · 2024-2025 job" : ""}</span>
                    <small>{r.attempt ? <b className={r.attempt === "FINAL" ? "fc-final-attempt" : ""}>{r.attempt} ATTEMPT · </b> : null}{senderName(r.by)}: {r.reason || "see HPD's email"}</small>
                  </button>
                  {openNotice === r.omo ? <p className="fc-notice-detail" data-hpd-smoke="fc-notice-detail">This job is from before 2026, so it isn&apos;t on the map. HPD&apos;s notice (with the rejection PDF) is in your email; correct the affidavit / invoice and send it back to HPD.</p> : null}
                  {toPrint.some((c) => c.omo === r.omo) ? <p className="fc-notice-fixed" data-hpd-smoke="fc-notice-fixed">✅ Fixed · rejection cleared, in the print folder{toPrint.find((c) => c.omo === r.omo)?.mailedAt ? " · original mailed" : ""}</p> : null}
                  <div className="fc-notice-actions">
                    <button type="button" className="is-notice" data-hpd-smoke="fc-notice-view" onClick={() => setNoticeView(r.omo)}>👁 HPD&apos;s notice{noticeMail?.[r.omo]?.length ? ` (${noticeMail[r.omo][0].files.length} PDF${noticeMail[r.omo][0].files.length === 1 ? "" : "s"})` : ""}</button>
                    {findAnyJob(r.omo) ? <a className="is-autofix" data-hpd-smoke="fc-notice-autofix" href={`/paperwork/?job=${encodeURIComponent(r.omo)}&fix=${encodeURIComponent(r.at)}&auto=1`}>✨ Auto-fix &amp; preview</a> : null}
                    {findAnyJob(r.omo) ? <a href={`/paperwork/?job=${encodeURIComponent(r.omo)}&fix=${encodeURIComponent(r.at)}`}>✏️ By hand</a> : null}
                    <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(r.omo)}`} target="_blank" rel="noreferrer">Gmail ↗</a>
                  </div>
                </li>
              ))}</ol> : <p>None waiting on you.</p>}
            </section>
            {toPrint.length ? (
              <section className="fc-follow-section is-cleared" data-hpd-smoke="fc-notices-cleared">
                <h4>✅ Cleared: fixed, in the print folder ({toPrint.length})</h4>
                <ul>{toPrint.map((c) => (
                  <li key={c.omo} data-hpd-smoke="fc-notice-cleared-row"><b>{c.omo}</b> <span>{c.mailedAt ? "original mailed" : c.emailedAt ? "copy emailed, original to mail" : c.printedAt ? "printed" : "ready to print"}</span></li>
                ))}</ul>
                <button type="button" className="fc-follow-paper" data-hpd-smoke="fc-notices-go-print" onClick={() => setNoticesTab("print")}>🖨 Open the print folder</button>
              </section>
            ) : null}
            </>) : null}
            {noticesTab === "requests" ? (<>
            <section className="fc-follow-section is-hpd-asked" data-hpd-smoke="fc-notices-requests">
              <h4>HPD asked · waiting on you ({followReport.hpdAsked.length})</h4>
              {followReport.hpdAsked.length ? <ol>{followReport.hpdAsked.map((r) => (
                <li key={r.omo}>
                  <button type="button" onClick={() => { const job = jobs.find((j) => jobId(j) === r.omo); if (job) { setNoticesOpen(false); setSelectedJob(job); } }}>
                    <span><b>{r.omo}</b> <em className="is-soon">{r.askedFor || "request"} · {r.askedAt}</em></span>
                    <span>{r.address}</span>
                    <small>{r.askedBy || "HPD"} · {r.status}</small>
                  </button>
                  <a className="fc-follow-paper" href={`/paperwork/?job=${encodeURIComponent(r.omo)}`}>Open paperwork →</a>
                </li>
              ))}</ol> : <p>None waiting on you.</p>}
            </section>
            {threadSection("requests", "📋 Vendor tracking: emails asking for the affidavit, invoice, photos and poor performance notices", REQUEST_KINDS, "J. Lewis (ERP) and D. Gafur (AEP) track vendors: they ask for the affidavit and invoice. Not the same as payment rejections or corrections.")}
            </>) : null}
          </div>
        </div>
      ) : null}
      {followOpen ? (
        <div className="fc-package-sheet fc-summary-sheet fc-follow-sheet" role="dialog" aria-label="Follow-up report" data-hpd-smoke="fc-follow-sheet">
          <header>
            <button type="button" onClick={() => setFollowOpen(false)}>← Map</button>
            <strong>Follow-up report</strong>
          </header>
          <div className="fc-summary-body">
            <p className="fc-follow-note">Status from the app, the affidavits / invoices you sent HPD, and HPD&apos;s own closing reason (updated nightly). Maturity = the job&apos;s work completion date.</p>
            <section className="fc-follow-section is-rejected" data-hpd-smoke="fc-follow-rejected">
              <h4>❗ Payment paperwork rejected · fix &amp; resend ({openRejections.length})</h4>
              {openRejections.length ? (
                <ol>{openRejections.map((r) => (
                  <li key={r.omo}>
                    <div className="fc-reject-row">
                      <span><b>{r.omo}</b> <em className="is-late">rejected {Number(r.at.slice(5, 7))}/{Number(r.at.slice(8, 10))}/{r.at.slice(2, 4)}</em></span>
                      <span>{r.address || "older job (not on the map)"}</span>
                      <small>{r.attempt ? <b className={r.attempt === "FINAL" ? "fc-final-attempt" : ""}>{r.attempt} ATTEMPT · </b> : null}{r.by}: {r.reason || "see HPD's email"}{r.count > 1 ? ` · rejected ${r.count}x` : ""}</small>
                      <a className="fc-follow-paper" href={`/paperwork/?job=${encodeURIComponent(r.omo)}&fix=${encodeURIComponent(r.at)}`}>Fix &amp; resend paperwork →</a>
                    </div>
                  </li>
                ))}</ol>
              ) : <p>No rejected paperwork waiting on you.</p>}
              {rejections.length > openRejections.length ? (
                <button type="button" className="fc-follow-more" onClick={() => setShowAnsweredRejections((v) => !v)}>{showAnsweredRejections ? "Hide" : "Show"} {rejections.length - openRejections.length} already answered</button>
              ) : null}
              {showAnsweredRejections ? (
                <ol className="is-answered">{rejections.filter((r) => r.answered).map((r) => (
                  <li key={r.omo}><div className="fc-reject-row"><span><b>{r.omo}</b> · rejected {r.at} · answered</span><small>{r.by}: {r.reason}</small></div></li>
                ))}</ol>
              ) : null}
            </section>
            <div className="fc-follow-tiles" data-hpd-smoke="fc-follow-tiles">
              {([["hpd-asked", "HPD asked for paperwork", followReport.counts.hpdAsked], ["overdue", "Overdue", followReport.counts.overdue], ["due-week", "Due this week", followReport.counts.dueWeek], ["recent", "Awarded last 30 days", followReport.counts.recent], ["sent", "Waiting on HPD", followReport.counts.waitingOnHpd], ["hpd-closed", "Closed at HPD", followReport.counts.hpdClosed]] as const).map(([key, label, count]) => (
                <button key={key} type="button" className={`is-${key}`} data-hpd-smoke={`fc-follow-tile-${key}`} onClick={() => { setFollowFilter(key); setFollowOpen(false); }}>
                  <b>{count}</b><span>{label}</span><small>show on map</small>
                </button>
              ))}
            </div>
            {([
              ["hpd-asked", "HPD asked for paperwork · nothing sent since", followReport.hpdAsked, "No open requests from HPD."],
              ["due-week", "Due this week", followReport.dueWeek, "Nothing due this week."],
              ["overdue", "Overdue · most recent first, oldest at the bottom", followReport.overdue, "Nothing overdue."],
              ["sent", "Waiting on HPD · paperwork sent, HPD hasn't closed it", followReport.waitingOnHpd, "None."],
              ["recent", "Awarded in the last 30 days", followReport.recent, "No new awards in 30 days."],
            ] as const).map(([key, title, rows, none]) => (
              <section key={key} className={`fc-follow-section is-${key}`} data-hpd-smoke={`fc-follow-${key}-list`}>
                <h4>{title} ({rows.length})</h4>
                {rows.length ? (
                  <ol>{(followShowAll || key !== "overdue" ? rows : rows.slice(0, 25)).map((r, i, shown) => {
                    const md = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(2, 4)}` : "-");
                    const age = (x: FollowUp) => (x.daysLeft === null ? "" : -x.daysLeft <= 30 ? "1-30 days overdue" : -x.daysLeft <= 90 ? "31-90 days overdue" : "Over 90 days overdue: check the status");
                    const group = key === "overdue" && (i === 0 || age(shown[i - 1]) !== age(r)) ? age(r) : "";
                    return (
                      <Fragment key={r.omo}>
                      {group ? <li className="fc-follow-group" data-hpd-smoke="fc-follow-group">{group}</li> : null}
                      <li>
                        <button type="button" onClick={() => { const job = jobs.find((j) => jobId(j) === r.omo); setFollowOpen(false); if (job) setSelectedJob(job); }}>
                          <span><b>{r.omo}</b>{r.daysLeft !== null && (r.state === "overdue" || r.state === "due-week") ? <em className={r.daysLeft < 0 ? "is-late" : "is-soon"}>{r.daysLeft < 0 ? `${-r.daysLeft}d overdue` : r.daysLeft === 0 ? "due today" : `in ${r.daysLeft}d`}</em> : null}</span>
                          <span>{r.address}</span>
                          <small>Awarded {md(r.awardDay)} · complete by {md(r.maturityDay)} · {r.status}{r.sentAt ? ` · paperwork sent ${md(r.sentAt)}` : ""}{r.askedAt ? ` · ${r.askedBy || "HPD"} asked${r.askedFor ? ` (${r.askedFor})` : ""} ${md(r.askedAt)}` : ""}</small>
                          {key === "hpd-asked" ? <a className="fc-follow-paper" href={`/paperwork/?job=${encodeURIComponent(r.omo)}`} onClick={(e) => e.stopPropagation()} data-hpd-smoke="fc-follow-paperwork">Open paperwork →</a> : null}
                        </button>
                      </li>
                      </Fragment>
                    );
                  })}</ol>
                ) : <p>{none}</p>}
                {key === "overdue" && rows.length > 25 ? <button type="button" className="fc-follow-more" onClick={() => setFollowShowAll((v) => !v)}>{followShowAll ? "Show fewer" : `Show all ${rows.length}`}</button> : null}
              </section>
            ))}
          </div>
        </div>
      ) : null}
      {boardOpen ? (
        <NoticeBoard
          rows={boardRows}
          initialShow={boardShow}
          addressOf={(omo) => { const j = findAnyJob(omo); return j ? jobAddress(j) : ""; }}
          hasJob={(omo) => Boolean(findAnyJob(omo))}
          onOpenJob={(omo) => { const j = findAnyJob(omo); if (j) { setBoardOpen(false); setSelectedJob(j); } }}
          onOpenThread={(id, title) => setThreadView({ ids: [id], title })}
          onMark={markBoard}
          onClose={() => setBoardOpen(false)}
        />
      ) : null}
      {summaryToday && !boardOpen && !selectedJob && !noticesOpen && !noticeChooser && !bidsOpen ? (
        <div className="fc-today" role="dialog" aria-label="Today" data-hpd-smoke="fc-today">
          <header>
            <strong>☀️ Today · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</strong>
            <button type="button" aria-label="Close" data-hpd-smoke="fc-today-close" onClick={closeSummary}>Got it</button>
          </header>
          <button type="button" className={`fc-today-line${dueToday.length ? " is-hot" : ""}`} data-hpd-smoke="fc-today-due" onClick={() => { closeSummary(); setBoardShow("ppn"); closeScreens("board"); setBoardOpen(true); }}>
            <span aria-hidden="true">⏱</span><b>{(() => { const late = dueToday.filter((r) => Date.parse(r.dueAt) < Date.now()).length; const soon = dueToday.length - late; return dueToday.length ? [late ? `${late} notice${late === 1 ? "" : "s"} OVERDUE` : "", soon ? `${soon} due today` : ""].filter(Boolean).join(" · ") : "No 24 / 72-hour deadline today"; })()}</b>
            <small>{dueToday.length ? `${Date.parse(dueToday[0].dueAt) < Date.now() ? "Oldest" : "First one"}: ${dueText(dueToday[0].dueAt)} · ${dueToday[0].omo}` : `${boardOpenRows.filter((r) => r.kind === "ppn").length} notices open on the board`}</small>
          </button>
          <button type="button" className="fc-today-line" data-hpd-smoke="fc-today-docs" onClick={() => { closeSummary(); setBoardShow("docs"); closeScreens("board"); setBoardOpen(true); }}>
            <span aria-hidden="true">📋</span><b>{docsWaiting.length} missing-documents request{docsWaiting.length === 1 ? "" : "s"}</b>
            <small>{docsWaiting.length ? `Waiting up to ${Math.max(...docsWaiting.map((r) => Math.floor((Date.now() - Date.parse(r.noticeAt)) / 86400000)))} days` : "Nothing waiting"}{waitingOnThem ? ` · ${waitingOnThem} sent, waiting on them` : ""}</small>
          </button>
          <button type="button" className="fc-today-line is-money" data-hpd-smoke="fc-today-money" onClick={() => { closeSummary(); closeScreens("notices"); setFollowFilter("notices"); setNoticeKind("rejected"); setNoticesTab("money"); setNoticesOpen(true); }}>
            <span aria-hidden="true">💵</span><b>{money(payTrack.summary.held)} held by rejections</b>
            <small>{payTrack.summary.toFix} to fix · {payTrack.summary.inTheMail} in the mail{toPrint.filter((c) => !c.mailedAt).length ? ` · ${toPrint.filter((c) => !c.mailedAt).length} to print & mail` : ""}</small>
          </button>
          <button type="button" className="fc-today-line" data-hpd-smoke="fc-today-bids" onClick={() => { closeSummary(); closeScreens("bids"); setBidsOpen(true); }}>
            <span aria-hidden="true">🧾</span><b>{bidsDue.today ? `${bidsDue.today} bid${bidsDue.today === 1 ? "" : "s"} due today` : `${bidsDue.open} invitation${bidsDue.open === 1 ? "" : "s"} open`}</b>
            <small>{bidsDue.tomorrow ? `${bidsDue.tomorrow} due tomorrow` : "Invitations to bid"}</small>
          </button>
        </div>
      ) : null}
      {followFilter && !followOpen && !(followFilter === "notices" && noticeChooser) ? (
        <div className="fc-follow-active" data-hpd-smoke="fc-follow-active">
          <span>Showing: <b>{followFilter === "notices" && noticeKind ? `${NOTICE_KINDS.find((k) => k.key === noticeKind)?.icon} ${NOTICE_KINDS.find((k) => k.key === noticeKind)?.short}: ${filteredJobs.length} on map${noticeSets[noticeKind].size > filteredJobs.length ? ` (of ${noticeSets[noticeKind].size})` : ""}` : followFilter === "notices" ? `Notices: ${filteredJobs.length} on map${openRejections.filter((r) => !r.onMap).length ? ` · ${openRejections.filter((r) => !r.onMap).length} older` : ""}` : ({ notices: "HPD notices", "hpd-asked": "HPD asked for paperwork", overdue: "Overdue", "due-week": "Due this week", recent: "Awarded last 30 days", sent: "Waiting on HPD", "hpd-closed": "Closed at HPD" } as const)[followFilter]}</b>{followFilter === "notices" ? null : ` · ${filteredJobs.length} jobs`}</span>
          {followFilter === "notices" ? <button type="button" className="fc-follow-active-list" data-hpd-smoke="fc-notices-list" onClick={() => setNoticesOpen(true)}>List</button> : null}
          {followFilter === "notices" ? <button type="button" className="fc-follow-active-list" data-hpd-smoke="fc-notices-change" onClick={() => { setNoticesOpen(false); setSelectedJob(null); setNoticeChooser(true); if (!noticeKind) setNoticeKind("all"); }}>Change</button> : null}
          <button type="button" onClick={() => { setFollowFilter(""); setNoticeKind(""); }} aria-label="Stop the follow-up filter">✕</button>
        </div>
      ) : null}
      {stats && statsOpenWork ? (
        <div className="fc-package-sheet fc-summary-sheet fc-stats-sheet" role="dialog" aria-label="My stats" data-hpd-smoke="fc-stats-sheet">
          <header>
            <button type="button" onClick={() => setStatsOpen(false)}>← Map</button>
            <strong>My stats</strong>
          </header>
          <div className="fc-summary-body">
            <div className="fc-stats-periods" role="tablist" aria-label="Period">
              {([["today", "Today"], ["week", "This week"], ["month", "This month"]] as const).map(([key, label]) => (
                <button type="button" role="tab" key={key} aria-selected={statsPeriod === key} className={statsPeriod === key ? "is-active" : ""} data-hpd-smoke={`fc-stats-period-${key}`} onClick={() => setStatsPeriod(key)}>{label}</button>
              ))}
            </div>
            <p className="fc-stats-label">{stats.label}</p>
            <div className="fc-stats-earned" data-hpd-smoke="fc-stats-earned">
              <b>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stats.earned)}</b>
              <span>earned · {stats.counts.completed + stats.counts.partial} job{stats.counts.completed + stats.counts.partial === 1 ? "" : "s"} finished {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stats.earnedWork)} + {stats.counts.serviceCalls} service call{stats.counts.serviceCalls === 1 ? "" : "s"} {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stats.earnedService)}</span>
            </div>
            <div className="fc-summary-counts" data-hpd-smoke="fc-stats-counts">
              {([["Visited", stats.counts.visited], ["Completed", stats.counts.completed], ["Partial", stats.counts.partial], ["No access", stats.counts.noAccess], ["Refused", stats.counts.refused], ["Emailed", stats.counts.emailed]] as const).map(([label, n]) => (
                <span key={label} className={n ? "has" : ""}><b>{n}</b>{label}</span>
              ))}
            </div>
            {stats.days.length > 1 ? (() => {
              const max = Math.max(1, ...stats.days.map((d) => d.visited));
              return (
                <section className="fc-stats-chart" aria-label="Visits per day" data-hpd-smoke="fc-stats-chart">
                  <h3>Visits per day <small>(green: finished)</small></h3>
                  <div className={`fc-stats-bars${stats.days.length > 7 ? " is-month" : ""}`}>
                    {stats.days.map((d) => (
                      <div key={d.day} title={`${d.day}: ${d.visited} visited, ${d.completed} finished`}>
                        <i style={{ height: `${(d.visited / max) * 100}%` }}><em style={{ height: d.visited ? `${(Math.min(d.completed, d.visited) / d.visited) * 100}%` : "0" }} /></i>
                        <small>{d.label}</small>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })() : null}
            <section data-hpd-smoke="fc-stats-open-work">
              <h3>Still open</h3>
              <div className="fc-summary-counts">
                <span className={statsOpenWork.toVisit ? "has" : ""}><b>{statsOpenWork.toVisit}</b>Not visited</span>
                <span className={statsOpenWork.secondDue ? "has" : ""}><b>{statsOpenWork.secondDue}</b>2nd try due</span>
                <span className={statsOpenWork.closeOut ? "has" : ""}><b>{statsOpenWork.closeOut}</b>To close out</span>
              </div>
              {statsOpenWork.secondWaiting ? <p>{statsOpenWork.secondWaiting} more no-access job{statsOpenWork.secondWaiting === 1 ? "" : "s"} waiting out the 72 hours.</p> : null}
            </section>
            <p className="fc-stats-note">Counts what was saved on the job cards (arrivals, outcomes, emailed packages). The test job is left out.</p>
          </div>
        </div>
      ) : null}
      {summary ? (
        <div className="fc-package-sheet fc-summary-sheet" role="dialog" aria-label="Today's summary" data-hpd-smoke="fc-summary-sheet">
          <header>
            <button type="button" onClick={() => setSummaryOpen(false)}>← Map</button>
            <strong>Today · {summary.dayLabel}</strong>
          </header>
          <div className="fc-summary-body">
            <div className="fc-summary-counts">
              {([["Visited", summary.counts.visited], ["Finished", summary.counts.finished], ["No access", summary.counts.noAccess], ["Refused", summary.counts.refused], ["Appointments", summary.counts.booked], ["Emailed", summary.counts.emailed]] as const).map(([label, n]) => (
                <span key={label} className={n ? "has" : ""}><b>{n}</b>{label}</span>
              ))}
            </div>
            {([["Today", summary.visited, "Nothing recorded today."], ["Ready to close out", summary.closeOut, "None."], ["Tomorrow", summary.tomorrow, "Nothing due."]] as [string, SummaryRow[], string][]).map(([title, rows, none]) => (
              <section key={title}>
                <h3>{title} <small>({rows.length})</small></h3>
                {rows.length ? rows.map((row, index) => (
                  <button type="button" key={`${row.id}-${index}`} onClick={() => { const job = jobs.find((j) => jobId(j) === row.id); setSummaryOpen(false); if (job) openIssueJob(job); }}>
                    <b>{row.id}</b> <span>{row.address}</span><small>{row.text}</small>
                  </button>
                )) : <p>{none}</p>}
              </section>
            ))}
          </div>
          <footer>
            <button type="button" className="is-primary" data-hpd-smoke="fc-summary-email" onClick={() => void emailSummary()}>✉️ Email it to me</button>
            <button type="button" data-hpd-smoke="fc-summary-share" onClick={() => void shareSummary()}>Share</button>
            {summaryStatus ? <p role="status">{summaryStatus}</p> : null}
          </footer>
        </div>
      ) : null}
      {updateReady && !mediaBusy ? (
        <button type="button" className="fc-update-ready" data-hpd-smoke="fc-update-ready" onClick={() => window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(latestCommitRef.current)}`)}>
          🔄 New version ready · <b>Update</b>
        </button>
      ) : null}
      {packageSheet ? (
        <div className="fc-package-sheet" role="dialog" aria-label={`${packageSheet.id} package`} data-hpd-smoke="fc-package-sheet">
          <header>
            <button type="button" data-hpd-smoke="fc-package-sheet-back" onClick={closePackageSheet}>← Back to job</button>
            <strong>{packageSheet.id} package</strong>
          </header>
          <iframe src={packageSheet.href} title={`${packageSheet.id} package`} allow="web-share; clipboard-write; camera" />
        </div>
      ) : null}
      {itbPage ? (
        <div className="fc-package-sheet fc-itb-sheet" role="dialog" aria-label={`${itbPage.id} original ITB page`} data-hpd-smoke="fc-itb-sheet">
          <header>
            <button type="button" data-hpd-smoke="fc-itb-sheet-back" onClick={() => setItbPage(null)}>← Back to job</button>
            <strong>{itbPage.id} ITB page {itbPage.page}</strong>
          </header>
          <div className="fc-itb-body">
            {itbPage.image && !itbPage.failed ? (
              <img src={itbPage.image} alt={`Original ITB page ${itbPage.page} for ${itbPage.id}`} onError={() => setItbPage((current) => current && { ...current, failed: true })} />
            ) : (
              <p className="fc-itb-missing">The page picture for this ITB isn&apos;t published yet. Open the PDF instead.</p>
            )}
            <a className="fc-itb-pdf" href={`${itbPage.pdf}#page=${itbPage.page}`} target="_blank" rel="noreferrer">Open the full ITB PDF ↗</a>
          </div>
        </div>
      ) : null}
      <PlanMyDayDrawer records={jobs} openRequest={plannerRequest} />
    </main>
  );
}
