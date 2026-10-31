// Your rates (My price), minimums and costs on every device (owner, 31 Oct "do 5"): they were kept only on the device
// where you typed them. A private file in your own Google Drive ("HPD my rates (private).json", like the saved
// signatures) holds all three; each item carries when it was last changed, so the newest change wins per item, a
// removal too. Signed out of Google: nothing happens and this device's own copy is used. Never sent anywhere else.

// A rate or minimum: v = the amount. A cost: v = materials, l = labor. 0 (and l 0) = removed.
export type Entry = { v: number; l?: number; at: string };
export type Book = { rates: Record<string, Entry>; floors: Record<string, Entry>; costs: Record<string, Entry> };
type Kind = keyof Book;
const KINDS: Kind[] = ["rates", "floors", "costs"];
const STAMPS = "hpd-pricing-stamps-v1";
const STORE: Record<Kind, string> = { rates: "hpd-my-rates", floors: "hpd-cost-floors", costs: "hpd-my-costs-v1" };

function readJson(key: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}
const readStamps = () => readJson(STAMPS) as Record<string, string>;

// A rate / minimum / cost was saved or removed on this device just now.
export function stampPricing(kind: Kind, key: string, at = new Date().toISOString()) {
  try { localStorage.setItem(STAMPS, JSON.stringify({ ...readStamps(), [`${kind}:${key}`]: at })); } catch { /* private mode */ }
  schedulePush();
}

const live = (e: Entry) => e.v > 0 || (e.l || 0) > 0;
function toEntry(kind: Kind, raw: unknown, at: string): Entry | null {
  if (kind === "costs") {
    const c = raw as { material?: unknown; labor?: unknown } | null;
    const m = Number(c?.material) || 0, l = Number(c?.labor) || 0;
    return m > 0 || l > 0 ? { v: m, l, at } : null;
  }
  return typeof raw === "number" && raw > 0 ? { v: raw, at } : null;
}
const fromEntry = (kind: Kind, e: Entry) => (kind === "costs" ? { material: e.v, labor: e.l || 0 } : e.v);

// This device's items with when each changed (removed ones stay, at 0, so the removal travels too). Only what you
// saved yourself: the starting costs the app shows until you change them aren't yours to send.
export function localBook(stored: Record<Kind, Record<string, unknown>> = { rates: readJson(STORE.rates), floors: readJson(STORE.floors), costs: readJson(STORE.costs) }, stamps = readStamps()): Book {
  const book = { rates: {}, floors: {}, costs: {} } as Book;
  for (const kind of KINDS) {
    for (const [k, raw] of Object.entries(stored[kind] || {})) {
      const e = toEntry(kind, raw, stamps[`${kind}:${k}`] || "");
      if (e) book[kind][k] = e;
    }
    for (const [sk, at] of Object.entries(stamps)) {
      const i = sk.indexOf(":");
      const k = sk.slice(i + 1);
      if (sk.slice(0, i) === kind && !(k in book[kind])) book[kind][k] = kind === "costs" ? { v: 0, l: 0, at } : { v: 0, at };
    }
  }
  return book;
}

// Newest change wins per item; an item only one side has is kept.
export function mergeBooks(local: Book, remote: Book): Book {
  const out = { rates: {}, floors: {}, costs: {} } as Book;
  for (const kind of KINDS) {
    out[kind] = { ...(remote[kind] || {}) };
    for (const [k, e] of Object.entries(local[kind] || {})) if (!out[kind][k] || e.at > out[kind][k].at) out[kind][k] = e;
  }
  return out;
}

const sortBook = (x: Book) => KINDS.map((kind) => Object.entries(x[kind] || {}).sort());
const same = (a: Book, b: Book) => JSON.stringify(sortBook(a)) === JSON.stringify(sortBook(b));

async function pricingApi(body: Record<string, unknown>): Promise<Book | null> {
  try {
    const response = await fetch("/api/drive/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!response.ok) return null;
    const got = (await response.json()) as Partial<Book> | null;
    return { rates: got?.rates || {}, floors: got?.floors || {}, costs: got?.costs || {} };
  } catch {
    return null;
  }
}

// Load the Drive copy, take what's newer there, send up what's newer here. Returns how many items came from another
// device (null when signed out / offline: this device's own copy stays as it is).
export async function syncPricing(): Promise<{ fromDrive: number } | null> {
  const remote = await pricingApi({ op: "load" });
  if (!remote) return null;
  const local = localBook();
  const merged = mergeBooks(local, remote);
  try {
    const stamps: Record<string, string> = {};
    for (const kind of KINDS) {
      localStorage.setItem(STORE[kind], JSON.stringify(Object.fromEntries(Object.entries(merged[kind]).filter(([, e]) => live(e)).map(([k, e]) => [k, fromEntry(kind, e)]))));
      for (const [k, e] of Object.entries(merged[kind])) if (e.at) stamps[`${kind}:${k}`] = e.at;
    }
    localStorage.setItem(STAMPS, JSON.stringify(stamps));
  } catch { /* private mode */ }
  if (!same(merged, remote)) await pricingApi({ op: "save", ...merged });
  const fromDrive = KINDS.reduce((n, kind) => n + Object.entries(merged[kind]).filter(([k, e]) => e === remote[kind][k] && JSON.stringify(local[kind][k] || null) !== JSON.stringify(e)).length, 0);
  return { fromDrive };
}

// A change here goes up a moment later (several quick edits = one save).
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (typeof window === "undefined") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void syncPricing(); }, 1500);
}
