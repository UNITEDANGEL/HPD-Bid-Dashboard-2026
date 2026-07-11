"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type JobRecord = Record<string, unknown>;
type Phase = "morning" | "review" | "enroute" | "arrived" | "access" | "before-media" | "work" | "after-media" | "outcome" | "closeout" | "done";
type PaperworkOutcome = "pending" | "work_completed" | "partial_work_completed" | "no_access" | "refused_access" | "completed_by_others";
type ActiveTrip = { id: string; address: string; status: "enroute" | "arrived"; directionsUrl?: string; lat?: number; lng?: number };
type JobInfo = { id: string; address: string; scope: string; access: string; phone: string; appointment: string; status: string };

const ACTIVE_TRIP_STORAGE_KEY = "hpd-ai-active-trip-v1";
const SPEAKER_STORAGE_KEY = "hpd-ai-speaker-always-on-v1";
const PHASE_STORAGE_PREFIX = "hpd-ai-field-phase-v1:";
const PHASE_RANK: Record<Phase, number> = {
  morning: 0,
  review: 0,
  enroute: 1,
  arrived: 2,
  access: 3,
  "before-media": 4,
  work: 5,
  "after-media": 6,
  outcome: 7,
  closeout: 8,
  done: 9,
};

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(job[key]);
    if (value) return value;
  }
  return "";
}

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, length = 180) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= length ? clean : `${clean.slice(0, length).trim()}…`;
}

const JOBS = new Map<string, JobInfo>();
for (const raw of bundledJobsData as JobRecord[]) {
  const id = firstValue(raw, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  if (!id) continue;
  JOBS.set(id, {
    id,
    address: firstValue(raw, ["BuildingAddress", "Building_Address", "Address", "address", "location"]),
    scope: firstValue(raw, ["ItbPage3Description", "JobDescription", "Job_Description", "description"]),
    access: firstValue(raw, ["ItbTenantAccessType", "ItbTenantContactStatus", "Location", "location"]),
    phone: firstValue(raw, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "phone"]),
    appointment: firstValue(raw, ["AppointmentAt", "appointmentAt"]),
    status: [firstValue(raw, ["WorkflowStatus"]), firstValue(raw, ["StatusOverride"]), firstValue(raw, ["FieldOutcome"]), firstValue(raw, ["status", "Status"])].filter(Boolean).join(" · "),
  });
}

function readTrip(): ActiveTrip | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActiveTrip) : null;
  } catch {
    return null;
  }
}

function selectedJobId() {
  const sources = [textOf(document.querySelector(".job-drawer.selected-focus")), textOf(document.querySelector(".map-job-brief")), document.querySelector<HTMLInputElement>(".map-face-search input")?.value || ""];
  for (const source of sources) {
    const match = source.match(/\b[A-Z]{2}\d{4,7}\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function visibleButtons(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter((button) => !button.disabled && button.getClientRects().length > 0);
}

function findButton(root: ParentNode, patterns: RegExp[]) {
  return visibleButtons(root).find((button) => patterns.some((pattern) => pattern.test(textOf(button))));
}

function clickButton(root: ParentNode, patterns: RegExp[]) {
  const button = findButton(root, patterns);
  if (!button) return false;
  button.click();
  return true;
}

function ensureSpeakerOn() {
  try {
    window.localStorage.setItem(SPEAKER_STORAGE_KEY, "1");
  } catch {
    // Keep voice enabled for this session.
  }
  const speaker = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-header-actions button")).find((button) => /^speaker(?:\s+on)?$/i.test(textOf(button)));
  if (speaker && !/speaker\s+on/i.test(textOf(speaker))) speaker.click();
}

function speak(message: string) {
  if (!("speechSynthesis" in window) || !message.trim()) return;
  ensureSpeakerOn();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "en-US";
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}

function loadSavedPhase(jobId: string): Phase | null {
  if (!jobId) return null;
  try {
    return window.localStorage.getItem(`${PHASE_STORAGE_PREFIX}${jobId}`) as Phase | null;
  } catch {
    return null;
  }
}

function savePhase(jobId: string, phase: Phase) {
  if (!jobId) return;
  try {
    window.localStorage.setItem(`${PHASE_STORAGE_PREFIX}${jobId}`, phase);
  } catch {
    // The current session can still advance.
  }
}

function mediaCount(cardText: string, kind: "before" | "after") {
  const patterns = [new RegExp(`${kind}[^0-9]{0,30}(\\d+)`, "i"), new RegExp(`(\\d+)[^a-z]{0,8}${kind}`, "i")];
  for (const pattern of patterns) {
    const match = cardText.match(pattern);
    if (match) return Number(match[1]) || 0;
  }
  return 0;
}

function detectedPhase(trip: ActiveTrip | null, card: HTMLElement | null, jobId: string): Phase {
  if (!trip) return document.querySelector(".hpd-ai-route-list > li, .hpd-ai-result-list .hpd-ai-list-main") ? "review" : "morning";
  if (trip.status === "enroute") return "enroute";
  if (!card) return "arrived";

  const cardText = textOf(card).toLowerCase();
  let detected: Phase = "access";
  if (/package ready|invoice package generated|send to rer|package generated/.test(cardText)) detected = "done";
  else if (/no access complete|refused access|completed by others|work completed|partial work|completed\/final/.test(cardText)) detected = "closeout";
  else if (mediaCount(cardText, "after") > 0) detected = "outcome";
  else if (/job started|work started|timer running/.test(cardText) || mediaCount(cardText, "before") > 0) detected = "work";

  const saved = loadSavedPhase(jobId);
  if (saved && PHASE_RANK[saved] > PHASE_RANK[detected]) return saved;
  return detected;
}

function phaseLabel(phase: Phase) {
  const labels: Record<Phase, string> = {
    morning: "Morning plan",
    review: "Review priorities",
    enroute: "Enroute",
    arrived: "Arrived",
    access: "Access check",
    "before-media": "Before media",
    work: "Perform work",
    "after-media": "After media",
    outcome: "Choose outcome",
    closeout: "Invoice + affidavit",
    done: "Finish + next",
  };
  return labels[phase];
}

function promptFor(phase: Phase, job: JobInfo | null, trip: ActiveTrip | null) {
  const id = job?.id || trip?.id || "this job";
  const address = job?.address || trip?.address || "the selected location";
  const prompts: Record<Phase, string> = {
    morning: "Good morning. Tell me which borough to work, or ask which area has the highest priority.",
    review: "I ranked the jobs. Review ETA, distance, access, and scope, then start the recommended stop or build the full route.",
    enroute: `You are enroute to ${id} at ${address}. Directions remain available. Tap Arrived when you are on site.`,
    arrived: `You arrived at ${id}. Open the complete job card, review the scope and access, then confirm whether you have access.`,
    access: `Do you have access for ${id}? If yes, capture before media. If no, record No Access evidence and follow the affidavit workflow.`,
    "before-media": `Capture before media for ${id}. Recommended minimum: two photos and two short videos showing the full condition before work.`,
    work: `Before media is ready for ${id}. Start or continue the work, add notes when needed, and tell me when the work is finished.`,
    "after-media": `Work is finished at ${id}. Capture after photos and videos from matching angles before selecting the outcome.`,
    outcome: `Choose the correct outcome for ${id}: completed, partial, No Access, refused access, or completed by others.`,
    closeout: `Review the affidavit, invoice, labeled media, notes, and complete package for ${id} before sending.`,
    done: `The package for ${id} is ready. Confirm it was saved or sent, then finish this visit and continue to the next stop.`,
  };
  return prompts[phase];
}

function inferOutcome(text: string): PaperworkOutcome {
  const lower = text.toLowerCase();
  if (/partial/.test(lower)) return "partial_work_completed";
  if (/refused/.test(lower)) return "refused_access";
  if (/completed by others|work by others/.test(lower)) return "completed_by_others";
  if (/no\s*access/.test(lower)) return "no_access";
  if (/complete|completed/.test(lower)) return "work_completed";
  return "pending";
}

function openPaperwork(jobId: string, doc: "package" | "affidavit" | "invoice", outcome: PaperworkOutcome) {
  const query = new URLSearchParams({ job: jobId, outcome, doc });
  window.open(`/paperwork?${query.toString()}`, "_blank", "noopener,noreferrer");
}

export default function MapAgentLifecycle() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [card, setCard] = useState<HTMLElement | null>(null);
  const [jobId, setJobId] = useState("");
  const [phase, setPhase] = useState<Phase>("morning");
  const [notice, setNotice] = useState("");
  const lastSpoken = useRef("");
  const currentPhase = useRef<Phase>("morning");

  const job = jobId ? JOBS.get(jobId) || null : null;
  const prompt = promptFor(phase, job, trip);

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "hpd-agent-lifecycle-portal";
    document.body.appendChild(element);
    setHost(element);
    return () => element.remove();
  }, []);

  useEffect(() => {
    if (!host) return;
    const sync = () => {
      ensureSpeakerOn();
      const nextTrip = readTrip();
      const nextCard = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
      const nextJobId = selectedJobId() || nextTrip?.id || "";
      const nextPhase = detectedPhase(nextTrip, nextCard, nextJobId);
      const target = nextCard || (document.fullscreenElement as HTMLElement | null) || document.body;
      if (host.parentElement !== target) {
        if (nextCard) nextCard.prepend(host);
        else target.appendChild(host);
      }
      setTrip(nextTrip);
      setCard(nextCard);
      setJobId(nextJobId);
      setPhase(nextPhase);
      currentPhase.current = nextPhase;
      document.body.dataset.hpdAgentPhase = nextPhase;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "value"] });
    const timer = window.setInterval(sync, 650);
    const onTrip = () => window.setTimeout(sync, 40);
    window.addEventListener("hpd-map-enroute", onTrip);
    window.addEventListener("hpd-map-arrived", onTrip);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("hpd-map-enroute", onTrip);
      window.removeEventListener("hpd-map-arrived", onTrip);
      delete document.body.dataset.hpdAgentPhase;
    };
  }, [host]);

  useEffect(() => {
    const key = `${jobId || "general"}:${phase}`;
    if (lastSpoken.current === key) return;
    lastSpoken.current = key;
    const timer = window.setTimeout(() => speak(prompt), 180);
    return () => window.clearTimeout(timer);
  }, [jobId, phase, prompt]);

  useEffect(() => {
    const unlock = () => speak(promptFor(currentPhase.current, jobId ? JOBS.get(jobId) || null : null, readTrip()));
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [jobId]);

  const advance = (next: Phase, message?: string) => {
    savePhase(jobId, next);
    setPhase(next);
    currentPhase.current = next;
    if (message) setNotice(message);
    window.setTimeout(() => speak(promptFor(next, job, trip)), 80);
  };

  const root: ParentNode = card || document;

  const openMedia = (kind: "before" | "after") => {
    const patterns = kind === "before" ? [/capture.*before/i, /before.*media/i, /before.*photo/i, /start job/i] : [/capture.*after/i, /after.*media/i, /after.*photo/i, /completed work/i];
    const clicked = clickButton(root, patterns);
    if (!clicked) document.querySelector<HTMLElement>(".field-media-option-hub, .field-media-step-cue, [data-field-media-console], .field-evidence-gallery")?.scrollIntoView({ behavior: "smooth", block: "center" });
    advance(kind === "before" ? "before-media" : "after-media", clicked ? `${kind} media workflow opened.` : `Scroll to the media section and choose ${kind} photos or videos.`);
  };

  const noAccess = () => {
    const cardText = textOf(card).toLowerCase();
    const readySecond = /ready.*second|ready 2|72h complete|no access 1st/.test(cardText);
    const patterns = readySecond ? [/no\s*access.*2/i, /2nd.*no\s*access/i] : [/no\s*access.*1/i, /1st.*no\s*access/i, /^no\s*access$/i];
    const clicked = clickButton(root, patterns);
    advance("closeout", clicked ? "No Access workflow opened. Capture evidence and review the affidavit." : "Choose the correct No Access attempt in the complete job card, then review the affidavit.");
  };

  const startWork = () => {
    const clicked = clickButton(root, [/^start job$/i, /begin work/i, /work started/i, /start timer/i]);
    advance("work", clicked ? "Work started." : "Use Start Job in the complete job card after before media is saved.");
  };

  const chooseOutcome = (outcome: PaperworkOutcome) => {
    const patterns: Record<PaperworkOutcome, RegExp[]> = {
      pending: [],
      work_completed: [/completed work/i, /work completed/i, /mark.*complete/i, /complete job/i],
      partial_work_completed: [/partial work/i, /partial.*complete/i],
      no_access: [/no\s*access.*2/i, /2nd.*no\s*access/i, /^no\s*access$/i],
      refused_access: [/refused access/i],
      completed_by_others: [/completed by others/i, /work completed by others/i],
    };
    const clicked = patterns[outcome].length ? clickButton(root, patterns[outcome]) : false;
    advance("closeout", clicked ? "Outcome selected. Review invoice, affidavit, and package." : "Select the matching outcome in the complete job card, then review the package.");
  };

  const inferredOutcome = inferOutcome(`${job?.status || ""} ${card ? textOf(card) : ""}`);
  const paperwork = (doc: "package" | "affidavit" | "invoice") => {
    const patterns = doc === "package" ? [/generate package/i, /open package/i, /^package$/i, /paperwork/i] : doc === "affidavit" ? [/affidavit/i] : [/invoice/i];
    if (!clickButton(root, patterns) && jobId) openPaperwork(jobId, doc, inferredOutcome);
    advance("closeout", `${doc === "package" ? "Complete package" : doc} opened for review.`);
  };

  const finishNext = () => {
    savePhase(jobId, "done");
    const close = card ? findButton(card, [/^close$/i, /close.*job/i, /close.*details/i, /^×$/]) : undefined;
    close?.click();
    try {
      window.localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
    } catch {
      // Continue to route.
    }
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(".hpd-ai-rail")?.click();
      window.setTimeout(() => Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button")).find((button) => /^route\b/i.test(textOf(button)))?.click(), 120);
    }, 160);
    advance("done", "Visit finished. Returning to the route for the next stop.");
  };

  if (!host || !card) return null;

  const steps = ["Plan", "Travel", "Arrive", "Access", "Before", "Work", "After", "Outcome", "Package", "Next"];
  const progress = PHASE_RANK[phase];
  const coach = (
    <section className="hpd-agent-coach" aria-label="AI field agent">
      <header><div><span>AI Field Agent · Speaker always on</span><strong>{phaseLabel(phase)}</strong><small>{jobId || "Selected job"}</small></div><button type="button" onClick={() => speak(prompt)}>Repeat</button></header>
      <div className="hpd-agent-coach-steps">{steps.map((step, index) => <span key={step} className={index < progress ? "done" : index === progress ? "active" : ""}><b>{index + 1}</b><small>{step}</small></span>)}</div>
      <p>{prompt}</p>
      {notice ? <div className="hpd-agent-notice">{notice}</div> : null}
      {job ? <div className="hpd-agent-job-brief"><article><span>Address</span><b>{job.address || "Not listed"}</b></article><article><span>Access</span><b>{job.access || "Not listed"}</b></article><article><span>Phone</span><b>{job.phone || "Not listed"}</b></article><article><span>Appointment</span><b>{job.appointment || "None scheduled"}</b></article><article className="scope"><span>Work summary</span><b>{truncate(job.scope || "No scope available.", 220)}</b></article></div> : null}
      <div className="hpd-agent-primary-actions">
        {phase === "access" ? <><button type="button" className="primary" onClick={() => advance("before-media", "Access confirmed. Capture before media now.")}>Access granted</button><button type="button" className="warning" onClick={noAccess}>No access</button></> : null}
        {phase === "before-media" ? <><button type="button" className="primary" onClick={() => openMedia("before")}>Capture before media</button><button type="button" onClick={startWork}>Start work</button></> : null}
        {phase === "work" ? <><button type="button" onClick={startWork}>Start / resume work</button><button type="button" className="primary" onClick={() => openMedia("after")}>Work finished</button></> : null}
        {phase === "after-media" ? <><button type="button" className="primary" onClick={() => openMedia("after")}>Capture after media</button><button type="button" onClick={() => advance("outcome")}>Media complete</button></> : null}
        {phase === "outcome" ? <><button type="button" className="primary" onClick={() => chooseOutcome("work_completed")}>Completed</button><button type="button" onClick={() => chooseOutcome("partial_work_completed")}>Partial</button><button type="button" className="warning" onClick={() => chooseOutcome("no_access")}>No Access</button><button type="button" onClick={() => chooseOutcome("refused_access")}>Refused</button><button type="button" onClick={() => chooseOutcome("completed_by_others")}>By others</button></> : null}
        {phase === "closeout" || phase === "done" ? <><button type="button" onClick={() => paperwork("affidavit")}>Affidavit</button><button type="button" onClick={() => paperwork("invoice")}>Invoice</button><button type="button" className="primary" onClick={() => paperwork("package")}>Full package</button><button type="button" onClick={finishNext}>Finish + next</button></> : null}
      </div>
      <div className="hpd-agent-secondary-actions"><button type="button" onClick={() => openMedia("before")}>Before media</button><button type="button" onClick={() => openMedia("after")}>After media</button><button type="button" onClick={noAccess}>No Access</button><button type="button" onClick={() => paperwork("package")}>Paperwork</button></div>
    </section>
  );

  return createPortal(coach, host);
}
