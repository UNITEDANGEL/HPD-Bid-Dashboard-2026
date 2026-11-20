// 📅 Next 7 days (plan, 19 Nov: "jobs, appointments, bids due and notices for the next 7 days on one screen"). Each day
// from today: tenant appointments, bids due (with Sent when faxed), 24/72-hour notice deadlines and no-access 2nd tries
// that come due. Overdue notices and late 2nd tries go on today. OMO numbers and addresses only.

export type WeekItem = {
  kind: "appointment" | "bid" | "notice" | "secondtry";
  omo: string;
  address: string;
  time: string;   // "10:00 AM", "" when there is none
  sort: number;   // minutes after midnight, for the order inside a day
  text: string;   // one plain line
  done?: boolean; // a bid already faxed
  late?: boolean; // an overdue notice / 2nd try
  since?: string; // a late 2nd try: the day it came due
};
export type WeekDay = { date: string; label: string; items: WeekItem[] };

export type WeekInput = {
  today: string; // YYYY-MM-DD, New York
  appointments: { omo: string; address: string; date: string; start: string; end: string; state: string }[];
  bids: { omo: string; address: string; bidDue: string; bidDueTime: string; sent: boolean }[];
  notices: { omo: string; dueAt: string; hours: number; open: boolean }[]; // dueAt: ISO time
  secondTries: { omo: string; address: string; dueDay: string }[];
};

const nyDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const nyClock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// "10:00" or "10:00 AM" -> minutes after midnight (24 h when there is no time).
export function clockMinutes(t: string) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec((t || "").trim());
  if (!m) return 24 * 60;
  let h = Number(m[1]) % (m[3] ? 12 : 24);
  if (m[3] && m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}
const ampm = (t: string) => {
  const n = clockMinutes(t);
  if (n >= 24 * 60) return "";
  const h = Math.floor(n / 60), m = n % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
}

export function weekAhead(input: WeekInput, days = 7): WeekDay[] {
  const { today } = input;
  const last = addDays(today, days - 1);
  const out: WeekDay[] = Array.from({ length: days }, (_, i) => { const date = addDays(today, i); return { date, label: dayLabel(date, today), items: [] }; });
  const put = (day: string, item: WeekItem) => { const d = out.find((x) => x.date === day); if (d) d.items.push(item); };
  for (const a of input.appointments) {
    if (!a.date || a.date < today || a.date > last || !["confirmed", "requested"].includes(a.state)) continue;
    const time = ampm(a.start);
    put(a.date, { kind: "appointment", omo: a.omo, address: a.address, time, sort: clockMinutes(a.start), text: `${a.state === "confirmed" ? "Appointment" : "Asked for"} ${time}${a.end ? `–${ampm(a.end)}` : ""}` });
  }
  for (const b of input.bids) {
    if (!b.bidDue || b.bidDue < today || b.bidDue > last) continue;
    const time = ampm(b.bidDueTime);
    put(b.bidDue, { kind: "bid", omo: b.omo, address: b.address, time, sort: clockMinutes(b.bidDueTime), done: b.sent, text: b.sent ? `Bid sent (due ${time || "today"})` : `Bid due ${time}`.trim() });
  }
  for (const n of input.notices) {
    if (!n.open || !n.dueAt || !Number.isFinite(Date.parse(n.dueAt))) continue;
    const day = nyDay(n.dueAt);
    if (day > last) continue;
    const late = day < today || Date.parse(n.dueAt) < Date.now();
    const time = nyClock(n.dueAt);
    put(day < today ? today : day, { kind: "notice", omo: n.omo, address: "", time: day < today ? "" : time, sort: day < today ? -1 : clockMinutes(time), late, text: late ? `${n.hours}-hour notice overdue` : `${n.hours}-hour notice due ${time}` });
  }
  for (const s of input.secondTries) {
    if (!s.dueDay || s.dueDay > last) continue;
    const late = s.dueDay < today;
    // Late 2nd tries go at the end of today, oldest first (19 Nov, live: 12 from May-July sat above today's bids); the
    // screen folds them into one line when there are more than 3.
    const short = `${Number(s.dueDay.slice(5, 7))}/${Number(s.dueDay.slice(8, 10))}`;
    put(late ? today : s.dueDay, { kind: "secondtry", omo: s.omo, address: s.address, time: "", sort: late ? 24 * 60 + 1 : 23 * 60, late, text: late ? `2nd no-access try: waiting since ${short}` : "2nd no-access try can be done", ...(late ? { since: s.dueDay } : {}) });
  }
  for (const d of out) d.items.sort((a, b) => a.sort - b.sort || String(a.since || "").localeCompare(String(b.since || "")) || a.omo.localeCompare(b.omo));
  return out;
}

// One spoken / short line for the week: "This week: 3 appointments, 5 bids due, 1 notice deadline, 2 second tries."
export function weekLine(week: WeekDay[]) {
  const n = (k: WeekItem["kind"], open = false) => week.reduce((s, d) => s + d.items.filter((i) => i.kind === k && (!open || !i.done)).length, 0);
  const parts = [[n("appointment"), "appointment"], [n("bid", true), "bid due", "bids due"], [n("notice"), "notice deadline"], [n("secondtry"), "second try", "second tries"]] as [number, string, string?][];
  const said = parts.filter(([c]) => c).map(([c, one, many]) => `${c} ${c === 1 ? one : many || `${one}s`}`);
  return said.length ? `Next 7 days: ${said.join(", ")}.` : "Nothing booked or due in the next 7 days.";
}
