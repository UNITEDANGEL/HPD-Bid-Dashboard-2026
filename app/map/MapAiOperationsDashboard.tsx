"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type BoroughKey = "manhattan" | "bronx" | "brooklyn" | "queens" | "staten-island" | "all";
type PanelTab = "chat" | "results" | "route" | "job";
type PromptStage = "borough" | "priority" | "results" | "route" | "home";
type QueryKind =
  | "active"
  | "no-access"
  | "no-access-near"
  | "appointments"
  | "ready-second"
  | "waiting72"
  | "overdue"
  | "urgent"
  | "closest"
  | "missing-paperwork"
  | "missing-photos";
type FieldAction = "first-attempt" | "second-attempt" | "complete" | "no-access";
type JobInfoKind = "scope" | "access" | "phone" | "appointment" | "paperwork" | "summary";
type JobRecord = Record<string, unknown>;

type RouteStopCard = {
  index: number;
  number: string;
  job: string;
  detail: string;
  active: boolean;
};

type MapStats = {
  visibleJobs: number;
  routeStops: number;
  selectedJob: boolean;
  selectedJobId: string;
  nextStop: string;
  routeSummary: string;
  activeStopIndex: number;
  routeStopCards: RouteStopCard[];
};

type ResultCard = {
  id: string;
  address: string;
  borough: string;
  status: string;
  reason: string;
  distanceMiles?: number;
};

type GeoPoint = { lat: number; lng: number };

type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = { [index: number]: SpeechAlternativeLike; length: number };
type SpeechResultsLike = { [index: number]: SpeechResultLike; length: number };
type SpeechEventLike = { results: SpeechResultsLike };
type SpeechErrorLike = { error?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const BOROUGHS: Array<{ key: BoroughKey; label: string; short: string; aliases: string[] }> = [
  { key: "manhattan", label: "Manhattan", short: "MN", aliases: ["manhattan", "mn", "new york"] },
  { key: "bronx", label: "Bronx", short: "BX", aliases: ["bronx", "bx"] },
  { key: "brooklyn", label: "Brooklyn", short: "BK", aliases: ["brooklyn", "bk", "kings"] },
  { key: "queens", label: "Queens", short: "QN", aliases: ["queens", "qn"] },
  { key: "staten-island", label: "Staten Island", short: "SI", aliases: ["staten island", "staten", "si", "richmond"] },
  { key: "all", label: "All NYC", short: "ALL", aliases: ["all", "all nyc", "any borough", "anywhere", "nyc"] },
];

const ALL_JOBS = bundledJobsData as unknown as JobRecord[];
const NOTES_STORAGE_KEY = "hpd-ai-field-notes-v1";
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes)$/i.test(stringValue(value));
}

function firstValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(job[key]);
    if (value) return value;
  }
  return "";
}

function jobId(job: JobRecord) {
  return firstValue(job, ["OMO", "omo", "jobId", "id"]);
}

function jobAddress(job: JobRecord) {
  return firstValue(job, ["BuildingAddress", "Building_Address", "Address", "address", "location"]);
}

function jobBorough(job: JobRecord) {
  return firstValue(job, ["Borough", "borough", "Boro", "boro"]);
}

function jobStatus(job: JobRecord) {
  return [
    firstValue(job, ["WorkflowStatus"]),
    firstValue(job, ["StatusOverride"]),
    firstValue(job, ["FieldOutcome"]),
    firstValue(job, ["status", "Status", "CurrentStatus", "Outcome"]),
  ]
    .filter(Boolean)
    .join(" · ");
}

function jobDescription(job: JobRecord) {
  return firstValue(job, ["ItbPage3Description", "JobDescription", "Job_Description", "description"]);
}

function jobPhone(job: JobRecord) {
  return firstValue(job, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "phone"]);
}

function jobAppointment(job: JobRecord) {
  return firstValue(job, ["AppointmentAt", "appointmentAt", "AppointmentUpdatedAt", "appointmentUpdatedAt"]);
}

function jobCoords(job: JobRecord): GeoPoint | null {
  const lat = numericValue(job.Latitude ?? job.latitude ?? job.lat);
  const lng = numericValue(job.Longitude ?? job.longitude ?? job.lng ?? job.lon);
  if (!lat || !lng) return null;
  return { lat, lng };
}

function normalizeBorough(value: string): BoroughKey | null {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  for (const option of BOROUGHS) {
    if (option.aliases.some((alias) => normalized === alias || normalized.includes(alias))) return option.key;
  }
  return null;
}

function boroughLabel(key: BoroughKey | null) {
  return BOROUGHS.find((option) => option.key === key)?.label || "this area";
}

function jobMatchesBorough(job: JobRecord, borough: BoroughKey) {
  return borough === "all" || normalizeBorough(jobBorough(job)) === borough;
}

function parseDate(value: unknown): Date | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const fallback = new Date(year, Number(match[1]) - 1, Number(match[2]));
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function firstDate(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const date = parseDate(job[key]);
    if (date) return date;
  }
  return null;
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function distanceMiles(a: GeoPoint, b: GeoPoint) {
  const radius = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function statusOverrideMap() {
  const overrides = new Map<string, JobRecord>();
  if (typeof window === "undefined") return overrides;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) || "";
    if (!/(job|status|override|workflow)/i.test(key)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const record = item as JobRecord;
          const id = jobId(record);
          if (id) overrides.set(id.toUpperCase(), record);
        });
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed as Record<string, unknown>).forEach(([id, value]) => {
          if (value && typeof value === "object") overrides.set(id.toUpperCase(), value as JobRecord);
        });
      }
    } catch {
      // Ignore unrelated browser storage.
    }
  }
  return overrides;
}

function mergedJobs() {
  const overrides = statusOverrideMap();
  return ALL_JOBS.map((job) => {
    const override = overrides.get(jobId(job).toUpperCase());
    return override ? { ...job, ...override } : job;
  });
}

function isClosedJob(job: JobRecord) {
  if (boolValue(job.ArchivedFromMap)) return true;
  if (firstValue(job, ["ActualWorkCompletionDate", "JobFinishedAt", "OutcomeLockedAt"])) return true;
  return /\b(final|completed|complete|archived|closed|cancelled|canceled)\b/i.test(jobStatus(job));
}

function isNoAccessJob(job: JobRecord) {
  if (firstValue(job, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt", "NoAccessSecondAttemptAt", "noAccessSecondAttemptAt"])) return true;
  return /\bno\s*access\b|\baccess\s*refus|\brefus(?:ed|al)\b/i.test(jobStatus(job));
}

function isReadySecondAttempt(job: JobRecord, now = new Date()) {
  const first = firstDate(job, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt"]);
  const second = firstDate(job, ["NoAccessSecondAttemptAt", "noAccessSecondAttemptAt"]);
  const available = firstDate(job, ["SecondAttemptAvailableAt", "secondAttemptAvailableAt"]);
  if (second) return false;
  if (/ready\s*(?:for\s*)?(?:second|2)|ready2/i.test(jobStatus(job))) return true;
  return Boolean(first && available && available.getTime() <= now.getTime());
}

function isWaiting72(job: JobRecord, now = new Date()) {
  const first = firstDate(job, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt"]);
  const second = firstDate(job, ["NoAccessSecondAttemptAt", "noAccessSecondAttemptAt"]);
  const available = firstDate(job, ["SecondAttemptAvailableAt", "secondAttemptAvailableAt"]);
  if (second) return false;
  if (/waiting\s*72|72\s*hour/i.test(jobStatus(job))) return true;
  return Boolean(first && available && available.getTime() > now.getTime());
}

function isAppointmentToday(job: JobRecord, now = new Date()) {
  const appointment = firstDate(job, ["AppointmentAt", "appointmentAt"]);
  return Boolean(appointment && sameLocalDay(appointment, now));
}

function isOverdueJob(job: JobRecord, now = new Date()) {
  const due = firstDate(job, ["dueDate", "DueDate", "bidDueDate", "BidDueDate", "WorkCompletionDate", "workCompletionDate"]);
  return Boolean(due && due.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() && !isClosedJob(job));
}

function isMissingPaperwork(job: JobRecord) {
  const coa = firstValue(job, ["COAFile", "coaFile"]);
  const itb = firstValue(job, ["ITBFile", "itbFile"]);
  const parseStatus = firstValue(job, ["COAParseStatus", "coaParseStatus"]);
  const matchStatus = firstValue(job, ["ITBMatchStatus", "itbMatchStatus"]);
  return !coa || !itb || /missing|review|unmatched|failed|error/i.test(`${parseStatus} ${matchStatus}`);
}

function isMissingPhotos(job: JobRecord) {
  return numericValue(job.BeforePhotoCount) < 1 || numericValue(job.AfterPhotoCount) < 1;
}

function urgencyScore(job: JobRecord, now = new Date()) {
  let score = 0;
  if (isAppointmentToday(job, now)) score += 130;
  if (isReadySecondAttempt(job, now)) score += 115;
  if (isOverdueJob(job, now)) score += 100;
  if (isNoAccessJob(job)) score += 70;
  if (isWaiting72(job, now)) score += 45;
  if (isMissingPaperwork(job)) score += 20;
  const status = jobStatus(job);
  if (/urgent|emergency|priority/i.test(status)) score += 90;
  return score;
}

function queryReason(job: JobRecord, kind: QueryKind, distance?: number) {
  if (kind === "no-access" || kind === "no-access-near") return "No Access";
  if (kind === "appointments") return `Appointment ${jobAppointment(job) || "today"}`;
  if (kind === "ready-second") return "Ready for second attempt";
  if (kind === "waiting72") return "Waiting 72 hours";
  if (kind === "overdue") return "Overdue";
  if (kind === "urgent") return `Urgency score ${urgencyScore(job)}`;
  if (kind === "closest" && distance !== undefined) return `${distance.toFixed(1)} miles away`;
  if (kind === "missing-paperwork") return "Missing or review-required paperwork";
  if (kind === "missing-photos") return "Missing before/after photos";
  return "Active job";
}

function selectedJobIdFromDom() {
  const sources = [
    textOf(document.querySelector(".job-drawer.selected-focus")),
    textOf(document.querySelector(".map-job-brief")),
    (document.querySelector<HTMLInputElement>(".map-face-search input")?.value || "").trim(),
    textOf(document.querySelector(".map-day-route-stop-row.active")),
  ];
  for (const source of sources) {
    const match = source.match(/\b[A-Z]{2}\d{4,7}\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function readMapStats(): MapStats {
  const routeRows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
  const routeStopCards = routeRows.map((row, index) => {
    const main = row.querySelector<HTMLElement>(".map-day-route-stop-main") || row;
    return {
      index,
      number: textOf(main.querySelector("b")) || String(index + 1),
      job: textOf(main.querySelector("span")) || `Stop ${index + 1}`,
      detail: textOf(main.querySelector("small")) || "Address unavailable",
      active: row.classList.contains("active"),
    };
  });
  const activeIndex = routeStopCards.findIndex((stop) => stop.active);
  const safeActiveIndex = routeStopCards.length ? Math.max(0, activeIndex) : -1;
  const activeStop = safeActiveIndex >= 0 ? routeStopCards[safeActiveIndex] : null;
  const routeSummary = textOf(document.querySelector(".map-day-route-selected-summary")) || textOf(document.querySelector(".map-day-route-tray-head"));
  const selectedJobId = selectedJobIdFromDom();
  return {
    visibleJobs: document.querySelectorAll(".maturity-map-marker").length,
    routeStops: routeStopCards.length,
    selectedJob: Boolean(selectedJobId),
    selectedJobId,
    nextStop: activeStop ? `${activeStop.job} · ${activeStop.detail}` : "No stop selected",
    routeSummary: routeSummary || "No active route",
    activeStopIndex: safeActiveIndex,
    routeStopCards,
  };
}

function setNativeTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function visibleButtons(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter((button) => !button.disabled && button.getClientRects().length > 0);
}

function findVisibleButton(root: ParentNode, patterns: RegExp[]) {
  return visibleButtons(root).find((button) => patterns.some((pattern) => pattern.test(textOf(button))));
}

function truncate(value: string, length = 520) {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trim()}…`;
}

export default function MapAiOperationsDashboard() {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<PanelTab>("chat");
  const [promptStage, setPromptStage] = useState<PromptStage>("borough");
  const [selectedBorough, setSelectedBorough] = useState<BoroughKey | null>(null);
  const [lastQuery, setLastQuery] = useState<QueryKind>("active");
  const [pendingQuery, setPendingQuery] = useState<QueryKind | null>(null);
  const [pendingRoute, setPendingRoute] = useState(false);
  const [pendingNote, setPendingNote] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultTitle, setResultTitle] = useState("Results");
  const [resultCards, setResultCards] = useState<ResultCard[]>([]);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [stats, setStats] = useState<MapStats>({
    visibleJobs: 0,
    routeStops: 0,
    selectedJob: false,
    selectedJobId: "",
    nextStop: "No stop selected",
    routeSummary: "No active route",
    activeStopIndex: -1,
    routeStopCards: [],
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: "Good morning. Where should we go today? Choose a borough, or ask me about jobs near you." },
    { id: "welcome-help", role: "assistant", text: "I can plan your day, check No Access, appointments, second attempts, paperwork, photos, routes, and the selected job." },
  ]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const priorRouteCountRef = useRef(0);

  function addAssistant(text: string) {
    setMessages((current) => [...current, { id: `${Date.now()}-${Math.random()}-assistant`, role: "assistant", text }]);
    if (voiceOutput && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  function addUser(text: string) {
    setMessages((current) => [...current, { id: `${Date.now()}-${Math.random()}-user`, role: "user", text }]);
  }

  function refreshStats() {
    const next = readMapStats();
    setStats(next);
    return next;
  }

  function ensurePortalTarget(host: HTMLElement) {
    const target = (document.fullscreenElement as HTMLElement | null) || document.body;
    if (host.parentElement !== target) target.appendChild(host);
  }

  useEffect(() => {
    const host = document.createElement("div");
    host.className = "hpd-ai-portal-host";
    host.setAttribute("data-hpd-ai-operations", "true");
    ensurePortalTarget(host);
    setPortalHost(host);
    const movePortal = () => ensurePortalTarget(host);
    document.addEventListener("fullscreenchange", movePortal);
    const timer = window.setInterval(movePortal, 500);
    return () => {
      document.removeEventListener("fullscreenchange", movePortal);
      window.clearInterval(timer);
      host.remove();
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = refreshStats();
      if (priorRouteCountRef.current === 0 && next.routeStops > 0) {
        setCollapsed(false);
        setTab("route");
        setPromptStage("route");
      }
      priorRouteCountRef.current = next.routeStops;
      if (portalHost) ensurePortalTarget(portalHost);
    };
    sync();
    const interval = window.setInterval(sync, 700);
    return () => window.clearInterval(interval);
  }, [portalHost]);

  useEffect(() => {
    if (!collapsed && tab === "chat") messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, collapsed, tab, promptStage]);

  function chooseBorough(borough: BoroughKey, announce = true) {
    setSelectedBorough(borough);
    setCollapsed(false);
    setTab("chat");
    setPromptStage("priority");
    activateMapBorough(borough);
    if (announce) addUser(boroughLabel(borough));
    const activeCount = mergedJobs().filter((job) => !isClosedJob(job) && jobMatchesBorough(job, borough)).length;
    addAssistant(`${boroughLabel(borough)} selected. I found ${activeCount} active job${activeCount === 1 ? "" : "s"}. What should I prioritize?`);
    const queuedQuery = pendingQuery;
    setPendingQuery(null);
    if (queuedQuery) window.setTimeout(() => void runJobQuery(queuedQuery, borough), 20);
    if (pendingRoute) {
      setPendingRoute(false);
      addAssistant("Choose a priority below, or say “build the route” to use all active jobs.");
    }
  }

  function activateMapBorough(borough: BoroughKey) {
    if (borough === "all") return;
    const option = BOROUGHS.find((item) => item.key === borough);
    if (!option) return;
    const root = document.querySelector(".map-shell") || document;
    const button = visibleButtons(root).find((item) => {
      const text = textOf(item).toLowerCase();
      return text === option.label.toLowerCase() || text === option.short.toLowerCase();
    });
    button?.click();
  }

  function requestAreaThen(query: QueryKind) {
    setPendingQuery(query);
    setPromptStage("borough");
    setTab("chat");
    setCollapsed(false);
    addAssistant("Which borough should I check?");
  }

  async function getLocation() {
    if (currentLocation) return currentLocation;
    if (!navigator.geolocation) {
      addAssistant("Location is not available in this browser.");
      return null;
    }
    return new Promise<GeoPoint | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const point = { lat: position.coords.latitude, lng: position.coords.longitude };
          setCurrentLocation(point);
          resolve(point);
        },
        () => {
          addAssistant("I could not access your location. Allow location permission and try again.");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
      );
    });
  }

  async function runJobQuery(kind: QueryKind, boroughOverride?: BoroughKey | null, limit = 16) {
    const borough = boroughOverride ?? selectedBorough;
    const needsArea = ["active", "no-access", "appointments", "ready-second", "waiting72", "overdue", "urgent"].includes(kind);
    if (needsArea && !borough) {
      requestAreaThen(kind);
      return;
    }

    setBusy(true);
    try {
      const now = new Date();
      let location: GeoPoint | null = null;
      if (kind === "closest" || kind === "no-access-near") {
        location = await getLocation();
        if (!location) return;
      }

      let jobs = mergedJobs().filter((job) => !isClosedJob(job));
      if (borough && borough !== "all" && kind !== "closest" && kind !== "no-access-near") jobs = jobs.filter((job) => jobMatchesBorough(job, borough));

      if (kind === "no-access" || kind === "no-access-near") jobs = jobs.filter(isNoAccessJob);
      if (kind === "appointments") jobs = jobs.filter((job) => isAppointmentToday(job, now));
      if (kind === "ready-second") jobs = jobs.filter((job) => isReadySecondAttempt(job, now));
      if (kind === "waiting72") jobs = jobs.filter((job) => isWaiting72(job, now));
      if (kind === "overdue") jobs = jobs.filter((job) => isOverdueJob(job, now));
      if (kind === "missing-paperwork") jobs = jobs.filter(isMissingPaperwork);
      if (kind === "missing-photos") jobs = jobs.filter(isMissingPhotos);
      if (kind === "urgent") jobs = jobs.filter((job) => urgencyScore(job, now) > 0).sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now));

      const withDistance = jobs.map((job) => ({ job, distance: location && jobCoords(job) ? distanceMiles(location, jobCoords(job) as GeoPoint) : undefined }));
      let ordered = withDistance;
      if (kind === "closest" || kind === "no-access-near") ordered = withDistance.filter((item) => item.distance !== undefined).sort((a, b) => (a.distance || 999) - (b.distance || 999));
      if (kind === "no-access-near") ordered = ordered.filter((item) => (item.distance || 999) <= 8);

      const cards = ordered
        .slice(0, limit)
        .map(({ job, distance }) => ({
          id: jobId(job),
          address: jobAddress(job),
          borough: jobBorough(job) || boroughLabel(borough || "all"),
          status: jobStatus(job) || "Active",
          reason: queryReason(job, kind, distance),
          distanceMiles: distance,
        }))
        .filter((card) => card.id);

      const area = kind === "closest" || kind === "no-access-near" ? "near your current location" : `in ${boroughLabel(borough || "all")}`;
      const labels: Record<QueryKind, string> = {
        active: "Active jobs",
        "no-access": "No Access jobs",
        "no-access-near": "No Access near me",
        appointments: "Appointments today",
        "ready-second": "Ready second attempts",
        waiting72: "Waiting 72 hours",
        overdue: "Overdue jobs",
        urgent: "Urgent jobs",
        closest: "Closest jobs",
        "missing-paperwork": "Missing paperwork",
        "missing-photos": "Missing photos",
      };
      setLastQuery(kind);
      setResultTitle(labels[kind]);
      setResultCards(cards);
      setTab("results");
      setCollapsed(false);
      setPromptStage("results");
      addAssistant(cards.length ? `I found ${cards.length} ${labels[kind].toLowerCase()} ${area}. Tap any job to show it on the map.` : `I did not find any ${labels[kind].toLowerCase()} ${area}.`);
    } finally {
      setBusy(false);
    }
  }

  function showJobOnMap(card: ResultCard) {
    const searchInput = document.querySelector<HTMLInputElement>(".map-face-search input");
    if (!searchInput) {
      addAssistant(`I found ${card.id}, but the map search control is not available.`);
      return;
    }
    setNativeTextValue(searchInput, card.id);
    searchInput.focus();
    window.setTimeout(() => searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })), 70);
    setCollapsed(false);
    addAssistant(`Showing ${card.id} on the map.`);
  }

  function findJobById(id: string) {
    const normalized = id.toUpperCase();
    return mergedJobs().find((job) => jobId(job).toUpperCase() === normalized) || null;
  }

  function selectedJobRecord() {
    return stats.selectedJobId ? findJobById(stats.selectedJobId) : null;
  }

  function showSelectedJob() {
    const selected = selectedJobRecord();
    setCollapsed(false);
    setTab("job");
    if (!selected) addAssistant("Select a job marker or open an OMO first, then ask me about the selected job.");
  }

  function answerSelectedJob(kind: JobInfoKind) {
    const job = selectedJobRecord();
    setCollapsed(false);
    setTab("job");
    if (!job) {
      addAssistant("No job is selected. Tap a marker or tell me an OMO number first.");
      return;
    }
    const id = jobId(job);
    const access = firstValue(job, ["ItbTenantAccessType", "ItbTenantContactStatus", "Location", "location"]);
    const appointmentNeeded = boolValue(job.ItbTenantAppointmentNeeded);
    const coa = firstValue(job, ["COAFile", "coaFile"]);
    const itb = firstValue(job, ["ITBFile", "itbFile"]);
    const coaStatus = firstValue(job, ["COAParseStatus", "coaParseStatus"]);
    const itbStatus = firstValue(job, ["ITBMatchStatus", "itbMatchStatus"]);
    if (kind === "scope") addAssistant(`${id} scope: ${truncate(jobDescription(job) || "No work description is available.")}`);
    if (kind === "access") addAssistant(`${id} access: ${access || "Access type is not listed"}. ${appointmentNeeded ? "A tenant appointment is required." : "No tenant appointment requirement is currently flagged."}`);
    if (kind === "phone") addAssistant(jobPhone(job) ? `${id} contact phone: ${jobPhone(job)}.` : `${id} does not currently have a tenant phone number listed.`);
    if (kind === "appointment") addAssistant(jobAppointment(job) ? `${id} appointment: ${jobAppointment(job)}.` : `${id} has no scheduled appointment listed.`);
    if (kind === "paperwork") addAssistant(`${id} paperwork: COA ${coa ? `available (${coaStatus || "status not listed"})` : "missing"}; ITB ${itb ? `available (${itbStatus || "status not listed"})` : "missing"}.`);
    if (kind === "summary") addAssistant(`${id}: ${jobAddress(job)} · ${jobStatus(job) || "Active"} · ${access || "access not listed"}.`);
  }

  function selectedJobRoot() {
    return document.querySelector<HTMLElement>(".job-drawer.selected-focus") || document.querySelector<HTMLElement>(".map-job-brief");
  }

  async function performFieldAction(action: FieldAction) {
    const root = selectedJobRoot();
    if (!root) {
      addAssistant("Open a job card first so I can perform that field action.");
      return;
    }
    const patterns: Record<FieldAction, RegExp[]> = {
      "first-attempt": [/record.*first.*attempt/i, /first.*attempt/i, /no\s*access/i],
      "second-attempt": [/record.*second.*attempt/i, /second.*attempt/i],
      complete: [/mark.*complete/i, /complete.*job/i, /^completed?$/i],
      "no-access": [/no\s*access/i, /access.*refus/i],
    };
    let button = findVisibleButton(root, patterns[action]);
    if (!button) button = findVisibleButton(document, patterns[action]);
    if (!button) {
      addAssistant("I could not find that action button in the open job card. Open the field actions section and try again.");
      return;
    }
    button.click();
    await wait(180);
    if (action === "first-attempt" || action === "no-access") {
      const followUp = findVisibleButton(document, [/first.*attempt/i, /record.*attempt/i]);
      if (followUp && followUp !== button) followUp.click();
    }
    const labels: Record<FieldAction, string> = {
      "first-attempt": "First No Access attempt recorded.",
      "second-attempt": "Second attempt action selected.",
      complete: "Complete-job action selected.",
      "no-access": "No Access action selected.",
    };
    addAssistant(labels[action]);
    window.setTimeout(refreshStats, 250);
  }

  function saveFallbackNote(jobIdValue: string, note: string) {
    try {
      const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as Record<string, Array<{ at: string; note: string }>>) : {};
      const list = Array.isArray(existing[jobIdValue]) ? existing[jobIdValue] : [];
      existing[jobIdValue] = [...list, { at: new Date().toISOString(), note }];
      window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(existing));
      return true;
    } catch {
      return false;
    }
  }

  async function addFieldNote(noteText?: string) {
    const note = String(noteText || "").trim();
    if (!note) {
      setPendingNote(true);
      setTab("chat");
      addAssistant("What field note should I add? Type or speak the note next.");
      return;
    }
    const id = stats.selectedJobId;
    if (!id) {
      setPendingNote(false);
      addAssistant("Select a job first, then tell me the note.");
      return;
    }
    const root = selectedJobRoot();
    const field = root?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[placeholder*="note" i], input[aria-label*="note" i]');
    if (field) {
      setNativeTextValue(field, note);
      const saveButton = findVisibleButton(root || document, [/save.*note/i, /add.*note/i, /^save$/i]);
      saveButton?.click();
      addAssistant(`Field note added to ${id}.`);
    } else if (saveFallbackNote(id, note)) {
      addAssistant(`Saved the note for ${id} in AI field notes on this device.`);
    } else {
      addAssistant("I could not save the note. Open the job notes section and try again.");
    }
    setPendingNote(false);
  }

  async function addSelectedJobToRoute() {
    const root = selectedJobRoot();
    if (!root) {
      addAssistant("Select a job first, then ask me to add it to the route.");
      return;
    }
    const button = findVisibleButton(root, [/add.*route/i, /route.*add/i]);
    if (!button) {
      addAssistant("The selected job card does not currently show an Add to Route control.");
      return;
    }
    button.click();
    addAssistant(`${stats.selectedJobId || "Selected job"} added to the route.`);
    window.setTimeout(refreshStats, 220);
  }

  async function ensureRouteTrayOpen() {
    const tray = document.querySelector<HTMLElement>(".map-day-route-tray");
    if (tray?.classList.contains("is-hidden")) {
      findVisibleButton(tray, [/show|expand|open/i])?.click();
      await wait(100);
    }
  }

  async function removeRouteStop(position: number) {
    await ensureRouteTrayOpen();
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
    const row = rows[position - 1];
    const remove = row?.querySelector<HTMLButtonElement>(".map-day-route-edit-actions button.remove") || (row ? findVisibleButton(row, [/remove/i]) : undefined);
    if (!remove) {
      addAssistant(`I could not find route stop ${position}.`);
      return;
    }
    const label = textOf(row.querySelector(".map-day-route-stop-main span")) || `stop ${position}`;
    remove.click();
    addAssistant(`Removed ${label} from the route.`);
    window.setTimeout(refreshStats, 220);
  }

  async function moveRouteStopFirst(position: number) {
    await ensureRouteTrayOpen();
    let remaining = position - 1;
    let jobLabel = `stop ${position}`;
    while (remaining > 0) {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
      const row = rows[remaining];
      if (!row) break;
      jobLabel = textOf(row.querySelector(".map-day-route-stop-main span")) || jobLabel;
      const up = row.querySelector<HTMLButtonElement>(".map-day-route-edit-actions button:first-child");
      if (!up || up.disabled) break;
      up.click();
      remaining -= 1;
      await wait(100);
    }
    addAssistant(remaining === 0 ? `Moved ${jobLabel} to the first stop.` : `I could not move that stop all the way to first.`);
    refreshStats();
  }

  function configureAgent(borough: BoroughKey | null, priority: QueryKind, returnToBase: boolean, resultIds: string[] = []) {
    const panel = document.querySelector<HTMLElement>(".map-day-agent-launcher.agent-panel-open");
    if (!panel) return;
    const select = panel.querySelector<HTMLSelectElement>("select");
    if (select && borough) {
      const label = boroughLabel(borough).toLowerCase();
      const option = Array.from(select.options).find((item) => {
        const text = `${item.text} ${item.value}`.toLowerCase();
        return borough === "all" ? /all/.test(text) : text.includes(label) || normalizeBorough(text) === borough;
      });
      if (option) setNativeSelectValue(select, option.value);
    }
    const priorityText: Record<QueryKind, string> = {
      active: "best active jobs",
      "no-access": "active No Access jobs",
      "no-access-near": "No Access jobs closest to my current location",
      appointments: "today's appointments",
      "ready-second": "jobs ready for a second attempt",
      waiting72: "jobs waiting for the 72-hour window",
      overdue: "overdue jobs",
      urgent: "the most urgent jobs",
      closest: "jobs closest to my current location",
      "missing-paperwork": "jobs needing paperwork attention",
      "missing-photos": "jobs missing required photos",
    };
    const commandInput = panel.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
    if (commandInput) {
      const ids = resultIds.length ? ` Use these jobs first when possible: ${resultIds.slice(0, 6).join(", ")}.` : "";
      setNativeTextValue(commandInput, `Build a route in ${boroughLabel(borough || "all")} prioritizing ${priorityText[priority]}.${ids}${returnToBase ? " Return to base at the end." : ""}`);
    }
    const checkbox = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((item) => /return|base/i.test(textOf(item.closest("label")) || textOf(item.parentElement)));
    if (checkbox && checkbox.checked !== returnToBase) checkbox.click();
  }

  async function openAgent() {
    setCollapsed(false);
    let panel = document.querySelector<HTMLElement>(".map-day-agent-launcher.agent-panel-open");
    if (!panel) {
      const root = document.querySelector(".map-shell") || document;
      const button = document.querySelector<HTMLButtonElement>(".map-agent-top-button") || findVisibleButton(root, [/agent/i]);
      if (!button) {
        addAssistant("I could not find the Agent control on this map view.");
        return false;
      }
      button.click();
      await wait(180);
      panel = document.querySelector<HTMLElement>(".map-day-agent-launcher.agent-panel-open");
    }
    addAssistant("Agent tools are open. The AI dashboard will remain visible.");
    return Boolean(panel);
  }

  async function startRoute(returnToBase = true) {
    if (!selectedBorough) {
      setPendingRoute(true);
      setPromptStage("borough");
      setTab("chat");
      addAssistant("Which borough should I use for today’s route?");
      return;
    }
    setBusy(true);
    setCollapsed(false);
    setTab("route");
    setPromptStage("route");
    try {
      const opened = await openAgent();
      if (!opened) return;
      configureAgent(selectedBorough, lastQuery, returnToBase, resultCards.map((card) => card.id));
      const panel = document.querySelector<HTMLElement>(".map-day-agent-launcher.agent-panel-open") || document;
      const start = findVisibleButton(panel, [/^start$/i, /start.*route/i, /^route$/i]);
      if (!start) {
        addAssistant("Agent is ready. Tap its Start button to build the route.");
        return;
      }
      start.click();
      addAssistant(`Building the ${boroughLabel(selectedBorough)} route${returnToBase ? " with return to base" : ""}. I will stay open.`);
      await wait(1200);
      setCollapsed(false);
      setTab("route");
      refreshStats();
      if (portalHost) ensurePortalTarget(portalHost);
    } finally {
      setBusy(false);
    }
  }

  async function clearRoute() {
    setBusy(true);
    setCollapsed(false);
    setTab("route");
    try {
      await ensureRouteTrayOpen();
      let removed = 0;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const remove = document.querySelector<HTMLButtonElement>(".map-day-route-edit-actions button.remove");
        if (!remove) break;
        remove.click();
        removed += 1;
        await wait(80);
      }
      refreshStats();
      addAssistant(removed ? `Route cleared. Removed ${removed} stop${removed === 1 ? "" : "s"}.` : "There is no active route to clear.");
    } finally {
      setBusy(false);
    }
  }

  async function showRoute() {
    setCollapsed(false);
    setTab("route");
    await ensureRouteTrayOpen();
    addAssistant(stats.routeStops ? "The active route is expanded on the map." : "There is no active route yet.");
  }

  function focusRouteStop(index: number) {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".map-day-route-stop-row"));
    const row = rows[index];
    const button = row?.querySelector<HTMLButtonElement>(".map-day-route-stop-main") || row?.querySelector<HTMLButtonElement>("button");
    if (!button) {
      addAssistant("That route stop is not available.");
      return;
    }
    setCollapsed(false);
    setTab("route");
    button.click();
    window.setTimeout(refreshStats, 120);
  }

  function summarizeMap() {
    const current = refreshStats();
    setTab("chat");
    setCollapsed(false);
    addAssistant(`Map summary: ${current.visibleJobs} visible jobs, ${current.routeStops ? `${current.routeStops} route stops` : "no active route"}, and ${current.selectedJobId ? `${current.selectedJobId} selected` : "no selected job"}.`);
  }

  function mostUrgentBorough() {
    const now = new Date();
    const active = mergedJobs().filter((job) => !isClosedJob(job));
    const ranking = BOROUGHS.filter((borough) => borough.key !== "all")
      .map((borough) => {
        const jobs = active.filter((job) => jobMatchesBorough(job, borough.key));
        return { borough, score: jobs.reduce((sum, job) => sum + urgencyScore(job, now), 0), urgent: jobs.filter((job) => urgencyScore(job, now) > 0).length };
      })
      .sort((a, b) => b.score - a.score);
    const top = ranking[0];
    if (!top || !top.score) {
      addAssistant("I do not see a borough with a strong urgent-job signal right now.");
      return;
    }
    setSelectedBorough(top.borough.key);
    activateMapBorough(top.borough.key);
    addAssistant(`${top.borough.label} has the highest urgency score, with ${top.urgent} jobs carrying urgent indicators. I selected ${top.borough.label}.`);
    void runJobQuery("urgent", top.borough.key, 6);
  }

  function activeCountForArea(borough: BoroughKey) {
    const count = mergedJobs().filter((job) => !isClosedJob(job) && jobMatchesBorough(job, borough)).length;
    setSelectedBorough(borough);
    activateMapBorough(borough);
    addAssistant(`${boroughLabel(borough)} has ${count} active job${count === 1 ? "" : "s"}.`);
  }

  function startListening() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      addAssistant("Voice input is not supported in this browser. Chrome or Edge usually works best.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim() || "";
      if (transcript) {
        setInput(transcript);
        void runCommand(transcript);
      }
    };
    recognition.onerror = (event) => addAssistant(`Voice input stopped${event.error ? `: ${event.error}` : "."}`);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function runCommand(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    setCollapsed(false);
    setTab("chat");
    addUser(text);
    setInput("");
    const normalized = text.toLowerCase();
    const boroughInText = normalizeBorough(normalized);
    const omoMatch = text.match(/\b[A-Z]{2}\d{4,7}\b/i);

    if (pendingNote) {
      await addFieldNote(text);
      return;
    }

    if (/good morning|where should we go|choose (?:a )?borough|which boro/.test(normalized)) {
      setPromptStage("borough");
      addAssistant("Good morning. Where should we go today?");
      return;
    }

    if (/which borough.*urgent|most urgent borough|where.*most urgent/.test(normalized)) {
      mostUrgentBorough();
      return;
    }

    if (/(mark|record|set).*(no\s*access|first attempt)|record first attempt/.test(normalized)) return performFieldAction("first-attempt");
    if (/(mark|record|set).*(second attempt)|record second attempt/.test(normalized)) return performFieldAction("second-attempt");
    if (/(mark|set).*(complete|completed)|complete this job/.test(normalized)) return performFieldAction("complete");
    if (/add (?:a )?(?:field )?note|save (?:a )?note/.test(normalized)) {
      const note = text.replace(/^.*?(?:add|save)\s+(?:a\s+)?(?:field\s+)?note\s*[:\-]?\s*/i, "").trim();
      return addFieldNote(note);
    }

    if (/add (?:this|selected) job.*route|add to route/.test(normalized)) return addSelectedJobToRoute();
    const removeStopMatch = normalized.match(/remove\s+(?:route\s+)?stop\s+(\d+)/);
    if (removeStopMatch) return removeRouteStop(Number(removeStopMatch[1]));
    const moveStopMatch = normalized.match(/move\s+(?:route\s+)?stop\s+(\d+).*first/);
    if (moveStopMatch) return moveRouteStopFirst(Number(moveStopMatch[1]));

    if (/clear|cancel/.test(normalized) && /route|stops?/.test(normalized)) return clearRoute();
    if (/show|open|expand/.test(normalized) && /route/.test(normalized)) return showRoute();
    if (/next/.test(normalized) && /stop|job|route/.test(normalized)) return focusRouteStop(stats.activeStopIndex >= 0 ? stats.activeStopIndex : 0);
    if (/start|build|make|optimi[sz]e/.test(normalized) && /route|day|today/.test(normalized)) return startRoute(/return.*base|back.*base/.test(normalized) || !/do not return|no return/.test(normalized));

    if (omoMatch && /open|show|find|map/.test(normalized)) {
      const job = findJobById(omoMatch[0]);
      if (!job) addAssistant(`I could not find ${omoMatch[0].toUpperCase()} in the current project data.`);
      else showJobOnMap({ id: jobId(job), address: jobAddress(job), borough: jobBorough(job), status: jobStatus(job), reason: "Requested OMO" });
      return;
    }

    if (/what work|work required|scope of work|job description/.test(normalized)) return answerSelectedJob("scope");
    if (/tenant access|need.*access|appointment needed/.test(normalized)) return answerSelectedJob("access");
    if (/phone number|tenant phone|contact number/.test(normalized)) return answerSelectedJob("phone");
    if (/appointment info|appointment information|appointment for (?:this|selected) job/.test(normalized)) return answerSelectedJob("appointment");
    if (/paperwork status|paperwork for (?:this|selected) job|coa.*itb/.test(normalized)) return answerSelectedJob("paperwork");
    if (/selected job|this job|job summary/.test(normalized)) {
      showSelectedJob();
      answerSelectedJob("summary");
      return;
    }

    if (/no\s*access.*near me|near me.*no\s*access/.test(normalized)) return runJobQuery("no-access-near", null);
    if (/no\s*access|access refused|refused access/.test(normalized)) return runJobQuery("no-access", boroughInText || selectedBorough);
    if (/ready.*second|second attempt.*ready|ready2/.test(normalized)) return runJobQuery("ready-second", boroughInText || selectedBorough);
    if (/waiting.*72|72.*hour/.test(normalized)) return runJobQuery("waiting72", boroughInText || selectedBorough);
    if (/appointments? today|today.*appointments?/.test(normalized)) return runJobQuery("appointments", boroughInText || selectedBorough);
    if (/overdue/.test(normalized)) return runJobQuery("overdue", boroughInText || selectedBorough);
    if (/missing.*paperwork|paperwork missing|needs paperwork/.test(normalized)) return runJobQuery("missing-paperwork", boroughInText || selectedBorough || "all");
    if (/missing.*photos?|photos?.*missing|needs photos?/.test(normalized)) return runJobQuery("missing-photos", boroughInText || selectedBorough || "all");
    if (/closest|near me|nearby/.test(normalized)) return runJobQuery("closest", null);
    if (/best\s*6|best six|most urgent|urgent jobs?|priority jobs?/.test(normalized)) return runJobQuery("urgent", boroughInText || selectedBorough, 6);
    if (/all active|active jobs?/.test(normalized) && !/how many/.test(normalized)) return runJobQuery("active", boroughInText || selectedBorough);

    if (/how many.*active/.test(normalized)) {
      if (!boroughInText && !selectedBorough) return requestAreaThen("active");
      activeCountForArea(boroughInText || (selectedBorough as BoroughKey));
      return;
    }

    if (boroughInText) {
      chooseBorough(boroughInText, false);
      return;
    }

    if (/plan my day|where should i go|best jobs today/.test(normalized)) {
      if (!selectedBorough) {
        setPendingQuery("urgent");
        setPromptStage("borough");
        addAssistant("Choose a borough and I will show the best jobs for today.");
      } else {
        void runJobQuery("urgent", selectedBorough, 6);
      }
      return;
    }

    if (/open agent|agent tools/.test(normalized)) return openAgent();
    if (/map summary|summarize map|status of map/.test(normalized)) return summarizeMap();
    if (/show jobs|show results/.test(normalized)) {
      setTab("results");
      return;
    }

    addAssistant("I can plan your day, search job statuses, manage the route, explain the selected job, record field actions, add notes, and respond to voice commands. Use the prompt buttons below or ask naturally.");
    setPromptStage("home");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCommand(input);
  }

  const routeLabel = useMemo(() => (stats.routeStops ? `${stats.routeStops} stop${stats.routeStops === 1 ? "" : "s"}` : "No route"), [stats.routeStops]);
  const selectedJob = selectedJobRecord();
  const selectedAccess = selectedJob ? firstValue(selectedJob, ["ItbTenantAccessType", "ItbTenantContactStatus", "Location", "location"]) : "";
  const selectedPaperwork = selectedJob
    ? `${firstValue(selectedJob, ["COAFile", "coaFile"]) ? "COA ready" : "COA missing"} · ${firstValue(selectedJob, ["ITBFile", "itbFile"]) ? "ITB ready" : "ITB missing"}`
    : "";

  const promptButtons = (
    <div className="hpd-ai-followups">
      {promptStage === "borough" ? BOROUGHS.map((option) => (
        <button type="button" key={option.key} className={selectedBorough === option.key ? "active" : ""} onClick={() => chooseBorough(option.key)}>
          <b>{option.short}</b><span>{option.label}</span>
        </button>
      )) : null}
      {promptStage === "priority" ? (
        <>
          <button type="button" onClick={() => void runJobQuery("no-access", selectedBorough)}>No Access</button>
          <button type="button" onClick={() => void runJobQuery("appointments", selectedBorough)}>Appointments</button>
          <button type="button" onClick={() => void runJobQuery("urgent", selectedBorough, 6)}>Urgent</button>
          <button type="button" onClick={() => void runJobQuery("closest", null)}>Closest</button>
          <button type="button" onClick={() => void runJobQuery("active", selectedBorough)}>All Active</button>
        </>
      ) : null}
      {promptStage === "results" ? (
        <>
          <button type="button" onClick={() => void startRoute(true)}>Build route</button>
          <button type="button" onClick={() => resultCards[0] && showJobOnMap(resultCards[0])} disabled={!resultCards.length}>Show first job</button>
          <button type="button" onClick={() => setPromptStage("borough")}>Change borough</button>
          <button type="button" onClick={() => setPromptStage("home")}>More questions</button>
        </>
      ) : null}
      {promptStage === "route" ? (
        <>
          <button type="button" onClick={() => focusRouteStop(stats.activeStopIndex >= 0 ? stats.activeStopIndex : 0)} disabled={!stats.routeStops}>Next stop</button>
          <button type="button" onClick={() => void showRoute()} disabled={!stats.routeStops}>Show route</button>
          <button type="button" onClick={() => void clearRoute()} disabled={!stats.routeStops}>Clear route</button>
          <button type="button" onClick={() => setTab("chat")}>Ask AI</button>
        </>
      ) : null}
      {promptStage === "home" ? (
        <>
          <button type="button" onClick={() => setPromptStage("borough")}>Plan my day</button>
          <button type="button" onClick={() => void runJobQuery("no-access", selectedBorough)}>No Access</button>
          <button type="button" onClick={() => void runJobQuery("appointments", selectedBorough)}>Appointments</button>
          <button type="button" onClick={showSelectedJob}>Selected job</button>
        </>
      ) : null}
    </div>
  );

  const dashboard = (
    <>
      {collapsed ? (
        <button type="button" className="hpd-ai-rail" onClick={() => setCollapsed(false)} aria-label="Open HPD AI dashboard">
          <span className="hpd-ai-live-dot" /><strong>AI</strong><small>{stats.routeStops || stats.visibleJobs}</small><span>Open</span>
        </button>
      ) : (
        <aside className="hpd-ai-center" aria-label="HPD AI operations dashboard">
          <header className="hpd-ai-header">
            <div className="hpd-ai-brand"><span className="hpd-ai-live-dot" /><div><strong>HPD AI Dispatcher</strong><small>{selectedBorough ? `${boroughLabel(selectedBorough)} · operational` : "Online · choose an area"}</small></div></div>
            <div className="hpd-ai-header-actions">
              <span className={`hpd-ai-route-pill ${stats.routeStops ? "live" : ""}`}>{stats.routeStops ? `${stats.routeStops} stops` : "No route"}</span>
              <button type="button" onClick={() => setVoiceOutput((value) => !value)} aria-pressed={voiceOutput}>{voiceOutput ? "Speaker on" : "Speaker"}</button>
              <button type="button" onClick={() => setCollapsed(true)}>Collapse</button>
            </div>
          </header>

          <section className="hpd-ai-kpis">
            <article><span>Visible</span><b>{stats.visibleJobs}</b><small>map jobs</small></article>
            <article><span>Route</span><b>{stats.routeStops}</b><small>stops</small></article>
            <article><span>Selected</span><b>{stats.selectedJobId || "—"}</b><small>job</small></article>
          </section>

          <nav className="hpd-ai-tabs">
            <button type="button" className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Chat</button>
            <button type="button" className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}>Results <span>{resultCards.length || ""}</span></button>
            <button type="button" className={tab === "route" ? "active" : ""} onClick={() => setTab("route")}>Route</button>
            <button type="button" className={tab === "job" ? "active" : ""} onClick={showSelectedJob}>Job</button>
          </nav>

          <div className="hpd-ai-quick-strip" aria-label="AI quick prompts">
            <button type="button" onClick={() => void runCommand("Plan my day")}>Plan My Day</button>
            <button type="button" onClick={() => void runCommand("Any No Access in this area?")}>No Access</button>
            <button type="button" onClick={() => void runCommand("Show appointments today")}>Appointments</button>
            <button type="button" onClick={() => void runCommand("Show jobs near me")}>Near Me</button>
            <button type="button" onClick={() => void runCommand("Show urgent jobs")}>Urgent</button>
            <button type="button" onClick={() => void runCommand("Show jobs ready for second attempt")}>2nd Attempts</button>
            <button type="button" onClick={() => void runCommand("Show jobs missing paperwork")}>Paperwork</button>
            <button type="button" onClick={showSelectedJob}>Selected Job</button>
          </div>

          <div className="hpd-ai-body">
            {tab === "chat" ? (
              <section className="hpd-ai-chat-panel">
                <div className="hpd-ai-messages" aria-live="polite">
                  {messages.slice(-18).map((message) => <p key={message.id} className={`hpd-ai-message ${message.role}`}>{message.text}</p>)}
                  {promptButtons}
                  <div ref={messageEndRef} />
                </div>
              </section>
            ) : null}

            {tab === "results" ? (
              <section className="hpd-ai-results-panel">
                <div className="hpd-ai-section-head"><div><span>AI Results</span><strong>{resultTitle}</strong></div><b>{resultCards.length}</b></div>
                {resultCards.length ? (
                  <div className="hpd-ai-result-list">
                    {resultCards.map((card, index) => (
                      <button type="button" key={`${card.id}-${index}`} onClick={() => showJobOnMap(card)}>
                        <b>{index + 1}</b><span><strong>{card.id}</strong><small>{card.address || card.borough}</small><em>{card.reason}</em></span><i>Map</i>
                      </button>
                    ))}
                  </div>
                ) : <p className="hpd-ai-empty">Ask a status question to populate results.</p>}
                <div className="hpd-ai-result-actions"><button type="button" className="primary" onClick={() => void startRoute(true)} disabled={!resultCards.length}>Build route</button><button type="button" onClick={() => setTab("chat")}>Ask another</button></div>
              </section>
            ) : null}

            {tab === "route" ? (
              <section className="hpd-ai-route-panel">
                <div className="hpd-ai-route-card"><div><span className={stats.routeStops ? "live" : ""}>{stats.routeStops ? "Route active" : "Route not started"}</span><b>{routeLabel}</b></div><p>{stats.routeSummary}</p></div>
                <div className="hpd-ai-next-card"><span>Next stop</span><strong>{stats.nextStop}</strong><button type="button" onClick={() => focusRouteStop(stats.activeStopIndex >= 0 ? stats.activeStopIndex : 0)} disabled={!stats.routeStops}>Focus</button></div>
                {stats.routeStopCards.length ? <ol className="hpd-ai-route-list">{stats.routeStopCards.map((stop) => <li key={`${stop.job}-${stop.index}`}><button type="button" className={stop.active ? "active" : ""} onClick={() => focusRouteStop(stop.index)}><b>{stop.number}</b><span><strong>{stop.job}</strong><small>{stop.detail}</small></span></button></li>)}</ol> : null}
                <div className="hpd-ai-route-actions"><button type="button" className="primary" onClick={() => void startRoute(true)} disabled={busy}>Start / rebuild</button><button type="button" onClick={() => void showRoute()} disabled={!stats.routeStops}>Show route</button><button type="button" className="danger" onClick={() => void clearRoute()} disabled={!stats.routeStops}>Clear</button></div>
              </section>
            ) : null}

            {tab === "job" ? (
              <section className="hpd-ai-job-panel">
                {selectedJob ? (
                  <>
                    <div className="hpd-ai-selected-head"><div><span>Selected job</span><strong>{jobId(selectedJob)}</strong><small>{jobAddress(selectedJob)}</small></div><b>{jobStatus(selectedJob) || "Active"}</b></div>
                    <div className="hpd-ai-job-grid"><article><span>Access</span><p>{selectedAccess || "Not listed"}</p></article><article><span>Phone</span><p>{jobPhone(selectedJob) || "Not listed"}</p></article><article><span>Appointment</span><p>{jobAppointment(selectedJob) || "None scheduled"}</p></article><article><span>Paperwork</span><p>{selectedPaperwork}</p></article></div>
                    <article className="hpd-ai-scope-card"><span>Work required</span><p>{truncate(jobDescription(selectedJob) || "No description available.", 650)}</p></article>
                    <div className="hpd-ai-job-info-actions"><button type="button" onClick={() => answerSelectedJob("scope")}>Scope</button><button type="button" onClick={() => answerSelectedJob("access")}>Access</button><button type="button" onClick={() => answerSelectedJob("phone")}>Phone</button><button type="button" onClick={() => answerSelectedJob("paperwork")}>Paperwork</button></div>
                    <div className="hpd-ai-field-actions"><button type="button" onClick={() => void performFieldAction("first-attempt")}>1st No Access</button><button type="button" onClick={() => void performFieldAction("second-attempt")}>2nd Attempt</button><button type="button" onClick={() => void performFieldAction("complete")}>Complete</button><button type="button" onClick={() => void addSelectedJobToRoute()}>Add Route</button><button type="button" onClick={() => void addFieldNote()}>Add Note</button></div>
                  </>
                ) : <div className="hpd-ai-empty"><strong>No job selected</strong><p>Tap a map marker or open an OMO, then return here.</p></div>}
              </section>
            ) : null}
          </div>

          <form className="hpd-ai-composer" onSubmit={submit}>
            <button type="button" className={`hpd-ai-mic ${listening ? "listening" : ""}`} onClick={startListening} aria-label={listening ? "Stop listening" : "Speak to AI"}>{listening ? "■" : "🎤"}</button>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={pendingNote ? "Say or type the field note…" : "Ask HPD AI anything about this map…"} aria-label="Ask HPD AI" />
            <button type="submit" className="send" disabled={busy || !input.trim()}>Send</button>
          </form>
        </aside>
      )}
    </>
  );

  return portalHost ? createPortal(dashboard, portalHost) : null;
}
