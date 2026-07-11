"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type JobRecord = Record<string, unknown>;
type BoroughKey = "manhattan" | "bronx" | "brooklyn" | "queens" | "staten-island" | "all";
type PriorityKey = "highest" | "nearby" | "urgent" | "appointments" | "no-access" | "ready-second";
type WorkflowStage =
  | "plan"
  | "recommended"
  | "route"
  | "enroute"
  | "access"
  | "before_media"
  | "working"
  | "after_media"
  | "outcome"
  | "closeout"
  | "complete";
type OutcomeKey = "completed" | "partial" | "no_access" | "refused" | "completed_by_others";
type GeoPoint = { lat: number; lng: number };
type Job = {
  id: string;
  address: string;
  borough: BoroughKey | null;
  boroughLabel: string;
  status: string;
  description: string;
  access: string;
  phone: string;
  appointment: string;
  coords: GeoPoint | null;
  raw: JobRecord;
};
type Estimate = { roadMiles: number; driveMinutes: number; eta: Date };
type SavedWorkflow = {
  stage?: WorkflowStage;
  borough?: BoroughKey;
  priority?: PriorityKey;
  resultIds?: string[];
  selectedIndex?: number;
  routeIds?: string[];
  routeIndex?: number;
  activeJobId?: string;
  outcome?: OutcomeKey | null;
  beforeDone?: boolean;
  afterDone?: boolean;
  invoiceReviewed?: boolean;
  affidavitReviewed?: boolean;
  packageReady?: boolean;
  completedJobId?: string;
};

const STORAGE_KEY = "hpd-unified-workflow-v1";
const BASE_POINT: GeoPoint = { lat: 40.6957, lng: -73.8331 };
const BASE_LABEL = "Richmond Hill base";
const MAX_RESULTS = 30;
const MAX_ROUTE_STOPS = 6;

const BOROUGHS: Array<{ key: BoroughKey; label: string; aliases: string[] }> = [
  { key: "manhattan", label: "Manhattan", aliases: ["manhattan", "mn", "new york"] },
  { key: "bronx", label: "Bronx", aliases: ["bronx", "bx"] },
  { key: "brooklyn", label: "Brooklyn", aliases: ["brooklyn", "bk", "kings"] },
  { key: "queens", label: "Queens", aliases: ["queens", "qn"] },
  { key: "staten-island", label: "Staten Island", aliases: ["staten island", "staten", "si", "richmond"] },
  { key: "all", label: "All NYC", aliases: ["all", "all nyc", "nyc"] },
];

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function normalizeBorough(value: string): BoroughKey | null {
  const clean = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  for (const option of BOROUGHS) {
    if (option.key === "all") continue;
    if (option.aliases.some((alias) => clean === alias || clean.includes(alias))) return option.key;
  }
  return null;
}

function boroughLabel(key: BoroughKey | null) {
  return BOROUGHS.find((option) => option.key === key)?.label || "Unknown";
}

function parseDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toJob(raw: JobRecord): Job | null {
  const id = firstValue(raw, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  if (!id) return null;
  const lat = numericValue(raw.Latitude ?? raw.latitude ?? raw.lat);
  const lng = numericValue(raw.Longitude ?? raw.longitude ?? raw.lng ?? raw.lon);
  const borough = normalizeBorough(firstValue(raw, ["Borough", "borough", "Boro", "boro"]));
  return {
    id,
    address: firstValue(raw, ["BuildingAddress", "Building_Address", "Address", "address", "location"]),
    borough,
    boroughLabel: boroughLabel(borough),
    status: [
      firstValue(raw, ["WorkflowStatus"]),
      firstValue(raw, ["StatusOverride"]),
      firstValue(raw, ["FieldOutcome"]),
      firstValue(raw, ["status", "Status", "CurrentStatus", "Outcome"]),
    ].filter(Boolean).join(" · "),
    description: firstValue(raw, ["ItbPage3Description", "JobDescription", "Job_Description", "description"]),
    access: firstValue(raw, ["ItbTenantAccessType", "ItbTenantContactStatus", "AccessType", "access"]),
    phone: firstValue(raw, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "phone"]),
    appointment: firstValue(raw, ["AppointmentAt", "appointmentAt", "AppointmentUpdatedAt"]),
    coords: lat && lng ? { lat, lng } : null,
    raw,
  };
}

const BASE_JOBS = (bundledJobsData as JobRecord[]).map(toJob).filter((job): job is Job => Boolean(job));

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, length: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "Not listed";
  return clean.length <= length ? clean : `${clean.slice(0, length).trim()}…`;
}

function distanceMiles(a: GeoPoint, b: GeoPoint) {
  const radius = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function estimateTrip(origin: GeoPoint, destination: GeoPoint | null, now = new Date()): Estimate | null {
  if (!destination) return null;
  const straight = distanceMiles(origin, destination);
  const roadMiles = Math.max(0.3, straight * 1.27);
  const averageMph = roadMiles < 3 ? 13 : roadMiles < 9 ? 16 : 20;
  const driveMinutes = Math.max(5, Math.round((roadMiles / averageMph) * 60 + 4));
  return { roadMiles, driveMinutes, eta: new Date(now.getTime() + driveMinutes * 60_000) };
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
}

function isClosed(job: Job) {
  if (boolValue(job.raw.ArchivedFromMap)) return true;
  if (firstValue(job.raw, ["ActualWorkCompletionDate", "JobFinishedAt", "OutcomeLockedAt"])) return true;
  return /\b(final|completed|complete|archived|closed|cancelled|canceled)\b/i.test(job.status);
}

function isNoAccess(job: Job) {
  if (firstValue(job.raw, ["NoAccessFirstAttemptAt", "noAccessFirstAttemptAt", "NoAccessSecondAttemptAt", "noAccessSecondAttemptAt"])) return true;
  return /\bno\s*access\b|access\s*refus|refus(?:ed|al)/i.test(job.status);
}

function readySecond(job: Job, now = new Date()) {
  const first = parseDate(job.raw.NoAccessFirstAttemptAt ?? job.raw.noAccessFirstAttemptAt);
  const second = parseDate(job.raw.NoAccessSecondAttemptAt ?? job.raw.noAccessSecondAttemptAt);
  const available = parseDate(job.raw.SecondAttemptAvailableAt ?? job.raw.secondAttemptAvailableAt);
  if (second) return false;
  if (/ready\s*(?:for\s*)?(?:second|2)|ready2/i.test(job.status)) return true;
  return Boolean(first && available && available.getTime() <= now.getTime());
}

function appointmentToday(job: Job, now = new Date()) {
  const appointment = parseDate(job.appointment);
  return Boolean(appointment && sameDay(appointment, now));
}

function overdue(job: Job, now = new Date()) {
  const due = parseDate(job.raw.dueDate ?? job.raw.DueDate ?? job.raw.WorkCompletionDate ?? job.raw.workCompletionDate);
  return Boolean(due && due.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() && !isClosed(job));
}

function urgency(job: Job, now = new Date()) {
  let score = 0;
  if (appointmentToday(job, now)) score += 150;
  if (readySecond(job, now)) score += 135;
  if (overdue(job, now)) score += 110;
  if (isNoAccess(job)) score += 75;
  if (/urgent|emergency|priority/i.test(job.status)) score += 100;
  if (numericValue(job.raw.BeforePhotoCount) < 1 || numericValue(job.raw.AfterPhotoCount) < 1) score += 10;
  return score;
}

function recommendationReason(job: Job, priority: PriorityKey) {
  if (appointmentToday(job)) return "Appointment scheduled today";
  if (readySecond(job)) return "Ready for the required second access attempt";
  if (overdue(job)) return "Overdue active job";
  if (/urgent|emergency|priority/i.test(job.status)) return "Urgent or priority status";
  if (isNoAccess(job)) return "No Access follow-up needs attention";
  if (priority === "nearby") return "Closest active job from your current origin";
  return "Best operational priority based on status, access, and timing";
}

function statusOverrides() {
  const overrides = new Map<string, JobRecord>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) || "";
    if (!/(job|status|override|workflow)/i.test(key) || key === STORAGE_KEY) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const record = item as JobRecord;
          const id = firstValue(record, ["OMO", "omo", "jobId", "id"]).toUpperCase();
          if (id) overrides.set(id, record);
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (value && typeof value === "object") overrides.set(id.toUpperCase(), value as JobRecord);
        }
      }
    } catch {
      // Ignore unrelated browser storage.
    }
  }
  return overrides;
}

function mergedBrowserJobs() {
  const overrides = statusOverrides();
  return BASE_JOBS.map((job) => {
    const override = overrides.get(job.id);
    return override ? toJob({ ...job.raw, ...override }) || job : job;
  });
}

function setNativeValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function visibleButtons(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter((button) => !button.disabled && button.getClientRects().length > 0);
}

function clickMatching(root: ParentNode, patterns: RegExp[]) {
  const button = visibleButtons(root).find((candidate) => patterns.some((pattern) => pattern.test(textOf(candidate))));
  button?.click();
  return Boolean(button);
}

function closeExistingJobCard() {
  const drawer = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
  if (!drawer) return false;
  return clickMatching(drawer, [/^close$/i, /close.*job/i, /close.*details/i, /^×$/]);
}

function openExistingJobCard(id: string, onFailure: () => void) {
  const search = document.querySelector<HTMLInputElement>(".map-face-search input");
  if (search) {
    setNativeValue(search, id);
    search.focus();
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (document.querySelector(".job-drawer.selected-focus")) {
      window.clearInterval(timer);
      return;
    }
    const result = visibleButtons(document).find((button) => !button.closest("[data-hpd-unified-workflow]") && textOf(button).toUpperCase().includes(id));
    result?.click();
    const brief = document.querySelector<HTMLElement>(".map-job-brief");
    if (brief) clickMatching(brief, [/open.*job/i, /view.*job/i, /full.*job/i, /details/i]);
    if (attempts >= 12) {
      window.clearInterval(timer);
      onFailure();
    }
  }, 260);
}

function directionsUrl(job: Job) {
  const destination = job.coords ? `${job.coords.lat},${job.coords.lng}` : job.address;
  const params = new URLSearchParams({ api: "1", travelmode: "driving", destination });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function loadSaved(): SavedWorkflow {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedWorkflow) : {};
  } catch {
    return {};
  }
}

function saveWorkflow(value: SavedWorkflow) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The live session remains usable.
  }
}

function isFieldStage(stage: WorkflowStage) {
  return ["access", "before_media", "working", "after_media", "outcome", "closeout"].includes(stage);
}

function stageTitle(stage: WorkflowStage) {
  const labels: Record<WorkflowStage, string> = {
    plan: "Plan the day",
    recommended: "Choose the next job",
    route: "Route plan",
    enroute: "Enroute",
    access: "Access check",
    before_media: "Before evidence",
    working: "Perform work",
    after_media: "After evidence",
    outcome: "Choose outcome",
    closeout: "Closeout package",
    complete: "Job complete",
  };
  return labels[stage];
}

function stagePrompt(stage: WorkflowStage, job: Job | null, nextJob: Job | null, originLabel: string) {
  const id = job?.id || "this job";
  const prompts: Record<WorkflowStage, string> = {
    plan: "Good morning. Start near you, choose a borough, or let me select the highest-priority area.",
    recommended: job ? `I recommend ${id}. Review the ETA, access, and work summary, then choose Enroute or Next Job.` : "Choose a planning option to rank the active jobs.",
    route: "Review the route and start the highlighted stop. You can select a different route stop without rebuilding the list.",
    enroute: job ? `You are enroute to ${id}. The travel bar will stay visible until you mark Arrived.` : "Select a job before starting travel.",
    access: job ? `You arrived at ${id}. Confirm whether access is granted.` : "Open the complete job card and confirm access.",
    before_media: job ? `Capture the required before evidence for ${id}, then mark the evidence saved.` : "Capture before evidence.",
    working: job ? `Start or continue the work for ${id}. Add a note for changes, materials, or access conditions.` : "Perform the work and add notes as needed.",
    after_media: job ? `Capture after photos and video from matching angles, then mark the evidence saved.` : "Capture after evidence.",
    outcome: "Select the correct final outcome. That choice controls the invoice and affidavit package.",
    closeout: "Review the invoice, affidavit, media, notes, and full package. Finish Job unlocks when required evidence and the package are ready.",
    complete: nextJob ? `${id} is complete. The next recommended stop is ${nextJob.id}.` : `${id} is complete. There are no more ranked stops.`,
  };
  if (stage === "recommended" && originLabel) return `${prompts[stage]} Estimates are calculated from ${originLabel}.`;
  return prompts[stage];
}

export default function MapWorkflowController() {
  const [bodyHost, setBodyHost] = useState<HTMLElement | null>(null);
  const [fieldHost, setFieldHost] = useState<HTMLElement | null>(null);
  const [jobs, setJobs] = useState<Job[]>(BASE_JOBS);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<WorkflowStage>("plan");
  const [borough, setBorough] = useState<BoroughKey>("all");
  const [priority, setPriority] = useState<PriorityKey>("highest");
  const [showBoroughs, setShowBoroughs] = useState(false);
  const [resultIds, setResultIds] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const [activeJobId, setActiveJobId] = useState("");
  const [outcome, setOutcome] = useState<OutcomeKey | null>(null);
  const [beforeDone, setBeforeDone] = useState(false);
  const [afterDone, setAfterDone] = useState(false);
  const [invoiceReviewed, setInvoiceReviewed] = useState(false);
  const [affidavitReviewed, setAffidavitReviewed] = useState(false);
  const [packageReady, setPackageReady] = useState(false);
  const [completedJobId, setCompletedJobId] = useState("");
  const [origin, setOrigin] = useState<GeoPoint>(BASE_POINT);
  const [originLabel, setOriginLabel] = useState(BASE_LABEL);
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [jobOpen, setJobOpen] = useState(false);
  const lastSpokenRef = useRef("");
  const voiceUnlockedRef = useRef(false);
  const nearSpokenRef = useRef(false);
  const fieldHostRef = useRef<HTMLElement | null>(null);
  const promptRef = useRef("");

  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const results = useMemo(() => resultIds.map((id) => jobMap.get(id)).filter((job): job is Job => Boolean(job)), [jobMap, resultIds]);
  const routeJobs = useMemo(() => routeIds.map((id) => jobMap.get(id)).filter((job): job is Job => Boolean(job)), [jobMap, routeIds]);
  const selectedJob = results[selectedIndex] || null;
  const activeJob = (activeJobId && jobMap.get(activeJobId)) || selectedJob || routeJobs[routeIndex] || null;
  const nextJob = useMemo(() => {
    if (routeJobs.length && routeIndex + 1 < routeJobs.length) return routeJobs[routeIndex + 1];
    if (results.length && selectedIndex + 1 < results.length) return results[selectedIndex + 1];
    return null;
  }, [results, routeJobs, routeIndex, selectedIndex]);
  const selectedEstimate = selectedJob ? estimateTrip(origin, selectedJob.coords) : null;
  const activeEstimate = activeJob ? estimateTrip(origin, activeJob.coords) : null;

  useEffect(() => {
    document.body.classList.add("hpd-unified-workflow");
    const host = document.createElement("div");
    host.className = "hpd-unified-workflow-host";
    host.dataset.hpdUnifiedWorkflow = "true";
    document.body.appendChild(host);
    setBodyHost(host);

    const saved = loadSaved();
    setJobs(mergedBrowserJobs());
    if (saved.stage) setStage(saved.stage);
    if (saved.borough) setBorough(saved.borough);
    if (saved.priority) setPriority(saved.priority);
    if (saved.resultIds) setResultIds(saved.resultIds);
    if (typeof saved.selectedIndex === "number") setSelectedIndex(saved.selectedIndex);
    if (saved.routeIds) setRouteIds(saved.routeIds);
    if (typeof saved.routeIndex === "number") setRouteIndex(saved.routeIndex);
    if (saved.activeJobId) setActiveJobId(saved.activeJobId);
    setOutcome(saved.outcome || null);
    setBeforeDone(Boolean(saved.beforeDone));
    setAfterDone(Boolean(saved.afterDone));
    setInvoiceReviewed(Boolean(saved.invoiceReviewed));
    setAffidavitReviewed(Boolean(saved.affidavitReviewed));
    setPackageReady(Boolean(saved.packageReady));
    setCompletedJobId(saved.completedJobId || "");
    setHydrated(true);

    return () => {
      host.remove();
      fieldHostRef.current?.remove();
      document.body.classList.remove("hpd-unified-workflow");
    };
  }, []);

  useEffect(() => {
    const syncDrawer = () => {
      const drawer = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
      const open = Boolean(drawer && drawer.getClientRects().length > 0);
      setJobOpen(open);
      document.body.classList.toggle("hpd-unified-job-open", open);

      if (open && drawer) {
        let host = fieldHostRef.current;
        if (!host) {
          host = document.createElement("div");
          host.className = "hpd-unified-field-host";
          host.dataset.hpdUnifiedWorkflow = "true";
          fieldHostRef.current = host;
          setFieldHost(host);
        }
        if (host.parentElement !== drawer) drawer.prepend(host);
      } else if (fieldHostRef.current) {
        fieldHostRef.current.remove();
        fieldHostRef.current = null;
        setFieldHost(null);
      }
    };

    syncDrawer();
    const observer = new MutationObserver(syncDrawer);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const timer = window.setInterval(syncDrawer, 650);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.body.classList.remove("hpd-unified-job-open");
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkflow({
      stage,
      borough,
      priority,
      resultIds,
      selectedIndex,
      routeIds,
      routeIndex,
      activeJobId,
      outcome,
      beforeDone,
      afterDone,
      invoiceReviewed,
      affidavitReviewed,
      packageReady,
      completedJobId,
    });
  }, [activeJobId, affidavitReviewed, afterDone, beforeDone, borough, completedJobId, hydrated, invoiceReviewed, outcome, packageReady, priority, resultIds, routeIds, routeIndex, selectedIndex, stage]);

  const speak = (message: string, force = false) => {
    if (!("speechSynthesis" in window) || !message.trim()) return;
    const key = `${stage}:${activeJob?.id || selectedJob?.id || "general"}:${message}`;
    if (!force && lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-US";
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  };

  const currentPrompt = stagePrompt(stage, activeJob || selectedJob, nextJob, originLabel);
  promptRef.current = currentPrompt;

  useEffect(() => {
    if (!hydrated || !voiceUnlockedRef.current) return;
    const timer = window.setTimeout(() => speak(currentPrompt), 120);
    return () => window.clearTimeout(timer);
  }, [currentPrompt, hydrated, stage]);

  useEffect(() => {
    const unlock = () => {
      if (voiceUnlockedRef.current) return;
      voiceUnlockedRef.current = true;
      speak(promptRef.current, true);
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (stage !== "enroute" || !activeJob?.coords || !navigator.geolocation) return;
    nearSpokenRef.current = false;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setOrigin(point);
        setOriginLabel("your live location");
        const miles = distanceMiles(point, activeJob.coords as GeoPoint);
        setLiveDistance(miles);
        if (miles <= 0.12 && !nearSpokenRef.current) {
          nearSpokenRef.current = true;
          speak(`You are near ${activeJob.id}. Mark Arrived when you are safely on site.`, true);
        }
      },
      () => setLiveDistance(null),
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeJob?.coords, activeJob?.id, stage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (stage !== "recommended" || !results.length || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") setSelectedIndex((current) => Math.min(results.length - 1, current + 1));
      if (event.key === "ArrowLeft") setSelectedIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [results.length, stage]);

  const rankJobs = (nextBorough: BoroughKey, nextPriority: PriorityKey, point = origin, label = originLabel) => {
    const active = jobs.filter((job) => !isClosed(job) && (nextBorough === "all" || job.borough === nextBorough));
    let filtered = active;
    if (nextPriority === "urgent") filtered = active.filter((job) => urgency(job) > 0);
    if (nextPriority === "appointments") filtered = active.filter((job) => appointmentToday(job));
    if (nextPriority === "no-access") filtered = active.filter((job) => isNoAccess(job));
    if (nextPriority === "ready-second") filtered = active.filter((job) => readySecond(job));
    if (!filtered.length) {
      filtered = active;
      setNotice("No exact matches were found, so I ranked the active jobs instead.");
    } else {
      setNotice("");
    }

    const ranked = filtered
      .map((job) => {
        const estimate = estimateTrip(point, job.coords);
        let score = urgency(job);
        if (nextPriority === "nearby") score += estimate ? Math.max(0, 180 - estimate.roadMiles * 12) : -100;
        if (nextPriority === "urgent") score += urgency(job) * 0.7;
        if (nextPriority === "appointments" && appointmentToday(job)) score += 220;
        if (nextPriority === "no-access" && isNoAccess(job)) score += 180;
        if (nextPriority === "ready-second" && readySecond(job)) score += 240;
        if (nextPriority === "highest") score += estimate ? Math.max(0, 35 - estimate.roadMiles) : 0;
        return { job, score, miles: estimate?.roadMiles ?? 999 };
      })
      .sort((a, b) => b.score - a.score || a.miles - b.miles)
      .slice(0, MAX_RESULTS)
      .map((item) => item.job.id);

    setBorough(nextBorough);
    setPriority(nextPriority);
    setOrigin(point);
    setOriginLabel(label);
    setResultIds(ranked);
    setSelectedIndex(0);
    setRouteIds([]);
    setRouteIndex(0);
    setActiveJobId("");
    setCompletedJobId("");
    setStage("recommended");
  };

  const useMyLocation = (nextPriority: PriorityKey = "nearby", nextBorough: BoroughKey = borough) => {
    if (!navigator.geolocation) {
      setNotice("Location is unavailable. Estimates are using the Richmond Hill base.");
      rankJobs(nextBorough, nextPriority, BASE_POINT, BASE_LABEL);
      return;
    }
    setNotice("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        rankJobs(nextBorough, nextPriority, point, "your current location");
      },
      () => {
        setNotice("Location permission was not available. Estimates are using the Richmond Hill base.");
        rankJobs(nextBorough, nextPriority, BASE_POINT, BASE_LABEL);
      },
      { enableHighAccuracy: true, maximumAge: 90_000, timeout: 10_000 },
    );
  };

  const buildRoute = () => {
    const ids = resultIds.slice(0, MAX_ROUTE_STOPS);
    if (!ids.length) {
      setNotice("Choose a planning option before building a route.");
      setStage("plan");
      return;
    }
    setRouteIds(ids);
    setRouteIndex(0);
    setStage("route");
    setNotice(`${ids.length} stops added to the route.`);
  };

  const startEnroute = (job: Job | null) => {
    if (!job) return;
    setActiveJobId(job.id);
    setStage("enroute");
    setLiveDistance(null);
    setNotice("");
    window.open(directionsUrl(job), "_blank", "noopener,noreferrer");
  };

  const markArrived = () => {
    if (!activeJob) return;
    setStage("access");
    setNotice("Opening the complete job card…");
    openExistingJobCard(activeJob.id, () => setNotice("I could not open the complete job card automatically. Search the OMO on the map, then open its full details."));
  };

  const openFieldControl = (patterns: RegExp[], fallbackMessage: string) => {
    const drawer = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
    if (drawer && clickMatching(drawer, patterns)) return true;
    setNotice(fallbackMessage);
    drawer?.querySelector<HTMLElement>(".field-media-option-hub, .field-media-step-cue, [data-field-media-console], .field-evidence-gallery")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  };

  const openMedia = (kind: "before" | "after", media: "photo" | "video") => {
    const kindPattern = kind === "before" ? "before" : "after";
    const mediaPattern = media === "photo" ? "photo|camera|image" : "video";
    openFieldControl(
      [new RegExp(`${kindPattern}.*${mediaPattern}`, "i"), new RegExp(`${mediaPattern}.*${kindPattern}`, "i"), new RegExp(`capture.*${kindPattern}`, "i")],
      `Open the media section and capture the ${kind} ${media}.`,
    );
  };

  const addNote = () => {
    openFieldControl([/add.*note/i, /field.*note/i, /^notes?$/i], "Open the Notes section in the complete job card.");
  };

  const selectOutcome = (value: OutcomeKey) => {
    setOutcome(value);
    const patterns: Record<OutcomeKey, RegExp[]> = {
      completed: [/work completed/i, /completed work/i, /mark.*complete/i, /^completed$/i],
      partial: [/partial/i],
      no_access: [/no\s*access/i],
      refused: [/refused access/i, /^refused$/i],
      completed_by_others: [/completed by others/i, /work by others/i],
    };
    openFieldControl(patterns[value], "Select the same outcome in the complete job card.");
    setStage("closeout");
  };

  const openDocument = (doc: "invoice" | "affidavit" | "package") => {
    if (!activeJob) return;
    const drawer = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
    const patterns = doc === "invoice" ? [/invoice/i] : doc === "affidavit" ? [/affidavit/i] : [/full package/i, /generate package/i, /^package$/i, /paperwork/i];
    const clicked = drawer ? clickMatching(drawer, patterns) : false;
    if (!clicked) {
      const query = new URLSearchParams({ job: activeJob.id, outcome: outcome || "pending", doc });
      window.open(`/paperwork?${query.toString()}`, "_blank", "noopener,noreferrer");
    }
    if (doc === "invoice") setInvoiceReviewed(true);
    if (doc === "affidavit") setAffidavitReviewed(true);
    if (doc === "package") setPackageReady(true);
  };

  const finishAllowed = beforeDone && (outcome === "no_access" || afterDone) && Boolean(outcome) && invoiceReviewed && affidavitReviewed && packageReady;

  const finishJob = () => {
    if (!activeJob) return;
    if (!finishAllowed) {
      setNotice("Finish is locked until the required evidence, invoice, affidavit, outcome, and full package are ready.");
      return;
    }
    setCompletedJobId(activeJob.id);
    setStage("complete");
    setNotice("Job closed. Review the next recommended stop.");
    closeExistingJobCard();
  };

  const continueToNext = () => {
    if (!nextJob) {
      setStage("plan");
      setActiveJobId("");
      return;
    }
    const nextResultIndex = resultIds.indexOf(nextJob.id);
    if (nextResultIndex >= 0) setSelectedIndex(nextResultIndex);
    if (routeJobs.length && routeIndex + 1 < routeJobs.length) setRouteIndex((current) => current + 1);
    setActiveJobId("");
    setBeforeDone(false);
    setAfterDone(false);
    setOutcome(null);
    setInvoiceReviewed(false);
    setAffidavitReviewed(false);
    setPackageReady(false);
    setCompletedJobId("");
    setStage("recommended");
  };

  const resetDay = () => {
    setStage("plan");
    setResultIds([]);
    setRouteIds([]);
    setSelectedIndex(0);
    setRouteIndex(0);
    setActiveJobId("");
    setCompletedJobId("");
    setBeforeDone(false);
    setAfterDone(false);
    setOutcome(null);
    setInvoiceReviewed(false);
    setAffidavitReviewed(false);
    setPackageReady(false);
    setNotice("");
  };

  const routeSummary = useMemo(() => {
    let previous = origin;
    let totalMiles = 0;
    let driveMinutes = 0;
    for (const job of routeJobs) {
      const estimate = estimateTrip(previous, job.coords);
      if (!estimate) continue;
      totalMiles += estimate.roadMiles;
      driveMinutes += estimate.driveMinutes;
      if (job.coords) previous = job.coords;
    }
    const fieldMinutes = routeJobs.length * 55;
    return {
      totalMiles,
      driveMinutes,
      totalMinutes: driveMinutes + fieldMinutes,
      finish: new Date(Date.now() + (driveMinutes + fieldMinutes) * 60_000),
    };
  }, [origin, routeJobs]);

  const fieldSteps = ["Access", "Before", "Work", "After", "Outcome", "Package"];
  const fieldStepIndex = stage === "access" ? 0 : stage === "before_media" ? 1 : stage === "working" ? 2 : stage === "after_media" ? 3 : stage === "outcome" ? 4 : 5;

  const planPanel = (
    <section className="hpd-unified-panel hpd-unified-plan" data-hpd-unified-workflow>
      <header className="hpd-unified-header">
        <div><span>HPD AI Field Agent</span><strong>{stageTitle(stage)}</strong><small>Speaker on · one prompt per stage</small></div>
        <button type="button" onClick={() => speak(currentPrompt, true)}>Repeat</button>
      </header>
      <div className="hpd-unified-prompt">{currentPrompt}</div>
      {notice ? <div className="hpd-unified-notice">{notice}</div> : null}
      <div className="hpd-plan-primary">
        <button type="button" className="primary" onClick={() => rankJobs("all", "highest", BASE_POINT, BASE_LABEL)}><b>Highest Priority</b><small>Let AI select the best area</small></button>
        <button type="button" onClick={() => useMyLocation("nearby", "all")}><b>Near Me</b><small>Rank from current location</small></button>
        <button type="button" onClick={() => setShowBoroughs((current) => !current)}><b>Choose Borough</b><small>Work one borough</small></button>
      </div>
      {showBoroughs ? <div className="hpd-borough-grid">{BOROUGHS.filter((item) => item.key !== "all").map((item) => <button type="button" key={item.key} onClick={() => rankJobs(item.key, "highest", origin, originLabel)}>{item.label}</button>)}</div> : null}
    </section>
  );

  const recommendedPanel = selectedJob ? (
    <section className="hpd-unified-panel hpd-unified-recommended" data-hpd-unified-workflow>
      <header className="hpd-unified-header">
        <div><span>Recommended job</span><strong>{selectedJob.id}</strong><small>{selectedIndex + 1} of {results.length} · {originLabel}</small></div>
        <button type="button" onClick={() => speak(currentPrompt, true)}>Repeat</button>
      </header>
      {completedJobId ? <div className="hpd-complete-banner">✓ {completedJobId} completed and closed</div> : null}
      <div className="hpd-unified-prompt">{currentPrompt}</div>
      {notice ? <div className="hpd-unified-notice">{notice}</div> : null}
      <article className="hpd-recommend-card">
        <div className="hpd-recommend-top"><span>{selectedJob.boroughLabel}</span><b>{selectedJob.id}</b><em>{recommendationReason(selectedJob, priority)}</em></div>
        <h2>{selectedJob.address || "Address unavailable"}</h2>
        <div className="hpd-recommend-metrics">
          <article><span>Distance</span><b>{selectedEstimate ? `${selectedEstimate.roadMiles.toFixed(1)} mi` : "Unavailable"}</b></article>
          <article><span>Drive</span><b>{selectedEstimate ? `${selectedEstimate.driveMinutes} min` : "Unavailable"}</b></article>
          <article><span>ETA</span><b>{selectedEstimate ? formatClock(selectedEstimate.eta) : "Unavailable"}</b></article>
        </div>
        <dl>
          <div><dt>Access</dt><dd>{truncate(selectedJob.access, 90)}</dd></div>
          <div><dt>Status</dt><dd>{truncate(selectedJob.status, 100)}</dd></div>
          <div><dt>Work summary</dt><dd>{truncate(selectedJob.description, 220)}</dd></div>
        </dl>
      </article>
      <div className="hpd-recommend-actions">
        <button type="button" className="primary" onClick={() => startEnroute(selectedJob)}>Enroute</button>
        <button type="button" onClick={() => setSelectedIndex((current) => Math.min(results.length - 1, current + 1))} disabled={selectedIndex >= results.length - 1}>Next Job</button>
        <button type="button" onClick={buildRoute}>Build Full Route</button>
      </div>
      <div className="hpd-recommend-pager"><button type="button" onClick={() => setSelectedIndex((current) => Math.max(0, current - 1))} disabled={selectedIndex <= 0}>‹</button><span>{selectedIndex + 1} / {results.length}</span><button type="button" onClick={() => setSelectedIndex((current) => Math.min(results.length - 1, current + 1))} disabled={selectedIndex >= results.length - 1}>›</button></div>
      <div className="hpd-priority-chips">
        <button type="button" onClick={() => rankJobs(borough, "urgent", origin, originLabel)}>Urgent</button>
        <button type="button" onClick={() => rankJobs(borough, "appointments", origin, originLabel)}>Appointments</button>
        <button type="button" onClick={() => rankJobs(borough, "no-access", origin, originLabel)}>No Access</button>
        <button type="button" onClick={() => rankJobs(borough, "ready-second", origin, originLabel)}>Ready 2nd</button>
        <button type="button" onClick={() => useMyLocation("nearby", borough)}>Near Me</button>
      </div>
    </section>
  ) : planPanel;

  const routePanel = (
    <section className="hpd-unified-panel hpd-unified-route" data-hpd-unified-workflow>
      <header className="hpd-unified-header"><div><span>Route plan</span><strong>{routeJobs.length} stops</strong><small>{routeSummary.totalMiles.toFixed(1)} mi · {formatDuration(routeSummary.driveMinutes)} driving</small></div><button type="button" onClick={() => speak(currentPrompt, true)}>Repeat</button></header>
      <div className="hpd-unified-prompt">{currentPrompt}</div>
      <div className="hpd-route-summary"><article><span>Estimated field day</span><b>{formatDuration(routeSummary.totalMinutes)}</b></article><article><span>Estimated finish</span><b>{formatClock(routeSummary.finish)}</b></article></div>
      <div className="hpd-route-stop-chips">{routeJobs.map((job, index) => <button type="button" key={job.id} className={index === routeIndex ? "active" : ""} onClick={() => setRouteIndex(index)}><b>{index + 1}</b><span>{job.id}</span></button>)}</div>
      {routeJobs[routeIndex] ? <article className="hpd-route-focus"><span>Stop {routeIndex + 1}</span><strong>{routeJobs[routeIndex].id}</strong><p>{routeJobs[routeIndex].address}</p><small>{truncate(routeJobs[routeIndex].description, 160)}</small></article> : null}
      <div className="hpd-recommend-actions"><button type="button" className="primary" onClick={() => startEnroute(routeJobs[routeIndex] || null)}>Enroute Stop {routeIndex + 1}</button><button type="button" onClick={() => setStage("recommended")}>Back to Jobs</button><button type="button" onClick={() => { setRouteIds(resultIds.slice(0, MAX_ROUTE_STOPS)); setRouteIndex(0); }}>Rebuild</button></div>
    </section>
  );

  const completePanel = (
    <section className="hpd-unified-panel hpd-unified-complete" data-hpd-unified-workflow>
      <header className="hpd-unified-header"><div><span>Job complete</span><strong>{completedJobId}</strong><small>{nextJob ? `${nextJob.id} is next` : "Route finished"}</small></div><button type="button" onClick={() => speak(currentPrompt, true)}>Repeat</button></header>
      <div className="hpd-unified-prompt">{currentPrompt}</div>
      {nextJob ? <article className="hpd-next-job"><span>Next recommended stop</span><strong>{nextJob.id}</strong><p>{nextJob.address}</p>{estimateTrip(origin, nextJob.coords) ? <b>{estimateTrip(origin, nextJob.coords)?.roadMiles.toFixed(1)} mi · {estimateTrip(origin, nextJob.coords)?.driveMinutes} min</b> : null}</article> : null}
      <div className="hpd-recommend-actions">{nextJob ? <button type="button" className="primary" onClick={() => { continueToNext(); window.setTimeout(() => startEnroute(nextJob), 0); }}>Enroute Next</button> : null}<button type="button" onClick={continueToNext}>{nextJob ? "Review Next" : "New Plan"}</button><button type="button" onClick={resetDay}>End Day</button></div>
    </section>
  );

  const travelBar = activeJob ? (
    <section className="hpd-unified-travel" data-hpd-unified-workflow>
      <div><span>Enroute</span><strong>{activeJob.id}</strong><small>{activeJob.address}</small></div>
      <div className="hpd-travel-metrics"><b>{liveDistance !== null ? `${liveDistance < 0.1 ? Math.round(liveDistance * 5280) + " ft" : liveDistance.toFixed(1) + " mi"}` : activeEstimate ? `${activeEstimate.roadMiles.toFixed(1)} mi` : "Distance updating"}</b><span>{activeEstimate ? `${activeEstimate.driveMinutes} min · ETA ${formatClock(activeEstimate.eta)}` : "Live navigation in Maps"}</span></div>
      <div className="hpd-travel-actions"><button type="button" onClick={() => window.open(directionsUrl(activeJob), "_blank", "noopener,noreferrer")}>Directions</button><button type="button" className="primary" onClick={markArrived}>Arrived</button><button type="button" onClick={() => { setStage(routeIds.length ? "route" : "recommended"); setActiveJobId(""); }}>Cancel</button></div>
    </section>
  ) : null;

  const fieldCoach = activeJob ? (
    <section className="hpd-unified-field-coach" data-hpd-unified-workflow>
      <header><div><span>AI Field Coach · Speaker on</span><strong>{stageTitle(stage)}</strong><small>{activeJob.id} · {activeJob.address}</small></div><button type="button" onClick={() => speak(currentPrompt, true)}>Repeat</button></header>
      <div className="hpd-field-progress">{fieldSteps.map((step, index) => <span key={step} className={index < fieldStepIndex ? "done" : index === fieldStepIndex ? "active" : ""}><b>{index + 1}</b><small>{step}</small></span>)}</div>
      <div className="hpd-unified-prompt">{currentPrompt}</div>
      {notice ? <div className="hpd-unified-notice">{notice}</div> : null}
      <div className="hpd-field-brief"><article><span>Access</span><b>{truncate(activeJob.access, 80)}</b></article><article><span>Phone</span><b>{activeJob.phone || "Not listed"}</b></article><article><span>Appointment</span><b>{activeJob.appointment || "None scheduled"}</b></article><article className="scope"><span>Work summary</span><b>{truncate(activeJob.description, 230)}</b></article></div>

      {stage === "access" ? <div className="hpd-field-actions"><button type="button" className="primary" onClick={() => { setOutcome(null); setStage("before_media"); setNotice("Access confirmed. Capture before evidence now."); }}>Access Granted</button><button type="button" className="warning" onClick={() => { setOutcome("no_access"); setStage("before_media"); setNotice("Capture No Access evidence, then continue to the affidavit package."); }}>No Access</button></div> : null}

      {stage === "before_media" ? <><div className="hpd-media-actions"><button type="button" onClick={() => openMedia("before", "photo")}>Take {outcome === "no_access" ? "Evidence" : "Before"} Photos</button><button type="button" onClick={() => openMedia("before", "video")}>Take {outcome === "no_access" ? "Evidence" : "Before"} Video</button></div><button type="button" className="hpd-sticky-next" onClick={() => { setBeforeDone(true); setStage(outcome === "no_access" ? "closeout" : "working"); setNotice("Before evidence saved."); }}>Evidence Saved → Continue</button></> : null}

      {stage === "working" ? <><div className="hpd-field-actions"><button type="button" onClick={() => openFieldControl([/^start job$/i, /start work/i, /resume work/i, /start timer/i], "Use Start Job in the complete job card.")}>Start / Resume Work</button><button type="button" onClick={addNote}>Add Note</button></div><button type="button" className="hpd-sticky-next" onClick={() => setStage("after_media")}>Work Finished → After Media</button></> : null}

      {stage === "after_media" ? <><div className="hpd-media-actions"><button type="button" onClick={() => openMedia("after", "photo")}>Take After Photos</button><button type="button" onClick={() => openMedia("after", "video")}>Take After Video</button></div><button type="button" className="hpd-sticky-next" onClick={() => { setAfterDone(true); setStage("outcome"); setNotice("After evidence saved."); }}>Evidence Saved → Outcome</button></> : null}

      {stage === "outcome" ? <div className="hpd-outcome-grid"><button type="button" className="primary" onClick={() => selectOutcome("completed")}>Completed</button><button type="button" onClick={() => selectOutcome("partial")}>Partial</button><button type="button" className="warning" onClick={() => selectOutcome("no_access")}>No Access</button><button type="button" onClick={() => selectOutcome("refused")}>Refused Access</button><button type="button" onClick={() => selectOutcome("completed_by_others")}>Completed by Others</button></div> : null}

      {stage === "closeout" ? <><div className="hpd-closeout-checklist"><span className={outcome ? "done" : ""}>Outcome</span><span className={beforeDone ? "done" : ""}>Before / access evidence</span><span className={outcome === "no_access" || afterDone ? "done" : ""}>After evidence</span><span className={invoiceReviewed ? "done" : ""}>Invoice reviewed</span><span className={affidavitReviewed ? "done" : ""}>Affidavit reviewed</span><span className={packageReady ? "done" : ""}>Full package ready</span></div><div className="hpd-document-actions"><button type="button" onClick={() => openDocument("invoice")}>Review Invoice</button><button type="button" onClick={() => openDocument("affidavit")}>Review Affidavit</button><button type="button" className="primary" onClick={() => openDocument("package")}>Open Full Package</button></div><button type="button" className="hpd-sticky-next" disabled={!finishAllowed} onClick={finishJob}>{finishAllowed ? "Finish Job" : "Complete Required Items"}</button></> : null}
    </section>
  ) : null;

  const arrivedFallback = isFieldStage(stage) && !jobOpen && activeJob ? (
    <section className="hpd-unified-panel hpd-unified-arrived" data-hpd-unified-workflow><header className="hpd-unified-header"><div><span>On site</span><strong>{activeJob.id}</strong><small>{activeJob.address}</small></div><button type="button" onClick={() => speak(currentPrompt, true)}>Repeat</button></header><div className="hpd-unified-prompt">{currentPrompt}</div>{notice ? <div className="hpd-unified-notice">{notice}</div> : null}<button type="button" className="hpd-large-open-job" onClick={() => openExistingJobCard(activeJob.id, () => setNotice("Search the OMO on the map and open Full Details."))}>Open Complete Job Card</button></section>
  ) : null;

  const workspace = stage === "plan" ? planPanel : stage === "recommended" ? recommendedPanel : stage === "route" ? routePanel : stage === "complete" ? completePanel : arrivedFallback;

  const mobileNav = !jobOpen && stage !== "enroute" ? (
    <nav className="hpd-unified-mobile-nav" data-hpd-unified-workflow><button type="button" className={stage === "plan" ? "active" : ""} onClick={() => setStage("plan")}><span>1</span><b>Plan</b></button><button type="button" className={stage === "recommended" ? "active" : ""} onClick={() => resultIds.length ? setStage("recommended") : setStage("plan")}><span>2</span><b>Jobs</b></button><button type="button" className={stage === "route" ? "active" : ""} onClick={() => routeIds.length ? setStage("route") : resultIds.length ? buildRoute() : setStage("plan")}><span>3</span><b>Route</b></button></nav>
  ) : null;

  return (
    <>
      {bodyHost && workspace ? createPortal(workspace, bodyHost) : null}
      {bodyHost && travelBar ? createPortal(travelBar, bodyHost) : null}
      {bodyHost && mobileNav ? createPortal(mobileNav, bodyHost) : null}
      {fieldHost && fieldCoach ? createPortal(fieldCoach, fieldHost) : null}
    </>
  );
}
