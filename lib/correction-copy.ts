// The copy of a corrected affidavit / invoice that goes to HPD by email (owner, 16-17 Oct 2026): the same pages, with
// "COPY" across the top of every page and a cover page in front that says what was corrected (old -> new, in yellow), so the
// person at HPD sees the fix at a glance. The original that's printed, signed in ink and mailed stays unmarked.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type CopyChange = { label: string; from: string; to: string };

// Words that fit Helvetica's WinAnsi set (no curly quotes, arrows, emoji).
const plain = (t: string) => String(t || "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/→/g, "->")
  .replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

export async function markCorrectedCopy(pdf: Uint8Array | ArrayBuffer, info: { omo: string; rejectedAt: string; reason: string; changes: CopyChange[]; fixedOn: string }) {
  const doc = await PDFDocument.load(pdf);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const label = "COPY - CORRECTED PAPERWORK (original signed in ink, sent by mail)";
    const size = 8;
    page.drawText(label, { x: (width - bold.widthOfTextAtSize(label, size)) / 2, y: height - 14, size, font: bold, color: rgb(0.75, 0.1, 0.1) });
  });
  // A cover page in front (the form's own pages stay uncovered): what HPD rejected and what was changed, in yellow.
  const [w, h] = pages[0] ? [pages[0].getWidth(), pages[0].getHeight()] : [612, 792];
  const cover = doc.insertPage(0, [w, h]);
  const margin = 54;
  const textW = w - margin * 2;
  let y = h - margin;
  const write = (text: string, size: number, f: PDFFont, color = rgb(0.1, 0.1, 0.1), highlight = false) => {
    for (const line of wrap(plain(text), f, size, textW)) {
      y -= size * 1.35;
      if (highlight) cover.drawRectangle({ x: margin - 4, y: y - size * 0.3, width: Math.min(textW + 8, f.widthOfTextAtSize(line, size) + 8), height: size * 1.3, color: rgb(1, 0.93, 0.3) });
      cover.drawText(line, { x: margin, y, size, font: f, color });
    }
  };
  write("COPY - CORRECTED PAPERWORK", 22, bold, rgb(0.75, 0.1, 0.1));
  y -= 6;
  write(`OMO# ${info.omo}`, 18, bold);
  y -= 10;
  write(`HPD rejection${info.rejectedAt ? ` (${info.rejectedAt})` : ""}:`, 13, bold);
  write(info.reason ? info.reason.slice(0, 400) : "see HPD's notice", 12, font);
  y -= 12;
  write("What was corrected:", 13, bold);
  if (info.changes.length) for (const c of info.changes.slice(0, 12)) { y -= 2; write(`${c.label}: ${plain(c.from) || "(blank)"} -> ${plain(c.to)}`, 13, font, rgb(0.1, 0.1, 0.1), true); }
  else write("Corrected as HPD asked (see the notice).", 13, font, rgb(0.1, 0.1, 0.1), true);
  y -= 16;
  write(`Corrected on ${info.fixedOn}. The corrected affidavit and invoice follow. The original, signed in ink and notarized, is sent by mail.`, 12, font);
  write("United Angel Construction Corp", 12, bold);
  return doc.save();
}
