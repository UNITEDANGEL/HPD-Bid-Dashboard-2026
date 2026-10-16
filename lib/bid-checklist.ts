// Morning bid checklist: every invitation due today or tomorrow, what state it's in (not priced, price saved,
// fax going through, confirmed, failed) and the best price to bid, so none is left without a bid (last 30
// days: 47 of 124 awarded invitations got no bid from you).

import { currentRecord, faxState, type BidRecord } from "./bid-records";

export type ChecklistState = "not-priced" | "saved" | "pending" | "confirmed" | "failed" | "past";
export type ChecklistRow = {
  omo: string; address: string; borough: string; day: "today" | "tomorrow"; bidDueTime: string;
  minutesLeft: number; state: ChecklistState; best: number | null; chance: number | null; easy: boolean;
};

const minutesOf = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i.exec((t || "").trim());
  return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60;
};

export function bidChecklist(
  bids: { omo: string; address: string; borough?: string; bidDue: string; bidDueTime?: string }[],
  records: Record<string, BidRecord>,
  today: string, tomorrow: string, minutesNow: number, now: Date,
  priceFor: (omo: string) => { best: number; chance: number } | null = () => null,
  easy: Set<string> = new Set(),
) {
  const rows: ChecklistRow[] = bids
    .filter((b) => b.bidDue === today || b.bidDue === tomorrow)
    .map((b): ChecklistRow => {
      const day: ChecklistRow["day"] = b.bidDue === today ? "today" : "tomorrow";
      const minutesLeft = minutesOf(b.bidDueTime) - minutesNow + (day === "tomorrow" ? 24 * 60 : 0);
      // This round's record (a re-invitation's earlier round doesn't count as sent).
      const rec = currentRecord(b as Parameters<typeof currentRecord>[0], records);
      const fax = rec ? faxState(rec, now) : "";
      let state: ChecklistState = !rec ? "not-priced" : fax === "saved" ? "saved" : fax === "confirmed" ? "confirmed" : fax === "failed" ? "failed" : "pending";
      if ((state === "not-priced" || state === "saved" || state === "failed") && minutesLeft <= 0) state = "past";
      const p = priceFor(b.omo);
      return { omo: b.omo, address: b.address, borough: b.borough || "", day, bidDueTime: b.bidDueTime || "", minutesLeft, state, best: p ? p.best : null, chance: p ? p.chance : null, easy: easy.has(b.omo) };
    })
    // Still to do first (soonest due first), then the ones already sent.
    .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.minutesLeft - b.minutesLeft || a.omo.localeCompare(b.omo));
  const todo = rows.filter((r) => !isDone(r) && r.state !== "past");
  return {
    rows, todo,
    sent: rows.filter(isDone).length,
    total: rows.filter((r) => r.state !== "past").length,
    todayLeft: todo.filter((r) => r.day === "today").length,
    missed: rows.filter((r) => r.state === "past").length,
  };
}

export function isDone(r: ChecklistRow) {
  return r.state === "pending" || r.state === "confirmed";
}

// Lost bids at a lower price (Sept-Oct 2026): 4 of 9 arrived after the deadline (faxes started 3-7 minutes
// before 11:00 delivered at 11:05-11:18; a 10:00 AM deadline missed) and 1 went inside another job's fax.
// A fax can take up to ~25 minutes and HPD's line is busy right before the deadline.
export type Urgency = "" | "send-now" | "too-late";
export function urgency(minutesLeft: number, done: boolean): Urgency {
  if (done || minutesLeft <= 0) return "";
  if (minutesLeft <= 10) return "too-late";
  return minutesLeft <= 45 ? "send-now" : "";
}

// HPD's usual deadline is 11:00 AM or later; an earlier one (10:00 AM) is easy to miss.
export function earlyDeadline(bidDueTime?: string) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])/i.exec((bidDueTime || "").trim());
  if (!m) return false;
  const minutes = ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]);
  return minutes < 11 * 60;
}

// "2h 10m left" / "45m left" / "due"
export function timeLeft(minutes: number) {
  if (minutes <= 0) return "past due";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${m}m left` : `${m}m left`;
}
