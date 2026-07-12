"use client";

import jobsData from "../../data/COA_Fetcher_2026.json";
import { FormEvent, useMemo, useState } from "react";

type PlanMode = "nearby" | "borough" | "urgent" | "appointments" | "custom";
type Borough = "Queens" | "Brooklyn" | "Bronx" | "Manhattan" | "Staten Island";
type Point = { lat: number; lng: number };
type JobRecord = Record<string, unknown>;
type PlannedJob = {
  id: string;
  address: string;
  borough: string;
  status: string;
  lat: number | null;
  lng: number | null;
  distance: number | null;
};

const BOROUGHS: Borough[] = ["Queens", "Brooklyn", "Bronx", "Manhattan", "Staten Island"];
const BASE_POINT: Point = { lat: 40.6957, lng: -73.8331 };

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

function isClosed(record: JobRecord) {
  const status = textValue(record, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status"]).toLowerCase();
  return /completed|complete|closed|archived|cancelled|canceled/.test(status);
}

function isUrgent(record: JobRecord) {
  const status = textValue(record, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status"]);
  const due = textValue(record, ["DueDate", "dueDate", "WorkCompletionDate", "workCompletionDate"]);
  const dueDate = due ? new Date(due) : null;
  const overdue = Boolean(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now());
  return /urgent|emergency|priority|overdue|no\s*access|ready\s*(?:for\s*)?(?:second|2)/i.test(status) || overdue;
}

function hasAppointmentToday(record: JobRecord) {
  const raw = textValue(record, ["AppointmentAt", "appointmentAt", "AppointmentUpdatedAt"]);
  if (!raw) return false;
  const appointment = new Date(raw);
  const now = new Date();
  return !Number.isNaN(appointment.getTime()) && appointment.toDateString() === now.toDateString();
}

function parseCustomPrompt(value: string) {
  const clean = value.toLowerCase();
  const foundBorough = BOROUGHS.find((item) => clean.includes(item.toLowerCase())) || null;
  const count = Number(clean.match(/\b([2-9]|10)\b/)?.[1] || 0) || null;
  const inferredMode: PlanMode = foundBorough
    ? "borough"
    : /appointment/.test(clean)
      ? "appointments"
      : /urgent|overdue|priority/.test(clean)
        ? "urgent"
        : /near|closest|nearby/.test(clean)
          ? "nearby"
          : "custom";
  return { foundBorough, count, inferredMode };
}

export default function PlanMyDayDrawer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PlanMode | null>(null);
  const [borough, setBorough] = useState<Borough | null>(null);
  const [stopCount, setStopCount] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("How should I plan your day?");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlannedJob[]>([]);

  const summary = useMemo(() => {
    if (!mode) return "Choose a planning option.";
    if (mode === "nearby") return `Find ${stopCount} active jobs near your current location.`;
    if (mode === "borough") return borough ? `Find ${stopCount} priority jobs in ${borough}.` : "Choose a borough.";
    if (mode === "urgent") return `Find ${stopCount} urgent or overdue jobs.`;
    if (mode === "appointments") return `Find up to ${stopCount} jobs with appointments today.`;
    return prompt.trim() || "Describe the route you want.";
  }, [borough, mode, prompt, stopCount]);

  function choose(nextMode: PlanMode) {
    setMode(nextMode);
    setResults([]);
    if (nextMode !== "borough") setBorough(null);
    setMessage("Review your request, then prepare the plan.");
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      setMessage("Type a request first.");
      return;
    }
    const parsed = parseCustomPrompt(prompt);
    setMode(parsed.inferredMode);
    setBorough(parsed.foundBorough);
    if (parsed.count) setStopCount(Math.min(10, parsed.count));
    setResults([]);
    setMessage("I understood your request. Review it, then prepare the plan.");
  }

  function getOrigin(): Promise<{ point: Point; label: string }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ point: BASE_POINT, label: "Richmond Hill base" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ point: { lat: position.coords.latitude, lng: position.coords.longitude }, label: "your current location" }),
        () => resolve({ point: BASE_POINT, label: "Richmond Hill base" }),
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
      );
    });
  }

  async function preparePlan() {
    if (!mode || (mode === "borough" && !borough)) {
      setMessage("Choose a planning option first.");
      return;
    }

    setLoading(true);
    setResults([]);
    setMessage("AI is ranking active jobs…");

    const { point, label } = await getOrigin();
    const rawJobs = Array.isArray(jobsData) ? (jobsData as JobRecord[]) : [];
    let candidates = rawJobs.filter((job) => !isClosed(job));

    if (mode === "borough" && borough) {
      candidates = candidates.filter((job) => normalizeBorough(textValue(job, ["Borough", "borough", "Boro", "boro"])) === borough);
    }
    if (mode === "urgent") candidates = candidates.filter(isUrgent);
    if (mode === "appointments") candidates = candidates.filter(hasAppointmentToday);

    const ranked = candidates
      .map((job) => {
        const lat = numberValue(job.Latitude ?? job.latitude ?? job.lat);
        const lng = numberValue(job.Longitude ?? job.longitude ?? job.lng ?? job.lon);
        const distance = lat !== null && lng !== null ? distanceMiles(point, { lat, lng }) : null;
        const urgentBoost = isUrgent(job) ? 500 : 0;
        const appointmentBoost = hasAppointmentToday(job) ? 700 : 0;
        const proximityScore = distance === null ? -1000 : Math.max(0, 300 - distance * 12);
        return {
          id: textValue(job, ["OMO", "omo", "jobId", "id", "Job_ID", "Job ID"]).toUpperCase(),
          address: textValue(job, ["BuildingAddress", "Building Address", "Address", "address", "Location", "location"]),
          borough: normalizeBorough(textValue(job, ["Borough", "borough", "Boro", "boro"])),
          status: textValue(job, ["WorkflowStatus", "FieldOutcome", "StatusOverride", "status", "Status"]) || "Active",
          lat,
          lng,
          distance,
          score: proximityScore + urgentBoost + appointmentBoost,
        };
      })
      .filter((job) => job.id)
      .sort((a, b) => b.score - a.score || (a.distance ?? 999) - (b.distance ?? 999))
      .slice(0, stopCount)
      .map(({ score: _score, ...job }) => job);

    const detail = { mode, borough, stopCount, prompt: prompt.trim(), origin: point, jobs: ranked };
    window.sessionStorage.setItem("hpd-plan-my-day-request", JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("hpd:plan-my-day", { detail }));
    setResults(ranked);
    setLoading(false);
    setMessage(ranked.length ? `${ranked.length} stops selected from ${label}. Review the plan below.` : "No matching active jobs were found. Try Near Me or another borough.");
  }

  function reset() {
    setMode(null);
    setBorough(null);
    setPrompt("");
    setResults([]);
    setLoading(false);
    setMessage("How should I plan your day?");
  }

  return (
    <aside className={`plan-my-day ${open ? "is-open" : ""}`} aria-label="Plan My Day AI assistant">
      <button type="button" className="plan-my-day__toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>AI</span>
        <strong>Plan My Day</strong>
        <b>{open ? "Close" : "Open"}</b>
      </button>

      {open ? (
        <div className="plan-my-day__panel">
          <header>
            <div>
              <span>AI DAY PLANNER</span>
              <h2>Where should we work today?</h2>
            </div>
            {mode ? <button type="button" onClick={reset}>Start over</button> : null}
          </header>

          <p className="plan-my-day__message" role="status">{message}</p>

          {!mode ? (
            <>
              <div className="plan-my-day__grid">
                <button type="button" onClick={() => choose("nearby")}><strong>Near Me</strong><small>Start from your location</small></button>
                <button type="button" onClick={() => choose("borough")}><strong>Pick Borough</strong><small>Work one borough</small></button>
                <button type="button" onClick={() => choose("urgent")}><strong>Urgent / Overdue</strong><small>Prioritize time-sensitive jobs</small></button>
                <button type="button" onClick={() => choose("appointments")}><strong>Appointments</strong><small>Use today’s scheduled stops</small></button>
              </div>

              <form className="plan-my-day__prompt" onSubmit={submitCustom}>
                <label htmlFor="plan-my-day-prompt">Or ask AI</label>
                <div>
                  <input id="plan-my-day-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Plan 5 urgent jobs in Queens" />
                  <button type="submit">Ask</button>
                </div>
              </form>
            </>
          ) : (
            <div className="plan-my-day__review">
              {mode === "borough" ? (
                <div className="plan-my-day__boroughs">
                  {BOROUGHS.map((item) => (
                    <button type="button" key={item} className={borough === item ? "is-selected" : ""} onClick={() => { setBorough(item); setResults([]); }}>{item}</button>
                  ))}
                </div>
              ) : null}

              <div className="plan-my-day__summary">
                <span>YOUR REQUEST</span>
                <p>{summary}</p>
              </div>

              <div className="plan-my-day__stops">
                <span>Stops</span>
                {[3, 5, 6].map((count) => (
                  <button type="button" key={count} className={stopCount === count ? "is-selected" : ""} onClick={() => { setStopCount(count); setResults([]); }}>{count}</button>
                ))}
              </div>

              <button type="button" className="plan-my-day__prepare" onClick={preparePlan} disabled={loading}>
                {loading ? "Preparing…" : results.length ? "Rebuild Plan" : "Prepare My Plan"}
              </button>

              {results.length ? (
                <div className="plan-my-day__results" aria-label="AI planned stops">
                  {results.map((job, index) => (
                    <article key={job.id}>
                      <b>{index + 1}</b>
                      <div>
                        <strong>{job.id}</strong>
                        <span>{job.address || "Address unavailable"}</span>
                        <small>{job.borough || "Unknown borough"} · {job.distance === null ? "distance unavailable" : `${job.distance.toFixed(1)} mi`}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}
