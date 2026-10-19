// The owner's priority list (16 Oct 2026): everything HPD is waiting on, most urgent first, so nothing is missed:
// 24-hour poor performance notices, 72-hour ones, missing-documents lists (AEP), rejected paperwork to fix, and fixed
// paperwork still to print and mail. Each item says who asked, what for, the deadline and what we already sent.

import { dueAfterWeekdays } from "./business-days";

export type PriorityThread = { id: string; subject: string; omos: string[]; kind: string; people: string[]; lastAt: string; waiting: boolean; messages: { at: string; text: string; hpd: boolean; mine: boolean }[] };
export type PriorityKind = "24h" | "72h" | "missing" | "rejection" | "print";
export type PriorityItem = {
  key: string; omo: string; kind: PriorityKind; title: string; who: string; askedAt: string;
  dueAt: string | null;       // deadline (24 / 72 hours after the notice), null when HPD gave none
  want: string;               // what HPD wants, in plain words
  sentAt: string;             // when we sent paperwork for this job (empty: none on record)
  threadId: string;           // the email thread (to open it)
};

const KIND_ORDER: Record<PriorityKind, number> = { "24h": 0, "72h": 1, rejection: 2, missing: 3, print: 4 };
// Deadlines count weekdays only (a 24-hour notice from Friday is due Monday).
const hours = (iso: string, h: number) => dueAfterWeekdays(iso, h);

export function buildPriorities(input: {
  threads: PriorityThread[];
  rejections: { omo: string; at: string; reason: string; by: string }[];
  toPrint: { omo: string; savedAt: string; mailedAt?: string; reason?: string }[];
  sent: Record<string, { sentAt?: string }>;
  done: Record<string, string>; // key -> when handled (owner tapped "Handled")
  closed?: Set<string>;          // jobs HPD closed or PIP paid: nothing left to do
  now?: number;
}): PriorityItem[] {
  // Only what's live: poor performance notices from the last 3 weeks, missing-documents lists from the last month.
  const now = input.now ?? Date.now();
  const within = (iso: string, days: number) => now - Date.parse(iso) <= days * 86400000;
  const closed = input.closed || new Set<string>();
  const items: PriorityItem[] = [];
  const seen = new Set<string>();
  const add = (it: PriorityItem) => { if (seen.has(it.key) || input.done[it.key] || (it.kind !== "print" && closed.has(it.omo))) return; seen.add(it.key); items.push(it); };
  for (const t of input.threads) {
    const last = t.messages.filter((m) => m.hpd && !m.mine).at(-1);
    if (!last) continue;
    // Answered after HPD wrote (you replied in the thread): not waiting any more.
    if (t.messages.some((m) => m.mine && m.at > last.at)) continue;
    const who = t.people[0] || "HPD";
    if (/poor performance|performance notice|\bPPN\b/i.test(t.subject)) {
      if (!within(last.at, 21)) continue;
      const is24 = /\b24\s*-?\s*HR|\b24\s*HOUR/i.test(t.subject);
      for (const omo of t.omos.slice(0, 1)) {
        add({ key: `${is24 ? "24h" : "72h"}:${omo}:${t.id}`, omo, kind: is24 ? "24h" : "72h", title: `${is24 ? "24-hour" : "72-hour"} poor performance notice`, who, askedAt: last.at,
          dueAt: hours(last.at, is24 ? 24 : 72), want: "HPD says the job is late: finish it, or send the paperwork / an update right away.", sentAt: input.sent[omo]?.sentAt || "", threadId: t.id });
      }
      continue;
    }
    if ((/missing documents|missing required documents/i.test(t.subject) || (t.kind === "AEP" && t.omos.length > 3)) && within(last.at, 31)) {
      const text = t.messages.map((m) => m.text).join("\n");
      for (const omo of t.omos) {
        const line = new RegExp(`${omo}\\s*-\\s*([^\\n\\d]{3,40})`, "i").exec(text);
        add({ key: `missing:${omo}:${t.id}`, omo, kind: "missing", title: "Missing documents", who, askedAt: last.at, dueAt: null,
          want: line ? line[1].trim().replace(/\s+/g, " ") : "documents / an update", sentAt: input.sent[omo]?.sentAt || "", threadId: t.id });
      }
    }
  }
  for (const r of input.rejections) {
    add({ key: `rejection:${r.omo}:${r.at}`, omo: r.omo, kind: "rejection", title: "Paperwork rejected", who: r.by, askedAt: r.at, dueAt: null,
      want: r.reason || "see HPD's notice", sentAt: input.sent[r.omo]?.sentAt || "", threadId: "" });
  }
  for (const c of input.toPrint) {
    if (c.mailedAt) continue;
    add({ key: `print:${c.omo}:${c.savedAt}`, omo: c.omo, kind: "print", title: "Fixed: print, sign in ink and mail", who: "", askedAt: c.savedAt, dueAt: null,
      want: c.reason ? `HPD: ${c.reason}` : "the corrected affidavit and invoice", sentAt: "", threadId: "" });
  }
  // Most urgent first: by kind, then the earliest deadline / the oldest ask.
  return items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || String(a.dueAt || a.askedAt).localeCompare(String(b.dueAt || b.askedAt)));
}

// "3h 12m left" / "overdue 5h" / "" (no deadline).
export function dueText(dueAt: string | null, now = Date.now()) {
  if (!dueAt) return "";
  const m = Math.round((Date.parse(dueAt) - now) / 60000);
  const fmt = (x: number) => (x >= 1440 ? `${Math.floor(x / 1440)}d ${Math.floor((x % 1440) / 60)}h` : x >= 60 ? `${Math.floor(x / 60)}h ${x % 60}m` : `${x}m`);
  return m >= 0 ? `${fmt(m)} left` : `overdue ${fmt(-m)}`;
}
