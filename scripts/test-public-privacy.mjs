// No tenant phone numbers / contact names in anything public (the repo and the site are public; 22 Oct a tenant's
// "(347) 737- 6305" was found in the awards list): every public data file is scanned for phone-shaped numbers (any
// spacing, HPD's 212-863 office lines allowed) and "TENANT CONTACT: <name>" lines. The full text stays encrypted
// (public/private/*.enc) for the owner, signed in.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const files = [
  ...fs.readdirSync(path.join(ROOT, "public", "data")).filter((f) => /\.(json|csv|txt)$/.test(f)).map((f) => path.join("public", "data", f)),
  "data/market_descriptions.json", "data/market_awards.json", "data/upcoming_bids.json", "data/COA_Fetcher_2026.json",
].filter((f) => fs.existsSync(path.join(ROOT, f)));
const PHONE = /(?<![\d-])\(?\b(?:212|332|347|516|631|646|718|845|914|917|929|201|551|732|862|973|908)\)?[\s.-]{0,3}\d{3}[\s.-]{0,3}\d{4}(?![\d-])/g;
const NAME = /\b(?:TENANT|OCCUPANT|RESIDENT)S?\s*(?:CONTACT|NAME)\s*[:\-–]+\s*(?!\(tenant contact)[A-Z][A-Za-z'.-]+,\s*[A-Z][A-Za-z'.-]+/g;
const problems = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"[A-Za-z]*[Ff]ile"\s*:\s*"[^"]*"/g, ""); // file names (12-digit stamps) aren't phones
  const phones = (text.match(PHONE) || []).filter((p) => !/^\(?212\)?[\s.-]{0,3}863/.test(p));
  const names = text.match(NAME) || [];
  if (phones.length) problems.push(`${f}: ${phones.length} phone(s), e.g. ${phones[0].replace(/\d(?=\d{2})/g, "•")}`);
  if (names.length) problems.push(`${f}: ${names.length} tenant name(s)`);
}
assert.deepEqual(problems, [], `tenant contacts in public files:\n${problems.join("\n")}`);
console.log(`PASS public privacy: ${files.length} public data files have no tenant phones or contact names (HPD office lines allowed)`);
