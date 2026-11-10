// 📎 Extra pages on a bid (owner, 10 Nov, ER09991: Juan asked for "the regular Work Description Form page"; "attach it
// to the bid, I want to resend it"): a PDF or a photo kept on this phone for that job, added at the end of every package
// made for it (fill, send, resend, revise).
export type ExtraPage = { name: string; type: string; data: string; at: string }; // data: base64

const key = (omo: string) => `hpd-bid-extra-${omo.toUpperCase()}`;

export function loadExtraPages(omo: string): ExtraPage[] {
  try { const v = JSON.parse(localStorage.getItem(key(omo)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveExtraPages(omo: string, pages: ExtraPage[]) {
  try { localStorage.setItem(key(omo), JSON.stringify(pages)); return true; } catch { return false; }
}

export async function fileToExtraPage(file: File): Promise<ExtraPage> {
  if (file.size > 4_000_000) throw new Error("That file is over 4 MB: take a smaller photo or a lighter PDF.");
  if (!/pdf|image\//i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error("Add a PDF or a photo.");
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: file.name.slice(0, 80), type: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "image/jpeg"), data: btoa(bin), at: new Date().toISOString() };
}

function bytesOf(page: ExtraPage) {
  const bin = atob(page.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// The package with the extra pages after it: PDF pages as they are, a photo on its own letter page, fitted.
export async function appendExtraPages(packageBytes: Uint8Array, pages: ExtraPage[]) {
  if (!pages.length) return packageBytes;
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.load(packageBytes, { ignoreEncryption: true });
  for (const p of pages) {
    const bytes = bytesOf(p);
    if (/pdf/i.test(p.type)) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg));
    } else {
      const img = /png/i.test(p.type) ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const W = 612, H = 792, m = 24;
      const k = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
      const page = out.addPage([W, H]);
      page.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k });
    }
  }
  return out.save();
}
