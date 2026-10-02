// Draws the contractor invoice as a clean vector page (replaces the scanned invoice template).
// Same fields and wording as the paper invoice, in the same order.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, TextRenderingMode, popGraphicsState, pushGraphicsState, rgb, setLineWidth, setTextRenderingMode } from "pdf-lib";
import type { InvoiceMaterial } from "./invoice-materials";

export const INVOICE_COMPANY = {
  name: "UNITED ANGEL CONSTRUCTION CORP.",
  street: "120-17 91st Avenue",
  city: "Richmond Hill, NY 11418",
  phone: "Tel (917) 416-0359",
  // Printed in the header when filled in.
  fax: "(718) 989-1381",
  email: "uac525@gmail.com",
};

export type InvoiceData = {
  omo: string;
  invoiceNo: string;
  invoiceDate: string;
  taxId: string;
  trade: string;
  borough: string;
  address: string;
  location: string;
  dateStarted: string;
  dateCompleted: string;
  permitRequired: boolean;
  approvedChange: boolean;
  rcMini: boolean;
  description: string;
  materials: InvoiceMaterial[];
  bidAmount: string;
  changeAmount: string;
  totalCharge: string;
  signerName: string;
  title: string;
  // Signer's own signature (PNG), drawn on the Signature of Principal line.
  signature?: Uint8Array;
};

const PAGE = { width: 612, height: 792 };
const MARGIN = 40;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
// Black and white, thin lines, no filled bars: prints and faxes cleanly with little ink.
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.2, 0.2, 0.2);
const GRID = rgb(0.45, 0.45, 0.45);
// Hairline outline on regular letters: a weight between regular and bold that holds up on paper.
const MEDIUM_STROKE = 0.3;
const RULE = 0.6;
const MATERIAL_ROWS = 12;

type Fonts = { regular: PDFFont; medium: PDFFont; bold: PDFFont; italic: PDFFont };

// Standard PDF fonts only encode WinAnsi; swap anything else for a close ASCII character.
function safeText(font: PDFFont, value: string) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(String(value || ""))
    .map((char) => {
      if (char === "\n" || supported.has(char.codePointAt(0)!)) return char;
      if (/[‐-―]/.test(char)) return "-";
      if (/[‘’]/.test(char)) return "'";
      if (/[“”]/.test(char)) return '"';
      return /\s/.test(char) ? " " : "";
    })
    .join("");
}

function wrapLines(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safeText(font, text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // Break a single over-long word.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

function fitSize(font: PDFFont, text: string, maxSize: number, width: number, minSize = 6) {
  let size = maxSize;
  const value = safeText(font, text);
  while (size > minSize && font.widthOfTextAtSize(value, size) > width) size -= 0.25;
  return size;
}

class Canvas {
  constructor(private page: PDFPage, private fonts: Fonts) {}

  // y is measured from the top of the page.
  text(value: string, x: number, top: number, size: number, font: PDFFont = this.fonts.regular, color = INK) {
    const medium = font === this.fonts.medium;
    if (medium) this.page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(MEDIUM_STROKE));
    this.page.drawText(safeText(font, value), { x, y: PAGE.height - top - size * 0.8, size, font, color });
    if (medium) this.page.pushOperators(popGraphicsState());
  }

  textRight(value: string, right: number, top: number, size: number, font: PDFFont = this.fonts.regular, color = INK) {
    const clean = safeText(font, value);
    this.text(clean, right - font.widthOfTextAtSize(clean, size), top, size, font, color);
  }

  textCenter(value: string, center: number, top: number, size: number, font: PDFFont = this.fonts.regular, color = INK) {
    const clean = safeText(font, value);
    this.text(clean, center - font.widthOfTextAtSize(clean, size) / 2, top, size, font, color);
  }

  // Single-line value that shrinks to fit its width.
  fitted(value: string, x: number, top: number, width: number, maxSize: number, font: PDFFont = this.fonts.bold) {
    const size = fitSize(font, value, maxSize, width);
    this.text(value, x, top + (maxSize - size) / 2, size, font);
  }

  rect(x: number, top: number, width: number, height: number, options: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; borderWidth?: number } = {}) {
    this.page.drawRectangle({
      x,
      y: PAGE.height - top - height,
      width,
      height,
      color: options.fill,
      borderColor: options.border,
      borderWidth: options.border ? options.borderWidth ?? RULE : 0,
    });
  }

  line(x1: number, top1: number, x2: number, top2: number, color = GRID, thickness = RULE) {
    this.page.drawLine({ start: { x: x1, y: PAGE.height - top1 }, end: { x: x2, y: PAGE.height - top2 }, color, thickness });
  }

  checkbox(x: number, top: number, checked: boolean) {
    this.rect(x, top, 8, 8, { border: INK, borderWidth: 0.8 });
    if (checked) {
      this.line(x + 1.6, top + 4.2, x + 3.4, top + 6.4, INK, 1.3);
      this.line(x + 3.4, top + 6.4, x + 6.8, top + 1.6, INK, 1.3);
    }
  }

  yesNo(x: number, top: number, yes: boolean) {
    this.checkbox(x, top, yes);
    this.text("Yes", x + 11, top, 8.5);
    this.checkbox(x + 34, top, !yes);
    this.text("No", x + 45, top, 8.5);
  }
}

export async function drawInvoicePage(doc: PDFDocument, data: InvoiceData) {
  const page = doc.addPage();
  page.setSize(PAGE.width, PAGE.height);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    // Same Helvetica, embedded separately so Canvas can tell medium text apart.
    medium: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const c = new Canvas(page, fonts);
  const left = MARGIN;
  const right = PAGE.width - MARGIN;

  // Header: company block and invoice block.
  c.text(INVOICE_COMPANY.name, left, 34, 17, fonts.bold);
  const contact = [
    INVOICE_COMPANY.street,
    INVOICE_COMPANY.city,
    [INVOICE_COMPANY.phone, INVOICE_COMPANY.fax && `Fax ${INVOICE_COMPANY.fax}`].filter(Boolean).join("   |   "),
    INVOICE_COMPANY.email,
  ].filter(Boolean);
  contact.forEach((line, index) => c.text(line, left, 56 + index * 12, 9.5, fonts.regular, MUTED));

  c.textRight("INVOICE", right, 30, 22, fonts.regular);
  const metaRows: [string, string][] = [
    ["Invoice #", data.invoiceNo],
    ["Invoice Date", data.invoiceDate],
    ["Tax ID #", data.taxId],
  ];
  metaRows.forEach(([label, value], index) => {
    const top = 58 + index * 13;
    c.textRight(label, right - 92, top, 9, fonts.regular, MUTED);
    c.fitted(value, right - 86, top - 0.5, 86, 10, fonts.medium);
  });
  c.line(left, 110, right, 110, INK, RULE);

  // Job details grid.
  const gridTop = 122;
  const rowHeight = 19;
  const colWidth = CONTENT_WIDTH / 2;
  const labelWidth = 92;
  const leftRows: [string, string][] = [
    ["OMO #", data.omo],
    ["Trade", data.trade],
    ["Borough", data.borough],
    ["Building Address", data.address],
    ["Work Location / Apt.", data.location],
  ];
  const rightRows: [string, string | boolean][] = [
    ["Date Work Started", data.dateStarted],
    ["Date Work Completed", data.dateCompleted],
    ["Work Permit / Cert. Required", data.permitRequired],
    ["Approved Increase / Decrease", data.approvedChange],
    ["RC / Mini RC", data.rcMini],
  ];
  const gridHeight = rowHeight * leftRows.length;
  c.rect(left, gridTop, CONTENT_WIDTH, gridHeight, { border: GRID });
  c.line(left + colWidth, gridTop, left + colWidth, gridTop + gridHeight);
  for (let index = 0; index < leftRows.length; index += 1) {
    const top = gridTop + index * rowHeight;
    if (index) c.line(left, top, right, top);
    const [leftLabel, leftValue] = leftRows[index];
    c.text(leftLabel, left + 6, top + 5.5, 8.5, fonts.regular, MUTED);
    c.fitted(leftValue, left + labelWidth + 7, top + 4.3, colWidth - labelWidth - 12, 10.5, fonts.medium);
    const [rightLabel, rightValue] = rightRows[index];
    c.text(rightLabel, left + colWidth + 6, top + 5.5, 8, fonts.regular, MUTED);
    const valueX = left + colWidth + labelWidth + 41;
    if (typeof rightValue === "boolean") c.yesNo(valueX, top + 5.5, rightValue);
    else c.fitted(rightValue, valueX, top + 4.3, colWidth - labelWidth - 46, 10.5, fonts.medium);
  }
  const rcNoteTop = gridTop + gridHeight + 4;
  c.textRight("If Yes, provide RC or Mini RC #: ______________", right, rcNoteTop, 8, fonts.italic, MUTED);

  // Description of work done.
  const descTop = rcNoteTop + 16;
  const descHeight = 168;
  c.text("DESCRIPTION OF WORK DONE", left + 7, descTop + 4.5, 9, fonts.bold);
  c.line(left, descTop + 17, right, descTop + 17, GRID, RULE);
  c.rect(left, descTop, CONTENT_WIDTH, descHeight, { border: GRID });
  const textWidth = CONTENT_WIDTH - 16;
  const textArea = descHeight - 17 - 18;
  let descSize = 10.5;
  let lines = wrapLines(fonts.medium, data.description, descSize, textWidth);
  while (descSize > 6 && lines.length * descSize * 1.22 > textArea) {
    descSize -= 0.25;
    lines = wrapLines(fonts.medium, data.description, descSize, textWidth);
  }
  lines.forEach((line, index) => c.text(line, left + 8, descTop + 23 + index * descSize * 1.22, descSize, fonts.medium));
  c.text(
    "Your request for service charge and the dollar amount should be added to the work description.",
    left + 8,
    descTop + descHeight - 12,
    8,
    fonts.italic,
    MUTED
  );

  // Materials table.
  const tableTop = descTop + descHeight + 10;
  const numberWidth = 30;
  const qtyWidth = 82;
  const materialRow = 16;
  c.textCenter("No.", left + numberWidth / 2, tableTop + 4.5, 8.5, fonts.bold);
  c.text("MATERIAL - LIST SEPARATELY", left + numberWidth + 7, tableTop + 4.5, 8.5, fonts.bold);
  c.textCenter("QUANTITY", right - qtyWidth / 2, tableTop + 4.5, 8.5, fonts.bold);
  const noteTop = tableTop + 17;
  c.line(left, noteTop, right, noteTop, GRID, RULE);
  c.textCenter("The material and quantity areas must be completed just as you would for full payment.", left + CONTENT_WIDTH / 2, noteTop + 3.2, 8, fonts.italic, MUTED);
  const rowsTop = noteTop + 13;
  const rowsHeight = materialRow * MATERIAL_ROWS;
  for (let index = 0; index < MATERIAL_ROWS; index += 1) {
    const top = rowsTop + index * materialRow;
    c.line(left, top, right, top);
    c.textCenter(String(index + 1), left + numberWidth / 2, top + 3.4, 8.5, fonts.regular, MUTED);
    const material = data.materials[index];
    if (material) {
      c.fitted(material.name, left + numberWidth + 7, top + 2.6, CONTENT_WIDTH - numberWidth - qtyWidth - 14, 10, fonts.medium);
      c.textCenter(safeText(fonts.medium, material.qty), right - qtyWidth / 2, top + 2.6, 10, fonts.medium);
    }
  }
  c.rect(left, tableTop, CONTENT_WIDTH, 17 + 13 + rowsHeight, { border: GRID });
  c.line(left + numberWidth, rowsTop, left + numberWidth, rowsTop + rowsHeight);
  c.line(right - qtyWidth, rowsTop, right - qtyWidth, rowsTop + rowsHeight);
  const tableBottom = rowsTop + rowsHeight;
  c.text("Attach separate sheet for additional materials and quantity used or work description.", left, tableBottom + 4, 8, fonts.italic, MUTED);

  // Penalty text and totals.
  const lowerTop = tableBottom + 20;
  const totalsWidth = 220;
  const totalsLeft = right - totalsWidth;
  c.text("PENALTY FOR FALSIFICATION", left, lowerTop, 8, fonts.bold);
  wrapLines(
    fonts.regular,
    "Falsification of any statement made herein is an offense punishable by a fine or imprisonment or both, pursuant to the NYC Administrative Code. I hereby certify the above to be correct as specified.",
    8.3,
    totalsLeft - left - 18
  ).forEach((line, index) => c.text(line, left, lowerTop + 12 + index * 10.5, 8.3, fonts.regular, MUTED));

  const totals: [string, string, boolean][] = [
    ["Bid Amount", data.bidAmount, false],
    ["Approved Increase / Decrease", data.changeAmount, false],
    ["TOTAL CHARGE", data.totalCharge, true],
  ];
  const totalRow = 18;
  totals.forEach(([label, value, strong], index) => {
    const top = lowerTop - 4 + index * totalRow;
    if (index) c.line(totalsLeft, top, right, top, strong ? INK : GRID, RULE);
    c.text(label, totalsLeft + 7, top + 5, 9, strong ? fonts.bold : fonts.regular, strong ? INK : MUTED);
    c.textRight(`$ ${value}`, right - 7, top + 4, 11, strong ? fonts.bold : fonts.medium);
  });
  c.rect(totalsLeft, lowerTop - 4, totalsWidth, totalRow * totals.length, { border: GRID });

  // Signature block.
  const signTop = lowerTop + 78;
  if (data.signature?.length) {
    const image = await doc.embedPng(data.signature);
    const scale = Math.min(230 / image.width, 34 / image.height);
    page.drawImage(image, { x: left + 8, y: PAGE.height - (signTop + 13), width: image.width * scale, height: image.height * scale });
  }
  c.line(left, signTop + 14, left + 250, signTop + 14, INK, RULE);
  c.text("Signature of Principal (blue ink only)", left, signTop + 18, 8, fonts.regular, MUTED);
  c.text(data.signerName, left + 280, signTop + 1, 11, fonts.medium);
  c.line(left + 280, signTop + 14, right - 90, signTop + 14, INK, RULE);
  c.text("Name (please print)", left + 280, signTop + 18, 8, fonts.regular, MUTED);
  c.text(data.title, right - 78, signTop + 1, 11, fonts.medium);
  c.line(right - 78, signTop + 14, right, signTop + 14, INK, RULE);
  c.text("Title", right - 78, signTop + 18, 8, fonts.regular, MUTED);

  return page;
}
