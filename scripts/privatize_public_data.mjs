// Keeps tenant names and phone numbers off the public site (the repo and pages.dev are public).
//  - Jobs (data/ and public/data/COA_Fetcher_2026.json, the CSV): tenant fields and "TENANT ... phone" text in
//    descriptions are moved into an encrypted bundle and blanked / masked in the public copies.
//  - Invitations (upcoming_bids.json): the same for HPD's notes / descriptions.
//  - HPD's invitation PDFs (page 2 has the tenant) and page-3 pictures: encrypted, plain copies removed.
// The bundle and files live under public/private/ (AES-256-GCM, key HPD_PRIVATE_DATA_KEY); the signed-in
// route /api/private/* (server/private-data.mjs) opens them for the owner only. Each run merges with the
// bundle already there, so tenant details of older jobs are kept even though the public files no longer
// have them. A plain copy of each PDF stays on this computer in data/private-itb/ (not in git) for scripts.
//
//   HPD_PRIVATE_DATA_KEY=... node scripts/privatize_public_data.mjs      (or the key in data/private/HPD_PRIVATE_DATA_KEY.txt)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const keyText = process.env.HPD_PRIVATE_DATA_KEY || (fs.existsSync(path.join(ROOT, "data/private/HPD_PRIVATE_DATA_KEY.txt")) ? fs.readFileSync(path.join(ROOT, "data/private/HPD_PRIVATE_DATA_KEY.txt"), "utf8") : "");
const KEY = Buffer.from(keyText.trim(), "base64");
if (KEY.length !== 32) { console.error("HPD_PRIVATE_DATA_KEY missing: tenant data NOT privatized"); process.exit(1); }

const PRIVATE_DIR = path.join(ROOT, "public", "private");
const BUNDLE = path.join(PRIVATE_DIR, "tenants.json.enc");
const LOCAL_ITB = path.join(ROOT, "data", "private-itb");

export function encrypt(buf, key = KEY) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
}
export function decrypt(buf, key = KEY) {
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}

// Fields that hold a tenant's name / phone / apartment contact (access type, appointment flags stay public).
export const PRIVATE_FIELDS = new Set(["TenantName", "TenantPhone", "ItbTenantName", "ItbTenantPhone", "ItbTenantApartment",
  "tenantName", "tenantPhone", "itbTenantName", "itbTenantPhone", "itbTenantApartment", "tenant"]);
const PHONE = /\(?\d{3}\)?[\s.-]{0,2}\d{3}[\s.-]\d{4}/;
// "TENANT:- (FERNANDEZ, ESTER 718-490-9430)", "TENANT CONTACT: 347 526 1673": the contact part is masked.
const TENANT_TEXT = /\b((?:TENANT|OCCUPANT|RESIDENT)S?(?:\s+(?:CONTACT|NAME|PHONE|INFO))?\s*[:\-–]*\s*)([^\n]{0,90}?\(?\d{3}\)?[\s.-]{0,2}\d{3}[\s.-]\d{4}\)?)/gi;
export const MASK = "(tenant contact: sign in to see)";

// Any other person's phone in HPD's text (tenant, super, owner: "TENANT: AVENIA PHONE # 6462865786", "MARK FLYNN
// (212) 555-0100") is masked too; HPD's office lines (212-863-xxxx) stay. NYC-area codes only, so building /
// violation numbers aren't touched.
const AREA = "(?:212|332|347|516|631|646|718|845|914|917|929|201|551|732|862|973|908|203|475|860|215|267|610|484)";
const ANY_PHONE = new RegExp("(?<!\\d)\\(?" + AREA + "\\)?[\\s.-]{0,2}\\d{3}[\\s.-]?\\d{4}(?!\\d)", "g");
export const PHONE_MASK = "(phone: sign in to see)";
function maskPhones(value) {
  return value.replace(ANY_PHONE, (p) => (/^\(?212\)?[\s.-]{0,2}863/.test(p) ? p : PHONE_MASK));
}

export function maskText(value) {
  if (typeof value !== "string") return value;
  let out = value;
  // First the tenant line as a whole (name + phone), then any other non-HPD phone that's left.
  if (/TENANT|OCCUPANT|RESIDENT/i.test(out) && PHONE.test(out)) {
    // HPD's own office numbers (212-863-xxxx) after the word "tenant" ("IF TENANT REFUSES ... CALL 212 863 6008") stay.
    out = out.replace(TENANT_TEXT, (all, label, contact) => (/\(?212\)?[\s.-]{0,2}863[\s.-]\d{4}/.test(contact) && !/\(?(?!212)\d{3}\)?[\s.-]{0,2}\d{3}[\s.-]\d{4}/.test(contact.replace(/\(?212\)?[\s.-]{0,2}863[\s.-]\d{4}/g, "")) ? all : `${label}${MASK}`));
  }
  return maskPhones(out);
}

// One record: the private values out (only what changed), the public record back.
// File names (HPD's "ER07755_101326091717.pdf": the 12-digit stamp can look like a phone) are never masked.
export const FILE_FIELD = /file/i;

export function splitRecord(rec) {
  const pub = { ...rec }, priv = {};
  for (const [k, v] of Object.entries(rec)) {
    if (FILE_FIELD.test(k)) continue;
    if (PRIVATE_FIELDS.has(k)) {
      if (v !== "" && v !== null && v !== undefined) priv[k] = v;
      pub[k] = "";
    } else {
      const masked = maskText(v);
      if (masked !== v) { priv[k] = v; pub[k] = masked; }
    }
  }
  return { pub, priv };
}

// Merge newly found private values into the bundle. A value that's already masked (from an earlier run) is
// not an original: the bundle keeps the original it has.
function mergeInto(store, omo, priv) {
  const clean = Object.fromEntries(Object.entries(priv).filter(([, v]) => !(typeof v === "string" && (v.includes(MASK) || v.includes(PHONE_MASK)))));
  if (Object.keys(clean).length) store[omo] = { ...(store[omo] || {}), ...clean };
  return Object.keys(clean).length;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function writeJson(p, v, pretty) { fs.writeFileSync(p, pretty ? JSON.stringify(v, null, 2) : JSON.stringify(v)); }

function main() {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const bundle = fs.existsSync(BUNDLE) ? JSON.parse(decrypt(fs.readFileSync(BUNDLE)).toString("utf8")) : { jobs: {}, bids: {} };
  bundle.jobs ||= {}; bundle.bids ||= {};
  let fields = 0;
  // Jobs: both copies. A value found now (fresh from the fetcher) replaces the bundle's; the bundle keeps the rest.
  for (const file of ["data/COA_Fetcher_2026.json", "public/data/COA_Fetcher_2026.json"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
    const rows = JSON.parse(raw);
    const out = rows.map((r0) => {
      // An earlier run masked file names by mistake: put the originals back (they aren't private).
      const r = { ...r0 };
      const saved = bundle.jobs[String(r0.OMO || r0.omo || "").toUpperCase()] || {};
      for (const k of Object.keys(r)) {
        if (FILE_FIELD.test(k) && typeof r[k] === "string" && (r[k].includes(PHONE_MASK) || r[k].includes(MASK)) && typeof saved[k] === "string") r[k] = saved[k];
      }
      const { pub, priv } = splitRecord(r);
      const omo = String(r.OMO || r.omo || "").toUpperCase();
      if (omo) fields += mergeInto(bundle.jobs, omo, priv);
      return pub;
    });
    writeJson(p, out, /\n {2}"/.test(raw.slice(0, 200)));
  }
  // File names were never private (an earlier run saved some by mistake): drop them from the bundle, now that
  // both job files are done.
  for (const saved of Object.values(bundle.jobs)) for (const k of Object.keys(saved)) if (FILE_FIELD.test(k)) delete saved[k];
  // The CSV copy: tenant columns blanked, tenant text masked.
  const csvPath = path.join(ROOT, "public/data/COA_Fetcher_2026.csv");
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/);
    const head = parseCsvLine(lines[0] || "");
    const drop = head.map((h, i) => (PRIVATE_FIELDS.has(h) ? i : -1)).filter((i) => i >= 0);
    const fixed = [lines[0], ...lines.slice(1).map((l) => {
      if (!l) return l;
      const cells = parseCsvLine(l).map((c, i) => (drop.includes(i) ? "" : maskText(c)));
      return cells.map(csvCell).join(",");
    })];
    fs.writeFileSync(csvPath, fixed.join("\n"));
  }
  // Invitations: notes / description.
  for (const file of ["data/upcoming_bids.json", "public/data/upcoming_bids.json"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const d = readJson(p);
    d.bids = (d.bids || []).map((b) => {
      const { pub, priv } = splitRecord(b);
      fields += mergeInto(bundle.bids, String(b.omo).toUpperCase(), priv);
      return pub;
    });
    writeJson(p, d, true);
  }
  // Files only used for pricing / the notices list: tenant text and personal phone numbers masked in place
  // (nothing to restore; the full notices stay in data/hpd_requests.json, which isn't in git).
  const maskDeep = (v) => (typeof v === "string" ? maskText(v) : Array.isArray(v) ? v.map(maskDeep) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskDeep(x)])) : v);
  for (const file of ["public/data/market_awards.json", "data/market_awards.json", "data/market_descriptions.json", "public/data/hpd_requests.json"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
    const second = raw.split(String.fromCharCode(10))[1] || ""; // keep the file's own indentation
    const indent = second.length - second.trimStart().length;
    const masked = JSON.stringify(maskDeep(JSON.parse(raw)), null, indent || undefined);
    if (masked !== raw) fs.writeFileSync(p, masked);
  }
  // Rewrite the bundle only when its contents changed (a fresh IV every run would change the file every time).
  const before = fs.existsSync(BUNDLE) ? decrypt(fs.readFileSync(BUNDLE)).toString("utf8") : "";
  const { updatedAt: _u, ...beforeBody } = before ? JSON.parse(before) : {};
  const { updatedAt: _v, ...nowBody } = bundle;
  if (JSON.stringify(beforeBody) !== JSON.stringify(nowBody)) {
    bundle.updatedAt = new Date().toISOString();
    fs.writeFileSync(BUNDLE, encrypt(Buffer.from(JSON.stringify(bundle))));
  }
  // Invitation PDFs and page-3 pictures: encrypt, keep a local plain copy, remove from the public site.
  let files = 0;
  for (const [src, dst, ext] of [["public/documents/itb", "public/private/itb", ".pdf"], ["public/documents/itb-pages", "public/private/itb-pages", ".png"]]) {
    const from = path.join(ROOT, src);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.join(ROOT, dst), { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (!name.toLowerCase().endsWith(ext)) continue;
      const plain = fs.readFileSync(path.join(from, name));
      const encPath = path.join(ROOT, dst, `${name}.enc`);
      // Same file already encrypted (the reader copies today's PDFs again each run): don't rewrite it (git churn).
      let same = false;
      try { same = fs.existsSync(encPath) && decrypt(fs.readFileSync(encPath)).equals(plain); } catch { same = false; }
      if (!same) fs.writeFileSync(encPath, encrypt(plain));
      fs.mkdirSync(path.join(LOCAL_ITB, path.basename(src)), { recursive: true });
      fs.writeFileSync(path.join(LOCAL_ITB, path.basename(src), name), plain);
      fs.unlinkSync(path.join(from, name));
      files += 1;
    }
  }
  console.log(`Private data: ${Object.keys(bundle.jobs).length} jobs and ${Object.keys(bundle.bids).length} invitations with tenant details (${fields} values moved this run); ${files} PDFs / pictures encrypted and removed from the public site`);
}

function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const csvCell = (c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) main();
