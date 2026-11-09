// 🧪 The Lead Abatement Scope sheet (owner, 8 Nov: "there are 2 PDFs in the lead bid"): HPD lists the rooms and items
// with blank Rate and Cost boxes and blank room / apartment totals for the contractor. You give a rate per kind of work
// (e.g. enclosure $ per SQ FT, replacement $ per FT); every line, each room and the apartment are worked out, written
// into HPD's boxes, and the filled sheet goes in the bid package after the invitation. The apartment total is the bid.

export type LeadItem = { component: string; method: string; qty: number; um: string; page: number; y: number; rateRight: number; costRight: number };
export type LeadSpot = { page: number; x: number; y: number };
export type LeadScope = { rooms: { room: string; items: LeadItem[]; total: LeadSpot | null }[]; apartment?: LeadSpot; mold?: string };
export type LeadRates = Record<string, number>;

const UNIT: Record<string, string> = { SQFT: "sq ft", FT: "ft", LF: "ft", EA: "each", UNIT: "unit", UNITS: "unit" };
export const rateKey = (it: { method: string; um: string }) => `${it.method}|${it.um}`;

// The kinds of work to price (one rate each), with how much there is of each.
export function rateGroups(scope: LeadScope) {
  const by = new Map<string, { key: string; method: string; um: string; unit: string; qty: number; lines: number }>();
  for (const r of scope.rooms) for (const it of r.items) {
    const k = rateKey(it);
    const g = by.get(k) || { key: k, method: it.method, um: it.um, unit: UNIT[it.um] || it.um.toLowerCase(), qty: 0, lines: 0 };
    g.qty += it.qty; g.lines += 1;
    by.set(k, g);
  }
  return [...by.values()];
}

const cents = (n: number) => Math.round(n * 100) / 100;
// A rate for one line (owner, 9 Nov: "rate box for each item"): it wins over the rate for that kind of work.
export const lineKey = (room: number, item: number) => `line:${room}:${item}`;
export function lineRate(scope: LeadScope, rates: LeadRates, room: number, item: number) {
  const it = scope.rooms[room]?.items[item];
  if (!it) return 0;
  return rates[lineKey(room, item)] > 0 ? rates[lineKey(room, item)] : rates[rateKey(it)] || 0;
}
export function priceScope(scope: LeadScope, rates: LeadRates) {
  // A kind of work still to price: one of its lines has neither its own rate nor the kind's rate.
  const missing = [...new Set(scope.rooms.flatMap((r, ri) => r.items.filter((it, ii) => !(lineRate(scope, rates, ri, ii) > 0)).map(rateKey)))];
  const rooms = scope.rooms.map((r, ri) => {
    const items = r.items.map((it, ii) => { const rate = lineRate(scope, rates, ri, ii); return { ...it, rate, own: rates[lineKey(ri, ii)] > 0, cost: cents(rate * it.qty) }; });
    return { room: r.room, items, total: cents(items.reduce((a, it) => a + it.cost, 0)) };
  });
  return { rooms, total: cents(rooms.reduce((a, r) => a + r.total, 0)), missing, complete: !missing.length };
}

export const scopeMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Your rates and costs written into HPD's blank boxes (dark blue, like the invitation), the room and apartment totals.
export async function fillLeadScope(pdf: ArrayBuffer | Uint8Array, scope: LeadScope, rates: LeadRates) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib"); // loaded only when a package is made
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const ink = rgb(0, 0, 0.55);
  // HPD whites out its own figures with white "ink" marks, which always draw on top of the page (so anything written
  // under them is hidden too). Each mark becomes a white box in the page itself (HPD's figures stay covered), then
  // your numbers go on top.
  const { PDFName, PDFArray, PDFDict } = await import("pdf-lib");
  for (const page of pages) {
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) continue;
    const keep: unknown[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i);
      const isInk = a instanceof PDFDict && a.lookup(PDFName.of("Subtype")) === PDFName.of("Ink");
      const rect = isInk ? a.lookup(PDFName.of("Rect")) : null;
      if (isInk && rect instanceof PDFArray && rect.size() === 4) {
        const [x1, y1, x2, y2] = [0, 1, 2, 3].map((k) => (rect.lookup(k) as unknown as { asNumber: () => number }).asNumber());
        page.drawRectangle({ x: Math.min(x1, x2) - 0.5, y: Math.min(y1, y2) - 0.5, width: Math.abs(x2 - x1) + 1, height: Math.abs(y2 - y1) + 1, color: rgb(1, 1, 1) });
      } else keep.push(annots.get(i));
    }
    page.node.set(PDFName.of("Annots"), doc.context.obj(keep as never));
  }
  const right = (page: number, text: string, xRight: number, y: number, size = 8, f = font) => {
    const p = pages[page];
    if (!p) return;
    const w = f.widthOfTextAtSize(text, size);
    p.drawRectangle({ x: xRight - w - 2, y: y - 2, width: w + 4, height: size + 3, color: rgb(1, 1, 1) });
    p.drawText(text, { x: xRight - w, y, size, font: f, color: ink });
  };
  const priced = priceScope(scope, rates);
  priced.rooms.forEach((r, i) => {
    for (const it of r.items) {
      if (!(it.rate > 0)) continue;
      right(it.page, it.rate.toFixed(2), it.rateRight, it.y);
      right(it.page, scopeMoney(it.cost), it.costRight, it.y);
    }
    const spot = scope.rooms[i].total;
    if (spot && r.total > 0) { const p = pages[spot.page]; if (p) { p.drawRectangle({ x: spot.x - 1, y: spot.y - 2, width: 62, height: 12, color: rgb(1, 1, 1) }); p.drawText(scopeMoney(r.total), { x: spot.x, y: spot.y, size: 9, font: bold, color: ink }); } }
  });
  if (scope.apartment && priced.total > 0) { const p = pages[scope.apartment.page]; if (p) { p.drawRectangle({ x: scope.apartment.x - 1, y: scope.apartment.y - 2, width: 70, height: 13, color: rgb(1, 1, 1) }); p.drawText(scopeMoney(priced.total), { x: scope.apartment.x, y: scope.apartment.y, size: 10, font: bold, color: ink }); } }
  return doc.save();
}

// The invitation package with the filled scope sheet added after it.
export async function appendScope(packageBytes: Uint8Array, scopeBytes: Uint8Array) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.load(packageBytes, { ignoreEncryption: true });
  const scope = await PDFDocument.load(scopeBytes, { ignoreEncryption: true });
  const pages = await out.copyPages(scope, scope.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

// Rates are kept on this phone per job.
export function loadLeadRates(omo: string): LeadRates {
  try { return JSON.parse(localStorage.getItem(`hpd-lead-rates-${omo}`) || "{}"); } catch { return {}; }
}
export function saveLeadRates(omo: string, rates: LeadRates) {
  try { localStorage.setItem(`hpd-lead-rates-${omo}`, JSON.stringify(rates)); } catch { /* private mode */ }
}
