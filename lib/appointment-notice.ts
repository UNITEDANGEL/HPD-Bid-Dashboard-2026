// 📅 -> ✉ Appointments go to vendor tracking (owner, 6 Nov: "I just scheduled an appointment for Tuesday. That
// appointment should automatically be sent to Lewis also, just to keep her in the loop ... Lewis is vendor tracking
// for ERP, Gafur for AEP"). When an appointment is saved, the job's unit gets a short email: Lewis for Emergency
// Repair (ERP) jobs, Gafur for AEP (Alternative Enforcement Program) jobs. No tenant name or phone in it.

import type { Appointment } from "./appointments";

export type Unit = "erp" | "aep";
export const UNIT_NAMES: Record<Unit, string> = { erp: "Lewis", aep: "Gafur" };

// AEP jobs say so in the work description ("AEP ...", "ALTERNATIVE ENFORCEMENT PROGRAM").
export const unitOf = (description: string): Unit => (/\bAEP\b|alternative enforcement/i.test(String(description || "")) ? "aep" : "erp");

// Their @hpd.nyc.gov address, from their own emails on the board: Lewis signs the 24 / 72-hour notices, Gafur the
// missing-documents lists.
export function unitEmail(unit: Unit, rows: { kind: string; who: string; to: string; noticeAt: string }[]) {
  const name = UNIT_NAMES[unit];
  const mine = rows.filter((r) => r.to && (r.kind === (unit === "erp" ? "ppn" : "docs")) && new RegExp(name, "i").test(r.who))
    .sort((a, b) => Date.parse(b.noticeAt) - Date.parse(a.noticeAt));
  const any = mine[0] || rows.filter((r) => r.to && new RegExp(name, "i").test(r.who))[0];
  return any ? { to: any.to, who: any.who } : null;
}

const clock = (hhmm: string) => {
  if (!/^\d{1,2}:\d{2}/.test(String(hhmm || ""))) return "";
  const [h, m] = String(hhmm).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export function appointmentWhen(a: Pick<Appointment, "date" | "start" | "end">) {
  const d = new Date(`${a.date}T12:00:00Z`);
  const day = Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "numeric", day: "numeric" }) : a.date;
  const s = clock(a.start), e = clock(a.end);
  return `${day}${s ? `${e ? ` between ${s} and ${e}` : ` at ${s}`}` : ""}`;
}

export function appointmentEmail(input: { omo: string; address: string; appointment: Pick<Appointment, "date" | "start" | "end">; who: string; changed?: boolean }) {
  const first = String(input.who || "").trim().split(/\s+/)[0] || "";
  const when = appointmentWhen(input.appointment);
  return {
    subject: `OMO# ${input.omo} - appointment ${input.changed ? "changed to" : "scheduled for"} ${when.split(" between")[0].split(" at ")[0]}`,
    text: `Hello${first ? ` ${first}` : ""},\n\nRe: OMO# ${input.omo}${input.address ? ` - ${input.address}` : ""}\n\nTo keep you in the loop: we ${input.changed ? "moved" : "scheduled"} the appointment with the tenant for ${when} to do the work. We will send you an update after the visit.\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`,
  };
}
