// Every job from award to payment (owner, 23 Oct: "track throughout the job all the way to close and payment
// received"): which stage it's in, what that stage means, and what to do. Plain data in, so it can be tested.

export type TrackerStage = "text" | "waiting" | "book" | "appointment" | "work" | "paperwork" | "sent" | "payment" | "closed" | "paid";

export const TRACKER_STAGES: { key: TrackerStage; icon: string; label: string; todo: string }[] = [
  { key: "text", icon: "📱", label: "Text the tenant", todo: "New: ask the tenant for a day and time." },
  { key: "waiting", icon: "⏳", label: "Waiting on the tenant", todo: "Texted; no answer yet." },
  { key: "book", icon: "📞", label: "Call / book a time", todo: "They answered, or 24 hours with no answer: call and set the appointment." },
  { key: "appointment", icon: "📅", label: "Appointment set", todo: "Go on the day." },
  { key: "work", icon: "🔨", label: "Work started", todo: "Finish and save the outcome." },
  { key: "paperwork", icon: "📄", label: "Paperwork to make", todo: "Make the affidavit and invoice and send them." },
  { key: "sent", icon: "📤", label: "Sent · HPD to close", todo: "Wait for HPD to close it; follow up if it takes long." },
  { key: "payment", icon: "💵", label: "Closed · waiting for payment", todo: "Watch PIP; fix any rejection." },
  { key: "closed", icon: "🗂", label: "Closed · no PIP record", todo: "HPD closed it over 90 days ago and PIP has no record of it (PIP doesn't list every job): check PIP if you're not sure it was paid." },
  { key: "paid", icon: "✅", label: "Paid", todo: "Done." },
];

export type TrackerInput = {
  id: string;
  outcome: string;          // saved field outcome code ("" if none)
  arrived: boolean;
  appointment: boolean;     // an active (requested / confirmed) appointment
  tenantStep: "none" | "waiting" | "call" | string;
  approved: boolean;        // paperwork approved
  followState: string;      // job-followup state: done / hpd-closed / sent / overdue / due-week / open
  sentAt: string;
  paid: number;             // PIP paid
  outstanding: number;      // PIP still owed
  inPip: boolean;
  awardAgeDays?: number;    // days since the award (old closed jobs without a PIP record go to "closed")
};

export function trackerStage(j: TrackerInput): TrackerStage {
  const closed = j.followState === "done" || j.followState === "hpd-closed";
  if (j.inPip && j.paid > 0 && j.outstanding <= 0) return "paid";
  if (j.inPip && j.outstanding > 0 && (closed || j.sentAt)) return "payment";
  if (closed && !j.inPip && (j.awardAgeDays ?? 0) > 90) return "closed";
  if (closed) return "payment";
  if (j.sentAt || j.followState === "sent") return "sent";
  const finished = Boolean(j.outcome) && !/APPOINTMENT/.test(j.outcome) && !/WAITING/.test(j.outcome);
  if (finished || j.approved) return "paperwork";
  if (j.arrived) return "work";
  if (j.appointment) return "appointment";
  if (j.tenantStep === "call") return "book";
  if (j.tenantStep === "waiting") return "waiting";
  return "text";
}

export function groupByStage<T extends TrackerInput>(jobs: T[]) {
  const out = Object.fromEntries(TRACKER_STAGES.map((s) => [s.key, [] as T[]])) as Record<TrackerStage, T[]>;
  for (const j of jobs) out[trackerStage(j)].push(j);
  return out;
}
