"use client";

import jobsData from "../../data/COA_Fetcher_2026.json";
import { countFieldPhotos, type FieldMediaKind } from "../../lib/field-photo-store";
import {
  shadowUpsert,
  type UnifiedStorageStatus,
  unifiedStorageStatus,
} from "../../lib/unified-field-store";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type JobRecord = Record<string, unknown>;
type Point = { lat: number; lng: number };
type ChatMessage = { role: "assistant" | "user"; text: string };
type FieldStep = "ready" | "arrived" | "before_media" | "work_started" | "after_media" | "no_access_media" | "refused_access_media" | "completed_by_others_media" | "no_access" | "refused_access" | "work_completed" | "partial_work" | "completed_by_others";
type RoutePreference = "shortest_drive" | "highest_priority" | "balanced" | "appointments_first";
type LocalPlan = {
  boroughs: string[];
  avoidBoroughs: string[];
  priorities: string[];
  stopCount: number;
  includeOmo: string[];
  excludeOmo: string[];
  finishBy: string | null;
  routePreference: RoutePreference;
  startMode: "current_location" | "office";
};
type PlannedJob = {
  id: string;
  address: string;
  borough: string;
  status: string;
  lat: number | null;
  lng: number | null;
  distance: number | null;
  reason: string;
  description: string;
  contactName: string;
  contactPhone: string;
  unit: string;
};

const BOROUGHS = ["Queens", "Brooklyn", "Bronx", "Manhattan", "Staten Island"];
const BASE_POINT: Point = { lat: 40.6957, lng: -73.8331 };
const LAST_LOCATION_STORAGE_KEY = "hpd-map-location-last-v1";
const DEFAULT_PLAN: LocalPlan = {
  boroughs: [],
  avoidBoroughs: [],
  priorities: ["balanced"],
  stopCount: 5,
  includeOmo: [],
  excludeOmo: [],
  finishBy: null,
  routePreference: "balanced",
  startMode: "current_location",
};

function asArray(value: unknown): JobRecord[] {
  if (Array.isArray(value)) return value as JobRecord[];
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.jobs)) return object.jobs as JobRecord[];
    if (Array.isArray(object.data)) return object.data as JobRecord[];
    if (Array.isArray(object.records)) return object.records as JobRecord[];
  }
  return [];
}

function textValue(record: JobRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBorough(value: string) {
  const clean = value.toLowerCase();
  if (clean.includes("queen") || /\bqn\b/.test(clean)) return "Queens";
  if (clean.includes("brooklyn") || /\bbk\b/.test(clean)) return "Brooklyn";
  if (clean.includes("bronx") || /\bbx\b/.test(clean)) return "Bronx";
  if (clean.includes("manhattan") || /\bmn\b/.test(clean)) return "Manhattan";
  if (clean.includes("staten") || /\bsi\b/.test(clean)) return "Staten Island";
  return value;
}

function distanceMiles(a: Point, b: Point) {
  const radius = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function jobId(record: JobRecord) {
  return textValue(record, ["OMO", "omo", "jobId", "id", "Job_ID", "Job ID"]).toUpperCase();
}

function jobStatus(record: JobRecord) {
  return textValue(record, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status"]) || "Active";
}

function isClosed(record: JobRecord) {
  return /completed|complete|closed|archived|cancelled|canceled/i.test(jobStatus(record));
}

function isUrgent(record: JobRecord) {
  const status = jobStatus(record);
  const due = textValue(record, ["DueDate", "dueDate", "WorkCompletionDate", "workCompletionDate"]);
  const date = due ? new Date(due) : null;
  const overdue = Boolean(date && !Number.isNaN(date.getTime()) && date.getTime() < Date.now());
  return /urgent|emergency|priority|overdue|no\s*access|ready\s*(?:for\s*)?(?:second|2)/i.test(status) || overdue;
}

function hasAppointmentToday(record: JobRecord) {
  const raw = textValue(record, ["AppointmentAt", "appointmentAt", "AppointmentUpdatedAt"]);
  if (!raw) return false;
  const date = new Date(raw);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseMessage(message: string, current: LocalPlan): LocalPlan {
  const clean = message.toLowerCase();
  const next: LocalPlan = { ...current, boroughs: [...current.boroughs], avoidBoroughs: [...current.avoidBoroughs], priorities: [...current.priorities], includeOmo: [...current.includeOmo], excludeOmo: [...current.excludeOmo] };

  const count = clean.match(/\b(1[0-2]|[1-9])\s*(?:jobs?|stops?)?\b/);
  if (count) next.stopCount = Math.max(1, Math.min(12, Number(count[1])));

  const mentionedBoroughs = BOROUGHS.filter((borough) => clean.includes(borough.toLowerCase()));
  if (/\bavoid\b|\bexclude\b|\bskip\b/.test(clean)) next.avoidBoroughs = unique([...next.avoidBoroughs, ...mentionedBoroughs]);
  else if (mentionedBoroughs.length) {
    next.boroughs = mentionedBoroughs;
    next.avoidBoroughs = next.avoidBoroughs.filter((borough) => !mentionedBoroughs.includes(borough));
  }

  const wantsShortestDrive = /near me|nearby|closest|nearest|shortest drive/.test(clean);
  const wantsUrgent = /urgent|overdue|priority/.test(clean);
  const wantsAppointments = /appointment/.test(clean);

  if (wantsShortestDrive) {
    next.startMode = "current_location";
    next.routePreference = "shortest_drive";
  }
  if (/office|base/.test(clean) && /start/.test(clean)) next.startMode = "office";
  if (wantsUrgent || wantsAppointments) {
    next.priorities = [wantsUrgent ? "urgent" : "", wantsAppointments ? "appointments" : ""].filter(Boolean);
  } else if (wantsShortestDrive || /balanced|any priority|all active|remove restriction|clear priority/.test(clean)) {
    next.priorities = ["balanced"];
  }
  if (/highest priority/.test(clean)) next.routePreference = "highest_priority";
  if (/appointments first/.test(clean)) next.routePreference = "appointments_first";
  if (/balanced/.test(clean)) next.routePreference = "balanced";

  const finish = message.match(/(?:finish|done|end)\s+(?:by|before)\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)/i);
  if (finish) next.finishBy = finish[1].trim();

  const ids = Array.from(message.toUpperCase().matchAll(/\b[A-Z]{1,3}\d{4,8}\b/g)).map((match) => match[0]);
  if (ids.length) {
    if (/remove|exclude|skip|without/.test(clean)) next.excludeOmo = unique([...next.excludeOmo, ...ids]);
    else next.includeOmo = unique([...next.includeOmo, ...ids]);
  }

  if (/clear borough|any borough|all boroughs|anywhere/.test(clean)) next.boroughs = [];
  if (/clear avoid|do not avoid/.test(clean)) next.avoidBoroughs = [];
  if (/clear included|remove all included/.test(clean)) next.includeOmo = [];

  return next;
}

function describePlan(plan: LocalPlan) {
  const area = plan.boroughs.length ? plan.boroughs.join(" and ") : "all NYC boroughs";
  const avoid = plan.avoidBoroughs.length ? `, avoiding ${plan.avoidBoroughs.join(" and ")}` : "";
  const priority = plan.priorities.includes("appointments")
    ? "appointments"
    : plan.priorities.includes("urgent")
      ? "urgent and overdue work"
      : plan.routePreference === "shortest_drive"
        ? "the shortest drive"
        : "a balanced route";
  const finish = plan.finishBy ? ` and target finishing by ${plan.finishBy}` : "";
  return `${plan.stopCount} stops in ${area}${avoid}, prioritizing ${priority}${finish}.`;
}

async function getOrigin(startMode: LocalPlan["startMode"]): Promise<{ point: Point; label: string }> {
  if (startMode === "office" || !navigator.geolocation) return Promise.resolve({ point: BASE_POINT, label: "Richmond Hill office" });
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY) || "null");
    if (Number.isFinite(saved?.lat) && Number.isFinite(saved?.lng)) {
      return { point: { lat: saved.lat, lng: saved.lng }, label: "your saved location" };
    }
  } catch {}
  try {
    const permissions = (navigator as any).permissions;
    if (permissions?.query) {
      const permission = await permissions.query({ name: "geolocation" });
      if (permission.state === "denied") return { point: BASE_POINT, label: "Richmond Hill office fallback" };
    }
  } catch {}
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ point: { lat: position.coords.latitude, lng: position.coords.longitude }, label: "your current location" }),
      () => resolve({ point: BASE_POINT, label: "Richmond Hill office fallback" }),
      { enableHighAccuracy: true, maximumAge: 300_000, timeout: 2_500 },
    );
  });
}

function rankJobs(plan: LocalPlan, origin: Point) {
  const records = asArray(jobsData).filter((job) => !isClosed(job));
  const includeSet = new Set(plan.includeOmo);
  const excludeSet = new Set(plan.excludeOmo);
  const required = records.filter((job) => includeSet.has(jobId(job)) && !excludeSet.has(jobId(job)));

  const candidates = records.filter((job) => {
    const id = jobId(job);
    if (!id || includeSet.has(id) || excludeSet.has(id)) return false;
    const borough = normalizeBorough(textValue(job, ["Borough", "borough", "Boro", "boro"]));
    if (plan.boroughs.length && !plan.boroughs.includes(borough)) return false;
    if (plan.avoidBoroughs.includes(borough)) return false;
    if (plan.priorities.includes("appointments") && !hasAppointmentToday(job)) return false;
    if (plan.priorities.includes("urgent") && !isUrgent(job)) return false;
    return true;
  });

  const scoreJob = (job: JobRecord) => {
    const lat = numberValue(job.Latitude ?? job.latitude ?? job.lat);
    const lng = numberValue(job.Longitude ?? job.longitude ?? job.lng ?? job.lon);
    const distance = lat !== null && lng !== null ? distanceMiles(origin, { lat, lng }) : null;
    const urgent = isUrgent(job);
    const appointment = hasAppointmentToday(job);
    let score = 0;
    if (appointment) score += plan.routePreference === "appointments_first" ? 1200 : 500;
    if (urgent) score += plan.routePreference === "highest_priority" ? 1000 : 450;
    if (distance !== null) score += plan.routePreference === "shortest_drive" ? Math.max(0, 900 - distance * 35) : Math.max(0, 250 - distance * 10);
    return { job, lat, lng, distance, score, urgent, appointment };
  };

  const ordered = [...required.map(scoreJob), ...candidates.map(scoreJob).sort((a, b) => b.score - a.score || (a.distance ?? 999) - (b.distance ?? 999))]
    .slice(0, plan.stopCount)
    .map(({ job, lat, lng, distance, urgent, appointment }): PlannedJob => ({
      id: jobId(job),
      address: textValue(job, ["BuildingAddress", "Building Address", "Address", "address", "Location", "location"]),
      borough: normalizeBorough(textValue(job, ["Borough", "borough", "Boro", "boro"])),
      status: jobStatus(job),
      lat,
      lng,
      distance,
      reason: appointment ? "Appointment today" : urgent ? "Urgent or overdue" : distance !== null ? "Good travel fit" : "Active job",
      description: textValue(job, ["ItbPage3Description", "ITBDescription", "JobDescription", "Job_Description", "description"]),
      contactName: textValue(job, ["ItbTenantName", "TenantName", "tenantName", "ContactName", "contactName"]),
      contactPhone: textValue(job, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "Phone", "phone"]),
      unit: textValue(job, ["ItbTenantApartment", "ApartmentUnit", "Location", "location"]),
    }));

  return ordered;
}

function selectableJob(record: JobRecord, origin?: Point, reason = "Selected by you"): PlannedJob {
  const lat = numberValue(record.Latitude ?? record.latitude ?? record.lat);
  const lng = numberValue(record.Longitude ?? record.longitude ?? record.lng ?? record.lon);
  return {
    id: jobId(record),
    address: textValue(record, ["BuildingAddress", "Building Address", "Address", "address", "Location", "location"]),
    borough: normalizeBorough(textValue(record, ["Borough", "borough", "Boro", "boro"])),
    status: jobStatus(record),
    lat,
    lng,
    distance: origin && lat !== null && lng !== null ? distanceMiles(origin, { lat, lng }) : null,
    reason,
    description: textValue(record, ["ItbPage3Description", "ITBDescription", "JobDescription", "Job_Description", "description"]),
    contactName: textValue(record, ["ItbTenantName", "TenantName", "tenantName", "ContactName", "contactName"]),
    contactPhone: textValue(record, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "Phone", "phone"]),
    unit: textValue(record, ["ItbTenantApartment", "ApartmentUnit", "Location", "location"]),
  };
}

export default function PlanMyDayDrawer() {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Good morning. Tell me how you want to plan today. I work locally and do not require an API key." },
  ]);
  const [plan, setPlan] = useState<LocalPlan>(DEFAULT_PLAN);
  const [results, setResults] = useState<PlannedJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [originPoint, setOriginPoint] = useState<Point | null>(null);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [fieldSteps, setFieldSteps] = useState<Record<string, FieldStep>>({});
  const [mediaPaused, setMediaPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [originLabel, setOriginLabel] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Tap Read Reply on iPhone");
  const [offlineStatus, setOfflineStatus] = useState<UnifiedStorageStatus | null>(null);

  const planSummary = useMemo(() => describePlan(plan), [plan]);
  const lastAssistantReply = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.text || "",
    [messages],
  );
  const activeJobs = useMemo(() => asArray(jobsData).filter((job) => !isClosed(job) && jobId(job)), []);
  const searchMatches = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    if (query.length < 2) return [];
    return activeJobs
      .filter((job) => {
        const haystack = `${jobId(job)} ${textValue(job, ["BuildingAddress", "Building Address", "Address", "address"])} ${textValue(job, ["Borough", "borough"])}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [activeJobs, jobSearch]);
  const selectedResults = useMemo(() => results.filter((job) => selectedIds.includes(job.id)), [results, selectedIds]);
  const viewingJob = useMemo(() => results.find((job) => job.id === viewingJobId) || null, [results, viewingJobId]);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat || viewingJob) return;
    const frame = window.requestAnimationFrame(() => {
      chat.scrollTop = chat.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, busy, viewingJob]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void unifiedStorageStatus()
        .then((status) => { if (active) setOfflineStatus(status); })
        .catch(() => { if (active) setOfflineStatus({ enabled: false, available: false, queued: 0, errors: 0, migrated: {} }); });
    };
    refresh();
    window.addEventListener("hpd-unified-storage-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("hpd-unified-storage-change", refresh);
    };
  }, []);

  function speakReply(text: string, force = false) {
    if ((!voiceEnabled && !force) || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!text.trim()) return;
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    utterance.volume = 1;
    utterance.onstart = () => setVoiceStatus("Speaking now");
    utterance.onend = () => setVoiceStatus("Finished · tap to replay");
    utterance.onerror = () => setVoiceStatus("Tap Read Reply again");
    window.speechSynthesis.speak(utterance);
  }

  function readLastReply() {
    setVoiceEnabled(true);
    setVoiceStatus("Starting voice…");
    speakReply(lastAssistantReply, true);
  }

  async function handleMessage(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text: message }]);

    const nextPlan = parseMessage(message, plan);
    const { point, label } = await getOrigin(nextPlan.startMode);
    const nextResults = rankJobs(nextPlan, point);
    setPlan(nextPlan);
    setResults(nextResults);
    setSelectedIds(nextResults.map((job) => job.id));
    setOriginLabel(label);
    setOriginPoint(point);

    const missingIncluded = nextPlan.includeOmo.filter((id) => !nextResults.some((job) => job.id === id));
    let reply = `I prepared ${nextResults.length} stops from ${label}. ${describePlan(nextPlan)}`;
    if (!nextResults.length) reply = "I could not find matching active jobs. Try removing a restriction, changing the borough, or asking for nearby jobs.";
    else if (missingIncluded.length) reply += ` I could not locate these active OMO numbers: ${missingIncluded.join(", ")}.`;
    else reply += " Review the stops below. You can tell me to add, remove, shorten, or reprioritize the route.";

    setMessages((current) => [...current, { role: "assistant", text: reply }]);
    speakReply(reply);
    setBusy(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void handleMessage(input);
  }

  async function saveApprovedPlan(detail: Record<string, unknown> & { acceptedAt: string; jobs: PlannedJob[] }) {
    const routeId = `route-${detail.acceptedAt}`;
    await shadowUpsert("route", { ...detail, id: routeId, jobId: "", status: "planned" });
    await Promise.all(detail.jobs.map((job, index) => shadowUpsert("route_stop", {
      ...job,
      id: `${routeId}-${job.id}`,
      routeId,
      jobId: job.id,
      stopIndex: index,
      status: "planned",
    })));
  }

  function acceptPlan() {
    if (!selectedResults.length) return;
    const detail = {
      boroughs: plan.boroughs,
      avoid_boroughs: plan.avoidBoroughs,
      priorities: plan.priorities,
      include_omo: plan.includeOmo,
      exclude_omo: plan.excludeOmo,
      finish_by: plan.finishBy,
      route_preference: plan.routePreference,
      start_mode: plan.startMode,
      originLabel,
      stop_count: selectedResults.length,
      jobs: selectedResults,
      acceptedAt: new Date().toISOString(),
    };
    sessionStorage.setItem("hpd-plan-my-day-approved", JSON.stringify(detail));
    void saveApprovedPlan(detail).catch((error) => console.error("Could not queue the route for offline sync.", error));
    window.dispatchEvent(new CustomEvent("hpd:plan-my-day-approved", { detail }));
    const reply = "Plan approved. I’m building the route on the map now.";
    setMessages((current) => [...current, { role: "assistant", text: reply }]);
    speakReply(reply);
    window.setTimeout(() => setOpen(false), 500);
  }

  function newChat() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlan(DEFAULT_PLAN);
    setResults([]);
    setSelectedIds([]);
    setJobSearch("");
    setInput("");
    setOriginLabel("");
    setViewingJobId(null);
    setFieldSteps({});
    setMediaPaused(false);
    setMessages([{ role: "assistant", text: "New plan started. Tell me where you want to work and what matters most." }]);
  }

  function backToMap() {
    setViewingJobId(null);
    setOpen(false);
  }

  function routeUrl(job: PlannedJob, service: "google" | "waze") {
    const destination = job.lat !== null && job.lng !== null ? `${job.lat},${job.lng}` : job.address;
    if (service === "waze") return `https://www.waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  function updateFieldStep(job: PlannedJob, step: FieldStep) {
    setFieldSteps((current) => ({ ...current, [job.id]: step }));
    window.dispatchEvent(new CustomEvent("hpd:routed-job-status", { detail: { jobId: job.id, step, occurredAt: new Date().toISOString() } }));
  }

  function openRequiredMedia(job: PlannedJob, kind: "before" | "after" | "no_access" | "refused_access" | "completed_by_others") {
    window.dispatchEvent(new CustomEvent("hpd:routed-job-media", { detail: { jobId: job.id, kind } }));
    setMediaPaused(true);
    setOpen(false);
  }

  async function confirmRequiredMedia(job: PlannedJob, kind: FieldMediaKind, next: FieldStep) {
    const testOnly = new URLSearchParams(window.location.search).get("fieldFlowTest") === "1";
    if (!testOnly) {
      const counts = await countFieldPhotos(job.id);
      if (!counts[kind]) {
        window.alert(`${kind.replaceAll("_", " ")} evidence is required before continuing.`);
        return;
      }
    }
    if (["work_started", "no_access", "refused_access", "completed_by_others"].includes(next)) updateFieldStep(job, next);
    else setFieldSteps((current) => ({ ...current, [job.id]: next }));
  }

  function nextSelectedStop(jobId: string) {
    const index = selectedResults.findIndex((job) => job.id === jobId);
    return selectedResults[index + 1] || null;
  }

  function toggleJob(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function addJob(record: JobRecord) {
    const id = jobId(record);
    if (!id) return;
    setResults((current) => current.some((job) => job.id === id) ? current : [...current, selectableJob(record, originPoint || undefined)]);
    setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
    setJobSearch("");
  }

  function moveJob(id: string, direction: -1 | 1) {
    setResults((current) => {
      const index = current.findIndex((job) => job.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <aside className={`plan-my-day ${open ? "is-open" : ""} ${mediaPaused ? "is-media-paused" : ""}`} aria-label="Free local AI day planner">
      <button type="button" className="plan-my-day__toggle" onClick={() => { if (mediaPaused) { setMediaPaused(false); setOpen(true); } else setOpen((value) => !value); }} aria-expanded={open}>
        <span>AI</span><strong>{mediaPaused ? "Return to Route" : "Plan My Day"}</strong><b>{mediaPaused ? "Resume" : open ? "Close" : "Open"}</b>
      </button>

      {open ? (
        <div className={`plan-my-day__panel ${viewingJob ? "is-job-view" : ""}`}>
          <header className="plan-my-day__header">
            <div>
              <span>FREE LOCAL PLANNER</span>
              <h2>Plan by chatting</h2>
              <small className="plan-my-day__offline-state" role="status" aria-live="polite">
                {!offlineStatus
                  ? "Checking offline storage…"
                  : !offlineStatus.available || !offlineStatus.enabled
                    ? "Offline storage unavailable"
                    : offlineStatus.errors
                      ? `${offlineStatus.errors} offline item${offlineStatus.errors === 1 ? "" : "s"} need attention`
                      : offlineStatus.queued
                        ? `${offlineStatus.queued} saved locally · waiting for cloud`
                        : "Offline storage ready"}
              </small>
            </div>
            <div>
              <button type="button" onClick={() => setVoiceEnabled((value) => !value)} aria-pressed={voiceEnabled}>
                {voiceEnabled ? "Voice on" : "Voice off"}
              </button>
              <button type="button" onClick={newChat}>Reset Route</button>
              <button type="button" onClick={backToMap}>Back to Map</button>
            </div>
          </header>

          {viewingJob ? <section className="plan-my-day__job-view" aria-label={`Job ${viewingJob.id} details`}>
            <div className="plan-my-day__job-view-head"><button type="button" onClick={() => setViewingJobId(null)}>← Back to Route</button><strong>{viewingJob.id}</strong><span>{viewingJob.status}</span></div>
            <h3>{viewingJob.address || "Address unavailable"}</h3>
            <p><b>Unit:</b> {viewingJob.unit || "Not listed"}</p>
            <p><b>Contact:</b> {viewingJob.contactName || "Not listed"}</p>
            <p><b>Phone:</b> {viewingJob.contactPhone ? <a href={`tel:${viewingJob.contactPhone.replace(/[^+\d]/g, "")}`}>{viewingJob.contactPhone}</a> : "Not listed"}</p>
            <div className="plan-my-day__itb"><b>ITB Job Description</b><p>{viewingJob.description || "ITB description unavailable."}</p></div>
            <div className="plan-my-day__go-here"><a href={routeUrl(viewingJob, "google")} target="_blank" rel="noreferrer">Google Maps</a><a href={routeUrl(viewingJob, "waze")} target="_blank" rel="noreferrer">Waze</a></div>
            <section className="plan-my-day__field-flow" aria-label="Field job status">
              <span>FIELD VISIT</span>
              {(!fieldSteps[viewingJob.id] || fieldSteps[viewingJob.id] === "ready") ? <><p>When you reach this job, confirm arrival to begin.</p><button type="button" className="primary" onClick={() => updateFieldStep(viewingJob, "arrived")}>I Have Arrived</button></> : null}
              {fieldSteps[viewingJob.id] === "arrived" ? <><p>You are at the job. Start work or record the access outcome. Evidence is required before the status can close.</p><div className="plan-my-day__status-grid"><button type="button" className="primary" onClick={() => setFieldSteps((current) => ({ ...current, [viewingJob.id]: "before_media" }))}>Start Job</button><button type="button" onClick={() => setFieldSteps((current) => ({ ...current, [viewingJob.id]: "no_access_media" }))}>No Access</button><button type="button" onClick={() => setFieldSteps((current) => ({ ...current, [viewingJob.id]: "refused_access_media" }))}>Refused Access</button><button type="button" onClick={() => setFieldSteps((current) => ({ ...current, [viewingJob.id]: "completed_by_others_media" }))}>Completed by Others</button></div></> : null}
              {fieldSteps[viewingJob.id] === "before_media" ? <><p>Capture BEFORE evidence before work begins.</p><button type="button" className="primary" onClick={() => openRequiredMedia(viewingJob, "before")}>Open Before Media</button><button type="button" onClick={() => void confirmRequiredMedia(viewingJob, "before", "work_started")}>Before Media Saved · Begin Work</button></> : null}
              {fieldSteps[viewingJob.id] === "work_started" ? <><p>Work is in progress. When finished, capture AFTER evidence before choosing completion status.</p><button type="button" className="primary" onClick={() => openRequiredMedia(viewingJob, "after")}>Open After Media</button><button type="button" onClick={() => void confirmRequiredMedia(viewingJob, "after", "after_media")}>After Media Saved · Continue</button></> : null}
              {fieldSteps[viewingJob.id] === "after_media" ? <><p>After evidence confirmed. Choose the final work result.</p><div className="plan-my-day__status-grid"><button type="button" className="primary" onClick={() => updateFieldStep(viewingJob, "work_completed")}>Work Completed</button><button type="button" onClick={() => updateFieldStep(viewingJob, "partial_work")}>Partial Work</button></div></> : null}
              {fieldSteps[viewingJob.id] === "no_access_media" ? <><p>Capture evidence showing the No Access attempt before saving.</p><button type="button" className="primary" onClick={() => openRequiredMedia(viewingJob, "no_access")}>Open No Access Media</button><button type="button" onClick={() => void confirmRequiredMedia(viewingJob, "no_access", "no_access")}>Evidence Saved · Confirm No Access</button></> : null}
              {fieldSteps[viewingJob.id] === "refused_access_media" ? <><p>Capture evidence supporting Refused Access before saving.</p><button type="button" className="primary" onClick={() => openRequiredMedia(viewingJob, "refused_access")}>Open Refused Access Media</button><button type="button" onClick={() => void confirmRequiredMedia(viewingJob, "refused_access", "refused_access")}>Evidence Saved · Confirm Refused Access</button></> : null}
              {fieldSteps[viewingJob.id] === "completed_by_others_media" ? <><p>Capture evidence showing work completed by others before saving.</p><button type="button" className="primary" onClick={() => openRequiredMedia(viewingJob, "completed_by_others")}>Open Completed-by-Others Media</button><button type="button" onClick={() => void confirmRequiredMedia(viewingJob, "completed_by_others", "completed_by_others")}>Evidence Saved · Confirm Outcome</button></> : null}
              {["no_access", "refused_access", "work_completed", "partial_work", "completed_by_others"].includes(fieldSteps[viewingJob.id] || "") ? <div className="plan-my-day__outcome-saved"><strong>Status saved: {(fieldSteps[viewingJob.id] || "").replaceAll("_", " ")}</strong>{nextSelectedStop(viewingJob.id) ? <button type="button" onClick={() => setViewingJobId(nextSelectedStop(viewingJob.id)!.id)}>Next Stop · {nextSelectedStop(viewingJob.id)!.id}</button> : <button type="button" onClick={backToMap}>Route Finished · Back to Map</button>}</div> : null}
            </section>
          </section> : null}

          <div ref={chatRef} className="plan-my-day__chat" aria-live="polite">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`plan-my-day__bubble is-${message.role}`}>
                <b>{message.role === "assistant" ? "Planner" : "You"}</b><p>{message.text}</p>
              </article>
            ))}
            {busy ? <article className="plan-my-day__bubble is-assistant"><b>Planner</b><p>Planning…</p></article> : null}
          </div>

          <div className="plan-my-day__suggestions">
            {["Plan 5 jobs near me", "5 urgent Queens jobs", "Appointments first", "Nearest jobs first"].map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => void handleMessage(suggestion)}>{suggestion}</button>
            ))}
          </div>

          <div className="plan-my-day__voice-row">
            <button type="button" onClick={readLastReply} disabled={!lastAssistantReply}>🔊 Read Reply</button>
            <small>{voiceStatus}</small>
          </div>

          <form className="plan-my-day__composer" onSubmit={submit}>
            <label htmlFor="plan-chat-input">Message the planner</label>
            <div>
              <textarea
                id="plan-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Example: Plan 6 urgent jobs near me, include EQ24929, finish by 3 PM."
                rows={3}
                disabled={busy}
              />
              <button type="submit" disabled={busy || !input.trim()}>{busy ? "Planning…" : "Plan route"}</button>
            </div>
          </form>

          <section className="plan-my-day__working-plan">
            <span>WORKING PLAN · {selectedResults.length} SELECTED</span><p>{planSummary}</p>
          </section>

          <section className="plan-my-day__job-picker" aria-label="Add jobs to route">
            <label htmlFor="plan-job-search">Add a job you need</label>
            <input id="plan-job-search" value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="Search OMO, address, or borough" />
            {searchMatches.length ? <div className="plan-my-day__search-results">
              {searchMatches.map((record) => <button type="button" key={jobId(record)} onClick={() => addJob(record)}>
                <strong>{jobId(record)}</strong><span>{textValue(record, ["BuildingAddress", "Building Address", "Address", "address"])}</span><b>Add</b>
              </button>)}
            </div> : null}
          </section>

          {results.length ? (
            <div className="plan-my-day__results">
              {results.map((job, index) => (
                <article key={job.id} className={selectedIds.includes(job.id) ? "is-selected" : "is-unselected"}>
                  <label className="plan-my-day__select"><input type="checkbox" checked={selectedIds.includes(job.id)} onChange={() => toggleJob(job.id)} /><b>{index + 1}</b></label>
                  <div><strong>{job.id}</strong><span>{job.address || "Address unavailable"}</span><small>{job.borough || "Unknown borough"} · {job.distance === null ? "distance unavailable" : `${job.distance.toFixed(1)} mi`}</small><em>Why AI selected it: {job.reason}</em>
                    <nav><button type="button" onClick={() => setViewingJobId(job.id)}>View Job</button><a href={`/jobs/${encodeURIComponent(job.id)}/`}>Full Page</a><a href={routeUrl(job, "google")} target="_blank" rel="noreferrer">Go Here</a><button type="button" onClick={() => moveJob(job.id, -1)} disabled={index === 0}>Move up</button><button type="button" onClick={() => moveJob(job.id, 1)} disabled={index === results.length - 1}>Move down</button></nav>
                  </div>
                </article>
              ))}
              <button type="button" className="plan-my-day__accept" onClick={acceptPlan} disabled={!selectedResults.length}>Build Route with {selectedResults.length} Selected</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
