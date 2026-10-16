// Fills every current invitation (public/data/upcoming_bids.json) with a price and checks inside each
// PDF: the price on page 1, page 2 and the Work Description Form, company / phone / date on page 1,
// the page 3 stamp, the signature and the debris line on the last page, and no page lost.
import fs from "node:fs";
import { readPrivateFile } from "./private-files.mjs"; // invitation PDFs are kept encrypted
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
// Compiled inside node_modules so the filler's own import of pdf-lib resolves.
const dir = path.join(root, "node_modules", ".cache", "hpd-bid-packages");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "bid-fill.mjs"), ts.transpileModule(fs.readFileSync(path.join(root, "lib", "bid-fill.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { fillBidPackage, bidDateText } = await import(pathToFileURL(path.join(dir, "bid-fill.mjs")).href);

const bids = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "upcoming_bids.json"), "utf8")).bids;
const problems = [];
for (const [i, bid] of bids.entries()) {
  const price = 375 + i * 37.5;
  const priceText = price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  try {
    const out = await fillBidPackage(readPrivateFile("itb", bid.itbFile), bid, price);
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(out), useSystemFonts: true, verbosity: 0 }).promise;
    const text = async (n) => (await (await pdf.getPage(n)).getTextContent()).items.map((x) => x.str).join(" ");
    const [p1, p2, last] = [await text(1), await text(2), await text(pdf.numPages)];
    const p3 = pdf.numPages >= 3 ? await text(3) : "";
    const checks = [
      [p1.includes(priceText), "price on page 1"], [p2.includes(priceText), "price on page 2"], [last.includes(priceText), "price on the work form"],
      [p1.includes("United Angel Construction Corp.") && p1.includes("718-989-1381"), "company on page 1"],
      [p1.includes(bidDateText(bid.bidDue)), "date on page 1"], [p3.includes("UNITED ANGEL CONSTRUCTION CORP."), "page 3 stamp"],
      [last.includes("Jot Singh") && /REMOVE ALL WORK RELATED DEBRIS\./.test(last), "work form signature and description"],
      [pdf.numPages === bid.pages, "all pages"],
    ];
    const missing = checks.filter(([good]) => !good).map(([, what]) => what);
    if (missing.length) problems.push(`${bid.omo}: missing ${missing.join(", ")}`);
  } catch (err) {
    problems.push(`${bid.omo}: ${err.message}`);
  }
}
assert.deepEqual(problems, [], `bid packages with problems:\n${problems.join("\n")}`);

// A revised bid: old price crossed out next to the new one with initials, and the revision noted, on
// page 1, page 2 and the work form, for every current invitation.
const revisedProblems = [];
for (const bid of bids) {
  const out = await fillBidPackage(readPrivateFile("itb", bid.itbFile), bid, 1100, { previousPrice: 1250, count: 1, date: "2026-10-12" });
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(out), useSystemFonts: true, verbosity: 0 }).promise;
  const text = async (n) => (await (await pdf.getPage(n)).getTextContent()).items.map((x) => x.str).join(" ");
  for (const [n, note] of [[1, "PRICE REVISED 1X ON 10/12/26"], [2, "REV. 1X 10/12/26"], [pdf.numPages, "REV. 1X 10/12/26"]]) {
    const t = await text(n);
    if (!(t.includes("1,250.00") && t.includes("1,100.00") && t.includes("JS") && t.includes(note))) revisedProblems.push(`${bid.omo} page ${n}`);
  }
}
assert.deepEqual(revisedProblems, [], `revised packages missing the old/new price, initials or note: ${revisedProblems.join(", ")}`);
console.log(`PASS bid packages: all ${bids.length} current invitations fill completely, revised ones cross out the old price with initials and date (price on page 1, page 2 and the work form, company, date, stamp, signature, description)`);
