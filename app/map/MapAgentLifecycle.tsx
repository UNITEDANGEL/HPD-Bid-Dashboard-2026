"use client";

import bundledJobsData from "../../data/COA_Fetcher_2026.json";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type JobRecord = Record<string, unknown>;
type Phase =
  | "morning"
  | "review"
  | "enroute"
  | "arrived"
  | "access"
  | "before-media"
  | "work"
  | "after-media"
  | "outcome"
  | "closeout"
  | "done";
type PaperworkOutcome = "pending" | "work_completed" | "partial_work_completed" | "no_access" | "refused_access" | "completed_by_others";
type ActiveTrip = {
  id: string;
  address: string;
  status: "enroute" | "arrived";
  directionsUrl?: string;
  lat?: number;
  lng?: number;
};
type JobInfo = {
  id: string;
  address: string;
  scope: string;
  access: string;
  phone: string;
  appointment: string;
  status: string;
};

const ACTIVE_TRIP_STORAGE_KEY = "hpd-ai-active-trip-v1";
const SPEAKER_STORAGE_KEY = "hpd-ai-speaker-always-on-v1";
const PHASE_STORAGE_PREFIX = "hpd-ai-field-phase-v1:";

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

function truncate(value: string, length = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length).trim()}…`;
}

const JOB_INDEX = new Map<string, JobInfo>();
for (const raw of bundledJobsData as JobRecord[]) {
  const id = firstValue(raw, ["OMO", "omo", "jobId", "id"]).toUpperCase();
  if (!id) continue;
  JOB_INDEX.set(id, {
    id,
    address: firstValue(raw, ["BuildingAddress", "Building_Address", "Address", "address", "location"]),
    scope: firstValue(raw, ["ItbPage3Description", "JobDescription", "Job_Description", "description"]),
    access: firstValue(raw, ["ItbTenantAccessType", "ItbTenantContactStatus", "Location", "location"]),
    phone: firstValue(raw, ["ItbTenantPhone", "TenantPhone", "tenantPhone", "phone"]),
    appointment: firstValue(raw, ["AppointmentAt", "appointmentAt"]),
    status: [
      firstValue(raw, ["WorkflowStatus"]),
      firstValue(raw, ["StatusOverride"]),
      firstValue(raw, ["FieldOutcome"]),
      firstValue(raw, ["status", "Status"]),
    ].filter(Boolean).join(" · "),
  });
}

function readTrip(): ActiveTrip | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTrip;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function selectedJobId() {
  const sources = [
    textOf(document.querySelector(".job-drawer.selected-focus")),
    textOf(document.querySelector(".map-job-brief")),
    document.querySelector<HTMLInputElement>(".map-face-search input")?.value || "",
  ];
  for (const source of sources) {
    const match = source.match(/\b[A-Z]{2}\d{4,7}\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function visibleButtons(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => !button.disabled && button.getClientRects().length > 0,
  );
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

function clickCloseJobCard() {
  const root = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
  if (!root) return false;
  const button = findButton(root, [/^close$/i, /close.*job/i, /close.*details/i, /^×$/]);
  button?.click();
  return Boolean(button);
}

function ensureSpeakerOn() {
  try {
    window.localStorage.setItem(SPEAKER_STORAGE_KEY, "1");
  } catch {
    // Voice still works for the current session.
  }
  const speaker = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-header-actions button"))
    .find((button) => /^speaker(?:\s+on)?$/i.test(textOf(button)));
  if (speaker && !/speaker\s+on/i.test(textOf(speaker))) speaker.click();
}

function speak(text: string) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  ensureSpeakerOn();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

function storedPhase(jobId: string): Phase | null {
  if (!jobId) return null;
  try {
    const value = window.localStorage.getItem(`${PHASE_STORAGE_PREFIX}${jobId}`) as Phase | null;
    return value;
  } catch {
    return null;
  }
}

function savePhase(jobId: string, phase: Phase) {
  if (!jobId) return;
  try {
    window.localStorage.setItem(`${PHASE_STORAGE_PREFIX}${jobId}`, phase);
  } catch {
    // The live session still advances.
  }
}

function inferOutcome(text: string): PaperworkOutcome {
  const normalized = text.toLowerCase();
  if (/partial/.test(normalized)) return "partial_work_completed";
  if (/refused/.test(normalized)) return "refused_access";
  if (/completed by others|work by others/.test(normalized)) return "completed_by_others";
  if (/no\s*access/.test(normalized)) return "no_access";
  if (/complete|completed/.test(normalized)) return "work_completed";
  return "pending";
}

function mediaCount(rootText: string, kind: "before" | "after") {
  const patterns = [
    new RegExp(`${kind}[^0-9]{0,30}(\\d+)`, "i"),
    new RegExp(`(\\d+)[^a-z]{0,8}${kind}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = rootText.match(pattern);
    if (match) return Number(match[1]) || 0;
  }
  return 0;
}

function detectedPhase(trip: ActiveTrip | null, jobCard: HTMLElement | null, jobId: string): Phase {
  const saved = storedPhase(jobId);
  if (saved) return saved;
  if (!trip) {
    if (document.querySelector(".hpd-ai-route-list > li, .hpd-ai-result-list .hpd-ai-list-main")) return "review";
    return "morning";
  }
  if (trip.status === "enroute") return "enroute";
  if (!jobCard) return "arrived";

  const cardText = textOf(jobCard).toLowerCase();
  const before = mediaCount(cardText, "before");
  const after = mediaCount(cardText, "after");
  if (/package ready|invoice package generated|affidavit.*generated|send to rer/.test(cardText)) return "done";
  if (/no access complete|refused access|completed by others|work completed|partial work|completed\/final/.test(cardText)) return "closeout";
  if (after > 0) return "outcome";
  if (/job started|work started|timer running/.test(cardText)) return "work";
  if (before > 0) return "work";
  return "access";
}

function promptFor(phase: Phase, job: JobInfo | null, trip: ActiveTrip | null) {
  const id = job?.id || trip?.id || "this job";
  const address = job?.address || trip?.address || "the selected location";
  const prompts: Record<Phase, string> = {
    morning: "Good morning. I am ready to plan the day. Tell me the borough or ask which area has the highest priority.",
    review: "I ranked the available jobs. Review ETA, distance, access, and work summary. Then start the recommended stop or build the complete route.",
    enroute: `You are enroute to ${id} at ${address}. I will keep directions available and prompt you when it is time to mark Arrived.`,
    arrived: `You arrived at ${id}. Open the complete job card. First review the scope and access requirement, then confirm whether you have access.`,
    access: `Field check for ${id}. Do you have access? If yes, capture before media before starting work. If no, record No Access evidence and prepare the affidavit workflow.`,
    "before-media": `Capture before media for ${id}. The recommended minimum is two photos and two short videos showing the full condition before work.`,
    work: `Before media is ready for ${id}. Start the work, keep notes as needed, and tell me when the work is finished.`,
    "after-media": `Work is finished at ${id}. Capture after photos and videos from matching angles before selecting the final outcome.`,
    outcome: `Choose the correct outcome for ${id}: completed, partial, No Access, refused access, or completed by others. I will then prepare the correct invoice and affidavit package.`,
    closeout: `Closeout for ${id}. Review the affidavit, invoice, labeled media, notes, and complete package before sending.`,
    done: `The package for ${id} is ready. Confirm it was saved or sent, close the job card, and I will guide you to the next route stop.`,
  };
  return prompts[phase];
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

function workflowProgress(phase: Phase) {
  const phases: Phase[] = ["morning", "review", "enroute", "arrived", "access", "before-media", "work", "after-media", "outcome", "closeout", "done"];
  return Math.max(0, phases.indexOf(phase));
}

function openPaperwork(jobId: string, doc: "package" | "affidavit" | "invoice", outcome: PaperworkOutcome) {
  const params = new URLSearchParams({ job: jobId, outcome, doc });
  window.open(`/paperwork?${params.toString()}`, "_blank", "noopener,noreferrer");
}

export default function MapAgentLifecycle() {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [jobCard, setJobCard] = useState<HTMLElement | null>(null);
  const [jobId, setJobId] = useState("");
  const [phase, setPhase] = useState<Phase>("morning");
  const [notice, setNotice] = useState("");
  const lastSpokenRef = useRef("");
  const phaseRef = useRef<Phase>("morning");

  const job = jobId ? JOB_INDEX.get(jobId) || null : null;
  const prompt = promptFor(phase, job, trip);

  useEffect(() => {
    const host = document.createElement("div");
    host.className = "hpd-agent-lifecycle-portal";
    document.body.appendChild(host);
    setPortalHost(host);
    const move = () => {
      const target = (document.fullscreenElement as HTMLElement | null) || document.body;
      if (host.parentElement !== target) target.appendChild(host);
    };
    document.addEventListener("fullscreenchange", move);
    move();
    return () => {
      document.removeEventListener("fullscreenchange", move);
      host.remove();
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      ensureSpeakerOn();
      const nextTrip = readTrip();
      const nextCard = document.querySelector<HTMLElement>(".job-drawer.selected-focus");
      const nextJobId = selectedJobId() || nextTrip?.id || "";
      const nextPhase = detectedPhase(nextTrip, nextCard, nextJobId);
      setTrip(nextTrip);
      setJobCard(nextCard);
      setJobId(nextJobId);
      setPhase(nextPhase);
      phaseRef.current = nextPhase;
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
  }, []);

  useEffect(() => {
    const key = `${jobId || "general"}:${phase}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    const timer = window.setTimeout(() => speak(prompt), 180);
    return () => window.clearTimeout(timer);
  }, [jobId, phase, prompt]);

  useEffect(() => {
    const unlockVoice = () => {
      ensureSpeakerOn();
      const key = `${jobId || "general"}:${phaseRef.current}:gesture`;
      if (lastSpokenRef.current !== key) {
        lastSpokenRef.current = key;
        speak(promptFor(phaseRef.current, jobId ? JOB_INDEX.get(jobId) || null : null, readTrip()));
      }
    };
    document.addEventListener("pointerdown", unlockVoice, { once: true });
    return () => document.removeEventListener("pointerdown", unlockVoice);
  }, [jobId]);

  const advance = (next: Phase, message?: string) => {
    if (jobId) savePhase(jobId, next);
    setPhase(next);
    phaseRef.current = next;
    if (message) setNotice(message);
    window.setTimeout(() => speak(promptFor(next, job, trip)), 80);
  };

  const root = jobCard || document;

  const openMedia = (kind: "before" | "after") => {
    const patterns = kind === "before"
      ? [/capture.*before/i, /before.*media/i, /before.*photo/i, /start job/i]
      : [/capture.*after/i, /after.*media/i, /after.*photo/i, /completed work/i];
    const clicked = clickButton(root, patterns);
    if (!clicked) {
      const target = document.querySelector<HTMLElement>(".field-media-option-hub, .field-media-step-cue, [data-field-media-console], .field-evidence-gallery");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      setNotice(`Media section opened. Choose ${kind} photos or videos.`);
    }
    advance(kind === "before" ? "before-media" : "after-media");
  };

  const markAccessGranted = () => {
    advance("before-media", "Access confirmed. Capture before media now.");
  };

  const markNoAccess = () => {
    const clicked = clickButton(root, [/no\s*access.*1/i, /1st.*no\s*access/i, /^no\s*access$/i, /record.*no\s*access/i]);
    setNotice(clicked ? "No Access workflow opened." : "Open the status section and choose No Access 1st or No Access 2nd as appropriate.");
    advance("closeout");
  };

  const startWork = () => {
    const clicked = clickButton(root, [/^start job$/i, /begin work/i, /work started/i, /start timer/i]);
    setNotice(clicked ? "Work started." : "Before media is ready. Use the Start Job control in the complete job card.");
    advance("work");
  };

  const workDone = () => {
    openMedia("after");
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
    setNotice(clicked ? "Outcome selected. Review the paperwork package next." : "Select the matching outcome in the complete job card, then review the package.");
    advance("closeout");
  };

  const inferredOutcome = inferOutcome(`${job?.status || ""} ${jobCard ? textOf(jobCard) : ""}`);

  const paperwork = (doc: "package" | "affidavit" | "invoice") => {
    const patterns = doc === "package" ? [/generate package/i, /open package/i, /^package$/i, /paperwork/i]
      : doc === "affidavit" ? [/affidavit/i]
        : [/invoice/i];
    const clicked = clickButton(root, patterns);
    if (!clicked && jobId) openPaperwork(jobId, doc, inferredOutcome);
    setNotice(`${doc === "package" ? "Complete package" : doc} opened for review.`);
    advance("closeout");
  };

  const finishAndNext = () => {
    if (jobId) savePhase(jobId, "done");
    clickCloseJobCard();
    try {
      window.localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
    } catch {
      // Continue to the route even if storage is unavailable.
    }
    window.setTimeout(() => {
      const rail = document.querySelector<HTMLButtonElement>(".hpd-ai-rail");
      rail?.click();
      window.setTimeout(() => {
        const routeTab = Array.from(document.querySelectorAll<HTMLButtonElement>(".hpd-ai-tabs button"))
          .find((button) => /^route\b/i.test(textOf(button)));
        routeTab?.click();
      }, 120);
    }, 160);
    setNotice("Job closed. Returning to the route for the next stop.");
    advance("done");
  };

  if (!portalHost) return null;

  const steps = ["Plan", "Travel", "Arrive", "Access", "Before", "Work", "After", "Outcome", "Package", "Next"];
  const progress = workflowProgress(phase);

  const coach = jobCard ? (
    <section className="hpd-agent-coach" aria-label="AI field agent">
      <header>
        <div><span>AI Field Agent · Speaker always on</span><strong>{phaseLabel(phase)}</strong><small>{jobId || "Selected job"}</small></div>
        <button type="button" onClick={() => speak(prompt)}>Repeat</button>
      </header>

      <div className="hpd-agent-coach-steps">
        {steps.map((step, index) => <span key={step} className={index < progress ? "done" : index === progress ? "active" : ""}><b>{index + 1}</b><small>{step}</small></span>)}
      </div>

      <p>{prompt}</p>
      {notice ? <div className="hpd-agent-notice">{notice}</div> : null}

      {job ? (
        <div className="hpd-agent-job-brief">
          <article><span>Address</span><b>{job.address || "Not listed"}</b></article>
          <article><span>Access</span><b>{job.access || "Not listed"}</b></article>
          <article><span>Phone</span><b>{job.phone || "Not listed"}</b></article>
          <article><span>Appointment</span><b>{job.appointment || "None scheduled"}</b></article>
          <article className="scope"><span>Work summary</span><b>{truncate(job.scope || "No scope available.", 220)}</b></article>
        </div>
      ) : null}

      <div className="hpd-agent-primary-actions">
        {phase === "access" ? <><button type="button" className="primary" onClick={markAccessGranted}>Access granted</button><button type="button" className="warning" onClick={markNoAccess}>No access</button></> : null}
        {phase === "before-media" ? <><button type="button" className="primary" onClick={() => openMedia("before")}>Capture before media</button><button type="button" onClick={startWork}>Start work</button></> : null}
        {phase === "work" ? <><button type="button" onClick={startWork}>Start / resume work</button><button type="button" className="primary" onClick={workDone}>Work finished</button></> : null}
        {phase === "after-media" ? <><button type="button" className="primary" onClick={() => openMedia("after")}>Capture after media</button><button type="button" onClick={() => advance("outcome")}>Media complete</button></> : null}
        {phase === "outcome" ? <><button type="button" className="primary" onClick={() => chooseOutcome("work_completed")}>Completed</button><button type="button" onClick={() => chooseOutcome("partial_work_completed")}>Partial</button><button type="button" className="warning" onClick={() => chooseOutcome("no_access")}>No Access</button><button type="button" onClick={() => chooseOutcome("refused_access")}>Refused</button><button type="button" onClick={() => chooseOutcome("completed_by_others")}>By others</button></> : null}
        {phase === "closeout" || phase === "done" ? <><button type="button" onClick={() => paperwork("affidavit")}>Affidavit</button><button type="button" onClick={() => paperwork("invoice")}>Invoice</button><button type="button" className="primary" onClick={() => paperwork("package")}>Full package</button><button type="button" onClick={finishAndNext}>Finish + next</button></> : null}
      </div>

      <div className="hpd-agent-secondary-actions">
        <button type="button" onClick={() => openMedia("before")}>Before media</button>
        <button type="button" onClick={() => openMedia("after")}>After media</button>
        <button type="button" onClick={markNoAccess}>No Access</button>
        <button type="button" onClick={() => paperwork("package")}>Paperwork</button>
      </div>
    </section>
  ) : null;

  return coach ? createPortal(coach, jobCard) : null;
}
