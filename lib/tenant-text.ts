// Text the tenant (owner, 22 Oct: "once I have the tenant info, the AI needs to reach out to the tenant and describe
// the job; a text message is good; if they follow up, remind me to call"). The app writes the text (the AI when it's
// on, else this ready one), opens the phone's Messages with it, and the owner presses Send: nothing is sent by itself.
// The app keeps when it was texted / when they replied, and says when to call.

export function tenantTextDraft(input: { name?: string; address: string; apt?: string; job: string; company?: string }) {
  const first = String(input.name || "").replace(/[^A-Za-z' -]/g, " ").trim().split(/\s+/)[0] || "";
  const hello = first && first.length > 1 ? `Hi ${first[0].toUpperCase()}${first.slice(1).toLowerCase()}` : "Hello";
  const where = `${input.address.replace(/,\s*\d{5}$/, "")}${input.apt ? `, apt ${input.apt.replace(/^apt\.?\s*/i, "")}` : ""}`;
  const job = String(input.job || "the repair").replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
  return `${hello}, this is Jot from ${input.company || "United Angel Construction"}. HPD sent us to do a repair at ${where}: ${job}. When is a good day and time for us to come? Please text or call back at this number. Thank you!`;
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
