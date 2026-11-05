// 🔥 Streaks (owner idea, 4 Nov): work days in a row with bids sent, and finished jobs in a row whose paperwork went out
// the same day. Weekends never break a streak; today counts once it's done (until then the streak runs to yesterday).
// A new record is cheered once (hpd-streak-best on this phone).

export type StreakInput = { bidSentAt: string[]; finished: { finishedAt: string; paperworkAt: string }[]; today: string };
export type Streaks = { bids: number; bidsToday: boolean; paperwork: number };

const nyDay = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t)) : "";
};
const prevWorkday = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
};
const isWeekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

export function streaks(input: StreakInput): Streaks {
  const days = new Set(input.bidSentAt.map(nyDay).filter(Boolean));
  const bidsToday = days.has(input.today);
  let day = bidsToday || isWeekend(input.today) ? input.today : prevWorkday(input.today);
  if (isWeekend(day) && !days.has(day)) day = prevWorkday(day);
  let bids = 0;
  while (days.has(day) && bids < 400) { bids += 1; day = prevWorkday(day); }
  // Weekend bids add to the run but are never needed.
  const fin = input.finished.filter((f) => nyDay(f.finishedAt)).sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
  let paperwork = 0;
  for (const f of fin) {
    if (f.paperworkAt && nyDay(f.paperworkAt) === nyDay(f.finishedAt)) paperwork += 1;
    else if (nyDay(f.finishedAt) === input.today && !f.paperworkAt) continue; // finished today: still time
    else break;
  }
  return { bids, bidsToday, paperwork };
}

export function streakLine(s: Streaks, best: { bids: number; paperwork: number }) {
  const parts = [
    s.bids ? `🔥 ${s.bids} work day${s.bids === 1 ? "" : "s"} in a row with bids sent${s.bids >= best.bids && s.bids > 1 ? " (your record!)" : best.bids > s.bids ? ` (record ${best.bids})` : ""}${s.bidsToday ? "" : ": send one today to keep it going"}` : `🔥 No bid streak right now${best.bids ? ` (record ${best.bids} days)` : ""}: send a bid today to start one`,
    s.paperwork ? `📄 ${s.paperwork} finished job${s.paperwork === 1 ? "" : "s"} in a row with the paperwork out the same day${s.paperwork >= best.paperwork && s.paperwork > 1 ? " (your record!)" : best.paperwork > s.paperwork ? ` (record ${best.paperwork})` : ""}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

// The record, kept on this phone: returns what's new (to cheer once) and the record after it.
export function bumpBest(s: Streaks, store: Pick<Storage, "getItem" | "setItem"> | null) {
  let best = { bids: 0, paperwork: 0 };
  try { best = { ...best, ...JSON.parse(store?.getItem("hpd-streak-best") || "{}") }; } catch { /* private mode */ }
  const beat: string[] = [];
  if (s.bids >= 3 && s.bids > best.bids) beat.push(`🔥 New record: ${s.bids} work days in a row with bids sent!`);
  if (s.paperwork >= 3 && s.paperwork > best.paperwork) beat.push(`📄 New record: ${s.paperwork} jobs in a row with the paperwork out the same day!`);
  const next = { bids: Math.max(best.bids, s.bids), paperwork: Math.max(best.paperwork, s.paperwork) };
  try { store?.setItem("hpd-streak-best", JSON.stringify(next)); } catch { /* private mode */ }
  return { beat, best, next };
}
