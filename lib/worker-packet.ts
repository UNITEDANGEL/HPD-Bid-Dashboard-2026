// 👷 One package for the worker (owner, 25 Nov: "when I send the job to the worker it should go as one package, with the
// second page: work description page, then the whole complete message. Right now it sends the message, then a separate work
// description page"): a single PDF, HPD's work description page first, then HPD's second page (tenant contact), then the
// whole message on its own page with the job link that opens the worker page (tappable).
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";

// The PDF's built-in font has no emoji: plain words instead, anything else it can't draw left out.
const WORDS: [RegExp, string][] = [[/👷/gu, ""], [/📍/gu, ""], [/⏰/gu, ""], [/📸/gu, ""], [/🏢/gu, ""], [/📞/gu, ""], [/🚪/gu, ""], [/📄/gu, ""], [/🧭/gu, ""]];
export function pdfSafe(text: string) {
  let s = String(text || "");
  for (const [re, w] of WORDS) s = s.replace(re, w);
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\n\x20-\x7E -ÿ•]/g, "").replace(/[ \t]+\n/g, "\n").replace(/^[ \t]+/gm, "");
}

export async function workerPacket(id: string, pages: File[], message: string, link: string): Promise<File> {
  const doc = await PDFDocument.create();
  doc.setTitle(`HPD job ${id}`);
  // HPD's pages, the work description first (the file names end in -HPD-page-<n>; the description page is the higher one).
  const ordered = [...pages].sort((a, b) => (Number(/page-(\d+)/.exec(b.name)?.[1]) || 0) - (Number(/page-(\d+)/.exec(a.name)?.[1]) || 0));
  for (const f of ordered) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const img = f.type.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const w = 612, h = Math.round((img.height / img.width) * 612);
    const page = doc.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  // 25 Nov, later (owner: "send the details like before with the navigation link and everything, but just send the pdf
  // separate"): with no message, the PDF is HPD's pages only; the message goes as the share's text.
  if (!message) {
    const only = await doc.save({ useObjectStreams: false });
    return new File([only.slice().buffer as ArrayBuffer], `${id} HPD work description.pdf`, { type: "application/pdf" });
  }
  // The whole message.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 48, size = 13, lead = 18;
  let page = doc.addPage([W, H]);
  let y = H - M;
  page.drawText(`HPD job ${id}`, { x: M, y: y - 6, size: 22, font: bold });
  y -= 44;
  const wrap = (line: string, f = font) => {
    const out: string[] = [];
    let cur = "";
    for (const word of line.split(/(\s+)/)) {
      const next = cur + word;
      if (f.widthOfTextAtSize(next, size) > W - M * 2 && cur.trim()) { out.push(cur.trimEnd()); cur = word.trimStart(); }
      else cur = next;
      while (f.widthOfTextAtSize(cur, size) > W - M * 2) { let k = cur.length; while (k > 1 && f.widthOfTextAtSize(cur.slice(0, k), size) > W - M * 2) k--; out.push(cur.slice(0, k)); cur = cur.slice(k); }
    }
    out.push(cur);
    return out;
  };
  // HPD's full description is already the first page: left out here, so the message fits on one page.
  const all = pdfSafe(message).split("\n").filter((l, i) => !(i === 0 && /^HPD job /.test(l)));
  const lines: string[] = [];
  let skip = false;
  for (const l of all) {
    if (pages.length && /^HPD's full description:?\s*$/i.test(l.trim())) { skip = true; lines.push("HPD's full description: see the first page."); continue; }
    if (skip && !l.trim()) { skip = false; lines.push(""); continue; }
    if (!skip) lines.push(l);
  }
  for (const raw of lines) {
    const isLink = Boolean(link && raw.includes(link));
    for (const l of (isLink ? [] : raw ? wrap(raw) : [""])) {
      if (y < M + lead) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(l, { x: M, y, size, font: /:$/.test(l) ? bold : font, color: rgb(0.08, 0.1, 0.15) });
      y -= lead;
    }
    if (isLink) {
      // A big button that opens the job page (photos, call, navigate).
      if (y < M + 60) { page = doc.addPage([W, H]); y = H - M; }
      const bh = 44, by = y - bh + 8;
      page.drawRectangle({ x: M, y: by, width: W - M * 2, height: bh, color: rgb(0.04, 0.52, 1) });
      page.drawText("Open the job page (photos, call, navigate)", { x: M + 16, y: by + 15, size: 15, font: bold, color: rgb(1, 1, 1) });
      const annot = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [M, by, W - M, by + bh], Border: [0, 0, 0],
        A: doc.context.obj({ Type: "Action", S: "URI", URI: PDFString.of(link) }) });
      page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(annot)]));
      y = by - 14;
      for (const l of wrap(link)) { page.drawText(l, { x: M, y, size: 10, font, color: rgb(0.04, 0.52, 1) }); y -= 14; }
      y -= 8;
    }
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return new File([bytes.slice().buffer as ArrayBuffer], `${id} job for worker.pdf`, { type: "application/pdf" });
}
