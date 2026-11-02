// Google Street View pictures stay inside the free 10,000 a month (owner, 2 Nov: "let's do the free 10,000 a month; stop
// after you reach that limit; make a counter in the app so we never trigger any billing"). Every picture this device
// downloads is counted; the count goes to the status server now and then (key SV-COUNT-<month>-<device>, about every 20
// pictures, so the server's daily write limit isn't touched), and all devices together stop loading pictures at STOP_AT
// for the rest of the month (only the 360° view, which is free). Google's own cap of 300 a day is the backstop.
import { HPD_STATUS_WORKER_URL } from "./paperwork";

export const MONTHLY_FREE = 10000;
export const STOP_AT = 9000; // a margin under Google's 10,000: other devices' newest pictures may not be sent yet
const LOCAL_KEY = "hpd-street-view-count-v1";
const DEVICE_KEY = "hpd-field-device-id-v1";
const SYNC_EVERY = 20;
const SERVER_TTL = 10 * 60000;

type Local = { month: string; n: number; synced: number };

// Google counts by calendar month (Pacific time).
export const svMonth = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);

function readLocal(month = svMonth()): Local {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null") as Local | null;
    if (v && v.month === month) return v;
  } catch { /* private mode */ }
  return { month, n: 0, synced: 0 };
}
function writeLocal(v: Local) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* private mode */ } }
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = `d${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(DEVICE_KEY, id); }
    return id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "device";
  } catch { return "device"; }
}

// Every device's count this month, from the status server: { deviceId: n }.
export function serverCounts(overrides: Record<string, unknown>, month = svMonth()) {
  const prefix = `SV-COUNT-${month}-`;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(overrides)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = Math.max(0, Number((v as { n?: number })?.n) || 0);
  return out;
}
// This month's total: every other device's last sent count plus this device's own (always up to date here).
export function monthTotal(counts: Record<string, number>, me: string, mine: number) {
  return Object.entries(counts).reduce((sum, [d, n]) => sum + (d === me ? 0 : n), 0) + mine;
}

let cache: { at: number; counts: Record<string, number>; month: string } | null = null;
async function loadCounts(month: string) {
  if (cache && cache.month === month && Date.now() - cache.at < SERVER_TTL) return cache.counts;
  try {
    const r = await fetch(`${HPD_STATUS_WORKER_URL}/overrides`, { cache: "no-store" });
    const all = (await r.json())?.overrides || {};
    cache = { at: Date.now(), counts: serverCounts(all, month), month };
  } catch { if (!cache || cache.month !== month) cache = { at: Date.now(), counts: {}, month }; }
  return cache.counts;
}

export type StreetViewBudget = { used: number; stopAt: number; free: number; allowed: boolean };
export async function streetViewBudget(): Promise<StreetViewBudget> {
  const month = svMonth();
  const counts = await loadCounts(month);
  const used = monthTotal(counts, deviceId(), readLocal(month).n);
  return { used, stopAt: STOP_AT, free: MONTHLY_FREE, allowed: used < STOP_AT };
}

// One picture downloaded on this device: counted, and sent to the server with the first picture and then every
// SYNC_EVERY pictures. Marked as sent right away (so quick pictures don't each send); put back if the send fails, so the
// next picture tries again.
export function countStreetViewPicture() {
  const month = svMonth();
  const v = readLocal(month);
  v.n += 1;
  if (v.synced === 0 || v.n - v.synced >= SYNC_EVERY) {
    const me = deviceId();
    const n = v.n, before = v.synced;
    v.synced = n;
    const undo = () => { const now = readLocal(month); if (now.synced === n) writeLocal({ ...now, synced: before }); };
    void fetch(`${HPD_STATUS_WORKER_URL}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `SV-COUNT-${month}-${me}`, patch: { n, at: new Date().toISOString() } }) })
      .then((r) => { if (!r.ok) undo(); else if (cache && cache.month === month) cache.counts = { ...cache.counts, [me]: n }; })
      .catch(undo);
  }
  writeLocal(v);
  return v.n;
}
