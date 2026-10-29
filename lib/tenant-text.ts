// Text the tenant (owner, 22 Oct: "once I have the tenant info, the AI needs to reach out to the tenant and describe
// the job; a text message is good; if they follow up, remind me to call"). The app writes the text (the AI when it's
// on, else this ready one), opens the phone's Messages with it, and the owner presses Send: nothing is sent by itself.
// The app keeps when it was texted / when they replied, and says when to call.

// The first text is the first record of contact (owner, 29 Oct: "send the tenant a professional text that outlines the
// description of their work order; it doesn't have to be complete, the description summary"): who we are, that HPD
// assigned us, HPD's work order number, and the job summary (two lines at most), then a day and time.
export function tenantJobSummary(job: string) {
  const parts = String(job || "").replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim().split(/,\s*/).filter(Boolean);
  let out = "";
  for (const p of parts) { const next = out ? `${out}, ${p}` : p; if (next.length > 140 && out) break; out = next; }
  return out.length > 160 ? `${out.slice(0, 157).replace(/\s+\S*$/, "")}…` : out || "the repair";
}
export function tenantTextDraft(input: { name?: string; address: string; apt?: string; job: string; company?: string; omo?: string }) {
  const first = String(input.name || "").replace(/[^A-Za-z' -]/g, " ").trim().split(/\s+/)[0] || "";
  const hello = first && first.length > 1 ? `Hello ${first[0].toUpperCase()}${first.slice(1).toLowerCase()}` : "Hello";
  const where = `${input.address.replace(/,\s*\d{5}$/, "")}${input.apt ? `, apt ${input.apt.replace(/^apt\.?\s*/i, "")}` : ""}`;
  return `${hello}, this is Jot from ${input.company || "United Angel Construction"}, the contractor NYC HPD assigned to the repair at ${where}${input.omo ? ` (HPD work order ${input.omo})` : ""}. The work: ${tenantJobSummary(input.job)}. When is a good day and time for us to come? Please reply here or call this number. Thank you!`;
}

// The Messages app with the number and the text filled in (iPhone uses "&body=", others "?body=").
export function smsHref(phone: string, body: string, ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return `sms:${digits}${/iPhone|iPad|iPod|Macintosh/.test(ua) ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

// What to do next with the tenant: nothing yet / waiting for an answer / call (no visit or appointment by the next
// morning, or they replied).
export type TenantStep = { state: "none" | "waiting" | "call"; textedAt: string; repliedAt: string; why: string };
export function tenantStep(job: Record<string, unknown>, now = Date.now()): TenantStep {
  const textedAt = String(job.TenantTextedAt || "");
  const repliedAt = String(job.TenantRepliedAt || "");
  if (!textedAt) return { state: "none", textedAt, repliedAt, why: "" };
  const visited = ["FieldArrivedAt", "VisitStartedAt", "FieldOutcome", "AppointmentStart", "appointmentStart"].some((k) => {
    const v = String(job[k] || "");
    return v && v !== "VISIT_STARTED" ? (k.startsWith("Field") || k === "VisitStartedAt" ? Date.parse(v) > Date.parse(textedAt) || /[A-Z_]{5,}/.test(v) : true) : false;
  });
  if (visited) return { state: "none", textedAt, repliedAt, why: "" };
  if (repliedAt) return { state: "call", textedAt, repliedAt, why: "They replied: call them back." };
  // The next morning (8 AM New York) after the text, with no visit or appointment.
  const t = new Date(textedAt);
  const ny = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  const nextMorning = ny(new Date(now)) > ny(t) && hour >= 8;
  return nextMorning ? { state: "call", textedAt, repliedAt, why: "No answer since the text: give them a call." } : { state: "waiting", textedAt, repliedAt, why: "Waiting for their answer." };
}

// 👤 Where things stand with the tenant (owner, 29 Oct: "the most important thing on the job is to contact the tenant,
// especially an apartment job; a public hallway is different; record the interaction on the job card permanently,
// that's going to be the truth"). From the job's log (FieldVisitHistory: every call, text, reply and appointment):
// ok = reached (talked, they replied, or an appointment), try = called / texted but not reached, none = nothing yet,
// common = a public-area job with no tenant to reach.
export type ContactEntry = { recordedAt?: string; outcome?: string | null; note?: string };
export type ContactState = { tone: "none" | "try" | "ok" | "common"; tries: number; reachedAt: string; lastAt: string; log: ContactEntry[] };
export function tenantContactState(job: Record<string, unknown>, commonArea = false): ContactState {
  const log = (Array.isArray(job.FieldVisitHistory) ? job.FieldVisitHistory as ContactEntry[] : [])
    .filter((v) => /tenant/i.test(String(v?.note || "")) || /^APPOINTMENT_/.test(String(v?.outcome || "")));
  const reached = [...log].reverse().find((v) => /^APPOINTMENT_/.test(String(v.outcome || "")) || /talked|replied/i.test(String(v.note || "")));
  const reachedAt = String(reached?.recordedAt || (job.TenantCallResult === "talked" ? job.TenantCalledAt || "" : "") || job.TenantRepliedAt || "");
  const tries = log.filter((v) => /^(Called|Texted) the tenant/.test(String(v.note || ""))).length;
  const lastAt = String(log[log.length - 1]?.recordedAt || "");
  return { tone: reachedAt ? "ok" : commonArea ? "common" : tries ? "try" : "none", tries, reachedAt, lastAt, log };
}
