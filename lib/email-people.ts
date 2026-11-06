// ✉️ Email from the app (owner, 6 Nov, said to the helper: "Add email feature to the app"). Who can get one: the HPD
// people who wrote to you (from their own emails on the board), Lewis (ERP vendor tracking) and Gafur (AEP) first.
// The server only sends to an @hpd.nyc.gov address, or to you ("send to me first"), so nothing goes anywhere else.

import { UNIT_NAMES, type Unit } from "./appointment-notice";

export type EmailPerson = { to: string; who: string; unit: Unit | "" };

const HPD = /^[a-z0-9._%+-]+@hpd\.nyc\.gov$/i;
export const isHpdAddress = (to: string) => HPD.test(String(to || "").trim());

export function emailPeople(rows: { who: string; to: string; noticeAt: string }[]): EmailPerson[] {
  const seen = new Map<string, EmailPerson & { at: number }>();
  for (const r of rows) {
    const to = String(r.to || "").trim().toLowerCase();
    if (!isHpdAddress(to)) continue;
    const at = Date.parse(r.noticeAt) || 0;
    const unit: Unit | "" = new RegExp(UNIT_NAMES.erp, "i").test(r.who) ? "erp" : new RegExp(UNIT_NAMES.aep, "i").test(r.who) ? "aep" : "";
    const cur = seen.get(to);
    if (!cur || at > cur.at) seen.set(to, { to, who: String(r.who || to).trim(), unit, at });
  }
  const rank = (p: EmailPerson) => (p.unit === "erp" ? 0 : p.unit === "aep" ? 1 : 2);
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || b.at - a.at).map(({ to, who, unit }) => ({ to, who, unit }));
}

export const firstName = (who: string) => String(who || "").trim().split(/[\s,]+/)[0] || "";

// Ready-made lines (one tap), so a short email is two taps and a check.
export const EMAIL_LINES: { key: string; label: string; text: (omo: string) => string }[] = [
  { key: "done", label: "✅ Work is done", text: (o) => `The work on OMO# ${o} is finished. The paperwork (affidavit, invoice and photos) follows.` },
  { key: "noaccess", label: "🚪 No access", text: (o) => `I went to OMO# ${o} today and could not get access. I will try again and keep you posted.` },
  { key: "appt", label: "📅 Appointment set", text: (o) => `An appointment with the tenant is set for OMO# ${o}. I will update you after the visit.` },
  { key: "sent", label: "📄 Paperwork sent", text: (o) => `The paperwork for OMO# ${o} was sent. Please let me know if anything is missing.` },
  { key: "question", label: "❓ Question", text: (o) => `I have a question about OMO# ${o}: ` },
];

export function emailDraft(input: { omo?: string; address?: string; who?: string; line?: string }) {
  const omo = String(input.omo || "").trim();
  const name = firstName(input.who || "");
  const subject = omo ? `OMO# ${omo}${input.address ? ` - ${String(input.address).trim()}` : ""}` : "";
  const text = `${name ? `Hi ${name},` : "Hello,"}\n\n${input.line || ""}\n\nThank you,\nJot Singh\nUnited Angel Construction Corp`;
  return { subject: subject.slice(0, 200), text };
}
