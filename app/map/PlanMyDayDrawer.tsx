"use client";

import jobsData from "../../data/COA_Fetcher_2026.json";
import { FormEvent, useMemo, useState } from "react";

type JobRecord = Record<string, unknown>;
type Point = { lat: number; lng: number };
type ChatMessage = { role: "assistant" | "user"; text: string };
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
};

const BOROUGHS = ["Queens", "Brooklyn", "Bronx", "Manhattan", "Staten Island"];
const BASE_POINT: Point = { lat: 40.6957, lng: -73.8331 };
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
  else if (mentionedBoroughs.length) next.boroughs = mentionedBoroughs;

  if (/near me|nearby|closest|shortest drive/.test(clean)) {
    next.startMode = "current_location";
    next.routePreference = "shortest_drive";
  }
  if (/office|base/.test(clean) && /start/.test(clean)) next.startMode = "office";
  if (/urgent|overdue|priority/.test(clean)) next.priorities = unique([...next.priorities.filter((item) => item !== "balanced"), "urgent"]);
  if (/appointment/.test(clean)) next.priorities = unique([...next.priorities.filter((item) => item !== "balanced"), "appointments"]);
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

function getOrigin(startMode: LocalPlan["startMode"]): Promise<{ point: Point; label: string }> {
  if (startMode === "office" || !navigator.geolocation) return Promise.resolve({ point: BASE_POINT, label: "Richmond Hill office" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ point: { lat: position.coords.latitude, lng: position.coords.longitude }, label: "your current location" }),
      () => resolve({ point: BASE_POINT, label: "Richmond Hill office fallback" }),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
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
    }));

  return ordered;
}

export default function PlanMyDayDrawer() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Good morning. Tell me how you want to plan today. I work locally and do not require an API key." },
  ]);
  const [plan, setPlan] = useState<LocalPlan>(DEFAULT_PLAN);
  const [results, setResults] = useState<PlannedJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [originLabel, setOriginLabel] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Tap Read Reply on iPhone");

  const planSummary = useMemo(() => describePlan(plan), [plan]);
  const lastAssistantReply = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.text || "",
    [messages],
  );

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
    setOriginLabel(label);

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

  function acceptPlan() {
    if (!results.length) return;
    const detail = {
      stop_count: plan.stopCount,
      boroughs: plan.boroughs,
      avoid_boroughs: plan.avoidBoroughs,
      priorities: plan.priorities,
      include_omo: plan.includeOmo,
      exclude_omo: plan.excludeOmo,
      finish_by: plan.finishBy,
      route_preference: plan.routePreference,
      start_mode: plan.startMode,
      originLabel,
      jobs: results,
      acceptedAt: new Date().toISOString(),
    };
    sessionStorage.setItem("hpd-plan-my-day-approved", JSON.stringify(detail));
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
    setInput("");
    setOriginLabel("");
    setMessages([{ role: "assistant", text: "New plan started. Tell me where you want to work and what matters most." }]);
  }

  return (
    <aside className={`plan-my-day ${open ? "is-open" : ""}`} aria-label="Free local AI day planner">
      <button type="button" className="plan-my-day__toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>AI</span><strong>Plan My Day</strong><b>{open ? "Close" : "Open"}</b>
      </button>

      {open ? (
        <div className="plan-my-day__panel">
          <header className="plan-my-day__header">
            <div>
              <span>FREE LOCAL PLANNER</span>
              <h2>Plan by chatting</h2>
            </div>
            <div>
              <button type="button" onClick={() => setVoiceEnabled((value) => !value)} aria-pressed={voiceEnabled}>
                {voiceEnabled ? "Voice on" : "Voice off"}
              </button>
              <button type="button" onClick={newChat}>New chat</button>
            </div>
          </header>

          <div className="plan-my-day__chat" aria-live="polite">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`plan-my-day__bubble is-${message.role}`}>
                <b>{message.role === "assistant" ? "Planner" : "You"}</b><p>{message.text}</p>
              </article>
            ))}
            {busy ? <article className="plan-my-day__bubble is-assistant"><b>Planner</b><p>Planning…</p></article> : null}
          </div>

          <div className="plan-my-day__suggestions">
            {["Plan 5 jobs near me", "5 urgent Queens jobs", "Appointments first", "Avoid Manhattan"].map((suggestion) => (
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
                placeholder="Example: Plan 6 urgent Queens jobs near me, include EQ24929, avoid Manhattan, finish by 3 PM."
                rows={3}
                disabled={busy}
              />
              <button type="submit" disabled={busy || !input.trim()}>{busy ? "Planning…" : "Plan route"}</button>
            </div>
          </form>

          <section className="plan-my-day__working-plan">
            <span>WORKING PLAN</span><p>{planSummary}</p>
          </section>

          {results.length ? (
            <div className="plan-my-day__results">
              {results.map((job, index) => (
                <article key={job.id}><b>{index + 1}</b><div><strong>{job.id}</strong><span>{job.address || "Address unavailable"}</span><small>{job.borough || "Unknown borough"} · {job.distance === null ? "distance unavailable" : `${job.distance.toFixed(1)} mi`} · {job.reason}</small></div></article>
              ))}
              <button type="button" className="plan-my-day__accept" onClick={acceptPlan}>Accept Plan</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
