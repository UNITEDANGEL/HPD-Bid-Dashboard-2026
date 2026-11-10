// The boxes HPD marked on the copy they sent back (scripts/fetch_hpd_marks.py reads the highlights and red-pen
// circles on their scan, free OCR on this computer, and writes the "marks" part of public/data/correction_dates.json). Owner, 9 Nov: "I should
// see the thing I need to fix, especially if a PDF is attached and marked". Only box names are in the file.
export type MarkedPage = { form: string; page: number; boxes: string[] };
export type MarkedCopy = { omos?: string[]; at?: string; file?: string; pages?: MarkedPage[] };

const FORM: Record<string, string> = {
  invoice: "Invoice",
  "work affidavit": "Affidavit",
  "no-work affidavit": "No-work affidavit",
  "notary page": "Notary page",
};
// So many boxes marked = the page reached HPD blank (a flattened / unprinted copy), not a few wrong answers.
export const BLANK_AT = 8;

export function markedLines(copy?: MarkedCopy | null): string[] {
  const out: string[] = [];
  for (const p of copy?.pages || []) {
    const form = FORM[p.form] || `Page ${p.page}`;
    if (!p.boxes.length) continue;
    out.push(p.boxes.length >= BLANK_AT
      ? `${form}: almost every box (${p.boxes.length}) — it reached HPD blank. The new copy prints every box.`
      : `${form}: ${p.boxes.join(", ")}`);
  }
  return out;
}

// The copy for this notice: by its email thread, else the newest one naming the job.
export function markedFor(all: Record<string, MarkedCopy> | undefined, threadId = "", omo = ""): MarkedCopy | null {
  if (!all) return null;
  if (threadId && all[threadId]) return all[threadId];
  if (!omo) return null;
  const hits = Object.values(all).filter((c) => (c.omos || []).includes(omo.toUpperCase()));
  return hits.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0] || null;
}

let cache: Promise<Record<string, MarkedCopy>> | null = null;
export function loadMarked(): Promise<Record<string, MarkedCopy>> {
  if (!cache) cache = fetch("/data/correction_dates.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((d: { marks?: Record<string, MarkedCopy> }) => d?.marks || {}).catch(() => ({}));
  return cache;
}
