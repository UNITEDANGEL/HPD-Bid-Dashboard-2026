"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type MouseEvent as ReactMouseEvent } from "react";
import AppointmentEditor from "./AppointmentEditor";
import TodayRoute from "./TodayRoute";
import BidsMode, { type BidsChat } from "./BidsMode";
import { fetchRoadRoute, type RoadRoute } from "../../lib/road-route";
import { BuildingHero, SavedPackageLink } from "./BuildingPhoto";
import VideoBackupLine from "./VideoBackupLine";
import JobSafeLine from "./JobSafeLine";
import { nextRouteStop, type RouteJob, type RoutePoint } from "../../lib/day-route";
import { CURRENT_JOB_KEY, parseCurrentJob, type CurrentJob } from "../../lib/current-job";
import { activeAppointment, appointmentCalendarHref, appointmentConflicts, appointmentLabel, appointmentPatch, appointmentTiming, nyToday, validateAppointment, type Appointment } from "../../lib/appointments";
import { hourAfter, parseWhen } from "../../lib/voice-when";
import { jobPriority, maturityDate, matchesAwardLookback, JOB_DATE_FIELDS, JobDateField, jobDate, matchesJobDateRange, calendarDay, jobDateWarning, currentYearRange } from "../../lib/job-priority";
import { fieldStatusLabel } from "../../lib/field-status";
import { lockedMessage, paperworkLock } from "../../lib/paperwork-lock";
import { jobStages, nextStep } from "../../lib/job-stages";
import { loadConversations, reloadConversations, loadNotices, loadPrivate, loadSearchIndex, noticePdfUrl, privateDocUrl, withPrivate, type HpdThread, type NoticeEmail } from "../../lib/private-data";
import ItbPages from "./ItbPages";
import { buildPriorities, dueText, type PriorityItem } from "../../lib/priorities";
import { listCorrections, removeCorrection, type SavedCorrection, updateCorrection } from "../../lib/correction-store";
import { markCorrectedCopy } from "../../lib/correction-copy";
import { followUpOf, followUpReport, recoveredStatus, paperworkRejections, type FollowUp, type PipPayment, type HpdJobStatus, type HpdRequest, type SentPaperwork } from "../../lib/job-followup";
import { JOB_QUEUES, jobQueue, matchesJobQueue, visitState } from "../../lib/job-queue";
import { paperworkLeft } from "../../lib/paperwork-left";
import { nextFieldAction, paperworkNextHref, paperworkGenerateHref, FIELD_OUTCOMES, fieldOutcomePatch, arrivalVisitPatch, secondTryState, newYorkDay } from "../../lib/field-next-action";
import { canReadAloud, readAloud, stopReading } from "../../lib/read-aloud";
import { visitLocationFields, type GpsFix } from "../../lib/visit-record";
import { adoptServerOverrides, flushOverrideOutbox, mergeOverrideMaps, queueOverrideSync } from "../../lib/override-sync";
import { fetchServerWorkflowOverrides, HPD_STATUS_WORKER_URL, startOverPatch } from "../../lib/paperwork";
import { longestCleanDescription } from "../../lib/description-quality";
import { checkImageFile } from "../../lib/photo-quality";
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
import PhotoCheck from "./PhotoCheck";
import JobNotes from "./JobNotes";
import HelperFace, { helperFaceHtml } from "./HelperFace";
import { materialsFor } from "../../lib/materials";
import { applyBatterySaver, batterySaverOn, getHelperLook, HELPER_COLORS, HELPER_HATS, robotOutfit, setBatterySaver, setHelperLook, useHelperLook, type HelperColor, type HelperHat } from "../../lib/helper-look";
import { suggestTenantReply } from "../../lib/tenant-reply";
import { moodSound } from "../../lib/chime";
import "../map/plan-my-day.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./job-card-v2.css";
import { testFirstUpgrades, upgradeOn } from "../../lib/rollout";
import { boardSide, buildBoard, hoursLeft, urgentRows, type BoardMarks, type BoardStep } from "../../lib/notice-board";
import { PAY_STEPS, money, trackPayments } from "../../lib/payment-track";
import { noticeFindings } from "../../lib/notice-findings";
import { chimeMuted, notify, playChime, ring, setChimeMuted, unlockChime, type AppNotice } from "../../lib/chime";
import { spokenAlert, summarizeHpd } from "../../lib/alert-summary";
import { chosenVoiceName, englishVoices, langOf, setBriefSpeech, setChosenVoice, setVoiceOff, setVoiceRate, speak, stopSpeaking, voiceOff, voiceRate, voiceSupported } from "../../lib/speak";
import NoticeBoard from "./NoticeBoard";
import SentPaperworkLink from "./SentPaperwork";
import AutopilotPanel from "./AutopilotPanel";
import JobTracker, { type TrackerRow } from "./JobTracker";
import PaymentWaits from "./PaymentWaits";
import { paymentWaits, type PipJob } from "../../lib/pay-waiting";
import { trackerStage } from "../../lib/job-tracker";
import NotificationsPanel from "./NotificationsPanel";
import JobsList, { type JobRow, tenantsToCall } from "./JobsList";
import FindJob from "./FindJob";
import { jobSummary, lineText } from "../../lib/job-summary";
import { markNudgeSeen, nudgesSeen, omosIn, type ChatCard } from "../../lib/chat-cards";
import { recentSearches, rememberSearch, spokenSearch } from "../../lib/job-search";
import { findJobRef, parseCommand, splitCommands, thinkingQuestion } from "../../lib/voice-agent";
import { loadNotes, notesFor, saveNote } from "../../lib/voice-notes";
import { allJobNotes } from "../../lib/job-notes";
import { searchAll, searchQuery, type SearchDoc } from "../../lib/search-all";
import { dailyTip } from "../../lib/daily-tip";
import { closest, MAYBE, SURE } from "../../lib/did-you-mean";
import { OUTSIDE_WORK, fetchWeather, trafficNote, weatherNow, weatherReport, wetLater, workAnswer } from "../../lib/weather";
import { aspAnswer, aspOff } from "../../lib/asp";
import { loadBuildingFacts } from "../../lib/building-facts";
import BuildingFacts from "./BuildingFacts";
import { smsHref, tenantContactRecord, tenantContactState, tenantJobSummary, tenantStep, tenantTextDraft, tenantTextLogNote } from "../../lib/tenant-text";
import { sayOmo } from "../../lib/alert-summary";
import { addToLog, readLog, unreadCount } from "../../lib/notify-log";
import { ALERT_KINDS, emailKind, emailTitle, kindOf, type AlertKind } from "../../lib/alert-kinds";
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

// Opening speed (owner idea, 3 Nov): the extra lists (paid, older jobs, notice status) wait until the pins are drawn,
// so the phone's first seconds go to the jobs. They still load within about 2 seconds.
function afterFirstPaint(run: () => void): () => void {
  let done = false;
  const go = () => { if (!done) { done = true; run(); } };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(go, { timeout: 2000 });
    return () => { done = true; w.cancelIdleCallback?.(id); };
  }
  const t = window.setTimeout(go, 800);
  return () => { done = true; window.clearTimeout(t); };
}
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
const BUILT_CODE = process.env.NEXT_PUBLIC_APP_CODE || ""; // the code version (data-only deploys don't change it)
const BUILT_NUMBER = process.env.NEXT_PUBLIC_APP_NUMBER || "";
const BUILT_AT = process.env.NEXT_PUBLIC_APP_BUILT_AT || "";
// "Updated Oct 16, 4:10 PM · #312": when this version was made, in New York time.
const versionLabel = () => {
  const when = BUILT_AT ? new Date(BUILT_AT).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return [when ? `Updated ${when}` : "", BUILT_NUMBER ? `#${BUILT_NUMBER}` : BUILT_COMMIT ? `v${BUILT_COMMIT}` : ""].filter(Boolean).join(" · ");
};
type WhatsNew = { date: string; title: string; items: string[] }[];
// Is Claude on right now (owner, 2 Nov: "the request just tells me to wait, how many minutes? do I have to leave Claude
// open?")? Claude runs on the office computer: while it's on with the Claude app open it looks for requests every 20 s
// and writes CLAUDE-HEARTBEAT about every 9 minutes (scripts/reply-change-request.mjs). Seen in the last 12 minutes = on.
const CLAUDE_ON_MS = 12 * 60000;
// A clock that counts up every second while Claude works on a request (owner, 2 Nov: "something moving that is actually
// work in progress"). Its own little timer, so the rest of the screen doesn't redraw every second.
function WorkingClock({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const text = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return <span className="fc-working-clock" data-hpd-smoke="fc-working-clock"><span className="fc-working-dots" aria-hidden="true"><i /><i /><i /></span>working for {text}</span>;
}
// "12 s ago", counting every second (the live Claude card): its own timer, like WorkingClock.
function SecondsAgo({ at, bare }: { at: string; bare?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  const text = s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s ago` : `${Math.floor(s / 3600)} h ago`;
  return bare ? <>{text}</> : <small className="fc-seconds-ago">· {text}</small>;
}
// 🤖 Claude right now (owner, 3 Nov: "I need to know every second what's going on"): what Claude is doing on the office
// computer, written by scripts/claude-now.mjs as it works (CLAUDE-NOW). Fresh = said in the last 10 minutes.
type ClaudeNow = { at: string; text: string; task: string; state: string; log: { at: string; text: string }[] };
const claudeNowFresh = (n: ClaudeNow | null) => Boolean(n && n.state === "working" && n.text && Date.now() - Date.parse(n.at) < 10 * 60000);
function ClaudeNowLines({ now }: { now: ClaudeNow }) {
  const before = now.log.filter((l) => l.text !== now.text).slice(-3).reverse();
  return (
    <span className="fc-claude-now" data-hpd-smoke="fc-claude-now">
      <span className="fc-claude-now-main"><span className="fc-working-dots" aria-hidden="true"><i /><i /><i /></span><b data-hpd-smoke="fc-claude-now-text">{now.text}</b> <SecondsAgo at={now.at} /></span>
      {before.length ? <span className="fc-claude-now-log" data-hpd-smoke="fc-claude-now-log">{before.map((l) => <span key={l.at}>✓ {l.text} <SecondsAgo at={l.at} /></span>)}</span> : null}
    </span>
  );
}
const claudeIsOn = (seenAt: string) => Boolean(seenAt) && Date.now() - Date.parse(seenAt) < CLAUDE_ON_MS;
const pickupLabel = (seenAt: string) => {
  if (claudeIsOn(seenAt)) return "Claude is on now: it starts on it within a minute or two";
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  const last = seenAt ? ` (last on ${new Date(seenAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })})` : "";
  return `Claude is off right now${last}: it starts as soon as the office computer is on with the Claude app open${h >= 7 && h < 23 ? "" : " (it looks from 7 AM to 11 PM)"}`;
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
// New York's clock as "2026-10-27T14:05" and the weekday (0 = Sunday), for the weather and traffic answers.
function nyNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
function todayRouteIds(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null");
    return saved?.settings?.date === nyToday() && Array.isArray(saved.ids) ? saved.ids.filter((id: unknown) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

// Put a job on Today's route (30 Oct, "go anyway" after 3 tries): added at the end of today's saved stops, or a new
// route for today (8 AM to 5 PM, 45 minutes a stop) when there's none. The route panel reads it when it opens.
function addToTodayRoute(id: string) {
  try {
    const saved = JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null");
    const today = saved?.settings?.date === nyToday();
    const settings = today ? saved.settings : { date: nyToday(), start: "08:00", end: "17:00", minutes: 45, borough: "ALL" };
    const ids = today && Array.isArray(saved.ids) ? saved.ids.filter((x: unknown) => typeof x === "string" && x !== id) : [];
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings, ids: [...ids, id], ...(today && saved.origin ? { origin: saved.origin } : {}) }));
    window.dispatchEvent(new Event("hpd-route-changed"));
    return true;
  } catch {
    return false;
  }
}

function removeFromTodayRoute(id: string) {
  try {
    const saved = JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null");
    if (saved?.settings?.date !== nyToday() || !Array.isArray(saved.ids) || !saved.ids.includes(id)) return false;
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ ...saved, ids: saved.ids.filter((x: unknown) => x !== id) }));
    window.dispatchEvent(new Event("hpd-route-changed"));
    return true;
  } catch {
    return false;
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

// The day flows on by itself (owner, 23 Oct: "everything needs to flow auto ... the app zooms in and out of the map as
// it flows"): the job is done and its paperwork approved -> a short countdown, then the map glides to the next stop
// and opens it. "Stay here" stops it for this job.
function AutoNext({ seconds, label, onGo, onStay }: { seconds: number; label: string; onGo: () => void; onStay: () => void }) {
  const [left, setLeft] = useState(seconds);
  const go = useRef(onGo);
  go.current = onGo;
  useEffect(() => {
    if (left <= 0) { go.current(); return; }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return (
    <div className="jc-auto-next" role="status" data-hpd-smoke="jc-auto-next">
      <strong>➡ Going to the next stop, {label}, in {Math.max(0, left)}s…</strong>
      <div>
        <button type="button" className="jc-glow" data-hpd-smoke="jc-auto-next-now" onClick={() => go.current()}>Go now</button>
        <button type="button" data-hpd-smoke="jc-auto-next-stay" onClick={onStay}>Stay here</button>
      </div>
    </div>
  );
}

// What to say next after each kind of answer (3 Nov, "make the chat better, smarter"): the "Try:" chips follow the
// conversation instead of always showing the same three. Every phrase is one the helper understands.
const FOLLOW_UPS: [RegExp, string[]][] = [
  [/^(weather)$/, ["should I do the roof job today", "is it going to rain tomorrow", "what do I have today and plan my day"]],
  [/^(traffic|drive-time|navigate|asp|store)$/, ["take me to the next stop", "how long to the next job", "is alternate side on today"]],
  [/^(bids|bids-show|next-bid|bid-advice|bid-price|no-bid)$/, ["next bid", "what should I bid", "read me the new bids"]],
  [/^(notices|reply-notice)$/, ["which notices are open", "which rejections do I have", "what's next"]],
  [/^(money|paid-period|forecast|rejections|awards|week)$/, ["how much does HPD owe me", "which rejections do I have", "what did I win this week"]],
  [/^(today|plan|whats-next|route-add|route-remove|tracker)$/, ["take me to the next stop", "what appointments do I have", "how's the traffic"]],
  [/^(appointments|appointment|where-appt|appt-confirmed|remind)$/, ["remind tomorrow's tenants", "which tenants haven't answered", "take me to the next stop"]],
  [/^(tenants-waiting|text-tenant|call-tenant|called|tell-tenant|next-tenant|tenant-texts)$/, ["which tenants haven't answered", "what appointments do I have", "what's next"]],
  [/^(claude-status|app-request|claude-works|claude-not-right|whats-new)$/, ["what's Claude doing", "give me ideas", "what's new"]],
  [/^(ideas|idea-do|ideas-more|auto-upgrade)$/, ["do idea 1", "more ideas", "what's Claude doing"]],
];
function chatFollowUps(heard: string): string[] {
  const said = heard.toLowerCase().replace(/[.?!]+$/, "").trim();
  const hit = FOLLOW_UPS.find(([re]) => re.test(parseCommand(heard).intent));
  return hit ? hit[1].filter((c) => c.toLowerCase() !== said) : [];
}

// The one-tap questions above the chat bar (each is something the helper already understands).
const QUICK_QUESTIONS: [string, string][] = [["📅 Today", "what do I have today and plan my day"], ["📨 Next bid", "next bid"], ["⏰ Notices", "which notices are open"], ["💰 Owed", "how much does HPD owe me"], ["➡️ What's next", "what's next"]];

// What the helper understands, as examples to tap (23 Oct "what can I say").
const AGENT_EXAMPLES: [string, string[]][] = [
  ["Your day", ["what do I have today and plan my day", "take me to the next stop", "what appointments do I have", "remind tomorrow's tenants", "the tenant confirmed", "what's next", "show my job tracker"]],
  ["A job", ["what's left on this job", "read me this job", "I finished this job"]],
  ["Tenants", ["text the tenant", "which tenants haven't answered", "I called the tenant, no answer", "make an appointment tomorrow at 10am", "tell the tenant we'll be there at 10"]],
  ["Money and bids", ["how much does HPD owe me", "how much did I get paid this month", "which rejections do I have", "read me the new bids", "what should I bid", "how did I do this week"]],
  ["Notices and reminders", ["which notices are open", "remind me to call the tenant at 3pm", "what did I win this week"]],
  ["Out and about", ["what's the weather", "is it going to rain tomorrow", "how's the traffic", "how long to the next job", "is alternate side on today", "where's the nearest Home Depot", "how old is this building", "should I do the roof job today"]],
  ["The app", ["tell Claude to make the buttons bigger", "send to Claude: add a dark mode", "what's new", "what did I miss", "I'm driving", "read a photo", "give me ideas", "do idea 2", "keep upgrading on"]],
];

// Everything the helper knows how to do, for "Did you mean…?" (free questions for the AI left out).
let knownCache: string[] | null = null;
function knownPhrases() {
  if (!knownCache) knownCache = [...AGENT_EXAMPLES.flatMap(([, l]) => l), ...FOLLOW_UPS.flatMap(([, l]) => l), "what's new", "what did I miss", "what's Claude doing", "next bid", "bids in Brooklyn", "bids in Queens", "bids in the Bronx", "bids in Manhattan", "what do I have today", "where's my next appointment", "it works"]
    .filter((x) => { const i = parseCommand(x).intent; return i !== "ask" && i !== "search"; });
  return knownCache;
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

function JobsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /><path d="M10 13v2h4v-2" />
    </svg>
  );
}

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

// Numbers that count up when a screen opens (27 Oct, "the app should feel premium"): about a second, easing out; the
// final number shows at once with Reduce Motion on (and in test browsers).
function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(0);
  useEffect(() => {
    const still = typeof window === "undefined" || navigator.webdriver || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || !value) { setShown(value); fromRef.current = value; return; }
    const from = fromRef.current, start = performance.now(), ms = Math.min(1400, 600 + Math.abs(value - from) * 4);
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step); else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); fromRef.current = value; };
  }, [value]);
  return <>{format(shown)}</>;
}
const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// The bottom dock's 3 swappable buttons (next to ✨ AI); the rest show in the strip above, in this order.
const DOCK_STRIP_ORDER = ["route", "appts", "follow", "stats", "jobs", "bids", "notices"] as const;
type DockKey = (typeof DOCK_STRIP_ORDER)[number];
const DOCK_DEFAULT: DockKey[] = ["jobs", "bids", "notices"];
const DOCK_LABEL: Record<DockKey, string> = { route: "Route", appts: "Appts", follow: "Follow-up", stats: "Stats", jobs: "Jobs", bids: "Bids", notices: "Notices" };
const DOCK_SLOTS_KEY = "hpd-dock-slots-v1";

const CHAT_DAY_KEY = "hpd-chat-day";

export default function FieldCommandClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const jobSheetRef = useRef<HTMLDivElement | null>(null);
  const sheetTouchStart = useRef<number | null>(null);
  // date: the day it happened (YYYY-MM-DD, blank = today); who: the person who refused access (30 Oct).
  type OutcomeDraft = { outcome: string; note: string; date?: string; who?: string };
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, OutcomeDraft>>({});
  // ✏️ Change outcome or date: the job whose saved outcome is being changed on the card.
  const [changeOutcomeFor, setChangeOutcomeFor] = useState("");
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
  // The pill at the bottom of the map as last shown (it hides while the helper is open): "what's next?" reads it (27 Oct).
  const nextStepRef = useRef<{ text: string; go: () => void } | null>(null);
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
  // The app's email reader adds new emails every ~10 minutes: load them now and again every 5 minutes while open.
  const [threadsAt, setThreadsAt] = useState("");
  useEffect(() => {
    const load = (fresh: boolean) => (fresh ? reloadConversations() : loadConversations()).then((d) => { if (d) { setThreads(d.threads); setThreadsAt((d as { generatedAt?: string }).generatedAt || ""); } else setThreads((t) => (t === undefined ? null : t)); });
    void load(false);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 300000);
    const onShow = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onShow);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);
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
  type NoticeKind = "" | "all" | "priority" | "rejected" | "corrections" | "print" | "aep";
  const [noticeChooser, setNoticeChooser] = useState(false);
  // After a pick the picker shrinks to a thin bar so the map is in view (owner, 17 Oct: "take me to the map").
  const [noticeMini, setNoticeMini] = useState(false);
  // Jobs (owner, 22 Oct: "I need to see the jobs on the map, also the list"): the list sits in the lower half, the map
  // above shows only the jobs of the tab you're on (and frames them); 🗺 Map folds the list down to a bar.
  const [jobsOpen, setJobsOpen] = useState(false);
  const [jobsTab, setJobsTab] = useState("todo");
  const [jobsShown, setJobsShown] = useState<{ key: string; ids: string[] } | null>(null);
  const [jobsMini, setJobsMini] = useState(false);
  const noticeMiniRef = useRef(false);
  const jobsOpenRef = useRef(false);
  const jobsShownRef = useRef<{ key: string; ids: string[] } | null>(null);
  const jobsMiniRef = useRef(false);
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
  const nextOmoRef = useRef("");
  // The days menu on the borough bar (owner, 16 Oct): one small button, the choices open under it.
  const [daysMenuOpen, setDaysMenuOpen] = useState(false);
  const [olderLayer, setOlderLayer] = useState<JobRecord[] | null>(null);
  useEffect(() => {
    if (!showOlderLayer || olderLayer) return;
    fetch("/data/jobs_2024_2025.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => setOlderLayer(Array.isArray(d?.jobs) ? d.jobs : [])).catch(() => setOlderLayer([]));
  }, [showOlderLayer, olderLayer]);
  // Paid / not paid per OMO, from PIP (scripts/import_pip_agreements.mjs).
  const [pipMap, setPipMap] = useState<Record<string, PipPayment>>({});
  // When PIP's numbers were last brought in (26 Oct): PIP isn't read by itself; its exports are imported.
  const [pipAsOf, setPipAsOf] = useState("");
  const pipAgeDays = pipAsOf ? Math.floor((Date.now() - Date.parse(pipAsOf)) / 86400000) : 0;
  const pipAsOfText = pipAsOf ? new Date(pipAsOf).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  useEffect(() => afterFirstPaint(() => {
    fetch("/data/pip_paid.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => { setPipMap(d?.jobs || {}); setPipAsOf(String(d?.generatedAt || "")); }).catch(() => {});
  }), []);
  useEffect(() => afterFirstPaint(() => {
    fetch("/data/COA_older.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).then((rows) => setOlderJobs(Array.isArray(rows) ? rows : [])).catch(() => {});
  }), []);
  useEffect(() => afterFirstPaint(() => {
    Promise.all([
      fetch("/data/hpd_job_status.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/data/sent_paperwork.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/data/hpd_requests.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([hpd, sent, asked]) => {
      followRef.current = { hpd: hpd?.jobs || {}, sent: sent?.jobs || {}, asked: asked?.jobs || {} };
      setAskedMap(asked?.jobs || {});
      reapplyFollowRef.current?.();
    });
  }), []);
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
  // Find any job by a few words (22 Oct): the list under the search box; ✕ hides it until the words change.
  const [findHidden, setFindHidden] = useState("");
  // 🎤 Say it instead of typing (22 Oct): "mini split", "Bedford Avenue", "E R 0 8 2 8 3". Recent searches as chips.
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const listenRef = useRef<{ stop: () => void } | null>(null);
  useEffect(() => { setCanListen(typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)); setRecent(recentSearches()); }, []);
  // 🔊 / 🔇 and a 🎙 that always works (owner, 2 Nov: "the voice is not active anymore, I want the voice to be active"):
  // the chat bar shows whether answers are said out loud, and on a phone that can't listen by itself (Chrome on iPhone,
  // some Home Screen apps) its 🎙 opens the keyboard, whose own 🎙 does the listening.
  const [canSpeak, setCanSpeak] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [chatTip, setChatTip] = useState("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setCanSpeak(voiceSupported()); setVoiceMuted(voiceOff()); }, []);
  // What this phone can do with voice, on the status server (no names or phones) so Claude can see why the voice isn't
  // working there: at most once every 10 minutes, and on every mic error. Not from the automatic tests.
  const reportVoice = (what: string) => {
    if (navigator.webdriver) return;
    try {
      const last = Number(localStorage.getItem("hpd-voice-report-at") || 0);
      if (!/^error/.test(what) && Date.now() - last < 600000) return;
      localStorage.setItem("hpd-voice-report-at", String(Date.now()));
    } catch { /* private mode */ }
    const ua = navigator.userAgent;
    const browser = /CriOS/.test(ua) ? "Chrome on iPhone" : /FxiOS/.test(ua) ? "Firefox on iPhone" : /iPhone|iPad/.test(ua) ? "Safari on iPhone" : /Android/.test(ua) ? "Android" : /Edg\//.test(ua) ? "Edge computer" : /Chrome/.test(ua) ? "Chrome computer" : "other";
    const homeScreen = Boolean(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone);
    void fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "VOICE-CHECK", patch: { at: new Date().toISOString(), what: what.slice(0, 80), browser, homeScreen, canListen, canSpeak: voiceSupported(), spokenAnswersOff: voiceOff(), version: BUILT_NUMBER || BUILT_COMMIT } }) }).catch(() => {});
  };
  useEffect(() => { if (search.trim().length < 3) return; const t = window.setTimeout(() => { rememberSearch(search); setRecent(recentSearches()); }, 2500); return () => window.clearTimeout(t); }, [search]);
  const listen = () => { if (listening) { listenRef.current?.stop(); return; } startListening(); };
  // Other screens start the helper's 🎤 too (the bid sheet's "Say the price").
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;
  useEffect(() => {
    const on = () => startListeningRef.current();
    window.addEventListener("hpd-listen", on);
    return () => window.removeEventListener("hpd-listen", on);
  }, []);
  function startListening() {
    stopSpeaking();
    type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    // No speech recognition here (some iPhone Home Screen apps): the keyboard's own 🎙 works (owner, 23 Oct "mic not working").
    if (!Ctor) { reportVoice("no listening on this phone"); convoRef.current = false; setConvo(false); setAgent({ heard: "🎤", reply: "This phone doesn't let the app listen by itself. Tap the search box, tap the 🎙 on the keyboard, say it, then tap Go: I answer the same way." }); return; }
    let heardSomething = false;
    try {
      const rec = new Ctor();
      rec.lang = lastLangRef.current === "es" ? "es-US" : "en-US"; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
        const final = Array.from(e.results).every((r) => r.isFinal);
        heardSomething = true;
        if (final && convoRef.current && /^(stop|bye|goodbye|thanks|thank you|that'?s all|i'?m done|done|end)\b/i.test(said.trim())) { convoRef.current = false; setConvo(false); setAgent({ heard: said, reply: "OK. Tap 💬 when you want to talk again." }); speak("OK, talk later.", 100); return; }
        const cmd = parseCommand(said);
        // Right after "Who refused?" the description goes to the helper, not the search box.
        const answeringWho = Boolean(pendingWhoRef.current && Date.now() - pendingWhoRef.current.at < 120000);
        if (cmd.intent === "search" && !convoRef.current && !answeringWho) { setFindHidden(""); setSearch(cmd.text); return; }
        if (final) { setSearch(""); convoMissRef.current = 0; agentRef.current(said); }
      };
      rec.onend = () => {
        setListening(false); listenRef.current = null;
        // Conversation mode, nothing said: one more try, then it rests (tap 💬 to go on).
        if (convoRef.current && !heardSomething) { if (convoMissRef.current++ < (drivingRef.current ? 30 : 1)) window.setTimeout(() => { if (convoRef.current) startListening(); }, drivingRef.current ? 900 : 400); else { convoRef.current = false; setConvo(false); setAgent((a) => (a ? { ...a, reply: `${a.reply}\n\n(Stopped listening: tap 💬 to keep talking.)` } : a)); } }
      };
      rec.onerror = (e) => {
        setListening(false); listenRef.current = null;
        const why = e?.error || "";
        if (why && why !== "no-speech" && why !== "aborted") reportVoice(`error ${why}`);
        if (/not-allowed|service-not-allowed|audio-capture/.test(why)) convoMissRef.current = 99; // no mic: don't keep trying
        // Say what's wrong instead of nothing (owner, 23 Oct: "mic not working on my iPhone").
        if (why === "not-allowed" || why === "service-not-allowed") { convoRef.current = false; setConvo(false); setAgent({ heard: "🎤", reply: "The iPhone blocked listening for HPD Field. On the iPhone: Settings → Privacy & Security → Microphone and Speech Recognition: allow it; and Settings → General → Keyboard → Enable Dictation: on. Or tap the search box and use the keyboard's 🎙, then Go." }); }
        else if (why === "network") setAgent({ heard: "🎤", reply: "Listening needs internet: check the signal and tap 🎤 again." });
        else if (why === "audio-capture") setAgent({ heard: "🎤", reply: "No microphone found (another app may be using it). Close it and tap 🎤 again." });
      };
      listenRef.current = rec;
      setListening(true);
      rec.start();
      reportVoice("mic on");
    } catch { reportVoice("error start failed"); setListening(false); if (convoRef.current) { convoRef.current = false; setConvo(false); setAgent((a) => (a ? { ...a, reply: `${a.reply}\n\n(Tap 💬 to answer.)` } : a)); } }
  }
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
  // "🆕 New update includes…" (owner, 27 Oct: "prompt me on every upgrade"): the What's new lines this phone hasn't seen
  // yet, shown as a card until "Got it". Only on a phone that has opened the app before (not a fresh install).
  const [newItems, setNewItems] = useState<string[]>([]);
  // Ask for a change from inside the app: saved on the status server (key CHANGE-REQUEST-<time>) and on this
  // phone; the next upgrade session reads them all (scripts/list-change-requests.mjs).
  const [changeText, setChangeText] = useState("");
  const [changeStatus, setChangeStatus] = useState("");
  const [myRequests, setMyRequests] = useState<{ at: string; text: string }[]>([]);
  useEffect(() => { try { setMyRequests(JSON.parse(localStorage.getItem("hpd-change-requests") || "[]")); } catch { /* private mode */ } }, []);
  // Your requests with their answers (status + dated progress notes), from the status server: CHANGE-REQUEST-<id>
  // and CHANGE-REPLY-<id> (scripts/reply-change-request.mjs). "New" = an update after you last opened the list.
  type ChangeThread = { id: string; at: string; text: string; status: string; updates: { at: string; text: string }[]; steps: { text: string; done: boolean }[]; workingAt: string; now: { at: string; text: string } | null; answers: { at: string; text: string }[]; asked: string; tryAt: string; ok: string };
  const [changeThreads, setChangeThreads] = useState<ChangeThread[] | null>(null);
  // Each request has its own key, even two sent in the same second (3 Nov: 👍 then "more ideas" overwrote the first).
  const lastRequestIdRef = useRef(0);
  const requestKey = (at: string) => {
    const id = Math.max(Number(at.replace(/[^0-9]/g, "").slice(0, 14)), lastRequestIdRef.current + 1);
    lastRequestIdRef.current = id;
    return `CHANGE-REQUEST-${id}`;
  };
  const [repliesSeen, setRepliesSeen] = useState("");
  const [claudeLiveHidden, setClaudeLiveHidden] = useState("");
  // 🤖 Claude on the map is one slim live line by default (owner, 3 Nov: "like a real helper on the side ... more room
  // on the map"); tap it for the whole card. Remembered on this phone.
  const [claudeCardBig, setClaudeCardBigState] = useState(false);
  useEffect(() => { try { setClaudeCardBigState(localStorage.getItem("hpd-claude-card") === "big"); } catch { /* private mode */ } }, []);
  const setClaudeCardBig = (big: boolean) => { setClaudeCardBigState(big); try { localStorage.setItem("hpd-claude-card", big ? "big" : "slim"); } catch { /* private mode */ } };
  const [claudeSeenAt, setClaudeSeenAt] = useState("");
  const [claudeNow, setClaudeNow] = useState<ClaudeNow | null>(null);
  // 💬 Talk to Claude from the live card (3 Nov): a few taps ("Stop", "Do this first", "Looks good") or your own words.
  // With a request open it goes to that request; Claude reads it within about a minute (scripts/claude-now.mjs --inbox).
  const [claudeTalk, setClaudeTalk] = useState(false);
  const [claudeTalkText, setClaudeTalkText] = useState("");
  const [claudeTalkSent, setClaudeTalkSent] = useState("");
  const claudeNowRef = useRef(false);
  const [changeCheckedAt, setChangeCheckedAt] = useState(0);
  const loadChangeThreads = async () => {
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/overrides`, { cache: "no-store" });
      const all = (await r.json())?.overrides || {};
      setClaudeSeenAt(String((all["CLAUDE-HEARTBEAT"] as { at?: string } | undefined)?.at || ""));
      const cn = all["CLAUDE-NOW"] as Partial<ClaudeNow> | undefined;
      const nowValue: ClaudeNow | null = cn?.text ? { at: String(cn.at || ""), text: String(cn.text).slice(0, 120), task: String(cn.task || "").slice(0, 120), state: String(cn.state || ""), log: Array.isArray(cn.log) ? cn.log.slice(-8).map((l) => ({ at: String(l?.at || ""), text: String(l?.text || "").slice(0, 120) })) : [] } : null;
      setClaudeNow(nowValue);
      setAutoUpgrade(Boolean((all["AUTO-UPGRADE"] as { on?: boolean } | undefined)?.on));
      { const au = all["AUTO-UPGRADE"] as { on?: boolean; lastAt?: string; lastTitle?: string; doneToday?: number } | undefined; setAutoInfo({ lastAt: String(au?.lastAt || ""), lastTitle: String(au?.lastTitle || "").slice(0, 80), doneToday: Number(au?.doneToday || 0) }); }
      claudeNowRef.current = claudeNowFresh(nowValue);
      const list: ChangeThread[] = Object.entries(all).filter(([k]) => k.startsWith("CHANGE-REQUEST-")).map(([k, v]) => {
        const id = k.slice(15); const req = v as { at?: string; text?: string }; const rep = all[`CHANGE-REPLY-${id}`] as { status?: string; updates?: { at: string; text: string }[]; steps?: { text: string; done: boolean }[]; workingAt?: string; now?: { at?: string; text?: string } } | undefined;
        return { id, at: String(req.at || ""), text: String(req.text || ""), status: rep?.status || "Received", updates: Array.isArray(rep?.updates) ? rep!.updates : [], steps: Array.isArray(rep?.steps) ? rep!.steps : [], workingAt: String(rep?.workingAt || ""), now: rep?.now?.text ? { at: String(rep.now.at || ""), text: String(rep.now.text) } : null,
          answers: Array.isArray((all[`CHANGE-ANSWER-${id}`] as { answers?: unknown } | undefined)?.answers) ? (all[`CHANGE-ANSWER-${id}`] as { answers: { at: string; text: string }[] }).answers : [], asked: "",
          tryAt: /^\/[^/]/.test(String((rep as { try?: string } | undefined)?.try || "")) ? String((rep as { try?: string }).try) : "", ok: String((all[`CHANGE-ANSWER-${id}`] as { ok?: string } | undefined)?.ok || "") };
      }).map((t) => {
        // Your answer after Claude's last note (2 Nov): the request is open again ("Received") until Claude writes back;
        // asked keeps what it was (Waiting for you / Done) for the label.
        const lastNote = t.updates.map((u) => u.at).sort().slice(-1)[0] || "";
        const lastAnswer = t.answers.map((a) => a.at).sort().slice(-1)[0] || "";
        return lastAnswer > lastNote && (t.status === "Done" || t.status === "Waiting for you") ? { ...t, asked: t.status, status: "Received" } : t;
      }).sort((a, b) => b.at.localeCompare(a.at));
      setChangeThreads(list);
      setChangeCheckedAt(Date.now());
    } catch { setChangeThreads(null); }
  };
  useEffect(() => { try { setRepliesSeen(localStorage.getItem("hpd-replies-seen") || ""); } catch { /* private mode */ } void loadChangeThreads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const newReplies = (changeThreads || []).filter((t) => t.updates.some((u) => u.at > repliesSeen)).length;
  // Saves a change request for Claude (What's new box, or said / typed to the helper: 27 Oct). true = on the server.
  const sendChangeRequest = async (raw: string) => {
    const text = raw.trim();
    if (!text) return false;
    const at = new Date().toISOString();
    const list = [{ at, text }, ...myRequests].slice(0, 50);
    setMyRequests(list);
    try { localStorage.setItem("hpd-change-requests", JSON.stringify(list)); } catch { /* private mode */ }
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: requestKey(at), patch: { at, text: text.slice(0, 2000), version: BUILT_NUMBER || BUILT_COMMIT } }) });
      if (r.ok) void loadChangeThreads();
      return r.ok;
    } catch { return false; }
  };
  // Answer Claude on a request (2 Nov: "Waiting for you" had no way to answer; a new request left the old one stuck):
  // saved as CHANGE-ANSWER-<same id> {answers}; the request opens again and the next run reads it with the question.
  const [answerFor, setAnswerFor] = useState("");
  const [answerText, setAnswerText] = useState("");
  const sendChangeAnswer = async (t: ChangeThread, raw: string) => {
    const text = raw.trim();
    if (!text) return false;
    const answers = [...t.answers, { at: new Date().toISOString(), text: text.slice(0, 2000) }].slice(-20);
    setChangeThreads((list) => (list || []).map((x) => (x.id === t.id ? { ...x, answers, ok: "", asked: x.asked || x.status, status: "Received" } : x)));
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-ANSWER-${t.id}`, patch: { answers, ok: "" } }) });
      if (r.ok) void loadChangeThreads();
      return r.ok;
    } catch { return false; }
  };
  // 👍 Works (2 Nov): you checked a finished request; it leaves the map card and Claude sees it (no new run).
  const confirmWorks = async (t: ChangeThread) => {
    const ok = new Date().toISOString();
    setChangeThreads((list) => (list || []).map((x) => (x.id === t.id ? { ...x, ok } : x)));
    try { await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-ANSWER-${t.id}`, patch: { ok } }) }); } catch { /* offline: shown on this phone */ }
  };
  // 💡 Ideas from Claude (owner, 3 Nov: "a button I push and it recommends a bunch of suggestions ... keep recommending
  // new things"): public/data/upgrade-ideas.json, kept fresh by Claude. 👍 Do it = a request; Not now = hidden on this
  // phone. 🔁 Keep upgrading (AUTO-UPGRADE on the status server): with no requests open, Claude builds the next idea by
  // itself (up to 3 a day, scheduled task hpd-requests-auto) and tells you.
  type Idea = { id: string; icon: string; kind: string; title: string; why: string };
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasPicked, setIdeasPicked] = useState<Record<string, string>>({});
  const [autoUpgrade, setAutoUpgrade] = useState(false);
  const [autoInfo, setAutoInfo] = useState<{ lastAt: string; lastTitle: string; doneToday: number }>({ lastAt: "", lastTitle: "", doneToday: 0 });
  const [ideasNote, setIdeasNote] = useState("");
  useEffect(() => { try { setIdeasPicked(JSON.parse(localStorage.getItem("hpd-ideas-picked") || "{}")); } catch { /* private mode */ } }, []);
  const loadIdeas = async (): Promise<Idea[]> => {
    try {
      const r = await fetch("/data/upgrade-ideas.json", { cache: "no-cache" });
      const d = r.ok ? await r.json() : null;
      const list: Idea[] = Array.isArray(d?.ideas) ? d.ideas.filter((x: Idea) => x?.id && x?.title).map((x: Idea) => ({ id: String(x.id), icon: String(x.icon || "💡"), kind: String(x.kind || "upgrade"), title: String(x.title).slice(0, 80), why: String(x.why || "").slice(0, 240) })) : [];
      setIdeas(list);
      return list;
    } catch { setIdeas([]); return []; }
  };
  const openIdeas = (list: Idea[] | null = ideas) => (list || []).filter((x) => !ideasPicked[x.id]);
  const markIdea = (id: string, how: string) => {
    setIdeasPicked((m) => { const next = { ...m, [id]: `${how}|${new Date().toISOString()}` }; try { localStorage.setItem("hpd-ideas-picked", JSON.stringify(next)); } catch { /* private mode */ } return next; });
  };
  const sendRequest = async (raw: string) => {
    const text = raw.trim();
    if (!text) return false;
    const at = new Date().toISOString();
    const list = [{ at, text }, ...myRequests].slice(0, 50);
    setMyRequests(list);
    try { localStorage.setItem("hpd-change-requests", JSON.stringify(list)); } catch { /* private mode */ }
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: requestKey(at), patch: { at, text: text.slice(0, 2000), version: BUILT_NUMBER || BUILT_COMMIT } }) });
      if (r.ok) void loadChangeThreads();
      return r.ok;
    } catch { return false; }
  };
  const pickIdea = async (x: Idea) => {
    markIdea(x.id, "do");
    const ok = await sendRequest(`(idea) ${x.title}: ${x.why}`);
    setIdeasNote(ok ? `👍 Sent to Claude: “${x.title}”. ${pickupLabel(claudeSeenAt)}.` : "Saved on this phone; it goes to Claude when the server answers.");
    return ok;
  };
  const askMoreIdeas = async () => {
    const ok = await sendRequest("(idea) Give me more upgrade ideas: new things to add, and things in the app that should work differently, faster or better. Add them to the ideas list.");
    setIdeasNote(ok ? `💬 Asked Claude for more ideas. They show here when ready. ${pickupLabel(claudeSeenAt)}.` : "Saved on this phone (offline).");
    return ok;
  };
  const setAutoUpgradeOn = async (on: boolean) => {
    setAutoUpgrade(on);
    try { await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "AUTO-UPGRADE", patch: { on, at: new Date().toISOString() } }) }); } catch { /* offline */ }
  };
  const askForChange = async () => {
    const text = changeText.trim();
    if (!text) return;
    const at = new Date().toISOString();
    const list = [{ at, text }, ...myRequests].slice(0, 50);
    setMyRequests(list);
    try { localStorage.setItem("hpd-change-requests", JSON.stringify(list)); } catch { /* private mode */ }
    setChangeText("");
    try {
      const r = await fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: requestKey(at), patch: { at, text: text.slice(0, 2000), version: BUILT_NUMBER || BUILT_COMMIT } }) });
      setChangeStatus(r.ok ? `📥 Received. ${pickupLabel(claudeSeenAt)}; progress shows below, live.` : "Saved on this phone; it will be sent when the server answers.");
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
    if (!seen) return;
    void loadWhatsNew().then((versions: WhatsNew | null | undefined) => {
      const all = (versions || []).flatMap((v) => v.items).slice(0, 60);
      let known: string[] | null = null;
      try { known = JSON.parse(localStorage.getItem("hpd-whatsnew-seen") || "null"); } catch { /* private mode */ }
      const fresh = Array.isArray(known) ? all.filter((x) => !known!.includes(x)) : (versions?.[0]?.items || []);
      if (fresh.length) setNewItems(fresh.slice(0, 6));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const seenNewItems = () => {
    setNewItems([]);
    try { localStorage.setItem("hpd-whatsnew-seen", JSON.stringify((whatsNew || []).flatMap((v) => v.items).slice(0, 60))); } catch { /* private mode */ }
  };
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
  const [routeBuildRequest, setRouteBuildRequest] = useState(0);
  // The envelope button flips the map to upcoming invitations to bid (BidsMode).
  const [bidsOpen, setBidsOpen] = useState(false);
  // How many invitations are open (shown on the Bids button like the Notices count), and how many are due today / tomorrow.
  const [bidsDue, setBidsDue] = useState<{ today: number; tomorrow: number; open: number; unsentToday?: number; sentToday?: number; firstTime?: string }>({ today: 0, tomorrow: 0, open: 0 });
  // The voice helper (owner, 22 Oct: "be my personal agent for this app: 'I finished this job' and you note it; give me
  // the description, talk it out with me"). Says the answer and shows it; a change to a job waits for a yes.
  const [helpOpen, setHelpOpen] = useState(false);
  const [agent, setAgent] = useState<{ heard: string; reply: string; week?: { day: string; date: string; n: { appt: number; bids: number; notices: number } }[]; chart?: { title: string; aName: string; bName: string; rows: { label: string; a: number; b: number }[] }; choices?: string[]; offers?: string[]; offersLabel?: string; live?: "claude"; cards?: ChatCard[]; confirm?: { id: string; outcome: string }; signIn?: boolean; actions?: { label: string; href: string; id?: string; via?: "Waze" | "Google"; queue?: { omo: string; at: string }[]; remind?: string }[] } | null>(null);
  const agentRef = useRef<(heard: string, inner?: boolean) => void>(() => {});
  // The jobs the helper just listed (wins, bids, notices, the day's route), for "read me the descriptions" / "the first one".
  const lastJobsRef = useRef<{ ids: string[]; at: number } | null>(null);
  // 💬 Conversation mode (23 Oct "a continue-conversation button, I don't want to keep clicking the mic"): after each
  // answer is said, it listens again by itself, until "stop" or ✕.
  const [convo, setConvo] = useState(false);
  // 🚗 Driving mode (3 Nov, owner's pick 4): short spoken answers, it keeps listening (no "tap to keep talking"),
  // bigger text. On by "I'm driving", 🚗 in the helper, or the offer when the phone moves at driving speed; off by
  // "I'm parked", 🚗 again or closing the helper. Kept for the day on this phone.
  const [driving, setDriving] = useState(false);
  const drivingRef = useRef(false);
  const convoRef = useRef(false);
  const convoMissRef = useRef(0);
  // Several questions in one sentence (23 Oct): the parts still to answer and the answers so far.
  const multiRef = useRef<{ heard: string; queue: string[]; replies: string[] } | null>(null);
  // The last things said to the AI and its answers (this session), for follow-up questions.
  const chatRef = useRef<{ you: string; helper: string; at: number }[]>([]);
  // The helper as a conversation (27 Oct, owner: "a better interface for the AI"): the earlier turns stay on screen
  // for 15 minutes, and a box to type anything (questions, app actions, or a change for Claude).
  // "Ask the AI instead" after "Did you mean…?": that sentence goes to the AI as said.
  const askAnywayRef = useRef("");
  const [agentHistory, setAgentHistory] = useState<{ heard: string; reply: string; at: number }[]>([]);
  // The chat on the map (owner, 2 Nov: "build a chat on the map, better flow"): a bar over the map to type or talk,
  // and today's conversation kept on this phone until midnight (▲ Earlier today shows all of it).
  const [chatBarText, setChatBarText] = useState("");
  const [chatAll, setChatAll] = useState(false);
  const [bidsChat, setBidsChat] = useState<BidsChat | null>(null);
  const chatReplyRef = useRef<(reply: string, cards?: ChatCard[]) => void>(() => {});
  // Cards for the next answer (set just before it); without them, the jobs the answer names become cards.
  const cardsRef = useRef<ChatCard[] | null>(null);
  // The cards last shown in the chat, for "open the second one" (15 minutes).
  const lastCardsRef = useRef<{ cards: ChatCard[]; at: number } | null>(null);
  // The invitations last loaded (for bid cards and the "bids due soon" nudge).
  const bidsListRef = useRef<{ omo?: string; bidDue: string; bidDueTime: string; address?: string; borough?: string; description?: string; receivedAt?: string }[]>([]);
  // 👋 While you were away (3 Nov, owner's pick 1 of "make the chat smarter"): the last time the app was on screen is
  // kept on the phone (hpd-last-seen, every minute while open and on leaving); back after 2 hours or more, that time
  // is the start of the catch-up line over the chat bar and of "what did I miss".
  const [awaySince, setAwaySince] = useState("");
  const lastSeenRef = useRef("");
  useEffect(() => {
    const KEY = "hpd-last-seen";
    const mark = () => { try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* private mode */ } };
    const back = () => {
      if (document.visibilityState !== "visible") { mark(); return; }
      let last = "";
      try { last = localStorage.getItem(KEY) || ""; } catch { /* private mode */ }
      if (last) lastSeenRef.current = last;
      if (last && Date.now() - Date.parse(last) >= 2 * 3600000) setAwaySince(last);
      mark();
    };
    back();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") mark(); }, 60000);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pagehide", mark);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("pagehide", mark); };
  }, []);
  // Nudges (2 Nov, part 4: "the chat starts the conversation when something matters"), checked every minute.
  const [nudgeSeen, setNudgeSeen] = useState<string[]>([]);
  const [, setNudgeTick] = useState(0);
  useEffect(() => {
    setNudgeSeen(nudgesSeen());
    const t = window.setInterval(() => setNudgeTick((n) => n + 1), 60000);
    return () => window.clearInterval(t);
  }, []);
  const chatLoadedRef = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_DAY_KEY) || "null");
      if (saved && saved.day === nyToday() && Array.isArray(saved.turns)) setAgentHistory(saved.turns.slice(-30));
    } catch { /* private mode */ }
    chatLoadedRef.current = true;
  }, []);
  useEffect(() => {
    if (!chatLoadedRef.current) return;
    try { localStorage.setItem(CHAT_DAY_KEY, JSON.stringify({ day: nyToday(), turns: agentHistory.slice(-30) })); } catch { /* private mode */ }
  }, [agentHistory]);
  const prevAgentRef = useRef<{ heard: string; reply: string } | null>(null);
  const [agentTyped, setAgentTyped] = useState("");
  const [agentTypeOpen, setAgentTypeOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  // 💬 The chat moves to the side when you're done with it and comes back up by itself with its next answer or idea
  // (owner, 3 Nov: "chat should just move to the side, and automatically zoom back up when it wants to give me an idea").
  const [agentTucked, setAgentTucked] = useState(false);
  // 🤖 One helper (owner, 3 Nov: "the working bot should turn into the talking bot, and disappear into the working
  // mode; when I click on him, the bot should open up"): the dock's 🤖 grows into the chat, and shrinks back into it.
  const [agentFromDock, setAgentFromDock] = useState(false);
  const [orbBack, setOrbBack] = useState(0);
  // 😊 Feelings: smiles a while when something good comes in (Claude finished, a win, paid); 🔔 jumps on every alert
  // (a tap on the shoulder); 🎤 press and hold to talk, like a walkie-talkie (owner's picks, 3 Nov).
  const [orbHappy, setOrbHappy] = useState(false);
  // 💤 Night (9 PM-7 AM) is checked after the page loads, every minute: the page is built ahead of time, so a clock in the
  // first drawing would not match the phone's (React error 418).
  const [orbNight, setOrbNight] = useState(false);
  useEffect(() => {
    const check = () => { const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date())); setOrbNight(h >= 21 || h < 7); };
    check();
    const t = window.setInterval(check, 60000);
    return () => window.clearInterval(t);
  }, []);
  // 🎨 Dress the helper: the picker in the chat.
  const [dressOpen, setDressOpen] = useState(false);
  const helperLook = useHelperLook();
  // 🎙 Its voice (owner's pick, 4 Nov): the phone's best voices as 👩 / 👨 buttons and a speed, with a sample.
  const [voiceTick, setVoiceTick] = useState(0);
  // 🗨 The helper says short news in a speech bubble over the 🤖 (owner's pick, 4 Nov), without opening the chat; a
  // tap opens it in the chat and reads it out loud. Any screen can ask with the "hpd-helper-say" event.
  const [orbSay, setOrbSay] = useState<{ text: string; full: string; at: number; run?: string } | null>(null);
  useEffect(() => {
    if (!orbSay) return;
    const at = orbSay.at;
    const t = window.setTimeout(() => setOrbSay((o) => (o && o.at === at ? null : o)), 7000);
    return () => window.clearTimeout(t);
  }, [orbSay]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; full?: string; speak?: boolean }>).detail;
      if (!d?.text) return;
      setOrbSay({ text: d.text, full: d.full || d.text, at: Date.now() });
      if (d.speak) speak(d.full || d.text, 150);
    };
    window.addEventListener("hpd-helper-say", on);
    return () => window.removeEventListener("hpd-helper-say", on);
  }, []);
  // 📣 Read it to me (owner's pick, 3 Nov): any screen asks the helper to read something out loud (job card, bid).
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ title: string; text: string; omo?: string; go?: string }>).detail;
      if (!d?.text) return;
      unlockChime();
      // 🧭 "Take me there" after it: the job just read is the one "there" means.
      if (d.omo) { lastJobsRef.current = { ids: [d.omo], at: Date.now() }; const omo = d.omo; window.setTimeout(() => robotWalkRef.current(omo), 250); }
      setAgent({ heard: `📣 ${d.title}`, reply: d.text, actions: d.go ? [{ label: "🧭 Take me there (Waze)", href: d.go, id: d.omo, via: "Waze" }] : undefined, offers: d.omo ? ["walk me through it"] : undefined, offersLabel: d.omo ? "At the building?" : undefined });
      speak(d.text.replace(/\bHPD\b/g, "H P D").replace(/\b([A-Z]{2})(\d{5})\b/g, (_m, a: string, n: string) => `${a.split("").join(" ")} ${n.split("").join(" ")}`), 200);
    };
    window.addEventListener("hpd-read-aloud", on);
    return () => window.removeEventListener("hpd-read-aloud", on);
  }, []);
  // ✨ The magic: tapping the little 🤖 makes sparkles burst out of it and the big helper rise up and say hello out loud.
  const [magicAt, setMagicAt] = useState(0);
  const [magicOn, setMagicOn] = useState(false);
  useEffect(() => { if (!magicAt) return; setMagicOn(true); const t = window.setTimeout(() => setMagicOn(false), 1600); return () => window.clearTimeout(t); }, [magicAt]);
  // 👀 The 🤖's eyes look toward where you last tapped. Moved straight on the drawing (no redraw of the screen: a redraw
  // between the finger going down and the tap swallowed taps on the map pins).
  useEffect(() => {
    let t = 0;
    const on = (e: PointerEvent) => {
      const orbEl = document.querySelector('[data-hpd-smoke="fc-claude-orb"]');
      const eyes = orbEl?.querySelector<SVGGElement>(".fc-face-look");
      if (!orbEl || !eyes || orbEl.contains(e.target as Node)) return;
      const r = orbEl.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      eyes.style.transform = `translate(${((dx / d) * 3).toFixed(1)}px, ${((dy / d) * 2.2).toFixed(1)}px)`;
      window.clearTimeout(t);
      t = window.setTimeout(() => { eyes.style.transform = ""; }, 2500);
    };
    document.addEventListener("pointerdown", on, { passive: true });
    return () => { document.removeEventListener("pointerdown", on); window.clearTimeout(t); };
  }, []);
  const [orbTap, setOrbTap] = useState(false);
  const holdTimerRef = useRef(0);
  const holdingRef = useRef(false);
  const holdEndedRef = useRef(0);
  // 🗺 The helper points: a light flies from its face to the pin of the job it names.
  const [pointAt, setPointAt] = useState<{ x0: number; y0: number; x1: number; y1: number; key: string } | null>(null);
  const [tuckPoke, setTuckPoke] = useState(0);
  // 🔇 Stop talking (27 Oct): while the helper is speaking, one tap hushes it; talking to it hushes it too.
  const [speakingNow, setSpeakingNow] = useState(false);
  // Tucks 15 s after the last answer or tap, on the map only (not over a bid or a job), not while listening, talking,
  // driving or waiting for a yes / a pick.
  useEffect(() => {
    setAgentTucked(false);
    if (!agent || selectedJob || bidsOpen || listening || speakingNow || convo || driving || agent.confirm || agent.choices?.length || agent.signIn || agentTypeOpen) return;
    const t = window.setTimeout(() => setAgentTucked(true), 15000);
    return () => window.clearTimeout(t);
  }, [agent, selectedJob, bidsOpen, listening, speakingNow, convo, driving, agentTypeOpen, tuckPoke]);
  useEffect(() => { if (!agent) setAgentFromDock(false); }, [agent]);
  useEffect(() => {
    const card = agent?.cards?.find((c) => c.kind !== "bid");
    const job = card ? jobs.find((j) => jobId(j) === card.id) : null;
    const ll = job ? jobLatLng(job) : null;
    const map = mapRef.current;
    if (!ll || !map?.latLngToContainerPoint) return;
    const t = window.setTimeout(() => {
      const face = document.querySelector('[data-hpd-smoke="fc-agent-who"] .fc-face')?.getBoundingClientRect();
      const box = map.getContainer?.()?.getBoundingClientRect();
      if (!face || !box) return;
      const pt = map.latLngToContainerPoint([ll.lat, ll.lng]);
      const x1 = box.left + pt.x, y1 = box.top + pt.y;
      if (x1 < 0 || y1 < 60 || x1 > window.innerWidth || y1 > window.innerHeight) return;
      setPointAt({ x0: face.left + face.width / 2, y0: face.top + face.height / 2, x1, y1, key: `${card!.id}${Date.now()}` });
      window.setTimeout(() => setPointAt(null), 1800);
    }, 450);
    return () => window.clearTimeout(t);
  }, [agent?.cards]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: Event) => setSpeakingNow(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("hpd-speaking", on);
    return () => window.removeEventListener("hpd-speaking", on);
  }, []);
  useEffect(() => {
    const prev = prevAgentRef.current;
    if (prev && (!agent || prev.heard !== agent.heard) && prev.heard !== "🎤" && prev.heard !== "👋" && prev.reply && !/^(Listening|Sending to Claude)/.test(prev.reply)) {
      setAgentHistory((h) => [...h.filter((x) => nyToday(new Date(x.at)) === nyToday()), { heard: prev.heard, reply: prev.reply, at: Date.now() }].slice(-30));
    }
    // Closed: the last answer is kept too (it was only kept when the next question came).
    prevAgentRef.current = agent ? { heard: agent.heard, reply: agent.reply } : null;
  }, [agent]);
  // 🌤 Weather on the map (27 Oct, owner: "I want to see temp etc on the map"): now, and rain / snow coming in the next
  // hours (else today's high and low); refreshed every 10 minutes from the 30-minute forecast; tap for the full answer.
  const [wxChip, setWxChip] = useState<ReturnType<typeof weatherNow>>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dockSlots, setDockSlots] = useState<DockKey[]>([...DOCK_DEFAULT]);
  const [dockEdit, setDockEdit] = useState(-1);
  const dockHold = useRef({ timer: 0, fired: false });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCK_SLOTS_KEY) || "null");
      if (Array.isArray(saved) && saved.length === 3 && new Set(saved).size === 3 && saved.every((key) => (DOCK_STRIP_ORDER as readonly string[]).includes(key))) setDockSlots(saved);
    } catch { /* private mode */ }
  }, []);
  const saveDockSlots = (next: DockKey[]) => { setDockSlots(next); try { localStorage.setItem(DOCK_SLOTS_KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  // Putting a button in a slot swaps it with wherever it was.
  const setDockSlot = (slot: number, key: DockKey) => { const next = [...dockSlots]; const was = next.indexOf(key); if (was >= 0) next[was] = next[slot]; next[slot] = key; saveDockSlots(next); };
  // Checked after load (the page is built ahead of time) and every 10 minutes, so it flips at midnight.
  const [aspOffToday, setAspOffToday] = useState("");
  useEffect(() => {
    const check = () => setAspOffToday(aspOff(nyNow().iso.slice(0, 10)));
    check();
    const t = window.setInterval(check, 600000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    let live = true;
    const load = () => { if (document.visibilityState === "visible") void fetchWeather().then((w) => { if (live && w) setWxChip(weatherNow(w, nyNow().iso)); }); };
    load();
    const t = window.setInterval(load, 600000);
    document.addEventListener("visibilitychange", load);
    return () => { live = false; window.clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, []);
  // ✨ The AI on the map (27 Oct, owner: "I want the AI agent on the map, click it and start a conversation"): one tap
  // opens the helper already listening, says the most pressing thing first, and keeps the conversation going.
  // What came in since `since`: new invitations to bid, HPD's emails (by job), what Claude finished or asked. Data only
  // the app already has; no names (the emails go by job number).
  const catchUp = (since: string) => {
    const t0 = Date.parse(since);
    const after = (iso?: string) => Boolean(iso) && Date.parse(String(iso)) > t0;
    const lines: string[] = [];
    const bids = bidsListRef.current.filter((b) => b.omo && after(b.receivedAt));
    if (bids.length) lines.push(`📨 ${bids.length} new invitation${bids.length === 1 ? "" : "s"} to bid: ${bids.slice(0, 3).map((b) => b.omo).join(", ")}${bids.length > 3 ? "…" : ""}`);
    const hpd = (threads || []).filter((t) => t.messages.some((m) => m.hpd && !m.mine && after(m.at)));
    if (hpd.length) { const omos = [...new Set(hpd.flatMap((t) => t.omos))]; lines.push(`📧 HPD wrote ${hpd.length} time${hpd.length === 1 ? "" : "s"}${omos.length ? ` about ${omos.slice(0, 3).join(", ")}${omos.length > 3 ? "…" : ""}` : ""}`); }
    const ask = (t: ChangeThread) => `“${t.text.replace(/^\((said to the helper|from the chat)\)\s*/i, "").slice(0, 50)}${t.text.length > 50 ? "…" : ""}”`;
    const moved = (changeThreads || []).filter((t) => t.updates.some((u) => after(u.at)));
    const done = moved.filter((t) => t.status === "Done");
    const asked = moved.filter((t) => t.status === "Waiting for you");
    if (done.length) lines.push(`✅ Claude finished ${done.length === 1 ? ask(done[0]) : `${done.length} requests`}`);
    if (asked.length) lines.push(`❓ Claude needs your answer on ${ask(asked[0])}`);
    const working = moved.filter((t) => t.status !== "Done" && t.status !== "Waiting for you");
    if (working.length) lines.push(`🔧 Claude worked on ${working.length === 1 ? ask(working[0]) : `${working.length} requests`}`);
    return lines;
  };
  const sinceLabel = (iso: string) => {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()) ? "" : `${d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" })} `;
    return `${day}${d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}`;
  };
  const startAgentChat = (magic = false) => {
    unlockChime();
    const step = nextStepRef.current;
    if (magic) {
      // ✨ From the 🤖 (owner, 3 Nov: "when I click the small robot it should magically emerge and start talking"):
      // sparkles, the big face rises, it greets you by name and time of day out loud, then it listens.
      const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      const name = (() => { try { return localStorage.getItem("hpd-owner-name") || "Jot"; } catch { return "Jot"; } })();
      const todo = jobRows.filter((r) => r.group === "todo").length;
      const parts = [todo ? `${todo} job${todo === 1 ? "" : "s"} to do` : "", bidsDue.unsentToday ? `${bidsDue.unsentToday} bid${bidsDue.unsentToday === 1 ? "" : "s"} due today` : ""].filter(Boolean);
      // ❓ Claude waiting for your answer: the robot still comes out and talks, and says so with a button (owner, 4 Nov:
      // "I'm not happy with the robot": a tap used to jump straight to Your requests whenever Claude had a question).
      const ask = (changeThreads || []).find((x) => x.status === "Waiting for you");
      const askWhat = ask ? ask.text.replace(/^\(idea\)\s*/i, "").split(/[:.!?]/)[0].trim().slice(0, 60) : "";
      const hello = `${h >= 22 || h < 6 ? "Yawn… you're up late! " : ""}Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}, ${name}!${parts.length ? ` You have ${parts.join(" and ")}.` : ""}${ask ? ` Claude has a question for you about ${askWhat}.` : ""}${(() => { try { const o: Record<string, string> = JSON.parse(localStorage.getItem("hpd-habits") || "{}"); const n: Record<string, number> = {}; for (const k of Object.values(o)) n[k] = (n[k] || 0) + 1; const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; return h >= 5 && h < 11 && !o[nyToday()] && best && best[1] >= 3 ? ` You usually start with ${best[0] === "bids" ? "bids" : "notices"}.` : ""; } catch { return ""; } })()}${step ? ` First thing: ${step.text.replace(/\.$/, "")}.` : ""} What can I do for you?`;
      setMagicAt(Date.now());
      moodSound("magic");
      // 🧠 Your usual start (3 of the last 14 mornings), offered before 11 if you haven't opened it yet today.
      const habit = (() => {
        if (h < 5 || h >= 11) return "";
        try {
          const o: Record<string, string> = JSON.parse(localStorage.getItem("hpd-habits") || "{}");
          if (o[nyToday()]) return "";
          const n: Record<string, number> = {};
          for (const k of Object.values(o)) n[k] = (n[k] || 0) + 1;
          const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
          return best && best[1] >= 3 ? best[0] : "";
        } catch { return ""; }
      })();
      const habitName: Record<string, string> = { bids: "Bids", notices: "Notices", board: "the notice board" };
      const acts = [...(ask ? [{ label: "❓ Answer Claude", href: "#requests" }] : []), ...(habit ? [{ label: `▶ ${habitName[habit]} (your usual start)`, href: `#go:${habit}` }] : []), ...(step ? [{ label: "▶ Do it", href: "#next" }] : [])];
      setAgent({ heard: "👋", reply: hello, actions: acts.length ? acts : undefined });
      speak(hello.replace(/\bHPD\b/g, "H P D"), 650, () => { if (canListen) { convoRef.current = true; convoMissRef.current = 0; setConvo(true); startListening(); } else setAgentTypeOpen(true); });
      return;
    }
    setAgent({ heard: "👋", reply: `${step ? `Hi! First thing: ${step.text.replace(/\.$/, "")}. ` : "Hi! "}What do you need? Talk to me, or tap ⌨️ to type.`, actions: step ? [{ label: "▶ Do it", href: "#next" }] : undefined });
    if (canListen) { convoRef.current = true; convoMissRef.current = 0; setConvo(true); startListening(); } else setAgentTypeOpen(true);
  };
  const setDrivingMode = (on: boolean, say = true) => {
    setDriving(on); drivingRef.current = on; setBriefSpeech(on);
    try { if (on) localStorage.setItem("hpd-driving", nyToday()); else localStorage.removeItem("hpd-driving"); } catch { /* private mode */ }
    if (on) {
      unlockChime();
      const reply = canListen ? "🚗 Driving mode on: short answers, and I keep listening. Say \"I'm parked\" to stop." : "🚗 Driving mode on: short answers. On this phone, tap 🎙 on the keyboard to talk. Say \"I'm parked\" to stop.";
      setAgent({ heard: "🚗", reply });
      convoRef.current = canListen; convoMissRef.current = 0; setConvo(canListen);
      if (say) speak(reply, 200, () => { if (convoRef.current && !listenRef.current) startListening(); });
      else if (canListen) startListening();
    } else {
      convoRef.current = false; setConvo(false); listenRef.current?.stop();
      if (say) { setAgent((a) => (a ? { ...a, heard: "🚗", reply: "Driving mode off. Tap ✨ or the chat when you need me." } : a)); speak("Driving mode off.", 200); }
    }
  };
  // 📷 Read a photo (3 Nov, owner's pick 5): the picture is made smaller on the phone (longest side 1280, JPEG),
  // read by Cloudflare's own vision model (server/ai-draft aiReadPhoto, signed in only, nothing kept), and the answer
  // is shown, said and turned into job cards. 15 a day on this phone keeps it inside the free allowance.
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const shrinkPhoto = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.8);
    } finally { URL.revokeObjectURL(url); }
  };
  const readPhoto = async (file?: File | null) => {
    if (!file) return;
    const heard = "📷 Photo";
    const day = nyToday();
    let used = { day: "", n: 0 };
    try { used = { ...used, ...JSON.parse(localStorage.getItem("hpd-photo-reads") || "{}") }; } catch { /* private mode */ }
    if (used.day === day && used.n >= 15) { setAgent({ heard, reply: "That's 15 photos today, the most I read in a day so it stays free. Try again tomorrow." }); return; }
    setAgent({ heard, reply: "Reading the photo…" });
    const again = () => { if (convoRef.current) startListening(); };
    try {
      const image = await shrinkPhoto(file);
      const r = await fetch("/api/drive/hpd-photo", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || d.reconnectRequired) { setAgent({ heard, reply: "I read photos only when this phone is signed in with Google: tap Sign in below, then take the photo again.", signIn: true }); return; }
      if (d.ai && d.text) {
        try { localStorage.setItem("hpd-photo-reads", JSON.stringify({ day, n: (used.day === day ? used.n : 0) + 1 })); } catch { /* private mode */ }
        const cards = omosIn(d.text).map((o) => chatCard(o)).filter((c): c is ChatCard => Boolean(c)).slice(0, 5);
        if (cards.length) lastCardsRef.current = { cards, at: Date.now() };
        chatRef.current = [...chatRef.current, { you: "(a photo)", helper: String(d.text).slice(0, 300), at: Date.now() }].slice(-8);
        setAgent({ heard, reply: d.text, cards });
        speak(d.text, 200, again);
        return;
      }
      setAgent({ heard, reply: d.reason === "not-set-up" ? "Reading photos needs the AI switched on for the app." : `I couldn't read it. ${d.reason || ""} Try a closer, brighter photo.`.trim() });
    } catch { setAgent({ heard, reply: "No connection right now (or the photo couldn't be opened). Try again in a minute." }); }
  };
  const setDrivingRef = useRef(setDrivingMode);
  setDrivingRef.current = setDrivingMode;
  useEffect(() => { try { if (localStorage.getItem("hpd-driving") === nyToday()) { setDriving(true); drivingRef.current = true; setBriefSpeech(true); } } catch { /* private mode */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Moving at driving speed (over 15 mph on two readings in a row): offered once a day over the chat bar.
  const [movingFast, setMovingFast] = useState(false);
  const fastRef = useRef(0);
  // 📱 Text the tenant (22 Oct): the draft being read / edited before it opens in Messages.
  const [tenantText, setTenantText] = useState<{ id: string; text: string; ai: string; at?: number } | null>(null);
  // What is waiting for a yes, kept 2 minutes even if the answer panel is closed (a yes said from the search mic).
  const pendingRef = useRef<{ id: string; outcome: string; at: number } | null>(null);
  // An outcome said with its day / who refused, waiting for yes; a refusal said without who waits for the description.
  const pendingOutcomeRef = useRef<{ id: string; outcome: string; date?: string; who?: string } | null>(null);
  const pendingWhoRef = useRef<{ id: string; date?: string; at: number } | null>(null);
  // An appointment said to the helper, waiting for your yes.
  const pendingApptRef = useRef<{ id: string; appt: Appointment } | null>(null);
  // The tenant last asked to call (by voice), for "I called the tenant, no answer" right after.
  const lastCallRef = useRef("");
  // 📞 After a call from the app (26 Oct): back in the app, "How did the call go?" with one tap to note it.
  const callStartRef = useRef<{ id: string; at: number } | null>(null);
  const [callAsk, setCallAsk] = useState<string>("");
  const [contactAll, setContactAll] = useState(false);
  const [contactCopied, setContactCopied] = useState("");
  const [routeAdded, setRouteAdded] = useState("");
  // 🚪 Arrived (26 Oct): a ready "we're outside" text to the tenant, one tap away (Messages; you press Send).
  const offerOutside = (job: JobRecord) => {
    const t = tenantInfo(job);
    if (!t.phone || t.commonArea) return;
    const raw = (t.name || "").split(/\s+/)[0];
    const hi = raw && raw.length > 1 ? `Hi ${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "Hello";
    const where = jobAddress(job).replace(/,\s*\d{5}$/, "");
    const text = `${hi}, this is Jot from United Angel Construction. We are outside ${where}${t.apt ? ` (apt ${t.apt.replace(/^apt\.?\s*/i, "")})` : ""} for the HPD repair. Please let us in.`;
    setAgent({ heard: "📍 Arrived", reply: `You're at ${where}. Tell ${raw && raw.length > 1 ? `${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "the tenant"} you're outside?`, actions: [{ label: "🚪 Text: we're outside", href: smsHref(t.phone, text) }] });
  };
  const noteCallStarted = (id: string) => { callStartRef.current = { id, at: Date.now() }; lastCallRef.current = id; };
  useEffect(() => {
    const back = () => {
      const c = callStartRef.current;
      if (document.visibilityState !== "visible" || !c) return;
      callStartRef.current = null;
      if (Date.now() - c.at > 3000 && Date.now() - c.at < 2 * 3600000) setCallAsk(c.id);
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, []);
  // Reminders said to the helper ("remind me to call Lewis at 3"): kept on this phone; at the time the app rings and
  // says it (while it's open). Add to Calendar covers the app being closed.
  type Reminder = { id: string; what: string; date: string; time: string };
  const readReminders = (): Reminder[] => { try { const v = JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const saveReminders = (list: Reminder[]) => { try { localStorage.setItem("hpd-reminders-v1", JSON.stringify(list.slice(-50))); } catch { /* private mode */ } };
  useEffect(() => {
    const check = () => {
      const list = readReminders();
      if (!list.length) return;
      const now = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(", ", "T");
      const due = list.filter((r) => `${r.date}T${r.time}` <= now);
      if (!due.length) return;
      saveReminders(list.filter((r) => !due.includes(r)));
      for (const r of due) window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "message", title: `⏰ Reminder: ${r.what}`, text: `You asked me to remind you to ${r.what}.` } }));
    };
    check();
    const id = window.setInterval(check, 20000);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const load = () => fetch("/data/upcoming_bids.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const day = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const nowMin = (() => { const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number); return h * 60 + m; })();
      const minutes = (t: string) => { const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60; };
      const bids: { bidDue: string; bidDueTime: string; omo?: string; address?: string }[] = Array.isArray(d?.bids) ? d.bids : [];
      bidsListRef.current = bids;
      try {
        const raw = localStorage.getItem("hpd-seen-invites");
        const seen = new Set<string>(raw ? JSON.parse(raw) : []);
        const keys = bids.filter((b) => b.omo && b.bidDue >= day(0)).map((b) => ({ key: `${b.omo}|${b.bidDue}`, b }));
        const fresh = keys.filter((k) => !seen.has(k.key));
        for (const k of keys) seen.add(k.key);
        localStorage.setItem("hpd-seen-invites", JSON.stringify([...seen].slice(-600)));
        if (raw && fresh.length) notify({ kind: "bid", go: "bids", omo: fresh[0].b.omo, title: fresh.length === 1 ? `New invitation to bid · ${fresh[0].b.omo}` : `${fresh.length} new invitations to bid`, text: fresh.length === 1 ? `${fresh[0].b.address || ""} · due ${fresh[0].b.bidDue.slice(5).replace("-", "/")} ${fresh[0].b.bidDueTime}` : fresh.slice(0, 4).map((k) => k.b.omo).join(", ") });
      } catch { /* private mode */ }
      // Today's still-open bids not faxed yet (for the "Next" pill), soonest first.
      let recs: Record<string, { status?: string; bidDue?: string }> = {};
      try { recs = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}"); } catch { /* private mode */ }
      const unsent = bids.filter((b) => b.bidDue === day(0) && minutes(b.bidDueTime) > nowMin && !(b.omo && ["sent", "confirmed"].includes(String(recs[b.omo]?.status)) && recs[b.omo]?.bidDue === b.bidDue))
        .sort((a, b) => minutes(a.bidDueTime) - minutes(b.bidDueTime));
      setBidsDue({
        unsentToday: unsent.length, firstTime: unsent[0]?.bidDueTime || "",
        sentToday: bids.filter((b) => b.bidDue === day(0) && b.omo && ["sent", "confirmed"].includes(String(recs[b.omo]?.status)) && recs[b.omo]?.bidDue === b.bidDue).length,
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
    setBidsFocus((params.get("omo") || "").toUpperCase());
    setBidsOpen(true);
    // The tab goes by sessionStorage: changing the address twice reset the screen.
    try { if (params.get("tab")) sessionStorage.setItem("hpd-bids-tab", String(params.get("tab"))); } catch {}
    try { window.history.replaceState(null, "", window.location.pathname); } catch {}
  }, []);
  // A phone alert about HPD's email / a notice opens the vendor tracking board (…&board=1).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const omo = (q.get("omo") || "").toUpperCase();
    // A rejection / a win with its job: the job card opens (the ?omo= link below does it once the jobs are loaded).
    if (q.get("money") === "1" && omo) return;
    // The Friday money report opens the whole picture (💰 To get paid), not just the rejections.
    if (q.get("money") === "all") { setFollowFilter("notices"); setNoticeKind("rejected"); setNoticesTab("money"); setNoticesOpen(true); try { window.history.replaceState(null, "", window.location.pathname); } catch {} return; }
    if (q.get("money") === "1") { setFollowFilter("notices"); setNoticeKind("rejected"); setNoticesTab("rejected"); setNoticesOpen(true); try { window.history.replaceState(null, "", window.location.pathname); } catch {} return; }
    if (q.get("board") !== "1") return;
    setBoardShow("all");
    setBoardFocus(omo);
    setBoardOpen(true);
    try { window.history.replaceState(null, "", window.location.pathname); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [stayOn, setStayOn] = useState(""); // "Stay here" on this job: no automatic move to the next stop
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
  // Payment tracker (31 Oct "do 6"): every job sent to HPD until PIP shows it paid (lib/pay-waiting.ts).
  const payWaits = useMemo(() => {
    const sent: Record<string, { sentAt?: string }> = { ...((followRef.current?.sent || {}) as Record<string, { sentAt?: string }>) };
    const closed: Record<string, string> = Object.fromEntries(Object.entries((followRef.current?.hpd || {}) as Record<string, { closedReason?: string }>).map(([o, h]) => [o, String(h?.closedReason || "")]));
    const emailed: Record<string, string> = {};
    const info: Record<string, { address: string; award: number; outcome: string }> = {};
    for (const j of [...olderJobs, ...jobs]) {
      const id = jobId(j);
      if (!id || isTestJob(id)) continue;
      info[id] = { address: jobAddress(j), award: Number(String(value(j, ["AwardAmount", "awardAmount", "BidAmount"]) || "").replace(/[^0-9.]/g, "")) || 0, outcome: value(j, ["FieldOutcome"]) };
      const e = value(j, ["PackageEmailedAt"]);
      if (e) emailed[id] = e;
      if (j.PaperworkSentAt && !sent[id]) sent[id] = { sentAt: String(j.PaperworkSentAt) };
      if (j.HpdClosedReason) closed[id] = String(j.HpdClosedReason);
    }
    return paymentWaits({ sent, emailed, pip: pipMap as unknown as Record<string, PipJob>, pipAsOf, jobs: info, closedReason: closed });
  }, [jobs, olderJobs, pipMap, pipAsOf, askedMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const findAnyJob = (omo: string) => jobs.find((j) => jobId(j) === omo) || olderJobs.find((j) => jobId(j) === omo) || (olderLayer || []).find((j) => jobId(j) === omo);
  const openRejections = rejections.filter((r) => !r.answered);
  useEffect(() => {
    if (!openRejections.length) return;
    try {
      const raw = localStorage.getItem("hpd-seen-rejections");
      const seen = new Set<string>(raw ? JSON.parse(raw) : []);
      const keys = openRejections.map((r) => ({ key: `${r.omo}|${r.at}`, r }));
      const fresh = keys.filter((k) => !seen.has(k.key));
      for (const k of keys) seen.add(k.key);
      localStorage.setItem("hpd-seen-rejections", JSON.stringify([...seen].slice(-600)));
      if (raw && fresh.length) for (const { r } of fresh.slice(-5)) notify({ kind: "rejection", go: "money", omo: r.omo, title: `💵 Payment rejected · ${r.omo}`, text: String((r as { reason?: string }).reason || "Fix it and send it back").slice(0, 110) });
    } catch { /* private mode */ }
  }, [openRejections.map((r) => `${r.omo}|${r.at}`).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAnsweredRejections, setShowAnsweredRejections] = useState(false);
  const [openNotice, setOpenNotice] = useState("");
  const senderName = (by: string) => (/^Department of Housing/i.test(by) ? "HPD Accounts Payable" : by);
  // Jobs HPD closed or PIP paid: nothing left to do on them.
  const closedJobs = new Set([...Object.entries(followRef.current?.hpd || {}).filter(([, h]) => (h as { closedReason?: string })?.closedReason).map(([o]) => o), ...Object.entries(pipMap).filter(([, p]) => p?.status === "paid").map(([o]) => o)]);
  // "Check my emails now" (19 Oct): your sent replies and HPD's answers read live from Gmail, added to the threads so the
  // board updates at once (the encrypted copy catches up on the next refresh).
  type ScanMsg = { threadId: string; at: string; subject: string; omos: string[]; files?: boolean };
  const [scan, setScan] = useState<{ checkedAt: string; sent: ScanMsg[]; received: ScanMsg[] } | null>(null);
  const [scanStatus, setScanStatus] = useState("");
  const boardThreads = !threads ? null : !scan ? threads : threads.map((t) => {
    const extra = [
      ...(scan.sent || []).filter((m) => m.threadId === t.id).map((m) => ({ at: m.at, from: "", hpd: false, mine: true, subject: m.subject, text: m.subject, files: m.files ? ["pdf"] : [] })),
      ...(scan.received || []).filter((m) => m.threadId === t.id).map((m) => ({ at: m.at, from: "", hpd: true, mine: false, subject: m.subject, text: m.subject, files: [] as string[] })),
    ].filter((m) => !t.messages.some((x) => Math.abs(Date.parse(x.at) - Date.parse(m.at)) < 90000 && x.mine === m.mine));
    return extra.length ? { ...t, messages: [...t.messages, ...extra] } : t;
  });
  // The banner for every notification (new / reply email from HPD, fax confirmed or failed, new invitation, a notice
  // running out of time), with its ring (owner, 20 Oct: "ring for all notifications").
  const [ping, setPing] = useState<(AppNotice & { at: number }) | null>(null);
  const [critical, setCritical] = useState<(AppNotice & { at: number; rings: number }) | null>(null);
  const snoozeKey = (n: AppNotice) => `hpd-snooze-${n.omo || n.title}`;
  const snoozed = (n: AppNotice) => { try { return Date.now() < Number(localStorage.getItem(snoozeKey(n)) || 0); } catch { return false; } };
  // The urgent box rings once and then stays on screen quietly until you choose (owner, 22 Oct: "I want to hear it
  // once, then it says on screen; right now it keeps repeating").
  // The Home Screen icon shows the unread count (like Gmail); the phone keeps counting alerts while the app is closed.
  const syncBadge = (n: number) => {
    try {
      const nav = navigator as unknown as { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (n > 0) void nav.setAppBadge?.(n).catch(() => {}); else void nav.clearAppBadge?.().catch(() => {});
      void caches.open("hpd-badge").then((c) => c.put("/badge", new Response(String(n)))).catch(() => {});
    } catch { /* no badges on this browser */ }
  };
  useEffect(() => {
    // Every banner steps aside by itself (it sat over other screens' Close buttons, 21 Oct); all of them stay in 🔔.
    if (!ping) return;
    const at = ping.at;
    const t = window.setTimeout(() => setPing((p) => (p && p.at === at ? null : p)), ping.kind === "fax-ok" ? 6000 : ping.kind === "bid" ? 12000 : 20000);
    return () => window.clearTimeout(t);
  }, [ping]);
  type FreshEmail = { at: string; subject: string; omo: string; from?: string; threadKind?: string; replied?: boolean; text?: string };
  const emailAlerts = (list: FreshEmail[]) => {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at)).slice(-8); // oldest first: the newest ends on top
    let last: (AppNotice & { at: number }) | null = null;
    for (const m of sorted) {
      const kind: AlertKind = emailKind(m.subject, m.threadKind || "", m.from || "");
      // What they want, in plain words (22 Oct): "Missing documents for 15 work orders: EP27489 affidavit and invoice…".
      const n: AppNotice = { kind, go: kind === "rejection" ? "money" : kind === "award" ? "job" : "board", omo: m.omo, who: m.from || "", title: emailTitle(kind, m.from || "", m.omo, !!m.replied, m.subject), text: (m.text ? summarizeHpd({ kind, subject: m.subject, text: m.text, omo: m.omo }) : m.subject).slice(0, 160) };
      // A new award says where and what (23 Oct): "You won ER… · <address>" with the work in plain words.
      if (kind === "award" && m.omo) { const j = jobs.find((x) => jobId(x) === m.omo); if (j) { n.title = `💰 You won ${m.omo} · ${jobAddress(j).replace(/,\s*\d{5}$/, "")}`; const sum = jobSummary(jobScope(j)); n.text = (sum.lines.length ? sum.lines.map(lineText).join(", ") : jobScope(j).replace(/\s+/g, " ").slice(0, 120)); } }
      addToLog(n);
      last = { ...n, at: Date.now() };
    }
    if (last) { setPing(last); ring(last); }
  };
  const setHpdPing = (p: null) => { if (!p) setPing(null); };
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<AppNotice>).detail;
      if (!n?.title) return;
      setOrbTap(true); window.setTimeout(() => setOrbTap(false), 1500);
      if (/✅|finished|\bwon\b|award|paid|confirmed/i.test(n.title)) { setOrbHappy(true); window.setTimeout(() => setOrbHappy(false), 9000); window.setTimeout(() => moodSound("happy"), 1800); }
      addToLog(n);
      ring(n);
      // Overdue notices and failed faxes can't be missed (owner, 21 Oct: "better visual and sound alerts").
      // (Test browsers get it only when a test asks: real overdue notices would cover every other test.)
      const testing = navigator.webdriver && (() => { try { return localStorage.getItem("hpd-test-critical") !== "1"; } catch { return true; } })();
      if ((n.kind === "urgent" || n.kind === "fax-bad") && !snoozed(n) && !testing) { setCritical({ ...n, at: Date.now(), rings: 1 }); return; }
      // 😄 A little personality (owner's pick, 4 Nov): a high five for a win, a cheer at the 1st, 5th and 10th bid of the day.
      const cheer = (() => {
        if (/\bwon\b|award/i.test(n.title)) return "🙌 High five! ";
        if (!/^Bid fax went through/.test(n.title)) return "";
        try {
          const day = nyToday();
          const c = JSON.parse(localStorage.getItem("hpd-bid-cheer") || "{}");
          const count = c.day === day ? Number(c.n || 0) + 1 : 1;
          localStorage.setItem("hpd-bid-cheer", JSON.stringify({ day, n: count }));
          if (count === 1 || count === 5 || count === 10 || count === 20) { setOrbHappy(true); window.setTimeout(() => setOrbHappy(false), 9000); return count === 1 ? "💪 First bid of the day is in! " : count === 5 ? "👏 5 bids sent today! " : count === 10 ? "🔥 10 bids! You're on fire! " : "🏆 20 bids today! "; }
        } catch { /* private mode */ }
        return "";
      })();
      if (cheer) { setOrbSay({ text: cheer.trim(), full: `${cheer}${n.title}.`, at: Date.now() }); setPing({ ...n, at: Date.now() }); return; }
      { const short = n.title.replace(/\s+/g, " ").trim(); setOrbSay({ text: short.length > 48 ? `${short.slice(0, 46).replace(/\s+\S*$/, "")}…` : short, full: n.text ? `${n.title}. ${n.text}` : n.title, at: Date.now() }); }
      setPing({ ...n, at: Date.now() });
    };
    window.addEventListener("hpd-notify", on);
    // iPhone mutes sound after the app was in the background: every touch unlocks it again.
    const unlock = () => unlockChime();
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("touchend", unlock, { passive: true });
    return () => { window.removeEventListener("hpd-notify", on); document.removeEventListener("pointerdown", unlock); document.removeEventListener("touchend", unlock); };
  }, []);
  const [chimeOff, setChimeOff] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // An alert opens its own job (owner, 21 Oct "next upgrade"): the board scrolled to it, that bid, or the job card.
  const [boardFocus, setBoardFocus] = useState("");
  const [boardAutoReply, setBoardAutoReply] = useState("");
  const [bidsFocus, setBidsFocus] = useState("");
  // Phone alerts by themselves (21 Oct): registered on every open; "Allow alerts" only if the iPhone never allowed them.
  const [allowAlerts, setAllowAlerts] = useState("");
  // Alerts that came while the app was closed (22 Oct, voice alerts): a locked iPhone can't speak, so the app offers to
  // read them out on one tap when it opens (the phone keeps them: public/sw.js "/missed"). They go in 🔔 too.
  type Missed = { title: string; body: string; kind: string; url: string; at: string };
  const [missed, setMissed] = useState<Missed[]>([]);
  const missedLogged = useRef(new Set<string>());
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible" || typeof caches === "undefined") return;
      void caches.open("hpd-badge").then((c) => c.match("/missed")).then((r) => (r ? r.json() : [])).then((list: Missed[]) => {
        if (!Array.isArray(list) || !list.length) return;
        for (const m of list) if (!missedLogged.current.has(m.at)) { missedLogged.current.add(m.at); addToLog({ kind: kindOf(m.kind), title: m.title, text: m.body }); }
        setMissed(list);
      }).catch(() => {});
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  const clearMissed = () => { setMissed([]); void caches.open("hpd-badge").then((c) => c.delete("/missed")).catch(() => {}); };
  const playMissed = () => {
    unlockChime();
    const n = missed.length;
    const list = missed.slice(-6);
    // Invitations to bid are counted together ("You have 3 new invitations to bid"), the rest one by one.
    const bids = missed.filter((m) => kindOf(m.kind) === "bid").reduce((sum, m) => sum + (Number((/(\d+) new invitations/.exec(m.title) || [])[1]) || 1), 0);
    const others = list.filter((m) => kindOf(m.kind) !== "bid");
    const parts = [...(bids ? [bids > 1 ? `You have ${bids} new invitations to bid.` : "New invitation to bid."] : []), ...others.map((m) => spokenAlert({ kind: kindOf(m.kind), title: m.title, text: m.body }))];
    speak(`${n === 1 ? "One new alert" : `${n} new alerts`}. ${parts.map((p, i) => `${parts.length > 1 ? `${i + 1}. ` : ""}${p}`).join(" ")}`, 150);
    clearMissed();
  };
  useEffect(() => {
    if (navigator.webdriver) return; // test browsers: the Alerts page tests this
    void import("../../lib/push").then(async ({ autoRegisterPush, isHomeScreenApp }) => {
      const r = await autoRegisterPush();
      let later = 0;
      try { later = Number(localStorage.getItem("hpd-allow-alerts-later") || 0); } catch { /* private mode */ }
      if (r === "needs-allow" && (isHomeScreenApp() || !/iPhone|iPad/.test(navigator.userAgent)) && Date.now() - later > 3 * 86400000) setAllowAlerts("ask");
      // An iPhone in Chrome / Safari tab can't get alerts at all: say how, once in a while.
      if (r === "unsupported" && /iPhone|iPad/.test(navigator.userAgent) && !isHomeScreenApp() && Date.now() - later > 3 * 86400000) setAllowAlerts(/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) ? "You're in a Chrome tab. iPhone alerts only work from a Home Screen icon: in Chrome tap Share (⬆ in the address bar, or ⋯ → Share) → Add to Home Screen, then open HPD Field from that icon." : "To get alerts: tap Share → Add to Home Screen, then open HPD Field from that icon.");
    });
  }, []);
  const [notifUnread, setNotifUnread] = useState(0);
  useEffect(() => {
    const count = () => { const n = unreadCount(readLog()); setNotifUnread(n); syncBadge(n); };
    count();
    window.addEventListener("hpd-notify-log", count);
    return () => window.removeEventListener("hpd-notify-log", count);
  }, []);
  const goTo = (go?: string, omo = "") => {
    const job = omo ? findAnyJob(omo.toUpperCase()) : undefined;
    if (go === "bids") { closeScreens("bids"); setBidsFocus(omo.toUpperCase()); setBidsOpen(true); }
    else if (go === "board") { closeScreens("board"); setBoardShow("all"); setBoardFocus(omo.toUpperCase()); setBoardOpen(true); }
    else if ((go === "money" || go === "job") && job) { closeScreens(); setSelectedJob(job); }
    else if (go === "money") { closeScreens("notices"); setFollowFilter("notices"); setNoticeKind("rejected"); setNoticesTab("rejected"); setNoticesOpen(true); }
    else if (go === "job") { closeScreens("board"); setBoardShow("all"); setBoardFocus(omo.toUpperCase()); setBoardOpen(true); }
    else if (go === "requests") { closeScreens(); setWhatsNewOpen(true); void loadWhatsNew(); void loadChangeThreads(); }
  };
  // The phone alert "Claude finished your request" / "needs your answer" opens Your requests (…&requests=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("requests") !== "1") return;
    goTo("requests");
    try { window.history.replaceState(null, "", window.location.pathname); } catch { /* old browser */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 🤖 Claude's progress on your requests comes to you (27 Oct, "keep upgrading"): the list is looked at every 2 minutes
  // while the app is open (one cached read on the status server), and a new step or note pops up like any alert.
  // While a request is open (30 Oct, "live request updates, so I know what's going on in the background"): every 20 s.
  // While Claude is working on one right now (owner, 2 Nov: "I need to know exactly what's going on every second"):
  // every 3 s, so its "Now: …" line and the steps change as it works (reads of the status server are cached there).
  const claudeLiveRef = useRef(false);
  const claudeWorkingRef = useRef(false);
  // Your requests open: refreshed every 15 s so the steps and the bar move while you watch (3 s while Claude works).
  useEffect(() => { if (whatsNewOpen) void loadIdeas(); }, [whatsNewOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!whatsNewOpen) return;
    let last = Date.now();
    const t = window.setInterval(() => { if (document.visibilityState === "visible" && Date.now() - last >= (claudeWorkingRef.current || claudeNowRef.current ? 2500 : 14500)) { last = Date.now(); void loadChangeThreads(); } }, 3000);
    return () => window.clearInterval(t);
  }, [whatsNewOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let last = Date.now();
    const look = () => {
      if (document.visibilityState !== "visible") return;
      const wait = claudeWorkingRef.current || claudeNowRef.current ? 2500 : claudeLiveRef.current ? 19500 : 115000;
      if (Date.now() - last < wait) return;
      last = Date.now();
      void loadChangeThreads();
    };
    const t = window.setInterval(look, 3000);
    document.addEventListener("visibilitychange", look);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", look); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const claudeHeardRef = useRef<string | null>(null);
  const lastIdeasRef = useRef<Idea[]>([]);
  // The "what's Claude doing" answer stays live in the chat: rewritten every 2 s from the last check (not said again),
  // and while it shows the requests are checked at least every 15 s (every 3 s when Claude works, as above).
  const agentLive = agent?.live === "claude";
  useEffect(() => {
    if (!agentLive) return;
    let n = 0;
    const t = window.setInterval(() => {
      if (++n % 7 === 0 && !claudeWorkingRef.current && !claudeNowRef.current && document.visibilityState === "visible") void loadChangeThreads();
      setAgent((a) => (a && a.live === "claude" ? { ...a, reply: claudeStatusText() } : a));
    }, 2000);
    return () => window.clearInterval(t);
  }, [agentLive, changeThreads]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🌧 Heads-up before the weather turns (27 Oct, "the AI should figure it out by itself"): once a day, 6 AM-5 PM, when
  // rain / snow comes during work hours and today's route has roof or outside work, an alert names the job to do first.
  useEffect(() => {
    if (!wxChip || !jobs.length) return;
    const now = nyNow();
    const day = now.iso.slice(0, 10);
    const hour = Number(now.iso.slice(11, 13));
    if (hour < 6 || hour > 17) return;
    try { if (localStorage.getItem("hpd-wx-alert") === day) return; } catch { /* private mode */ }
    void fetchWeather().then((w) => {
      const wet = w ? wetLater(w, now.iso) : null;
      if (!wet) return;
      const outside = todayRouteIds().map((id) => jobs.find((j) => jobId(j) === id)).filter((j): j is JobRecord => Boolean(j) && OUTSIDE_WORK.test(jobScope(j as JobRecord)));
      if (!outside.length) return;
      try { localStorage.setItem("hpd-wx-alert", day); } catch { /* private mode */ }
      const where = jobAddress(outside[0]).replace(/,\s*\d{5}$/, "");
      const n: AppNotice = {
        kind: "weather", go: "job", omo: jobId(outside[0]),
        title: `${wet.word === "Snow" ? "❄️" : "🌧"} ${wet.word} ${wet.now ? "now" : `at ${wet.at}`} · outside work at ${where}${outside.length > 1 ? ` +${outside.length - 1} more` : ""}`,
        text: wet.now ? "Cover the work and the materials; take the after photos once it stops." : "Do the roof and outside jobs first, bring tarps, take the before photos early.",
      };
      addToLog(n);
      ring(n);
      if (!pingNowRef.current) setPing({ ...n, at: Date.now() });
    });
  }, [wxChip, jobs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Another alert on screen (a notice, a fax): Claude's news waits its turn instead of being covered.
  const claudePendingRef = useRef<(AppNotice & { at: number }) | null>(null);
  const pingNowRef = useRef(ping);
  pingNowRef.current = ping;
  const claudeShownRef = useRef<(AppNotice & { at: number }) | null>(null);
  useEffect(() => {
    // Covered by another alert a moment after it appeared: it comes back once that one is gone.
    const shown = claudeShownRef.current;
    if (ping?.kind === "claude") claudeShownRef.current = ping;
    else if (ping && shown && Date.now() - shown.at < 5000) { claudePendingRef.current = shown; claudeShownRef.current = null; }
    else if (ping) claudeShownRef.current = null;
    if (ping || !claudePendingRef.current) return;
    const n = claudePendingRef.current;
    claudePendingRef.current = null;
    const t = window.setTimeout(() => setPing({ ...n, at: Date.now() }), 600);
    return () => window.clearTimeout(t);
  }, [ping]);
  useEffect(() => {
    if (!changeThreads) return;
    const all = changeThreads.flatMap((t) => t.updates.map((u) => ({ t, u }))).sort((a, b) => a.u.at.localeCompare(b.u.at));
    const newest = all.length ? all[all.length - 1].u.at : "";
    let mark = claudeHeardRef.current;
    if (mark === null) {
      try { mark = localStorage.getItem("hpd-claude-heard"); } catch { mark = ""; }
      // First time on this phone: start from now instead of replaying old news.
      if (mark === null) mark = newest;
    }
    const fresh = all.filter((x) => x.u.at > (mark as string) && Date.now() - Date.parse(x.u.at) < 2 * 86400000);
    const next = newest > (mark as string) ? newest : (mark as string);
    claudeHeardRef.current = next;
    try { localStorage.setItem("hpd-claude-heard", next); } catch { /* private mode */ }
    if (!fresh.length) return;
    const last = fresh[fresh.length - 1];
    const n: AppNotice = { kind: "claude", go: "requests", title: `${last.t.status === "Done" ? "✅ Claude finished your request" : last.t.status === "Waiting for you" ? "❓ Claude needs your answer" : `🤖 Claude: ${last.t.status}`}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""}`, text: last.u.text.slice(0, 160) };
    addToLog(n);
    ring(n);
    const shownAt = { ...n, at: Date.now() };
    if (pingNowRef.current) claudePendingRef.current = shownAt; else { claudeShownRef.current = shownAt; setPing(shownAt); }
  }, [changeThreads]);
  useEffect(() => {
    if (!threads) return;
    try {
      const recent = threads.flatMap((t) => t.messages.filter((m) => m.hpd && !m.mine && Date.now() - Date.parse(m.at) < 3 * 86400000).map((m) => ({ key: `${t.id}|${m.at}`, at: m.at, subject: t.subject, omo: t.omos[0] || "", from: senderName(m.from || ""), threadKind: (t as { kind?: string }).kind || "", replied: t.messages.some((x) => x.mine && x.at < m.at), text: m.text || "" })));
      const raw = localStorage.getItem("hpd-seen-thread-msgs");
      const seen = new Set<string>(raw ? JSON.parse(raw) : []);
      const fresh = recent.filter((m) => !seen.has(m.key));
      for (const m of recent) seen.add(m.key);
      localStorage.setItem("hpd-seen-thread-msgs", JSON.stringify([...seen].slice(-800)));
      if (raw && fresh.length) emailAlerts(fresh);
    } catch { /* private mode */ }
  }, [threadsAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setChimeOff(chimeMuted()); }, []);
  const runScan = async () => {
    setScanStatus("Checking your email…");
    try {
      const r = await fetch("/api/drive/hpd-scan", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }) });
      const d = await r.json().catch(() => ({}));
      // Only a real answer counts (an offline page or an error page falls back to the reader's copy, quietly).
      if (!r.ok || !Array.isArray(d.sent) || !Array.isArray(d.received)) {
        // Not signed in, no read access, or Gmail busy: the app's own email reader (every ~10 minutes) is enough.
        const fresh = await reloadConversations();
        if (fresh) { setThreads(fresh.threads); setThreadsAt((fresh as { generatedAt?: string }).generatedAt || ""); }
        const at = (fresh as { generatedAt?: string } | null)?.generatedAt;
        // Nothing came back: signed out, not "up to date" (owner, 22 Oct: "why 0 all").
        setScanStatus(fresh ? `✓ Up to date with your email${at ? ` as of ${new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""} (the app reads it every 10 minutes).` : "🔒 Couldn't open your HPD emails: sign in with Google again (below).");
        return;
      }
      setScan(d);
      // Emails from HPD not seen before on this phone: chime + banner (the first check only remembers what's there).
      try {
        const seenRaw = localStorage.getItem("hpd-seen-hpd-msgs");
        const seen = new Set<string>(seenRaw ? JSON.parse(seenRaw) : []);
        const fresh = (d.received || []).filter((m: ScanMsg & { id?: string }) => m.id && !seen.has(m.id));
        for (const m of d.received || []) if ((m as { id?: string }).id) seen.add((m as { id: string }).id);
        localStorage.setItem("hpd-seen-hpd-msgs", JSON.stringify([...seen].slice(-800)));
        if (seenRaw && fresh.length) emailAlerts(fresh.map((m: ScanMsg) => ({ at: m.at, subject: m.subject, omo: m.omos?.[0] || "" })));
      } catch { /* private mode */ }
      const withFiles = (d.sent || []).filter((m: ScanMsg) => m.files).length;
      setScanStatus(`✓ Checked your email ${new Date(d.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}: ${(d.sent || []).length} sent to HPD (${withFiles} with PDFs), ${(d.received || []).length} from HPD in the last ${d.days} days.`);
    } catch (e) {
      setScanStatus(`Couldn't check your email: ${e instanceof Error ? e.message : "error"}.`);
    }
  };
  const priorities: PriorityItem[] = buildPriorities({
    threads: (boardThreads || []) as unknown as Parameters<typeof buildPriorities>[0]["threads"], // with replies just found
    rejections: openRejections.map((r) => ({ omo: r.omo, at: r.at, reason: r.reason || "", by: senderName(r.by || "HPD") })),
    toPrint, sent: (followRef.current?.sent || {}) as Record<string, { sentAt?: string }>, done: prioDone,
    // Nothing to do on jobs HPD closed or PIP paid.
    closed: closedJobs,
  });
  // While the app is open: check every 5 minutes and when you come back to it (signed in only; quiet when it can't).
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible" && threads) void runScan(); };
    const timer = window.setInterval(tick, 300000);
    const onShow = () => { if (document.visibilityState === "visible" && threads && (!scan || Date.now() - Date.parse(scan.checkedAt) > 120000)) void runScan(); };
    document.addEventListener("visibilitychange", onShow);
    if (threads && !scan) void runScan();
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, [threads === null || threads === undefined ? 0 : 1, scan?.checkedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening the board checks your email by itself (at most every 10 minutes).
  useEffect(() => {
    if (!boardOpen || scanStatus === "Checking your email…") return;
    if (scan && Date.now() - Date.parse(scan.checkedAt) < 600000) return;
    void runScan();
  }, [boardOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // The latest email with PDFs you sent about each job, in any thread (e.g. you sent EP22713's paperwork in its own thread).
  const pdfsByOmo = new Map<string, string>();
  for (const t of boardThreads || []) for (const m of t.messages) if (m.mine && (m.files?.length || 0) > 0) for (const o of t.omos) if ((t.omos.length <= 2 || m.text.includes(o)) && (!pdfsByOmo.has(o) || (pdfsByOmo.get(o) || "") < m.at)) pdfsByOmo.set(o, m.at);
  const boardRows = boardThreads ? buildBoard({ threads: boardThreads, sent: (followRef.current?.sent || {}) as Record<string, { sentAt?: string }>, marks: boardMarks, closed: closedJobs }) : [];
  const boardOpenRows = boardRows.filter((r) => r.next);
  const boardUrgent = urgentRows(boardRows);
  // A notice running out of time rings once (under 6 hours, nothing sent yet).
  useEffect(() => {
    if (!boardUrgent.length) return;
    try {
      const rang = new Set<string>(JSON.parse(localStorage.getItem("hpd-rang-urgent") || "[]"));
      const fresh = boardUrgent.filter((r) => !rang.has(r.key));
      if (!fresh.length) return;
      for (const r of fresh) rang.add(r.key);
      localStorage.setItem("hpd-rang-urgent", JSON.stringify([...rang].slice(-300)));
      const h = Math.max(0, Math.round(hoursLeft(fresh[0], Date.now())));
      notify({ kind: "urgent", go: "board", omo: fresh[0].omo, title: fresh.length === 1 ? `${fresh[0].omo}: ${h <= 0 ? "notice overdue" : `${h} h left on the notice`}` : `${fresh.length} notices under 6 hours`, text: "Nothing sent yet: answer them now" });
    } catch { /* private mode */ }
  }, [boardUrgent.map((r) => r.key).join()]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // Gafur (AEP): the jobs on her missing-documents lists still open.
    aep: new Set(boardOpenRows.filter((r) => r.kind === "docs").map((r) => r.omo)),
  };
  noticeSets.all = new Set([...noticeSets.priority, ...noticeSets.rejected, ...noticeSets.corrections, ...noticeSets.print]);
  const noticeSetKey = noticeKind ? [...noticeSets[noticeKind]].sort().join(",") : "";
  const NOTICE_KINDS = [
    { key: "all", icon: "📩", short: "All notices", title: "All notices", note: "Everything on the map at once" },
    { key: "priority", icon: "🔥", short: "Priority", title: "Priority · vendor tracking", note: "Lewis / Gafur want the affidavit, invoice or an update" },
    { key: "rejected", icon: "💵", short: "Payment rejected", title: "Payment rejected", note: "Procurement rejected the invoice / affidavit: fix & resend" },
    { key: "corrections", icon: "✏️", short: "Corrections", title: "Corrections", note: "HPD staff asked you to correct paperwork" },
    { key: "aep", icon: "📋", short: "Gafur · AEP", title: "Gafur · AEP missing documents", note: "Her list: affidavit, invoice, photos, updates" },
    { key: "print", icon: "🖨", short: "Print & mail", title: "Print & mail", note: "Fixed paperwork to sign in ink and mail" },
  ] as const;
  // Earliest Priority item per job (24-hour before 72-hour before missing documents).
  const prioByOmo = new Map<string, PriorityItem>();
  for (const it of vendorTodo) if (!prioByOmo.has(it.omo)) prioByOmo.set(it.omo, it);
  const glow = new Map<string, { tag: string; cls: string }>();
  if (followFilter === "notices" && noticeKind) {
    for (const omo of noticeSets[noticeKind]) {
      const kind = noticeKind !== "all" ? noticeKind
        : noticeSets.priority.has(omo) ? "priority" : noticeSets.aep.has(omo) ? "aep" : noticeSets.rejected.has(omo) ? "rejected" : noticeSets.corrections.has(omo) ? "corrections" : "print";
      const it = prioByOmo.get(omo);
      const due = it ? dueText(it.dueAt) : "";
      const tag = kind === "priority"
        ? (it ? (it.kind === "missing" ? "🔥 Docs" : `🔥 ${it.kind === "24h" ? "24h" : "72h"} · ${due.replace(" left", "").replace("overdue ", "-")}`) : "🔥 Asked")
        : kind === "aep" ? "📋 Docs" : kind === "rejected" ? (heldBy.get(omo) ? `💵 ${money(heldBy.get(omo) || 0)}` : "💵 Fix") : kind === "corrections" ? "✏️ Fix" : "🖨 Mail";
      glow.set(omo, { tag, cls: `is-glow is-glow-${kind}${kind === "priority" && it?.kind === "24h" ? " is-glow-24h" : ""}${kind === "priority" && /overdue/.test(due) ? " is-glow-late" : ""}` });
    }
  }
  // Calm map (owner, 21 Oct: "everything glowing at once is hard to concentrate"): the others stay still; only the
  // most urgent one -- overdue first, then the earliest deadline -- breathes slowly.
  const topGlow = [...glow.keys()].map((omo) => ({ omo, it: prioByOmo.get(omo) })).filter((x) => x.it?.dueAt).sort((a, b) => Date.parse(a.it!.dueAt) - Date.parse(b.it!.dueAt))[0]?.omo;
  if (topGlow) { const g = glow.get(topGlow)!; glow.set(topGlow, { ...g, cls: `${g.cls} is-glow-top` }); }
  // 👉 The job that needs you now glows on the map (27 Oct, "pulse on the pin that needs you"): the one the Next pill
  // (or the urgent notice) points at, when no notice filter is on.
  if (!glow.size && nextOmoRef.current && !selectedJob) glow.set(nextOmoRef.current, { tag: "👉 Next", cls: "is-glow is-glow-next is-glow-top" });
  glowRef.current = glow;
  const glowKey = [...glow].map(([o, g]) => `${o}:${g.tag}:${g.cls}`).join("|");
  // Narrow the map to one kind; the picker stays so you can switch like the other filters.
  const pickNotices = (kind: NoticeKind) => {
    setSelectedJob(null);
    setFollowFilter("notices");
    setNoticeKind(kind);
    if (kind && kind !== "all" && kind !== "aep") setNoticesTab(kind);
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
    if (jobsOpen && jobsShown) { const ids = new Set(jobsShown.ids); return jobs.filter((job) => ids.has(jobId(job))); }
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
  }, [jobs, borough, status, search, daysBack, dateRange, calendarDate, openJobKey, followFilter, followUps, followReport, showOlderLayer, olderLayer, olderJobs, openRejections, noticeKind, noticeSetKey, jobsOpen, jobsShown]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Glide in to the job (owner, 23 Oct: "zoom into the job when I click, looks nice, and zoom back to the map").
    const zoom = Math.max(map.getZoom(), minZoom);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Slower and smoother (owner, 27 Oct: "a little bit of a delay so it looks nice, the app feels premium"); with
    // Reduce Motion on, a short plain zoom instead of a jump.
    // Even slower (owner, 27 Oct: "slow zoom so I can see the interaction"): 2.4 s in, 2.2 s back out.
    const flying = !reduce && Boolean(map.flyTo) && map.getCenter().distanceTo([lat, lng]) > 5;
    if (flying) map.flyTo([lat, lng], zoom, { duration: 2.4, easeLinearity: 0.1 });
    else map.setView([lat, lng], zoom, { animate: true });
    // Measure once the card is laid out, and again after its slide-up animation (and the glide) settle.
    const place = () => {
      if (!mapRef.current) return;
      const container = map.getContainer().getBoundingClientRect();
      const cardTop = document.querySelector("#fc-job-card")?.getBoundingClientRect().top ?? container.bottom;
      const searchBottom = document.querySelector(".fc-search-row")?.getBoundingClientRect().bottom ?? container.top;
      const target = (Math.max(searchBottom, container.top) + Math.min(cardTop, container.bottom)) / 2 - container.top;
      const pin = map.latLngToContainerPoint([lat, lng]);
      if (Math.abs(pin.y - target) > 4) map.panBy([0, Math.round(pin.y - target)], { animate: flying, duration: 0.6 });
    };
    // While gliding, a jump in the middle would cut the glide short: the pin settles above the card once it lands.
    if (flying) { map.once("moveend", () => window.setTimeout(place, 60)); window.setTimeout(place, 3200); }
    else { window.setTimeout(place, 200); window.setTimeout(place, 1600); }
  }
  // The view before a card opened: closing the card puts the map back there, so the other
  // jobs are right where they were. Every job opens zoomed in to its building (23 Oct).
  const viewBeforeCardRef = useRef<{ center: [number, number]; zoom: number; follow: boolean } | null>(null);
  const pinTapRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!openJobKey) {
      const before = viewBeforeCardRef.current;
      viewBeforeCardRef.current = null;
      if (before && map) {
        // Glide back out to where you were.
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (!reduce && map.flyTo) map.flyTo(before.center, before.zoom, { duration: 2.2, easeLinearity: 0.1 }); else map.setView(before.center, before.zoom, { animate: true });
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
    if (at) showJobAboveCard(at.lat, at.lng, 17);
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
        const { commit, code } = await response.json() as { commit?: string; code?: string };
        if (!commit || stopped) return;
        // The version this app was built as; older builds didn't carry it, so they learn it here.
        if (!appVersionRef.current) appVersionRef.current = BUILT_COMMIT || commit;
        setAppVersion(appVersionRef.current);
        if (commit === appVersionRef.current) return;
        // Only the data changed (the fetcher deploys every ~10 minutes): no reload, the app reads new data by itself.
        if (code && BUILT_CODE && code === BUILT_CODE) return;
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
  jobsOpenRef.current = jobsOpen;
  jobsShownRef.current = jobsShown;
  jobsMiniRef.current = jobsMini;
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
  // Jobs button (owner, 21 Oct): every open job -- to do, ready to close out, 2nd tries. (State is up top: the map uses it.)
  const jobRows = useMemo<JobRow[]>(() => {
    const closeIds = new Set(closeOutJobs.map((j) => jobId(j)));
    const secondIds = new Map(secondTryJobs.map((r) => [jobId(r.job), r.second]));
    // Close out / 2nd try always count (HPD can close a job before the paperwork goes in); for To do / Waiting, jobs HPD
    // closed or PIP paid are left out.
    return jobs.filter((job) => !isTestJob(jobId(job)) && jobQueue(job) !== "archived" && (closeIds.has(jobId(job)) || secondIds.has(jobId(job)) || (!closedJobs.has(jobId(job)) && !["done", "others", "noaccess", "refused"].includes(pinStyle(job).key)))).map((job) => {
      const id = jobId(job);
      const st = pinStyle(job);
      const second = secondIds.get(id);
      const sentAt = (followRef.current?.sent?.[id] as { sentAt?: string } | undefined)?.sentAt || "";
      const group: JobRow["group"] = closeIds.has(id) ? "closeout" : second ? "secondtry" : sentAt ? "waiting" : "todo";
      return { id, address: jobAddress(job), borough: String(jobBorough(job)), status: st.label, color: st.color, due: String(value(job, ["WorkCompletionDate", "MaturityDate"]) || ""), award: String(value(job, ["AwardDate"]) || ""), group,
        note: group === "waiting" ? `Paperwork sent ${sentAt} · waiting on HPD` : group === "closeout" ? `${FIELD_OUTCOMES[value(job, ["FieldOutcome", "fieldOutcome"])] || "Visit saved"} · package not sent` : second ? `2nd try ${second.due ? "due now" : `from ${second.dueLabel}`} · 1st try ${second.firstLabel}` : undefined,
        packageHref: group === "closeout" ? paperworkGenerateHref(id, value(job, ["FieldOutcome", "fieldOutcome"])) : undefined, due2nd: !!second?.due,
        contact: (() => { const t = tenantInfo(job); const cs = tenantContactState(job as Record<string, unknown>, t.commonArea); return { tone: cs.tone, tries: cs.tries, phone: !!t.phone, lastAt: cs.lastAt, triesToday: cs.triesToday, reachedToday: cs.reachedToday }; })() };
    });
  }, [jobs, closeOutJobs, secondTryJobs, [...closedJobs].join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🏆 The helper cheers when the day's work is done (owner's pick, 3 Nov): every bid due today sent, or no job left to do.
  const cheerRef = useRef<{ bids: number; todo: number; day: string }>({ bids: -1, todo: -1, day: "" });
  const todoNow = jobRows.filter((r) => r.group === "todo").length;
  useEffect(() => {
    const day = nyToday();
    const c = cheerRef.current;
    if (c.day !== day) { cheerRef.current = { bids: bidsDue.unsentToday || 0, todo: todoNow, day }; return; }
    const lines: string[] = [];
    if (c.bids > 0 && !(bidsDue.unsentToday || 0)) lines.push("Every bid due today is sent!");
    if (c.todo > 0 && todoNow === 0) lines.push("All of today's jobs are done!");
    cheerRef.current = { bids: bidsDue.unsentToday || 0, todo: todoNow, day };
    if (!lines.length) return;
    setOrbHappy(true); window.setTimeout(() => setOrbHappy(false), 9000);
    moodSound("happy");
    window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "claude", title: `🎉 ${lines.join(" ")}`, text: "Great work today." } }));
  }, [bidsDue.unsentToday, todoNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobsTodo = jobRows.filter((r) => r.group === "todo").length;
  // The bottom buttons glow when something there needs you now (owner, 2 Nov: "bids, notices, jobs: glowing a little so I
  // know to pay attention"): a 2nd try due or a job ready to close out (same as the red Jobs badge); a bid due today not
  // sent; a notice overdue or under 6 hours. Nothing waiting: no glow.
  const jobsNeedYou = secondTryJobs.some((r) => r.second.due) || closeOutJobs.length > 0;
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
  // 🧭 Job tracker: every job's stage from award to payment (lib/job-tracker.ts), worked out while it's open.
  const [trackerOpen, setTrackerOpen] = useState(false);
  const trackerRows = useMemo<TrackerRow[]>(() => {
    if (!trackerOpen) return [];
    const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
    const md = (iso: string) => { const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : ""; };
    return jobs.filter((j) => !isTestJob(jobId(j)) && jobQueue(j) !== "archived").map((j) => {
      const id = jobId(j);
      const fu = followUps.get(id);
      const pay = pipMap[id];
      const ts = tenantStep(j as Record<string, unknown>);
      const appt = activeAppointment(j as Record<string, unknown>);
      const input = { id, outcome: value(j, ["FieldOutcome", "fieldOutcome"]), arrived: Boolean(value(j, ["FieldArrivedAt"])), appointment: Boolean(appt), tenantStep: ts.state,
        approved: Boolean(value(j, ["PackageApprovedAt"])) || /approved/i.test(value(j, ["PackageReviewStatus"])), followState: fu?.state || "", sentAt: fu?.sentAt || "",
        paid: pay?.paid || 0, outstanding: pay?.outstanding || 0, inPip: Boolean(pay),
        awardAgeDays: (() => { const t = Date.parse(String(value(j, ["AwardDate"]) || "")); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 0; })() };
      const stage = trackerStage(input);
      const note = stage === "waiting" || stage === "book" ? (ts.textedAt ? `texted ${md(ts.textedAt)}${ts.repliedAt ? ", replied" : ""}` : "")
        : stage === "appointment" && appt ? appointmentLabel(appt)
        : stage === "sent" && fu?.sentAt ? `sent ${md(fu.sentAt)}`
        : stage === "payment" ? (pay?.outstanding ? `${usd(pay.outstanding)} owed` : "not in PIP yet")
        : stage === "paid" && pay ? usd(pay.paid)
        : stage === "closed" ? (fu?.hpdReason ? fu.hpdReason.toLowerCase() : "closed")
        : stage === "text" ? (value(j, ["AwardDate"]) ? `awarded ${md(value(j, ["AwardDate"]))}` : "") : "";
      return { id, address: jobAddress(j).replace(/,\s*\d{5}$/, ""), stage, note, age: input.awardAgeDays };
    });
  }, [trackerOpen, jobs, followUps, pipMap]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (keep !== "jobs") setJobsOpen(false);
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

  function openIssueJob(job: JobRecord, glide = false) {
    setCloseOutOpen(false);
    setDataCheckOpen(false);
    setSelectedJob(job);
    setSheetExpanded(false);
    const at = jobLatLng(job);
    if (at && mapRef.current) {
      followMeRef.current = false;
      const zoom = Math.max(mapRef.current.getZoom(), 16);
      // Glide: zooms out and back in, so you see where the next one is.
      if (glide && mapRef.current.flyTo) mapRef.current.flyTo([at.lat, at.lng], zoom, { duration: 2, easeLinearity: 0.1 }); else mapRef.current.setView([at.lat, at.lng], zoom);
    }
  }

  useEffect(() => {
    if (!jobs.length || requestedJobLoaded.current) return;
    requestedJobLoaded.current = true;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("board") === "1" || params.get("bids") === "1" ? "" : (params.get("omo") || params.get("job") || params.get("q") || "").trim().toUpperCase();
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

  // How many jobs each day window has (owner, 23 Oct: "I want to see the number of jobs I have when I choose 15 days"),
  // with the status and borough picked now, on the date type picked now. Counted only while the menu is open.
  const dayCounts = useMemo(() => {
    if (!daysMenuOpen) return {} as Partial<Record<QuickDateKey, number>>;
    // The same rules as the map (filteredJobs): jobs you're working and jobs due now always show.
    const q = search.trim().toLowerCase();
    const out: Partial<Record<QuickDateKey, number>> = {};
    for (const { key } of QUICK_DATE_RANGES) {
      const b = key === "year" && dateRange.field === "award" ? currentYearRange() : { field: dateRange.field, ...quickDateBounds(key, calendarDate) };
      out[key] = jobs.filter((job) => {
        if (jobId(job) === openJobKey || (workedToday(job) && jobQueue(job) !== "archived")) return true;
        const isTheTestJob = jobId(job) === TEST_JOB_ID;
        if (!dueOnMap(job) && !isTheTestJob && (!matchesJobQueue(job, status) || !matchesJobDateRange(job, dateRange.field, b.from, b.to))) return false;
        if (borough !== "ALL" && jobBorough(job) !== borough && !isTheTestJob) return false;
        return !q || [jobId(job), jobAddress(job), jobBorough(job), jobStatus(job)].join(" ").toLowerCase().includes(q);
      }).length;
    }
    return out;
  }, [daysMenuOpen, jobs, status, borough, search, dateRange.field, calendarDate, openJobKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // While you drag the map, the bottom buttons slide away so you see the whole map; they come back when you let go.
        let dockBack = 0;
        map.on("dragstart", () => { window.clearTimeout(dockBack); map.getContainer().closest(".fc-app")?.classList.add("fc-map-dragging"); });
        map.on("dragend", () => { window.clearTimeout(dockBack); dockBack = window.setTimeout(() => map.getContainer().closest(".fc-app")?.classList.remove("fc-map-dragging"), 450); });
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
      const framing = `${borough}|${search}|${followFilter === "notices" ? `notices-${noticeKind}` : ""}|${showOlderLayer ? "older" : ""}|${jobsOpenRef.current && jobsShownRef.current ? `jobs-${jobsShownRef.current.key}-${jobsMiniRef.current ? "mini" : ""}` : ""}`;
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
        } else if (points.length > 1 && jobsOpenRef.current && jobsShownRef.current) {
          // The Jobs list covers the lower half (or a bar when folded): frame the jobs in the map above it.
          map.fitBounds(points.map((p) => [p.lat, p.lng]) as [number, number][], { paddingTopLeft: [20, 120], paddingBottomRight: [70, jobsMiniRef.current ? 170 : Math.round(window.innerHeight * 0.52) + 30], maxZoom: 15 });
        } else if (points.length > 1 && borough === "ALL" && !search.trim() && followFilter !== "notices" && !showOlderLayer) {
          // Back to All: return to you, never to a fixed point in the city.
          const me = lastPositionRef.current;
          if (me) { followMeRef.current = true; map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15)); }
          // No location (not allowed / no signal): show all the jobs instead of staying zoomed on the last one.
          else map.fitBounds(points.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [40, 40], maxZoom: 15 });
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
  }, [filteredJobs, borough, search, status, daysBack, dateRange, followFilter, showOlderLayer, jobsMini]);

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
        fastRef.current = (position.coords.speed || 0) > 6.7 ? fastRef.current + 1 : 0;
        if (fastRef.current >= 2) setMovingFast(true);
        autoArriveRef.current(latitude, longitude, position.coords.accuracy || 0);
        nearJobRef.current(latitude, longitude, position.coords.accuracy || 0);
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

  // "Have you arrived?" (owner, 22 Oct: "even if I use Google or Waze it should know I arrived, or ask me, then we start
  // the job"): with the app open and no job card up, being within ~120 m of a stop on Today's route or a job you
  // navigated to today asks once per job; Yes opens the job and saves the arrival (time + GPS). Never saved silently.
  const [arrivePrompt, setArrivePrompt] = useState<{ id: string; address: string; feet: number } | null>(null);
  // ☀️ Start my day (23 Oct): the first open of the morning (5 to 11 AM, New York) offers one tap that reads the day out
  // loud and plans the route. Once a day; "Not today" hides it. (Test browsers only when a test asks.)
  const [morning, setMorning] = useState(false);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const testing = navigator.webdriver && (() => { try { return localStorage.getItem("hpd-test-morning") !== "1"; } catch { return true; } })();
      if (testing) return;
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
      const today = `${p.year}-${p.month}-${p.day}`;
      const hour = Number(p.hour);
      let shown = "";
      try { shown = localStorage.getItem("hpd-morning-shown") || ""; } catch { /* private mode */ }
      if (hour >= 5 && hour < 11 && shown !== today) setMorning(true);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  // 🌆 Wrap up the day (23 Oct): 5 to 9 PM, once a day, one tap says how today went and the bids coming up.
  const [evening, setEvening] = useState(false);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const testing = navigator.webdriver && (() => { try { return localStorage.getItem("hpd-test-evening") !== "1"; } catch { return true; } })();
      if (testing) return;
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
      const today = `${p.year}-${p.month}-${p.day}`;
      let shown = "";
      try { shown = localStorage.getItem("hpd-evening-shown") || ""; } catch { /* private mode */ }
      if (Number(p.hour) >= 17 && Number(p.hour) < 21 && shown !== today) setEvening(true);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  const doneEvening = () => { setEvening(false); try { localStorage.setItem("hpd-evening-shown", new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())); } catch { /* private mode */ } };
  const doneMorning = () => { setMorning(false); try { localStorage.setItem("hpd-morning-shown", new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())); } catch { /* private mode */ } };
  const askedArriveRef = useRef<Set<string>>(new Set());
  const nearJobRef = useRef<(lat: number, lng: number, accuracy: number) => void>(() => {});
  nearJobRef.current = (lat, lng, accuracy) => {
    if (selectedJob || arrivePrompt || accuracy > 150) return;
    const today = new Date().toDateString();
    const route = new Set(todayRouteIds());
    let best: { job: JobRecord; meters: number } | null = null;
    for (const job of jobs) {
      const id = jobId(job);
      if (askedArriveRef.current.has(id) || workflowStamps[id]?.arrived || value(job, ["FieldArrivedAt"]) || !["pending", "followup"].includes(jobQueue(job))) continue; // to do or a 2nd try
      const travel = value(job, ["TravelStartedAt"]);
      if (!route.has(id) && !(travel && new Date(travel).toDateString() === today)) continue;
      const at = jobLatLng(job);
      if (!at) continue;
      const meters = distanceMiles({ lat, lng }, at) * 1609.34;
      if (meters <= 120 && (!best || meters < best.meters)) best = { job, meters };
    }
    if (!best) return;
    askedArriveRef.current.add(jobId(best.job));
    setArrivePrompt({ id: jobId(best.job), address: jobAddress(best.job), feet: Math.round(best.meters * 3.28) });
    ring({ kind: "message", title: `📍 You're at ${jobAddress(best.job)}`, text: "Have you arrived? Tap Yes to start the job." }); // tone + voice only: the green card is the one place it shows
  };

  // 📱 Text the tenant: a ready text at once, the AI's version when it answers (the owner sends it from Messages).
  // The job in a few plain words, for the tenant (and for the log of what was sent).
  function tenantJobWords(job: JobRecord) {
    const sum = jobSummary(jobScope(job));
    return tenantJobSummary(sum.lines.length ? sum.lines.map(lineText).join(", ") : jobScope(job).replace(/\s+/g, " ").split(/(?<=\.)\s/)[0].slice(0, 120));
  }
  function openTenantText(job: JobRecord) {
    const t = tenantInfo(job);
    const jobWords = tenantJobWords(job);
    const ready = tenantTextDraft({ name: t.name, address: jobAddress(job), apt: t.apt, job: jobWords, omo: jobId(job) });
    const id = jobId(job);
    setTenantText({ id, text: ready, ai: "✨ Writing it with AI…", at: Date.now() });
    void fetch("/api/drive/hpd-ask", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      question: "Write one short, professional text message (SMS, under 320 characters, no emojis, no markdown) from Jot at United Angel Construction to the tenant: we are the contractor NYC HPD assigned to the repair; give the HPD work order number; say the work in a short plain summary (not every detail); ask for a good day and time to come; ask them to reply or call this number. Use their first name if given. Return only the message.",
      facts: { tenantFirstName: (t.name || "").split(/\s+/)[0] || null, address: jobAddress(job).replace(/,\s*\d{5}$/, ""), apartment: t.apt || null, hpdWorkOrder: jobId(job), job: jobWords, company: "United Angel Construction" },
    }) }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })).then(({ status, d }) => {
      const text = String(d?.text || "").replace(/^"|"$/g, "").trim();
      setTenantText((cur) => (cur && cur.id === id ? (d?.ai && text && text.length <= 480 ? { ...cur, text, ai: "✨ Written by AI. Read it, change anything, then open it in Messages and press Send there." } : { ...cur, ai: status === 401 ? "Ready text below. Sign in with Google on this phone and the AI writes it next time." : "" }) : cur));
    }).catch(() => setTenantText((cur) => (cur && cur.id === id ? { ...cur, ai: "" } : cur)));
  }
  // The evening-before reminder text for an appointment, and noting it on the job so it isn't offered again (27 Oct).
  function reminderText(job: JobRecord, a: Appointment, day: "today" | "tomorrow" = "tomorrow") {
    const raw = (tenantInfo(job).name || "").split(/\s+/)[0];
    const hi = raw && raw.length > 1 ? `Hi ${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "Hello";
    return `${hi}, this is Jot from United Angel Construction. Reminder: we will see you ${day} ${appointmentLabel(a).split(" · ")[1]} at ${jobAddress(job).replace(/,\s*\d{5}$/, "")} for the HPD repair. Reply YES to confirm, or tell us a better time.`;
  }
  function markReminderSent(job: JobRecord, date: string) {
    const id = jobId(job), patch = { ApptReminderSentFor: date, FieldVisitHistory: visitHistoryWith(job, "Texted the tenant a reminder for the appointment", null) };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
  }
  function needsReminder(job: JobRecord, a: Appointment | null): a is Appointment {
    return Boolean(a && appointmentTiming(a).days === 1 && tenantInfo(job).phone && value(job, ["ApptReminderSentFor"]) !== a.date && !value(job, ["FieldArrivedAt"]));
  }
  // text: what went (logged as its kind: job summary, on the way, running late, ...; 30 Oct).
  function markTenantTexted(job: JobRecord, text = "") {
    const id = jobId(job);
    const patch = { TenantTextedAt: new Date().toISOString(), TenantRepliedAt: "", FieldVisitHistory: visitHistoryWith(job, tenantTextLogNote(text, tenantJobWords(job)), null) };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
    // Close the text box that was open when it went (not one opened in the meantime).
    const sentAt = Date.now();
    window.setTimeout(() => setTenantText((cur) => (cur && (cur.at || 0) <= sentAt ? null : cur)), 800);
  }
  // 📞 The call is written on the job the moment Call is tapped (29 Oct), so it stays even with no answer; how it went
  // (talked / no answer / voicemail) then takes its place.
  function startTenantCall(job: JobRecord) {
    const id = jobId(job);
    noteCallStarted(id);
    const patch = { TenantCalledAt: new Date().toISOString(), FieldVisitHistory: visitHistoryWith(job, "Called the tenant", null) };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
  }
  function markTenantReplied(job: JobRecord) {
    const id = jobId(job);
    const patch = { TenantRepliedAt: new Date().toISOString(), FieldVisitHistory: visitHistoryWith(job, "The tenant replied", null) };
    try { writeSharedWorkflowPatch(id, patch); } catch {}
    mergeWorkflowPatchIntoScreen(id, patch);
  }
  // 📱 The text service (Twilio, server/tenant-sms.mjs): when it's set up, texts go from the business number right from
  // the app (two taps) and the tenants' replies come back here. Not set up: Messages on the phone, as before.
  const [smsReady, setSmsReady] = useState(false);
  const [smsSend, setSmsSend] = useState<{ id: string; armed: boolean; status: string } | null>(null);
  const [aiReady, setAiReady] = useState(false);
  useEffect(() => { void fetch("/api/drive/session", { cache: "no-store" }).then((r) => r.json()).then((d) => { setSmsReady(Boolean(d?.smsReady && d?.connected)); setAiReady(Boolean(d?.aiReady && d?.connected)); }).catch(() => {}); }, []);
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  // One text from the business number; marks the job texted when it goes. Returns what to show / say.
  // confirm: the appointment confirmation (it doesn't restart the "waiting for an answer" clock).
  async function smsNow(job: JobRecord, text: string, confirm = false): Promise<{ sent: boolean; message: string }> {
    try {
      const r = await fetch("/api/drive/tenant-sms", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: tenantInfo(job).phone, text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sent) throw new Error(d.reason || d.error || `HTTP ${r.status}`);
      if (confirm) { const id = jobId(job); const patch = { TenantConfirmedAt: new Date().toISOString(), FieldVisitHistory: visitHistoryWith(job, "Texted the tenant the appointment", null) }; try { writeSharedWorkflowPatch(id, patch); } catch {} mergeWorkflowPatchIntoScreen(id, patch); }
      else markTenantTexted(job, text);
      return { sent: true, message: `✓ Sent to ${d.to}. Their answer comes back here.` };
    } catch (e) {
      return { sent: false, message: `Not sent: ${e instanceof Error ? e.message : "error"}` };
    }
  }
  async function sendTenantSms(job: JobRecord, text: string) {
    const id = jobId(job);
    if (!smsSend || smsSend.id !== id || !smsSend.armed) { setSmsSend({ id, armed: true, status: "" }); return; }
    setSmsSend({ id, armed: false, status: "Sending…" });
    const r = await smsNow(job, text);
    setSmsSend({ id, armed: false, status: r.message });
  }
  // A text the helper read out, waiting for your yes (text the tenant by voice with the text service on).
  const pendingSmsRef = useRef<{ id: string; text: string } | null>(null);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  // 🗺 The helper rides along (owner's pick, 3 Nov): with a route for today, a little 🤖 travels on the map from where
  // you are to the next stop not done yet (or bobs at that stop when the phone's location is off), again and again.
  // 🚶 The robot walks to the job it's talking about (owner's pick, 4 Nov): a little robot steps out at the bottom of the
  // map, walks over to the pin and waves there for a few seconds (read it to me, take me there).
  const robotWalkRef = useRef<(omo: string) => void>(() => {});
  useEffect(() => {
    let marker: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    let timer = 0;
    let raf = 0;
    robotWalkRef.current = (omo: string) => {
      const map = mapRef.current;
      const j = jobsRef.current.find((x) => jobId(x) === omo);
      const to = j ? jobLatLng(j) : null;
      if (!map || !to) return;
      void import("leaflet").then((leafletModule) => {
        const L = (leafletModule as any).default || leafletModule; // eslint-disable-line @typescript-eslint/no-explicit-any
        marker?.remove(); window.clearTimeout(timer); window.cancelAnimationFrame(raf);
        const size = map.getSize();
        const from = map.containerPointToLatLng([size.x / 2, Math.max(80, size.y - 170)]);
        marker = L.marker(from, { icon: L.divIcon({ className: "fc-walk-marker", html: `<div class="fc-walk-bot is-walking" data-hpd-smoke="fc-walk-bot" data-omo="${omo}">${helperFaceHtml(getHelperLook().color, 34)}<i class="fc-walk-legs"><b></b><b></b></i></div>`, iconSize: [38, 50], iconAnchor: [19, 92] }), interactive: false, zIndexOffset: 2600 }).addTo(map);
        const t0 = performance.now();
        const dur = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 1700;
        const step = (now: number) => {
          const f = dur ? Math.min(1, (now - t0) / dur) : 1;
          const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
          marker?.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
          if (f < 1) { raf = window.requestAnimationFrame(step); return; }
          const el = marker?.getElement()?.querySelector(".fc-walk-bot");
          el?.classList.remove("is-walking"); el?.classList.add("is-there");
          timer = window.setTimeout(() => { marker?.remove(); marker = null; }, 5000);
        };
        raf = window.requestAnimationFrame(step);
      });
    };
    return () => { marker?.remove(); window.clearTimeout(timer); window.cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 👋 Hello when the app opens (owner's pick, 4 Nov): once every 3 hours, the robot says hi in its bubble with what's
  // waiting (silent: phones don't let a page talk before a tap). Tap the bubble to talk.
  // ❓ When Claude asks you something, the robot says so in its bubble (owner, 4 Nov: "I see Claude with a question
  // mark on the bottom. Why?"), once per question.
  // 🎯 Today's goal ring around the 🤖 (owner's pick, 4 Nov): today's bids, filling up as each one is faxed.
  const goal = { total: (bidsDue.sentToday || 0) + (bidsDue.unsentToday || 0), sent: bidsDue.sentToday || 0 };
  // 💡 One tip a day (owner's pick, 4 Nov): a finding from your own numbers in the robot's bubble, 7 AM-8 PM, once.
  useEffect(() => {
    if (!jobs.length) return;
    const t = window.setTimeout(() => {
      const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      const today = nyToday();
      try {
        if (navigator.webdriver && localStorage.getItem("hpd-test-tip") !== "1") return;
        if (h < 7 || h >= 20 || localStorage.getItem("hpd-tip-day") === today) return;
      } catch { return; }
      const wins = jobs.filter((j) => value(j, ["AwardDate"]) && !isTestJob(jobId(j))).map((j) => { const d = new Date(String(value(j, ["AwardDate"]))); const first = jobSummary(jobScope(j)).lines[0]; return { kind: (first ? lineText(first) : "Other work").split(/[·(,]/)[0].trim().slice(0, 30) || "Other work", amount: Number(String(value(j, ["AwardAmount"]) || "").replace(/[^0-9.]/g, "")) || 0, date: Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d) }; }).filter((w) => w.date);
      let recs: { sentAt?: string }[] = [];
      try { recs = Object.values(JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}")); } catch { /* private mode */ }
      const ago = (r: { sentAt?: string }) => (r.sentAt ? (Date.now() - Date.parse(r.sentAt)) / 86400000 : 99);
      const tip = dailyTip({ wins, sentThisWeek: recs.filter((r) => ago(r) < 7).length, sentLastWeek: recs.filter((r) => ago(r) >= 7 && ago(r) < 14).length, overdueNotices: boardUrgent.filter((r) => r.dueAt && hoursLeft(r, Date.now()) < 0).length, today });
      if (!tip) return;
      try { localStorage.setItem("hpd-tip-day", today); } catch { /* private mode */ }
      setOrbSay({ text: tip.length > 70 ? `${tip.slice(0, 66).replace(/\s+\S*$/, "")}…` : tip, full: tip, at: Date.now() });
    }, 30000);
    return () => window.clearTimeout(t);
  }, [jobs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const goalSentRef = useRef(-1);
  useEffect(() => {
    const prev = goalSentRef.current;
    goalSentRef.current = goal.sent;
    if (prev >= 0 && goal.sent > prev && goal.sent < goal.total) setOrbSay({ text: `🎯 ${goal.sent} of ${goal.total} bids sent today`, full: `${goal.sent} of ${goal.total} bids sent today. ${goal.total - goal.sent} to go.`, at: Date.now() });
  }, [goal.sent]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🔋 Battery saver: by hand in 🎨, or by itself under 20% battery (phones that tell; not the iPhone).
  const [saver, setSaver] = useState(false);
  useEffect(() => {
    const on = batterySaverOn();
    setSaver(on); applyBatterySaver(on);
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void }> };
    void nav.getBattery?.().then((b) => {
      const check = () => {
        const low = b.level < 0.2 && !b.charging;
        const was = document.documentElement.classList.contains("hpd-saver");
        if (low && !was) { applyBatterySaver(true); setOrbSay({ text: "🔋 Battery low: I stopped the moving pictures.", full: "Your battery is low, so I stopped the moving pictures to make it last. They come back when you charge.", at: Date.now() }); }
        else if (!low && was && !batterySaverOn()) applyBatterySaver(false);
      };
      check();
      b.addEventListener("levelchange", check);
      b.addEventListener("chargingchange", check);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 🪜 Step by step in the chat (owner's picks, 4 Nov): the job's work one item at a time ("walk me through the job"), or
  // what's new in the app (the robot's tour). "done" / "next" goes on, "stop" ends.
  // 🌎 The language of the last question (the mic listens in it next time).
  const lastLangRef = useRef<"es" | "en">("en");
  // 🔔 The robot follows up (owner's pick, 4 Nov): the most urgent notice still open 2 hours after it first showed gets
  // one kind reminder in the bubble (tap = answer it), not between 9 PM and 7 AM.
  useEffect(() => {
    const top = boardUrgent[0];
    if (!top) return;
    const check = () => {
      const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      try {
        if (navigator.webdriver && localStorage.getItem("hpd-test-followup") !== "1") return;
        const o: { omo?: string; at?: number; asked?: boolean } = JSON.parse(localStorage.getItem("hpd-followup") || "{}");
        if (o.omo !== top.omo) { localStorage.setItem("hpd-followup", JSON.stringify({ omo: top.omo, at: Date.now(), asked: false })); return; }
        if (o.asked || Date.now() - Number(o.at || 0) < 2 * 3600000 || h < 7 || h >= 21) return;
        localStorage.setItem("hpd-followup", JSON.stringify({ ...o, asked: true }));
      } catch { return; }
      const hl = Math.round(hoursLeft(top, Date.now()));
      setOrbSay({ text: `🔔 Still open: ${top.omo} (${hl < 0 ? `overdue ${-hl} h` : `${hl} h left`}). Answer it now?`, full: "", run: `answer the notice for ${top.omo}`, at: Date.now() });
    };
    check();
    const t = window.setInterval(check, 10 * 60000);
    return () => window.clearInterval(t);
  }, [boardUrgent[0]?.omo]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepsRef = useRef<{ title: string; items: string[]; i: number; at: number; end: string } | null>(null);
  // 🧠 The robot learns your day: the first screen you open each morning (before 11), kept for 14 days.
  useEffect(() => {
    const key = bidsOpen ? "bids" : noticesOpen ? "notices" : boardOpen ? "board" : "";
    if (!key) return;
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (h < 5 || h >= 11) return;
    try {
      const day = nyToday();
      const o: Record<string, string> = JSON.parse(localStorage.getItem("hpd-habits") || "{}");
      if (o[day]) return;
      o[day] = key;
      localStorage.setItem("hpd-habits", JSON.stringify(Object.fromEntries(Object.entries(o).sort().slice(-14))));
    } catch { /* private mode */ }
  }, [bidsOpen, noticesOpen, boardOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🎬 After an update, the robot offers a tour of what's new (once per version).
  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadWhatsNew().then((v) => {
        const top = Array.isArray(v) ? v[0] : null;
        const id = top ? `${top.date}|${(top.items || []).length}|${String(top.items?.[0] || "").slice(0, 40)}` : "";
        if (!id) return;
        try {
          const seen = localStorage.getItem("hpd-tour-seen");
          localStorage.setItem("hpd-tour-seen", id);
          if (!seen || seen === id || (navigator.webdriver && localStorage.getItem("hpd-test-tour") !== "1")) return;
        } catch { return; }
        setOrbSay({ text: "🎬 New things in the app! Tap me for a tour.", full: "", run: "give me a tour", at: Date.now() });
      });
    }, 9000);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const askSeenRef = useRef("");
  useEffect(() => {
    const ask = (changeThreads || []).find((x) => x.status === "Waiting for you");
    const key = ask ? `${ask.id}|${ask.updates.length}` : "";
    if (!ask || key === askSeenRef.current) { if (!ask) askSeenRef.current = ""; return; }
    askSeenRef.current = key;
    const what = ask.text.replace(/^\(idea\)\s*/i, "").split(/[:.!?]/)[0].trim().slice(0, 40);
    const q = ask.updates[ask.updates.length - 1]?.text || "";
    setOrbSay({ text: `❓ Claude has a question about ${what}. Tap me.`, full: `Claude has a question about ${what}: ${q} Tap ❓ Answer Claude to reply.`, at: Date.now() });
  }, [changeThreads]); // eslint-disable-line react-hooks/exhaustive-deps
  const helloDoneRef = useRef(false);
  useEffect(() => {
    if (helloDoneRef.current || !jobs.length) return;
    helloDoneRef.current = true;
    // (Test browsers only when a test asks: the bubble would sit over other tests' buttons.)
    try { if (navigator.webdriver && localStorage.getItem("hpd-test-hello") !== "1") return; } catch { return; }
    try { if (Date.now() - Number(localStorage.getItem("hpd-robot-hello") || 0) < 3 * 3600000) return; localStorage.setItem("hpd-robot-hello", String(Date.now())); } catch { return; }
    const t = window.setTimeout(() => {
      const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      const name = (() => { try { return localStorage.getItem("hpd-owner-name") || "Jot"; } catch { return "Jot"; } })();
      const todo = jobRows.filter((r) => r.group === "todo").length;
      const what = bidsDue.unsentToday ? `${bidsDue.unsentToday} bid${bidsDue.unsentToday === 1 ? "" : "s"} due today` : todo ? `${todo} job${todo === 1 ? "" : "s"} to do` : "Tap me to talk";
      const hi = `👋 ${h < 12 ? "Good morning" : h < 17 ? "Hi" : "Good evening"}, ${name}! ${what}.`;
      setOrbTap(true); window.setTimeout(() => setOrbTap(false), 1500);
      setOrbSay({ text: hi, full: `${hi} What can I do for you?`, at: Date.now() });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [jobs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!routeMapReady) return;
    let marker: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    let k = 0;
    let stop = false;
    const tick = async () => {
      const map = mapRef.current;
      const ids = todayRouteIds();
      const next = ids.map((id) => jobsRef.current.find((j) => jobId(j) === id)).find((j) => j && !value(j, ["FieldOutcome", "fieldOutcome"]));
      const to = next ? jobLatLng(next) : null;
      if (!map || !to) { marker?.remove(); marker = null; return; }
      const leafletModule = await import("leaflet");
      if (stop) return;
      const L = (leafletModule as any).default || leafletModule; // eslint-disable-line @typescript-eslint/no-explicit-any
      const from = lastPositionRef.current || to;
      k = (k + 0.04) % 1.15;
      const f = Math.min(1, k);
      const pos: [number, number] = [from.lat + (to.lat - from.lat) * f, from.lng + (to.lng - from.lng) * f];
      if (!marker) marker = L.marker(pos, { icon: L.divIcon({ className: "fc-ride-marker", html: `<div class="fc-ride-bot" data-hpd-smoke="fc-ride-bot">${helperFaceHtml(getHelperLook().color, 30)}</div>`, iconSize: [34, 34], iconAnchor: [17, 62] }), interactive: false, zIndexOffset: 2500 }).addTo(map);
      else marker.setLatLng(pos);
    };
    const timer = window.setInterval(() => void tick(), 200);
    return () => { stop = true; window.clearInterval(timer); marker?.remove(); };
  }, [routeMapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tenants' replies: checked every 2 minutes while the app is open; each one marks the job "replied" and rings you.
  useEffect(() => {
    if (!smsReady) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      let since = "";
      try { since = localStorage.getItem("hpd-sms-since") || ""; } catch { /* private mode */ }
      const r = await fetch("/api/drive/tenant-sms-inbox", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since }) }).catch(() => null);
      const d = r && r.ok ? await r.json().catch(() => null) : null;
      const replies: { from: string; body: string; at: string }[] = Array.isArray(d?.replies) ? d.replies : [];
      if (!replies.length) return;
      // First look on this phone: just remember where the inbox is (no ringing for old replies).
      const first = !since;
      try { localStorage.setItem("hpd-sms-since", replies[replies.length - 1].at); } catch { /* private mode */ }
      if (first) return;
      const last10 = (p: string) => String(p || "").replace(/\D/g, "").slice(-10);
      for (const m of replies) {
        const job = jobsRef.current.find((j) => { const ph = last10(tenantInfo(j).phone); return ph.length === 10 && ph === last10(m.from); });
        if (job) markTenantReplied(job);
        // Their words stay on this phone only (not on the job record the status server keeps), for "any texts from tenants".
        try { const keep = JSON.parse(localStorage.getItem("hpd-tenant-replies") || "[]"); keep.push({ omo: job ? jobId(job) : "", body: m.body.slice(0, 300), at: m.at }); localStorage.setItem("hpd-tenant-replies", JSON.stringify(keep.slice(-30))); } catch { /* private mode */ }
        // Their answer names a day and time ("Thursday at 10 works"): offer it as the appointment (23 Oct, plan step 4).
        const when = job ? parseWhen(m.body) : null;
        if (job && when?.date && when.time) {
          const t = tenantInfo(job);
          const appt: Appointment = { date: when.date, start: when.time, end: hourAfter(when.time), state: "confirmed", contact: t.name || "Tenant", phone: t.phone || "", note: `Tenant texted: ${m.body.slice(0, 120)}`, reminder: 60 };
          try {
            validateAppointment(appt);
            pendingApptRef.current = { id: jobId(job), appt };
            pendingRef.current = { id: jobId(job), outcome: "APPOINTMENT", at: Date.now() };
            setAgent({ heard: `💬 ${t.name?.split(/\s+/)[0] || "The tenant"}: "${m.body.slice(0, 160)}"`, reply: `Make the appointment at ${jobAddress(job).replace(/,\s*\d{5}$/, "")} on ${appointmentLabel(appt)}? Say yes, or tap Yes.`, confirm: { id: jobId(job), outcome: "APPOINTMENT" } });
          } catch { /* a time that doesn't work: the reply alert is enough */ }
        } else if (job && !pendingRef.current) {
          // No day and time in it: the helper reads it to you and offers an answer, one tap to send (owner idea, 3 Nov).
          const who = tenantInfo(job).name?.split(/\s+/)[0] || "The tenant";
          const answerText = suggestTenantReply(m.body);
          const where = jobAddress(job).replace(/,\s*\d{5}$/, "");
          setAgent({ heard: `💬 ${who}: "${m.body.slice(0, 160)}"`, reply: `${who} texted back about ${where} (${jobId(job)}).${answerText ? ` I can answer: "${answerText}"` : " It sounds like they don't want texts: I won't answer."}`, offers: answerText ? [`text the tenant at ${jobId(job)} ${answerText}`, `open ${jobId(job)}`] : [`open ${jobId(job)}`], offersLabel: answerText ? "Send it?" : "Open the job?" });
          speak(`${who} texted back: ${m.body.slice(0, 200)}.${answerText ? " Want me to answer?" : ""}`, 200);
        }
        window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "message", go: job ? "job" : undefined, omo: job ? jobId(job) : undefined, title: `💬 ${job ? `${tenantInfo(job).name?.split(/\s+/)[0] || "The tenant"} replied · ${jobId(job)}` : `Text from ***${last10(m.from).slice(-4)}`}`, text: m.body.slice(0, 200) } }));
      }
    };
    void check();
    const t = window.setInterval(() => void check(), 120000);
    return () => window.clearInterval(t);
  }, [smsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check again when the jobs arrive, a card closes, or you come back to the app from Waze / Google (the phone may not
  // report a new position when you're standing still).
  useEffect(() => {
    const again = () => { const f = lastFixRef.current; if (f && Date.now() - f.at < 600000 && document.visibilityState === "visible") nearJobRef.current(f.lat, f.lng, f.accuracy); };
    again();
    const t = window.setInterval(again, 20000);
    document.addEventListener("visibilitychange", again);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", again); };
  }, [jobs.length, selectedJob]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // While a route is on the map, everything else dims (owner, 27 Oct): job pins fade, the streets go a little darker.
    mapRef.current.getContainer().classList.remove("is-route-on");
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
      mapRef.current.getContainer().classList.add("is-route-on");
    };
    // Right away: just the numbered stops. No straight stop-to-stop lines; the street route follows.
    show(stopMarkers());
    // Fit the route into the part of the map above the route panel and below the pills.
    mapRef.current.flyToBounds(dayRouteLayerRef.current.getBounds(), { paddingTopLeft: [28, 150], paddingBottomRight: [56, Math.round(window.innerHeight * 0.38) + 90], maxZoom: 15, duration: 2, easeLinearity: 0.1 });
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
    return [{id:jobId(job),address:jobAddress(job),borough:jobBorough(job),...point,days:jobPriority(job).days,pending:queue==='pending',closed:queue==='completed'||queue==='archived',blocked:visitState(job).blocked,appointment:job.Appointment as Appointment|undefined,done,
      // The tenant on the route too (30 Oct): who expects you, who's a knock-anyway access attempt.
      contact:(()=>{const cs=tenantContactState(job as Record<string, unknown>,tenantInfo(job).commonArea);return {tone:cs.tone,tries:cs.tries};})(),
      // 🔒 A no-access job waiting for its 2nd try (31 Oct): on the route from the day it's allowed.
      ...(()=>{const t2=secondTryState(job as Record<string, unknown>);return t2?{secondTry:{from:t2.dueDay,first:t2.firstLabel}}:{};})()}];
  }), [jobs, calendarDate]);

  // Two taps instead of pop-up boxes (the iPhone home-screen app blocks confirm()): the first tap arms the button and
  // says what will happen, the second does it; it disarms after 6 seconds.
  const [armedTap, setArmedTap] = useState("");
  const armedTimer = useRef<number | null>(null);
  const tapTwice = (key: string, what: string) => {
    if (armedTap === key) { setArmedTap(""); return true; }
    setArmedTap(key);
    setOutcomeMessage(`Tap again to ${what}.`);
    if (armedTimer.current) window.clearTimeout(armedTimer.current);
    armedTimer.current = window.setTimeout(() => setArmedTap((k) => (k === key ? "" : k)), 6000);
    return false;
  };

  // "Everything is correct": takes a finished job off the active map. Only offered once its
  // paperwork is approved; archived jobs stay under Status > Archive.
  async function archiveJob(job: JobRecord) {
    const id = jobId(job);
    if (!tapTwice(`archive:${id}`, `archive ${id} (only if the work, paperwork and email are all correct)`)) return;
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
    saveOutcomeFor(job, outcomeDrafts[jobId(job)] || { outcome: "", note: "" }, review);
  }
  // The card's outcome form and the voice helper ("refused access EQ15239 yesterday, male, tall, dark hair") save the same way.
  function saveOutcomeFor(job: JobRecord, draft: OutcomeDraft, review = false) {
    const id = jobId(job);
    if (draft.outcome && paperworkLock(job).locked && !isTestJob(id)) { setOutcomeMessage(lockedMessage(id, paperworkLock(job))); return; }
    if (draft.outcome === "REFUSED_ACCESS" && !String(draft.who || "").trim()) { setOutcomeMessage("Describe who refused access first (the affidavit needs it), e.g. Male, tall, dark hair."); return; }
    try {
      // A past day picked (30 Oct: "I'm closing a refused access today, but it was in the past"): saved at noon New York
      // that day, so the affidavit and the invoice carry that date.
      const when = draft.date && draft.date < nyToday() ? new Date(`${draft.date}T16:00:00Z`).toISOString() : new Date().toISOString();
      const extra: Record<string, unknown> = draft.outcome === "REFUSED_ACCESS" ? { DeniedDescription: String(draft.who || "").trim().toUpperCase() } : {};
      // Changing a saved outcome replaces it: no access starts again at the 1st try.
      const changing = changeOutcomeFor === id && Boolean(draft.outcome);
      const restart = changing ? { NoAccessFirstAttemptAt: "", NoAccessSecondAttemptAt: "", SecondAttemptAvailableAt: "" } : {};
      const patch = withVisitLocation(job, { ...restart, ...fieldOutcomePatch(changing ? { ...job, ...restart } : job, draft.outcome, changing && !draft.note.trim() ? "Changed on the job card" : draft.note, when), ...extra });
      writeSharedWorkflowPatch(id, patch);
      mergeWorkflowPatchIntoScreen(id, patch);
      if (draft.outcome) setWorkflowStamps((prev) => ({ ...prev, [id]: { ...prev[id], status: FIELD_OUTCOMES[draft.outcome] } }));
      setOutcomeDrafts((prev) => ({ ...prev, [id]: { outcome: "", note: "" } }));
      if (draft.outcome) setChangeOutcomeFor("");
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
      const checks = await Promise.all(Array.from(files).map(checkImageFile));
      const dark = checks.filter(c => c === "dark").length, blurry = checks.filter(c => c === "blurry").length;
      const photoWarning = dark || blurry ? ` Check: ${[dark ? `${dark} too dark` : "", blurry ? `${blurry} blurry` : ""].filter(Boolean).join(", ")}. HPD may reject it: retake if you can.` : "";
      const unstamped = saved.filter(item => item.mediaType === "video" && item.stamped === false).length;
      setMediaMessage(saved.length ? `${kind === "before" ? "Before" : "After"} media saved: ${saved.length}.${unstamped ? ` ${unstamped} video(s) saved as originals without burned-in labels; review before submitting.` : ""}${photoWarning}` : "No image or video was saved.");
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
    if (!tapTwice("reset-test", "reset the test job (steps, outcome, package and photos on this phone are cleared; Drive copies and sent emails stay)")) return;
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
    if (!tapTwice(`clear:${id}`, `clear "${previous}" for ${id} (photos and visit history are kept)`)) return;
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

  const showStep = (heard: string) => {
    const st = stepsRef.current;
    if (!st) return;
    st.at = Date.now();
    if (st.i >= st.items.length) {
      stepsRef.current = null;
      setAgent({ heard, reply: st.end });
      speak(st.end, 150, () => { if (convoRef.current) startListening(); });
      return;
    }
    const reply = `${st.title} ${st.i + 1} of ${st.items.length}: ${st.items[st.i]}`;
    setAgent({ heard, reply, offers: ["done", "stop"], offersLabel: st.i + 1 < st.items.length ? "Say \"done\" for the next one, or tap:" : "Say \"done\" when it's done, or tap:" });
    speak(sayOmo(reply).replace(/\bHPD\b/g, "H P D"), 150, () => { if (convoRef.current) startListening(); });
  };
  agentRef.current = (heard: string, inner = false) => {
    if (askAnywayRef.current && askAnywayRef.current !== heard) askAnywayRef.current = "";
    {
      const st = stepsRef.current;
      const t = heard.trim().toLowerCase().replace(/[.!]+$/, "");
      if (st && Date.now() - st.at < 30 * 60000) {
        if (/^(✅ )?(done|next|next one|ok|okay|got it|finished|finished that|yes|go on|continue)$/.test(t)) { st.i += 1; showStep(heard); return; }
        if (/^(stop|cancel|exit|quit|end|that'?s enough|no more)( (it|the tour|the steps))?$/.test(t)) { stepsRef.current = null; setAgent({ heard, reply: "OK, stopped. Ask me anything." }); speak("OK, stopped.", 100); return; }
      }
    }
    if (!inner) {
      multiRef.current = null;
      const parts = thinkingQuestion(heard) ? [heard] : splitCommands(heard);
      if (parts.length > 1) { multiRef.current = { heard, queue: parts.slice(1), replies: [] }; setAgent({ heard, reply: "Working on it…" }); agentRef.current(parts[0], true); return; }
    }
    lastLangRef.current = langOf(heard);
    let cmd = parseCommand(heard);
    // A question that needs counting / comparing goes to the AI, not to a quick list that only shows things.
    if (thinkingQuestion(heard) && ["bids", "bids-show", "notices", "today", "week", "money", "awards", "tracker", "tenants-waiting", "catch-up", "whats-next", "job-status", "read-job", "my-notes", "help"].includes(cmd.intent) && (closest(heard, knownPhrases())[0]?.score || 0) < 0.9) cmd = { intent: "ask", question: heard.trim() };
    // Not recognized (3 Nov, "did you mean"): very close to something the helper knows = do that; close = offer up to
    // 3 to tap, with "Ask the AI instead"; else a real question for the AI. A search with a number stays a search.
    // A real question (5+ words, how / why / what… or a ?) goes to the AI unless it's almost word for word a known one
    // (owner, 4 Nov: "make the bot smarter": near-miss phrases were answering questions they didn't fit).
    const realQuestion = heard.trim().split(/\s+/).length >= 5 && (/\?\s*$/.test(heard) || /^\s*(how|why|what|which|when|where|who|should|can|could|would|will|is|are|do|does|did|tell me|explain|give me)\b/i.test(heard));
    if ((cmd.intent === "ask" || (cmd.intent === "search" && !/\d/.test(heard))) && askAnywayRef.current !== heard && !pendingWhoRef.current && !(realQuestion && cmd.intent === "ask" && closest(heard, knownPhrases())[0]?.score < 0.92)) {
      const best = closest(heard, knownPhrases());
      if (best[0] && best[0].score >= SURE) { agentRef.current(best[0].phrase, inner); return; }
      if (cmd.intent === "ask" && best[0] && best[0].score >= MAYBE) {
        const choices = best.filter((b) => b.score >= MAYBE - 0.1).map((b) => b.phrase);
        const reply = `I'm not sure what you meant by "${heard.trim()}". Did you mean one of these?`;
        if (inner && multiRef.current) { cmd = parseCommand(choices[0]); }
        else {
          setAgent({ heard, reply, choices });
          speak(`Did you mean: ${choices[0]}?`, 200, () => { if (convoRef.current) startListening(); });
          return;
        }
      }
    }
    // "Who refused?" was just asked: what's said next is the description (unless it's no / cancel).
    const askedWho = pendingWhoRef.current;
    pendingWhoRef.current = null;
    if (askedWho && Date.now() - askedWho.at < 120000 && cmd.intent !== "no" && cmd.intent !== "yes" && String(heard).trim()) {
      cmd = { intent: "outcome", outcome: "REFUSED_ACCESS", ref: askedWho.id, ...(askedWho.date ? { date: askedWho.date } : {}), who: String(heard).trim().replace(/[.!?]+$/, "") };
    }
    const answer = (reply: string, confirm?: { id: string; outcome: string }) => {
      const m = multiRef.current;
      if (m) {
        // Collect; a part that needs a yes stops the chain there (the rest is listed to ask after).
        m.replies.push(reply);
        const next = confirm ? undefined : m.queue.shift();
        if (next !== undefined) { agentRef.current(next, true); return; }
        multiRef.current = null;
        const rest = confirm && m.queue.length ? `\n\nAfter that, ask me: ${m.queue.join("; ")}.` : "";
        const all = `${m.replies.join("\n\n")}${rest}`;
        setAgent({ heard: m.heard, reply: all, confirm, cards: takeCards(all) }); pendingRef.current = confirm ? { ...confirm, at: Date.now() } : null;
        speak(sayOmo(all).replace(/\bHPD\b/g, "H P D").replace(/\s*·\s*/g, ", ").replace(/\n+/g, " "), 200, () => { if (convoRef.current) startListening(); });
        return;
      }
      setAgent({ heard, reply, confirm, cards: takeCards(reply) });
      // 💬 Conversation mode: listen again once the answer has been said.
      const again = () => { if (convoRef.current) startListening(); }; pendingRef.current = confirm ? { ...confirm, at: Date.now() } : null; speak(sayOmo(reply).replace(/\bHPD\b/g, "H P D").replace(/\s*·\s*/g, ", "), 200, again); };
    const pick = (ref: string) => (ref ? findJobRef(ref, jobs, jobId, jobAddress) : selectedJob);
    // The cards under an answer: the ones set for it, else the jobs it names (not the one already open).
    function takeCards(reply: string) {
      const set = cardsRef.current;
      cardsRef.current = null;
      const open = selectedJob ? jobId(selectedJob) : "";
      // Over an open bid card the panel stays small (its Save / Send buttons stay free): no cards from the words.
      if (!set && document.querySelector('[data-hpd-smoke="fc-bid-sheet"]')) return [];
      const list = (set || omosIn(reply).filter((o) => o !== open).map((o) => chatCard(o)).filter((c): c is ChatCard => Boolean(c))).slice(0, 5);
      if (list.length) lastCardsRef.current = { cards: list, at: Date.now() };
      return list;
    }
    const dayWord = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
    if (cmd.intent === "search") { setFindHidden(""); setSearch(cmd.text); setAgent(null); return; }
    // "Open the second one": the card with that number from the last answer.
    if (cmd.intent === "open-pick") {
      const last = lastCardsRef.current && Date.now() - lastCardsRef.current.at < 15 * 60000 ? lastCardsRef.current.cards : [];
      const c = last[cmd.pick - 1];
      if (!c) { answer(last.length ? `I only showed ${last.length}. Say "open number 1"${last.length > 1 ? ` to ${last.length}` : ""}.` : "Ask me for a list first, like \"which notices are open\" or \"bids in Queens\", then say \"open the second one\"."); return; }
      speak(`Opening ${c.title.replace(/^.*? · /, "")}.`, 100);
      openCard(c);
      return;
    }
    // "What's Claude doing?": the answer stays live in the chat, refreshed with every check (every 3 s while it works).
    if (cmd.intent === "claude-works" || cmd.intent === "claude-not-right") {
      // The newest finished request you haven't checked (last 3 days).
      const lastAt = (t: ChangeThread) => t.updates[t.updates.length - 1]?.at || t.at;
      const t = (changeThreads || []).filter((x) => x.status === "Done" && !x.ok && Date.now() - Date.parse(lastAt(x)) < 3 * 86400000).sort((a, b) => lastAt(b).localeCompare(lastAt(a)))[0];
      if (!t) { answer("There's no finished request waiting for your check. Say \"what's Claude doing\" to hear where your requests are."); return; }
      const q = t.text.replace(/^\((said to the helper|from the chat)\)\s*/i, "").slice(0, 60);
      if (cmd.intent === "claude-works") { void confirmWorks(t); answer(`👍 Told Claude "${q}" works. It's off the map.`); return; }
      const text = cmd.text.trim().replace(/^\w/, (c) => c.toUpperCase());
      if (!text) { answer(`What's not right with "${q}"? Say it like "not right, the button is still too small".`); return; }
      void sendChangeAnswer(t, text).then((ok) => answer(ok ? `📥 Sent to Claude on "${q}": "${text}". It goes back to work on it.` : "Couldn't send it right now (no signal?). Try again in a minute."));
      return;
    }
    if (cmd.intent === "catch-up") {
      // Since you were last here (back after 2 h+), else since the last time the app was open, at most the last 24 h.
      const since = awaySince || (lastSeenRef.current && Date.now() - Date.parse(lastSeenRef.current) < 86400000 ? lastSeenRef.current : new Date(Date.now() - 12 * 3600000).toISOString());
      const lines = catchUp(since);
      setAwaySince("");
      const reply = lines.length ? `Since ${sinceLabel(since)}:\n${lines.map((l) => `• ${l}`).join("\n")}` : `Nothing new since ${sinceLabel(since)}: no new bids, no HPD emails, nothing from Claude.`;
      if (multiRef.current) { answer(reply); return; }
      setAgent({ heard, reply, cards: takeCards(reply) });
      speak(reply, 200, () => { if (convoRef.current) startListening(); });
      return;
    }
    if (cmd.intent === "remember") {
      saveNote(cmd.text);
      answer(`🧠 Got it, I'll remember: ${cmd.text}. It stays on this phone, and I'll bring it up when that address comes up.`);
      return;
    }
    if (cmd.intent === "my-notes") {
      const list = loadNotes().slice(-8).reverse();
      answer(list.length ? `Your notes:\n${list.map((n) => `• ${n.text}`).join("\n")}` : "You haven't told me to remember anything yet. Say: remember the super at 123 Main is in the basement.");
      return;
    }
    if (cmd.intent === "ideas") {
      void loadIdeas().then((list) => {
        const open = openIdeas(list).slice(0, 3);
        lastIdeasRef.current = open;
        const reply = open.length
          ? `Here are my top ideas:\n${open.map((x, i) => `${i + 1}. ${x.icon} ${x.title}: ${x.why}`).join("\n")}\nSay "do idea 1" (or 2, 3), "more ideas", or tell me your own.`
          : "You've picked all my ideas. Say \"more ideas\" and I'll ask Claude for new ones, or tell me what you want.";
        showPanel({ heard, reply, actions: [{ label: "💡 All the ideas", href: "#requests" }] });
        speak(open.length ? `Here are my top ideas. ${open.map((x, i) => `${i + 1}: ${x.title}.`).join(" ")} Say do idea 1, 2 or 3.` : reply, 200, () => { if (convoRef.current) startListening(); });
      });
      return;
    }
    if (cmd.intent === "idea-do") {
      const fromChat = lastIdeasRef.current.length ? lastIdeasRef.current : openIdeas().slice(0, 3);
      const go = (list: Idea[]) => {
        const x = list[cmd.n - 1];
        if (!x) { answer(`I don't have an idea number ${cmd.n}. Say "give me ideas" to hear them.`); return; }
        void pickIdea(x).then((ok) => answer(ok ? `👍 Sent to Claude: “${x.title}”. ${pickupLabel(claudeSeenAt)}. Watch the 🤖 button: it turns green while Claude builds it.` : "I saved it on this phone; it goes to Claude when the connection is back."));
      };
      if (fromChat.length) go(fromChat); else void loadIdeas().then((list) => go(openIdeas(list).slice(0, 3)));
      return;
    }
    if (cmd.intent === "ideas-more") {
      void askMoreIdeas().then((ok) => answer(ok ? `💬 I asked Claude for more ideas. ${pickupLabel(claudeSeenAt)}. They show under 💡 Ideas when ready.` : "Saved on this phone (offline)."));
      return;
    }
    if (cmd.intent === "auto-upgrade") {
      void setAutoUpgradeOn(cmd.on);
      answer(cmd.on ? "🔁 Keep upgrading is on: when you have no requests open, Claude builds the next idea by itself (up to 3 a day), tests it, puts it live and tells you. Say \"stop auto upgrade\" to turn it off." : "Keep upgrading is off. Claude only builds what you ask for.");
      return;
    }
    if (cmd.intent === "price-check") {
      const omo = document.querySelector('[data-hpd-smoke="fc-bid-sheet"] header strong')?.textContent?.trim();
      if (!bidsOpen || !omo) { answer(`Open the bid first, then ask "is ${cmd.price} too high?".`); return; }
      const on = (e: Event) => { window.removeEventListener("hpd-bid-check-answer", on); answer(String((e as CustomEvent<string>).detail || "I couldn't judge that price.")); };
      window.addEventListener("hpd-bid-check-answer", on);
      window.dispatchEvent(new CustomEvent("hpd-bid-check", { detail: cmd.price }));
      return;
    }
    if (cmd.intent === "week-ahead") {
      // 📅 The next 7 days: appointments, bids still to send, notices coming due.
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
      const days = Array.from({ length: 7 }, (_, k) => fmt.format(new Date(Date.now() + k * 86400000)));
      let recs: Record<string, { status?: string; bidDue?: string }> = {};
      try { recs = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}"); } catch { /* private mode */ }
      const week = days.map((date, k) => {
        const appts = jobs.map((j) => ({ j, a: activeAppointment(j as unknown as Record<string, unknown>) })).filter((x) => x.a && x.a.date === date);
        const bids = bidsListRef.current.filter((b) => b.bidDue === date && !(b.omo && ["sent", "confirmed"].includes(String(recs[b.omo]?.status)) && recs[b.omo]?.bidDue === b.bidDue));
        const notices = boardOpenRows.filter((r) => r.dueAt && fmt.format(new Date(r.dueAt)) === date);
        const day = k === 0 ? "Today" : k === 1 ? "Tomorrow" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
        return { day, date, n: { appt: appts.length, bids: bids.length, notices: notices.length }, appts, notices };
      });
      const lines = week.filter((w) => w.n.appt || w.n.bids || w.n.notices).map((w) => `• ${w.day}: ${[w.n.appt ? `${w.n.appt} appointment${w.n.appt === 1 ? "" : "s"}${w.appts[0] ? ` (first ${appointmentLabel(w.appts[0].a!).replace(/^.*?(\d{1,2}(:\d\d)?\s?(AM|PM)).*$/i, "$1")}, ${jobAddress(w.appts[0].j).replace(/,\s*\d{5}$/, "")})` : ""}` : "", w.n.bids ? `${w.n.bids} bid${w.n.bids === 1 ? "" : "s"} due` : "", w.n.notices ? `${w.n.notices} notice${w.n.notices === 1 ? "" : "s"} due (${w.notices.slice(0, 2).map((r) => r.omo).join(", ")})` : ""].filter(Boolean).join(", ")}`);
      const reply = lines.length ? `📅 Your next 7 days:\n${lines.join("\n")}` : "📅 Nothing on your next 7 days yet: no appointments, bids due or notices coming due.";
      answer(reply);
      if (!multiRef.current) setAgent((a) => (a ? { ...a, week: week.map(({ day, date, n }) => ({ day, date, n })) } : a));
      return;
    }
    if (cmd.intent === "find") {
      // 🔍 Your notes, the job cards' notes, the visit history, HPD's work descriptions and emails.
      const docs: SearchDoc[] = [];
      for (const n of loadNotes()) docs.push({ job: "", kind: "note", text: n.text, at: n.at });
      for (const [id, list] of Object.entries(allJobNotes())) for (const n of list) docs.push({ job: id, kind: "job note", text: n.text, at: n.at });
      for (const j of jobs) {
        const id = jobId(j);
        const visits = Array.isArray(j.FieldVisitHistory) ? (j.FieldVisitHistory as { recordedAt?: string; note?: string }[]) : [];
        for (const v of visits) if (v?.note) docs.push({ job: id, kind: "visit", text: String(v.note), at: v.recordedAt });
        docs.push({ job: id, kind: "work", text: jobScope(j) });
      }
      for (const t of threads || []) for (const m of t.messages) if (t.omos[0] && m.text) docs.push({ job: t.omos[0], kind: "email", text: String(m.text).slice(0, 4000), at: m.at });
      const hits = searchAll(searchQuery(cmd.query), docs);
      if (!hits.length) { answer(`I didn't find "${searchQuery(cmd.query)}" in your notes, the jobs or HPD's emails.`); return; }
      const where: Record<string, string> = { note: "your note", "job note": "the job card's notes", visit: "the visit history", work: "HPD's work description", email: "HPD's email" };
      cardsRef.current = hits.filter((h) => h.job).map((h) => chatCard(h.job)).filter((c): c is ChatCard => Boolean(c));
      lastJobsRef.current = hits.find((h) => h.job) ? { ids: hits.filter((h) => h.job).map((h) => h.job), at: Date.now() } : lastJobsRef.current;
      answer(`🔍 Found ${hits.length === 1 ? "it" : `${hits.length}`}:\n${hits.map((h) => `• ${h.job ? `${h.job} (${addressOf(h.job) || "job"})` : "Your notes"}, in ${where[h.kind] || h.kind}: "${h.snippet}"`).join("\n")}`);
      return;
    }
    if (cmd.intent === "materials") {
      // 📦 Today's route (else the open card): what the work descriptions need.
      const ids = todayRouteIds();
      const list = (ids.length ? ids.map((id) => jobs.find((x) => jobId(x) === id)).filter(Boolean) as JobRecord[] : selectedJob ? [selectedJob] : []).filter((x) => !value(x, ["FieldOutcome", "fieldOutcome"]));
      if (!list.length) { answer("Plan today's route first (say \"plan my day\"), or open a job, and I'll tell you what to bring."); return; }
      const need = materialsFor(list.map((x) => ({ id: jobId(x), text: jobScope(x) })));
      if (!need.length) { answer(`I couldn't tell the materials from the work descriptions of ${list.length === 1 ? jobId(list[0]) : `your ${list.length} stops`}. Read them on the cards.`); return; }
      cardsRef.current = list.slice(0, 5).map((x) => chatCard(jobId(x))).filter((c): c is ChatCard => Boolean(c));
      answer(`📦 To bring for ${list.length === 1 ? jobId(list[0]) : `your ${list.length} stops today`}:\n${need.map((m) => `• ${m.item}${list.length > 1 ? ` (${m.jobs.length} job${m.jobs.length === 1 ? "" : "s"})` : ""}`).join("\n")}`);
      return;
    }
    if (cmd.intent === "tour") {
      void loadWhatsNew().then((v) => {
        const top = Array.isArray(v) ? v[0] : null;
        const items = (top?.items || []).slice(0, 6).map((x: string) => x.replace(/\s+/g, " ").trim());
        if (!items.length) { answer("I couldn't load what's new right now. Try again in a minute."); return; }
        stepsRef.current = { title: "🎬 New", items, i: 0, at: Date.now(), end: "That's the tour! Ask me to try any of them." };
        showStep(heard);
      });
      return;
    }
    if (cmd.intent === "walkthrough") {
      const j = selectedJob || (lastJobsRef.current && Date.now() - lastJobsRef.current.at < 30 * 60000 ? jobs.find((x) => jobId(x) === lastJobsRef.current!.ids[0]) || null : null);
      if (!j) { answer("Which job? Open its card (or say \"read this job to me\"), then say \"walk me through it\"."); return; }
      const items = jobSummary(jobScope(j)).lines.map(lineText).filter(Boolean);
      if (!items.length) { answer(`There's no work list on ${jobId(j)}: read HPD's description on the card.`); return; }
      lastJobsRef.current = { ids: [jobId(j)], at: Date.now() };
      stepsRef.current = { title: "🔧 Item", items, i: 0, at: Date.now(), end: `That's all ${items.length} item${items.length === 1 ? "" : "s"} on ${jobId(j)}. Now take the after photos, then say "done" to mark the job finished.` };
      showStep(heard);
      return;
    }
    if (cmd.intent === "whats-new") {
      // The newest lines of What's new (public/data/whats-new.json), shortest first sentence each, read out.
      void loadWhatsNew().then((v) => {
        const top = Array.isArray(v) ? v[0] : null;
        if (!top?.items?.length) { answer("I couldn't load the list of changes right now. Try again in a minute."); return; }
        const first = (x: string) => { const one = x.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0]; return one.length > 170 ? `${one.slice(0, 168)}…` : one; };
        const lines = top.items.slice(0, 3).map((x: string) => `• ${first(x)}`);
        const more = top.items.length - 3;
        const reply = `Newest in the app (${top.date}):\n${lines.join("\n")}${more > 0 ? `\n…and ${more} more on the list.` : ""}`;
        if (multiRef.current) { answer(reply); return; }
        showPanel({ heard, reply, actions: [{ label: "📋 All the changes", href: "#requests" }] });
        speak(reply.replace(/\n…and[\s\S]*$/, ""), 200, () => { if (convoRef.current) startListening(); });
      });
      return;
    }
    if (cmd.intent === "claude-status") {
      void loadChangeThreads();
      const reply = claudeStatusText();
      if (multiRef.current) { answer(reply); return; }
      setAgent({ heard, reply, live: "claude" });
      speak(reply.split("\n")[0], 200, () => { if (convoRef.current) startListening(); });
      return;
    }
    // A panel with buttons ends a chain: what was answered before goes on top.
    function showPanel(p: { heard: string; reply: string; cards?: ChatCard[]; actions?: { label: string; href: string; id?: string; via?: "Waze" | "Google"; queue?: { omo: string; at: string }[]; remind?: string }[] }) {
      const m = multiRef.current;
      multiRef.current = null;
      const reply = m ? [...m.replies, p.reply].join("\n\n") : p.reply;
      if (p.cards) cardsRef.current = p.cards;
      setAgent({ ...p, heard: m ? m.heard : p.heard, reply, cards: takeCards(reply) });
    }
    if (cmd.intent === "reply-notice") {
      // Which notice: the job named, else the one on screen, else the only one waiting (or the most urgent from Lewis / Gafur).
      const waiting = boardOpenRows.filter((r) => !r.steps.sent.done || boardSide(r) === "replied");
      const byWho = cmd.who ? waiting.filter((r) => new RegExp(cmd.who, "i").test(r.who)) : waiting;
      const named = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : null;
      const omo = named && named !== "many" ? jobId(named) : (/^[A-Z]{2}\d{5}$/.test(cmd.ref.toUpperCase().replace(/\s/g, "")) ? cmd.ref.toUpperCase().replace(/\s/g, "") : "") || (selectedJob && waiting.some((r) => r.omo === jobId(selectedJob)) ? jobId(selectedJob) : "") || (byWho.length === 1 || cmd.who ? [...byWho].sort((a, b) => hoursLeft(a, Date.now()) - hoursLeft(b, Date.now()))[0]?.omo || "" : "");
      const row = omo ? boardOpenRows.find((r) => r.omo === omo) : null;
      if (!row) { answer(waiting.length ? `Which one? ${waiting.length} notices are waiting: say the job number, or "reply to Lewis" / "reply to Gafur".` : "No notice from vendor tracking is waiting for an answer."); return; }
      setBoardAutoReply("");
      window.setTimeout(() => setBoardAutoReply(row.omo), 0);
      goTo("board", row.omo);
      answer(`Here's ${row.who}'s ${row.kind === "docs" ? "documents request" : `${row.hours}-hour notice`} for ${addressOf(row.omo) || row.omo}. The AI is writing the reply: read it, then tap Send twice.`);
      return;
    }
    if (cmd.intent === "paperwork") {
      const job = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob;
      if (job === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!job) { answer("Which job? Open its card, or say the job number."); return; }
      const outcome = value(job, ["FieldOutcome", "fieldOutcome"]);
      const href = outcome ? paperworkGenerateHref(jobId(job), outcome) : paperworkNextHref(jobId(job), outcome);
      showPanel({ heard, reply: `${jobAddress(job).replace(/,\s*\d{5}$/, "")}: ${outcome ? `${FIELD_OUTCOMES[outcome] || "outcome saved"}, the affidavit and invoice are ready to make.` : "no outcome saved yet: the paperwork page asks what happened."} Tap Open the paperwork.`, actions: [{ label: "📄 Open the paperwork", href }] });
      speak(`${jobAddress(job).replace(/,\s*\d{5}$/, "")}. Tap open the paperwork.`, 200);
      return;
    }
    if (cmd.intent === "route-add" || cmd.intent === "route-remove") {
      // One job on / off Today's route by voice (30 Oct): the job named, else the one on screen.
      const job = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob;
      if (job === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!job) { answer(cmd.ref ? `I can't find ${cmd.ref} in your jobs. Say the job number, letter by letter.` : "Which job? Open its card, or say the job number."); return; }
      const jid = jobId(job);
      const where = jobAddress(job).replace(/,\s*\d{5}$/, "");
      if (cmd.intent === "route-remove") {
        answer(removeFromTodayRoute(jid) ? `Took ${where} off Today's route. ${todayRouteIds().length} stop${todayRouteIds().length === 1 ? "" : "s"} left.` : `${where} isn't on Today's route.`);
        return;
      }
      if (todayRouteIds().includes(jid)) { answer(`${where} is already on Today's route: stop ${todayRouteIds().indexOf(jid) + 1}.`); return; }
      if (!addToTodayRoute(jid)) { answer("I couldn't save the route on this phone."); return; }
      setRouteAdded(jid);
      answer(`Added ${where} to Today's route: stop ${todayRouteIds().length}.`);
      return;
    }
    if (cmd.intent === "plan") {
      // The route panel plans it (overdue / appointments / 2nd tries first, close together), then the plan is read out.
      closeScreens("route");
      setRouteBuildRequest((n) => n + 1);
      if (!multiRef.current) setAgent({ heard, reply: "Planning your day…" });
      // ☀️ The day's weather and parking with the plan (27 Oct, "do all of them"): rain, freezing, wind, dark early.
      let wxText = "";
      void fetchWeather().then((w) => { if (!w) return; const r = weatherReport(w, "today", nyNow().iso); wxText = r.tips.length ? `${r.text} ${r.tips[0]}` : r.text; });
      const dayExtras = () => {
        const asp = aspAnswer(nyNow().iso.slice(0, 10), "Today");
        return `${wxText ? `
🌦 ${wxText}` : ""}${/suspended|Sunday/.test(asp) ? `
🅿️ ${asp}` : ""}`;
      };
      // Read it back once the new plan is saved (up to 8 s; the map and your location may still be loading).
      const before = JSON.stringify((() => { try { return JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null"); } catch { return null; } })());
      let tries = 0;
      const readBack = () => {
        const now = (() => { try { return localStorage.getItem("hpd-today-route-v1") || "null"; } catch { return "null"; } })();
        if (JSON.stringify(JSON.parse(now)) === before && tries++ < 16) { window.setTimeout(readBack, 500); return; }
        const ids = todayRouteIds();
        const stops = ids.map((id) => jobs.find((j) => jobId(j) === id)).filter(Boolean) as JobRecord[];
        if (stops.length) lastJobsRef.current = { ids: stops.map((j) => jobId(j)), at: Date.now() };
        if (!stops.length) { answer("I couldn't plan a route: no open jobs with a location in the area set on the route panel."); return; }
        const short = (j: JobRecord) => jobAddress(j).replace(/,\s*\d{5}$/, "");
        answer(`Your day: ${stops.length} stop${stops.length === 1 ? "" : "s"}. First ${short(stops[0])}${stops[1] ? `, then ${short(stops[1])}` : ""}${stops[2] ? `, then ${short(stops[2])}` : ""}${stops.length > 3 ? `, and ${stops.length - 3} more` : ""}. Say "take me to the next stop" when you're ready.` + dayExtras());
      };
      window.setTimeout(readBack, 600);
      return;
    }
    if (cmd.intent === "text-tenant" || cmd.intent === "call-tenant" || cmd.intent === "navigate" || cmd.intent === "arrived" || cmd.intent === "open" || cmd.intent === "late") {
      // Which job: the one named, else the one on screen; "next stop": Today's route, else the closest open job.
      let job: JobRecord | null | "many" = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob;
      if (!job && cmd.intent === "late") {
        // Running late to: the job just talked about, else today's next stop on the route.
        const recent = lastJobsRef.current && Date.now() - lastJobsRef.current.at < 60 * 60000 ? jobs.find((x) => jobId(x) === lastJobsRef.current!.ids[0]) : null;
        job = recent || todayRouteIds().map((id) => jobs.find((x) => jobId(x) === id)).find((x) => x && jobQueue(x) === "pending" && !value(x, ["FieldArrivedAt"])) || null;
      }
      if (!job && cmd.intent === "navigate" && cmd.there && lastJobsRef.current && Date.now() - lastJobsRef.current.at < 20 * 60000) {
        const id = lastJobsRef.current.ids[0];
        job = jobs.find((x) => jobId(x) === id) || null;
      }
      if (cmd.intent === "navigate" && (cmd.next || !job) && !cmd.ref) {
        const open = (j: JobRecord) => jobQueue(j) === "pending" && !value(j, ["FieldArrivedAt"]) && !isTestJob(jobId(j));
        const onRoute = todayRouteIds().map((id) => jobs.find((j) => jobId(j) === id)).find((j) => j && open(j)) || null;
        const fix = lastFixRef.current;
        const near = !onRoute && fix ? (() => { const best = nextJob(jobs.map((j) => { const at = jobLatLng(j); return { id: jobId(j), lat: at ? at.lat : NaN, lng: at ? at.lng : NaN, open: open(j) }; }), "", { lat: fix.lat, lng: fix.lng }); return best ? jobs.find((j) => jobId(j) === best.id) || null : null; })() : null;
        job = onRoute || near;
      }
      if (cmd.intent === "arrived" && !job) {
        // "I'm here" with no card open: the job you're standing at.
        const fix = lastFixRef.current;
        if (fix) job = jobs.filter((j) => jobQueue(j) !== "archived").map((j) => ({ j, at: jobLatLng(j) })).filter((x) => x.at).map((x) => ({ j: x.j, m: distanceMiles({ lat: fix.lat, lng: fix.lng }, x.at!) * 1609.34 })).filter((x) => x.m < 200).sort((a, b) => a.m - b.m)[0]?.j || null;
      }
      if (job === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!job) { answer(cmd.intent === "navigate" ? "Which job? Say the job number or the address, or plan Today's route." : cmd.ref ? `I can't find ${cmd.ref} in your jobs. Say the job number, letter by letter.` : "Which job? Open its card, or say the job number."); return; }
      const j = job;
      const t = tenantInfo(j);
      const where = jobAddress(j).replace(/,\s*\d{5}$/, "");
      if (cmd.intent === "open") { openIssueJob(j); setFindHidden(search); answer(`Here's ${where}.`); return; }
      if (cmd.intent === "text-tenant") {
        if (!t.phone || t.commonArea) { answer(`There's no tenant phone on file for ${where}.`); return; }
        // Hands-free (23 Oct): with the text service on, the ready text is read out and goes after your yes.
        if (smsReady) {
          const sum = jobSummary(jobScope(j));
          const words = sum.lines.length ? sum.lines.map(lineText).join(", ") : jobScope(j).replace(/\s+/g, " ").split(/(?<=\.)\s/)[0].slice(0, 120);
          const text = tenantTextDraft({ name: t.name, address: jobAddress(j), apt: t.apt, job: words, omo: jobId(j) });
          pendingSmsRef.current = { id: jobId(j), text };
          openIssueJob(j);
          answer(`I'll text ${t.name ? t.name.split(/\s+/)[0] : "the tenant"} at ${where}: "${text}" Say yes to send it.`, { id: jobId(j), outcome: "SMS" });
          return;
        }
        openIssueJob(j);
        window.setTimeout(() => openTenantText(j), 300);
        answer(`I wrote a text for ${t.name || "the tenant"} at ${where}. Read it on the job card, then tap Open in Messages and press Send.`);
        return;
      }
      if (cmd.intent === "call-tenant") {
        if (!t.phone) { answer(`There's no tenant phone on file for ${where}.`); return; }
        lastCallRef.current = jobId(j);
        showPanel({ heard, reply: `${t.name || "The tenant"} at ${where}: ${t.phone}. Tap Call.`, actions: [{ label: `📞 Call ${t.name ? t.name.split(/\s+/)[0] : "the tenant"}`, href: `tel:${t.phone.replace(/[^\d+]/g, "")}` }] });
        speak(`${t.name || "The tenant"} at ${where}. Tap call.`, 200);
        return;
      }
      if (cmd.intent === "late") {
        // 🕐 "I'm running late" (owner's pick, 4 Nov): a text with your new time (the drive from where you are, else 30
        // minutes from now, rounded up to 5), ready to send with one tap.
        if (!t.phone || t.commonArea) { answer(`There's no tenant phone on file for ${where}${t.commonArea ? " (common area)" : ""}.`); return; }
        const fix = lastFixRef.current;
        const to = jobLatLng(j);
        const mins = fix && to && Date.now() - fix.at < 15 * 60000 ? Math.max(10, Math.round(distanceMiles(fix, to) * 1.35 / 15 * 60)) : 30;
        const at = new Date(Math.ceil((Date.now() + mins * 60000) / 300000) * 300000);
        const time = at.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
        const raw = (t.name || "").split(/\s+/)[0];
        const hi = raw && raw.length > 1 ? `Hi ${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "Hello";
        const text = `${hi}, this is Jot from United Angel Construction. I'm running a little late for the HPD repair at ${where}. I'll be there around ${time}. Sorry for the wait.`;
        showPanel({ heard, reply: `I wrote the tenant at ${where}: "${text}" Tap to send it.`, actions: [{ label: `💬 Send: there around ${time}`, href: smsHref(t.phone, text) }] });
        speak(`I wrote the tenant: you'll be there around ${time}. Tap send.`, 150);
        return;
      }
      if (cmd.intent === "navigate" && cmd.there) {
        // 🧭 "Take me there": one word, Waze opens (the Waze / Google buttons stay in the chat in case it doesn't).
        showPanel({ heard, reply: `Taking you to ${where} (${jobId(j)}) in Waze…`, actions: [{ label: "Waze", href: wazeHref(j), id: jobId(j), via: "Waze" }, { label: "Google Maps", href: directionsHref(j), id: jobId(j), via: "Google" }] });
        recordTravel(j, "Waze");
        robotWalkRef.current(jobId(j));
        speak(sayOmo(`Taking you to ${where}.`), 100, () => { window.location.href = wazeHref(j); });
        return;
      }
      if (cmd.intent === "navigate") {
        // With the tenant's phone on file: "on my way" in one tap too (26 Oct), before you drive.
        const raw = (t.name || "").split(/\s+/)[0];
        const hi = raw && raw.length > 1 ? `Hi ${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "Hello";
        const onWay = t.phone && !t.commonArea ? [{ label: "🚚 Text: on my way", href: smsHref(t.phone, `${hi}, this is Jot from United Angel Construction. We are on the way to ${where} for the HPD repair. See you soon.`) }] : [];
        showPanel({ heard, reply: `${where} (${jobId(j)}). Pick Waze or Google.${onWay.length ? " Tap \"on my way\" first to let the tenant know." : ""}`, actions: [{ label: "Waze", href: wazeHref(j), id: jobId(j), via: "Waze" }, { label: "Google Maps", href: directionsHref(j), id: jobId(j), via: "Google" }, ...onWay] });
        speak(sayOmo(`${where}. Pick Waze or Google.`), 200);
        return;
      }
      // Arrived: read back, then yes.
      answer(`Start ${where}, job ${jobId(j)}? Say yes, or tap Yes.`, { id: jobId(j), outcome: "ARRIVED" });
      return;
    }
    if (cmd.intent === "awards") {
      // Wins: HPD's "Confirmation of award" emails (same day) plus HPD's award list (a day or two behind).
      void (async () => {
        const nyDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
        const today = nyDay(new Date());
        const from = cmd.days === -1 ? nyDay(new Date(Date.now() - 86400000)) : nyDay(new Date(Date.now() - Math.max(0, cmd.days - 1) * 86400000));
        const to = cmd.days === -1 ? from : today;
        const inRange = (day: string) => day >= from && day <= to;
        const won = new Map<string, { day: string; address: string }>();
        for (const t of threads || []) for (const m of t.messages) {
          if (!m.hpd || m.mine || !/confirmation of award|awarding omo|you have been awarded/i.test(`${t.subject} ${m.text}`)) continue;
          const day = nyDay(new Date(m.at));
          if (!inRange(day)) continue;
          for (const o of new Set([...(m.text.match(/[A-Z]{2}\d{5}/g) || []), ...(t.omos.length === 1 ? t.omos : [])])) won.set(o, { day, address: addressOf(o) });
        }
        const awards = await fetch("/data/market_awards.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
        for (const a of Array.isArray(awards?.jobs) ? awards.jobs : []) if (a.won && inRange(String(a.awardDate || "")) && !won.has(a.omo)) won.set(a.omo, { day: a.awardDate, address: a.address || addressOf(a.omo) });
        const list = [...won.entries()].sort((a, b) => b[1].day.localeCompare(a[1].day));
        if (list.length) lastJobsRef.current = { ids: list.map(([o]) => o), at: Date.now() };
        const say = (o: string, w: { day: string; address: string }) => `${o}${w.address ? ` at ${w.address.replace(/,\s*\d{5}$/, "")}` : ""}${cmd.days > 1 ? ` on ${new Date(`${w.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}` : ""}`;
        if (list.length && cmd.describe) {
          // Each won job in plain words (owner, 22 Oct: "read me the description"): the job file, else the job index.
          const idx = await loadSearchIndex().then((d) => d?.items || null).catch(() => null) || await fetch("/data/search-index.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => d.items || []).catch(() => []);
          const descOf = (o: string) => { const j = findAnyJob(o); const text = j ? jobScope(j) : (idx.find((i: { omo: string }) => i.omo === o)?.desc || ""); const sum = jobSummary(text); return sum.lines.length ? sum.lines.map(lineText).join(", ") : text.replace(/\s+/g, " ").slice(0, 140); };
          answer(`You won ${list.length} job${list.length === 1 ? "" : "s"} ${cmd.label}. ${list.slice(0, 5).map(([o, w], i) => `${list.length > 1 ? `${i + 1}: ` : ""}${w.address ? w.address.replace(/,\s*\d{5}$/, "") : o}, ${descOf(o) || "no description on file yet"}.`).join(" ")}${list.length > 5 ? ` And ${list.length - 5} more.` : ""}`);
          return;
        }
        if (list.length) { answer(`You won ${list.length} job${list.length === 1 ? "" : "s"} ${cmd.label}: ${list.slice(0, 6).map(([o, w]) => say(o, w)).join("; ")}${list.length > 6 ? `, and ${list.length - 6} more` : ""}. Say "read me the jobs I won ${cmd.label}" to hear what they are.`); return; }
        // None: the last one on record.
        let last: { omo: string; day: string } | null = null;
        for (const a of Array.isArray(awards?.jobs) ? awards.jobs : []) if (a.won && (!last || String(a.awardDate) > last.day)) last = { omo: a.omo, day: String(a.awardDate) };
        // The award emails are a day or two ahead of HPD's list.
        for (const t of threads || []) for (const m of t.messages) {
          if (!m.hpd || m.mine || !/confirmation of award|awarding omo|you have been awarded/i.test(`${t.subject} ${m.text}`)) continue;
          const day = nyDay(new Date(m.at));
          const o = (m.text.match(/[A-Z]{2}\d{5}/) || t.omos)[0];
          if (o && (!last || day > last.day)) last = { omo: o, day };
        }
        answer(`No awards ${cmd.label} yet.${last ? ` Your last one was ${last.omo}, ${new Date(`${last.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "numeric", day: "numeric" })}.` : ""}`);
      })();
      return;
    }
    if (cmd.intent === "ask") {
      // A free question: the AI answers from what the app knows (no tenant names), it can't change anything.
      if (!multiRef.current) setAgent({ heard, reply: "Thinking…" });
      void (async () => {
        const nyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
        const bidsData = await fetch("/data/upcoming_bids.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
        const wx = await fetchWeather();
        const clockNow = nyNow();
        const facts = {
          // Weather and traffic (27 Oct), so "should I do the roof today?" or "plan my day" can use them.
          weather: wx ? `${weatherReport(wx, "today", clockNow.iso).text} ${weatherReport(wx, "tomorrow", clockNow.iso).text}`.trim() : "",
          traffic: trafficNote(clockNow.iso, clockNow.weekday),
          parking: aspAnswer(clockNow.iso.slice(0, 10), "Today"),
          now: new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }),
          notices: boardOpenRows.slice(0, 40).map((r) => ({ job: r.omo, address: addressOf(r.omo), kind: r.kind === "docs" ? "missing documents" : `${r.hours}-hour notice`, from: r.who, hoursLeft: r.dueAt ? Math.round(hoursLeft(r, Date.now())) : null, want: r.want, status: boardSide(r), pdfAlreadyEmailed: r.filed ? r.filed.at.slice(0, 10) : null })),
          openBids: (Array.isArray(bidsData?.bids) ? bidsData.bids : []).filter((b: { bidDue?: string }) => (b.bidDue || "") >= nyDay).slice(0, 40).map((b: { omo: string; borough?: string; description?: string; bidDue: string; bidDueTime?: string }) => ({ job: b.omo, borough: b.borough, work: jobSummary(b.description || "").lines.map(lineText).join("; ").slice(0, 160), due: `${b.bidDue} ${b.bidDueTime || ""}`.trim() })),
          money: { heldByRejections: payTrack.summary.held, rejectionsToFix: payTrack.summary.toFix },
          jobs: { toDo: jobRows.filter((r) => r.group === "todo").length, closeOut: jobRows.filter((r) => r.group === "closeout").length, secondTry: jobRows.filter((r) => r.group === "secondtry").length, waitingOnHpd: jobRows.filter((r) => r.group === "waiting").length, oldestToDo: jobRows.filter((r) => r.group === "todo").sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, 8).map((r) => ({ job: r.id, address: r.address, due: r.due })) },
          // More to answer from (23 Oct "make AI much better"): wins this week and HPD's emails of the last 3 days.
          winsThisWeek: (threads || []).flatMap((t) => t.messages.filter((m) => m.hpd && !m.mine && /confirmation of award|awarding omo/i.test(`${t.subject} ${m.text}`) && Date.now() - Date.parse(m.at) < 7 * 86400000).map((m) => ({ job: (m.text.match(/[A-Z]{2}\d{5}/) || t.omos)[0] || "", day: new Date(m.at).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "numeric", day: "numeric" }) }))).slice(0, 30).map((w) => ({ ...w, address: addressOf(w.job) })),
          hpdEmailsLast3Days: (threads || []).flatMap((t) => t.messages.filter((m) => m.hpd && !m.mine && Date.now() - Date.parse(m.at) < 3 * 86400000).map((m) => ({ ts: Date.parse(m.at), at: new Date(m.at).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }), from: senderName(m.from || ""), job: t.omos[0] || "", about: summarizeHpd({ kind: emailKind(t.subject, (t as { kind?: string }).kind || "", m.from || ""), subject: t.subject, text: m.text, omo: t.omos[0] || "" }).replace(/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/g, "(phone)") }))).sort((a, b) => b.ts - a.ts).slice(0, 25).map(({ ts, ...e }) => { void ts; return e; }),
          todaysRoute: todayRouteIds(),
          // The most pressing thing right now (the map's pill), so the AI can bring it up without being asked (27 Oct).
          nextStep: nextStepRef.current?.text || "",
          // Your open jobs, so the AI can name the right one for an action (no tenant names or phones).
          toDoJobs: jobRows.filter((r) => r.group === "todo").slice(0, 40).map((r) => ({ job: r.id, address: r.address })),
          jobOnScreen: selectedJob ? { job: jobId(selectedJob), address: jobAddress(selectedJob), work: jobSummary(jobScope(selectedJob)).lines.map(lineText).join("; "), status: jobStatus(selectedJob),
            // Contacts with the tenant (what was done and when; no names or phones).
            tenantContacts: (Array.isArray(selectedJob.FieldVisitHistory) ? selectedJob.FieldVisitHistory as { recordedAt?: string; outcome?: string | null; note?: string }[] : [])
              .filter((v) => /tenant/i.test(String(v?.note || "")) || /^APPOINTMENT_/.test(String(v?.outcome || ""))).slice(-6)
              .map((v) => ({ at: v.recordedAt ? new Date(v.recordedAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "", what: String(v.outcome && /^APPOINTMENT_/.test(v.outcome) ? `${v.outcome} ${v.note || ""}` : v.note || "").replace(/\(?\d{3}\)?[ -]?\d{3}-\d{4}/g, "").slice(0, 140) })) } : null,
          // 🧠 Smarter (owner, 4 Nov: "answer any questions I have for my app"): any job named in the question in full,
          // the bids you sent, upcoming appointments, this week's and month's numbers, all jobs by stage, and when the
          // question is about the app, the newest changes.
          jobsNamed: [...new Set((cmd.question.toUpperCase().match(/\b[A-Z]{2}\s?\d{5}\b/g) || []).map((x) => x.replace(/\s/g, "")))].slice(0, 4).map((id) => {
            const j = findAnyJob(id);
            if (!j) return { job: id, found: false };
            const ap = activeAppointment(j as unknown as Record<string, unknown>);
            return { job: id, address: jobAddress(j), status: jobStatus(j), stage: jobQueue(j), work: jobSummary(jobScope(j)).lines.map(lineText).join("; ") || jobScope(j).slice(0, 300), outcome: String(value(j, ["FieldOutcome", "fieldOutcome"]) || ""), arrivedAt: String(value(j, ["FieldArrivedAt"]) || ""), appointment: ap ? appointmentLabel(ap) : "" };
          }),
          bidsSent: (() => {
            try {
              const recs = Object.values(JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}")) as { omo: string; address?: string; bidDue?: string; price?: number; sentPrice?: number; status?: string; sentAt?: string }[];
              const sent = recs.filter((r) => r && r.sentAt && ["sent", "confirmed", "failed", "unconfirmed"].includes(String(r.status))).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
              const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
              const weekAgo = Date.now() - 7 * 86400000;
              return { today: sent.filter((r) => day(String(r.sentAt)) === nyDay).length, last7Days: sent.filter((r) => Date.parse(String(r.sentAt)) > weekAgo).length, total: sent.length, latest: sent.slice(0, 25).map((r) => ({ job: r.omo, address: r.address || "", due: r.bidDue || "", price: Number(r.sentPrice || r.price || 0), fax: r.status, sent: new Date(String(r.sentAt)).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) })) };
            } catch { return null; }
          })(),
          appointments: jobs.map((j) => ({ j, a: activeAppointment(j as unknown as Record<string, unknown>) })).filter((x) => x.a && x.a.date >= nyDay).sort((x, y) => `${x.a!.date}${x.a!.start}`.localeCompare(`${y.a!.date}${y.a!.start}`)).slice(0, 12).map((x) => ({ job: jobId(x.j), address: jobAddress(x.j), when: appointmentLabel(x.a!), confirmed: x.a!.state === "confirmed" })),
          numbers: (() => {
            const pick = (p: "today" | "week" | "month") => { const st = fieldStats(jobs, p, { skip: (job) => isTestJob(jobId(job)) }); return { ...st.counts, earned: Math.round(st.earned) }; };
            return { today: pick("today"), thisWeek: pick("week"), thisMonth: pick("month") };
          })(),
          allJobsByStage: jobRows.reduce((m: Record<string, number>, r) => { m[r.group] = (m[r.group] || 0) + 1; return m; }, {}),
          bidsDueToday: { stillToSend: bidsDue.unsentToday || 0, sentToday: bidsDue.sentToday || 0, firstDue: bidsDue.firstTime || "", tomorrow: bidsDue.tomorrow },
          appChanges: /\b(app|button|screen|where is|how do i|how can i|can i|does it|feature|setting|robot|claude|update|new)\b/i.test(cmd.question) ? await loadWhatsNew().then((v) => (Array.isArray(v) ? v.slice(0, 3).flatMap((x: { items?: string[] }) => x.items || []).slice(0, 30).map((t: string) => t.split(/(?<=[.!?])\s/)[0].slice(0, 160)) : [])).catch(() => []) : [],
          // 🧠 What you told it to remember (last 30), so answers use your own rules.
          myNotes: loadNotes().slice(-30).map((n) => ({ note: n.text, saved: String(n.at || "").slice(0, 10) })),
          // 📈 The last 3 months: bids sent (this phone), jobs won and money awarded (HPD's award dates), the win rate and
          // what kind of work won.
          trends: (() => {
            const month = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date(iso));
            const months = [0, 1, 2].map((k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return month(d.toISOString()); });
            let recs: { sentAt?: string; sentPrice?: number; price?: number; status?: string }[] = [];
            try { recs = Object.values(JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}")); } catch { /* private mode */ }
            return months.map((m) => {
              const sent = recs.filter((r) => r && r.sentAt && month(r.sentAt) === m);
              const won = jobs.filter((j) => { const d = String(value(j, ["AwardDate"]) || ""); return d && !isTestJob(jobId(j)) && !Number.isNaN(Date.parse(d)) && month(new Date(d).toISOString()) === m; });
              const amounts = won.map((j) => Number(String(value(j, ["AwardAmount"]) || "").replace(/[^0-9.]/g, ""))).filter((n) => n > 0);
              const kinds: Record<string, number> = {};
              for (const j of won) { const k = (jobSummary(jobScope(j)).lines[0] ? lineText(jobSummary(jobScope(j)).lines[0]) : "other").split(/[·(,]/)[0].trim().slice(0, 30) || "other"; kinds[k] = (kinds[k] || 0) + 1; }
              const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
              return { month: m, daysCounted: m === months[0] ? Number(today.slice(8, 10)) : "whole month", bidsSent: sent.length, avgBidSent: sent.length ? Math.round(sent.reduce((a, r) => a + Number(r.sentPrice || r.price || 0), 0) / sent.length) : 0, jobsWon: won.length, moneyAwarded: Math.round(amounts.reduce((a, n) => a + n, 0)), avgAward: amounts.length ? Math.round(amounts.reduce((a, n) => a + n, 0) / amounts.length) : 0, winRate: sent.length ? `${Math.round((won.length / sent.length) * 100)}%` : "", wonMost: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`) };
            });
          })(),
          // 📩 Asked about emails: the full text of HPD's 10 newest (last 14 days).
          hpdEmails: /\b(email|e-mail|emails|wrote|write|said|say|message|messages|lewis|gafur|hpd asked|asked for|inspector|vendor tracking)\b/i.test(cmd.question) ? (threads || []).flatMap((t) => t.messages.filter((m) => m.hpd && !m.mine && Date.now() - Date.parse(m.at) < 14 * 86400000).map((m) => ({ ts: Date.parse(m.at), at: new Date(m.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }), from: senderName(m.from || ""), job: t.omos[0] || "", subject: t.subject.slice(0, 120), text: String(m.text || "").replace(/\s+/g, " ").slice(0, 1200) }))).sort((a, b) => b.ts - a.ts).slice(0, 10).map(({ ts: _ts, ...e }) => e) : [],
          // What was just said (last 4 turns, last 15 minutes), so "and that one?" or "text them" follows on.
          recentConversation: chatRef.current.filter((c) => Date.now() - c.at < 15 * 60000).slice(-4).map(({ you, helper }) => ({ you, helper })),
        };
        try {
          const r = await fetch("/api/drive/hpd-ask", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: cmd.question, facts }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok && d.ai && d.text) {
            // The AI can also pick app actions (DO: lines, 23 Oct "combine all AI"): each runs like you said it, so a
            // save still asks for your yes and a text still opens Messages for you to send.
            const lines = String(d.text).split(/\r?\n/);
            const said = lines.filter((l) => !/^(DO|ASK):/i.test(l)).join(" ").trim();
            // 💬 The next question it suggests (ASK: lines) becomes buttons; 📊 "how am I doing" gets bars for 3 months.
            const nextAsks = lines.filter((l) => /^ASK:/i.test(l)).map((l) => l.replace(/^ASK:\s*/i, "").trim()).filter(Boolean).slice(0, 2);
            const trendChart = /\b(how am i doing|how'?s business|win rate|trend|trends|compare|compared|month|months|going (down|up)|doing better|doing worse)\b/i.test(cmd.question) && Array.isArray(facts.trends) && facts.trends.length
              ? { title: "Bids sent and jobs won", aName: "Bids sent", bName: "Jobs won", rows: [...facts.trends].reverse().map((m) => ({ label: new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short" }) + (m.daysCounted === "whole month" ? "" : " (so far)"), a: m.bidsSent, b: m.jobsWon })) }
              : undefined;
            const extras = () => { if (!multiRef.current && (nextAsks.length || trendChart)) setAgent((a) => (a ? { ...a, chart: trendChart, offers: a.offers?.length ? [...a.offers, ...nextAsks].slice(0, 4) : nextAsks.length ? nextAsks : a.offers, offersLabel: a.offers?.length ? a.offersLabel : nextAsks.length ? "Ask next:" : a.offersLabel } : a)); };
            const dos = lines.filter((l) => /^DO:/i.test(l)).map((l) => l.replace(/^DO:\s*/i, "").trim())
              .filter((x) => { const c = parseCommand(x); return c.intent !== "ask" && c.intent !== "search" && !(c.intent === "navigate" && c.ref && !/[a-z]{2}\s?\d{5}|\d/i.test(c.ref)); }).slice(0, 3);
            chatRef.current = [...chatRef.current, { you: cmd.question.slice(0, 200), helper: `${said}${dos.length ? ` (did: ${dos.join("; ")})` : ""}`.slice(0, 300), at: Date.now() }].slice(-8);
            // A question gets the answer, and what the AI would do is offered to tap (owner, 3 Nov: "give me an answer,
            // then ask me to open the list or not"). An order ("text the tenant") still runs.
            const question = /\?\s*$|^\s*(should|shall|can|could|is|are|was|will|would|do|does|did|what|which|when|where|why|how|who|any)\b/i.test(cmd.question);
            if (dos.length && question && said) { answer(said); if (!multiRef.current) setAgent((a) => (a ? { ...a, offers: dos } : a)); extras(); return; }
            if (dos.length) { multiRef.current = { heard, queue: dos.slice(1), replies: said ? [said] : [] }; agentRef.current(dos[0], true); return; }
            answer(said || d.text);
            extras();
            return;
          }
          // Signed out: the AI is on, but it answers only for your account (owner, 22 Oct: "switch on AI").
          if (r.status === 401 || d.reconnectRequired) { setAgent({ heard, reply: "The AI is on. It answers only when this phone is signed in with Google: tap Sign in below, then ask me again.", signIn: true }); speak("The AI is on. Sign in with Google on this phone, then ask me again.", 200); return; }
          answer(d.reason === "not-set-up" ? "Free questions need the AI switched on for the app. I can do: I finished this job, read me this job, read me the new bids, what do I have today, which notices are open." : `I couldn't answer that right now. ${d.reason || ""}`.trim());
        } catch { answer("No connection right now. Try again in a minute."); }
      })();
      return;
    }
    if (cmd.intent === "yes") {
      const p = pendingRef.current; const c = agent?.confirm || (p && Date.now() - p.at < 120000 ? p : null);
      const job = c ? jobs.find((j) => jobId(j) === c.id) : null;
      if (!c || !job) { answer("There's nothing waiting for a yes."); return; }
      if (c.outcome === "SMS") {
        const p = pendingSmsRef.current;
        if (!p || p.id !== c.id) { answer("Say the text again."); return; }
        pendingSmsRef.current = null;
        void smsNow(job, p.text).then((r) => answer(r.sent ? `Sent. ${r.message.replace(/^✓ /, "")}` : r.message));
        return;
      }
      if (c.outcome === "APPOINTMENT") {
        const p = pendingApptRef.current;
        if (!p || p.id !== c.id) { answer("Say the appointment again, with the day and time."); return; }
        pendingApptRef.current = null;
        try { saveAppointment(job, p.appt); } catch (e) { answer(`Not saved: ${e instanceof Error ? e.message : "check the time"}.`); return; }
        const t = tenantInfo(job);
        const where = jobAddress(job).replace(/,\s*\d{5}$/, "");
        const first = (t.name || "").split(/\s+/)[0];
        const hello = first && first.length > 1 ? `Hi ${first[0].toUpperCase()}${first.slice(1).toLowerCase()}` : "Hello";
        const text = `${hello}, this is Jot from United Angel Construction. We are scheduled to come to ${where}${t.apt ? `, apt ${t.apt.replace(/^apt\.?\s*/i, "")}` : ""} on ${appointmentLabel(p.appt).replace(" · ", " between ").replace("–", " and ")} for the HPD repair. Please reply to confirm. Thank you.`;
        const actions: { label: string; href: string }[] = [];
        // Text service on: the confirmation goes to the tenant by itself (owner, 23 Oct: the AI can text for me).
        if (smsReady && t.phone && !t.commonArea) {
          actions.push({ label: "🔔 Add to Calendar", href: appointmentCalendarHref(jobId(job), jobAddress(job), { ...p.appt, phone: "" }, window.location.origin) });
          void smsNow(job, text, true).then((r) => showPanel({ heard, reply: `Saved: ${where} on ${appointmentLabel(p.appt)}. ${r.sent ? `I texted ${first || "the tenant"} the time.` : `The text didn't go (${r.message.replace(/^Not sent: /, "")}).`} Add it to your calendar so your phone reminds you.`, actions }));
          return;
        }
        if (t.phone && !t.commonArea) actions.push({ label: `📱 Text ${first || "the tenant"} the time`, href: smsHref(t.phone, text) });
        actions.push({ label: "🔔 Add to Calendar", href: appointmentCalendarHref(jobId(job), jobAddress(job), { ...p.appt, phone: "" }, window.location.origin) });
        showPanel({ heard, reply: `Saved: ${where} on ${appointmentLabel(p.appt)}. ${actions.length > 1 ? "Text the tenant the time (you press Send in Messages), and add it to your calendar so your phone reminds you." : "There's no tenant phone on file; add it to your calendar so your phone reminds you."}`, actions });
        return;
      }
      if (c.outcome === "ARRIVED") { openIssueJob(job); markArrived(job); answer(`Started. You're at ${jobAddress(job)}: the arrival is saved.`); window.setTimeout(() => offerOutside(job), 2500); return; }
      const said = pendingOutcomeRef.current;
      pendingOutcomeRef.current = null;
      if (said && said.id === c.id && said.outcome === c.outcome) {
        // Saved like the job card: that day, who refused, then the package (affidavit + invoice) opens.
        saveOutcomeFor(job, { outcome: c.outcome, note: "Said to the voice helper", date: said.date, who: said.who });
        const fresh = { ...job, ...(readSharedWorkflowOverrides()[c.id] || {}) };
        if (value(fresh, ["FieldOutcome"]) !== c.outcome) { answer("Not saved. Open the job card to check it."); return; }
        const waiting = secondTryState(fresh);
        answer(`Saved. ${jobAddress(job)} is marked ${FIELD_OUTCOMES[c.outcome].toLowerCase()}${said.date ? ` on ${said.date.slice(5).replace("-", "/")}` : ""}.${waiting ? ` Come back from ${waiting.dueLabel} for the 2nd try.` : " The package opens next."}`);
        return;
      }
      setJobOutcome(job, c.outcome, "Said to the voice helper");
      answer(`Saved. ${jobAddress(job)} is marked ${FIELD_OUTCOMES[c.outcome].toLowerCase()}.`);
      return;
    }
    if (cmd.intent === "no") { pendingOutcomeRef.current = null; answer("OK, nothing saved."); return; }
    if (cmd.intent === "read-job" && !cmd.ref && lastJobsRef.current && Date.now() - lastJobsRef.current.at < 15 * 60000 && (cmd.pick || cmd.all || !selectedJob)) {
      const ids = cmd.pick ? lastJobsRef.current.ids.slice(cmd.pick - 1, cmd.pick) : lastJobsRef.current.ids.slice(0, 5);
      if (!ids.length) { answer(`I only listed ${lastJobsRef.current.ids.length}.`); return; }
      void (async () => {
        const idx = await loadSearchIndex().then((d) => d?.items || null).catch(() => null) || await fetch("/data/search-index.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => d.items || []).catch(() => []);
        const bidsData = await fetch("/data/upcoming_bids.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
        const one = (o: string) => {
          const j = findAnyJob(o);
          const item = idx.find((i: { omo: string }) => i.omo === o);
          const bid = (Array.isArray(bidsData?.bids) ? bidsData.bids : []).find((b: { omo: string }) => b.omo === o);
          const text = j ? jobScope(j) : bid?.description || item?.desc || "";
          const sum = jobSummary(text);
          const where = (j ? jobAddress(j) : bid?.address || item?.address || o).replace(/,\s*\d{5}$/, "");
          const loc = [...sum.where, ...sum.rooms].join(", ");
          return `${where}: ${sum.lines.length ? sum.lines.map(lineText).join(", ") : text.replace(/\s+/g, " ").slice(0, 160) || "no description on file yet"}${loc ? `, ${loc}` : ""}.`;
        };
        answer(ids.length === 1 ? one(ids[0]) : ids.map((o, i) => `${i + 1}: ${one(o)}`).join(" "));
      })();
      return;
    }
    if (cmd.intent === "outcome" || cmd.intent === "read-job") {
      const job = pick(cmd.ref);
      if (job === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!job) { answer(cmd.ref ? `I can't find ${cmd.ref} in your jobs. Say the job number, letter by letter.` : "Which job? Open its card, or say the job number."); return; }
      if (cmd.intent === "read-job") {
        const scope = jobScope(job);
        const sum = jobSummary(scope);
        const plain = sum.lines.map(lineText).join(". ");
        const where = [...sum.where, ...sum.rooms].join(", ");
        const mine = notesFor(jobAddress(job), loadNotes());
        answer(`${jobAddress(job)}. ${mine.length ? `You told me: ${mine.map((n) => n.text).join("; ")}. ` : ""}${plain ? `The job: ${plain}.` : ""}${where ? ` Where: ${where}.` : ""} HPD says: ${scope.replace(/\s+/g, " ").slice(0, 400)}`);
        return;
      }
      // The day it happened and who refused, as on the job card (31 Oct): a refusal needs the description first.
      const today = nyToday();
      const date = cmd.date && cmd.date < today ? cmd.date : undefined;
      if (cmd.outcome === "REFUSED_ACCESS" && !cmd.who) {
        pendingWhoRef.current = { id: jobId(job), date, at: Date.now() };
        answer(`Refused access at ${jobAddress(job).replace(/,\s*\d{5}$/, "")}${date ? ` on ${dayWord(date)} ${date.slice(5).replace("-", "/")}` : ""}. Who refused? Describe them, like: male, tall, dark hair.`);
        return;
      }
      pendingOutcomeRef.current = { id: jobId(job), outcome: cmd.outcome, date, who: cmd.who };
      const when = date ? ` on ${dayWord(date)} ${date.slice(5).replace("-", "/")}` : "";
      answer(`Mark ${jobAddress(job)}, job ${jobId(job)}, as ${FIELD_OUTCOMES[cmd.outcome].toLowerCase()}${when}${cmd.who ? `, refused by ${cmd.who.toUpperCase()}` : ""}? Say yes, or tap Yes.`, { id: jobId(job), outcome: cmd.outcome });
      return;
    }
    if (cmd.intent === "appointment") {
      // "Make an appointment for EQ15239 Thursday at 10" (23 Oct): saved after your yes, then a ready text to the tenant
      // with the time (you press Send in Messages) and Add to Calendar so the phone reminds you.
      const found = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob;
      if (found === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!found) { answer(cmd.ref ? `I can't find ${cmd.ref} in your jobs.` : "Which job? Open it, or say the job number with the day and time, like: make an appointment for E Q 1 5 2 3 9 Thursday at 10."); return; }
      const where = jobAddress(found).replace(/,\s*\d{5}$/, "");
      if (!cmd.date || !cmd.time) { answer(`What day and time for ${where}? Say it again with both, like: appointment Thursday at 10.`); return; }
      const t = tenantInfo(found);
      const appt: Appointment = { date: cmd.date, start: cmd.time, end: hourAfter(cmd.time), state: "requested", contact: t.name || "Tenant", phone: t.phone || "", note: "Made by voice", reminder: 60 };
      try { validateAppointment(appt); } catch (e) { answer(`${e instanceof Error ? e.message : "That time doesn't work."} Say another day and time.`); return; }
      const clash = appointmentConflicts(appt, jobs, jobId(found)).map((j) => jobId(j));
      pendingApptRef.current = { id: jobId(found), appt };
      answer(`Appointment at ${where} (${jobId(found)}) on ${appointmentLabel(appt)}${t.name ? ` with ${t.name.split(/\s+/)[0]}` : ""}?${clash.length ? ` Careful: it overlaps ${clash.join(", ")}.` : ""} Say yes, or tap Yes.`, { id: jobId(found), outcome: "APPOINTMENT" });
      return;
    }
    if (cmd.intent === "remind") {
      // "Remind me to call Lewis at 3" (23 Oct): the app rings and says it at that time while it's open, and Add to
      // Calendar makes the phone remind you even when the app is closed.
      if (!cmd.time && !cmd.date) { answer(`When should I remind you to ${cmd.what}? Say it with a time, like: remind me to ${cmd.what} at 3.`); return; }
      const today = nyToday();
      let date = cmd.date || today;
      const time = cmd.time || "09:00";
      const nowNy = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      if (!cmd.date && time <= nowNy) date = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      const item = { id: `r${Date.now()}`, what: cmd.what, date, time };
      saveReminders([...readReminders(), item]);
      const label = appointmentLabel({ date, start: time, end: hourAfter(time) } as Appointment).replace(/–.*$/, "").replace(/ · /, " at ");
      const cal = `${window.location.origin}/api/appointment-calendar?${new URLSearchParams({ kind: "reminder", id: "reminder", what: cmd.what, date, time })}`;
      showPanel({ heard, reply: `OK. I'll remind you to ${cmd.what} on ${label}. Tap Add to Calendar so your phone reminds you even with the app closed.`, actions: [{ label: "🔔 Add to Calendar", href: cal }] });
      return;
    }
    if (cmd.intent === "tenant-texts") {
      // "Any texts from tenants?" (23 Oct): the latest replies (3 days), newest first, each with its job.
      let list: { omo: string; body: string; at: string }[] = [];
      try { list = JSON.parse(localStorage.getItem("hpd-tenant-replies") || "[]"); } catch { /* private mode */ }
      list = list.filter((r) => Date.now() - Date.parse(r.at) < 3 * 86400000).reverse();
      if (!list.length) { answer(smsReady ? "No texts from tenants in the last 3 days." : "No tenant texts here yet: they come into the app once the texting service is connected (see 🤖 Autopilot)."); return; }
      const ids = [...new Set(list.map((r) => r.omo).filter(Boolean))];
      if (ids.length) lastJobsRef.current = { ids: ids.slice(0, 5), at: Date.now() };
      const lines = list.slice(0, 4).map((r) => { const j = jobs.find((x) => jobId(x) === r.omo); const who = j ? (tenantInfo(j).name || "").split(/\s+/)[0] || jobAddress(j).replace(/,\s*\d{5}$/, "") : "Someone"; return `${who}${j ? ` (${jobAddress(j).replace(/,\s*\d{5}$/, "")})` : ""}: "${r.body}"`; });
      answer(`${list.length} text${list.length === 1 ? "" : "s"} from tenants. ${lines.join(" ")}`);
      return;
    }
    if (cmd.intent === "appointments") {
      // "What appointments do I have?" (23 Oct): coming ones in time order (today / tomorrow / all), with Waze buttons.
      const today = nyToday();
      const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      const list = jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).filter((x) => x.a && !appointmentTiming(x.a).past)
        .filter((x) => cmd.when === "all" || x.a!.date === (cmd.when === "today" ? today : tomorrow))
        .sort((p, q) => `${p.a!.date}${p.a!.start}`.localeCompare(`${q.a!.date}${q.a!.start}`));
      const span = cmd.when === "all" ? "coming up" : cmd.when;
      if (!list.length) { answer(`No appointments ${span}.`); return; }
      lastJobsRef.current = { ids: list.slice(0, 5).map((x) => jobId(x.j)), at: Date.now() };
      const lines = list.slice(0, 4).map((x) => `${appointmentLabel(x.a!)} at ${jobAddress(x.j).replace(/,\s*\d{5}$/, "")}${x.a!.state === "requested" ? " (not confirmed yet)" : ""}`);
      showPanel({ heard, reply: `${list.length} appointment${list.length === 1 ? "" : "s"} ${span}: ${lines.join("; ")}${list.length > 4 ? `, and ${list.length - 4} more` : ""}.`, cards: list.slice(0, 4).map((x) => chatCard(jobId(x.j), "job")).filter((c): c is ChatCard => Boolean(c)),
        actions: [...list.filter((x) => needsReminder(x.j, x.a)).slice(0, 3).map((x) => ({ label: `📅 Text reminder · ${jobAddress(x.j).replace(/,\s*\d{5}$/, "")}`, href: smsHref(tenantInfo(x.j).phone, reminderText(x.j, x.a!)), id: jobId(x.j), remind: x.a!.date })),
          ...list.slice(0, 3).map((x) => ({ label: `Waze · ${jobAddress(x.j).replace(/,\s*\d{5}$/, "")}`, href: wazeHref(x.j), id: jobId(x.j), via: "Waze" as const }))].slice(0, 4) });
      return;
    }
    if (cmd.intent === "no-bid") {
      const omo = document.querySelector('[data-hpd-smoke="fc-bid-sheet"] header strong')?.textContent?.trim();
      if (!bidsOpen || !omo) { answer('Open the bid first, then say "no bid" and why.'); return; }
      const on = (e: Event) => { window.removeEventListener("hpd-no-bid-answer", on); const hint = String((e as CustomEvent<string>).detail || ""); answer(hint ? `No bid on ${omo}: tap "${hint}" to confirm.` : `No bid on ${omo}: tap the reason.`); };
      window.addEventListener("hpd-no-bid-answer", on);
      window.dispatchEvent(new CustomEvent("hpd-no-bid", { detail: cmd.reason }));
      return;
    }
    if (cmd.intent === "bid-advice") {
      const omo = document.querySelector('[data-hpd-smoke="fc-bid-sheet"] header strong')?.textContent?.trim();
      if (!bidsOpen || !omo) { answer('Open a bid first, then ask "what should I bid".'); return; }
      const on = (e: Event) => { window.removeEventListener("hpd-bid-advice-answer", on); answer(String((e as CustomEvent<string>).detail || "I couldn't work out a price for this one.")); };
      window.addEventListener("hpd-bid-advice-answer", on);
      window.dispatchEvent(new Event("hpd-bid-advice"));
      return;
    }
    if (cmd.intent === "photo") {
      setAgent({ heard, reply: "Tap 📷 below and take the photo: I'll say what it is, the job number, dates and what to do." });
      speak("Tap the camera button below and take the photo.", 200);
      return;
    }
    if (cmd.intent === "driving") {
      if (cmd.on === drivingRef.current) { answer(cmd.on ? "Driving mode is already on: I'm listening." : "Driving mode is already off."); return; }
      setDrivingRef.current(cmd.on);
      return;
    }
    if (cmd.intent === "bid-usual") {
      // The open bid's kind of work at your usual price (BidsMode works it out from your own bids and answers here).
      const omo = document.querySelector('[data-hpd-smoke="fc-bid-sheet"] header strong')?.textContent?.trim();
      if (!bidsOpen || !omo) { answer(`Open the bid first, then say "bid the usual".`); return; }
      window.dispatchEvent(new CustomEvent("hpd-bid-usual", { detail: (text: string) => answer(text) }));
      return;
    }
    if (cmd.intent === "bid-price") {
      const omo = document.querySelector('[data-hpd-smoke="fc-bid-sheet"] header strong')?.textContent?.trim();
      if (!bidsOpen || !omo) { answer(`Open the bid first, then say "bid ${cmd.price}".`); return; }
      window.dispatchEvent(new CustomEvent("hpd-bid-price", { detail: cmd.price }));
      answer(`${money(cmd.price)} on ${omo}. Saving it now; tap Send twice when you're ready.`);
      return;
    }
    if (cmd.intent === "bids-show" || cmd.intent === "next-bid") {
      // The bids answer once they're on the map (BidsMode onChat).
      chatReplyRef.current = (reply, cards) => { if (cards) cardsRef.current = cards; answer(reply); };
      goTo("bids", "");
      setBidsChat(cmd.intent === "bids-show" ? { n: Date.now(), kind: "show", boro: cmd.boro, day: cmd.day } : { n: Date.now(), kind: "next" });
      return;
    }
    if (cmd.intent === "where-appt") {
      // "Where's my 2 PM?" (2 Nov): that appointment's job on the map, its card open. "Next": the next one coming up.
      const today = nyToday();
      const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const all = jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).filter((x) => x.a)
        .sort((p, q) => `${p.a!.date}${p.a!.start}`.localeCompare(`${q.a!.date}${q.a!.start}`));
      const hit = cmd.at < 0
        ? all.find((x) => !appointmentTiming(x.a!).past)
        : all.filter((x) => x.a!.date === today).map((x) => ({ ...x, off: cmd.at >= mins(x.a!.start) && cmd.at < mins(x.a!.end || x.a!.start) ? 0 : Math.abs(mins(x.a!.start) - cmd.at) })).filter((x) => x.off <= 60).sort((p, q) => p.off - q.off)[0];
      if (!hit) {
        const todays = all.filter((x) => x.a!.date === today);
        answer(cmd.at < 0 ? "No appointments coming up." : todays.length ? `Nothing at that time today. Today: ${todays.map((x) => `${appointmentLabel(x.a!).split(" · ")[1]} at ${jobAddress(x.j).replace(/,\s*\d{5}$/, "")}`).join("; ")}.` : "No appointments today.");
        return;
      }
      const where = jobAddress(hit.j).replace(/,\s*\d{5}$/, "");
      setBidsOpen(false);
      openIssueJob(hit.j, true);
      showPanel({ heard, cards: [], reply: `${appointmentLabel(hit.a!)}: ${where} (${jobId(hit.j)})${hit.a!.state === "requested" ? ", not confirmed yet" : ", confirmed"}. It's on the map.`, actions: [{ label: "Waze", href: wazeHref(hit.j), id: jobId(hit.j), via: "Waze" }, { label: "Google Maps", href: directionsHref(hit.j), id: jobId(hit.j), via: "Google" }] });
      speak(sayOmo(`${appointmentLabel(hit.a!).split(" · ")[1].replace("–", " to ")}: ${where}. It's on the map.`), 200);
      return;
    }
    if (cmd.intent === "come-back") {
      if (!bidsOpen) { answer("Open the bids first, then say come back after sending one."); return; }
      window.dispatchEvent(new Event("hpd-bid-come-back"));
      answer("Back to the bid you just sent.");
      return;
    }
    if (cmd.intent === "appt-confirmed") {
      // "The tenant confirmed" (27 Oct): the requested appointment becomes confirmed. Without a job number: the job on
      // screen, else the only requested appointment coming up.
      const requested = jobs.filter((x) => { const a = activeAppointment(x as Record<string, unknown>); return a && a.state === "requested" && !appointmentTiming(a).past; });
      const found = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob || (requested.length === 1 ? requested[0] : null);
      if (found === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!found) { answer(requested.length ? `Which job? ${requested.length} appointments are waiting for the tenant. Say: the tenant confirmed for E Q 1 5 2 3 9.` : "No appointment is waiting for the tenant to confirm."); return; }
      const a = activeAppointment(found as Record<string, unknown>);
      const where = jobAddress(found).replace(/,\s*\d{5}$/, "");
      if (!a) { answer(`There's no appointment on ${jobId(found)} at ${where}. Make one first.`); return; }
      if (a.state === "confirmed") { answer(`${appointmentLabel(a)} at ${where} is already confirmed.`); return; }
      try { saveAppointment(found, { ...a, state: "confirmed" }); } catch (err) { answer(`I couldn't confirm it: ${err instanceof Error ? err.message : "check the appointment"}.`); return; }
      answer(`Confirmed: ${appointmentLabel(a)} at ${where} (${jobId(found)}).`);
      return;
    }
    if (cmd.intent === "called") {
      // "I called the tenant, no answer" (23 Oct): noted on the job; no answer / voicemail -> a reminder to call again
      // tomorrow at 10; they gave a day and time -> offered as the appointment.
      const found = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob || (lastCallRef.current ? jobs.find((x) => jobId(x) === lastCallRef.current) || null : null);
      if (found === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!found) { answer("Which job? Open it, or say: I called the tenant for E Q 1 5 2 3 9, no answer."); return; }
      const id = jobId(found);
      const where = jobAddress(found).replace(/,\s*\d{5}$/, "");
      const note = cmd.result === "no-answer" ? "Called the tenant: no answer" : cmd.result === "voicemail" ? "Called the tenant: left a voicemail" : `Talked to the tenant${cmd.said ? `: ${cmd.said}` : ""}`;
      const hist = visitHistoryWith(found, note, null);
      // The tap on 📞 Call already wrote "Called the tenant": how it went takes its place (one line per call).
      const prev = hist[hist.length - 2] as { note?: string; recordedAt?: string } | undefined;
      if (prev?.note === "Called the tenant" && Date.now() - Date.parse(String(prev.recordedAt || "")) < 3 * 3600000) hist.splice(hist.length - 2, 1);
      const patch = { TenantCalledAt: new Date().toISOString(), TenantCallResult: cmd.result, ...(cmd.result === "talked" ? { TenantRepliedAt: new Date().toISOString() } : {}), FieldVisitHistory: hist };
      try { writeSharedWorkflowPatch(id, patch); } catch { /* still on screen */ }
      mergeWorkflowPatchIntoScreen(id, patch);
      if (cmd.result !== "talked") {
        const tomorrow = new Date(Date.parse(`${nyToday()}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
        saveReminders([...readReminders(), { id: `r${Date.now()}`, what: `call the tenant at ${where} again (${id})`, date: tomorrow, time: "10:00" }]);
        answer(`Noted: ${cmd.result === "voicemail" ? "voicemail left" : "no answer"} at ${where}. I'll remind you to call again tomorrow at 10.`);
        return;
      }
      const when = parseWhen(cmd.said || "");
      if (when.date && when.time) {
        const t = tenantInfo(found);
        const appt: Appointment = { date: when.date, start: when.time, end: hourAfter(when.time), state: "confirmed", contact: t.name || "Tenant", phone: t.phone || "", note: `On the phone: ${cmd.said.slice(0, 120)}`, reminder: 60 };
        try {
          validateAppointment(appt);
          pendingApptRef.current = { id, appt };
          answer(`Noted. Make the appointment at ${where} on ${appointmentLabel(appt)}? Say yes, or tap Yes.`, { id, outcome: "APPOINTMENT" });
          return;
        } catch { /* falls through to the note */ }
      }
      answer(`Noted on ${id}: "${cmd.said || "talked to the tenant"}".`);
      return;
    }
    if (cmd.intent === "next-tenant") {
      // The calling round by voice (30 Oct): the next tenant not reached yet opens; Call / First text are on the card.
      const left = tenantsToCall(jobRows, selectedJob ? jobId(selectedJob) : "");
      const nextJob = left[0] && jobs.find((j) => jobId(j) === left[0].id);
      if (!nextJob) { answer("Nobody left to call right now: every tenant with a phone is reached, or was tried in the last 3 hours."); return; }
      setCallAsk(""); setContactAll(false);
      openIssueJob(nextJob, true);
      const tone = left[0].contact?.tone;
      answer(`Next tenant: ${left[0].address.replace(/,\s*\d{5}$/, "")}, ${left.length} left. ${tone === "none" ? "Not contacted yet: text the job summary first, then call." : "Not reached yet: tap Call."}`);
      return;
    }
    if (cmd.intent === "tenants-waiting") {
      // Tenants texted with no answer (23 Oct): oldest text first, with Call buttons; "the first one" then works on them.
      const rows = jobs.filter((j) => !isTestJob(jobId(j))).map((j) => ({ j, st: tenantStep(j as Record<string, unknown>) }))
        .filter((x) => (x.st.state === "waiting" || x.st.state === "call") && !x.st.repliedAt && !activeAppointment(x.j as Record<string, unknown>))
        .sort((a, b) => Date.parse(a.st.textedAt) - Date.parse(b.st.textedAt));
      if (!rows.length) { answer("No tenants waiting: everyone you texted has answered, or nobody was texted yet."); return; }
      lastJobsRef.current = { ids: rows.slice(0, 5).map((x) => jobId(x.j)), at: Date.now() };
      const md = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
      const list = rows.slice(0, 3).map((x) => `${jobAddress(x.j).replace(/,\s*\d{5}$/, "")} (texted ${md(x.st.textedAt)})`);
      showPanel({ heard, reply: `${rows.length} tenant${rows.length === 1 ? " hasn't" : "s haven't"} answered${rows.some((x) => x.st.state === "call") ? ": time to call" : ""}. ${list.join("; ")}${rows.length > 3 ? `, and ${rows.length - 3} more` : ""}.`,
        actions: rows.slice(0, 3).filter((x) => tenantInfo(x.j).phone).map((x) => ({ label: `📞 ${jobAddress(x.j).replace(/,\s*\d{5}$/, "")}`, href: `tel:${tenantInfo(x.j).phone.replace(/[^\d+]/g, "")}` })) });
      return;
    }
    if (cmd.intent === "app-request") {
      // A change to the app itself (27 Oct): sent to Claude as a request; progress shows in What's new -> Your requests.
      const fresh = /^(?:a\s+)?(?:new|another)\s+request\b[:,]?\s*/i;
      const text = cmd.text.replace(fresh, "").replace(/^\w/, (c) => c.toUpperCase());
      // Claude asked a question (last 7 days): what you say next is the answer, unless you say "new request …".
      const waiting = fresh.test(cmd.text) ? undefined : (changeThreads || []).find((t) => t.status === "Waiting for you" && Date.now() - Date.parse(t.updates[t.updates.length - 1]?.at || t.at) < 7 * 86400000);
      if (waiting) {
        const q = waiting.text.replace(/^\((said to the helper|from the chat)\)\s*/i, "").slice(0, 60);
        showPanel({ heard, reply: `Answering Claude on "${q}"…` });
        void sendChangeAnswer(waiting, text).then((ok) => {
          showPanel({ heard, reply: ok ? `📥 Sent to Claude as your answer on "${q}": "${text}". It picks it up with its question. (For something else, say "tell Claude new request …".)` : `Couldn't send it right now (no signal?). Try again in a minute.`, actions: [{ label: "📋 My requests", href: "#requests" }] });
        });
        return;
      }
      showPanel({ heard, reply: `Sending to Claude: "${text}"…` });
      void sendChangeRequest(`(said to the helper) ${text}`).then((ok) => {
        showPanel({ heard, reply: ok ? `📥 Sent to Claude for the next upgrade: "${text}". Watch it live on the map: the 🤖 Claude card shows each step as it happens.` : `Saved on this phone; it goes to Claude when the internet is back: "${text}".`, actions: [{ label: "📋 My requests", href: "#requests" }] });
      });
      return;
    }
    if (cmd.intent === "weather") {
      // 🌦 The forecast with what it means for the work (27 Oct: "the AI smarter: weather, traffic").
      if (!multiRef.current) setAgent({ heard, reply: "Checking the weather…" });
      void fetchWeather().then((w) => {
        const r = w ? weatherReport(w, cmd.when, nyNow().iso) : null;
        if (!r?.text) { answer("I couldn't get the weather right now (no signal?). Try again in a minute."); return; }
        if (cmd.work) {
          // The answer first, then the list is offered (not opened).
          answer([workAnswer(r, cmd.when, cmd.work), r.text].join("\n"));
          if (!multiRef.current) setAgent((a) => (a ? { ...a, offers: [`what do I have ${cmd.when}`] } : a));
          return;
        }
        answer([r.text, ...r.tips.map((tip) => `• ${tip}`)].join("\n"));
      });
      return;
    }
    if (cmd.intent === "traffic") {
      // 🚗 Rush hour by the clock; live traffic in Waze to the first stop of today's route (or the job on screen).
      const now = nyNow();
      const stopId = selectedJob ? jobId(selectedJob) : todayRouteIds()[0];
      const stop = stopId ? jobs.find((x) => jobId(x) === stopId) : undefined;
      showPanel({ heard, reply: `${trafficNote(now.iso, now.weekday)}${stop ? ` For live traffic to ${jobAddress(stop).replace(/,\s*\d{5}$/, "")}, open Waze.` : " Waze shows live traffic."}`, actions: [stop ? { label: "🚗 Live traffic (Waze)", href: wazeHref(stop), id: jobId(stop), via: "Waze" as const } : { label: "🚗 Live traffic map", href: "https://www.waze.com/live-map" }] });
      return;
    }
    if (cmd.intent === "asp") {
      // 🅿️ Alternate side parking from the city's 2026 calendar (27 Oct, "do all of them").
      const today = nyNow().iso.slice(0, 10);
      answer(aspAnswer(cmd.when === "today" ? today : shiftDay(today, 1), cmd.when === "today" ? "Today" : "Tomorrow"));
      return;
    }
    if (cmd.intent === "store") {
      // 🛠 Supply run: Waze finds the closest one to where you are.
      const label = cmd.store.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Lowes$/, "Lowe's");
      const fix = lastFixRef.current;
      showPanel({ heard, reply: `Opening the nearest ${label}: Waze picks the closest one to where you are.`, actions: [
        { label: `🚗 ${label} (Waze)`, href: `https://waze.com/ul?q=${encodeURIComponent(label)}&navigate=yes` },
        { label: "🗺 Google Maps", href: `https://www.google.com/maps/search/${encodeURIComponent(label)}/${fix ? `@${fix.lat.toFixed(5)},${fix.lng.toFixed(5)},14z` : ""}` },
      ] });
      return;
    }
    if (cmd.intent === "building") {
      // 🏢 The building: year built, floors, apartments, walk-up or elevator, open HPD violations (city open data).
      const found = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob;
      if (found === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!found) { answer(cmd.ref ? `I can't find ${cmd.ref} in your jobs.` : "Which building? Open the job, or say the job number."); return; }
      const where = jobAddress(found).replace(/,\s*\d{5}$/, "");
      if (!multiRef.current) setAgent({ heard, reply: `Looking up ${where}…` });
      const boro = jobBorough(found);
      void loadBuildingFacts(jobAddress(found).replace(/,\s*\d{5}$/, ""), boro === "NYC" ? "" : boro, jobScope(found)).then((f) => {
        if (!f) { answer(`I couldn't find the city's records for ${where}.`); return; }
        const age = f.yearBuilt ? `built in ${f.yearBuilt} (${new Date().getFullYear() - f.yearBuilt} years old)` : "year built unknown";
        const size = [f.floors ? `${f.floors} floor${f.floors === 1 ? "" : "s"}` : "", f.units ? `${f.units} apartment${f.units === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
        const viol = f.open.total ? `${f.open.total} open HPD violation${f.open.total === 1 ? "" : "s"} (${f.open.C} immediately hazardous, ${f.open.B} hazardous, ${f.open.A} non-hazardous).` : "No open HPD violations.";
        const like = f.related.length ? ` Like this job: ${f.related.map((r) => `${r.text}${r.apt ? ` (apt ${r.apt})` : ""}`).join("; ")}.` : "";
        answer(`${where}: ${age}${size ? `, ${size}` : ""}${f.kind ? `, ${f.kind}` : ""}. ${viol}${like}`);
      }).catch(() => answer("I couldn't reach the city's records right now. Try again in a minute."));
      return;
    }
    if (cmd.intent === "drive-time") {
      // 🚗 How long to a job: road time from where you are (no live traffic), more in rush hour; Waze for live traffic.
      const named = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : null;
      if (named === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      const routeId = todayRouteIds()[0];
      const target = named || selectedJob || (routeId ? jobs.find((x) => jobId(x) === routeId) : undefined);
      if (!target) { answer(cmd.ref ? `I can't find ${cmd.ref} in your jobs.` : "To which job? Open it, plan today's route, or say the job number."); return; }
      const to = jobLatLng(target);
      const fix = lastFixRef.current;
      const where = jobAddress(target).replace(/,\s*\d{5}$/, "");
      const waze = { label: "🚗 Go (Waze, live traffic)", href: wazeHref(target), id: jobId(target), via: "Waze" as const };
      if (!to || !fix || Date.now() - fix.at > 15 * 60000) { showPanel({ heard, reply: `I need your location to time the drive to ${where}: tap 📍 Locate on the map, then ask again. Waze shows the time with live traffic.`, actions: [waze] }); return; }
      if (!multiRef.current) setAgent({ heard, reply: `Timing the drive to ${where}…` });
      void fetchRoadRoute([{ lat: fix.lat, lng: fix.lng }, to]).then((road) => {
        const now = nyNow();
        const rush = /rush hour/.test(trafficNote(now.iso, now.weekday));
        if (!road) { showPanel({ heard, reply: `About ${distanceMiles(fix, to).toFixed(1)} miles to ${where} in a straight line. Waze shows the drive time with live traffic.`, actions: [waze] }); return; }
        const mins = Math.max(1, Math.round(road.minutes));
        showPanel({ heard, reply: `About ${mins} min to ${where} (${road.miles.toFixed(1)} mi) without traffic.${rush ? ` It's rush hour: plan on about ${Math.round(mins * 1.4)} min.` : ""}`, actions: [waze] });
      });
      return;
    }
    if (cmd.intent === "whats-next") {
      // "What's next?" (27 Oct): the pill at the bottom of the map as last shown (an urgent notice first, else the Next
      // step), with "Do it" doing it for you.
      const step = nextStepRef.current;
      if (!step) { answer("Nothing urgent right now: no notices running out, no bids due today, no tenant waiting."); return; }
      showPanel({ heard, reply: `Next: ${step.text}.`, actions: [{ label: "▶ Do it", href: "#next" }] });
      return;
    }
    if (cmd.intent === "help") {
      setHelpOpen(true);
      answer("Here's what you can say. Tap one to try it, or just say it your own way.");
      return;
    }
    if (cmd.intent === "tell-tenant") {
      // Your own words to the tenant (23 Oct). Which job: the one named, else the tenant who texted last (2 days), else
      // the job on screen. Text service on: read back, sent after your yes; otherwise Messages opens with it.
      let job: JobRecord | null | "many" = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : null;
      if (!job && !cmd.ref) {
        const lastReply = jobs.map((j) => ({ j, at: Date.parse(String(value(j, ["TenantRepliedAt"]) || "")) })).filter((x) => Number.isFinite(x.at) && Date.now() - x.at < 2 * 86400000).sort((a, b) => b.at - a.at)[0];
        job = lastReply?.j || selectedJob;
      }
      if (job === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!job) { answer("Which job? Open it, or say: reply to the tenant for E Q 1 5 2 3 9, then your message."); return; }
      const t = tenantInfo(job);
      const where = jobAddress(job).replace(/,\s*\d{5}$/, "");
      if (!t.phone || t.commonArea) { answer(`There's no tenant phone on file for ${where}.`); return; }
      const first = (t.name || "").split(/\s+/)[0];
      const hello = first && first.length > 1 ? `Hi ${first[0].toUpperCase()}${first.slice(1).toLowerCase()}` : "Hello";
      const text = `${hello}, this is Jot from United Angel Construction about ${where}: ${cmd.message[0].toUpperCase()}${cmd.message.slice(1)}`;
      openIssueJob(job);
      if (smsReady) {
        pendingSmsRef.current = { id: jobId(job), text };
        answer(`I'll text ${first || "the tenant"}: "${text}" Say yes to send it.`, { id: jobId(job), outcome: "SMS" });
        return;
      }
      showPanel({ heard, reply: `Ready for ${first || "the tenant"} at ${where}: "${text}" Tap to open it in Messages, then press Send.`, actions: [{ label: `📱 Text ${first || "the tenant"}`, href: smsHref(t.phone, text) }] });
      return;
    }
    if (cmd.intent === "week") {
      // "How did I do this week?" (23 Oct): the last 7 days in one answer: won, bids sent, jobs finished, paperwork sent,
      // money HPD paid.
      // "today" (days: 1): since midnight New York; otherwise the last 7 days.
      const day1 = cmd.days === 1;
      const nyMidnight = (() => { const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); const off = new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" }).includes("EDT") ? "-04:00" : "-05:00"; return Date.parse(`${d}T00:00:00${off}`); })();
      const since = day1 ? nyMidnight : Date.now() - 7 * 86400000;
      const recent = (iso: unknown) => { const t = Date.parse(String(iso || "")); return Number.isFinite(t) && t >= since; };
      const wins = new Set((threads || []).flatMap((t) => t.messages.filter((m) => m.hpd && !m.mine && /confirmation of award|awarding omo/i.test(`${t.subject} ${m.text}`) && recent(m.at)).map((m) => (m.text.match(/[A-Z]{2}\d{5}/) || t.omos)[0] || "")).filter(Boolean)).size;
      let bidRecs: Record<string, { sentAt?: string; status?: string }> = {};
      try { bidRecs = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}"); } catch { /* private mode */ }
      const bidsSent = Object.values(bidRecs).filter((r) => recent(r.sentAt)).length;
      const finishedOutcomes = /WORK_COMPLETED|PARTIAL_WORK|REFUSED_ACCESS|NO_ACCESS|COMPLETED_BY_OTHERS/;
      const finished = jobs.filter((j) => !isTestJob(jobId(j)) && (Array.isArray(j.FieldVisitHistory) ? j.FieldVisitHistory as { recordedAt?: string; outcome?: string }[] : []).some((v) => finishedOutcomes.test(String(v?.outcome || "")) && recent(v.recordedAt))).length;
      const papers = [...followUps.values()].filter((f) => recent(f.sentAt)).length;
      void fetch("/data/pip_payments.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((pay) => {
        const paid = (pay?.recent || []).filter((p: { date?: string; status?: string; amount?: number }) => /paid/i.test(p.status || "") && recent(`${p.date}T12:00:00`)).reduce((n: number, p: { amount?: number }) => n + (p.amount || 0), 0);
        const parts = [`won ${wins} job${wins === 1 ? "" : "s"}`, `sent ${bidsSent} bid${bidsSent === 1 ? "" : "s"}`, `finished ${finished} job${finished === 1 ? "" : "s"}`, `sent paperwork for ${papers}`, paid ? `HPD paid you $${Math.round(paid).toLocaleString("en-US")}` : "no payment from HPD yet"];
        answer(`${day1 ? "Today" : "This week"} you ${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`);
      });
      return;
    }
    if (cmd.intent === "tracker") {
      setTrackerOpen(true);
      setAgent(null);
      speak("Here's your job tracker: every job from the award to the money.", 150);
      return;
    }
    if (cmd.intent === "job-status") {
      // "What's left on ER05729?" (23 Oct): the job from award to payment in one answer, then what to do next.
      const found = cmd.ref ? findJobRef(cmd.ref, jobs, jobId, jobAddress) : selectedJob;
      if (found === "many") { answer("I found more than one of your jobs at that address. Say the job number, letter by letter."); return; }
      if (!found) { answer(cmd.ref ? `I can't find ${cmd.ref} in your jobs.` : "Which job? Open it, or say the job number."); return; }
      const id = jobId(found);
      const where = jobAddress(found).replace(/,\s*\d{5}$/, "");
      const fu = followUps.get(id);
      const day = (iso: unknown) => { const s = String(iso || ""); const t = Date.parse(s.length === 10 ? `${s}T12:00:00` : s); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : ""; };
      const ts = tenantStep(found as Record<string, unknown>);
      const appt = activeAppointment(found as Record<string, unknown>);
      const outcome = FIELD_OUTCOMES[value(found, ["FieldOutcome", "fieldOutcome"])];
      const approved = Boolean(value(found, ["PackageApprovedAt"])) || /approved/i.test(value(found, ["PackageReviewStatus"]));
      const pay = pipMap[id];
      const done: string[] = [];
      const left: string[] = [];
      const award = day(value(found, ["AwardDate"]));
      if (award) done.push(`awarded ${award}`);
      if (ts.textedAt) done.push(`tenant texted ${day(ts.textedAt)}${ts.repliedAt ? ", they replied" : ""}`);
      const called = String(value(found, ["TenantCallResult"]) || "");
      if (called) done.push(`tenant called ${day(value(found, ["TenantCalledAt"]))}${called === "no-answer" ? ", no answer" : called === "voicemail" ? ", voicemail left" : ", talked"}`);
      if (appt) done.push(`appointment ${appointmentLabel(appt)}`);
      if (value(found, ["FieldArrivedAt"])) done.push(`arrived ${day(value(found, ["FieldArrivedAt"]))}`);
      if (outcome) done.push(outcome.toLowerCase());
      if (approved) done.push("paperwork approved");
      if (fu?.sentAt) done.push(`paperwork sent to HPD ${day(fu.sentAt)}`);
      if (fu?.state === "hpd-closed" || fu?.state === "done") done.push(`closed${fu.hpdReason ? ` (${fu.hpdReason.toLowerCase()})` : ""}`);
      if (pay && pay.paid > 0) done.push(`paid $${Math.round(pay.paid).toLocaleString("en-US")}`);
      if (!outcome) left.push(ts.state === "none" && !appt ? "text the tenant for a time" : !value(found, ["FieldArrivedAt"]) ? "go do the work" : "save the outcome");
      else if (!approved && !fu?.sentAt) left.push("make and send the paperwork");
      else if (fu?.state === "sent") left.push("wait for HPD to close it");
      if (pay && pay.outstanding > 0) left.push(`get paid: $${Math.round(pay.outstanding).toLocaleString("en-US")} still owed`);
      else if (!pay && (fu?.sentAt || approved)) left.push("wait for it to show in PIP");
      openIssueJob(found, true);
      answer(`${id} at ${where}. Done: ${done.length ? done.join(", ") : "nothing yet"}. ${left.length ? `Left: ${left.join(", then ")}.` : "Nothing left: it's finished and paid."}`);
      return;
    }
    if (cmd.intent === "forecast") {
      // "How much will HPD pay me?" (3 Nov): what PIP shows still owed that isn't held by a rejection, next to what HPD
      // paid in a usual month (the average of the last 3 full months). A guess from PIP's numbers, said as a guess.
      void fetch("/data/pip_payments.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((pay) => {
        const months: Record<string, number> = pay?.byMonth || {};
        const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
        const owed = Object.values(pipMap).filter((p) => p.outstanding > 0 && !p.closed).reduce((n, p) => n + p.outstanding, 0);
        const held = payTrack.summary.held || 0;
        const ready = Math.max(0, owed - held);
        const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
        const last3 = Object.keys(months).filter((k) => k < ym).sort().slice(-3);
        const usual = last3.length ? last3.reduce((n, k) => n + months[k], 0) / last3.length : 0;
        if (!owed && !usual) { answer("I don't have enough of PIP's numbers to guess. Try again later."); return; }
        answer(`PIP shows ${usd(owed)} still owed to you${held ? `, ${usd(held)} of it held by rejections to fix, so about ${usd(ready)} can be paid as it stands` : ""}. ${usual ? `HPD usually pays you about ${usd(usual)} a month (the last ${last3.length} months).` : ""} ${held ? "Fixing the rejections is the quickest way to add to it. Say \"which rejections do I have\"." : ""} This is a guess from PIP, not a promise from HPD.${pipAgeDays > 7 ? ` Note: PIP's numbers are ${pipAgeDays} days old.` : ""}`.replace(/\s+/g, " "));
      });
      return;
    }
    if (cmd.intent === "paid-period") {
      // "How much did I get paid this month?" (26 Oct): what PIP shows paid by HPD in the month / year, compared with the
      // one before. PIP is read by the app every day; the answer says how fresh it is.
      void fetch("/data/pip_payments.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((pay) => {
        const months: Record<string, number> = pay?.byMonth || {};
        if (!Object.keys(months).length) { answer("I don't have PIP's payments right now. Try again later."); return; }
        const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
        const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
        const [y, m] = ym.split("-").map(Number);
        const key = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
        const prev = (yy: number, mm: number) => (mm === 1 ? [yy - 1, 12] : [yy, mm - 1]);
        const yearTotal = (yy: number, upTo = 12) => Object.entries(months).filter(([k]) => k.startsWith(`${yy}-`) && Number(k.slice(5)) <= upTo).reduce((n, [, v]) => n + v, 0);
        const name = (yy: number, mm: number) => new Date(yy, mm - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        const asOf = pay?.totals?.to ? ` (PIP up to ${new Date(`${pay.totals.to}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })})` : "";
        let text = "";
        if (cmd.period === "month" || cmd.period === "last-month") {
          const [yy, mm] = cmd.period === "month" ? [y, m] : prev(y, m);
          const [py, pm] = prev(yy, mm);
          text = `HPD paid you ${usd(months[key(yy, mm)] || 0)} in ${name(yy, mm)}${asOf}. ${name(py, pm).split(" ")[0]} was ${usd(months[key(py, pm)] || 0)}.`;
        } else {
          const yy = cmd.period === "year" ? y : y - 1;
          const total = yearTotal(yy);
          const sameTimeBefore = cmd.period === "year" ? yearTotal(yy - 1, m) : yearTotal(yy - 1);
          text = `HPD paid you ${usd(total)} in ${yy}${cmd.period === "year" ? " so far" : ""}${cmd.period === "year" ? asOf : ""}. ${cmd.period === "year" ? `By this time in ${yy - 1} it was ${usd(sameTimeBefore)}` : `${yy - 1} was ${usd(sameTimeBefore)}`}.`;
        }
        answer(text + (pipAgeDays > 7 ? ` Note: PIP's numbers are ${pipAgeDays} days old.` : ""));
      });
      return;
    }
    if (cmd.intent === "rejections") {
      // "Which rejections do I have?" (24 Oct): HPD's payment rejections still holding money, the ones to fix first,
      // biggest amounts first, each with a Fix button (the correction opens ready to preview).
      const held = payTrack.rows.filter((r) => r.status === "held");
      if (!held.length) { answer("No payment rejections holding money right now."); return; }
      const toFix = held.filter((r) => r.next === "fixed").sort((a, b) => b.held - a.held);
      const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
      const list = (toFix.length ? toFix : held).slice(0, 3);
      lastJobsRef.current = { ids: list.map((r) => r.omo), at: Date.now() };
      showPanel({ heard, reply: `${held.length} rejection${held.length === 1 ? "" : "s"} hold ${usd(payTrack.summary.held)}${toFix.length ? `; ${toFix.length} to fix` : ""}. ${list.map((r) => `${r.omo}${r.held ? `, ${usd(r.held)}` : ""}: ${((c) => (c.length >= 12 ? c : "reason not clear, see HPD's notice"))(r.reason.replace(/\b(?:[A-Z0-9#.,:/-]+\s+){2,}/g, " ").replace(/\b[A-Z0-9#.,:/-]+$/, "").replace(/\s+/g, " ").trim()).slice(0, 70)}`).join("; ")}.`,
        // "Fix them one by one" first (the paperwork page then goes on to the next by itself), then single fixes.
        actions: [
          ...(toFix.length > 1 ? [{ label: `▶ Fix them one by one (${toFix.length})`, href: `/paperwork/?job=${encodeURIComponent(toFix[0].omo)}&fix=${encodeURIComponent(toFix[0].at)}&auto=1`, queue: toFix.map((r) => ({ omo: r.omo, at: r.at })) }] : []),
          ...list.filter((r) => toFix.includes(r)).map((r) => ({ label: `🔧 Fix ${r.omo}`, href: `/paperwork/?job=${encodeURIComponent(r.omo)}&fix=${encodeURIComponent(r.at)}&auto=1` })),
        ] });
      return;
    }
    if (cmd.intent === "money") {
      // "How much does HPD owe me?" (23 Oct): what PIP shows still owed, the biggest ones, what rejections hold up, and
      // the last payment. "Read me the first one" then works on those jobs.
      const owed = Object.entries(pipMap).filter(([, p]) => p.outstanding > 0 && !p.closed).sort((a, b) => b[1].outstanding - a[1].outstanding);
      const total = owed.reduce((n, [, p]) => n + p.outstanding, 0);
      const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
      if (owed.length) lastJobsRef.current = { ids: owed.slice(0, 5).map(([o]) => o), at: Date.now() };
      const top = owed.slice(0, 3).map(([o, p]) => { const j = jobs.find((x) => jobId(x) === o); return `${o}${j ? ` at ${jobAddress(j).replace(/,\s*\d{5}$/, "")}` : ""}, ${usd(p.outstanding)}`; });
      const held = payTrack.summary.heldCount ? ` ${usd(payTrack.summary.held)} of it is held by ${payTrack.summary.heldCount} rejection${payTrack.summary.heldCount === 1 ? "" : "s"} to fix.` : "";
      void fetch("/data/pip_payments.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((pay) => {
        const last = (pay?.recent || []).find((p: { status?: string; amount?: number }) => /paid/i.test(p.status || "") && (p.amount || 0) > 0);
        const lastText = last ? ` Last payment: ${usd(last.amount)} on ${new Date(`${last.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.` : "";
        answer((owed.length
          ? `HPD owes you ${usd(total)} on ${owed.length} job${owed.length === 1 ? "" : "s"} in PIP. The biggest: ${top.join("; ")}.${held}${lastText}`
          : `PIP shows nothing owed right now.${lastText}`) + (pipAgeDays > 7 ? ` Note: PIP's numbers are ${pipAgeDays} days old (from ${pipAsOfText}).` : ""));
      });
      return;
    }
    if (cmd.intent === "bids") {
      void fetch("/data/upcoming_bids.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
        // Still open: due later today (time not passed) or a later day.
        const nowMin = (() => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); })();
        const minOf = (t = "") => { const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60; };
        const open = (Array.isArray(d?.bids) ? d.bids : []).filter((b: { bidDue?: string; bidDueTime?: string }) => (b.bidDue || "") > today || (b.bidDue === today && minOf(b.bidDueTime) > nowMin)).sort((a: { bidDue: string }, b: { bidDue: string }) => a.bidDue.localeCompare(b.bidDue));
        if (!open.length) { answer("No open invitations to bid right now."); return; }
        lastJobsRef.current = { ids: open.slice(0, 5).map((b: { omo: string }) => b.omo), at: Date.now() };
        cardsRef.current = open.slice(0, 5).map(bidCard);
        const lines = open.slice(0, 5).map((b: { borough?: string; description?: string; bidDue: string; bidDueTime?: string }) => { const first = jobSummary(b.description || "").lines.map(lineText)[0] || "general repair"; return `${({ MN: "Manhattan", BX: "Bronx", BK: "Brooklyn", QN: "Queens", SI: "Staten Island" } as Record<string, string>)[String(b.borough || "").toUpperCase()] || b.borough || "New York"}: ${first}, due ${b.bidDue === today ? "today" : dayWord(b.bidDue)} ${b.bidDueTime || ""}`.trim(); });
        answer(`${open.length === 1 ? "You have 1 open invitation to bid." : `You have ${open.length} open invitations to bid.`} ${lines.join(". ")}.${open.length > 5 ? ` And ${open.length - 5} more in Bids.` : ""}`);
      }).catch(() => answer("I couldn't load the bids right now."));
      return;
    }
    if (cmd.intent === "notices") {
      const open = boardOpenRows.filter((r) => !r.steps.sent.done);
      if (open.length) lastJobsRef.current = { ids: [...open].sort((a, b) => hoursLeft(a, Date.now()) - hoursLeft(b, Date.now())).map((r) => r.omo), at: Date.now() };
      if (open.length) cardsRef.current = lastJobsRef.current!.ids.slice(0, 5).map((o) => chatCard(o)).filter((c): c is ChatCard => Boolean(c));
      if (!open.length) { answer("No notices waiting on you. Nice."); return; }
      const late = open.filter((r) => r.kind === "ppn" && hoursLeft(r, Date.now()) < 0);
      answer(`${open.length} notice${open.length === 1 ? "" : "s"} waiting on you${late.length ? `, ${late.length} overdue: ${late.slice(0, 3).map((r) => addressOf(r.omo) || r.omo).join("; ")}` : ""}. Open Notices to answer them.`);
      return;
    }
    // Today.
    const parts: string[] = [];
    const late = boardOpenRows.filter((r) => r.kind === "ppn" && !r.steps.sent.done && hoursLeft(r, Date.now()) < 0);
    if (late.length) parts.push(`${late.length} notice${late.length === 1 ? " is" : "s are"} overdue`);
    if (bidsDue.today) parts.push(`${bidsDue.today} bid${bidsDue.today === 1 ? "" : "s"} due today`);
    const stops = todayRouteIds().length;
    if (stops) parts.push(`${stops} stop${stops === 1 ? "" : "s"} on today's route`);
    const lateJobs = jobRows.filter((r) => r.group === "todo").length;
    if (lateJobs) parts.push(`${lateJobs} job${lateJobs === 1 ? "" : "s"} to do`);
    answer(parts.length ? `Today: ${parts.join(", ")}.` : "Nothing urgent today.");
  };
  const addressOf = (omo: string) => { const j = findAnyJob(omo); return j ? jobAddress(j) : ""; };
  // Cards under the chat's answers (2 Nov, part 3): a notice (with Answer), a bid still open, else the job.
  const BORO_WORD: Record<string, string> = { MN: "Manhattan", BX: "Bronx", BK: "Brooklyn", QN: "Queens", SI: "Staten Island" };
  const noZip = (a: string) => a.replace(/,\s*\d{5}$/, "");
  function bidCard(b: { omo?: string; bidDue: string; bidDueTime: string; address?: string; borough?: string; description?: string }): ChatCard {
    let rec: { status?: string; price?: number; bidDue?: string } | undefined;
    try { rec = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}")[b.omo || ""]; } catch { /* private mode */ }
    const mine = rec && rec.bidDue === b.bidDue ? rec : undefined;
    const day = b.bidDue === nyToday() ? "today" : new Date(`${b.bidDue}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
    return {
      kind: "bid", id: b.omo || "", title: `${BORO_WORD[String(b.borough || "").toUpperCase()] || b.borough || "New York"} · ${b.address || b.omo}`,
      sub: [b.omo, jobSummary(b.description || "").lines.map(lineText)[0], `due ${day} ${b.bidDueTime || ""}`.trim()].filter(Boolean).join(" · "),
      tag: mine && ["sent", "confirmed"].includes(String(mine.status)) ? "✓ sent" : mine?.price ? `$${Number(mine.price).toLocaleString("en-US")} saved` : undefined,
    };
  }
  function chatCard(omo: string, only?: ChatCard["kind"]): ChatCard | null {
    const row = !only || only === "notice" ? boardOpenRows.find((r) => r.omo === omo) : undefined;
    if (row) {
      const h = row.dueAt ? Math.round(hoursLeft(row, Date.now())) : null;
      return { kind: "notice", id: omo, title: noZip(addressOf(omo)) || omo, sub: [omo, row.kind === "docs" ? "missing documents" : `${row.hours}-hour notice`, h === null ? "" : h < 0 ? `overdue ${-h} h` : `${h} h left`].filter(Boolean).join(" · "), tag: boardSide(row) === "replied" ? "HPD answered" : undefined };
    }
    const b = !only || only === "bid" ? bidsListRef.current.find((x) => x.omo === omo && x.bidDue >= nyToday()) : undefined;
    if (b) return bidCard(b);
    const j = findAnyJob(omo);
    if (!j) return null;
    const a = activeAppointment(j as Record<string, unknown>);
    return { kind: "job", id: omo, title: noZip(jobAddress(j)), sub: [omo, jobSummary(jobScope(j)).lines.map(lineText)[0]].filter(Boolean).join(" · "), tag: a && !appointmentTiming(a).past ? `📅 ${appointmentLabel(a).split(" · ")[1]}` : undefined };
  }
  // Claude's requests in one answer (newest working first): what it's doing now, the steps, the last note.
  function claudeStatusText() {
    const live = claudeNowFresh(claudeNow) && claudeNow ? `⚡ Claude right now: ${claudeNow.text}${claudeNow.task ? ` (on “${claudeNow.task}”)` : ""}.\n` : "";
    return live + claudeThreadsText();
  }
  function claudeThreadsText() {
    const list = changeThreads || [];
    const act = (t: ChangeThread) => [t.at, t.workingAt, t.now?.at || "", ...t.updates.map((u) => u.at)].filter(Boolean).sort().slice(-1)[0] || "";
    const open = list.filter((t) => t.status !== "Done").sort((a, b) => act(b).localeCompare(act(a)));
    const ask = (t: ChangeThread) => `“${t.text.replace(/^\((said to the helper|from the chat)\)\s*/i, "").slice(0, 70)}${t.text.length > 70 ? "…" : ""}”`;
    const secs = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
    if (!open.length) {
      const last = [...list].sort((a, b) => act(b).localeCompare(act(a)))[0];
      return last ? `No requests open: Claude finished your last one, ${ask(last)}${last.updates.length ? `. ${last.updates[last.updates.length - 1].text.slice(0, 160)}` : ""}.${last.ok ? "" : "\nTried it? Say \"it works\", or \"not right, …\" and what to fix."}` : "You haven't asked Claude for anything yet. Say \"tell Claude to …\" and it starts on it.";
    }
    const t = open[0];
    const working = Boolean(t.workingAt) && Date.now() - Date.parse(t.workingAt) < 30 * 60000;
    const done = t.steps.filter((x) => x.done).length;
    const lines = [
      t.status === "Waiting for you" ? `❓ Claude needs your answer on ${ask(t)}.`
        : working ? `🤖 Claude is working on ${ask(t)} right now (for ${Math.max(1, Math.round((Date.now() - Date.parse(t.workingAt)) / 60000))} min).`.replace("(for 1 min)", "(for a minute)")
        : `⏳ ${ask(t)} is waiting. ${pickupLabel(claudeSeenAt)}.`,
      t.steps.length ? `${done} of ${t.steps.length} steps done${t.steps.find((x) => !x.done) ? `, next: ${t.steps.find((x) => !x.done)!.text}` : ""}.` : "",
      working && t.now ? `⚡ Now: ${t.now.text} (${secs(t.now.at)}).` : "",
      t.updates.length ? `Last note (${secs(t.updates[t.updates.length - 1].at)}): ${t.updates[t.updates.length - 1].text.slice(0, 160)}` : "",
      open.length > 1 ? `+ ${open.length - 1} more request${open.length > 2 ? "s" : ""} open.` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }
  function openCard(c: ChatCard) {
    stopSpeaking();
    setAgent(null);
    if (c.kind === "bid") { goTo("bids", c.id); return; }
    if (c.kind === "notice") { setBidsOpen(false); goTo("board", c.id); return; }
    const j = findAnyJob(c.id);
    if (j) { setBidsOpen(false); closeScreens(); openIssueJob(j, true); }
  }

  return (
    <main className={`fc-app fc-reference fc-full-map fc-clean-streets ${bidsOpen ? "fc-bids-mode" : ""} ${chromeOpen ? "fc-chrome-open" : ""} ${selectedJob ? "fc-has-job" : ""} ${controlsOpen ? "fc-controls-open" : ""} ${sheetExpanded ? "fc-sheet-expanded" : ""}`}>
      <button type="button" className="fc-reveal-controls" aria-label={chromeOpen ? "Hide all map controls" : "Show map controls"} title={chromeOpen ? "Hide controls" : "Map menu"} aria-expanded={chromeOpen} onClick={() => { setChromeOpen((open) => !open); setControlsOpen(false); setSelectedJob(null); }}><MenuIcon /></button>
      <div className="fc-search-row">
        <div className="fc-search-field">
          <SearchIcon />
          <input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => setSearchFocus(true)} onBlur={() => window.setTimeout(() => setSearchFocus(false), 250)} onKeyDown={(event) => { if (event.key === "Enter" && parseCommand(search).intent !== "search") { event.preventDefault(); const said = search; setSearch(""); agentRef.current(said); } }} placeholder={listening ? "Listening… say the job" : "Job #, address or a few words"} aria-label="Search jobs" data-hpd-smoke="fc-search" />
          {search ? <button type="button" className="fc-search-clear" aria-label="Clear search" data-hpd-smoke="fc-search-clear" onClick={() => { setSearch(""); setFindHidden(""); }}>✕</button> : null}
          {true ? <button type="button" className={`fc-search-mic${listening ? " is-on" : ""}`} aria-label={listening ? "Stop listening" : "Search by voice"} aria-pressed={listening} data-hpd-smoke="fc-search-mic" onClick={listen}>🎤</button> : null}
        </div>
        <button type="button" className={`fc-filter-btn ${filtersOpen ? "is-open" : ""}`} data-hpd-smoke="fc-filter-button" aria-label="Filters" aria-expanded={filtersOpen} aria-controls="fc-quick-filters" onClick={() => { setFiltersOpen((open) => !open); setChromeOpen(false); }}>
          <FilterIcon />
          {activeFilterCount ? <span className="fc-filter-badge">{activeFilterCount}</span> : null}
        </button>
        {/* Every alert, kept to manage and keep track of (20 Oct). */}
        <button type="button" className={`fc-filter-btn fc-notif-btn${notifUnread ? " has-new" : ""}`} aria-label="Notifications" title="Notifications" data-hpd-smoke="fc-notif-open" aria-pressed={notifOpen} onClick={() => setNotifOpen((v) => !v)}>
          <span aria-hidden="true" className="fc-notif-bell">🔔</span>
          {notifUnread ? <span key={notifUnread} className="fc-filter-badge fc-notif-badge hpd-pop" data-hpd-smoke="fc-notif-count"><CountUp value={notifUnread} /></span> : null}
        </button>
      </div>
      {searchFocus && !search && recent.length && !selectedJob ? (
        <div className="fc-recent" data-hpd-smoke="fc-recent">
          <small>Recent</small>
          {recent.map((r) => <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setFindHidden(""); setSearch(r); }}>{r}</button>)}
        </div>
      ) : null}
      {(privateOk === false || threads === null) && !selectedJob && !search.trim() ? (
        <div className="fc-signin-bar" data-hpd-smoke="fc-signin-bar">
          <span>🔑 Signed out: your HPD emails, tenant contacts and the AI need your Google sign-in (once, it lasts a year).</span>
          <form className="fc-signin-form" method="post" action="/api/drive/start?back=%2Fmap%2F%3Fview%3Dall%26map%3D1" data-hpd-smoke="fc-signin-bar-go"><button type="submit">Sign in with Google</button></form>
        </div>
      ) : null}
      {search.trim().length >= 3 && findHidden !== search && !selectedJob ? (
        <FindJob query={search.trim()} onClose={() => setFindHidden(search)} onOpen={(item) => {
          const job = findAnyJob(item.omo);
          if (job) { setFindHidden(search); openIssueJob(job); return true; }
          if (item.kinds.includes("bid")) { setFindHidden(search); goTo("bids", item.omo); return true; }
          return false; // not one of yours: the list shows its details
        }} />
      ) : null}
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
              <span aria-hidden="true">📅</span><small>{showOlderLayer ? "2024-25" : quickDateKey === "year" ? "Year" : quickDateKey === "all" ? "All" : quickDateKey?.startsWith("last") ? `${quickDateKey.slice(4)}d` : quickDateKey === "next30" ? "Next 30" : "Custom"} ▾</small><b className="fc-days-btn-count" data-hpd-smoke="fc-days-btn-count">{filteredJobs.length}</b>
            </button>
            {daysMenuOpen ? (
              <div className="fc-days-menu" role="menu" data-hpd-smoke="fc-days-menu">
                {(["last15", "last30", "last45", "last60", "last90", "year", "all"] as const).map((key) => (
                  <button key={key} type="button" role="menuitemradio" aria-checked={quickDateKey === key && !showOlderLayer} className={quickDateKey === key && !showOlderLayer ? "is-active" : ""} data-hpd-smoke={`fc-days-${key}`} onClick={() => { applyQuickDate(key); setShowOlderLayer(false); setDaysMenuOpen(false); }}>
                    {QUICK_DATE_RANGES.find((r) => r.key === key)?.label}
                    {dayCounts[key] !== undefined ? <b className="fc-days-count" data-hpd-smoke={`fc-days-count-${key}`}>{dayCounts[key]} {dayCounts[key] === 1 ? "job" : "jobs"}</b> : null}
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
        <button type="button" data-hpd-smoke="fc-tracker-open" onClick={() => { setChromeOpen(false); setControlsOpen(false); setTrackerOpen(true); }}><ListIcon />🧭 Job tracker</button>
        <button type="button" data-hpd-smoke="fc-autopilot-open" onClick={() => { setChromeOpen(false); setControlsOpen(false); setAutopilotOpen(true); }}><ListIcon />🤖 Autopilot</button>
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
          <output aria-live="polite" data-hpd-smoke="fc-job-count">{filteredJobs.length ? `${filteredJobs.length} jobs` : "No matches"}</output>
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
        {/* One round Jobs button (bottom left); Close out and 2nd try are tabs inside it (owner, 21 Oct: "make it like the
            others, it takes too much space"). */}
        {/* Bottom dock (28 Oct, owner picked layout 2: "i like it dont leave anything"): Jobs, Bids, ✨ AI, Notices and
            More at the bottom; Route, Appts, Follow-up, Stats, Alerts and What's new in a strip above it you swipe sideways;
            More lists everything with what's waiting in it. Map style, Locate and the job count stay on the map (right). */}
        {!selectedJob ? (() => {
          // Owner can pick which 3 buttons sit next to ✨ AI (hold one, or All → Bottom buttons); the rest are tiles under All.
          // 29 Oct, owner: "too many buttons on the bottom" → picked layout A: one row (Jobs, Bids, ✨ AI, Notices, All), no strip.
          const make: Record<DockKey, (cls: string) => ReactElement> = {
            jobs: (cls) => <button key="jobs" type="button" className={`${cls} is-jobs${jobsNeedYou ? " is-glow" : ""}`} data-hpd-smoke="fc-jobs-open" data-glow={jobsNeedYou ? "1" : undefined} aria-label="Jobs" aria-pressed={jobsOpen} onClick={() => { if (jobsOpen) { setJobsOpen(false); return; } closeScreens("jobs"); setJobsOpen(true); }}>
              <JobsIcon /><span className="fc-fab-label">Jobs</span>{jobRows.length ? <span key={jobsTodo} className={`fc-follow-badge hpd-pop${secondTryJobs.some((r) => r.second.due) || closeOutJobs.length ? " is-rejected" : ""}`} data-hpd-smoke="fc-jobs-count"><CountUp value={jobsTodo} /></span> : null}
            </button>,
            bids: (cls) => <button key="bids" type="button" className={`${cls} ${bidsOpen ? "is-active" : ""}${bidsDue.unsentToday ? " is-glow" : ""}`} data-hpd-smoke="fc-bids-open" data-glow={bidsDue.unsentToday ? "1" : undefined} aria-label="Invitations to bid" data-tip={bidsDue.open ? `Invitations to bid: ${bidsDue.open} open${bidsDue.today ? `, ${bidsDue.today} due today` : ""}` : "Invitations to bid"} aria-pressed={bidsOpen} title="Invitations to bid" onClick={() => { if (bidsOpen) { setBidsOpen(false); return; } closeScreens("bids"); setBidsOpen(true); }}><BidsIcon /><span className="fc-fab-label">Bids</span>{bidsDue.open ? <span key={bidsDue.open} className={`fc-follow-badge hpd-pop ${bidsDue.today ? "is-bids-today" : "is-bids-tomorrow"}`} data-hpd-smoke="fc-bids-badge" title={`${bidsDue.open} open${bidsDue.today ? ` · ${bidsDue.today} due today` : ""}${bidsDue.tomorrow ? ` · ${bidsDue.tomorrow} due tomorrow` : ""}`}><CountUp value={bidsDue.open} /></span> : null}</button>,
            notices: (cls) => <button key="notices" type="button" className={`${cls} fc-notices-fab${followFilter === "notices" ? " is-active" : ""}${boardUrgent.length ? " is-urgent is-glow" : ""}`} data-hpd-smoke="fc-notices-open" data-glow={boardUrgent.length ? "1" : undefined} data-urgent={boardUrgent.length || undefined} aria-label="HPD notices" data-tip="HPD notices: rejections and requests" aria-pressed={noticesOpen || noticeChooser} title="HPD notices: rejected paperwork and requests" onClick={() => {
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
          </button>,
            follow: (cls) => <button key="follow" type="button" className={`${cls} fc-follow-fab${followFilter ? " is-active" : ""}`} data-hpd-smoke="fc-follow-open" aria-label="Follow-up report" data-tip="Follow-up: overdue jobs" title="Follow-up report" aria-pressed={followOpen} onClick={() => { if (followOpen) { setFollowOpen(false); return; } closeScreens("follow"); setFollowOpen(true); }}>
            <FollowIcon /><span className="fc-fab-label">Follow-up</span>{followReport.counts.overdue + followReport.counts.dueWeek ? <span className="fc-follow-badge" data-hpd-smoke="fc-follow-badge">{followReport.counts.overdue + followReport.counts.dueWeek}</span> : null}
          </button>,
            appts: (cls) => <button key="appts" type="button" className={cls} aria-label="Today's appointments" data-tip="Today's appointments" title="Today's appointments" data-hpd-smoke="fc-appts-open" aria-pressed={agendaOpen} onClick={() => { if (agendaOpen) { setAgendaOpen(false); return; } closeScreens("agenda"); setAgendaOpen(true); }}><ListIcon /><span className="fc-fab-label">Appts</span></button>,
            route: (cls) => <button key="route"
            type="button"
            className={`${cls} fc-route-fab`}
            aria-label="Today's route" data-tip="Today's route: plan your stops"
            title="Today's route"
            data-hpd-smoke="fc-route-open"
            aria-pressed={routeOpen}
            onClick={() => { if (routeOpen) { setRouteCloseRequest((n) => n + 1); return; } closeScreens("route"); setRouteOpenRequest((n) => n + 1); }}
          >
            <RouteIcon /><span className="fc-fab-label">Route</span>
          </button>,
            stats: (cls) => <button key="stats" type="button" className={cls} data-hpd-smoke="fc-stats-open" aria-label="My stats" data-tip="My stats: jobs and money" title="My stats" aria-pressed={statsOpen} onClick={() => { if (statsOpen) { setStatsOpen(false); return; } closeScreens("stats"); setStatsOpen(true); }}><StatsIcon /><span className="fc-fab-label">Stats</span></button>,
          };
          const stripKeys = DOCK_STRIP_ORDER.filter((key) => !dockSlots.includes(key));
          const holdEnd = () => window.clearTimeout(dockHold.current.timer);
          return (
            <>
              <nav
                className="fc-dock"
                data-hpd-smoke="fc-dock"
                aria-label="Main buttons"
                onTouchStart={() => undefined}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  // Press and hold a bottom button (about half a second) to swap it.
                  const b = (e.target as HTMLElement).closest("button");
                  const slot = b ? dockSlots.indexOf((b.dataset.hpdSmoke || "").replace(/^fc-|-open$/g, "") as DockKey) : -1;
                  holdEnd();
                  dockHold.current.fired = false;
                  if (slot < 0) return;
                  dockHold.current.timer = window.setTimeout(() => { dockHold.current.fired = true; try { navigator.vibrate?.(15); } catch { /* not on iPhone */ } setMoreOpen(false); setDockEdit(slot); }, 550);
                }}
                onPointerUp={holdEnd}
                onPointerCancel={holdEnd}
                onPointerLeave={holdEnd}
                onClickCapture={(e) => { if (dockHold.current.fired) { dockHold.current.fired = false; e.preventDefault(); e.stopPropagation(); } }}
              >
                {make[dockSlots[0]]("fc-dock-btn")}
                {make[dockSlots[1]]("fc-dock-btn")}
                {/* 🤖 Claude (owner, 3 Nov: "the AI button, isn't that the same as your chat bot?"): talking to the AI is the
                    chat bar right above; this middle button is Claude, who builds the app: green and turning while it works,
                    ❓ when it needs your answer, grey when the office computer is off. Opens Your requests. */}
                {!agent ? (() => {
                  const asks = (changeThreads || []).filter((x) => x.status === "Waiting for you").length;
                  const busy = claudeNowFresh(claudeNow) || (changeThreads || []).some((x) => x.status !== "Done" && Boolean(x.workingAt) && Date.now() - Date.parse(x.workingAt) < 30 * 60000);
                  const mode = asks ? "ask" : busy ? "working" : claudeIsOn(claudeSeenAt) || claudeNowFresh(claudeNow) ? "on" : "off";
                  return (<>
                    <button type="button" className={`fc-ai-orb fc-dock-ai fc-claude-orb is-${mode}${orbTap ? " is-tap" : ""}`} data-hpd-smoke="fc-claude-orb" data-mode={mode} data-tap={orbTap ? "1" : undefined}
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={() => {
                        if (!canListen) return;
                        window.clearTimeout(holdTimerRef.current);
                        holdTimerRef.current = window.setTimeout(() => {
                          // Held: listen right away, stop when the finger lets go (the orb is gone by then: the whole page listens).
                          holdingRef.current = true;
                          unlockChime();
                          setAgentFromDock(true);
                          setAgent({ heard: "🎤", reply: "Listening… let go when you're done." });
                          startListening();
                          const up = () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); holdingRef.current = false; holdEndedRef.current = Date.now(); listenRef.current?.stop(); };
                          window.addEventListener("pointerup", up);
                          window.addEventListener("pointercancel", up);
                        }, 450);
                      }}
                      onPointerUp={() => window.clearTimeout(holdTimerRef.current)}
                      onPointerLeave={() => window.clearTimeout(holdTimerRef.current)} aria-label={`Claude: ${mode === "ask" ? "needs your answer" : mode === "working" ? `working now${claudeNow?.text ? `: ${claudeNow.text}` : ""}` : mode === "on" ? "on, ready for a request" : "off right now"}. ${asks ? "Claude has a question. " : ""}Tap to talk`} onClick={() => { if (holdingRef.current || Date.now() - holdEndedRef.current < 800) return; unlockChime(); setAgentFromDock(true); startAgentChat(true); }}>
                      <span className="fc-ai-orb-core" aria-hidden="true"><HelperFace key={orbBack} mode={orbHappy ? "happy" : mode === "working" ? "working" : mode === "ask" ? "ask" : boardUrgent.some((r) => r.dueAt && hoursLeft(r, Date.now()) < 0) ? "worried" : orbNight ? "sleep" : mode === "off" ? "off" : "idle"} size={56} className={orbBack && Date.now() - orbBack < 1500 ? "is-back" : ""} outfit={robotOutfit({ happy: orbHappy, sleep: !orbHappy && mode !== "working" && mode !== "ask" && orbNight, wx: wxChip })} arms={orbHappy ? "thumbs" : orbSay || orbTap ? "wave" : ""} />{goal.total > 0 ? <svg className={`fc-goal-ring${goal.sent >= goal.total ? " is-full" : ""}`} viewBox="0 0 100 100" data-hpd-smoke="fc-goal-ring" data-sent={goal.sent} data-total={goal.total}><circle className="is-track" cx="50" cy="50" r="46" /><circle className="is-done" cx="50" cy="50" r="46" strokeDasharray={`${(289 * Math.min(1, goal.sent / goal.total)).toFixed(1)} 289`} /></svg> : null}{asks ? <b className="fc-claude-orb-badge">❓</b> : autoUpgrade ? <b className="fc-claude-orb-badge is-auto" data-hpd-smoke="fc-claude-orb-auto">🔁</b> : null}</span><span className="fc-fab-label">{mode === "working" ? "Working" : "Claude"}</span>
                    </button>
                    {orbSay && !bidsOpen && !selectedJob && !routeOpen && !moreOpen ? (
                      <button type="button" key={orbSay.at} className="fc-orb-say" data-hpd-smoke="fc-orb-say" onClick={() => { const say = orbSay; setOrbSay(null); unlockChime(); setAgentFromDock(true); if (say.run) { agentRef.current(say.run); return; } setAgent({ heard: "🗨", reply: say.full }); speak(say.full, 100); }}>{orbSay.text}</button>
                    ) : null}
                    </>
                  );
                })() : <span className="fc-dock-gap" aria-hidden="true" />}
                {make[dockSlots[2]]("fc-dock-btn")}
                <button type="button" className="fc-dock-btn" data-hpd-smoke="fc-more-open" aria-label="All: every screen" aria-pressed={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              <MenuIcon /><span className="fc-fab-label">All</span>{boardUrgent.length || bidsDue.today || followReport.counts.overdue || newReplies ? <span className="fc-more-dot" aria-hidden="true" /> : null}
            </button>
              </nav>
              {moreOpen ? (() => {
            const tap = (smoke: string) => { setMoreOpen(false); window.setTimeout(() => document.querySelector<HTMLElement>(`[data-hpd-smoke="${smoke}"]`)?.click(), 0); };
            const rows: { key: string; icon: string; label: string; info: string; go: () => void }[] = [
              { key: "weather", icon: wxChip?.icon || "🌤", label: "Weather", info: wxChip ? `${wxChip.temp}°${wxChip.note ? ` · ${wxChip.note}` : ""}` : "Today and tomorrow", go: () => { setMoreOpen(false); agentRef.current("what's the weather"); } },
              { key: "parking", icon: "🅿️", label: "Parking (street cleaning)", info: aspOffToday ? `No street cleaning today · ${aspOffToday}` : "Street cleaning rules today", go: () => { setMoreOpen(false); agentRef.current("is alternate side on today"); } },
              { key: "year", icon: "📆", label: "Year and dates", info: "Which jobs show on the map", go: () => tap("fc-days-menu-btn") },
              { key: "ai", icon: "✨", label: "Talk to the AI", info: "Ask anything", go: () => { setMoreOpen(false); startAgentChat(); } },
              { key: "ideas", icon: "💡", label: "Upgrade ideas", info: "Claude's next ideas · tap 👍 to build", go: () => { setMoreOpen(false); setWhatsNewOpen(true); void loadWhatsNew(); void loadChangeThreads(); } },
              { key: "ideas-more", icon: "💬", label: "More ideas", info: "Ask Claude for new ideas right now", go: () => { setMoreOpen(false); setWhatsNewOpen(true); void loadWhatsNew(); void askMoreIdeas(); } },
              { key: "dock", icon: "🔀", label: "Bottom buttons", info: `${dockSlots.map((key) => DOCK_LABEL[key]).join(" · ")} · hold one to swap`, go: () => { setMoreOpen(false); setDockEdit(3); } },
              { key: "map", icon: "🗺", label: "Map style", info: darkTiles ? "Dark map" : "Light map", go: () => { setMoreOpen(false); toggleTileStyle(); } },
              { key: "locate", icon: "📍", label: "Where am I", info: "Show me on the map", go: () => { setMoreOpen(false); locateMe(); } },
            ];
            return (
              <div className="fc-more-scrim" onClick={() => setMoreOpen(false)}>
                <section className="fc-more-sheet" role="dialog" aria-label="Everything" data-hpd-smoke="fc-more-sheet" onClick={(e) => e.stopPropagation()}>
                  <div className="fc-more-grab" aria-hidden="true" />
                  <h3>All</h3>
                  {/* Big round tiles for every screen that isn't on the bottom row; a tap opens it, then this sheet closes (bubble, not capture:
                  React re-renders between the two, which would remove the tile before its own tap ran). */}
                  <div className="fc-all-tiles" data-hpd-smoke="fc-all-tiles" onClick={() => setMoreOpen(false)}>
                    {stripKeys.map((key) => make[key]("fc-all-tile"))}
                    <Link href="/alerts/" className="fc-all-tile" data-hpd-smoke="fc-dock-alerts"><BellIcon /><span className="fc-fab-label">Alerts</span></Link>
                    {appVersion ? <button type="button" className="fc-all-tile is-new" data-hpd-smoke="fc-version-tag" onClick={() => { setWhatsNewOpen(true); void loadWhatsNew(); void loadChangeThreads(); const now = new Date().toISOString(); window.setTimeout(() => { setRepliesSeen(now); try { localStorage.setItem("hpd-replies-seen", now); } catch { /* private mode */ } }, 4000); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg><span className="fc-fab-label">What&apos;s new</span><small>{versionLabel() || `v${appVersion}`}</small>{newReplies ? <b className="fc-version-new" data-hpd-smoke="fc-version-new">💬 {newReplies} new update{newReplies === 1 ? "" : "s"}</b> : null}</button> : null}
                  </div>
                  {rows.map((r) => (
                    <button key={r.key} type="button" className="fc-more-row" data-hpd-smoke={`fc-more-${r.key}`} onClick={r.go}>
                      <span aria-hidden="true">{r.icon}</span><b>{r.label}</b><small>{r.info}</small><em aria-hidden="true">›</em>
                    </button>
                  ))}
                </section>
              </div>
            );
              })() : null}
            </>
          );
        })() : null}
        {dockEdit >= 0 && !selectedJob ? (
          <div className="fc-more-scrim" onClick={() => setDockEdit(-1)}>
            <section className="fc-more-sheet fc-dock-edit" role="dialog" aria-label="Bottom buttons" data-hpd-smoke="fc-dock-edit" onClick={(e) => e.stopPropagation()}>
              <div className="fc-more-grab" aria-hidden="true" />
              <h3>Bottom buttons</h3>
              <p className="fc-dock-edit-hint">Pick the 3 buttons next to ✨ AI. The others are big tiles under All.</p>
              {["Far left", "Left of AI", "Right of AI"].map((name, slot) => (
                <div key={name} className={`fc-dock-edit-slot${dockEdit === slot ? " is-on" : ""}`} data-hpd-smoke={`fc-dock-slot-${slot}`}>
                  <b>{name}</b>
                  <div className="fc-dock-edit-chips">
                    {DOCK_STRIP_ORDER.map((key) => (
                      <button key={key} type="button" aria-pressed={dockSlots[slot] === key} data-hpd-smoke={`fc-dock-pick-${slot}-${key}`} onClick={() => { setDockSlot(slot, key); setDockEdit(slot); }}>{DOCK_LABEL[key]}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="fc-dock-edit-foot">
                <button type="button" data-hpd-smoke="fc-dock-reset" onClick={() => saveDockSlots([...DOCK_DEFAULT])}>Back to Jobs · Bids · Notices</button>
                <button type="button" className="is-done" data-hpd-smoke="fc-dock-done" onClick={() => setDockEdit(-1)}>Done</button>
              </div>
            </section>
          </div>
        ) : null}
        <div className="fc-map-controls" onTouchStart={() => undefined}>
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
          {/* Weather + 🅿️ no street cleaning today (28 Oct): the first line of the top-left column, so it never sits on top of the job banners (28 Oct, "make the layout better"). */}
          {(wxChip || aspOffToday) && !selectedJob && !agent ? (
            <div className="fc-wx-row">
              {wxChip ? (
                <button type="button" className={`fc-wx-chip${wxChip.alert ? " is-alert" : ""}`} data-hpd-smoke="fc-wx-chip" aria-label={`Weather: ${wxChip.temp} degrees${wxChip.note ? `, ${wxChip.note}` : ""}. Tap for the forecast`} onClick={() => { unlockChime(); agentRef.current("what's the weather"); }}>
                  <span aria-hidden="true">{wxChip.icon}</span><b>{wxChip.temp}°</b>{wxChip.note ? <small>{wxChip.note}</small> : null}
                </button>
              ) : null}
              {aspOffToday ? (
                <button type="button" className="fc-asp-chip" data-hpd-smoke="fc-asp-chip" aria-label={`No alternate side parking today (${aspOffToday}). Tap for details`} onClick={() => { unlockChime(); agentRef.current("is alternate side on today"); }}>
                  <span aria-hidden="true">🅿️</span><b>No street cleaning</b><small>park free</small>
                </button>
              ) : null}
            </div>
          ) : null}
          {locateStatus === "error" ? (
            <p className="fc-map-hint fc-map-hint-warn">Couldn&apos;t get your location</p>
          ) : null}

          {!jobs.length ? (
            <p className={`fc-map-hint ${jobsLoadFailed ? "fc-map-hint-warn" : ""}`} role="status">{jobsLoadFailed ? "Couldn't load jobs. Check the connection; retrying." : "Loading jobs..."}</p>
          ) : !filteredJobs.length && !jobsOpen ? (
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
          {/* In the same column as the other map notes (2 Nov: on top of "⚠ jobs need a check" it took its taps). */}
          {/* 🤖 Claude live (owner, 30 Oct: "when I'm talking to AI and it's sending a request to Claude, I should be able to see
              the progress of the request, what's going on all the time, live request updates"): the newest open request on
              the map with its status, steps, the step being done now and the last note; checked every 20 s while open. */}
          {(() => {
            const activity = (t: ChangeThread) => [t.at, t.workingAt, ...t.updates.map((u) => u.at)].filter(Boolean).sort().slice(-1)[0] || "";
            const live = (changeThreads || []).filter((t) => !(t.status === "Done" && t.ok)).filter((t) => (t.status !== "Done" ? Date.now() - Date.parse(activity(t)) < 7 * 86400000 : Date.now() - Date.parse(activity(t)) < 15 * 60000))
              .sort((a, b) => activity(b).localeCompare(activity(a)));
            claudeLiveRef.current = live.some((t) => t.status !== "Done" && t.status !== "Waiting for you");
            claudeWorkingRef.current = live.some((t) => t.status !== "Done" && Boolean(t.workingAt) && Date.now() - Date.parse(t.workingAt) < 30 * 60000);
            // The one Claude is working on comes first (3 Nov: a 💬 goes to the request being built, not the newest one).
            const t = live.find((x) => x.status !== "Done" && Boolean(x.workingAt) && Date.now() - Date.parse(x.workingAt) < 30 * 60000) || live[0];
            const nowOn = claudeNowFresh(claudeNow) && claudeNow ? claudeNow : null;
            if (selectedJob || jobsOpen || bidsOpen || noticesOpen || whatsNewOpen || boardOpen || trackerOpen) return null;
            const talkTo = t && t.status !== "Done" ? t : null;
            const tell = async (raw: string) => {
              const text = raw.trim();
              if (!text) return;
              const ok = talkTo ? await sendChangeAnswer(talkTo, text) : await sendRequest(`(while Claude works) ${text}`);
              setClaudeTalkText("");
              setClaudeTalkSent(ok ? `✓ Sent: “${text.slice(0, 60)}”. Claude reads it within a minute.` : "Saved on this phone; it goes when the connection is back.");
            };
            const talkBox = claudeTalk ? (
              <div className="fc-claude-talk" data-hpd-smoke="fc-claude-talk">
                <span className="fc-claude-talk-chips">
                  {["⏸ Stop for now", "⬆ Do this one first", "👍 Looks good, keep going", "❓ What are you doing?"].map((c) => <button key={c} type="button" data-hpd-smoke="fc-claude-talk-chip" onClick={() => void tell(c)}>{c}</button>)}
                </span>
                <form onSubmit={(e) => { e.preventDefault(); void tell(claudeTalkText); }}>
                  <input value={claudeTalkText} onChange={(e) => setClaudeTalkText(e.target.value)} placeholder="Or type to Claude…" aria-label="Message to Claude" data-hpd-smoke="fc-claude-talk-input" enterKeyHint="send" />
                  <button type="submit" disabled={!claudeTalkText.trim()} data-hpd-smoke="fc-claude-talk-send">➤</button>
                </form>
                {claudeTalkSent ? <small data-hpd-smoke="fc-claude-talk-sent" role="status">{claudeTalkSent}</small> : null}
              </div>
            ) : null;
            const talkBtn = <button type="button" className="fc-claude-live-x fc-claude-talk-btn" aria-label="Talk to Claude" aria-pressed={claudeTalk} data-hpd-smoke="fc-claude-talk-open" onClick={() => { setClaudeTalk((o) => !o); setClaudeTalkSent(""); }}>💬</button>;
            // Hidden with ×: a small tab stays where the card was, one tap brings it back (owner, 3 Nov: "hide and unhide").
            const showTab = (label: string, kind: string) => <button type="button" className={`fc-claude-live-tab is-${kind}`} data-hpd-smoke="fc-claude-live-show" onClick={() => setClaudeLiveHidden("")}><i className="fc-claude-live-dot" aria-hidden="true" />🤖 {label} <b>Show ▾</b></button>;
            const smaller = <button type="button" className="fc-claude-live-x fc-claude-smaller" aria-label="Make it one line" data-hpd-smoke="fc-claude-smaller" onClick={() => setClaudeCardBig(false)}>▴</button>;
            const slim = (kind: string, line: string, pct: number | null, hide: () => void) => (
              <div className={`fc-claude-live fc-claude-slim is-${kind}`} data-hpd-smoke="fc-claude-live" data-slim="1" role="status" aria-live="polite">
                <button type="button" className="fc-claude-slim-main" data-hpd-smoke="fc-claude-expand" aria-label="Show what Claude is doing" onClick={() => setClaudeCardBig(true)}>
                  <i className="fc-claude-live-dot" aria-hidden="true" />
                  <span className="fc-claude-slim-text" key={line} data-hpd-smoke="fc-claude-slim-text"><HelperFace mode={kind === "working" ? "working" : kind === "ask" ? "ask" : "idle"} size={24} /> {line}</span>
                  {pct !== null ? <em data-hpd-smoke="fc-claude-slim-pct">{pct}%</em> : null}
                  <i className={`fc-claude-slim-bar${kind === "working" ? " is-moving" : ""}`} aria-hidden="true"><i style={{ width: `${pct === null ? (kind === "working" ? 100 : 0) : Math.max(pct, kind === "working" ? 6 : 0)}%` }} /></i>
                </button>
                {kind === "working" || kind === "ask" ? <button type="button" className="fc-claude-live-x fc-claude-talk-btn" aria-label="Talk to Claude" data-hpd-smoke="fc-claude-talk-open" onClick={() => { setClaudeCardBig(true); setClaudeTalk(true); setClaudeTalkSent(""); }}>💬</button> : null}
                <button type="button" className="fc-claude-live-x" aria-label="Hide" data-hpd-smoke="fc-claude-live-hide" onClick={hide}>×</button>
              </div>
            );
            if ((!t || t.status === "Done") && nowOn) {
              if (claudeLiveHidden === `now|${nowOn.task}`) return showTab("Claude working", "working");
              if (!claudeCardBig) return slim("working", nowOn.text || "working", null, () => setClaudeLiveHidden(`now|${nowOn.task}`));
              return (
                <div className="fc-claude-live is-working" data-hpd-smoke="fc-claude-live" data-kind="now" role="status" aria-live="polite">
                  <button type="button" className="fc-claude-live-main" onClick={() => goTo("requests", "")}>
                    <b><i className="fc-claude-live-dot" aria-hidden="true" />🤖 Claude · working now</b>
                    {nowOn.task ? <span className="fc-claude-live-req">“{nowOn.task.slice(0, 70)}”</span> : null}
                    <ClaudeNowLines now={nowOn} />
                  </button>
                  <span className="fc-claude-live-side">{talkBtn}<button type="button" className="fc-claude-live-x" aria-label="Hide until the next job" data-hpd-smoke="fc-claude-live-hide" onClick={() => setClaudeLiveHidden(`now|${nowOn.task}`)}>×</button>{smaller}</span>
                  {talkBox}
                </div>
              );
            }
            if (!t) return null;
            const done = t.steps.filter((s) => s.done).length;
            const nowStep = t.steps.find((s) => !s.done);
            const working = t.workingAt && Date.now() - Date.parse(t.workingAt) < 30 * 60000;
            const lastNote = t.updates[t.updates.length - 1];
            const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
            const state = t.status === "Done" ? "done" : t.status === "Waiting for you" ? "ask" : working ? "working" : "queued";
            const pct = t.steps.length ? Math.round((done / t.steps.length) * 100) : null;
            if (!claudeCardBig && claudeLiveHidden !== `${t.id}|${activity(t)}`) {
              const ask = t.text.replace(/^\((said to the helper|from the chat|idea|auto upgrade)\)\s*/i, "").slice(0, 60);
              const line = state === "working" ? (nowOn?.text || t.now?.text || (nowStep ? `Now: ${nowStep.text}` : "working on it")) : state === "done" ? `✅ Done: ${ask}` : state === "ask" ? `❓ Needs your answer: ${ask}` : claudeIsOn(claudeSeenAt) ? `Starting soon: ${ask}` : `⏸ Waiting for the office computer: ${ask}`;
              return slim(state, line, state === "done" ? null : pct, () => setClaudeLiveHidden(`${t.id}|${activity(t)}`));
            }
            if (claudeLiveHidden === `${t.id}|${activity(t)}`) return showTab(state === "working" ? `Claude working${t.steps.length ? ` · ${Math.round((done / t.steps.length) * 100)}%` : ""}` : state === "done" ? "Claude: done" : state === "ask" ? "Claude needs you" : "Claude", state);
            return (
              <div className={`fc-claude-live is-${state}`} data-hpd-smoke="fc-claude-live" role="status" aria-live="polite">
                <button type="button" className="fc-claude-live-main" onClick={() => goTo("requests", "")}>
                  <b><i className="fc-claude-live-dot" aria-hidden="true" />🤖 Claude · {state === "working" ? "working on it now" : state === "done" ? "✅ done" : state === "ask" ? "❓ needs your answer" : claudeIsOn(claudeSeenAt) ? "on, starting in a minute or two" : "⏸ off: starts when the office computer is on"}</b>
                  <span className="fc-claude-live-req">“{t.text.replace(/^\((said to the helper|from the chat)\)\s*/i, "").slice(0, 70)}{t.text.length > 70 ? "…" : ""}”</span>
                  {t.steps.length ? (
                    <span className="fc-claude-live-steps" data-hpd-smoke="fc-claude-live-steps">
                      <span className={`fc-claude-live-bar${state === "working" ? " is-moving" : ""}`} aria-hidden="true"><span style={{ width: `${Math.max(Math.round((done / t.steps.length) * 100), state === "working" ? 6 : 0)}%` }} /></span>
                      <b className="fc-claude-live-pct" data-hpd-smoke="fc-claude-live-pct">{Math.round((done / t.steps.length) * 100)}%</b> {done}/{t.steps.length}{nowStep && state !== "done" ? ` · Now: ${nowStep.text}` : ""}
                    </span>
                  ) : null}
                  {state === "working" ? <WorkingClock since={t.workingAt} /> : null}
                  {nowOn && state !== "done" ? <ClaudeNowLines now={nowOn} /> : state === "working" && t.now ? <span className="fc-claude-live-now" data-hpd-smoke="fc-claude-live-now">⚡ {t.now.text.slice(0, 120)} <SecondsAgo at={t.now.at} /></span> : null}
                  {state === "working" && changeCheckedAt ? <span className="fc-claude-live-checked" data-hpd-smoke="fc-claude-live-checked">🔄 Live: checked <SecondsAgo at={new Date(changeCheckedAt).toISOString()} bare /></span> : null}
                  {lastNote ? <span className="fc-claude-live-note" data-hpd-smoke="fc-claude-live-note">{lastNote.text.slice(0, 140)} <small>· {ago(lastNote.at)}</small></span> : <span className="fc-claude-live-note">Sent {ago(t.at)}. {pickupLabel(claudeSeenAt)}.</span>}
                </button>
                <span className="fc-claude-live-side">{state !== "done" ? talkBtn : null}<button type="button" className="fc-claude-live-x" aria-label="Hide until the next update" data-hpd-smoke="fc-claude-live-hide" onClick={() => setClaudeLiveHidden(`${t.id}|${activity(t)}`)}>×</button>{smaller}</span>
                {state !== "done" ? talkBox : null}
              </div>
            );
          })()}
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
          }} openRequest={routeOpenRequest} buildRequest={routeBuildRequest} closeRequest={routeCloseRequest} onOpenChange={setRouteOpen} onNavigate={rememberNavigation} onPreview={drawDayRoute} onSelect={id => {setSelectedJob(jobs.find(job=>jobId(job)===id)||null);setSheetExpanded(false);}} />
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
              <button type="button" className="fc-job-read" aria-label="Read this job to me" data-hpd-smoke="jc-read" onClick={(e) => { e.stopPropagation(); const j = selectedJob; window.dispatchEvent(new CustomEvent("hpd-read-aloud", { detail: { title: `Job ${jobId(j)}`, omo: jobId(j), go: wazeHref(j), text: `${jobId(j)}, ${jobAddress(j).replace(/,\s*\d{5}$/, "")}. ${jobStatus(j)}. The work: ${jobSummary(jobScope(j)).lines.map(lineText).join("; ") || "no description"}.` } })); }}>🔊</button>
              <button type="button" className="fc-job-sheet-close" aria-label="Close" title="Close job details" onClick={() => setSelectedJob(null)}>
                <span aria-hidden="true">&times;</span>
              </button>
              {(() => {
                const omo = jobId(selectedJob);
                const it = prioByOmo.get(omo);
                const rj = openRejections.find((r) => r.omo === omo);
                // HPD asked about the job (an email naming it, nothing sent since) without a timed notice: it glows
                // "🔥 Asked" on the map, so the card says why too (2 Nov: tapped, and the card didn't say).
                const asked = !it && !rj ? followReport.hpdAsked.find((r) => r.omo === omo) : undefined;
                if (!it && !rj && !asked) return null;
                const due = it ? dueText(it.dueAt) : "";
                const outcomes = [["work_completed", "✅ Work completed"], ["refused_access", "🚫 Refused access"], ["no_access", "🚪 No access"], ["completed_by_others", "👷 Completed by others"], ["partial_work_completed", "🔁 Partly done / going back"]] as const;
                return (
                  <div className={`fc-prio-card${it?.kind === "24h" ? " is-24h" : ""}${/overdue/.test(due) ? " is-late" : ""}`} data-hpd-smoke="fc-prio-card">
                    {it ? <>
                      <p className="fc-prio-card-head"><b>🔥 PRIORITY</b> · {it.title}{it.who ? ` · ${it.who}` : ""}</p>
                      {due ? <p className="fc-prio-card-due" data-hpd-smoke="fc-prio-card-due">⏱ {due}</p> : <p className="fc-prio-card-due">Asked {new Date(it.askedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</p>}
                      <p className="fc-prio-card-want">{it.want}</p>
                      {(() => { const f = noticeFindings({ omo, job: selectedJob as Record<string, unknown>, sent: followRef.current?.sent?.[omo] as { sentAt?: string; count?: number } | undefined, hpd: followRef.current?.hpd?.[omo] as { closedReason?: string; amount?: number } | undefined, pip: pipMap[omo], rejection: rj || null }); return (
                        <div className="fc-found is-light" data-hpd-smoke="fc-prio-found"><b>🔎 Found on record</b><ul>{f.lines.map((l, i) => <li key={i} className={`is-${l.tone}`}>{l.icon} {l.text}</li>)}</ul>{f.lines.some((l) => /sent to HPD on|emailed them PDFs/i.test(l.text)) ? <SentPaperworkLink omo={omo} light /> : null}<p className="fc-found-next">👉 {f.advice.text}</p></div>
                      ); })()}
                      <p className="fc-prio-card-q">What happened? Pick it, put the date, and the affidavit (copy + original) is made for you to check:</p>
                      <div className="fc-prio-outcomes" data-hpd-smoke="fc-prio-outcomes">
                        {outcomes.map(([k, label]) => <a key={k} href={`/paperwork/?job=${encodeURIComponent(omo)}&outcome=${k}`} data-hpd-smoke={`fc-prio-outcome-${k}`}>{label}</a>)}
                      </div>
                      <div className="fc-notice-actions">
                        {it.threadId ? <button type="button" onClick={() => setThreadView({ ids: [it.threadId], title: `${omo}: ${it.title}` })}>💬 Their email</button> : null}
                        <button type="button" onClick={() => { setNoticesTab("priority"); setNoticesOpen(true); }}>✉ Reply / Handled</button>
                      </div>
                    </> : null}
                    {asked ? <>
                      <p className="fc-prio-card-head"><b>🔥 PRIORITY</b> · HPD asked about this job{asked.askedBy ? ` · ${asked.askedBy}` : ""}</p>
                      <p className="fc-prio-card-due" data-hpd-smoke="fc-prio-card-due">Asked {new Date(asked.askedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}{asked.askedFor ? ` · ${asked.askedFor}` : ""}: nothing sent since</p>
                      <p className="fc-prio-card-q">What happened? Pick it, put the date, and the affidavit (copy + original) is made for you to check:</p>
                      <div className="fc-prio-outcomes" data-hpd-smoke="fc-prio-outcomes">
                        {outcomes.map(([k, label]) => <a key={k} href={`/paperwork/?job=${encodeURIComponent(omo)}&outcome=${k}`} data-hpd-smoke={`fc-prio-outcome-${k}`}>{label}</a>)}
                      </div>
                      <div className="fc-notice-actions">
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
              {/* 👤 The tenant first (owner, 29 Oct: "the first thing I need to do on the job is to contact the tenant; once we
                  made contact it should log it; even no answer; what we send through the app logs on the job card
                  permanently"): reached or not, one tap to call or text, and every call, text, reply and appointment kept
                  on the job (the status server), newest first. */}
              {(() => {
                const cs = tenantContactState(selectedJob as Record<string, unknown>, tenant.commonArea);
                const hist = cs.log;
                const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
                const label = (v: { outcome?: string | null; note?: string }) => /^APPOINTMENT_/.test(String(v.outcome || "")) ? `📅 Appointment ${String(v.outcome).replace("APPOINTMENT_", "").toLowerCase()}: ${String(v.note || "").split(" America/")[0]}` : `${/called|talked/i.test(String(v.note)) ? "📞" : /replied/i.test(String(v.note)) ? "💬" : "📱"} ${String(v.note || "").replace(/\.$/, "")}`;
                const { reachedAt, tries } = cs;
                const last = hist[hist.length - 1];
                const asking = last?.note === "Called the tenant" && Date.now() - Date.parse(String(last.recordedAt || "")) < 3 * 3600000;
                const raw = (tenant.name || "").split(/\s+/)[0];
                const first = raw && raw.length > 1 ? `${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "the tenant";
                const status = reachedAt ? { tone: "ok", text: `✅ Reached ${first} · ${when(reachedAt)}` }
                  : cs.tone === "common" ? { tone: "common", text: "🏢 Public area job (hallway, stairs): no tenant to call. Log anyone you talk to by calling from here." }
                  : tries ? { tone: "try", text: `🟡 Not reached yet · ${tries} ${tries === 1 ? "try" : "tries"}, last ${when(last?.recordedAt)}` }
                  : { tone: "none", text: "🔴 Not contacted yet: text the tenant the job summary first, then call" };
                const newest = [...hist].reverse();
                const callLog = (what: string) => { setCallAsk(""); agentRef.current(`I called the tenant for ${id}, ${what}`); };
                return (
                  <section className={`jc-contact is-${status.tone}`} data-hpd-smoke="jc-contact" aria-label="Tenant contact">
                    <p className="jc-contact-status" data-hpd-smoke="jc-contact-status">{status.text}</p>
                    {tenant.phone ? (
                      <div className={`jc-contact-btns${cs.tone === "none" && !tenant.commonArea ? " is-text-first" : ""}`}>
                        <a className={`jc-contact-call${reachedAt ? "" : " is-first"}`} data-hpd-smoke="jc-contact-call" href={`tel:${tenant.phone}`} onClick={() => startTenantCall(selectedJob)}>📞 Call {first}</a>
                        {!tenant.commonArea ? <button type="button" className="jc-contact-textbtn" data-hpd-smoke="jc-contact-text" onClick={() => { openTenantText(selectedJob); window.setTimeout(() => document.querySelector('[data-hpd-smoke="jc-tenant-draft"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 150); }}>{cs.tone === "none" ? "📱 First: text the job summary" : "📱 Text"}</button> : null}
                      </div>
                    ) : <p className="jc-contact-none" data-hpd-smoke="jc-contact-nophone">No tenant phone on this job yet{privateOk === false ? ": sign in under Tenant below to see it" : ""}.</p>}
                    {asking ? (
                      <div className="jc-contact-ask" data-hpd-smoke="jc-contact-ask">
                        <b>How did the call go?</b>
                        <button type="button" data-hpd-smoke="jc-contact-noanswer" onClick={() => callLog("no answer")}>No answer</button>
                        <button type="button" data-hpd-smoke="jc-contact-voicemail" onClick={() => callLog("left a voicemail")}>Voicemail</button>
                        <button type="button" className="is-yes" data-hpd-smoke="jc-contact-talked" onClick={() => callLog("talked")}>Talked</button>
                      </div>
                    ) : null}
                    {/* 📍 3 tries over 2+ days and no answer (30 Oct): go anyway for the 1st access attempt. */}
                    {cs.goAnyway && !activeAppointment(selectedJob) && !FIELD_OUTCOMES[value(selectedJob, ["FieldOutcome", "fieldOutcome"])] ? (() => {
                      const onRoute = routeAdded === id || todayRouteIds().includes(id);
                      return (
                        <div className="jc-contact-go" data-hpd-smoke="jc-contact-go">
                          <p>📍 {tries} tries since {when(cs.firstTryAt).split(",").slice(0, 2).join(",")} and no answer: go anyway for the 1st access attempt. No Access needs 2 visits 72 hours apart.</p>
                          {onRoute ? <span className="jc-contact-go-done" data-hpd-smoke="jc-contact-go-done">✅ On Today&apos;s route</span>
                            : <button type="button" data-hpd-smoke="jc-contact-go-add" onClick={() => { if (addToTodayRoute(id)) setRouteAdded(id); }}>➕ Add to Today&apos;s route</button>}
                        </div>
                      );
                    })() : null}
                    {/* Reached -> book the visit; booked -> when (29 Oct: text -> call -> reached -> appointment, all in one box). */}
                    {(() => {
                      const appt = activeAppointment(selectedJob);
                      if (appt) return <p className={`jc-contact-appt is-${appt.state}`} data-hpd-smoke="jc-contact-appt">📅 Appointment {appointmentLabel(appt)} · {appt.state === "confirmed" ? "confirmed" : "not confirmed yet"}</p>;
                      return reachedAt && !tenant.commonArea ? <button type="button" className="jc-contact-book" data-hpd-smoke="jc-contact-book" onClick={openAppointment}>📅 Reached: book the visit</button> : null;
                    })()}
                    {hist.length ? (
                      <ul className="jc-tenant-history" data-hpd-smoke="jc-tenant-history">
                        {(contactAll ? newest : newest.slice(0, 4)).map((v, i) => <li key={i}><span>{label(v)}</span><small>{when(v.recordedAt)}</small></li>)}
                      </ul>
                    ) : null}
                    {hist.length > 4 ? <button type="button" className="jc-contact-more" data-hpd-smoke="jc-contact-more" onClick={() => setContactAll((v) => !v)}>{contactAll ? "Show less" : `Show all ${hist.length}`}</button> : null}
                    {/* 📋 The record for HPD / vendor tracking (30 Oct): the whole log as text, to the share sheet or copied. */}
                    {hist.length ? (
                      <button type="button" className="jc-contact-share" data-hpd-smoke="jc-contact-share" onClick={async () => {
                        const text = tenantContactRecord({ omo: id, address: jobAddress(selectedJob), log: hist });
                        try {
                          if (navigator.share) { await navigator.share({ title: `Tenant contact record · ${id}`, text }); return; }
                          await navigator.clipboard.writeText(text);
                          setContactCopied(id);
                        } catch { /* closed the share sheet */ }
                      }}>{contactCopied === id ? "✅ Copied: paste it into your reply" : "📋 Share contact record"}</button>
                    ) : null}
                    {/* ➡️ Next tenant (30 Oct, like the next bid after a NO BID): once this one is logged, the next to-do job
                        whose tenant isn't reached yet (has a phone, not tried in the last 3 hours), oldest due first. */}
                    {(() => {
                      if (asking || !last || Date.now() - Date.parse(String(last.recordedAt || "")) > 30 * 60000) return null;
                      const left = tenantsToCall(jobRows, id);
                      const next = left[0];
                      const nextJob = next && jobs.find((j) => jobId(j) === next.id);
                      if (!nextJob) return null;
                      return (
                        <button type="button" className="jc-contact-next" data-hpd-smoke="jc-contact-next" data-omo={next.id} onClick={() => { setCallAsk(""); setContactAll(false); openIssueJob(nextJob, true); }}>
                          <span>➡️ Next tenant to call · {left.length} left</span><small>{next.id} · {next.address}</small>
                        </button>
                      );
                    })()}
                  </section>
                );
              })()}

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
                      <button type="button" data-hpd-smoke="jc-test-reset" onClick={() => void resetTestJob(selectedJob)}>{armedTap === "reset-test" ? "✅ Tap again: reset" : "🔄 Reset test job"}</button>
                    </p>
                  ) : <p>Use Start over to clear everything and run it again.</p>}
                </div>
              ) : null}
              <section className="jc-description" aria-label="Job description" data-hpd-smoke="jc-description">
                {/* The job first, in plain words (owner, 22 Oct: "the job description very nice and clear right there on top,
                    and a summary"): what to do, how much, where in the building; HPD's own text below. */}
                {hasScope ? (() => {
                  const sum = jobSummary(scope);
                  const where = [...sum.where, ...sum.rooms];
                  return (
                    <div className="jc-job-sum" data-hpd-smoke="jc-job-sum">
                      <b>📋 The job</b>
                      <ul>{sum.lines.length ? sum.lines.map((l) => <li key={l.key}>{lineText(l)}</li>) : <li>{scope.replace(/\s+/g, " ").split(/(?<=\.)\s/)[0].slice(0, 140)}</li>}</ul>
                      {where.length ? <p data-hpd-smoke="jc-job-where">📍 {where.join(" · ")}</p> : null}
                    </div>
                  );
                })() : null}
                <div className="jc-section-head">
                  <strong>HPD&apos;s full text</strong>
                  {hasScope && scope.length > 260 ? <button type="button" className="jc-description-more" onClick={() => setScopeOpen((open) => !open)}>{scopeOpen ? "Less" : "All"}</button> : null}
                </div>
                <p className={`jc-description-text ${scopeOpen ? "is-open" : ""} ${hasScope ? "" : "is-missing"}`} data-hpd-smoke="jc-description-text">{scope}</p>
                {(hasScope && speechOk) || itbFileName(selectedJob) ? (
                  <div className="jc-description-actions">
                    {hasScope && speechOk ? <>
                      <button type="button" className="jc-read" data-hpd-smoke="jc-description-read" onClick={() => { const sum = jobSummary(scope); const plain = [...sum.lines.map(lineText), ...(sum.where.length || sum.rooms.length ? [`Where: ${[...sum.where, ...sum.rooms].join(", ")}`] : [])].join(". "); setReading(readAloud(`${jobAddress(selectedJob)}. ${plain ? `The job: ${plain}. HPD says: ` : ""}${scope}`, () => setReading(false))); }}>
                        {reading ? "🔊 Reading..." : "🔊 Read aloud"}
                      </button>
                      <button type="button" data-hpd-smoke="jc-description-stop" onClick={() => { stopReading(); setReading(false); }} disabled={!reading}>Stop</button>
                    </> : null}
                    {itbFileName(selectedJob) ? <button type="button" data-hpd-smoke="jc-itb-page" onClick={() => void openItbPage(selectedJob)}>📄 ITB page</button> : null}
                  </div>
                ) : null}
              </section>
              {/* 🏢 The building on the job card too (27 Oct, "keep upgrading"): year built, floors, walk-up or elevator,
                  open HPD violations and the ones like this job, before you get there (city records, kept 12 hours). */}
              {(() => { const boro = jobBorough(selectedJob); return <BuildingFacts address={jobAddress(selectedJob).replace(/,\s*\d{5}$/, "")} borough={boro === "NYC" ? "" : boro} description={hasScope ? scope : ""} />; })()}

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
                // An outcome saved straight from "Just the affidavit" skips arrive / start visit, so the package is next.
                const steps = [
                  { done: Boolean(stamps.arrived) || Boolean(savedOutcome) },
                  { done: Boolean(stamps.visit) || Boolean(savedOutcome) },
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
                const setDraft = (patch: Partial<OutcomeDraft>) => setOutcomeDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || { outcome: "", note: "" }), ...patch } }));
                const datedPick = Boolean(draft.outcome) && draft.outcome !== "APPOINTMENT_REQUESTED";
                const changing = changeOutcomeFor === id && Boolean(savedOutcome) && !steps[5].done;
                // ✏️ Change outcome or date (31 Oct, "keep upgrading": a wrong pick on the card had no way back): the
                // saved outcome, its date and who refused, ready to change.
                const startChange = () => {
                  const savedAt = savedOutcome === "REFUSED_ACCESS" ? value(selectedJob, ["RefusalDate"]) : savedOutcome === "WORK_COMPLETED_BY_OTHERS" ? value(selectedJob, ["CompletedByOthersDate"])
                    : savedOutcome === "NO_ACCESS_1_WAITING_72H" ? value(selectedJob, ["NoAccessFirstAttemptAt"]) : value(selectedJob, ["ActualWorkCompletionDate"]);
                  setDraft({ outcome: savedOutcome, note: "", date: newYorkDay(savedAt) || "", who: value(selectedJob, ["DeniedDescription"]) });
                  setChangeOutcomeFor(id);
                  window.setTimeout(() => document.querySelector('[data-hpd-smoke="jc-affidavit-only"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                };
                const outcomeForm = (keys: string[]) => keys.includes(draft.outcome) ? (
                  <div className="jc-step-form">
                    {/* Just what the paperwork needs (owner, 30 Oct: "if I hit refused access I should get the menu for refused
                        access: confirm, change the date, the person's description; same with work completed"). */}
                    {datedPick ? (
                      <label className="jc-outcome-date">{draft.outcome === "REFUSED_ACCESS" ? "📅 Date refused" : draft.outcome === "WORK_COMPLETED_BY_OTHERS" ? "📅 Date found done" : draft.outcome === "WORK_COMPLETED" || draft.outcome === "PARTIAL_WORK" ? "📅 Date finished" : "📅 Date you were there"}
                        <input type="date" data-hpd-smoke="jc-outcome-date" value={draft.date || nyToday()} max={nyToday()} onChange={(event) => setDraft({ date: event.target.value })} />
                        <small>{(draft.date || nyToday()) === nyToday() ? "Today. Change it if it was another day." : "A past day: the affidavit and the invoice use this date."}</small>
                      </label>
                    ) : null}
                    {draft.outcome === "REFUSED_ACCESS" ? (
                      <div className="jc-refused-questions" data-hpd-smoke="jc-refused-questions">
                        <label>👤 Person who refused (description)
                          <input data-hpd-smoke="jc-refused-who" value={draft.who || ""} placeholder="MALE, TALL, DARK HAIR" onChange={(event) => setDraft({ who: event.target.value })} />
                        </label>
                        <div className="jc-refused-chips">{["Male, tall, dark hair", "Female, short, dark hair", "Male, short, gray hair"].map((d) => <button key={d} type="button" onClick={() => setDraft({ who: d })}>{d}</button>)}</div>
                      </div>
                    ) : null}
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
                    {/* 📝 Just the affidavit (owner, 30 Oct: "when I arrive that's fine, I start the job, but sometimes I just want to
                        fill up the affidavit: the outcome, what happened, refused access, no access ..."): pick what happened, its
                        date (and who refused), Save, and the package opens. No arrive / start visit first. */}
                    {(!savedOutcome && !workStarted && current < 2 && !secondTry) || changing ? (() => {
                      const quick = [...noWorkOutcomes, "WORK_COMPLETED", ...(changing ? ["PARTIAL_WORK"] : [])];
                      return (
                        <li className={`jc-step jc-step-affidavit ${quick.includes(draft.outcome) ? "is-current" : ""}`} data-hpd-smoke="jc-affidavit-only">
                          <span className="jc-step-num" aria-hidden="true">{changing ? "✏️" : "📝"}</span>
                          <div>
                            <b>{changing ? "Change what happened" : "Just the affidavit?"}</b>
                            <small>{changing ? `Saved: ${FIELD_OUTCOMES[savedOutcome]}. Change the outcome, the date${savedOutcome === "REFUSED_ACCESS" ? " or who refused" : ""}, then Save.${draft.outcome === "NO_ACCESS_1_WAITING_72H" ? " No access starts again at the 1st try." : ""}` : "Already know what happened? Pick it: no need to tap I have arrived."}</small>
                            <div className="jc-step-choices">
                              {quick.map((key) => (
                                <button key={key} type="button" className={draft.outcome === key ? "is-picked" : ""} data-hpd-smoke={`jc-affidavit-${key.toLowerCase()}`} onClick={() => setDraft(draft.outcome === key ? { outcome: "" } : { outcome: key })}>{OUTCOME_ICONS[key] || "✅"} {FIELD_OUTCOMES[key]}</button>
                              ))}
                            </div>
                            {outcomeForm(quick)}
                            {changing ? <button type="button" className="jc-step-more" data-hpd-smoke="jc-change-outcome-cancel" onClick={() => { setChangeOutcomeFor(""); setDraft({ outcome: "", date: "", who: "" }); }}>Cancel: keep {FIELD_OUTCOMES[savedOutcome]}</button> : null}
                          </div>
                        </li>
                      );
                    })() : null}
                    {(value(selectedJob, ["TravelStartedAt"]) || !stamps.arrived) && !savedOutcome ? (
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
                        <small>{stamps.arrived ? `Arrived ${formatSavedTime(stamps.arrived)}${value(selectedJob, ["ArrivedLatitude"]) ? " · location saved" : ""}` : savedOutcome ? "Skipped: outcome saved for the affidavit" : "Saves the time and your location"}</small>
                        {current === 0 ? <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-arrived" disabled={!workflowLoaded} onClick={() => markArrived(selectedJob)}>I have arrived<span aria-hidden="true">&rarr;</span></button> : null}
                      </div>
                    </li>
                    <li className={stepClass(1)}>
                      {num(1)}
                      <div>
                        <b>Start visit</b>
                        <small>{stamps.visit ? `Started ${formatSavedTime(stamps.visit)}` : savedOutcome ? "Skipped" : "Head to the job site; read the description above"}</small>
                        {current === 1 ? <button type="button" className="fc-next-action jc-glow" data-hpd-smoke="jc-step-visit" onClick={() => saveWorkflowStamp(selectedJob, "visit")}>Start visit<span aria-hidden="true">&rarr;</span></button> : null}
                      </div>
                    </li>
                    <li className={stepClass(2)}>
                      {num(2)}
                      <div>
                        <b>Outcome</b>
                        {savedOutcome && !steps[5].done && !changing ? <button type="button" className="jc-step-more" data-hpd-smoke="jc-change-outcome" onClick={startChange}>✏️ Change outcome or date</button> : null}
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
                        {booked.state === "requested" && !when.past ? <button type="button" className="jc-appt-confirm" data-hpd-smoke="jc-appt-confirm" onClick={() => { try { saveAppointment(selectedJob, { ...booked, state: "confirmed" }); setOutcomeMessage(`✅ ${id}: the tenant confirmed ${appointmentLabel(booked)}.`); } catch (err) { setOutcomeMessage(err instanceof Error ? err.message : "Couldn't confirm the appointment."); } }}>✅ Tenant confirmed</button> : null}
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
                      {!approved ? <button type="button" className="jc-status-change" data-hpd-smoke="fc-clear-outcome" onClick={() => clearOutcome(selectedJob)}>{armedTap === `clear:${jobId(selectedJob)}` ? "✅ Tap again: clear the outcome" : "Change outcome"}</button> : null}
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
                          <button type="button" data-hpd-smoke="jc-next-open" onClick={() => openIssueJob(routeTarget, true)}>Open next job →</button>
                        </span>
                        {(Boolean(value(selectedJob, ["PackageApprovedAt"])) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"]))) && !(autoPackage && autoPackage.id === id) && stayOn !== id
                          ? <AutoNext key={id} seconds={8} label={onRoute.id} onGo={() => openIssueJob(routeTarget, true)} onStay={() => setStayOn(id)} /> : null}
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
                        <button type="button" data-hpd-smoke="jc-next-open" onClick={() => openIssueJob(target)}>Open next job →</button>
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
                <PhotoCheck jobId={id} before={counts.before} after={counts.after} total={counts.total} work={["WORK_STARTED", "WORK_COMPLETED", "PARTIAL_WORK"].includes(value(selectedJob, ["FieldOutcome", "fieldOutcome"]))} />
                <JobNotes jobId={id} address={jobAddress(selectedJob)} />
              </div>

              {(() => {
                // What is left for this job (3 Nov idea): photos, affidavit, invoice, next one opens with one tap.
                const left = paperworkLeft({
                  id, outcome: value(selectedJob, ["FieldOutcome", "fieldOutcome"]), before: counts.before, after: counts.after,
                  approved: Boolean(value(selectedJob, ["PackageApprovedAt"])) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"])),
                  invoiceDone: Boolean(followRef.current?.sent[jobId(selectedJob)]) || Boolean(value(selectedJob, ["InvoiceSentAt", "invoiceSentAt"])),
                  paperworkHref,
                });
                if (!left || jobQueue(selectedJob) === "archived") return null;
                return (
                  <section className="jc-left" data-hpd-smoke="jc-left" aria-label="Paperwork left for this job">
                    <strong>{left.allDone ? "✅ All paperwork done for this job" : `📋 ${left.left} thing${left.left === 1 ? "" : "s"} left for this job`}</strong>
                    <ul>{left.items.map((item) => <li key={item.key} className={item.done ? "is-done" : ""}><span aria-hidden="true">{item.done ? "✓" : "○"}</span> {item.label}: {item.detail}</li>)}</ul>
                    {left.next ? <a className="jc-left-go" data-hpd-smoke="jc-left-go" href={left.next.href} onClick={left.next.key === "affidavit" ? packageLinkClick(id, left.next.href) : undefined}>Next: {left.next.label} →</a> : null}
                  </section>
                );
              })()}
              {jobQueue(selectedJob) === "completed" ? (
                <section className="jc-done" data-hpd-smoke="jc-completed" aria-label="Job completed">
                  <strong>✓ Completed. No need to come back.</strong>
                  {value(selectedJob, ["PackageApprovedAt"]) || /approved/i.test(value(selectedJob, ["PackageReviewStatus"])) ? (
                    <>
                      <span>Paperwork approved{value(selectedJob, ["PackageApprovedAt"]) ? ` ${formatSavedTime(value(selectedJob, ["PackageApprovedAt"]))}` : ""}.</span>
                      <button type="button" data-hpd-smoke="jc-archive" onClick={() => void archiveJob(selectedJob)}>{armedTap === `archive:${jobId(selectedJob)}` ? "✅ Tap again: archive" : "Everything is correct: Archive"}</button>
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
                    {/* Text the tenant: what was done, then the one button (owner, 22 Oct). */}
                    {tenant.phone && !tenant.commonArea ? (() => {
                      const step = tenantStep(selectedJob as Record<string, unknown>);
                      const t = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
                      return (
                        <div className="jc-tenant-text" data-hpd-smoke="jc-tenant-text">
                          {step.state !== "none" ? <p className={`jc-tenant-step is-${step.state}`} data-hpd-smoke="jc-tenant-step">📱 Texted {t(step.textedAt)}{step.repliedAt ? ` · replied ${t(step.repliedAt)}` : ""} · {step.why}</p> : null}
                          <div>
                            <button type="button" data-hpd-smoke="jc-text-tenant" onClick={() => openTenantText(selectedJob)}>📱 {step.textedAt ? "Text again" : "Text tenant"}</button>
                            {step.state === "waiting" ? <button type="button" data-hpd-smoke="jc-tenant-replied" onClick={() => markTenantReplied(selectedJob)}>They replied</button> : null}
                          </div>
                          {tenantText?.id === jobId(selectedJob) ? (
                            <div className="jc-tenant-draft" data-hpd-smoke="jc-tenant-draft">
                              <small>{tenantText.ai || "Read it, change anything, then open it in Messages and press Send there."}</small>
                              {/* One-tap messages (26 Oct): fill the text with the tenant's name and the address; you still read it and send it. */}
                              {(() => {
                                const raw = (tenant.name || "").split(/\s+/)[0];
                                const hi = raw && raw.length > 1 ? `Hi ${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "Hello";
                                const where = jobAddress(selectedJob).replace(/,\s*\d{5}$/, "");
                                const me = "this is Jot from United Angel Construction";
                                const quick: [string, string][] = [
                                  ["🚚 On the way", `${hi}, ${me}. We are on the way to ${where} for the HPD repair. See you soon.`],
                                  ["⏱ 15 min late", `${hi}, ${me}. We are running about 15 minutes late to ${where}. Sorry for the wait.`],
                                  ["📅 Tomorrow?", `${hi}, ${me}. Can we come to ${where} tomorrow for the HPD repair? Please reply with a good time.`],
                                  ["✅ Please confirm", `${hi}, ${me}. Please confirm our appointment at ${where}. Reply YES to confirm or tell us a better time.`],
                                  ["🚪 We're outside", `${hi}, ${me}. We are outside ${where} for the HPD repair. Please let us in.`],
                                ];
                                return <div className="jc-tenant-quick" data-hpd-smoke="jc-tenant-quick">{quick.map(([label, text]) => <button key={label} type="button" data-hpd-smoke="jc-tenant-quick-btn" onClick={() => setTenantText({ ...tenantText, text, ai: "Ready: read it, then send it." })}>{label}</button>)}</div>;
                              })()}
                              <textarea rows={6} data-hpd-smoke="jc-tenant-draft-text" value={tenantText.text} onChange={(e) => setTenantText({ ...tenantText, text: e.target.value })} />
                              <div>
                                {smsReady ? <button type="button" className={`is-send${smsSend?.id === jobId(selectedJob) && smsSend.armed ? " is-armed" : ""}`} data-hpd-smoke="jc-tenant-send-sms" disabled={smsSend?.id === jobId(selectedJob) && smsSend.status === "Sending…"} onClick={() => void sendTenantSms(selectedJob, tenantText.text)}>{smsSend?.id === jobId(selectedJob) && smsSend.armed ? "✅ Tap again: send the text" : "📤 Send it now"}</button> : null}
                                <a className={smsReady ? undefined : "is-send"} data-hpd-smoke="jc-tenant-open-sms" href={smsHref(tenant.phone, tenantText.text)} onClick={() => markTenantTexted(selectedJob, tenantText.text)}>📱 {smsReady ? "From my phone" : "Open in Messages"}</a>
                                <button type="button" onClick={() => setTenantText(null)}>Cancel</button>
                              </div>
                              {smsSend?.id === jobId(selectedJob) && smsSend.status ? <p className="jc-tenant-sms-status" role="status" data-hpd-smoke="jc-tenant-sms-status">{smsSend.status}</p> : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })() : null}
                    <strong data-hpd-smoke="jc-tenant">{tenant.name || (tenant.phone ? "Name not listed" : privateOk === false ? "Private: sign in to see" : "Not listed")}</strong>
                    {!tenant.phone && privateOk === false ? <form className="fc-signin-form" method="post" action="/api/drive/start?back=%2Fmap%2F%3Fview%3Dall%26map%3D1" data-hpd-smoke="jc-tenant-signin"><button type="submit">🔑 Sign in with Google</button></form> : null}
                    {tenant.phone ? <span>{tenant.phone} <a className={`fc-call-btn${tenantStep(selectedJob as Record<string, unknown>).state === "call" ? " is-due" : ""}`} data-hpd-smoke="jc-tenant-call" onClick={() => startTenantCall(selectedJob)} href={`tel:${tenant.phone}`}>Call</a></span> : tenant.summary.replace(tenant.name, "").replace(/^\s*·\s*/, "").trim() ? <span>{tenant.summary.replace(tenant.name, "").replace(/^\s*·\s*/, "").trim()}</span> : null}
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
                  if (!tapTwice(`revisit:${jobId(selectedJob)}`, "approve a return visit (visit records are kept)")) return;
                  const patch = {RevisitApprovedAt:new Date().toISOString()};
                  try { writeSharedWorkflowPatch(jobId(selectedJob),patch); mergeWorkflowPatchIntoScreen(jobId(selectedJob),patch); }
                  catch { setOutcomeMessage("Return approval could not be saved. Try again."); }
                }}>{armedTap === `revisit:${jobId(selectedJob)}` ? "✅ Tap again: approve return visit" : "Approve return visit"}</button>}
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
      {/* Not over the bids list (it covered the list's pull-up bar on short screens); it shows again back on the map. */}
      {newItems.length && !selectedJob && !whatsNewOpen && !bidsOpen ? (
        <div className="fc-newupdate" role="dialog" aria-label="New update" data-hpd-smoke="fc-newupdate">
          <strong>🆕 New update includes</strong>
          {/* Short (3 Nov): the first 2 changes, first sentence each, so a big update doesn't cover the map; the rest under All changes. */}
          <ul>{newItems.slice(0, 2).map((x) => { const one = x.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0]; return <li key={x}>{one.length > 90 ? `${one.slice(0, 88)}…` : one}</li>; })}</ul>
          {newItems.length > 2 ? <small className="fc-newupdate-more-n" data-hpd-smoke="fc-newupdate-more-n">…and {newItems.length - 2} more: tap All changes</small> : null}
          <div>
            <button type="button" data-hpd-smoke="fc-newupdate-ok" onClick={seenNewItems}>Got it</button>
            <button type="button" data-hpd-smoke="fc-newupdate-more" onClick={() => { seenNewItems(); setWhatsNewOpen(true); }}>All changes</button>
          </div>
        </div>
      ) : null}
      {justUpdated && !newItems.length && !selectedJob && !whatsNewOpen ? (
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
            {/* 🔁 Keep upgrading, ON or OFF, first thing on the screen (owner, 3 Nov: "I need to know that it is on"). */}
            <button type="button" className={`fc-auto-status${autoUpgrade ? " is-on" : ""}`} data-hpd-smoke="fc-auto-status" aria-pressed={autoUpgrade} onClick={() => void setAutoUpgradeOn(!autoUpgrade)}>
              <b>🔁 Keep upgrading: {autoUpgrade ? "ON ✓" : "OFF"}</b>
              <small>{autoUpgrade ? "Claude builds the next idea by itself when you have no requests open (up to 3 a day). Tap to turn off." : "Tap to turn on: Claude builds the next idea by itself when nothing else is open."}</small>
            </button>
            <p className="fc-follow-note" data-hpd-smoke="fc-whatsnew-version">This version: {versionLabel() || `v${appVersion}`}{BUILT_COMMIT ? ` (${BUILT_COMMIT})` : ""}. Every version is kept.</p>
            <section className="fc-ideas" data-hpd-smoke="fc-ideas">
              <h4>💡 Ideas from Claude</h4>
              <p className="fc-follow-note">Tap 👍 and Claude builds it. Or tell the chat “do idea 2”.</p>
              {ideas === null ? <p className="fc-follow-note">Loading ideas…</p> : !openIdeas().length ? <p className="fc-follow-note">You picked them all. Ask for more below.</p> : (
                <ol className="fc-idea-list">
                  {openIdeas().slice(0, 6).map((x) => (
                    <li key={x.id} className="fc-idea" data-hpd-smoke="fc-idea" data-id={x.id}>
                      <b>{x.icon} {x.title}{x.kind === "check" ? <small> · check-up</small> : null}</b>
                      <span>{x.why}</span>
                      <span className="fc-idea-btns">
                        <button type="button" className="fc-idea-do" data-hpd-smoke="fc-idea-do" onClick={() => void pickIdea(x)}>👍 Do it</button>
                        <button type="button" className="fc-idea-skip" data-hpd-smoke="fc-idea-skip" onClick={() => markIdea(x.id, "skip")}>Not now</button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="fc-idea-row">
                <button type="button" data-hpd-smoke="fc-ideas-more" onClick={() => void askMoreIdeas()}>💬 Ask Claude for more ideas</button>
                <button type="button" className={`fc-auto-upgrade${autoUpgrade ? " is-on" : ""}`} data-hpd-smoke="fc-auto-upgrade" aria-pressed={autoUpgrade} onClick={() => void setAutoUpgradeOn(!autoUpgrade)}>🔁 Keep upgrading on its own: {autoUpgrade ? "ON" : "off"}</button>
              </div>
              {autoUpgrade ? <p className="fc-follow-note" data-hpd-smoke="fc-auto-upgrade-note">When you have no requests open, Claude builds the next idea by itself (up to 3 a day), tests it, puts it live and tells you. Your requests always go first.</p> : null}
              {autoUpgrade ? <p className="fc-follow-note" data-hpd-smoke="fc-auto-upgrade-status" role="status">{autoInfo.lastAt ? `Last one it built: “${autoInfo.lastTitle}” (${new Date(autoInfo.lastAt).toLocaleString()}). Today: ${autoInfo.doneToday} of 3.` : "It is on and waiting. Nothing built yet. It starts when no request of yours is open."}</p> : null}
              {ideasNote ? <p className="fc-follow-note" data-hpd-smoke="fc-ideas-note" role="status">{ideasNote}</p> : null}
            </section>
            <section className="fc-ask-change" data-hpd-smoke="fc-ask-change">
              <h4>💡 Ask for a change</h4>
              <textarea rows={3} data-hpd-smoke="fc-ask-change-text" placeholder="What should be better? e.g. make the notice text bigger, add 15 days to the filter…" value={changeText} onChange={(e) => setChangeText(e.target.value)} />
              <button type="button" data-hpd-smoke="fc-ask-change-save" disabled={!changeText.trim()} onClick={() => void askForChange()}>Save my request</button>
              {changeStatus ? <p className="fc-follow-note" data-hpd-smoke="fc-ask-change-status">{changeStatus}</p> : null}
            </section>
            <section className="fc-change-threads" data-hpd-smoke="fc-change-threads">
              <h4>💬 Your requests and progress</h4>
              <p className={`fc-claude-online is-${claudeIsOn(claudeSeenAt) ? "on" : "off"}`} data-hpd-smoke="fc-claude-online"><i aria-hidden="true" />{claudeIsOn(claudeSeenAt) || claudeNowFresh(claudeNow) ? "Claude is on: checking for requests every 20 seconds. This list updates by itself." : pickupLabel(claudeSeenAt)}</p>
              {claudeNowFresh(claudeNow) && claudeNow ? <div className="fc-claude-now-box" data-hpd-smoke="fc-claude-now-box"><small>🤖 Claude right now{claudeNow.task ? ` · ${claudeNow.task}` : ""}</small><ClaudeNowLines now={claudeNow} /></div>
                : claudeNow?.state === "idle" && Date.now() - Date.parse(claudeNow.at) < 6 * 3600000 ? <p className="fc-follow-note" data-hpd-smoke="fc-claude-now-idle">✅ Claude: {claudeNow.text} <SecondsAgo at={claudeNow.at} /></p> : null}
              {changeThreads === null ? <p className="fc-follow-note">Couldn&apos;t load them right now.</p>
                : !changeThreads.length ? (myRequests.length ? <ul>{myRequests.slice(0, 5).map((r) => <li key={r.at}>{r.text}</li>)}</ul> : <p className="fc-follow-note">No requests yet.</p>)
                : changeThreads.map((t) => (
                  <article key={t.id} className={`fc-change-thread is-${t.status.toLowerCase().replace(/[^a-z]+/g, "-")}`} data-hpd-smoke="fc-change-thread">
                    <p className="fc-change-ask"><small>You · {new Date(t.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>{t.text}</p>
                    <b className="fc-change-status" data-hpd-smoke="fc-change-status">{t.status === "Done" ? "✅" : t.status === "Working on it" ? "🔧" : t.status === "Waiting for you" ? "❓" : "📥"} {t.asked ? "Your answer went to Claude" : t.status === "Waiting for you" ? "Claude needs your answer" : t.status}{t.asked ? <small className="fc-change-pickup"> · {pickupLabel(claudeSeenAt)}</small> : null}{t.status === "Received" && !t.updates.length && !t.asked ? <small className="fc-change-pickup" data-hpd-smoke="fc-change-pickup"> · {pickupLabel(claudeSeenAt)}</small> : null}</b>
                    {t.workingAt && Date.now() - Date.parse(t.workingAt) < 30 * 60000 ? <p className="fc-change-working" data-hpd-smoke="fc-change-working"><i aria-hidden="true" /> Claude is working on this right now (since {new Date(t.workingAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})</p> : null}
                    {t.steps.length ? (() => {
                      const done = t.steps.filter((x) => x.done).length;
                      const pct = Math.round((done / t.steps.length) * 100);
                      const moving = t.status !== "Done" && Boolean(t.workingAt) && Date.now() - Date.parse(t.workingAt) < 30 * 60000;
                      const nowStep = t.steps.find((x) => !x.done);
                      return (
                        <div className="fc-change-progress" data-hpd-smoke="fc-change-progress">
                          <div className={`fc-change-bar${moving ? " is-moving" : ""}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(pct, moving ? 6 : 0)}%` }} /></div>
                          <small data-hpd-smoke="fc-change-count"><b className="fc-change-pct">{pct}%</b> · {done} of {t.steps.length} steps{moving && nowStep ? <> · <span className="fc-change-now" data-hpd-smoke="fc-change-now"><span className="hpd-spin" aria-hidden="true" /> Now: {nowStep.text}</span></> : null}</small>
                          {moving ? <WorkingClock since={t.workingAt} /> : null}
                          {moving && t.now ? <p className="fc-change-now" data-hpd-smoke="fc-change-now">⚡ Now: {t.now.text} <SecondsAgo at={t.now.at} /></p> : null}
                          <ol>{t.steps.map((x) => <li key={x.text} className={x.done ? "is-done" : ""}>{x.done ? "✓" : "○"} {x.text}</li>)}</ol>
                        </div>
                      );
                    })() : null}
                    {[...t.updates.map((u) => ({ ...u, you: false })), ...t.answers.map((a) => ({ ...a, you: true }))].sort((a, b) => a.at.localeCompare(b.at)).map((u) => u.you ? (
                      <p key={`a${u.at}`} className="fc-change-ask fc-change-yours" data-hpd-smoke="fc-change-yours"><small>You · {new Date(u.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>{u.text}</p>
                    ) : (
                      <div key={u.at} className={`fc-change-update${u.at > repliesSeen ? " is-new" : ""}`} data-hpd-smoke="fc-change-update">
                        <small>Update · {new Date(u.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}{u.at > repliesSeen ? " · new" : ""}</small>
                        <p>{u.text}</p>
                      </div>
                    ))}
                    {t.status === "Waiting for you" || answerFor === t.id ? (
                      <form className="fc-change-answer" data-hpd-smoke="fc-change-answer" onSubmit={(e) => { e.preventDefault(); const v = answerText; setAnswerText(""); setAnswerFor(""); void sendChangeAnswer(t, v); }}>
                        <textarea rows={2} data-hpd-smoke="fc-change-answer-text" aria-label="Your answer to Claude" placeholder={t.status === "Waiting for you" ? "Your answer to Claude…" : "What's not right? What should change?"} value={answerFor === t.id || t.status === "Waiting for you" ? (answerFor === t.id ? answerText : "") : ""} onFocus={() => { if (answerFor !== t.id) { setAnswerFor(t.id); setAnswerText(""); } }} onChange={(e) => { setAnswerFor(t.id); setAnswerText(e.target.value); }} />
                        <button type="submit" data-hpd-smoke="fc-change-answer-send" disabled={answerFor !== t.id || !answerText.trim()}>➤ Send to Claude</button>
                      </form>
                    ) : t.status === "Done" ? (
                      <div className="fc-change-check" data-hpd-smoke="fc-change-check">
                        {t.tryAt ? <a className="fc-change-try" data-hpd-smoke="fc-change-try" href={t.tryAt}>▶ Try it</a> : null}
                        {t.ok ? <span className="fc-change-ok" data-hpd-smoke="fc-change-ok">👍 You checked it</span>
                          : <button type="button" className="fc-change-works" data-hpd-smoke="fc-change-works" onClick={() => void confirmWorks(t)}>👍 Works</button>}
                        <button type="button" className="fc-change-again" data-hpd-smoke="fc-change-again" onClick={() => { setAnswerFor(t.id); setAnswerText(""); }}>↩ Not right?</button>
                      </div>
                    ) : null}
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
        notifUnread={notifUnread}
        onNotifications={() => setNotifOpen(true)}
        focusOmo={bidsFocus}
        onFocused={() => setBidsFocus("")}
        chat={bidsChat}
        onChat={(reply, cards) => chatReplyRef.current(reply, cards)}
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
              <>
              <PaymentWaits track={payWaits} pipAsOfText={pipAsOfText} onOpen={(omo) => { const job = findAnyJob(omo); if (job) { setNoticesOpen(false); setSelectedJob(job); } }} />
              <section className="fc-follow-section is-money" data-hpd-smoke="fc-money">
                <h4>💰 To get paid: rejections until HPD pays</h4>
                <div className="fc-money-sum" data-hpd-smoke="fc-money-sum">
                  <span className="is-held"><b>{money(payTrack.summary.held)}</b>held by {payTrack.summary.withAmount}{payTrack.summary.notInPip ? ` (+${payTrack.summary.notInPip} not in PIP yet)` : ""}</span>
                  <span className="is-fix"><b>{payTrack.summary.toFix}</b>to fix</span>
                  <span><b>{payTrack.summary.inTheMail}</b>in the mail</span>
                  <span className="is-paid"><b>{money(payTrack.summary.paid)}</b>paid after a rejection (90 days)</span>
                </div>
                {(() => {
                  const toFix = payTrack.rows.filter((r) => r.next === "fixed" && findAnyJob(r.omo));
                  if (!toFix.length) return null;
                  const start = () => { try { sessionStorage.setItem("hpd-fix-queue", JSON.stringify(toFix.map((r) => ({ omo: r.omo, at: r.at })))); } catch { /* private mode */ } };
                  return <a className="fc-fix-all" data-hpd-smoke="fc-fix-all" href={`/paperwork/?job=${encodeURIComponent(toFix[0].omo)}&fix=${encodeURIComponent(toFix[0].at)}&auto=1`} onClick={start}>🔧 Fix them one by one ({toFix.length}) · {money(toFix.reduce((a, r) => a + r.held, 0))}</a>;
                })()}
                <p className="fc-follow-note">Each rejection until the money comes in: ✏️ fix → 🖨 print &amp; sign in ink → ✉ email the copy → 📮 mail the original → 💵 paid. Paid comes from PIP{pipAsOfText ? `, last brought in ${pipAsOfText}` : ""}.{pipAgeDays > 7 ? <> <b className="fc-pip-stale" data-hpd-smoke="fc-pip-stale">⚠️ PIP numbers are {pipAgeDays} days old:</b> sign in to <a href="https://a127-pip.nyc.gov/webapp/PRDPCW/SelfService" target="_blank" rel="noreferrer">PIP</a>, download the Check/EFT Summary and Agreement Summary, and they&apos;ll be brought in.</> : null}{payTrack.summary.lostCount ? ` ${payTrack.summary.lostCount} closed by HPD with $0 paid are at the bottom: dispute those with HPD.` : ""}</p>
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
              </>
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
      {(() => {
        // The one thing to look at first (overdue / under 6 h), instead of the map flashing.
        const top = [...boardUrgent].sort((a, b) => hoursLeft(a, Date.now()) - hoursLeft(b, Date.now()))[0];
        if (selectedJob || boardOpen || bidsOpen || noticesOpen || followFilter === "notices" || jobsOpen || notifOpen || critical || trackerOpen || autopilotOpen || agent) return null;
        // Nothing urgent on the board: the next thing to do (23 Oct "complete flow"), most pressing first: bids due today
        // not faxed, a tenant who replied (book a time), paperwork to make for a job finished this week.
        if (!top) {
          const recent = (iso: unknown, days: number) => { const t = Date.parse(String(iso || "")); return Number.isFinite(t) && Date.now() - t < days * 86400000; };
          const replied = jobs.find((j) => recent(value(j, ["TenantRepliedAt"]), 2) && !activeAppointment(j as Record<string, unknown>) && !FIELD_OUTCOMES[value(j, ["FieldOutcome", "fieldOutcome"])]);
          // A tenant texted a day ago with no answer and no call logged since: call them.
          const toCall = jobs.find((j) => tenantStep(j as Record<string, unknown>).state === "call" && !tenantStep(j as Record<string, unknown>).repliedAt && !activeAppointment(j as Record<string, unknown>) && !FIELD_OUTCOMES[value(j, ["FieldOutcome", "fieldOutcome"])]
            && !(Date.parse(String(value(j, ["TenantCalledAt"]) || "")) > Date.now() - 20 * 3600000));
          const finished = /WORK_COMPLETED|PARTIAL_WORK|REFUSED_ACCESS|NO_ACCESS_2|COMPLETED_BY_OTHERS/;
          const papers = jobs.find((j) => !isTestJob(jobId(j)) && finished.test(value(j, ["FieldOutcome", "fieldOutcome"])) && !value(j, ["PackageApprovedAt"]) && !followUps.get(jobId(j))?.sentAt
            && (Array.isArray(j.FieldVisitHistory) ? j.FieldVisitHistory as { recordedAt?: string }[] : []).some((v) => recent(v?.recordedAt, 7)));
          // An appointment starting within 20 minutes (or under 30 minutes in), not arrived, and you're not there yet
          // (more than a quarter mile away, or no location): offer the "running late" text first (26 Oct).
          const fix = lastFixRef.current;
          const late = jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).find(({ j, a }) => {
            if (!a || value(j, ["FieldArrivedAt"]) || !tenantInfo(j).phone) return false;
            const { startsIn } = appointmentTiming(a);
            if (startsIn > 20 || startsIn < -30) return false;
            const at = jobLatLng(j);
            return !fix || !at || distanceMiles({ lat: fix.lat, lng: fix.lng }, at) > 0.25;
          });
          // From 3 PM to 9 PM (New York): an appointment tomorrow, tenant's phone on file, no reminder sent for that date yet ->
          // text the tenant a reminder (27 Oct). Sending it is noted on the job so it isn't offered again.
          const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
          // From 7 AM: an appointment later today the tenant hasn't confirmed, no reminder sent today -> text to confirm (27 Oct).
          const unconfirmed = nyHour >= 7 ? jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).find(({ j, a }) => {
            if (!a || a.state !== "requested" || !tenantInfo(j).phone || value(j, ["ApptReminderSentFor"]) === a.date || value(j, ["FieldArrivedAt"])) return false;
            const t = appointmentTiming(a);
            return t.today && t.startsIn > 20;
          }) : undefined;
          // An appointment today that ended (up to 6 hours ago) with no result recorded -> open the job to record it (27 Oct).
          const over = jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).find(({ j, a }) => {
            if (!a || FIELD_OUTCOMES[value(j, ["FieldOutcome", "fieldOutcome"]).replace(/^APPOINTMENT_.*/, "")]) return false;
            const t = appointmentTiming(a);
            return t.today && t.endsIn < 0 && t.endsIn > -360;
          });
          const remind = nyHour >= 15 && nyHour < 21 ? jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).find(({ j, a }) => needsReminder(j, a)) : undefined;
          const lateText = late ? (() => { const raw = (tenantInfo(late.j).name || "").split(/\s+/)[0]; const hi = raw && raw.length > 1 ? `Hi ${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "Hello"; return `${hi}, this is Jot from United Angel Construction. We are running about 15 minutes late to ${jobAddress(late.j).replace(/,\s*\d{5}$/, "")}. Sorry for the wait.`; })() : "";
          const next = late ? { kind: "late", icon: "⏱", text: `Appointment ${appointmentLabel(late.a!).split(" · ")[1]} at ${jobAddress(late.j).replace(/,\s*\d{5}$/, "")}: running late? Text the tenant`, go: () => { window.location.href = smsHref(tenantInfo(late.j).phone, lateText); } }
            : bidsDue.unsentToday ? { kind: "bids", icon: "🧾", text: `${bidsDue.unsentToday} bid${bidsDue.unsentToday === 1 ? "" : "s"} due today${bidsDue.firstTime ? ` · first ${bidsDue.firstTime}` : ""}`, go: () => goTo("bids", "") }
            : over ? { kind: "over", icon: "📝", text: `Appointment at ${jobAddress(over.j).replace(/,\s*\d{5}$/, "")} is over: record what happened`, go: () => openIssueJob(over.j, true) }
            : unconfirmed ? { kind: "confirm", icon: "❔", text: `Today ${appointmentLabel(unconfirmed.a!).split(" · ")[1]} at ${jobAddress(unconfirmed.j).replace(/,\s*\d{5}$/, "")} isn't confirmed: text the tenant`, go: () => {
              markReminderSent(unconfirmed.j, unconfirmed.a!.date);
              window.location.href = smsHref(tenantInfo(unconfirmed.j).phone, reminderText(unconfirmed.j, unconfirmed.a!, "today"));
            } }
            : remind ? { kind: "remind", icon: "📅", text: `Tomorrow ${appointmentLabel(remind.a!).split(" · ")[1]} at ${jobAddress(remind.j).replace(/,\s*\d{5}$/, "")}: text the tenant a reminder`, go: () => {
              markReminderSent(remind.j, remind.a!.date);
              window.location.href = smsHref(tenantInfo(remind.j).phone, reminderText(remind.j, remind.a!));
            } }
            : replied ? { kind: "tenant", icon: "💬", text: `${jobAddress(replied).replace(/,\s*\d{5}$/, "")}: tenant replied, book a time`, go: () => openIssueJob(replied, true) }
            : toCall ? { kind: "call", icon: "📞", text: `Call the tenant at ${jobAddress(toCall).replace(/,\s*\d{5}$/, "")} (no answer to the text)`, go: () => openIssueJob(toCall, true) }
            : papers ? { kind: "paperwork", icon: "📄", text: `Paperwork: ${jobAddress(papers).replace(/,\s*\d{5}$/, "")}`, go: () => openIssueJob(papers, true) }
            : null;
          nextStepRef.current = next ? { text: next.text, go: next.go } : null;
          const nextJob = late ? late.j : bidsDue.unsentToday ? null : over ? over.j : unconfirmed ? unconfirmed.j : remind ? remind.j : replied || toCall || papers || null;
          nextOmoRef.current = nextJob ? jobId(nextJob) : "";
          if (!next) return null;
          // 🚗 How far it is from where you are (28 Oct): a GPS fix from the last 10 minutes, straight line x 1.35 for the
          // streets, 18 mph in the city (12 in rush hour).
          const here = lastFixRef.current;
          const there = nextJob ? jobLatLng(nextJob) : null;
          const driveMin = here && there && Date.now() - here.at < 600000 ? (() => {
            const wd = nyNow().weekday;
            const rush = wd >= 1 && wd <= 5 && ((nyHour >= 7 && nyHour < 10) || (nyHour >= 16 && nyHour < 19));
            return Math.max(3, Math.round(distanceMiles(here, there) * 1.35 / (rush ? 12 : 18) * 60));
          })() : 0;
          return (
            <button type="button" className={`fc-focus-chip is-next is-${next.kind}`} data-hpd-smoke="fc-next-chip" data-kind={next.kind} onClick={next.go}>
              <span aria-hidden="true">{next.icon}</span> <b>Next:</b> {next.text}{driveMin ? <small className="fc-next-drive" data-hpd-smoke="fc-next-drive"> · 🚗 {driveMin} min</small> : null} <em>→</em>
            </button>
          );
        }
        nextOmoRef.current = top.omo;
        if (ping && ping.omo === top.omo) { nextStepRef.current = null; return null; }
        const h = Math.round(hoursLeft(top, Date.now()));
        nextStepRef.current = { text: `notice ${top.omo} ${h < 0 ? `overdue ${-h} hours` : `${h} hours left`}${boardUrgent.length > 1 ? `, and ${boardUrgent.length - 1} more` : ""}`, go: () => goTo("board", top.omo) };
        return (
          <button type="button" className={`fc-focus-chip${h < 0 ? " is-late" : ""}`} data-hpd-smoke="fc-focus-chip" onClick={() => goTo("board", top.omo)}>
            <span aria-hidden="true">⏰</span> <b>{top.omo}</b> {h < 0 ? `overdue ${-h} h` : `${h} h left`}{boardUrgent.length > 1 ? <small> +{boardUrgent.length - 1} more</small> : null} <em>→</em>
          </button>
        );
      })()}
      {!agent && !selectedJob && !moreOpen && dockEdit < 0 && !bidsOpen && !routeOpen ? (() => {
        // What matters right now, once each (closing it or acting on it puts it away): bids due within the hour, HPD
        // answered a notice (last 24 h), an appointment in the next 3 hours the tenant hasn't confirmed.
        const now = Date.now();
        const today = nyToday();
        const nowMin = (() => { const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number); return h * 60 + m; })();
        const minOf = (t: string) => { const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60; };
        let recs: Record<string, { status?: string; price?: number; bidDue?: string }> = {};
        try { recs = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}"); } catch { /* private mode */ }
        const soon = bidsListRef.current.filter((b) => b.omo && b.bidDue === today && minOf(b.bidDueTime) - nowMin > 0 && minOf(b.bidDueTime) - nowMin <= 60
          && !(["sent", "confirmed"].includes(String(recs[b.omo]?.status)) && recs[b.omo]?.bidDue === b.bidDue)).sort((a, b) => minOf(a.bidDueTime) - minOf(b.bidDueTime));
        const answered = boardOpenRows.filter((r) => boardSide(r) === "replied" && r.lastTheirsAt && now - Date.parse(r.lastTheirsAt) < 86400000).sort((a, b) => Date.parse(b.lastTheirsAt || "") - Date.parse(a.lastTheirsAt || ""));
        const unconfirmed = jobs.map((j) => ({ j, a: activeAppointment(j as Record<string, unknown>) })).filter(({ j, a }) => {
          if (!a || a.state !== "requested" || a.date !== today || !tenantInfo(j).phone || value(j, ["ApptReminderSentFor"]) === a.date) return false;
          const t = appointmentTiming(a);
          return t.startsIn > 0 && t.startsIn <= 180;
        });
        type Nudge = { key: string; kind: string; text: string; label: string; go?: () => void; href?: string };
        const all: Nudge[] = [];
        if (soon.length) {
          const unpriced = soon.filter((b) => !(recs[b.omo!]?.price && recs[b.omo!]?.bidDue === b.bidDue)).length;
          const mins = minOf(soon[0].bidDueTime) - nowMin;
          all.push({ key: `bids|${today}|${soon.map((b) => b.omo).join(",")}`, kind: "bids", text: `⏰ ${soon.length} bid${soon.length === 1 ? "" : "s"} due in ${mins} min${unpriced ? `, ${unpriced} not priced` : ""}. Start?`, label: "▶ Start", go: () => agentRef.current("next bid") });
        }
        if (movingFast && !driving) all.push({ key: `drive|${today}`, kind: "drive", text: "🚗 Looks like you're driving. Talk hands-free?", label: "🚗 Turn on", go: () => setDrivingMode(true) });
        if (awaySince) {
          const lines = catchUp(awaySince);
          if (lines.length) all.push({ key: `away|${awaySince}`, kind: "away", text: `👋 While you were away: ${lines.map((l) => l.split(":")[0].replace(/ about .*/, "")).join(" · ")}`, label: "Tell me", go: () => agentRef.current("what did I miss") });
        }
        // 🗣 A new notice (last 6 hours, nothing sent yet): the helper speaks up (owner, 3 Nov: "the chat speaks up by itself").
        const fresh = boardOpenRows.filter((r) => r.kind === "ppn" && boardSide(r) === "tosend" && r.noticeAt && now - Date.parse(r.noticeAt) < 6 * 3600000).sort((a, b) => Date.parse(b.noticeAt) - Date.parse(a.noticeAt));
        for (const r of fresh.slice(0, 2)) all.push({ key: `notice|${r.key}`, kind: "notice", text: `📨 New ${r.hours}-hour notice for ${r.omo}${addressOf(r.omo) ? ` (${noZip(addressOf(r.omo))})` : ""}${r.want ? `: HPD wants ${r.want.toLowerCase()}` : ""}. Answer it now?`, label: "✍️ Answer", go: () => agentRef.current(`answer the notice for ${r.omo}`) });
        for (const r of answered.slice(0, 2)) all.push({ key: `hpd|${r.omo}|${r.lastTheirsAt}`, kind: "hpd", text: `📬 HPD answered on ${r.omo}${addressOf(r.omo) ? ` (${noZip(addressOf(r.omo))})` : ""}.`, label: "Open", go: () => goTo("board", r.omo) });
        for (const { j, a } of unconfirmed.slice(0, 2)) all.push({ key: `appt|${jobId(j)}|${a!.date}`, kind: "appt", text: `❔ Your ${appointmentLabel(a!).split(" · ")[1].replace(/–.*$/, "")} at ${noZip(jobAddress(j))} hasn't confirmed. Text them?`, label: "📱 Text", href: smsHref(tenantInfo(j).phone, reminderText(j, a!, "today")), go: () => markReminderSent(j, a!.date) });
        // 🌆 End of day (owner idea, 3 Nov): after 6 PM, once a day, a few lines on what got done and what is waiting.
        if (nowMin >= 18 * 60 && !nudgeSeen.includes(`day|${today}`)) {
          const sum = daySummary(jobs, { id: jobId, address: jobAddress });
          const bits = [
            sum.counts.visited ? `${sum.counts.visited} visited` : "",
            sum.counts.finished ? `${sum.counts.finished} finished` : "",
            sum.counts.noAccess ? `${sum.counts.noAccess} no access` : "",
            sum.counts.closeOut ? `${sum.counts.closeOut} to close out` : "",
          ].filter(Boolean);
          if (bits.length || sum.tomorrow.length) {
            all.push({ key: `day|${today}`, kind: "day", text: `🌆 Today: ${bits.length ? bits.join(", ") : "no visits"}. Tomorrow: ${sum.tomorrow.length ? `${sum.tomorrow.length} job${sum.tomorrow.length === 1 ? "" : "s"}` : "nothing booked"}.`, label: "Open", go: () => { setChromeOpen(false); setControlsOpen(false); setSummaryStatus(""); setSummaryOpen(true); } });
          }
        }
        const nudge = all.find((n) => !nudgeSeen.includes(n.key));
        if (!nudge) return null;
        const done = () => setNudgeSeen(markNudgeSeen(nudge.key));
        return (
          <div className="fc-chat-nudge" role="status" data-hpd-smoke="fc-chat-nudge" data-kind={nudge.kind} key={nudge.key}>
            <HelperFace mode="talking" size={34} className="fc-nudge-face" />
            <span data-hpd-smoke="fc-chat-nudge-text">{nudge.text}</span>
            {nudge.href ? <a href={nudge.href} data-hpd-smoke="fc-chat-nudge-go" onClick={() => { done(); nudge.go?.(); }}>{nudge.label}</a>
              : <button type="button" data-hpd-smoke="fc-chat-nudge-go" onClick={() => { done(); nudge.go?.(); }}>{nudge.label}</button>}
            <button type="button" className="fc-chat-nudge-x" aria-label="Not now" data-hpd-smoke="fc-chat-nudge-close" onClick={done}>✕</button>
          </div>
        );
      })() : null}
      {!agent && !selectedJob && !moreOpen && dockEdit < 0 ? (
        <form className="fc-chatbar" data-hpd-smoke="fc-chatbar" role="search" onSubmit={(e) => {
          e.preventDefault();
          const t = chatBarText.trim();
          if (!t) return;
          setChatBarText("");
          setChatTip("");
          (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
          unlockChime();
          setAgentTypeOpen(true);
          agentRef.current(t);
        }}>
          {/* Quick answer buttons (owner idea, 3 Nov): one tap instead of typing. */}
          {quickOpen && !chatBarText.trim() ? (
            <div className="fc-chatbar-quick" data-hpd-smoke="fc-chatbar-quick" role="group" aria-label="Quick questions">
              {QUICK_QUESTIONS.map(([label, ask]) => <button key={ask} type="button" data-hpd-smoke="fc-quick-q" data-ask={ask} onClick={() => { unlockChime(); setChatTip(""); setQuickOpen(false); setAgentTypeOpen(true); agentRef.current(ask); }}>{label}</button>)}
            </div>
          ) : null}
          <button type="button" className="fc-chatbar-bolt" aria-label="Quick questions" aria-expanded={quickOpen} data-hpd-smoke="fc-chatbar-bolt" onClick={() => setQuickOpen((v) => !v)}>⚡</button>
          {/* 💡 always here (owner, 3 Nov: "always have a more ideas button available"): Claude's ideas, one tap. */}
          <button type="button" className="fc-chatbar-ideas" aria-label="Ideas from Claude" data-hpd-smoke="fc-chatbar-ideas" onClick={() => { unlockChime(); goTo("requests", ""); setTimeout(() => document.querySelector('[data-hpd-smoke="fc-ideas"]')?.scrollIntoView({ block: "start", behavior: "smooth" }), 400); }}>💡</button>
          {chatTip ? <p className="fc-chatbar-tip" data-hpd-smoke="fc-chatbar-tip" role="status">{chatTip}<button type="button" aria-label="Close the tip" onClick={() => setChatTip("")}>✕</button></p> : null}
          <input ref={chatInputRef} value={chatBarText} onChange={(e) => setChatBarText(e.target.value)} placeholder={bidsOpen ? "Try \"next bid\" or \"bids in Queens\"" : "Ask me, or \"bids in Brooklyn\""} aria-label="Chat with your AI helper" data-hpd-smoke="fc-chatbar-input" enterKeyHint="send" autoComplete="off" />
          {canSpeak ? <button type="button" className={`fc-chatbar-voice${voiceMuted ? " is-off" : ""}`} aria-label={voiceMuted ? "Answers are silent: tap to hear them out loud" : "Answers are said out loud: tap for silent"} aria-pressed={!voiceMuted} data-hpd-smoke="fc-chatbar-voice" onClick={() => { const off = !voiceMuted; setVoiceOff(off); setVoiceMuted(off); if (off) stopSpeaking(); else { unlockChime(); speak("Voice on. I'll say my answers out loud.", 50); } }}>{voiceMuted ? "🔇" : "🔊"}</button> : null}
          {chatBarText.trim() ? <button type="submit" aria-label="Send" data-hpd-smoke="fc-chatbar-send">➤</button>
            : <button type="button" aria-label="Talk to the AI" data-hpd-smoke="fc-chatbar-mic" data-listen={canListen ? "app" : "keyboard"} onClick={() => {
              if (canListen) { setChatTip(""); startAgentChat(); return; }
              // No listening in this browser: the keyboard's 🎙 does it (focus inside the tap so the keyboard opens).
              unlockChime(); reportVoice("keyboard mic"); chatInputRef.current?.focus();
              setChatTip("🎙 On this phone you talk through the keyboard: tap the 🎙 at the bottom of the keyboard, talk, then ➤. I answer out loud.");
            }}>🎙️</button>}
        </form>
      ) : null}
      {magicOn ? <div key={magicAt} className="fc-magic" data-hpd-smoke="fc-magic" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--a": `${i * 36}deg`, "--d": `${70 + (i % 3) * 26}px` } as React.CSSProperties}>✦</i>)}</div> : null}
      {pointAt ? <i key={pointAt.key} className="fc-point-light" data-hpd-smoke="fc-point-light" aria-hidden="true" style={{ "--x0": `${pointAt.x0}px`, "--y0": `${pointAt.y0}px`, "--x1": `${pointAt.x1}px`, "--y1": `${pointAt.y1}px` } as React.CSSProperties} /> : null}
      {pointAt ? <i key={`r${pointAt.key}`} className="fc-point-ring" aria-hidden="true" style={{ left: pointAt.x1, top: pointAt.y1 }} /> : null}
      {agent ? (
        <div className={`fc-agent${driving ? " is-driving" : ""}${agentTucked ? " is-tucked" : ""}${agentFromDock ? " is-from-dock" : ""}${agentFromDock && !selectedJob && !bidsOpen && !driving ? " is-big" : ""}`} role="dialog" aria-label="Voice helper" data-hpd-smoke="fc-agent" data-tucked={agentTucked ? "1" : undefined}
          onPointerDown={() => setTuckPoke((n) => n + 1)} onKeyDown={() => setTuckPoke((n) => n + 1)}>
          {agentTucked ? <button type="button" className="fc-agent-bubble" data-hpd-smoke="fc-agent-bubble" aria-label="Open the chat" onClick={() => setAgentTucked(false)}><HelperFace mode={speakingNow ? "talking" : "idle"} size={40} /><small>{agent.reply.replace(/\s+/g, " ").slice(0, 34)}…</small></button> : null}
          {driving ? <button type="button" className="fc-agent-driving" data-hpd-smoke="fc-agent-driving" onClick={() => setDrivingMode(false)}>🚗 Driving: short answers, I keep listening · tap to stop</button> : null}
          {/* Earlier turns only over the map: over a sheet (bid, job) the panel stays small so it doesn't hide its buttons. */}
          {!selectedJob && !bidsOpen && agentHistory.length > 3 ? (
            <button type="button" className="fc-agent-earlier" data-hpd-smoke="fc-agent-earlier" aria-expanded={chatAll} onClick={() => setChatAll((v) => !v)}>{chatAll ? "▼ Only the last few" : `▲ Earlier today (${agentHistory.length - 3})`}</button>
          ) : null}
          {(selectedJob || bidsOpen ? [] : chatAll ? agentHistory : agentHistory.slice(-3)).map((h) => (
            <div key={h.at} className="fc-agent-past" data-hpd-smoke="fc-agent-past"><small>🗣 {h.heard}</small><span>{h.reply}</span></div>
          ))}
          {/* The helper's face: it listens, talks (the mouth moves while it speaks), and blinks in between. */}
          {/* Over a bid or a job the panel stays small: the face sits in the first line instead. */}
          <div className={`fc-agent-who${speakingNow ? " is-talking" : listening ? " is-listening" : ""}${selectedJob || bidsOpen ? " is-small" : ""}`} data-hpd-smoke="fc-agent-who">
            <HelperFace mode={speakingNow ? "talking" : listening ? "listening" : agent.reply === "Thinking…" || /…$/.test(agent.reply) ? "working" : "idle"} size={selectedJob || bidsOpen ? 46 : agentFromDock ? 112 : 60} outfit={robotOutfit({ wx: wxChip })} arms={magicOn ? "wave" : pointAt ? "point" : /^(✅|Sent|Done|Saved|Marked)/.test(agent.reply) ? "thumbs" : ""} hat={selectedJob && Date.now() - Date.parse(String(value(selectedJob, ["FieldArrivedAt"]) || "")) < 8 * 3600000 ? "hardhat" : undefined} />
            <b>{speakingNow ? "Talking to you…" : listening ? "Listening…" : agent.reply === "Thinking…" ? "Thinking…" : "Your helper"}</b>
          </div>
          {dressOpen ? (
            <div className="fc-agent-dress" data-hpd-smoke="fc-agent-dress-box" role="group" aria-label="Dress the helper">
              <span>{(Object.keys(HELPER_COLORS) as HelperColor[]).map((k) => <button key={k} type="button" className={`fc-dress-color${helperLook.color === k ? " is-on" : ""}`} data-hpd-smoke="fc-dress-color" data-color={k} aria-label={HELPER_COLORS[k].label} aria-pressed={helperLook.color === k} style={{ background: HELPER_COLORS[k].line }} onClick={() => setHelperLook({ color: k })} />)}</span>
              <span>{(Object.keys(HELPER_HATS) as HelperHat[]).map((k) => <button key={k} type="button" className={`fc-dress-hat${helperLook.hat === k ? " is-on" : ""}`} data-hpd-smoke="fc-dress-hat" data-hat={k} aria-pressed={helperLook.hat === k} onClick={() => setHelperLook({ hat: k })}>{HELPER_HATS[k]}</button>)}</span>
              {voiceSupported() ? (() => {
                // 🎙 Its voice: a woman's or a man's, slower or faster; each tap says a sample with the mouth moving.
                void voiceTick;
                const list = englishVoices().slice(0, 4);
                const pick = chosenVoiceName() || list[0]?.name || "";
                const rate = voiceRate();
                const who = (n: string) => (/\b(ava|zoe|samantha|allison|aria|jenny|karen|moira|tessa|victoria|susan|serena|fiona|kate|nicky|joelle|female|woman|zira|libby|sonia|emma|michelle)\b/i.test(n) ? "👩" : /\b(evan|nathan|daniel|alex|guy|tom|aaron|arthur|oliver|rishi|male|man|david|mark|ryan|eric|christopher|reed|gordon)\b/i.test(n) ? "👨" : "🗣");
                const sample = () => { unlockChime(); speak(`Hi ${(() => { try { return localStorage.getItem("hpd-owner-name") || "Jot"; } catch { return "Jot"; } })()}, this is how I sound now.`, 100); };
                return <>
                  {list.length ? <span className="fc-dress-voices">{list.map((v) => <button key={v.name} type="button" className={`fc-dress-voice${pick === v.name ? " is-on" : ""}`} data-hpd-smoke="fc-dress-voice" data-voice={v.name} aria-pressed={pick === v.name} onClick={() => { setChosenVoice(v.name); setVoiceTick((n) => n + 1); sample(); }}>{who(v.name)} {v.name.replace(/\s+-\s.*$/, "").replace(/\s*\(.*\)$/, "").replace(/^(Microsoft|Google|Apple)\s+/i, "").split(/\s+/).slice(0, 2).join(" ")}</button>)}</span> : null}
                  <span className="fc-dress-voices">{([[0.85, "🐢 Slower"], [1, "Normal"], [1.15, "🐇 Faster"]] as const).map(([r, label]) => <button key={label} type="button" className={`fc-dress-voice${rate === r ? " is-on" : ""}`} data-hpd-smoke="fc-dress-rate" data-rate={r} aria-pressed={rate === r} onClick={() => { setVoiceRate(r); setVoiceTick((n) => n + 1); sample(); }}>{label}</button>)}<button type="button" className="fc-dress-voice" data-hpd-smoke="fc-dress-sample" onClick={sample}>▶ Hear it</button></span>
                  <span className="fc-dress-voices"><button type="button" className={`fc-dress-voice${saver ? " is-on" : ""}`} data-hpd-smoke="fc-dress-saver" aria-pressed={saver} onClick={() => { const next = !saver; setSaver(next); setBatterySaver(next); }}>🔋 Battery saver: {saver ? "on (nothing moves)" : "off"}</button></span>
                </>;
              })() : null}
            </div>
          ) : null}
          {agent.heard === "👋" ? <small className="fc-agent-me" data-hpd-smoke="fc-agent-heard">✨ Your AI helper</small> : <small data-hpd-smoke="fc-agent-heard">🎤 &ldquo;{agent.heard}&rdquo;</small>}
          {/* 💡 Before you ask (27 Oct, owner: "figure it out by itself beforehand"): the most pressing thing right now. */}
          {nextStepRef.current && !agent.reply.startsWith("Next:") && !agent.confirm ? (
            <button type="button" className="fc-agent-hint" data-hpd-smoke="fc-agent-hint" onClick={() => { const step = nextStepRef.current; setAgent(null); step?.go(); }}>💡 {nextStepRef.current.text.replace(/^\w/, (c) => c.toUpperCase())} <b>▶</b></button>
          ) : null}
          {/* The answer appears word by word (owner, 3 Nov: "everything animated"; the words are all there at once for
              reading and tests, each fades in a moment after the one before). */}
          <p key={agent.reply} data-hpd-smoke="fc-agent-reply" className={`fc-agent-words${agent.live ? " is-live" : ""}`}>{agent.reply.length > 500 || agent.live ? agent.reply : agent.reply.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) || !w ? w : <span key={i} style={{ animationDelay: `${Math.min(i, 120) * 22}ms` }}>{w}</span>))}</p>
          {agent.week ? (
            <div className="fc-agent-week" data-hpd-smoke="fc-agent-week">
              {agent.week.map((w, k) => <div key={w.date} className={w.n.appt || w.n.bids || w.n.notices ? "has" : ""} style={{ animationDelay: `${k * 60}ms` }}>
                <b>{w.day === "Today" || w.day === "Tomorrow" ? w.day : w.day.slice(0, 3)}</b><small>{Number(w.date.slice(8, 10))}</small>
                {w.n.appt ? <span title="Appointments">📅 {w.n.appt}</span> : null}
                {w.n.bids ? <span title="Bids due">🧾 {w.n.bids}</span> : null}
                {w.n.notices ? <span title="Notices due">⏰ {w.n.notices}</span> : null}
              </div>)}
            </div>
          ) : null}
          {agent.chart ? (() => {
            const ch = agent.chart;
            const top = Math.max(1, ...ch.rows.flatMap((r) => [r.a, r.b]));
            return <figure className="fc-agent-chart" data-hpd-smoke="fc-agent-chart" aria-label={`${ch.title}: ${ch.rows.map((r) => `${r.label} ${r.a} ${ch.aName.toLowerCase()}, ${r.b} ${ch.bName.toLowerCase()}`).join("; ")}`}>
              <figcaption>{ch.title} <span><i className="is-a" /> {ch.aName} <i className="is-b" /> {ch.bName}</span></figcaption>
              <div>{ch.rows.map((r, k) => <div key={r.label} className="fc-agent-chart-col"><div className="fc-agent-chart-bars"><b className="is-a" style={{ height: `${Math.max(2, (r.a / top) * 100)}%`, animationDelay: `${k * 120}ms` }}><em>{r.a}</em></b><b className="is-b" style={{ height: `${Math.max(2, (r.b / top) * 100)}%`, animationDelay: `${k * 120 + 60}ms` }}><em>{r.b}</em></b></div><small>{r.label}</small></div>)}</div>
            </figure>;
          })() : null}
          {agent.choices?.length ? (
            <div className="fc-agent-try fc-agent-choices" data-hpd-smoke="fc-agent-choices">
              {agent.choices.map((c) => <button key={c} type="button" data-hpd-smoke="fc-agent-choice" onClick={() => agentRef.current(c)}>{c}</button>)}
              <button type="button" className="is-ai" data-hpd-smoke="fc-agent-ask-ai" onClick={() => { const h = agent.heard; askAnywayRef.current = h; agentRef.current(h); }}>🤖 Ask the AI instead</button>
            </div>
          ) : null}
          {agent.offers?.length && !agent.choices?.length ? (
            <div className="fc-agent-try fc-agent-offers" data-hpd-smoke="fc-agent-offers">
              <span>{agent.offersLabel || "Want me to open it?"}</span>
              {agent.offers.map((c) => <button key={c} type="button" data-hpd-smoke="fc-agent-offer" onClick={() => agentRef.current(c)}>▶ {c.replace(/^\w/, (x) => x.toUpperCase())}</button>)}
            </div>
          ) : null}
          {agent.live ? <p className="fc-agent-live" data-hpd-smoke="fc-agent-live"><i aria-hidden="true" /> Live: this answer updates by itself</p> : null}
          {agent.cards?.length ? (
            <div className="fc-chat-cards" data-hpd-smoke="fc-chat-cards">
              {agent.cards.map((c, i) => (
                <div key={`${c.kind}${c.id}`} className={`fc-chat-card is-${c.kind}`} data-hpd-smoke="fc-chat-card" data-kind={c.kind} data-id={c.id}>
                  <button type="button" className="fc-chat-card-main" onClick={() => openCard(c)}>
                    {agent.cards!.length > 1 ? <i className="fc-chat-card-n" aria-label={`number ${i + 1}`}>{i + 1}</i> : null}
                    <b>{c.kind === "bid" ? "📨 " : c.kind === "notice" ? "⏰ " : "🔧 "}{c.title}</b><small>{c.sub}</small>{c.tag ? <em>{c.tag}</em> : null}
                  </button>
                  {c.kind === "notice" ? <button type="button" className="fc-chat-card-act" data-hpd-smoke="fc-chat-card-answer" onClick={() => agentRef.current(`answer the notice for ${c.id}`)}>✍️ Answer</button>
                    : c.kind === "bid" ? <button type="button" className="fc-chat-card-act" data-hpd-smoke="fc-chat-card-price" onClick={() => openCard(c)}>💰 Price</button> : null}
                </div>
              ))}
            </div>
          ) : null}
          {/* 👉 Try next (27 Oct, "more advanced helper"): what makes sense to say next here, one tap to run it. */}
          {!agent.confirm && !helpOpen && !agent.choices?.length ? (() => {
            const heard = agent.heard.toLowerCase().replace(/[^a-z' ]/g, "").trim();
            const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
            const j = selectedJob;
            const done = j ? Boolean(value(j, ["FieldOutcome", "fieldOutcome", "WorkflowStatus"])) : false;
            const list = j
              ? (done ? ["make the paperwork", "what's left on this job"] : ["read the description", "take me there", ...(tenantInfo(j).phone ? ["text the tenant"] : []), "what's left on this job"])
              : bidsOpen ? ["next bid", "what should I bid", "what's next"]
              : (() => { const f = agent.heard === "👋" ? [] : chatFollowUps(agent.heard); return f.length ? f : [...(nextStepRef.current ? ["what's next"] : []), "what do I have today", "where's my next appointment", ...(hour >= 15 && hour <= 21 ? ["remind tomorrow's tenants"] : []), "which notices are open"]; })();
            const chips = list.filter((c) => c.toLowerCase() !== heard).slice(0, 3);
            return chips.length ? (
              <div className="fc-agent-try" data-hpd-smoke="fc-agent-try"><small>Try:</small>{chips.map((c) => <button key={c} type="button" data-hpd-smoke="fc-agent-try-chip" onClick={() => agentRef.current(c)}>{c}</button>)}</div>
            ) : null;
          })() : null}
          {/* ❓ What can I say (23 Oct): example sentences by topic; tap one to run it. */}
          {helpOpen ? (
            <div className="fc-agent-help" data-hpd-smoke="fc-agent-help">
              {AGENT_EXAMPLES.map(([topic, list]) => (
                <div key={topic}>
                  <b>{topic}</b>
                  <div>{list.map((ex) => <button key={ex} type="button" data-hpd-smoke="fc-agent-example" onClick={() => { setHelpOpen(false); agentRef.current(ex); }}>{ex}</button>)}</div>
                </div>
              ))}
            </div>
          ) : null}
          {agentTypeOpen ? <form className="fc-agent-type" data-hpd-smoke="fc-agent-type" onSubmit={(e) => { e.preventDefault(); const t = agentTyped.trim(); if (!t) return; setAgentTyped(""); agentRef.current(t); }}>
            <input autoFocus value={agentTyped} onChange={(e) => setAgentTyped(e.target.value)} placeholder="Type anything, or tell Claude what to change" aria-label="Type to the helper" data-hpd-smoke="fc-agent-type-input" enterKeyHint="send" />
            <button type="button" className={`fc-agent-type-mic${listening ? " is-on" : ""}`} aria-label={listening ? "Stop listening" : "Talk instead of typing"} aria-pressed={listening} data-hpd-smoke="fc-agent-type-mic" onClick={(e) => { if (listening) { listenRef.current?.stop(); } else if (canListen) { unlockChime(); startListening(); } else { reportVoice("keyboard mic"); (e.currentTarget.form?.querySelector("input") as HTMLInputElement | null)?.focus(); } }}>🎙️</button>
            <button type="submit" disabled={!agentTyped.trim()} data-hpd-smoke="fc-agent-type-send">Send</button>
          </form> : null}
          {agent.signIn ? <form className="fc-agent-signin" method="post" action="/api/drive/start?back=%2Fmap%2F%3Fview%3Dall%26map%3D1" data-hpd-smoke="fc-agent-signin"><button type="submit">🔑 Sign in with Google</button></form> : null}
          <div>
            {agent.actions?.map((a) => <a key={a.href} className="fc-agent-action" data-hpd-smoke="fc-agent-action" href={a.href} target={a.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={(ev) => { if (a.href === "#next") { ev.preventDefault(); setAgent(null); nextStepRef.current?.go(); return; } if (a.href === "#requests") { ev.preventDefault(); setAgent(null); setWhatsNewOpen(true); void loadWhatsNew(); void loadChangeThreads(); return; } if (a.href.startsWith("#go:")) { ev.preventDefault(); setAgent(null); const k = a.href.slice(4); if (k === "notices") { closeScreens("notices"); setNoticesOpen(true); } else goTo(k); return; } const jj = a.id ? jobs.find((x) => jobId(x) === a.id) : null; if (jj && a.via) recordTravel(jj, a.via); if (a.href.startsWith("tel:") && lastCallRef.current) noteCallStarted(lastCallRef.current); if (jj && a.remind) markReminderSent(jj, a.remind); if (a.queue) { try { sessionStorage.setItem("hpd-fix-queue", JSON.stringify(a.queue)); } catch { /* private mode */ } } }}>{a.label}</a>)}
            {agent.confirm ? <>
              <button type="button" className="is-yes" data-hpd-smoke="fc-agent-yes" onClick={() => agentRef.current("yes")}>{agent.confirm.outcome === "SMS" ? "✅ Yes, send it" : "✅ Yes, save it"}</button>
              <button type="button" data-hpd-smoke="fc-agent-no" onClick={() => agentRef.current("no")}>No</button>
            </> : null}
            {speakingNow ? <button type="button" className="fc-agent-hush" data-hpd-smoke="fc-agent-hush" aria-label="Stop talking" onClick={() => stopSpeaking()}>🔇 Stop</button> : null}
            <button type="button" className={convo ? "is-on" : ""} data-hpd-smoke="fc-agent-talk" aria-pressed={convo} onClick={() => { const on = !convo; convoRef.current = on; convoMissRef.current = 0; setConvo(on); if (on) { unlockChime(); if (!listening) startListening(); } else listenRef.current?.stop(); }}>{convo ? (listening ? "💬 Listening… (tap to stop)" : "💬 Talking (tap to stop)") : "💬 Keep talking"}</button>
            <button type="button" className={agentTypeOpen ? "is-on" : ""} aria-label="Type instead" aria-pressed={agentTypeOpen} data-hpd-smoke="fc-agent-type-btn" onClick={() => setAgentTypeOpen((o) => !o)}>⌨️</button>
            <button type="button" className={helpOpen ? "is-on" : ""} aria-label="What can I say?" data-hpd-smoke="fc-agent-help-btn" onClick={() => setHelpOpen((o) => !o)}>❓</button>
            <button type="button" aria-label="Read a photo" data-hpd-smoke="fc-agent-photo" onClick={() => photoInputRef.current?.click()}>📷</button>
            <button type="button" aria-label="Dress the helper" aria-pressed={dressOpen} data-hpd-smoke="fc-agent-dress" onClick={() => setDressOpen((o) => !o)}>🎨</button>
            <button type="button" aria-label="Your requests to Claude" data-hpd-smoke="fc-agent-requests" onClick={() => { stopSpeaking(); convoRef.current = false; setConvo(false); listenRef.current?.stop(); setAgent(null); goTo("requests", ""); }}>📋</button>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" hidden data-hpd-smoke="fc-agent-photo-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void readPhoto(f); }} />
            <button type="button" className={driving ? "is-on" : ""} aria-label="Driving mode" aria-pressed={driving} data-hpd-smoke="fc-agent-drive" onClick={() => setDrivingMode(!driving)}>🚗</button>
            <button type="button" aria-label="Move the chat to the side" data-hpd-smoke="fc-agent-tuck" onClick={(e) => { e.stopPropagation(); setAgentTucked(true); }}>⇥</button>
            <button type="button" aria-label="Close" data-hpd-smoke="fc-agent-close" onClick={() => { if (driving) setDrivingMode(false, false); stopSpeaking(); setHelpOpen(false); convoRef.current = false; setConvo(false); listenRef.current?.stop(); setAgent(null); setAgentFromDock(false); setOrbBack(Date.now()); }}>✕</button>
          </div>
        </div>
      ) : null}
      {morning && jobs.length && !selectedJob && !arrivePrompt && !critical && !agent ? (
        <div className="fc-arrive fc-morning" role="dialog" aria-label="Start my day" data-hpd-smoke="fc-morning">
          <b>☀️ Good morning</b>
          <span>One tap: I&apos;ll read your day (notices, bids, jobs) and plan your route.</span>
          <div>
            <button type="button" className="is-yes" data-hpd-smoke="fc-morning-go" onClick={() => { doneMorning(); unlockChime(); agentRef.current("what do I have today and plan my day"); }}>☀️ Start my day</button>
            <button type="button" data-hpd-smoke="fc-morning-no" onClick={doneMorning}>Not today</button>
          </div>
        </div>
      ) : null}
      {evening && !morning && jobs.length && !selectedJob && !arrivePrompt && !critical && !agent ? (
        <div className="fc-arrive fc-evening" role="dialog" aria-label="Wrap up the day" data-hpd-smoke="fc-evening">
          <b>🌆 Wrap up the day</b>
          <span>One tap: how today went, tomorrow&apos;s weather and parking, and the bids coming up.</span>
          <div>
            <button type="button" className="is-yes" data-hpd-smoke="fc-evening-go" onClick={() => { doneEvening(); unlockChime(); agentRef.current("how did I do today and what's the weather tomorrow and is alternate side on tomorrow and read me the new bids"); }}>🌆 How did today go?</button>
            <button type="button" data-hpd-smoke="fc-evening-no" onClick={doneEvening}>Not now</button>
          </div>
        </div>
      ) : null}
      {callAsk ? (() => {
        const j = jobs.find((x) => jobId(x) === callAsk);
        if (!j) return null;
        const raw = (tenantInfo(j).name || "").split(/\s+/)[0];
        const first = raw && raw.length > 1 ? `${raw[0].toUpperCase()}${raw.slice(1).toLowerCase()}` : "the tenant";
        const log = (what: string) => { setCallAsk(""); agentRef.current(`I called the tenant for ${callAsk}, ${what}`); };
        return (
          <div className="fc-arrive fc-call-ask" role="dialog" aria-label="How did the call go?" data-hpd-smoke="fc-call-ask">
            <b>📞 How did the call to {first} go?</b>
            <span>{jobAddress(j).replace(/,\s*\d{5}$/, "")} · {callAsk}</span>
            <div>
              <button type="button" data-hpd-smoke="fc-call-noanswer" onClick={() => log("no answer")}>No answer</button>
              <button type="button" data-hpd-smoke="fc-call-voicemail" onClick={() => log("left a voicemail")}>Voicemail</button>
              <button type="button" className="is-yes" data-hpd-smoke="fc-call-talked" onClick={() => log("talked")}>Talked</button>
            </div>
            <button type="button" className="fc-call-skip" data-hpd-smoke="fc-call-skip" onClick={() => setCallAsk("")}>Skip</button>
          </div>
        );
      })() : null}
      {arrivePrompt && !selectedJob ? (
        <div className="fc-arrive" role="dialog" aria-label="Have you arrived?" data-hpd-smoke="fc-arrive">
          <b>📍 You&apos;re at {arrivePrompt.address}</b>
          <span>{arrivePrompt.id} · {arrivePrompt.feet} ft away. Have you arrived?</span>
          <div>
            <button type="button" className="is-yes" data-hpd-smoke="fc-arrive-yes" onClick={() => { const job = jobs.find((j) => jobId(j) === arrivePrompt.id); setArrivePrompt(null); if (job) { openIssueJob(job); markArrived(job); offerOutside(job); } }}>✅ Yes, start the job</button>
            <button type="button" data-hpd-smoke="fc-arrive-no" onClick={() => setArrivePrompt(null)}>Not yet</button>
          </div>
        </div>
      ) : null}
      {missed.length && !voiceOff() ? (
        <div className="fc-missed" role="status" data-hpd-smoke="fc-missed">
          <button type="button" className="fc-missed-play" data-hpd-smoke="fc-missed-play" onClick={playMissed}>🔊 Play {missed.length} new alert{missed.length === 1 ? "" : "s"}</button>
          <button type="button" className="fc-missed-x" aria-label="Not now" data-hpd-smoke="fc-missed-dismiss" onClick={clearMissed}>✕</button>
        </div>
      ) : null}
      {allowAlerts ? (
        <div className="fc-allow-alerts" role="dialog" aria-label="Allow alerts" data-hpd-smoke="fc-allow-alerts">
          <b>🔔 Get alerts on this phone</b>
          <span>{allowAlerts === "ask" ? "Wins (cha-ching), notices, Gafur / Lewis requests, rejections, new bids — even with the app closed. One tap, then it's automatic." : allowAlerts}</span>
          {allowAlerts === "ask" || allowAlerts.startsWith("Alerts") || allowAlerts.startsWith("Couldn") ? <button type="button" data-hpd-smoke="fc-allow-alerts-yes" onClick={() => void import("../../lib/push").then(async ({ turnOnPush }) => { const r = await turnOnPush(); setAllowAlerts(r.ok ? "" : r.message); if (r.ok) notify({ kind: "fax-ok", title: "🔔 Phone alerts are on", text: "Automatic from now on." }); })}>Allow alerts</button> : null}
          <button type="button" className="is-later" onClick={() => { try { localStorage.setItem("hpd-allow-alerts-later", String(Date.now())); } catch { /* private mode */ } setAllowAlerts(""); }}>Later</button>
        </div>
      ) : null}
      {/* The list stays open behind a job card (closing the card brings it back, same tab). */}
      {jobsOpen && !selectedJob ? <JobsList rows={jobRows} initialTab={jobsTab} onTab={setJobsTab} mini={jobsMini} onMini={setJobsMini} onShown={(key, ids) => setJobsShown((prev) => (prev && prev.key === key && prev.ids.join() === ids.join() ? prev : { key, ids }))} onClose={() => { setJobsOpen(false); setJobsShown(null); setJobsMini(false); }} onOpen={(id) => { const job = jobs.find((j) => jobId(j) === id); if (job) openIssueJob(job); }} /> : null}
      {critical ? (
        <div className="fc-critical" role="alertdialog" aria-label="Urgent" data-hpd-smoke="fc-critical" data-kind={critical.kind}>
          <div className="fc-critical-box">
            <span className="fc-critical-icon" aria-hidden="true">{critical.kind === "fax-bad" ? "❌" : "⏰"}</span>
            <b>{critical.title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "")}</b>
            {critical.text ? <p>{critical.text}</p> : null}
            <button type="button" className="is-go" data-hpd-smoke="fc-critical-go" onClick={() => { const c = critical; setCritical(null); goTo(c.go, c.omo || ""); }}>{critical.kind === "fax-bad" ? "Open the bid" : "Answer now"}</button>
            {critical.kind === "urgent" && critical.omo ? (
              <button type="button" className={armedTap === `handled:${critical.omo}` ? "is-armed" : ""} data-hpd-smoke="fc-critical-handled" onClick={() => {
                const c = critical;
                if (armedTap !== `handled:${c.omo}`) { setArmedTap(`handled:${c.omo}`); return; }
                setArmedTap("");
                const at = new Date().toISOString();
                for (const r of boardRows.filter((x) => x.omo === c.omo && x.next && !x.steps.sent.done)) markBoard(r.key, "sent", true);
                void fetch(`${HPD_STATUS_WORKER_URL.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `HANDLED-${c.omo}`, patch: { at, how: "owner tapped I handled it" } }) }).catch(() => {});
                setCritical(null);
              }}>{armedTap === `handled:${critical.omo}` ? "✅ Tap again: it's handled (stops the reminders)" : "✓ I handled it"}</button>
            ) : null}
            {critical.kind === "fax-bad" ? <button type="button" data-hpd-smoke="fc-critical-ok" onClick={() => setCritical(null)}>OK</button> : null}
            {critical.kind === "fax-bad" ? null : <button type="button" data-hpd-smoke="fc-critical-snooze" onClick={() => { try { localStorage.setItem(snoozeKey(critical), String(Date.now() + 30 * 60000)); } catch { /* private mode */ } setCritical(null); }}>Snooze 30 min</button>}
            <small>Stays here until you choose.</small>
          </div>
        </div>
      ) : null}
      {autopilotOpen ? <AutopilotPanel smsReady={smsReady} aiReady={aiReady} workerUrl={HPD_STATUS_WORKER_URL} onClose={() => setAutopilotOpen(false)} /> : null}
      {trackerOpen ? <JobTracker rows={trackerRows} onClose={() => setTrackerOpen(false)} onOpen={(id) => { const j = jobs.find((x) => jobId(x) === id); setTrackerOpen(false); if (j) openIssueJob(j, true); }} onText={(id) => { const j = jobs.find((x) => jobId(x) === id); setTrackerOpen(false); if (j) { openIssueJob(j, true); window.setTimeout(() => openTenantText(j), 300); } }} /> : null}
      {notifOpen ? <NotificationsPanel onClose={() => setNotifOpen(false)} onGo={(n) => { setNotifOpen(false); goTo(n.go, n.omo || ""); }} /> : null}
      {ping ? (
        <div className={`fc-hpd-ping is-${ping.kind}`} role="status" data-hpd-smoke="fc-hpd-ping" data-kind={ping.kind} style={{ borderColor: ALERT_KINDS[ping.kind]?.color }}>
          {/* Big and clear, like the "fax not sent" box (owner, 23 Oct): what kind, what happened, and one Open button. */}
          <button type="button" className="fc-hpd-ping-main" onClick={() => { setPing(null); goTo(ping.go, ping.omo || ""); }}>
            <span aria-hidden="true">{ALERT_KINDS[ping.kind]?.icon || "🔔"}</span>
            <i className="fc-hpd-ping-kind" style={{ color: ALERT_KINDS[ping.kind]?.color }}>{ALERT_KINDS[ping.kind]?.name || "Alert"}</i>
            <b>{ping.title}</b>
            {ping.text ? <small>{ping.text.slice(0, 160)}</small> : null}
            <em className="fc-hpd-ping-open" data-hpd-smoke="fc-hpd-ping-open">Open ›</em>
          </button>
          <button type="button" aria-label={chimeOff ? "Turn the sound on" : "Turn the sound off"} data-hpd-smoke="fc-chime-toggle" onClick={() => { const off = !chimeOff; setChimeOff(off); setChimeMuted(off); if (!off) playChime(ping.kind); }}>{chimeOff ? "🔕" : "🔔"}</button>
          <button type="button" aria-label="Close" data-hpd-smoke="fc-hpd-ping-ok" onClick={() => setPing(null)}>OK</button>
        </div>
      ) : null}
      {boardOpen ? (
        <NoticeBoard
          locked={threads === null}
          focusOmo={boardFocus}
          autoReplyOmo={boardAutoReply}
          rows={boardRows}
          initialShow={boardShow}
          onScan={() => void runScan()}
          scanStatus={scanStatus}
          scanChanged={scan && threads ? (() => { const before = new Map(buildBoard({ threads, sent: (followRef.current?.sent || {}) as Record<string, { sentAt?: string }>, marks: boardMarks, closed: closedJobs }).map((r) => [r.key, r.next])); return boardRows.filter((r) => before.has(r.key) && before.get(r.key) !== r.next).map((r) => ({ omo: r.omo, now: r.next === "confirmed" ? "📤 Sent, waiting on them" : r.next === null ? "✅ Confirmed" : `next: ${r.next}` })); })() : []}
          findingsOf={(row) => noticeFindings({ omo: row.omo, job: findAnyJob(row.omo) as Record<string, unknown> | null, sent: followRef.current?.sent?.[row.omo] as { sentAt?: string; count?: number } | undefined, hpd: followRef.current?.hpd?.[row.omo] as { closedReason?: string; amount?: number } | undefined, pip: pipMap[row.omo], rejection: rejections.find((r) => r.omo === row.omo) || null, ourFilesAt: (row.steps.sent.how === "email" ? row.steps.sent.at : "") || pdfsByOmo.get(row.omo) || "" })}
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
              <b><CountUp value={stats.earned} format={(n) => USD0.format(Math.round(n))} /></b>
              <span>earned · {stats.counts.completed + stats.counts.partial} job{stats.counts.completed + stats.counts.partial === 1 ? "" : "s"} finished {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stats.earnedWork)} + {stats.counts.serviceCalls} service call{stats.counts.serviceCalls === 1 ? "" : "s"} {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stats.earnedService)}</span>
            </div>
            <div className="fc-summary-counts" data-hpd-smoke="fc-stats-counts">
              {([["Visited", stats.counts.visited], ["Completed", stats.counts.completed], ["Partial", stats.counts.partial], ["No access", stats.counts.noAccess], ["Refused", stats.counts.refused], ["Emailed", stats.counts.emailed]] as const).map(([label, n]) => (
                <span key={label} className={n ? "has" : ""}><b><CountUp value={n} /></b>{label}</span>
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
                <span className={statsOpenWork.toVisit ? "has" : ""}><b><CountUp value={statsOpenWork.toVisit} /></b>Not visited</span>
                <span className={statsOpenWork.secondDue ? "has" : ""}><b><CountUp value={statsOpenWork.secondDue} /></b>2nd try due</span>
                <span className={statsOpenWork.closeOut ? "has" : ""}><b><CountUp value={statsOpenWork.closeOut} /></b>To close out</span>
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
