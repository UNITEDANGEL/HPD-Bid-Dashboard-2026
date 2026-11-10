// 🪜 Stair treads (bids plan item 6: "tread price from past awards"): what HPD awarded per tread, by kind
// (marble / metal / wood / other), from the awarded jobs that say how many treads ("TOTAL TREADS = (4)"). On a bid
// with treads: "≈ $460 a marble tread (middle of 6 awards) × 4 = $1,840".
export type TreadKind = "marble" | "metal" | "wood" | "other";
export type TreadJob = { amount: number; description: string };

export function treadKind(text: string): TreadKind {
  const t = text.toUpperCase();
  return /MARBLE/.test(t) ? "marble" : /METAL|STEEL|IRON|ALUMIN/.test(t) ? "metal" : /WOOD|OAK/.test(t) ? "wood" : "other";
}

// How many treads the job says; 0 when it doesn't say (then no per-tread price).
export function treadCount(text: string): number {
  const t = text.toUpperCase();
  if (!/TREAD/.test(t)) return 0;
  const m = /TOTAL\s*(?:STAIR\s*)?TREADS?\s*[=:]?\s*\(?\s*(\d{1,2})\b/.exec(t) || /\(\s*(\d{1,2})\s*\)\s*(?:NEW\s+)?(?:MARBLE\s+|METAL\s+|WOOD\s+)?(?:STAIR\s+)?TREADS?/.exec(t) || /\b(\d{1,2})\s+(?:NEW\s+)?(?:MARBLE\s+|METAL\s+|WOOD\s+)?(?:STAIR\s+)?TREADS?\b/.exec(t);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n <= 30 ? n : 0;
}

const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

// The per-tread price for this bid's kind (falls back to all kinds when fewer than 3 of its own), or null.
export function treadRate(description: string, history: TreadJob[]) {
  const n = treadCount(description);
  if (!n) return null;
  const kind = treadKind(description);
  const per = history.filter((j) => j.amount > 0).map((j) => ({ k: treadKind(j.description), c: treadCount(j.description), a: j.amount })).filter((x) => x.c > 0).map((x) => ({ k: x.k, rate: x.a / x.c }));
  const same = per.filter((x) => x.k === kind);
  const use = same.length >= 3 ? same : per;
  if (use.length < 3) return null;
  const rate = Math.round(middle(use.map((x) => x.rate)) / 5) * 5;
  return { count: n, kind, rate, total: rate * n, from: use.length, ownKind: same.length >= 3 };
}

export function treadLine(r: NonNullable<ReturnType<typeof treadRate>>) {
  const usd = (x: number) => `$${x.toLocaleString("en-US")}`;
  return `🪜 ≈ ${usd(r.rate)} a ${r.ownKind ? `${r.kind} ` : ""}tread (middle of ${r.from} awards${r.ownKind ? "" : ", all kinds"}) × ${r.count} = ${usd(r.total)}`;
}
