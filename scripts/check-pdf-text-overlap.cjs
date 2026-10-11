// Finds printed words that collide on a generated PDF (e.g. a filled-in value running into the
// form's own text). Usage: node scripts/check-pdf-text-overlap.cjs file.pdf [more.pdf...]
// Exits 1 when any two words on a page overlap by more than a hair. Needs poppler's pdftotext.
const { execFileSync } = require("node:child_process");

const MIN_OVERLAP = 0.6; // points, in both directions

function words(file) {
  const xml = execFileSync("pdftotext", ["-bbox", file, "-"]).toString();
  const pages = xml.split("<page ").slice(1);
  return pages.map((page) => [...page.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5] }))
    // The diagonal COPY watermark is meant to sit over the text (pdftotext splits it into pieces).
    .filter((w) => w.text.trim() && !/^(C|O|P|Y|CO|OP|PY|COP|OPY|COPY)$/.test(w.text))
    .flatMap(printedParts));
}

// "OMO#______" is a label plus a blank to write on. Keep only the printed characters' share of
// the box (split by character count) so a value written on the blank isn't flagged.
function printedParts(word) {
  const chars = [...word.text];
  const step = (word.x1 - word.x0) / chars.length;
  const parts = [];
  for (const run of word.text.matchAll(/[^_]+/g)) {
    const start = [...word.text.slice(0, run.index)].length;
    const length = [...run[0]].length;
    if (/^[.,]+$/.test(run[0])) continue;
    parts.push({ x0: word.x0 + start * step, x1: word.x0 + (start + length) * step, y0: word.y0, y1: word.y1, text: run[0] });
  }
  return parts;
}

function collisions(file) {
  const found = [];
  words(file).forEach((list, pageIndex) => {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i], b = list[j];
        const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (dx > MIN_OVERLAP && dy > MIN_OVERLAP) found.push(`page ${pageIndex + 1}: "${a.text}" x "${b.text}" (${dx.toFixed(1)} x ${dy.toFixed(1)} pt)`);
      }
    }
  });
  return found;
}

let failed = false;
for (const file of process.argv.slice(2)) {
  const found = collisions(file);
  if (found.length) {
    failed = true;
    console.log(`OVERLAP ${file}`);
    found.forEach((line) => console.log(`  ${line}`));
  } else {
    console.log(`PASS ${file}: no overlapping text`);
  }
}
if (failed) process.exitCode = 1;
module.exports = { collisions };
