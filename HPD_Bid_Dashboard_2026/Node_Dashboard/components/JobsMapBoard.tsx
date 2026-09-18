"use client";

import dynamic from "next/dynamic";
import type { ChangeEvent, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { JobRecord } from "../lib/types";
import {
  AFFIDAVIT_VERSION_LABEL,
  affidavitSetForAwardDate,
  affidavitTemplateForStatus,
  affidavitTypeForStatus,
} from "../lib/affidavits";
import { isMainMapStatus } from "../lib/workflow";
import { compareJobsBySearch, matchesJobSearch } from "../lib/search";

type Props = {
  jobs: JobRecord[];
};

type StatusView = "All" | "Open" | "Awarded" | "Pending" | "No Access" | "Refused" | "Completed";
type TableMode = "live" | "queue" | "documents";
type ActivePanel = "" | "filters" | "status" | "days" | "notifications" | "account" | "map" | "system" | "contact" | "jobs" | "add" | "sync";
type ChartPeriod = "Last 12 Months" | "2026 YTD" | "Last 90 Days";
type DateRangeView = "30d" | "60d" | "all" | "custom";
type ManualFeedType = "csv" | "json";
type SyncJobsOptions = {
  automatic?: boolean;
  openPanel?: boolean;
};
type MediaFile = {
  url: string;
  name?: string;
  type?: string;
};

type FieldFlowEvent = {
  label: string;
  status: string;
  createdAt: string;
};

type GeneratedDocuments = {
  job_card_path?: string;
  invoice_path?: string;
  affidavit_path?: string;
  affidavit_type?: string;
  affidavit_template_version?: string;
  saved_folder?: string;
  saved_at?: string;
  affidavit_preview_paths?: string[];
  affidavit_preview_urls?: string[];
  affidavit_preview_error?: string;
  file_urls?: Record<string, string>;
};

type GeneratedDocumentKey = "job_card_path" | "invoice_path" | "affidavit_path";

type SyncState = {
  status: "checking" | "current" | "syncing" | "failed";
  configured: boolean;
  count: number;
  lastSyncAt: string;
  sourceUpdatedAt: string;
  source: string;
  message: string;
  today: string;
  dataThroughDate: string;
  inferredDataThroughDate: string;
  fetchThroughDate: string;
  newestAwardDate: string;
  newestJobDate: string;
  daysBehind: number | null;
  jobsAfterToday: number;
  fetcherState: string;
  fetcherOk: boolean;
  fetcherFinishedAt: string;
  fetcherError: string;
};

const STATUS_OVERRIDE_STORAGE_KEY = "hpd-job-status-overrides-v1";
const FIELD_FLOW_STORAGE_KEY = "hpd-job-field-flow-events-v1";
const MANUAL_FEED_URL_STORAGE_KEY = "hpd-live-feed-url-v1";
const MANUAL_FEED_TYPE_STORAGE_KEY = "hpd-live-feed-type-v1";
const NEW_AWARD_IDS_STORAGE_KEY = "hpd-new-award-ids-v1";
const CHART_PERIODS: ChartPeriod[] = ["Last 12 Months", "2026 YTD", "Last 90 Days"];
const DATE_RANGE_OPTIONS: Array<{ value: DateRangeView; label: string; title: string }> = [
  { value: "30d", label: "30D", title: "Last 30 days" },
  { value: "60d", label: "60D", title: "Last 60 days" },
  { value: "all", label: "All", title: "All 2026 jobs" },
];
const DAY_PRESETS = [7, 14, 30, 60, 90, 180];
const DEFAULT_CUSTOM_DAYS = 90;
const NYC_BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const STATUS_FILTERS: StatusView[] = ["All", "Open", "Awarded", "Pending", "No Access", "Refused", "Completed"];
const FIELD_STATUS_ACTIONS = [
  { label: "Arrived", value: "Arrived On Site", phase: "visit" },
  { label: "Started", value: "Work Started", phase: "visit" },
  { label: "Progress", value: "Work In Progress", phase: "outcome" },
  { label: "Complete", value: "Work Completed", phase: "outcome" },
  { label: "No Access", value: "No Access - 1st Attempt", phase: "outcome" },
  { label: "Refused", value: "Refused Access", phase: "outcome" },
  { label: "By Other", value: "Work Completed by Other", phase: "outcome" },
  { label: "Materials", value: "Needs Materials", phase: "outcome" },
  { label: "Follow Up", value: "Follow Up Required", phase: "outcome" },
] as const;
const VISIT_STATUS_ACTIONS = FIELD_STATUS_ACTIONS.filter((action) => action.phase === "visit");
const OUTCOME_STATUS_ACTIONS = FIELD_STATUS_ACTIONS.filter((action) => action.phase === "outcome");
type FieldStatusAction = (typeof FIELD_STATUS_ACTIONS)[number];
const BOROUGH_CENTERS: Record<string, [number, number]> = {
  Manhattan: [40.7831, -73.9712],
  Brooklyn: [40.6782, -73.9442],
  Queens: [40.7282, -73.7949],
  Bronx: [40.8448, -73.8648],
  "Staten Island": [40.5795, -74.1502],
};

const JobsMap = dynamic(
  () => import("./JobsMap").then((mod) => mod.JobsMap),
  {
    ssr: false,
    loading: () => <div className="map-skeleton">Loading live job map...</div>,
  },
);

const NAV_ITEMS = [
  ["Overview", "grid"],
  ["Live Bids", "doc"],
  ["ITB / COA", "stack"],
  ["Field Map", "pin"],
  ["Automation", "gear"],
  ["Documents", "file"],
  ["Reports", "report"],
  ["System Status", "gear"],
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatCurrency(amountValue: number, fallback: string) {
  if (!amountValue) return fallback || "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountValue);
}

function realFieldValue(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(not listed|not available|date unavailable|n\/a|na|none|null|unknown|tenant name|john doe)$/i.test(text)) return "";
  return text;
}

function sourceStatusForJob(job: JobRecord) {
  const rawStatus = realFieldValue(job.raw?.Status || job.raw?.status || job.raw?.["Job Status"] || job.raw?.state || "");
  const normalized = rawStatus.toLowerCase().replace(/[\s-]+/g, "_");
  if (["matched", "ok", "recovered_itb"].includes(normalized)) return job.awardDate ? "Awarded" : "Open";
  return rawStatus || (job.awardDate ? "Awarded" : "Open");
}

function imageUrlsFromMedia(files: MediaFile[]) {
  return files
    .filter((file) => {
      const type = String(file.type || "").toLowerCase();
      const source = `${file.name || ""} ${file.url || ""}`;
      return type.startsWith("image/") || type === "image" || /\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(source);
    })
    .map((file) => file.url)
    .filter(Boolean);
}

function generatedFileUrl(filePath = "") {
  return filePath ? `/api/jobs/file?path=${encodeURIComponent(filePath)}` : "";
}

function generatedDocumentUrl(docs: GeneratedDocuments | null, key: GeneratedDocumentKey) {
  const filePath = docs?.[key];
  return docs?.file_urls?.[key] || (filePath ? generatedFileUrl(filePath) : "");
}

function generatedDocumentName(docs: GeneratedDocuments | null, key: GeneratedDocumentKey) {
  const filePath = docs?.[key];
  return filePath ? filePath.split(/[\\/]/).pop() || undefined : undefined;
}

function affidavitPreviewUrls(docs: GeneratedDocuments | null) {
  if (!docs) return [];
  if (docs.affidavit_preview_urls?.length) return docs.affidavit_preview_urls;
  return (docs.affidavit_preview_paths || []).map(generatedFileUrl);
}

function usableDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const isoDateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashDateOnly = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const date = isoDateOnly
    ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
    : slashDateOnly
      ? new Date(
        Number(slashDateOnly[3]) < 100 ? 2000 + Number(slashDateOnly[3]) : Number(slashDateOnly[3]),
        Number(slashDateOnly[1]) - 1,
        Number(slashDateOnly[2]),
      )
      : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year < 2000 || year > 2030) return null;
  return date;
}

function formatShortDate(value: string) {
  const date = usableDate(value);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatStampTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSyncTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not fetched";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function coverageLabel(value: string) {
  const formatted = formatShortDate(value);
  return formatted === "Date unavailable" ? "unknown" : formatted;
}

function freshnessLabel(daysBehind: number | null) {
  if (daysBehind === null) return "Coverage unknown";
  if (daysBehind <= 0) return "Up to today";
  return `${daysBehind} day${daysBehind === 1 ? "" : "s"} behind`;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function activityStamp(job: JobRecord) {
  return formatShortDate(job.awardDate);
}

function formatJobStartDate(job: JobRecord) {
  return formatShortDate(job.startDate || job.awardDate);
}

function formatJobCompletionDate(job: JobRecord) {
  return formatShortDate(job.completionDate);
}

function jobRangeDates(job: JobRecord) {
  return [job.awardDate, job.startDate, job.completionDate]
    .map(usableDate)
    .filter((date): date is Date => Boolean(date));
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function currentRangeAnchor() {
  return startOfLocalDay(new Date());
}

function dateRangeMatches(job: JobRecord, range: DateRangeView, anchorDate = new Date(), customDays = DEFAULT_CUSTOM_DAYS) {
  const dates = jobRangeDates(job);
  if (!dates.length) return false;

  if (range === "all") {
    return true;
  }

  const today = startOfLocalDay(anchorDate);
  const days = range === "custom" ? customDays : range === "60d" ? 60 : 30;
  const start = new Date(today);
  start.setDate(today.getDate() - (Math.max(1, days) - 1));
  return dates.some((date) => {
    const jobDay = startOfLocalDay(date);
    return jobDay >= start && jobDay <= today;
  });
}

function dateRangeLabel(range: DateRangeView, customDays = DEFAULT_CUSTOM_DAYS) {
  if (range === "custom") return `${customDays}D`;
  return DATE_RANGE_OPTIONS.find((option) => option.value === range)?.label || "All";
}

function displayStatus(job: JobRecord) {
  if (!job.status || isMainMapStatus(job.status)) return "Open";
  return job.status;
}

function isActiveMapJob(job: JobRecord) {
  return job.hasMap && !job.archived;
}

function jobTitle(job: JobRecord) {
  const text = `${job.trade || ""} ${job.description || ""}`.toLowerCase();
  if (text.includes("plumb")) return "Plumbing Repairs";
  if (text.includes("paint")) return "Interior Painting";
  if (text.includes("elect")) return "Electrical Repairs";
  if (text.includes("carp")) return "Carpentry Repairs";
  if (text.includes("floor")) return "Flooring Repairs";
  if (text.includes("clean")) return "Cleaning Repairs";
  if (text.includes("door")) return "Door Repairs";
  if (text.includes("secure") || text.includes("post")) return "Security Repairs";
  return "Stairwell Repairs";
}

function statusMatches(job: JobRecord, status: StatusView) {
  const rawStatus = String(job.status || "").trim().toLowerCase();
  const normalized = displayStatus(job).toLowerCase();
  if (status === "All") return true;
  if (status === "Open") {
    return (
      normalized === "open" ||
      rawStatus.includes("arrived") ||
      rawStatus.includes("started") ||
      rawStatus.includes("work in progress") ||
      rawStatus.includes("needs materials") ||
      rawStatus.includes("follow up") ||
      rawStatus.includes("partial")
    );
  }
  if (status === "No Access") return normalized.includes("no access") || rawStatus.includes("no access");
  if (status === "Refused") return normalized.includes("refused") || rawStatus.includes("refused");
  if (status === "Completed") return normalized.includes("completed") || rawStatus.includes("completed");
  return normalized.includes(status.toLowerCase()) || rawStatus.includes(status.toLowerCase());
}

function boroughCode(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("brooklyn")) return "BK";
  if (normalized.includes("manhattan")) return "MN";
  if (normalized.includes("queens")) return "QN";
  if (normalized.includes("bronx")) return "BX";
  if (normalized.includes("staten")) return "SI";
  return name.slice(0, 2).toUpperCase();
}

function boroughClassName(name: string) {
  const code = boroughCode(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `mobile-borough-${code}`;
}

function shortBoroughLabel(name: string) {
  if (name === "Staten Island") return "Staten Is.";
  return name;
}

function boroughDotClass(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("manhattan")) return "dot-manhattan";
  if (normalized.includes("brooklyn")) return "dot-brooklyn";
  if (normalized.includes("queens")) return "dot-queens";
  if (normalized.includes("bronx")) return "dot-bronx";
  if (normalized.includes("staten")) return "dot-staten";
  return "dot-default";
}

function canonicalBorough(name: string) {
  const normalized = name.toLowerCase();
  return NYC_BOROUGHS.find((boroughName) => boroughName.toLowerCase() === normalized) || name;
}

function jobDetailHref(job: JobRecord, statusText = "") {
  const currentStatus = realFieldValue(statusText || displayStatus(job));
  const statusQuery = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : "";
  return `/jobs/${encodeURIComponent(job.id)}${statusQuery}`;
}

function mapsHref(job: JobRecord) {
  const query = job.latitude && job.longitude ? `${job.latitude},${job.longitude}` : job.address || job.location;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function phoneHref(job: JobRecord) {
  const cleaned = String(job.tenantPhone || "").replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function coordsForJob(job: JobRecord): [number, number] | null {
  const latitude = Number(job.latitude);
  const longitude = Number(job.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

function distanceMilesBetween(a: [number, number], b: [number, number]) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function formatDistanceMiles(value: number | null) {
  if (value === null) return "";
  if (value < 0.1) return "here";
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function isFieldRouteCandidate(job: JobRecord) {
  const normalized = displayStatus(job).toLowerCase();
  return Boolean(
    coordsForJob(job) &&
    !job.archived &&
    !normalized.includes("completed") &&
    !normalized.includes("refused"),
  );
}

function buildFieldRoute(origin: [number, number] | null, jobs: JobRecord[], limit = 8) {
  const route: JobRecord[] = [];
  const remaining = jobs.filter(isFieldRouteCandidate);
  let current = origin;

  while (remaining.length && route.length < limit) {
    let nextIndex = 0;

    if (current) {
      let bestMiles = Number.POSITIVE_INFINITY;
      remaining.forEach((job, index) => {
        const coords = coordsForJob(job);
        if (!coords) return;
        const miles = distanceMilesBetween(current as [number, number], coords);
        if (miles < bestMiles) {
          bestMiles = miles;
          nextIndex = index;
        }
      });
    } else {
      nextIndex = remaining.reduce((bestIndex, job, index) => {
        const currentDate = dateKeyForValue(job.awardDate);
        const bestDate = dateKeyForValue(remaining[bestIndex].awardDate);
        return currentDate.localeCompare(bestDate) > 0 ? index : bestIndex;
      }, 0);
    }

    const [nextJob] = remaining.splice(nextIndex, 1);
    if (!nextJob) break;
    route.push(nextJob);
    current = coordsForJob(nextJob) || current;
  }

  return route;
}

function googleRouteHref(origin: [number, number] | null, stops: JobRecord[]) {
  if (!origin) return "";
  const stopCoords = stops
    .map(coordsForJob)
    .filter((coords): coords is [number, number] => Boolean(coords))
    .slice(0, 8);
  if (!stopCoords.length) return "";

  const destination = stopCoords[stopCoords.length - 1];
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin[0]},${origin[1]}`,
    destination: `${destination[0]},${destination[1]}`,
    travelmode: "driving",
  });
  const waypoints = stopCoords
    .slice(0, -1)
    .map((coords) => `${coords[0]},${coords[1]}`)
    .join("|");
  if (waypoints) params.set("waypoints", waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateKey() {
  return dateKeyFromDate(new Date());
}

function dateKeyForValue(value: string) {
  const date = usableDate(value);
  return date ? dateKeyFromDate(date) : "";
}

function syncCoversToday(state: Pick<SyncState, "today" | "fetchThroughDate" | "daysBehind" | "fetcherOk">) {
  const today = state.today || todayDateKey();
  return Boolean(state.fetcherOk && (state.fetchThroughDate === today || state.daysBehind === 0));
}

function csvValue(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function jobsToCsv(records: JobRecord[]) {
  const headers = ["OMO", "Address", "Borough", "Status", "COA Award", "Start Date", "Completion Date", "Trade"];
  const rows = records.map((job) => [
    job.id,
    job.address || "",
    job.borough || "",
    displayStatus(job),
    formatCurrency(job.amountValue, job.bidAmount),
    formatJobStartDate(job),
    formatJobCompletionDate(job),
    job.trade || "",
  ]);

  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}

function readLocalFlowMap() {
  try {
    const stored = window.localStorage.getItem(FIELD_FLOW_STORAGE_KEY);
    return stored ? JSON.parse(stored) as Record<string, Record<string, FieldFlowEvent>> : {};
  } catch {
    return {};
  }
}

function writeLocalFlowMap(events: Record<string, Record<string, FieldFlowEvent>>) {
  try {
    window.localStorage.setItem(FIELD_FLOW_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // The UI still updates even when browser storage is unavailable.
  }
}

function actionForStatus(status: string) {
  return FIELD_STATUS_ACTIONS.find((action) => action.value.toLowerCase() === String(status || "").toLowerCase());
}

function latestStampedAction(
  actions: readonly FieldStatusAction[],
  events: Record<string, FieldFlowEvent>,
): { action: FieldStatusAction; event: FieldFlowEvent } | null {
  let latest: { action: FieldStatusAction; event: FieldFlowEvent } | null = null;
  actions.forEach((action) => {
    const event = events[action.value];
    if (!event) return;
    if (!latest || new Date(event.createdAt).getTime() > new Date(latest.event.createdAt).getTime()) {
      latest = { action, event };
    }
  });
  return latest;
}

function isNextFlowAction(action: FieldStatusAction, events: Record<string, FieldFlowEvent>) {
  if (!events["Arrived On Site"]) return action.value === "Arrived On Site";
  if (!events["Work Started"]) return action.value === "Work Started";
  if (!latestStampedAction(OUTCOME_STATUS_ACTIONS, events)) return action.phase === "outcome";
  return false;
}

function flowSummaryText(events: Record<string, FieldFlowEvent>) {
  const arrived = events["Arrived On Site"];
  const started = events["Work Started"];
  const outcome = latestStampedAction(OUTCOME_STATUS_ACTIONS, events);
  if (!arrived) return "Next: Arrived";
  if (!started) return `Arrived ${formatStampTime(arrived.createdAt)}. Next: Started`;
  if (!outcome) return `Started ${formatStampTime(started.createdAt)}. Choose outcome`;
  return `${outcome.action.label} ${formatStampTime(outcome.event.createdAt)}`;
}

function flowProgressItems(events: Record<string, FieldFlowEvent>) {
  const outcome = latestStampedAction(OUTCOME_STATUS_ACTIONS, events);
  return [
    { key: "arrived", label: "Arrived", event: events["Arrived On Site"], next: isNextFlowAction(FIELD_STATUS_ACTIONS[0], events) },
    { key: "started", label: "Started", event: events["Work Started"], next: isNextFlowAction(FIELD_STATUS_ACTIONS[1], events) },
    { key: "outcome", label: outcome?.action.label || "Outcome", event: outcome?.event, next: !outcome && Boolean(events["Work Started"]) },
  ];
}

function trendPoints(total: number) {
  const base = Math.max(12, Math.round(total / 8));
  return [base, base + 44, base + 45, base + 96, base + 136, base + 70, base + 43, base + 66, base + 94, base + 137, base + 74];
}

function sparklinePath(values: number[]) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return values
    .map((value, index) => {
      const x = 20 + index * 34;
      const y = 175 - ((value - min) / Math.max(1, max - min)) * 140;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function JobsMapBoard({ jobs }: Props) {
  const [sourceJobs, setSourceJobs] = useState<JobRecord[]>(jobs);
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("");
  const [statusView, setStatusView] = useState<StatusView>("All");
  const [dateRange, setDateRange] = useState<DateRangeView>("all");
  const [customDays, setCustomDays] = useState(DEFAULT_CUSTOM_DAYS);
  const [selectedId, setSelectedId] = useState("");
  const [jobSheetExpanded, setJobSheetExpanded] = useState(false);
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
  const mapToolsTouchY = useRef<number | null>(null);
  const [activeNav, setActiveNav] = useState("Overview");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("Last 12 Months");
  const [tableMode, setTableMode] = useState<TableMode>("live");
  const [activePanel, setActivePanel] = useState<ActivePanel>("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [closingOutId, setClosingOutId] = useState("");
  const [archivingPackageId, setArchivingPackageId] = useState("");
  const [generatedDocsByJob, setGeneratedDocsByJob] = useState<Record<string, GeneratedDocuments>>({});
  const [statusMediaPrompt, setStatusMediaPrompt] = useState<{ jobId: string; label: string } | null>(null);
  const [photoUrlsByJob, setPhotoUrlsByJob] = useState<Record<string, string[]>>({});
  const [jobStatusOverrides, setJobStatusOverrides] = useState<Record<string, string>>({});
  const [fieldFlowEventsByJob, setFieldFlowEventsByJob] = useState<Record<string, Record<string, FieldFlowEvent>>>({});
  const [newAwardIds, setNewAwardIds] = useState<string[]>([]);
  const [routeMode, setRouteMode] = useState(false);
  const [routeSkippedIds, setRouteSkippedIds] = useState<string[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>({
    status: "checking",
    configured: false,
    count: jobs.length,
    lastSyncAt: "",
    sourceUpdatedAt: "",
    source: "Bundled JSON",
    message: "Checking data source...",
    today: "",
    dataThroughDate: "",
    inferredDataThroughDate: "",
    fetchThroughDate: "",
    newestAwardDate: "",
    newestJobDate: "",
    daysBehind: null,
    jobsAfterToday: 0,
    fetcherState: "",
    fetcherOk: false,
    fetcherFinishedAt: "",
    fetcherError: "",
  });
  const [manualFeedUrl, setManualFeedUrl] = useState("");
  const [manualFeedType, setManualFeedType] = useState<ManualFeedType>("csv");
  const [mapFitNonce, setMapFitNonce] = useState(0);
  const [mapOverview, setMapOverview] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "locating" | "found" | "blocked">("idle");
  const [phonePreviewMode, setPhonePreviewMode] = useState(false);
  const autoLocationRequested = useRef(false);
  const autoSyncRequested = useRef(false);
  const mobileBoroughRowRef = useRef<HTMLDivElement>(null);
  const jobSheetTouchStartY = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPhonePreviewMode(params.get("look") === "iphone-size" || params.get("phone") === "1");
  }, []);

  const effectiveJobs = useMemo(
    () => sourceJobs.map((job) => {
      const override = realFieldValue(jobStatusOverrides[job.id] || "");
      if (!override) return job;
      return {
        ...job,
        status: override,
        statusOverride: override,
        workflowStatus: override,
      };
    }),
    [jobStatusOverrides, sourceJobs],
  );
  const mappableJobs = useMemo(() => effectiveJobs.filter(isActiveMapJob), [effectiveJobs]);
  const dateRangeAnchor = useMemo(() => currentRangeAnchor(), [sourceJobs]);
  const dateScopedJobs = useMemo(
    () => mappableJobs.filter((job) => dateRangeMatches(job, dateRange, dateRangeAnchor, customDays)),
    [customDays, dateRange, dateRangeAnchor, mappableJobs],
  );
  const boroughs = useMemo(() => {
    const dataBoroughs = unique(dateScopedJobs.map((job) => job.borough));
    return [
      ...NYC_BOROUGHS,
      ...dataBoroughs.filter((name) => !NYC_BOROUGHS.some((boroughName) => boroughName.toLowerCase() === name.toLowerCase())),
    ];
  }, [dateScopedJobs]);
  const totalAwardValue = useMemo(
    () => effectiveJobs.reduce((sum, job) => sum + (Number.isFinite(job.amountValue) ? job.amountValue : 0), 0),
    [effectiveJobs],
  );
  const coaCount = effectiveJobs.filter((job) => job.coaFile).length;
  const itbCount = effectiveJobs.filter((job) => job.itbFile).length;

  const filtered = dateScopedJobs
    .filter((job) => {
      if (borough && job.borough !== borough) return false;
      if (!statusMatches(job, statusView)) return false;
      return matchesJobSearch(job, query);
    })
    .sort(compareJobsBySearch(query));

  const selected = selectedId ? filtered.find((job) => job.id === selectedId) || null : null;
  const queuedRows = filtered.filter((job) => !job.coaFile || !job.itbFile || displayStatus(job).toLowerCase().includes("pending"));
  const documentRows = filtered.filter((job) => job.coaFile || job.itbFile);
  const tableSource = tableMode === "queue" ? queuedRows : tableMode === "documents" ? documentRows : filtered;
  const tableRows = tableSource.slice(0, 7);
  const activityRows = filtered.slice(0, 6);
  const savedJobs = effectiveJobs.filter((job) => savedIds.includes(job.id));
  const selectedIndex = selected ? filtered.findIndex((job) => job.id === selected.id) : -1;
  const selectedMapsHref = selected ? mapsHref(selected) : "";
  const selectedPhoneHref = selected ? phoneHref(selected) : "";
  const selectedDetailHref = selected ? jobDetailHref(selected) : "#";
  const isSelectedSaved = Boolean(selected && savedIds.includes(selected.id));
  const selectedPhotoUrls = selected ? photoUrlsByJob[selected.id] || [] : [];
  const selectedPhotoUrl = selectedPhotoUrls[0] || "";
  const selectedStatus = selected ? displayStatus(selected) : "";
  const selectedAffidavitSet = affidavitSetForAwardDate(selected?.awardDate || "");
  const selectedAffidavitTemplate = affidavitTemplateForStatus(selectedStatus, selected?.awardDate || "");
  const selectedGeneratedDocs = selected ? generatedDocsByJob[selected.id] || null : null;
  const selectedFlowEvents = selected ? fieldFlowEventsByJob[selected.id] || {} : {};
  const selectedOutcome = latestStampedAction(OUTCOME_STATUS_ACTIONS, selectedFlowEvents);
  const selectedNextSiteAction = !selectedFlowEvents["Arrived On Site"]
    ? VISIT_STATUS_ACTIONS[0] || null
    : !selectedFlowEvents["Work Started"]
      ? VISIT_STATUS_ACTIONS[1] || null
      : null;
  const selectedPrimaryFlowLabel = selectedNextSiteAction
    ? selectedNextSiteAction.value === "Arrived On Site" ? "Arrive" : "Start"
    : !selectedOutcome ? "Pick Outcome" : selectedGeneratedDocs ? "Save" : "Generate";
  const selectedPrimaryFlowStage = selectedNextSiteAction
    ? selectedNextSiteAction.value === "Arrived On Site" ? "On Site" : "Work Order"
    : !selectedOutcome ? "Close Out" : selectedGeneratedDocs ? "Package Ready" : "Paperwork";
  const selectedPrimaryFlowHint = selectedNextSiteAction
    ? selectedNextSiteAction.value === "Arrived On Site" ? "Confirm arrival before work starts" : "Mark the work as started"
    : !selectedOutcome ? "Choose what happened first"
      : selectedGeneratedDocs ? "Preview checked, then archive"
        : "Generate invoice and affidavit";
  const selectedPrimaryFlowBusy = Boolean(selected && (closingOutId === selected.id || archivingPackageId === selected.id));
  const selectedAddress = selected ? realFieldValue(selected.address) : "";
  const selectedBorough = selected ? realFieldValue(selected.borough) : "";
  const selectedTrade = selected ? realFieldValue(selected.trade) : "";
  const selectedStartDate = selected ? realFieldValue(formatJobStartDate(selected)) : "";
  const selectedCompletionDate = selected ? realFieldValue(formatJobCompletionDate(selected)) : "";
  const selectedAmount = selected ? realFieldValue(formatCurrency(selected.amountValue, selected.bidAmount)) : "";
  const selectedTenantName = selected ? realFieldValue(selected.tenantName) : "";
  const selectedLocation = selected ? realFieldValue(selected.location) : "";
  const newAwardIdSet = useMemo(() => new Set(newAwardIds), [newAwardIds]);
  const latestAwardDateKey = useMemo(() => {
    const awardKeys = effectiveJobs
      .map((job) => dateKeyForValue(job.awardDate))
      .filter(Boolean)
      .sort();
    return awardKeys[awardKeys.length - 1] || "";
  }, [effectiveJobs]);
  const latestAwardIdSet = useMemo(
    () => new Set(effectiveJobs
      .filter((job) => latestAwardDateKey && dateKeyForValue(job.awardDate) === latestAwardDateKey)
      .map((job) => job.id)),
    [effectiveJobs, latestAwardDateKey],
  );
  const latestAwardIds = useMemo(() => Array.from(latestAwardIdSet), [latestAwardIdSet]);
  const todayFieldJobs = useMemo(() => {
    const ranked = filtered
      .filter((job) => coordsForJob(job))
      .map((job) => {
        const coords = coordsForJob(job);
        const distanceMiles = userLocation && coords ? distanceMilesBetween(userLocation, coords) : null;
        return {
          job,
          distanceMiles,
          newAward: newAwardIdSet.has(job.id),
          latestAward: latestAwardIdSet.has(job.id),
        };
      });

    return ranked
      .sort((a, b) => {
        if (userLocation) return (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY);
        if (a.newAward !== b.newAward) return a.newAward ? -1 : 1;
        return dateKeyForValue(b.job.awardDate).localeCompare(dateKeyForValue(a.job.awardDate));
      })
      .slice(0, 5);
  }, [filtered, latestAwardIdSet, newAwardIdSet, userLocation]);
  const todayNewCount = newAwardIds.filter((id) => effectiveJobs.some((job) => job.id === id)).length;
  const todayLatestCount = latestAwardIdSet.size;
  const nearestDistanceText = todayFieldJobs[0]?.distanceMiles !== null && todayFieldJobs[0]?.distanceMiles !== undefined
    ? formatDistanceMiles(todayFieldJobs[0].distanceMiles)
    : locationState === "blocked"
      ? "location off"
      : "locating";
  const todayModeTitle = userLocation ? "Closest Jobs" : "Today Field Mode";
  const routeSkippedIdSet = useMemo(() => new Set(routeSkippedIds), [routeSkippedIds]);
  const routeStops = useMemo(
    () => buildFieldRoute(userLocation, filtered.filter((job) => !routeSkippedIdSet.has(job.id)), 8),
    [filtered, routeSkippedIdSet, userLocation],
  );
  const activeRouteStopIndex = routeStops.length ? Math.min(activeRouteIndex, routeStops.length - 1) : 0;
  const activeRouteJob = routeStops[activeRouteStopIndex] || null;
  const routeStopItems = useMemo(() => {
    let previous = userLocation;
    return routeStops.map((job) => {
      const coords = coordsForJob(job);
      const legMiles = previous && coords ? distanceMilesBetween(previous, coords) : null;
      previous = coords || previous;
      return { job, legMiles };
    });
  }, [routeStops, userLocation]);
  const routeTotalMiles = userLocation && routeStopItems.length
    ? routeStopItems.reduce((sum, item) => sum + (item.legMiles || 0), 0)
    : null;
  const routeMapsHref = googleRouteHref(userLocation, routeStops);
  const routeTotalText = routeTotalMiles !== null
    ? formatDistanceMiles(routeTotalMiles)
    : locationState === "blocked"
      ? "location off"
      : "locating";
  const mapRouteJobs = routeMode ? routeStops : [];
  const activeRouteStopId = routeMode ? activeRouteJob?.id || "" : "";
  const selectedDetailItems = [
    selectedStartDate ? { label: "Start Date", value: selectedStartDate, icon: "calendar-icon" } : null,
    selectedCompletionDate ? { label: "Completion", value: selectedCompletionDate, icon: "calendar-icon" } : null,
    selectedAmount ? { label: "COA Amount", value: selectedAmount, icon: "money-mini-icon" } : null,
    selectedTenantName ? { label: "Tenant", value: selectedTenantName, icon: "tenant-icon" } : null,
    selectedLocation ? { label: "Location", value: selectedLocation, icon: "tenant-icon" } : null,
  ].filter((item): item is { label: string; value: string; icon: string } => Boolean(item)).slice(0, 3);
  const exportDataHref = `data:text/csv;charset=utf-8,${encodeURIComponent(jobsToCsv(filtered))}`;
  const exportFileName = `hpd-bids-${new Date().toISOString().slice(0, 10)}.csv`;
  const mapFocusKey = `${borough || "All"}|${statusView}|${dateRange}|${customDays}|${query}|${mapFitNonce}|${userLocation ? userLocation.join(",") : ""}`;
  const boroughFocusCenter = borough ? BOROUGH_CENTERS[canonicalBorough(borough)] || null : null;
  const mapFocusCenter = mapOverview ? null : userLocation || boroughFocusCenter;
  const mapFocusZoom = !mapOverview && userLocation ? 15 : undefined;
  const mobileBoroughBase = dateScopedJobs
    .filter((job) => statusMatches(job, statusView))
    .filter((job) => matchesJobSearch(job, query));
  const mobileBoroughStats = [
    { key: "", label: "All", count: mobileBoroughBase.length },
    ...NYC_BOROUGHS.map((name) => ({
      key: name,
      label: shortBoroughLabel(name),
      count: mobileBoroughBase.filter((job) => job.borough === name).length,
    })),
  ];
  const mobileStatusBase = dateScopedJobs
    .filter((job) => !borough || job.borough === borough)
    .filter((job) => matchesJobSearch(job, query));
  const mobileStatusStats = STATUS_FILTERS.map((status) => ({
    status,
    count: status === "All" ? mobileStatusBase.length : mobileStatusBase.filter((job) => statusMatches(job, status)).length,
  }));
  const activeMobileStatus = mobileStatusStats.find((item) => item.status === statusView) || mobileStatusStats[0];
  const dateRangeBase = mappableJobs
    .filter((job) => !borough || job.borough === borough)
    .filter((job) => statusMatches(job, statusView))
    .filter((job) => matchesJobSearch(job, query));
  const customDateCount = dateRangeBase.filter((job) => dateRangeMatches(job, "custom", dateRangeAnchor, customDays)).length;
  const allDateCount = dateRangeBase.filter((job) => dateRangeMatches(job, "all", dateRangeAnchor, customDays)).length;
  const activeDateRangeCount = dateRangeBase.filter((job) => dateRangeMatches(job, dateRange, dateRangeAnchor, customDays)).length;
  const dayPresetStats = DAY_PRESETS.map((days) => ({
    days,
    count: dateRangeBase.filter((job) => dateRangeMatches(job, "custom", dateRangeAnchor, days)).length,
  }));
  const hasManualFeed = manualFeedUrl.trim().length > 0;
  const coverageDate = syncState.fetchThroughDate || syncState.dataThroughDate || syncState.newestAwardDate;
  const dataThroughText = coverageLabel(coverageDate);
  const latestAwardText = coverageLabel(syncState.newestAwardDate);
  const dataFreshnessText = freshnessLabel(syncState.daysBehind);
  const dataNeedsRefresh = typeof syncState.daysBehind === "number" && syncState.daysBehind > 0;
  const fetcherNeedsAuth = /invalid_grant|expired|revoked|auth/i.test(syncState.fetcherError);
  const fetcherIsCurrent = Boolean(syncState.fetcherOk && syncState.fetchThroughDate && !dataNeedsRefresh);
  const todayModeMeta = syncState.status === "syncing"
    ? "fetching"
    : fetcherIsCurrent
      ? "current"
      : dataNeedsRefresh
        ? dataFreshnessText
        : "checking";
  const todayHighlightLabel = todayNewCount ? "New" : "Latest";
  const lastFetchAttemptText = syncState.fetcherFinishedAt ? formatSyncTime(syncState.fetcherFinishedAt) : "not attempted";
  const sourceUpdatedText = formatSyncTime(syncState.sourceUpdatedAt || syncState.lastSyncAt);
  const all2026MappableCount = mappableJobs.filter((job) => dateRangeMatches(job, "all", dateRangeAnchor, customDays)).length;
  const unmappedJobs = effectiveJobs.filter((job) => !isActiveMapJob(job));
  const healthFeedMode = fetcherIsCurrent
    ? "Fetched through today"
    : syncState.configured
    ? "Live feed connected"
    : hasManualFeed
      ? `${manualFeedType.toUpperCase()} URL ready`
      : fetcherNeedsAuth
        ? "Google auth needed"
        : "Bundled data only";
  const dataHealthStats = [
    { label: "2026 Jobs", value: all2026MappableCount },
    { label: "Visible", value: filtered.length },
    { label: "Mapped", value: mappableJobs.length },
    { label: "Unmapped", value: unmappedJobs.length },
    { label: dateRangeLabel(dateRange, customDays), value: dateScopedJobs.length },
    { label: "Loaded", value: effectiveJobs.length },
  ];
  const dataStatusStats = STATUS_FILTERS.filter((status) => status !== "All").map((status) => ({
    status,
    count: mobileStatusBase.filter((job) => statusMatches(job, status)).length,
  }));
  const dataHealthDetails = [
    { label: "Source", value: syncState.source || "Bundled JSON" },
    { label: "Data Through", value: dataThroughText },
    { label: "Latest Award", value: latestAwardText },
    { label: "Today Gap", value: dataFreshnessText },
    { label: "Last Attempt", value: lastFetchAttemptText },
    { label: "Source Updated", value: sourceUpdatedText },
    { label: "Feed", value: healthFeedMode },
    { label: "Status", value: syncState.message || "Data source checked." },
  ];
  const healthDateStats = [
    { label: `${customDays} days`, count: customDateCount, onClick: () => applyDaysFilter(false) },
    { label: "30 days", count: dayPresetStats.find((item) => item.days === 30)?.count || 0, onClick: () => applyDaysFilter(false, 30) },
    { label: "60 days", count: dayPresetStats.find((item) => item.days === 60)?.count || 0, onClick: () => applyDaysFilter(false, 60) },
    { label: "All 2026", count: allDateCount, onClick: () => applyDaysFilter(true) },
  ];
  const unmappedPreview = unmappedJobs.slice(0, 4).map((job) => job.id).filter(Boolean).join(", ");
  const mobileVisibleLabel = query.trim()
    ? "Matches"
    : statusView !== "All"
      ? `${statusView} Jobs`
      : borough
        ? `${shortBoroughLabel(borough)} Jobs`
        : `${dateRangeLabel(dateRange, customDays)} Jobs`;
  const syncTitle = hasManualFeed && !syncState.configured
    ? "Manual Feed Ready"
    : fetcherNeedsAuth
      ? "Google Auth Needed"
    : fetcherIsCurrent
      ? "Fetched Through Today"
    : !syncState.configured
    ? "Bundled Data Only"
    : syncState.status === "failed"
      ? "Fetch failed"
      : dataNeedsRefresh
        ? "Refresh Needed"
        : "Live Feed Connected";
  const syncMessage = hasManualFeed && !syncState.configured
    ? "Tap Fetch Now to pull this pasted CSV or JSON feed into the map."
    : fetcherNeedsAuth
      ? "Saved Gmail token is expired or revoked. Reconnect Google, then fetch jobs through today."
    : fetcherIsCurrent
      ? `Gmail fetch is current through today. Latest award found: ${latestAwardText}.`
    : !syncState.configured
    ? "Using bundled 2026 jobs. Connect Gmail fetcher or a live feed to pull new awards."
    : syncState.message;
  const coverageMetaText = coverageDate
    ? `Data through ${dataThroughText} · ${dataFreshnessText}`
    : "Data coverage unknown";
  const syncMetaText = hasManualFeed && !syncState.configured
    ? `${manualFeedType.toUpperCase()} URL saved on this device`
    : syncState.configured
    ? `${syncState.count} jobs · ${coverageMetaText}`
    : `${mappableJobs.length} mapped jobs · ${coverageMetaText}`;
  const mapDataBadgeTitle = syncState.status === "syncing"
    ? "Fetching"
    : fetcherNeedsAuth
      ? "Google Auth Needed"
      : fetcherIsCurrent
        ? "Fetched Through Today"
      : dataNeedsRefresh
        ? "Refresh Needed"
    : syncState.configured
      ? "Live Feed Connected"
      : hasManualFeed
        ? "Manual Feed Ready"
        : "Bundled Data Only";
  const mapDataBadgeMeta = syncState.configured
    ? `Through ${dataThroughText}`
    : hasManualFeed
      ? `${manualFeedType.toUpperCase()} feed saved`
      : fetcherIsCurrent
        ? `Through ${dataThroughText}`
      : syncState.dataThroughDate
        ? `Through ${dataThroughText}`
        : "No live feed connected";
  const mapDataBadgeCounts = dataNeedsRefresh
    ? `${filtered.length} visible · ${dataFreshnessText}`
    : `${mappableJobs.length} mapped · ${filtered.length} visible`;
  const alertCount = Math.min(activityRows.length, 9);
  const boroughCounts = boroughs
    .map((name) => ({
      name,
      code: boroughCode(name),
      count: dateScopedJobs.filter((job) => job.borough === name).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const chartTotal = chartPeriod === "2026 YTD"
    ? effectiveJobs.filter((job) => job.awardDate.includes("2026")).length
    : chartPeriod === "Last 90 Days"
      ? Math.max(1, Math.round(effectiveJobs.length / 4))
      : effectiveJobs.length;
  const trend = trendPoints(chartTotal);
  const trendPath = sparklinePath(trend);

  useEffect(() => {
    setSourceJobs(jobs);
    setSyncState((current) => ({
      ...current,
      count: jobs.length,
    }));
  }, [jobs]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STATUS_OVERRIDE_STORAGE_KEY);
      if (!stored) {
        setFieldFlowEventsByJob(readLocalFlowMap());
        return;
      }

      const parsed = JSON.parse(stored) as Record<string, string>;
      const cleaned = Object.fromEntries(
        Object.entries(parsed)
          .map(([id, status]) => [id, realFieldValue(status)] as const)
          .filter(([id, status]) => Boolean(id && status)),
      );
      setJobStatusOverrides(cleaned);
      setFieldFlowEventsByJob(readLocalFlowMap());
    } catch {
      setJobStatusOverrides({});
      setFieldFlowEventsByJob({});
    }
  }, []);

  useEffect(() => {
    try {
      const savedUrl = window.localStorage.getItem(MANUAL_FEED_URL_STORAGE_KEY) || "";
      const savedType = window.localStorage.getItem(MANUAL_FEED_TYPE_STORAGE_KEY);
      setManualFeedUrl(savedUrl);
      setManualFeedType(savedType === "json" ? "json" : "csv");
    } catch {
      setManualFeedUrl("");
      setManualFeedType("csv");
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NEW_AWARD_IDS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      setNewAwardIds(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
    } catch {
      setNewAwardIds([]);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/jobs/sync")
      .then(async (response) => {
        const data = await response.json() as Partial<SyncState> & { ok?: boolean; error?: string; jobs?: JobRecord[] };
        if (!active) return;
        const savedFeedUrl = window.localStorage.getItem(MANUAL_FEED_URL_STORAGE_KEY) || "";
        const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
        setSyncState({
          status: data.ok ? "current" : "failed",
          configured: Boolean(data.configured),
          count: Number(data.count || sourceJobs.length || jobs.length),
          lastSyncAt: String(data.lastSyncAt || ""),
          sourceUpdatedAt: String(data.sourceUpdatedAt || data.lastSyncAt || ""),
          source: String(data.source || "Bundled CSV"),
          message: String(data.message || data.error || "Data source checked."),
          today: String(data.today || ""),
          dataThroughDate: String(data.dataThroughDate || ""),
          inferredDataThroughDate: String(data.inferredDataThroughDate || ""),
          fetchThroughDate: String(data.fetchThroughDate || ""),
          newestAwardDate: String(data.newestAwardDate || ""),
          newestJobDate: String(data.newestJobDate || ""),
          daysBehind: numberOrNull(data.daysBehind),
          jobsAfterToday: Number(data.jobsAfterToday || 0),
          fetcherState: String(data.fetcherState || ""),
          fetcherOk: Boolean(data.fetcherOk),
          fetcherFinishedAt: String(data.fetcherFinishedAt || ""),
          fetcherError: String(data.fetcherError || ""),
        });
        if (nextJobs.length) {
          setSourceJobs(nextJobs);
        }
        if (
          data.ok &&
          !savedFeedUrl.trim() &&
          !autoSyncRequested.current &&
          !/invalid_grant|expired|revoked|auth/i.test(String(data.fetcherError || "")) &&
          !syncCoversToday({
            today: String(data.today || ""),
            fetchThroughDate: String(data.fetchThroughDate || ""),
            daysBehind: numberOrNull(data.daysBehind),
            fetcherOk: Boolean(data.fetcherOk),
          })
        ) {
          autoSyncRequested.current = true;
          void syncJobsNow({ automatic: true, openPanel: false });
        }
      })
      .catch(() => {
        if (!active) return;
        setSyncState({
          status: "failed",
          configured: false,
          count: sourceJobs.length,
          lastSyncAt: "",
          sourceUpdatedAt: "",
          source: "Bundled CSV",
          message: "Unable to check data source right now.",
          today: "",
          dataThroughDate: "",
          inferredDataThroughDate: "",
          fetchThroughDate: "",
          newestAwardDate: "",
          newestJobDate: "",
          daysBehind: null,
          jobsAfterToday: 0,
          fetcherState: "",
          fetcherOk: false,
          fetcherFinishedAt: "",
          fetcherError: "",
        });
      });

    return () => {
      active = false;
    };
  }, [jobs.length]);

  useEffect(() => {
    let active = true;

    fetch("/api/jobs/status")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { ok?: boolean; statuses?: Record<string, string> };
        if (!active || !data.ok || !data.statuses) return;
        const cleaned = Object.fromEntries(
          Object.entries(data.statuses)
            .map(([id, status]) => [id, realFieldValue(status)] as const)
            .filter(([id, status]) => Boolean(id && status)),
        );
        if (!Object.keys(cleaned).length) return;
        setJobStatusOverrides((current) => ({ ...current, ...cleaned }));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".desktop-search input, .mobile-search input")?.focus();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (autoLocationRequested.current) return;
    autoLocationRequested.current = true;

    const timer = window.setTimeout(() => locateUser(), 600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const activeKey = borough || "__all__";
    const row = mobileBoroughRowRef.current;
    const activeChip = Array.from(row?.querySelectorAll<HTMLButtonElement>("[data-borough-chip]") || [])
      .find((button) => button.dataset.boroughChip === activeKey);

    activeChip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [borough]);

  useEffect(() => {
    if (!selected || photoUrlsByJob[selected.id]) return;

    let active = true;
    async function loadMedia() {
      if (!selected) return;

      try {
        const response = await fetch(`/api/jobs/media?jobId=${encodeURIComponent(selected.id)}`);
        if (!response.ok) throw new Error("Media package unavailable");
        const data = await response.json() as { ok?: boolean; files?: MediaFile[] };
        if (!active || !data.ok) return;
        setPhotoUrlsByJob((current) => (
          current[selected.id]
            ? current
            : { ...current, [selected.id]: imageUrlsFromMedia(data.files || []) }
        ));
      } catch {
        try {
          const response = await fetch(`/api/jobs/images?id=${encodeURIComponent(selected.id)}`);
          if (!response.ok) throw new Error("Images unavailable");
          const data = await response.json() as { ok?: boolean; files?: MediaFile[] };
          if (!active || !data.ok) return;
          setPhotoUrlsByJob((current) => (
            current[selected.id]
              ? current
              : { ...current, [selected.id]: imageUrlsFromMedia(data.files || []) }
          ));
        } catch {
          if (!active) return;
          setPhotoUrlsByJob((current) => ({ ...current, [selected.id]: [] }));
        }
      }
    }

    void loadMedia();

    return () => {
      active = false;
    };
  }, [photoUrlsByJob, selected]);

  useEffect(() => {
    if (!selectedId) return;
    if (filtered.some((job) => job.id === selectedId)) return;

    setSelectedId("");
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!routeMode) return;

    if (!routeStops.length) {
      if (activeRouteIndex !== 0) setActiveRouteIndex(0);
      if (selectedId) setSelectedId("");
      return;
    }

    if (activeRouteStopIndex !== activeRouteIndex) {
      setActiveRouteIndex(activeRouteStopIndex);
      return;
    }

    if (activeRouteJob && selectedId !== activeRouteJob.id) {
      setSelectedId(activeRouteJob.id);
    }
  }, [activeRouteIndex, activeRouteJob, activeRouteStopIndex, routeMode, routeStops.length, selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId("");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedId]);

  useEffect(() => {
    setStatusMediaPrompt(null);
  }, [selected?.id]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function rememberNewAwardIds(ids: string[]) {
    const cleaned = Array.from(new Set(ids.filter(Boolean))).slice(0, 40);
    setNewAwardIds(cleaned);
    try {
      if (cleaned.length) {
        window.localStorage.setItem(NEW_AWARD_IDS_STORAGE_KEY, JSON.stringify(cleaned));
      } else {
        window.localStorage.removeItem(NEW_AWARD_IDS_STORAGE_KEY);
      }
    } catch {
      // The badge is still useful for the current session.
    }
  }

  function resetFilters() {
    setQuery("");
    setBorough("");
    setStatusView("All");
    setDateRange("all");
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setUserLocation(null);
    setLocationState("idle");
    notify("Filters reset.");
  }

  function updateManualFeedUrl(value: string) {
    setManualFeedUrl(value);
    try {
      if (value.trim()) {
        window.localStorage.setItem(MANUAL_FEED_URL_STORAGE_KEY, value.trim());
      } else {
        window.localStorage.removeItem(MANUAL_FEED_URL_STORAGE_KEY);
      }
    } catch {
      // The fetch still works for the current tap if local storage is unavailable.
    }
  }

  function updateManualFeedType(value: ManualFeedType) {
    setManualFeedType(value);
    try {
      window.localStorage.setItem(MANUAL_FEED_TYPE_STORAGE_KEY, value);
    } catch {
      // Non-blocking; the selected type is still held in state.
    }
  }

  function clearManualFeedUrl() {
    setManualFeedUrl("");
    try {
      window.localStorage.removeItem(MANUAL_FEED_URL_STORAGE_KEY);
    } catch {
      // Clearing the screen state is enough for this session.
    }
    notify("Feed URL cleared.");
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showTable(mode: TableMode) {
    setTableMode(mode);
    setActivePanel("");
    window.setTimeout(() => scrollToSection("live-bids-table"), 0);
  }

  function cycleChartPeriod() {
    const current = CHART_PERIODS.indexOf(chartPeriod);
    setChartPeriod(CHART_PERIODS[(current + 1) % CHART_PERIODS.length]);
  }

  function selectBorough(name: string) {
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setQuery("");
    setUserLocation(null);
    setLocationState("idle");
    setBorough((current) => (current === name ? "" : name));
  }

  function selectDateRange(range: DateRangeView) {
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setUserLocation(null);
    setLocationState("idle");
    setDateRange(range);
    setMapFitNonce((current) => current + 1);
  }

  function applyDaysFilter(showAll: boolean, days = customDays) {
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setUserLocation(null);
    setLocationState("idle");
    if (showAll) {
      setDateRange("all");
    } else {
      setCustomDays(Math.max(1, Math.min(999, Math.round(Number(days) || DEFAULT_CUSTOM_DAYS))));
      setDateRange("custom");
    }
    setMapFitNonce((current) => current + 1);
  }

  function updateCustomDays(value: string) {
    const nextDays = Math.max(1, Math.min(999, Math.round(Number(value) || DEFAULT_CUSTOM_DAYS)));
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setUserLocation(null);
    setLocationState("idle");
    setCustomDays(nextDays);
    setDateRange("custom");
    setMapFitNonce((current) => current + 1);
  }

  function fitVisibleMap() {
    setMapOverview(true);
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setActivePanel("");
    setMapFitNonce((current) => current + 1);
  }

  function startRouteMode() {
    setRouteMode(true);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setSelectedId("");
    setActivePanel("");
    if (!userLocation && locationState !== "locating") {
      locateUser();
    }
  }

  function closeRouteMode() {
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setSelectedId("");
  }

  function locateUser() {
    setMapOverview(false);
    setSelectedId("");
    setActivePanel("");

    if (!navigator.geolocation) {
      setLocationState("blocked");
      notify("Location is not available in this browser.");
      return;
    }

    setLocationState("locating");
    notify("Centering on your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setLocationState("found");
        setMapFitNonce((current) => current + 1);
        notify("Centered on your location.");
      },
      () => {
        setLocationState("blocked");
        notify("Allow location permission to center the map.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  function selectStatus(status: StatusView) {
    setSelectedId("");
    setRouteMode(false);
    setRouteSkippedIds([]);
    setActiveRouteIndex(0);
    setStatusView(status);
  }

  function selectRouteStop(index: number) {
    const job = routeStops[index];
    if (!job) return;
    setActiveRouteIndex(index);
    setSelectedId(job.id);
    setJobSheetExpanded(false);
    setActivePanel("");
  }

  function selectMapJob(id: string) {
    setJobSheetExpanded(false);
    if (routeMode) {
      const routeIndex = routeStops.findIndex((job) => job.id === id);
      if (routeIndex >= 0) setActiveRouteIndex(routeIndex);
    }
    setSelectedId(id);
  }

  function handleJobSheetPreviewClick(event: MouseEvent<HTMLElement>) {
    if (jobSheetExpanded) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, label, select, textarea")) return;
    setJobSheetExpanded(true);
  }

  function skipRouteStop(job: JobRecord, index: number) {
    setRouteSkippedIds((current) => (current.includes(job.id) ? current : [...current, job.id]));
    if (index < activeRouteIndex) {
      setActiveRouteIndex(Math.max(0, activeRouteIndex - 1));
    }
    notify(`${job.id} skipped for this route.`);
  }

  async function completeRouteStop(job: JobRecord, index: number) {
    await updateJobStatus(job, "Work Completed", { promptMedia: false });
    setRouteSkippedIds((current) => (current.includes(job.id) ? current : [...current, job.id]));
    if (index < activeRouteIndex) {
      setActiveRouteIndex(Math.max(0, activeRouteIndex - 1));
    }
  }

  async function updateJobStatus(job: JobRecord, nextStatus: string, options: { promptMedia?: boolean } = {}) {
    const jobId = job.id;
    const action = actionForStatus(nextStatus);
    const existingStamp = fieldFlowEventsByJob[jobId]?.[nextStatus];
    const shouldPromptMedia = options.promptMedia !== false && action?.phase === "outcome";

    if (existingStamp) {
      setJobStatusOverrides((current) => {
        const next = { ...current, [jobId]: nextStatus };
        try {
          window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Keep the on-screen update even if browser storage is unavailable.
        }
        return next;
      });
      setStatusMediaPrompt(shouldPromptMedia ? { jobId, label: action.label } : null);
      notify(`${action?.label || nextStatus} already saved at ${formatStampTime(existingStamp.createdAt)}.`);
      return;
    }

    const stampedEvent: FieldFlowEvent = {
      label: action?.label || nextStatus,
      status: nextStatus,
      createdAt: new Date().toISOString(),
    };

    setJobStatusOverrides((current) => {
      const next = { ...current, [jobId]: nextStatus };
      try {
        window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the on-screen update even if browser storage is unavailable.
      }
      return next;
    });
    setFieldFlowEventsByJob((current) => {
      const next = {
        ...current,
        [jobId]: {
          ...(current[jobId] || {}),
          [nextStatus]: stampedEvent,
        },
      };
      writeLocalFlowMap(next);
      return next;
    });
    setStatusMediaPrompt(shouldPromptMedia ? { jobId, label: action.label } : null);

    if (!statusMatches({ ...job, status: nextStatus, statusOverride: nextStatus, workflowStatus: nextStatus }, statusView)) {
      setStatusView("All");
    }

    try {
      const response = await fetch("/api/jobs/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, status: nextStatus, statusDate: todayDateKey() }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; status?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save status");
      const savedStatus = realFieldValue(data.status || nextStatus);
      if (savedStatus) {
        setJobStatusOverrides((current) => ({ ...current, [jobId]: savedStatus }));
      }
      notify(`${jobId} saved: ${savedStatus || nextStatus}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      notify(errorMessage || `${jobId} updated on this device.`);
    }
  }

  async function updateSelectedStatus(nextStatus: string) {
    if (!selected) return;
    await updateJobStatus(selected, nextStatus);
  }

  async function clearSelectedStatus() {
    if (!selected) return;

    const jobId = selected.id;
    const sourceStatus = sourceStatusForJob(selected);

    setJobStatusOverrides((current) => {
      const next = { ...current };
      delete next[jobId];
      try {
        window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Clearing the screen state still works if browser storage is unavailable.
      }
      return next;
    });
    setFieldFlowEventsByJob((current) => {
      const next = { ...current };
      delete next[jobId];
      writeLocalFlowMap(next);
      return next;
    });
    setStatusMediaPrompt(null);

    if (!statusMatches({ ...selected, status: sourceStatus, statusOverride: "", workflowStatus: "" }, statusView)) {
      setStatusView("All");
    }
    notify(`${jobId} local status cleared.`);

    try {
      const response = await fetch(`/api/jobs/status?id=${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to clear shared status");
      notify(`${jobId} status cleared.`);
    } catch (error) {
      notify(error instanceof Error ? `Local clear done. Shared clear: ${error.message}` : `${jobId} local status cleared.`);
    }
  }

  async function generateSelectedPackagePreview() {
    if (!selected) return;
    if (!selectedAffidavitTemplate) {
      notify("Choose Work Completed, Refused, No Access, or Completed by Other first.");
      return;
    }

    const jobId = selected.id;
    setClosingOutId(jobId);
    setStatusMediaPrompt(null);

    try {
      const response = await fetch("/api/jobs/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: jobId,
          action: "bundle",
          status: selectedStatus,
          closeout: false,
          affidavitType: affidavitTypeForStatus(selectedStatus),
          statusDate: todayDateKey(),
        }),
      });
      const data = await response.json() as GeneratedDocuments & { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to generate package.");

      setGeneratedDocsByJob((current) => ({ ...current, [jobId]: data }));
      notify(`${jobId} invoice and affidavit generated. Review preview, then save.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to generate package.");
    } finally {
      setClosingOutId("");
    }
  }

  async function saveAndArchiveSelectedPackage() {
    if (!selected) return;

    const jobId = selected.id;
    const docs = generatedDocsByJob[jobId];
    if (!docs) {
      notify("Generate the invoice and affidavit before saving the close-out.");
      return;
    }

    setArchivingPackageId(jobId);
    try {
      const response = await fetch("/api/jobs/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: jobId,
          status: selectedStatus,
          archived: true,
          statusDate: todayDateKey(),
        }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to archive job.");

      setJobStatusOverrides((current) => {
        const next = { ...current, [jobId]: selectedStatus };
        try {
          window.localStorage.setItem(STATUS_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // The server-side archive has already been saved.
        }
        return next;
      });
      setSourceJobs((current) => current.map((job) => (
        job.id === jobId
          ? {
            ...job,
            status: selectedStatus,
            statusOverride: selectedStatus,
            workflowStatus: selectedStatus,
            archived: true,
          }
          : job
      )));
      notify(`${jobId} paperwork saved and archived.`);
      setSelectedId("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to archive job.");
    } finally {
      setArchivingPackageId("");
    }
  }

  async function handleSelectedPrimaryFlow() {
    if (!selected) return;

    if (selectedNextSiteAction) {
      await updateSelectedStatus(selectedNextSiteAction.value);
      return;
    }

    if (!selectedOutcome) {
      notify("Choose Work Completed, Refused Access, No Access, or Completed by Other first.");
      return;
    }

    if (selectedGeneratedDocs) {
      await saveAndArchiveSelectedPackage();
      return;
    }

    await generateSelectedPackagePreview();
  }

  async function syncJobsNow(options: SyncJobsOptions = {}) {
    const feedUrl = manualFeedUrl.trim();
    const request: RequestInit = feedUrl
      ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl, feedType: manualFeedType }),
      }
      : { method: "POST" };
    const beforeIds = new Set(sourceJobs.map((job) => job.id));

    setSyncState((current) => ({
      ...current,
      status: "syncing",
      message: options.automatic ? "Checking today's HPD awards..." : "Fetching latest COA data...",
    }));

    try {
      const response = await fetch("/api/jobs/sync", request);
      const data = await response.json() as Partial<SyncState> & {
        ok?: boolean;
        error?: string;
        jobs?: JobRecord[];
      };
      const message = String(data.message || data.error || "Fetch finished.");
      const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
      let addedCount = 0;

      setSyncState({
        status: data.ok ? "current" : "failed",
        configured: Boolean(data.configured),
        count: Number(data.count || nextJobs.length || sourceJobs.length),
        lastSyncAt: String(data.lastSyncAt || ""),
        sourceUpdatedAt: String(data.sourceUpdatedAt || data.lastSyncAt || ""),
        source: String(data.source || "Bundled CSV"),
        message,
        today: String(data.today || ""),
        dataThroughDate: String(data.dataThroughDate || ""),
        inferredDataThroughDate: String(data.inferredDataThroughDate || ""),
        fetchThroughDate: String(data.fetchThroughDate || ""),
        newestAwardDate: String(data.newestAwardDate || ""),
        newestJobDate: String(data.newestJobDate || ""),
        daysBehind: numberOrNull(data.daysBehind),
        jobsAfterToday: Number(data.jobsAfterToday || 0),
        fetcherState: String(data.fetcherState || ""),
        fetcherOk: Boolean(data.fetcherOk),
        fetcherFinishedAt: String(data.fetcherFinishedAt || ""),
        fetcherError: String(data.fetcherError || ""),
      });
      if (options.openPanel !== false) {
        setActivePanel("sync");
      }

      if (!response.ok || !data.ok) {
        notify(message);
        return;
      }

      if (nextJobs.length && (data.configured || data.fetcherOk)) {
        const addedIds = nextJobs.map((job) => job.id).filter((id) => id && !beforeIds.has(id));
        addedCount = addedIds.length;
        rememberNewAwardIds(addedIds);
        setSourceJobs(nextJobs);
        if (data.configured) {
        setQuery("");
        setBorough("");
        setStatusView("All");
        setDateRange("all");
        setSelectedId("");
        setRouteMode(false);
        setRouteSkippedIds([]);
        setActiveRouteIndex(0);
        setUserLocation(null);
        setLocationState("idle");
      }
        setMapFitNonce((current) => current + 1);
      }

      notify(addedCount ? `${addedCount} new award${addedCount === 1 ? "" : "s"} loaded.` : message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed.";
      setSyncState((current) => ({
        ...current,
        status: "failed",
        message,
      }));
      if (options.openPanel !== false) {
        setActivePanel("sync");
      }
      notify(message);
    }
  }

  function exportFilteredJobs() {
    const blob = new Blob([jobsToCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `hpd-bids-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    notify(`${filtered.length} records exported.`);
  }

  function handleNav(label: string) {
    setActiveNav(label);

    if (label === "Overview") {
      resetFilters();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (label === "Live Bids") {
      showTable("live");
    } else if (label === "ITB / COA") {
      showTable("documents");
    } else if (label === "Field Map") {
      scrollToSection("live-map-preview");
    } else if (label === "Automation") {
      showTable("queue");
    } else if (label === "Documents") {
      if (selected) {
        window.location.href = selectedDetailHref;
      } else {
        showTable("documents");
      }
    } else if (label === "Reports") {
      exportFilteredJobs();
    } else if (label === "System Status") {
      setActivePanel("system");
    }
  }

  function selectRelativeJob(direction: 1 | -1) {
    if (!filtered.length) return;
    const currentIndex = selectedIndex < 0 ? 0 : selectedIndex;
    const nextIndex = (currentIndex + direction + filtered.length) % filtered.length;
    setSelectedId(filtered[nextIndex].id);
    setJobSheetExpanded(false);
  }

  function renderSelectedFlowButton(action: FieldStatusAction) {
    const stamp = selectedFlowEvents[action.value];
    const active = selectedStatus.toLowerCase() === action.value.toLowerCase();
    const isNext = isNextFlowAction(action, selectedFlowEvents);

    return (
      <button
        key={action.value}
        type="button"
        className={`${active ? "is-active" : ""} ${stamp ? "is-stamped" : ""} ${isNext ? "is-next" : ""}`.trim()}
        aria-pressed={active}
        title={action.value}
        onClick={() => updateSelectedStatus(action.value)}
      >
        <strong>{action.label}</strong>
        <span>{stamp ? `Done ${formatStampTime(stamp.createdAt)}` : isNext ? "Next" : "Tap"}</span>
      </button>
    );
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(event.currentTarget.files || []);
    if (!selected || !files.length) return;
    setStatusMediaPrompt(null);

    const formData = new FormData();
    formData.append("id", selected.id);
    files.forEach((file) => formData.append("photos", file));

    setUploadingPhotos(true);
    try {
      let response = await fetch("/api/jobs/media", { method: "POST", body: formData });
      if (!response.ok) {
        response = await fetch("/api/jobs/images", { method: "POST", body: formData });
      }
      const data = await response.json() as { ok?: boolean; error?: string; files?: Array<{ url: string }> };
      if (!response.ok || !data.ok) throw new Error(data.error || "Upload failed");
      const uploadedUrls = imageUrlsFromMedia(data.files || []);
      setPhotoUrlsByJob((current) => ({
        ...current,
        [selected.id]: [...uploadedUrls, ...(current[selected.id] || [])],
      }));
      notify(`${uploadedUrls.length} photo${uploadedUrls.length === 1 ? "" : "s"} saved for ${selected.id}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save photos.");
    } finally {
      setUploadingPhotos(false);
      input.value = "";
    }
  }

  const panelTitles: Record<Exclude<ActivePanel, "">, string> = {
    filters: "Filters",
    status: "Status Filter",
    days: "Days Filter",
    notifications: "Recent Activity",
    account: "Account Tools",
    map: "Expanded Map",
    system: "System Status",
    contact: "Job Contact",
    jobs: "Visible Jobs",
    add: "Quick Actions",
    sync: "Data Fetcher",
  };
  const panelTitle = activePanel ? panelTitles[activePanel] : "";
  const systemReport = [
    "HPD Bid Dashboard 2026",
    `Generated: ${new Date().toLocaleString()}`,
    `Loaded jobs: ${sourceJobs.length}`,
    `Mapped jobs: ${dateScopedJobs.length}`,
    `Filtered jobs: ${filtered.length}`,
    `Date range: ${dateRangeLabel(dateRange, customDays)}`,
    `ITB files: ${itbCount}`,
    `COA awards: ${coaCount}`,
    `Command queue: ${queuedRows.length}`,
    `Data source: ${syncState.source}`,
    `Last fetch: ${formatSyncTime(syncState.lastSyncAt)}`,
  ].join("\n");
  const trimmedQuery = query.trim();
  const emptyMapScope = borough || (statusView !== "All" ? statusView : trimmedQuery ? "Search" : "No results");
  const emptyMapTitle = borough ? "No mapped jobs here" : "No mapped jobs match";
  const emptyMapMessage = borough
    ? statusView === "All" && !trimmedQuery
      ? `The map is centered on ${borough}, but no jobs in the current data have coordinates there.`
      : `The map is centered on ${borough}, but no jobs match the active filters.`
    : "Try another status, borough, or search term to bring jobs back onto the map.";

  return (
    <main className={phonePreviewMode ? "command-app is-phone-preview" : "command-app"}>
      <section className="desktop-dashboard">
        <aside className="command-sidebar">
          <div className="sidebar-brand">
            <div className="brand-tile">HPD</div>
            <div>
              <strong>HPD Bid Dashboard</strong>
              <span>2026 Command Center</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Dashboard navigation">
            {NAV_ITEMS.map(([label, icon]) => (
              <button
                key={label}
                className={label === activeNav ? "is-active" : ""}
                type="button"
                onClick={() => handleNav(label)}
              >
                <span className={`nav-icon nav-${icon}`} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          <div className="sidebar-map-card">
            <span>Map Preview</span>
            <strong>{dateScopedJobs.length}</strong>
            <p>{dateRangeLabel(dateRange, customDays)} jobs with coordinates ready for field routing.</p>
            <button
              type="button"
              onClick={() => {
                selectStatus("Open");
                scrollToSection("live-map-preview");
              }}
            >
              Open live map
              <span aria-hidden="true">↗</span>
            </button>
          </div>

          <div className="sidebar-profile">
            <div className="avatar">HPD</div>
            <div>
              <strong>Live Session</strong>
              <span>{jobs.length} records loaded</span>
            </div>
            <span aria-hidden="true">⌄</span>
          </div>
        </aside>

        <div className="command-main">
          <header className="command-topbar">
            <div>
              <h1>HPD Bid Command Center</h1>
              <p>{jobs.length} bid records loaded from the project data.</p>
            </div>
            <label className="desktop-search">
              <span aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setSelectedId("");
                  setRouteMode(false);
                  setRouteSkippedIds([]);
                  setActiveRouteIndex(0);
                  setQuery(event.target.value);
                }}
                aria-label="Search jobs"
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-actions">
              <button type="button" aria-label="Open filters" className="icon-button sliders-icon" onClick={() => setActivePanel("filters")} />
              <button type="button" aria-label="Notifications" className="icon-button bell-icon" onClick={() => setActivePanel("notifications")}>
                <span>{activityRows.length}</span>
              </button>
              <button type="button" className="account-switcher" onClick={() => setActivePanel("account")}>
                <span className="account-logo">HPD</span>
                <span>
                  <strong>Project Workspace</strong>
                  <small>{dateScopedJobs.length} {dateRangeLabel(dateRange, customDays)} jobs</small>
                </span>
                <span aria-hidden="true">⌄</span>
              </button>
            </div>
          </header>

          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-icon pulse-icon" aria-hidden="true" />
              <div>
                <small>Live Bids</small>
                <strong>{jobs.length}</strong>
                <p>Active opportunities</p>
                <button type="button" onClick={() => showTable("live")}>View all</button>
              </div>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon doc-icon" aria-hidden="true" />
              <div>
                <small>ITB Files</small>
                <strong>{itbCount}</strong>
                <p>Total ITB files</p>
                <button type="button" onClick={() => showTable("documents")}>View all</button>
              </div>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon award-icon" aria-hidden="true" />
              <div>
                <small>COA Awards</small>
                <strong>{coaCount}</strong>
                <p>Total COA awards</p>
                <button type="button" onClick={() => showTable("documents")}>View all</button>
              </div>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon money-icon" aria-hidden="true" />
              <div>
                <small>Total COA Awards</small>
                <strong>{formatCurrency(totalAwardValue, "")}</strong>
                <p>Total awarded value</p>
                <button type="button" onClick={exportFilteredJobs}>Export</button>
              </div>
            </div>
          </div>

          <div className="analytics-grid">
            <section className="panel chart-panel">
              <div className="panel-head">
                <h2>Bids over time</h2>
                <button type="button" onClick={cycleChartPeriod}>
                  {chartPeriod}
                </button>
              </div>
              <svg viewBox="0 0 420 220" role="img" aria-label="Bids over time chart">
                <defs>
                  <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2f9cff" stopOpacity="0.34" />
                    <stop offset="100%" stopColor="#2f9cff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[35, 70, 105, 140, 175].map((y) => (
                  <line key={y} x1="20" x2="388" y1={y} y2={y} />
                ))}
                <path d={`${trendPath} L 360 190 L 20 190 Z`} className="chart-area" />
                <path d={trendPath} className="chart-line" />
                {trend.map((value, index) => {
                  const max = Math.max(...trend);
                  const min = Math.min(...trend);
                  const x = 20 + index * 34;
                  const y = 175 - ((value - min) / Math.max(1, max - min)) * 140;
                  return <circle key={`${value}-${index}`} cx={x} cy={y} r="5" />;
                })}
              </svg>
            </section>

            <section className="panel borough-panel">
              <h2>Bids by borough</h2>
              <div className="borough-list">
                {boroughCounts.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => selectBorough(item.name)}
                    className={item.name === borough ? "is-active" : ""}
                  >
                    <span className={`dot dot-${index}`} />
                    <strong>{item.code}</strong>
                    <span>{item.count}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel map-preview-panel" id="live-map-preview">
              <div className="panel-head">
                <h2>Map preview</h2>
                <button type="button" aria-label="Expand map" className="expand-icon" onClick={() => setActivePanel("map")} />
              </div>
              <div className="desktop-map-frame">
                <JobsMap
                  jobs={filtered.slice(0, 120)}
                  selectedId={selected?.id || ""}
                  onSelect={selectMapJob}
                  focusCenter={mapFocusCenter}
                  focusZoom={mapFocusZoom}
                  focusKey={mapFocusKey}
                  userLocation={userLocation}
                  routeJobs={mapRouteJobs}
                  activeRouteStopId={activeRouteStopId}
                  newAwardIds={newAwardIds}
                  latestAwardIds={latestAwardIds}
                />
              </div>
            </section>

            <section className="panel activity-panel">
              <div className="panel-head">
                <h2>Recent activity</h2>
                <button type="button" onClick={() => scrollToSection("live-bids-table")}>View all</button>
              </div>
              <div className="activity-list">
                {activityRows.map((job, index) => (
                  <button key={`${job.id}-activity`} type="button" onClick={() => setSelectedId(job.id)}>
                    <span className="omo-bubble">OMO</span>
                    <span>
                      <strong>{job.id}</strong>
                      <small>{job.address || "No address listed"}</small>
                    </span>
                    <StatusBadge status={displayStatus(job)} />
                    <time>{activityStamp(job)}</time>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="panel table-panel" id="live-bids-table">
            <div className="table-toolbar">
              <div className="table-tabs">
                <button type="button" className={tableMode === "live" ? "is-active" : ""} onClick={() => setTableMode("live")}>Live bids table</button>
                <button type="button" className={tableMode === "queue" ? "is-active" : ""} onClick={() => setTableMode("queue")}>Command queue</button>
                <button type="button" className={tableMode === "documents" ? "is-active" : ""} onClick={() => setTableMode("documents")}>Documents</button>
              </div>
              <div>
                <span>{tableSource.length} records</span>
                <a
                  href={exportDataHref}
                  download={exportFileName}
                  onClick={() => notify(`${filtered.length} records exported.`)}
                >
                  Export
                </a>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>OMO</th>
                    <th>Address</th>
                    <th>Borough</th>
                    <th>Status</th>
                    <th>COA Award</th>
                    <th>Start Date</th>
                    <th>Completion Date</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((job) => (
                    <tr
                      key={`${job.id}-table`}
                      className={selected?.id === job.id ? "is-selected" : ""}
                      onClick={() => setSelectedId(job.id)}
                    >
                      <td>{job.id}</td>
                      <td>{job.address || "No address listed"}</td>
                      <td>{job.borough || "Unknown"}</td>
                      <td><StatusBadge status={displayStatus(job)} /></td>
                      <td>{formatCurrency(job.amountValue, job.bidAmount)}</td>
                      <td>{formatJobStartDate(job)}</td>
                      <td>{formatJobCompletionDate(job)}</td>
                      <td>
                        <a
                          href={jobDetailHref(job)}
                          className="row-more"
                          aria-label={`Open ${job.id} details`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          ⋮
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!tableRows.length ? (
                    <tr className="empty-table-row">
                      <td colSpan={8}>
                        No records match the current filters.
                        <button type="button" onClick={resetFilters}>Reset filters</button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section className={`mobile-field map-first ${mapToolsOpen ? "tools-open" : "tools-closed"}`}>
        <header className="mobile-command-card">
          <div className="mobile-command-brand">
            <div className="mobile-hpd-shield" aria-hidden="true">
              <strong>HPD</strong>
              <span />
            </div>
            <div>
              <p>HPD Bid Dashboard 2026</p>
              <h1>Field Command</h1>
              <span className="mobile-live-line">
                <i aria-hidden="true" />
                Live
                <small>{filtered.length} {mobileVisibleLabel}</small>
              </span>
              <span className={`mobile-sync-inline is-${syncState.status}`}>
                <button type="button" onClick={() => syncJobsNow()} disabled={syncState.status === "syncing"}>
                  {syncState.status === "syncing" ? "Fetching" : "Fetch"}
                </button>
                <small>
                  {fetcherNeedsAuth
                    ? "Google auth needed"
                    : syncState.status === "failed" && !syncState.configured
                      ? `Data through ${dataThroughText}`
                      : syncState.status === "failed"
                        ? "Fetch needs setup"
                        : `Data through ${dataThroughText}`}
                </small>
              </span>
            </div>
          </div>
          <div className="mobile-command-actions">
            <button type="button" className="mobile-notify-button bell-icon" aria-label="Open alerts" onClick={() => setActivePanel("notifications")}>
              <span>{alertCount}</span>
            </button>
            <button type="button" className="mobile-menu-button menu-lines-icon" aria-label="Open menu" onClick={() => setActivePanel("filters")} />
          </div>
        </header>

        <div ref={mobileBoroughRowRef} className="mobile-borough-tabs" aria-label="Borough filters">
          {mobileBoroughStats.map((item) => {
            const active = item.key ? item.key === borough : !borough;
            return (
              <button
                key={item.key || "all"}
                type="button"
                data-borough-chip={item.key || "__all__"}
                className={[
                  "mobile-borough-pill",
                  item.key ? boroughClassName(item.key) : "mobile-borough-all",
                  active ? "is-active" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => selectBorough(item.key)}
              >
                <strong>{item.label}</strong>
                <span>{item.count}</span>
              </button>
            );
          })}
        </div>

        <div className="mobile-filter-row" aria-label="Map filters">
          <div className="mobile-status-compact" aria-label="Status filter">
            <button
              type="button"
              className={statusView === "All" ? "" : "is-active"}
              aria-haspopup="dialog"
              onClick={() => setActivePanel("status")}
            >
              <span>Status</span>
              <strong>{statusView === "All" ? "All" : statusView}</strong>
              <em>{activeMobileStatus?.count ?? filtered.length} jobs</em>
              <i aria-hidden="true">⌄</i>
            </button>
          </div>
          <div className="mobile-days-compact" aria-label="Date range filter">
            <button
              type="button"
              className={dateRange === "all" ? "" : "is-active"}
              aria-haspopup="dialog"
              onClick={() => setActivePanel("days")}
            >
              <span>Days</span>
              <strong>{dateRangeLabel(dateRange, customDays)}</strong>
              <em>{activeDateRangeCount} jobs</em>
              <i aria-hidden="true">⌄</i>
            </button>
          </div>
        </div>

        <div className="mobile-search" role="search">
          <span aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setSelectedId("");
              setRouteMode(false);
              setRouteSkippedIds([]);
              setActiveRouteIndex(0);
              setQuery(event.target.value);
            }}
            placeholder="Search jobs or address"
            aria-label="Search field map"
          />
          <button type="button" className="mobile-search-filter" aria-label="Open search filters" onClick={() => setActivePanel("filters")} />
        </div>

        <div className="mobile-map-shell">
          <JobsMap
            jobs={filtered}
            selectedId={selected?.id || ""}
            onSelect={selectMapJob}
            focusCenter={mapFocusCenter}
            focusZoom={mapFocusZoom}
            focusKey={mapFocusKey}
            variant="clusters"
            userLocation={userLocation}
            routeJobs={mapRouteJobs}
            activeRouteStopId={activeRouteStopId}
            newAwardIds={newAwardIds}
            latestAwardIds={latestAwardIds}
          />
          <button
            type="button"
            className={`mobile-map-data-badge is-${syncState.status}`}
            onClick={() => setActivePanel("sync")}
            aria-label="Open data fetcher status"
          >
            <span>{mapDataBadgeTitle}</span>
            <strong>{mapDataBadgeMeta}</strong>
            <small>{mapDataBadgeCounts}</small>
          </button>
          {selectedMapsHref ? (
            <a href={selectedMapsHref} target="_blank" rel="noreferrer" className="floating-map-button nav-arrow-icon" aria-label="Navigate" />
          ) : (
            <button type="button" className="floating-map-button nav-arrow-icon" aria-label="Fit visible jobs" onClick={fitVisibleMap} />
          )}
          <button type="button" className="floating-map-button layers-icon" aria-label="Open expanded map" onClick={() => setActivePanel("map")} />
          <button
            type="button"
            className={`floating-map-button locate-icon is-${locationState}`}
            aria-label="Locate me"
            aria-busy={locationState === "locating"}
            onClick={locateUser}
          />
          <button type="button" className="visible-count-button" aria-label="Open visible jobs" onClick={() => setActivePanel("jobs")}>
            <strong>{filtered.length}</strong>
            <span>{mobileVisibleLabel}</span>
          </button>
        </div>

        {routeMode ? (
          <article className="mobile-job-sheet is-route-mode" aria-label="Route Mode">
            <div className="sheet-handle" />
            <div className="route-mode-head">
              <div>
                <span className="scope-badge">{routeStops.length ? `${routeStops.length} stops` : locationState === "locating" ? "building" : "route"}</span>
                <h2>Route Today</h2>
              </div>
              <button type="button" className="route-mode-close" onClick={closeRouteMode}>
                Done
              </button>
            </div>
            <div className="route-mode-stats">
              <div><span>Active</span><strong>{routeStops.length ? `${activeRouteStopIndex + 1}/${routeStops.length}` : "0/0"}</strong></div>
              <div><span>Miles</span><strong>{routeTotalText}</strong></div>
              <div><span>Data</span><strong>{dataThroughText}</strong></div>
            </div>
            {routeMapsHref ? (
              <a className="route-map-link" href={routeMapsHref} target="_blank" rel="noreferrer">
                <span className="quick-action-icon action-mini-route" aria-hidden="true" />
                Open full route in Google Maps
              </a>
            ) : (
              <button type="button" className="route-map-link" onClick={locateUser}>
                <span className="quick-action-icon action-mini-locate" aria-hidden="true" />
                {locationState === "blocked" ? "Allow location to route" : "Locate to build route"}
              </button>
            )}
            <div className="route-stop-list">
              {routeStopItems.map(({ job, legMiles }, index) => {
                const jobMapsHref = mapsHref(job);
                const jobEvents = fieldFlowEventsByJob[job.id] || {};
                const arrived = Boolean(jobEvents["Arrived On Site"]);
                const active = index === activeRouteStopIndex;

                return (
                  <article key={`${job.id}-route`} className={active ? "route-stop-card is-active" : "route-stop-card"}>
                    <button type="button" className="route-stop-main" onClick={() => selectRouteStop(index)}>
                      <span>{index + 1}</span>
                      <strong>{job.id}</strong>
                      <small>{job.address || "No address listed"}</small>
                      <em>{formatDistanceMiles(legMiles) || "stop"}</em>
                    </button>
                    <div className="route-stop-meta">
                      <StatusBadge status={displayStatus(job)} />
                      <span>{job.borough || "NYC"}</span>
                    </div>
                    <div className="route-stop-actions" aria-label={`${job.id} route actions`}>
                      {jobMapsHref ? (
                        <a href={jobMapsHref} target="_blank" rel="noreferrer">
                          <span className="quick-action-icon action-mini-nav" aria-hidden="true" />
                          Nav
                        </a>
                      ) : (
                        <a href={jobDetailHref(job)}>
                          <span className="quick-action-icon action-mini-map" aria-hidden="true" />
                          Map
                        </a>
                      )}
                      <button type="button" onClick={() => skipRouteStop(job, index)}>
                        <span className="quick-action-icon action-mini-skip" aria-hidden="true" />
                        Skip
                      </button>
                      <button type="button" onClick={() => updateJobStatus(job, "Arrived On Site", { promptMedia: false })}>
                        <span className="quick-action-icon action-mini-arrived" aria-hidden="true" />
                        {arrived ? "Here" : "Arrived"}
                      </button>
                      <button type="button" onClick={() => void completeRouteStop(job, index)}>
                        <span className="quick-action-icon action-mini-complete" aria-hidden="true" />
                        Complete
                      </button>
                    </div>
                  </article>
                );
              })}
              {!routeStopItems.length ? (
                <div className="route-empty">
                  <strong>No open mapped stops</strong>
                  <span>Reset filters or switch status to All to build a field route.</span>
                  <button type="button" onClick={resetFilters}>Reset</button>
                </div>
              ) : null}
            </div>
          </article>
        ) : null}

        {!routeMode && !selected && filtered.length > 0 ? (
          <article className="mobile-job-sheet is-today-mode" aria-label="Today Field Mode">
            <div className="sheet-handle" />
            <div className="today-mode-head">
              <div>
                <span className="scope-badge">{todayModeMeta}</span>
                <h2>{todayModeTitle}</h2>
              </div>
              <div className="today-mode-head-actions">
                <button
                  type="button"
                  className="today-mode-locate"
                  onClick={() => {
                    if (syncState.status !== "syncing" && !syncCoversToday(syncState)) {
                      void syncJobsNow({ automatic: true, openPanel: false });
                    }
                    locateUser();
                  }}
                >
                  <span className="quick-action-icon action-mini-locate" aria-hidden="true" />
                  {userLocation ? "Recenter" : "Locate"}
                </button>
                <button
                  type="button"
                  className="today-route-button"
                  disabled={!todayFieldJobs.length}
                  onClick={startRouteMode}
                >
                  <span className="quick-action-icon action-mini-route" aria-hidden="true" />
                  Route
                </button>
              </div>
            </div>
            <div className="today-mode-stats">
              <div><span>Data</span><strong>{dataThroughText}</strong></div>
              <div><span>Nearest</span><strong>{nearestDistanceText}</strong></div>
              <div><span>{todayHighlightLabel}</span><strong>{todayNewCount || todayLatestCount}</strong></div>
            </div>
            <div className="today-job-list">
              {todayFieldJobs.map(({ job, distanceMiles, newAward, latestAward }, index) => {
                const jobMapsHref = mapsHref(job);
                const jobPhoneHref = phoneHref(job);
                const jobEvents = fieldFlowEventsByJob[job.id] || {};
                const arrived = Boolean(jobEvents["Arrived On Site"]);
                const highlight = newAward || (!todayNewCount && latestAward);

                return (
                  <article key={`${job.id}-today`} className={highlight ? "today-job-card is-highlighted" : "today-job-card"}>
                    <button
                      type="button"
                      className="today-job-open"
                      onClick={() => {
                        setSelectedId(job.id);
                        setActivePanel("");
                      }}
                    >
                      <span>{formatDistanceMiles(distanceMiles) || `#${index + 1}`}</span>
                      <strong>{job.id}</strong>
                      <small>{job.address || "No address listed"}</small>
                      {highlight ? <em>{newAward ? "New" : "Latest"}</em> : null}
                    </button>
                    <div className="today-job-actions" aria-label={`${job.id} quick actions`}>
                      {jobMapsHref ? (
                        <a href={jobMapsHref} target="_blank" rel="noreferrer">
                          <span className="quick-action-icon action-mini-nav" aria-hidden="true" />
                          Nav
                        </a>
                      ) : (
                        <a href={jobDetailHref(job)}>
                          <span className="quick-action-icon action-mini-map" aria-hidden="true" />
                          Map
                        </a>
                      )}
                      {jobPhoneHref ? (
                        <a href={jobPhoneHref}>
                          <span className="quick-action-icon action-mini-phone" aria-hidden="true" />
                          Call
                        </a>
                      ) : (
                        <a href={jobDetailHref(job)}>
                          <span className="quick-action-icon action-mini-phone" aria-hidden="true" />
                          Contact
                        </a>
                      )}
                      <a href={jobDetailHref(job)}>
                        <span className="quick-action-icon action-mini-doc" aria-hidden="true" />
                        Docs
                      </a>
                      <button type="button" onClick={() => updateJobStatus(job, "Arrived On Site", { promptMedia: false })}>
                        <span className="quick-action-icon action-mini-arrived" aria-hidden="true" />
                        {arrived ? "Here" : "Arrived"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        ) : null}

        {!routeMode && selected ? (
          <article
            className={jobSheetExpanded ? "mobile-job-sheet is-job-command is-expanded" : "mobile-job-sheet is-job-command is-compact"}
            onClick={handleJobSheetPreviewClick}
            onTouchStart={(event) => {
              const target = event.target as HTMLElement;
              jobSheetTouchStartY.current = target.closest(".sheet-handle, .job-sheet-toolbar")
                ? event.touches[0]?.clientY ?? null
                : null;
            }}
            onTouchEnd={(event) => {
              if (jobSheetTouchStartY.current === null) return;
              const endY = event.changedTouches[0]?.clientY ?? jobSheetTouchStartY.current;
              if (endY - jobSheetTouchStartY.current > 58) {
                if (jobSheetExpanded) setJobSheetExpanded(false);
                else setSelectedId("");
              } else if (jobSheetTouchStartY.current - endY > 58) {
                setJobSheetExpanded(true);
              }
              jobSheetTouchStartY.current = null;
            }}
          >
            <div className="sheet-handle" />
                <div className="sheet-topline job-sheet-toolbar">
                  <StatusBadge status={displayStatus(selected)} />
                  <span className="sheet-omo">OMO {selected.id}</span>
                  <button
                    type="button"
                    aria-label={isSelectedSaved ? "Unsave job" : "Save job"}
                    className={isSelectedSaved ? "star-icon is-saved" : "star-icon"}
                    onClick={() => {
                      setSavedIds((current) => (
                        selected && current.includes(selected.id)
                          ? current.filter((id) => id !== selected.id)
                          : selected ? [...current, selected.id] : current
                      ));
                      notify(isSelectedSaved ? "Job removed from saved list." : "Job saved.");
                    }}
                  />
                  <button
                    type="button"
                    className="job-card-expand-button"
                    aria-label={jobSheetExpanded ? "Compact job card" : "Open full job card"}
                    onClick={() => setJobSheetExpanded((current) => !current)}
                  >
                    {jobSheetExpanded ? "Less" : "Details"}
                  </button>
                  <button type="button" className="sheet-map-return" aria-label="Close job card and return to map" onClick={() => setSelectedId("")}>
                    <span aria-hidden="true">×</span>
                    Map
                  </button>
                </div>
            <div className={selectedPhotoUrl ? "field-card-grid has-photo" : "field-card-grid"}>
              <div className="field-card-main">
                <h2><small className="work-order-label">WORK ORDER</small>{selected.id}</h2>
                {selectedAddress ? <p>{selectedAddress}</p> : null}
                <div className="field-card-tags">
                  <span>Award: {formatShortDate(selected.awardDate)}</span>
                  <span>Maturity: {formatJobCompletionDate(selected)}</span>
                </div>
              </div>

              <div className="field-card-details">
                {selectedDetailItems.map((item) => (
                  <div key={item.label}>
                    <span className={`field-detail-icon ${item.icon}`} aria-hidden="true" />
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              {selectedPhotoUrl ? (
                <div className="field-photo-card">
                  <img src={selectedPhotoUrl} alt={`Uploaded field photo for ${selected.id}`} />
                  <span className="photo-count">{Math.min(selectedPhotoUrls.length, 4)}/4</span>
                </div>
              ) : null}
            </div>

            <div className="job-card-next-step">
              <div>
                <span>{selectedPrimaryFlowStage}</span>
                <strong>{selectedPrimaryFlowLabel}</strong>
                <small>{selectedPrimaryFlowHint}</small>
              </div>
              <div className="job-card-next-actions">
                {selectedMapsHref ? (
                  <a href={selectedMapsHref} target="_blank" rel="noreferrer">
                    <span className="quick-action-icon action-mini-nav" aria-hidden="true" />
                    Nav
                  </a>
                ) : (
                  <button type="button" disabled>
                    <span className="quick-action-icon action-mini-map" aria-hidden="true" />
                    Map
                  </button>
                )}
                <button
                  type="button"
                  className="job-card-next-primary"
                  disabled={selectedPrimaryFlowBusy}
                  onClick={handleSelectedPrimaryFlow}
                >
                  {closingOutId === selected.id ? "Generating" : archivingPackageId === selected.id ? "Saving" : selectedPrimaryFlowLabel}
                </button>
              </div>
            </div>

            <div className="job-card-flow">
              <div className="job-card-flow-head">
                <div>
                  <strong>Field Flow</strong>
                  <span>{flowSummaryText(selectedFlowEvents)}</span>
                </div>
                <button
                  type="button"
                  className="clear-status-button"
                  onClick={clearSelectedStatus}
                >
                  Clear
                </button>
              </div>
              <div className="field-flow-progress job-card-flow-progress" aria-label="Visit progress">
                {flowProgressItems(selectedFlowEvents).map((item) => (
                  <span key={item.key} className={`${item.event ? "is-done" : ""} ${item.next ? "is-next" : ""}`.trim()}>
                    <i aria-hidden="true" />
                    <strong>{item.label}</strong>
                    <small>{item.event ? formatStampTime(item.event.createdAt) : item.next ? "Next" : "Waiting"}</small>
                  </span>
                ))}
              </div>
              <div className="job-card-flow-group">
                <span className="job-card-flow-label">1. Site steps</span>
                <div className="job-card-status-actions is-visit" aria-label="Site visit steps">
                  {VISIT_STATUS_ACTIONS.map(renderSelectedFlowButton)}
                </div>
              </div>
              <div className="job-card-flow-group">
                <span className="job-card-flow-label">2. What happened?</span>
                <div className="job-card-status-actions" aria-label="Update job outcome">
                  {OUTCOME_STATUS_ACTIONS.map(renderSelectedFlowButton)}
                </div>
              </div>
            </div>

            <div className="job-card-affidavit-check">
              <span className="affidavit-check-icon" aria-hidden="true" />
              <div>
                <strong>Affidavit Check</strong>
                <small>{selectedAffidavitSet.label}</small>
                <em>
                  {selectedAffidavitTemplate
                    ? `${selectedAffidavitTemplate.shortTitle} ready`
                    : "Pick outcome to choose form"}
                </em>
              </div>
              {selectedAffidavitTemplate ? (
                <button
                  type="button"
                  disabled={closingOutId === selected.id}
                  onClick={generateSelectedPackagePreview}
                >
                  {closingOutId === selected.id ? "Generating" : selectedGeneratedDocs ? "Regenerate" : "Generate"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => notify(`${AFFIDAVIT_VERSION_LABEL}: choose a final field outcome first.`)}
                >
                  Check
                </button>
              )}
            </div>

            {selectedGeneratedDocs ? (
              <div className="job-card-generated-package">
                <div className="job-card-generated-head">
                  <div>
                    <strong>Review Package</strong>
                    <span>{selectedGeneratedDocs.saved_at ? `Saved ${formatSyncTime(selectedGeneratedDocs.saved_at)}` : "Saved to project"}</span>
                  </div>
                  <button
                    type="button"
                    disabled={archivingPackageId === selected.id}
                    onClick={saveAndArchiveSelectedPackage}
                  >
                    {archivingPackageId === selected.id ? "Saving" : "Save & Archive"}
                  </button>
                </div>
                <div className="job-card-generated-links">
                  {([
                    ["Invoice", "invoice_path"],
                    ["Affidavit", "affidavit_path"],
                  ] as Array<[string, GeneratedDocumentKey]>).map(([label, key]) => {
                    const href = generatedDocumentUrl(selectedGeneratedDocs, key);
                    const filename = generatedDocumentName(selectedGeneratedDocs, key);
                    return href ? (
                      <span key={key}>
                        <a href={href} target="_blank" rel="noreferrer">Open {label}</a>
                        <a href={href} download={filename}>Save {label}</a>
                      </span>
                    ) : null;
                  })}
                </div>
                {affidavitPreviewUrls(selectedGeneratedDocs).length ? (
                  <div className="job-card-affidavit-preview">
                    {affidavitPreviewUrls(selectedGeneratedDocs).map((url, index) => (
                      <a key={url} href={generatedDocumentUrl(selectedGeneratedDocs, "affidavit_path")} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Generated affidavit page ${index + 1}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : selectedGeneratedDocs.affidavit_preview_error ? (
                  <p className="job-card-preview-error">{selectedGeneratedDocs.affidavit_preview_error}</p>
                ) : null}
              </div>
            ) : null}

            {statusMediaPrompt && selected.id === statusMediaPrompt.jobId ? (
              <div className="status-media-prompt" aria-label={`Add media for ${statusMediaPrompt.label}`}>
                <div>
                  <strong>Add media?</strong>
                  <span>{statusMediaPrompt.label} saved. Take photo/video now?</span>
                </div>
                <div className="status-media-prompt-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const input = photoInputRef.current;
                      if (!input) {
                        notify("Media picker is not ready.");
                        return;
                      }
                      input.click();
                      setStatusMediaPrompt(null);
                    }}
                  >
                    Yes
                  </button>
                  <button type="button" onClick={() => setStatusMediaPrompt(null)}>No</button>
                </div>
              </div>
            ) : null}

            <div className="sheet-actions">
              {selectedMapsHref ? (
                <a href={selectedMapsHref} target="_blank" rel="noreferrer"><span className="action-nav" />Navigate</a>
              ) : (
                <button type="button" disabled><span className="action-nav" />Navigate</button>
              )}
              {selectedPhoneHref ? (
                <a href={selectedPhoneHref}><span className="action-phone" />Call Tenant</a>
              ) : (
                <a href={selectedDetailHref}><span className="action-phone" />Contact Info</a>
              )}
              <label className={uploadingPhotos ? "is-disabled" : ""}>
                <span className="action-camera" />{uploadingPhotos ? "Saving" : "Photos"}
                <input
                  ref={photoInputRef}
                  className="sr-only-file"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={uploadingPhotos}
                  onChange={handlePhotoChange}
                />
              </label>
              <a href={selectedDetailHref}><span className="action-doc" />Documents</a>
            </div>

            <div className="sheet-pager">
              <button type="button" aria-label="Previous job" onClick={() => selectRelativeJob(-1)}>‹</button>
              <span>{filtered.length && selectedIndex >= 0 ? selectedIndex + 1 : 1} / {Math.max(filtered.length, 1)}</span>
              <button type="button" aria-label="Next job" onClick={() => selectRelativeJob(1)}>›</button>
            </div>
          </article>
        ) : !routeMode && filtered.length === 0 ? (
          <article className="mobile-job-sheet is-empty">
            <div className="sheet-handle" />
            <div className="sheet-topline">
              {statusView === "All" ? <span className="scope-badge">Map</span> : <StatusBadge status={statusView} />}
              <span>{emptyMapScope}</span>
            </div>
            <h2>{emptyMapTitle}</h2>
            <p className="sheet-address">{emptyMapMessage}</p>
            <div className="sheet-actions">
              <button type="button" onClick={resetFilters}><span className="action-nav" />All Boroughs</button>
              <button type="button" onClick={() => setActivePanel("filters")}><span className="action-doc" />Filters</button>
            </div>
          </article>
        ) : null}
        <button
          type="button"
          className="map-tools-handle"
          aria-label={mapToolsOpen ? "Hide map controls" : "Show map controls"}
          aria-expanded={mapToolsOpen}
          onClick={() => setMapToolsOpen((open) => !open)}
          onTouchStart={(event) => { mapToolsTouchY.current = event.touches[0]?.clientY ?? null; }}
          onTouchEnd={(event) => {
            if (mapToolsTouchY.current === null) return;
            const delta = (event.changedTouches[0]?.clientY ?? mapToolsTouchY.current) - mapToolsTouchY.current;
            if (Math.abs(delta) > 20) {
              event.preventDefault();
              setMapToolsOpen(delta < 0);
            }
            mapToolsTouchY.current = null;
          }}
        ><span aria-hidden="true" /></button>
        <nav className="mobile-tabbar" aria-label="Field command navigation">
          <button
            type="button"
            className="is-active"
            onClick={fitVisibleMap}
          >
            <span className="tab-map-icon" aria-hidden="true" />
            <strong>Map</strong>
          </button>
          <button type="button" onClick={() => setActivePanel("jobs")}>
            <span className="tab-list-icon" aria-hidden="true" />
            <strong>Jobs</strong>
          </button>
          <button type="button" className="tab-add-button" aria-label="Open quick actions" onClick={() => setActivePanel("add")}>
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => setActivePanel("notifications")}>
            <span className="tab-alert-icon" aria-hidden="true">
              {alertCount ? <i>{alertCount}</i> : null}
            </span>
            <strong>Alerts</strong>
          </button>
          <button type="button" onClick={() => setActivePanel("account")}>
            <span className="tab-more-icon" aria-hidden="true" />
            <strong>More</strong>
          </button>
        </nav>
      </section>
      {activePanel ? (
        <section className="drawer-layer" role="dialog" aria-modal="true" aria-label={panelTitle}>
          <button type="button" className="drawer-backdrop" aria-label="Close panel" onClick={() => setActivePanel("")} />
          <aside className={activePanel === "map" ? "command-drawer is-map" : "command-drawer"}>
            <header className="drawer-head">
              <div>
                <span>HPD Bid Dashboard</span>
                <h2>{panelTitle}</h2>
              </div>
              <button type="button" aria-label="Close panel" onClick={() => setActivePanel("")}>×</button>
            </header>

            {activePanel === "filters" ? (
              <div className="drawer-stack">
                <label className="drawer-field">
                  <span>Search jobs</span>
                  <input
                    value={query}
                    onChange={(event) => {
                      setSelectedId("");
                      setRouteMode(false);
                      setRouteSkippedIds([]);
                      setActiveRouteIndex(0);
                      setQuery(event.target.value);
                    }}
                    aria-label="Search jobs"
                  />
                </label>
                <div>
                  <h3>Borough</h3>
                  <div className="drawer-chip-grid">
                    <button
                      type="button"
                      className={!borough ? "is-active" : ""}
                      onClick={() => {
                        setSelectedId("");
                        setRouteMode(false);
                        setRouteSkippedIds([]);
                        setActiveRouteIndex(0);
                        setQuery("");
                        setUserLocation(null);
                        setLocationState("idle");
                        setBorough("");
                      }}
                    >
                      All Boroughs
                    </button>
                    {boroughs.map((name) => (
                      <button key={name} type="button" className={borough === name ? "is-active" : ""} onClick={() => selectBorough(name)}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Status</h3>
                  <div className="drawer-chip-grid">
                    {STATUS_FILTERS.map((status) => (
                      <button key={status} type="button" className={statusView === status ? "is-active" : ""} onClick={() => selectStatus(status)}>
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Date Range</h3>
                  <div className="drawer-chip-grid">
                    <label className={dateRange === "custom" ? "drawer-custom-days is-active" : "drawer-custom-days"}>
                      <span>Custom days back</span>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        inputMode="numeric"
                        value={customDays}
                        onFocus={() => selectDateRange("custom")}
                        onChange={(event) => updateCustomDays(event.target.value)}
                      />
                      <strong>{customDateCount} jobs</strong>
                    </label>
                    <button
                      type="button"
                      className={dateRange === "custom" ? "is-active" : ""}
                      onClick={() => applyDaysFilter(false)}
                    >
                      Show {customDays} days ({customDateCount})
                    </button>
                    <button
                      type="button"
                      className={dateRange === "all" ? "is-active" : ""}
                      onClick={() => applyDaysFilter(true)}
                    >
                      All 2026 jobs ({allDateCount})
                    </button>
                    {DAY_PRESETS.map((days) => (
                      <button
                        key={`${days}-drawer-days`}
                        type="button"
                        className={dateRange === "custom" && customDays === days ? "is-active" : ""}
                        onClick={() => applyDaysFilter(false, days)}
                      >
                        {days} days
                      </button>
                    ))}
                  </div>
                </div>
                <div className="drawer-actions">
                  <button type="button" onClick={resetFilters}>Reset filters</button>
                  <button type="button" onClick={() => setActivePanel("")}>Apply filters</button>
                </div>
              </div>
            ) : null}

            {activePanel === "status" ? (
              <div className="drawer-stack">
                <div className="status-picker-list">
                  {mobileStatusStats.map((item) => (
                    <button
                      key={`${item.status}-drawer-status`}
                      type="button"
                      className={statusView === item.status ? "is-active" : ""}
                      onClick={() => {
                        selectStatus(item.status);
                        setActivePanel("");
                      }}
                    >
                      <span>{item.status === "All" ? "All Statuses" : item.status}</span>
                      <strong>{item.count}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activePanel === "days" ? (
              <div className="drawer-stack">
                <label className={dateRange === "custom" ? "drawer-custom-days is-active" : "drawer-custom-days"}>
                  <span>Custom days back</span>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    inputMode="numeric"
                    value={customDays}
                    onFocus={() => selectDateRange("custom")}
                    onChange={(event) => updateCustomDays(event.target.value)}
                  />
                  <strong>{customDateCount} jobs</strong>
                </label>
                <div className="status-picker-list days-picker-list">
                  <button
                    type="button"
                    className={dateRange === "custom" ? "is-active" : ""}
                    onClick={() => {
                      applyDaysFilter(false);
                      setActivePanel("");
                    }}
                  >
                    <span>{customDays} days</span>
                    <strong>{customDateCount}</strong>
                  </button>
                  {dayPresetStats.filter((item) => item.days !== customDays).map((item) => (
                    <button
                      key={`${item.days}-compact-days`}
                      type="button"
                      className={dateRange === "custom" && customDays === item.days ? "is-active" : ""}
                      onClick={() => {
                        applyDaysFilter(false, item.days);
                        setActivePanel("");
                      }}
                    >
                      <span>{item.days} days</span>
                      <strong>{item.count}</strong>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={dateRange === "all" ? "is-active" : ""}
                    onClick={() => {
                      applyDaysFilter(true);
                      setActivePanel("");
                    }}
                  >
                    <span>All 2026 jobs</span>
                    <strong>{allDateCount}</strong>
                  </button>
                </div>
              </div>
            ) : null}

            {activePanel === "notifications" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Filtered</span><strong>{filtered.length}</strong></div>
                  <div><span>Queue</span><strong>{queuedRows.length}</strong></div>
                </div>
                <div className="drawer-list">
                  {activityRows.map((job, index) => (
                    <button
                      key={`${job.id}-notification`}
                      type="button"
                      onClick={() => {
                        setSelectedId(job.id);
                        setActivePanel("");
                      }}
                    >
                      <strong>{job.id}</strong>
                      <span>{job.address || "No address listed"}</span>
                      <small>{activityStamp(job)} · {displayStatus(job)}</small>
                    </button>
                  ))}
                </div>
                <div className="drawer-actions">
                  <button type="button" onClick={() => showTable("live")}>Open live table</button>
                  <button type="button" onClick={() => showTable("queue")}>Open command queue</button>
                </div>
              </div>
            ) : null}

            {activePanel === "jobs" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Visible</span><strong>{filtered.length}</strong></div>
                  <div><span>{dateRangeLabel(dateRange, customDays)}</span><strong>{dateScopedJobs.length}</strong></div>
                </div>
                <div className="drawer-list">
                  {filtered.slice(0, 20).map((job) => (
                    <button
                      key={`${job.id}-mobile-list`}
                      type="button"
                      onClick={() => {
                        setSelectedId(job.id);
                        setActivePanel("");
                      }}
                    >
                      <strong>{job.id}</strong>
                      <span>{job.address || "No address listed"}</span>
                      <small>{job.borough || "NY"} · {formatCurrency(job.amountValue, job.bidAmount)} · {formatJobStartDate(job)}</small>
                    </button>
                  ))}
                </div>
                <div className="drawer-actions">
                  <button type="button" onClick={exportFilteredJobs}>Export visible</button>
                  <button type="button" onClick={resetFilters}>Reset filters</button>
                </div>
              </div>
            ) : null}

            {activePanel === "add" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Selected</span><strong>{selected ? "1" : "0"}</strong></div>
                  <div><span>Saved</span><strong>{savedJobs.length}</strong></div>
                </div>
                <div className="drawer-actions is-grid">
                  <button
                    type="button"
                    onClick={() => {
                      if (!filtered[0]) {
                        notify("No visible jobs to open.");
                        return;
                      }
                      setSelectedId(filtered[0].id);
                      setActivePanel("");
                    }}
                  >
                    Open first visible job
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selected) {
                        notify("Open a job before saving it.");
                        return;
                      }
                      setSavedIds((current) => current.includes(selected.id) ? current : [...current, selected.id]);
                      notify(`${selected.id} saved.`);
                    }}
                  >
                    Save selected job
                  </button>
                  {selected ? (
                    <a href={selectedDetailHref}>Open selected profile</a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!filtered[0]) {
                          notify("No visible job profile to open.");
                          return;
                        }
                        window.location.href = jobDetailHref(filtered[0]);
                      }}
                    >
                      Open first profile
                    </button>
                  )}
                  <a href={exportDataHref} download={exportFileName} onClick={() => notify(`${filtered.length} records exported.`)}>Download visible CSV</a>
                </div>
              </div>
            ) : null}

            {activePanel === "account" ? (
              <div className="drawer-stack">
                <div className="drawer-account">
                  <span className="account-logo">HPD</span>
                  <div>
                    <strong>Project Workspace</strong>
                    <span>Live dashboard data</span>
                    <small>{savedJobs.length} saved jobs · {filtered.length} filtered records · Last fetch {formatSyncTime(syncState.lastSyncAt)}</small>
                  </div>
                </div>
                <div className={`sync-drawer-card is-${syncState.status}`}>
                  <div>
                    <strong>{syncTitle}</strong>
                    <span>{syncMessage}</span>
                    <small>{syncMetaText}</small>
                  </div>
                  <button type="button" onClick={() => syncJobsNow()} disabled={syncState.status === "syncing"}>
                    {syncState.status === "syncing" ? "Fetching" : "Fetch Now"}
                  </button>
                </div>
                <div className="drawer-actions is-grid">
                  <a href="/jobs">Open jobs board</a>
                  {selected ? (
                    <a href={selectedDetailHref}>Open selected job</a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!filtered[0]) {
                          notify("No visible job to open.");
                          return;
                        }
                        window.location.href = jobDetailHref(filtered[0]);
                      }}
                    >
                      Open first visible job
                    </button>
                  )}
                  <a href={exportDataHref} download={exportFileName} onClick={() => notify(`${filtered.length} records exported.`)}>Download CSV</a>
                  <a href="/api/jobs" target="_blank" rel="noreferrer">Open API data</a>
                </div>
              </div>
            ) : null}

            {activePanel === "sync" ? (
              <div className="drawer-stack">
                <div className={`sync-drawer-card is-${syncState.status}`}>
                  <div>
                    <strong>{syncTitle}</strong>
                    <span>{syncMessage}</span>
                    <small>{syncMetaText}</small>
                  </div>
                  <button type="button" onClick={() => syncJobsNow()} disabled={syncState.status === "syncing"}>
                    {syncState.status === "syncing" ? "Fetching" : "Fetch Now"}
                  </button>
                </div>
                <div className="feed-url-card">
                  <label htmlFor="manualFeedUrl">
                    <span>Live feed URL</span>
                    <input
                      id="manualFeedUrl"
                      type="url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={manualFeedUrl}
                      onChange={(event) => updateManualFeedUrl(event.target.value)}
                      placeholder="Paste Google Sheets CSV, Drive file, JSON, or API URL"
                    />
                  </label>
                  <div className="feed-url-actions">
                    <div className="feed-type-toggle" role="group" aria-label="Feed file type">
                      {(["csv", "json"] as ManualFeedType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={manualFeedType === type ? "active" : ""}
                          onClick={() => updateManualFeedType(type)}
                        >
                          {type.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={clearManualFeedUrl} disabled={!manualFeedUrl.trim()}>
                      Clear URL
                    </button>
                  </div>
                </div>
                <div className="data-health-grid" aria-label="Loaded data health">
                  {dataHealthStats.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="data-range-actions" aria-label="Quick date range checks">
                  {healthDateStats.map((item) => (
                    <button key={item.label} type="button" onClick={item.onClick}>
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </button>
                  ))}
                </div>
                <div className="data-status-strip" aria-label="Status counts in current map range">
                  {dataStatusStats.map((item) => (
                    <span key={item.status}>
                      <strong>{item.count}</strong>
                      {item.status}
                    </span>
                  ))}
                </div>
                <div className="data-health-details" aria-label="Data source details">
                  {dataHealthDetails.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className={unmappedJobs.length ? "data-health-note is-warning" : "data-health-note is-good"}>
                  {unmappedJobs.length
                    ? `Missing coordinates: ${unmappedPreview || `${unmappedJobs.length} records`}${unmappedJobs.length > 4 ? "..." : ""}`
                    : "All loaded jobs have map coordinates."}
                </div>
                <div className="drawer-actions is-grid">
                  <a href="/api/jobs" target="_blank" rel="noreferrer">Open jobs API</a>
                  <button type="button" onClick={() => setActivePanel("")}>Back to map</button>
                </div>
              </div>
            ) : null}

            {activePanel === "map" ? (
              <div className="drawer-stack">
                <div className="drawer-map-frame">
                  <JobsMap
                    jobs={filtered}
                    selectedId={selected?.id || ""}
                    onSelect={selectMapJob}
                    focusCenter={mapFocusCenter}
                    focusZoom={mapFocusZoom}
                    focusKey={mapFocusKey}
                    userLocation={userLocation}
                    routeJobs={mapRouteJobs}
                    activeRouteStopId={activeRouteStopId}
                    newAwardIds={newAwardIds}
                    latestAwardIds={latestAwardIds}
                  />
                </div>
                {selected ? (
                  <div className="drawer-selected-job">
                    <StatusBadge status={displayStatus(selected)} />
                    <strong>{selected.id}</strong>
                    <span>{selected.address || "No address listed"}</span>
                    <div className="drawer-actions">
                      <a href={selectedMapsHref} target="_blank" rel="noreferrer">Open in Maps</a>
                      <a href={selectedDetailHref}>Open job details</a>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activePanel === "system" ? (
              <div className="drawer-stack">
                <div className="drawer-stat-grid">
                  <div><span>Loaded jobs</span><strong>{jobs.length}</strong></div>
                  <div><span>{dateRangeLabel(dateRange, customDays)} jobs</span><strong>{dateScopedJobs.length}</strong></div>
                  <div><span>ITB files</span><strong>{itbCount}</strong></div>
                  <div><span>COA awards</span><strong>{coaCount}</strong></div>
                </div>
                <div className="system-checks">
                  <span>Map renderer online</span>
                  <span>CSV data loaded</span>
                  <span>Job image upload API ready</span>
                  <span>Status update API ready</span>
                </div>
                <div className="drawer-actions is-grid">
                  <button type="button" onClick={() => window.location.reload()}>Reload live data</button>
                  <a href="/api/jobs" target="_blank" rel="noreferrer">Open jobs API</a>
                  <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(systemReport)}`} download="hpd-system-status.txt">Download status</a>
                </div>
              </div>
            ) : null}

            {activePanel === "contact" && selected ? (
              <div className="drawer-stack">
                <div className="drawer-selected-job">
                  <StatusBadge status={displayStatus(selected)} />
                  <strong>{selectedTenantName || selected.id}</strong>
                  {selected.tenantPhone ? <span>{selected.tenantPhone}</span> : null}
                  {selectedAddress ? <span>{selectedAddress}</span> : null}
                </div>
                <div className="drawer-actions is-grid">
                  {selectedPhoneHref ? <a href={selectedPhoneHref}>Call now</a> : <a href={selectedDetailHref}>Open contact record</a>}
                  <a href={selectedMapsHref} target="_blank" rel="noreferrer">Navigate to job</a>
                  <a href={selectedDetailHref}>Open job details</a>
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      ) : null}
      {toast ? <div className="command-toast" role="status">{toast}</div> : null}
    </main>
  );
}
