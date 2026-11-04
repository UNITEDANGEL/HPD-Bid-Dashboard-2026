// The robot's own answers worked out on the phone (owner, 4 Nov: "do all ideas"): no AI call, so they cost nothing and
// come back at once. Shown / said only: nothing here saves or sends anything.

// 🧾 "Am I missing paperwork?": every finished job whose package isn't sent yet, with what's still missing, oldest first.
export type PaperRow = { id: string; address: string; outcome: string; finishedAt: string; before: number; after: number; approved: boolean; invoiceDone: boolean };
export type PaperGap = { id: string; address: string; finishedAt: string; missing: string[] };
const WORK = ["WORK_COMPLETED", "PARTIAL_WORK"];
export function missingPaperwork(rows: PaperRow[]): PaperGap[] {
  return rows
    .filter((r) => r.outcome && r.outcome !== "APPOINTMENT_REQUESTED" && !/^NO_ACCESS_1/.test(r.outcome))
    .map((r) => {
      const work = WORK.includes(r.outcome);
      const missing = [
        work && !r.before ? "before photos" : "",
        work && !r.after ? "after photos" : "",
        !r.approved ? "the affidavit" : "",
        work && !r.invoiceDone ? "the invoice" : "",
      ].filter(Boolean);
      return { id: r.id, address: r.address, finishedAt: r.finishedAt, missing };
    })
    .filter((g) => g.missing.length)
    .sort((a, b) => (a.finishedAt || "9").localeCompare(b.finishedAt || "9"));
}

// 🗺 "Where am I losing time?": time on site by borough and by kind of work, the slowest against your usual, one tip.
export type TimedJob = { borough: string; kind: string; minutes: number };
const label = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
export function timeInsight(timed: TimedJob[]): string {
  if (timed.length < 3) return `I've only timed ${timed.length} job${timed.length === 1 ? "" : "s"} so far. Tap "I'm here" when you get to a job and save the result when you leave: after 3 jobs I can tell you where the time goes.`;
  const avg = (list: TimedJob[]) => Math.round(list.reduce((a, t) => a + t.minutes, 0) / list.length);
  const usual = avg(timed);
  const worst = (key: "borough" | "kind") => {
    const groups: Record<string, TimedJob[]> = {};
    for (const t of timed) if (t[key]) (groups[t[key]] = groups[t[key]] || []).push(t);
    return Object.entries(groups).filter(([, l]) => l.length >= 2).map(([k, l]) => ({ k, n: l.length, avg: avg(l) })).sort((a, b) => b.avg - a.avg)[0] || null;
  };
  const b = worst("borough"), k = worst("kind");
  const parts = [`Your usual job takes ${label(usual)} on site (${timed.length} timed).`];
  if (b && b.avg > usual * 1.15) parts.push(`${b.k} is the slowest: ${label(b.avg)} on average over ${b.n} jobs.`);
  if (k && k.avg > usual * 1.15) parts.push(`${k.k} jobs take longest: ${label(k.avg)} each.`);
  if (parts.length === 1) parts.push("No borough or kind of work stands out: your time is even. Nice.");
  else parts.push(b && b.avg > usual * 1.15 ? `Tip: put the ${b.k} jobs together on one day, first thing, so the drive and parking happen once.` : `Tip: bring what the ${k!.k} jobs need from the start, so you don't go back to the truck.`);
  return parts.join(" ");
}

// 🎉 Good-news replay at the end of the day: wins, bids sent and jobs finished, in one short cheer.
export function goodNews(o: { wins: number; winMoney: number; bidsSent: number; finished: number; packagesSent: number; name?: string }): string {
  const bits = [
    o.wins ? `${o.wins} job${o.wins === 1 ? "" : "s"} won${o.winMoney ? ` worth $${Math.round(o.winMoney).toLocaleString("en-US")}` : ""}` : "",
    o.bidsSent ? `${o.bidsSent} bid${o.bidsSent === 1 ? "" : "s"} sent` : "",
    o.finished ? `${o.finished} job${o.finished === 1 ? "" : "s"} finished` : "",
    o.packagesSent ? `${o.packagesSent} package${o.packagesSent === 1 ? "" : "s"} sent to HPD` : "",
  ].filter(Boolean);
  const who = o.name ? `, ${o.name}` : "";
  if (!bits.length) return `🎉 Quiet day${who}. Rest up: tomorrow's a new one.`;
  const list = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
  const cheer = o.wins ? "Great day!" : bits.length >= 3 ? "Busy day, well done!" : "Nice work!";
  return `🎉 ${cheer} Today${who}: ${list}.`;
}

// 🧠 The conversation kept on the phone for a few days, so the robot remembers yesterday ("did the video go out?").
export type ChatTurn = { you: string; helper: string; at: number };
const KEY = "hpd-chat-memory";
const KEEP_DAYS = 3;
export function loadChatMemory(now = Date.now()): ChatTurn[] {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(rows) ? rows.filter((t) => t && t.you && t.helper && now - Number(t.at) < KEEP_DAYS * 86400000).slice(-30) : [];
  } catch { return []; }
}
export function saveChatMemory(turns: ChatTurn[], now = Date.now()) {
  try {
    const keep = [...loadChatMemory(now).filter((t) => !turns.some((n) => n.at === t.at)), ...turns].sort((a, b) => a.at - b.at).slice(-30);
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch { /* private mode */ }
}
// The turns from before today (New York days), newest last, for the AI: "earlier days" next to the conversation now.
export function earlierDays(turns: ChatTurn[], now = Date.now()) {
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
  const today = day(now);
  return turns.filter((t) => day(t.at) !== today).slice(-8).map((t) => ({ day: day(t.at), you: t.you.slice(0, 160), helper: t.helper.slice(0, 240) }));
}
