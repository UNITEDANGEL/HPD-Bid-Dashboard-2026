// Find any job (owner, 22 Oct: "I should be able to type a small description and it should guide me to the job;
// search by address or job"): one index of every job we know -- yours (2026 and 2024-25), open invitations, HPD's
// awards and every invitation PDF (page 3 has the address and the job description) -- so "mini split" finds ER08283
// at 3619 Bedford Avenue. Descriptions can hold tenant names / phones, so the index is encrypted like the emails
// (public/private/search.json.enc, opened by the signed-in route /api/private/search). Each run keeps what it
// already read from the PDFs and only reads new ones.
//
//   node scripts/build-search-index.mjs
import fs from "node:fs";
import path from "node:path";
import { decrypt, encrypt, maskText } from "./privatize_public_data.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "private", "search.json.enc");
const ITB = path.join(ROOT, "public", "private", "itb");
const read = (p, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return fallback; } };
const list = (v) => (Array.isArray(v) ? v : v?.jobs || v?.rows || v?.bids || []);
const clean = (s) => maskText(String(s || "").replace(/\s+/g, " ").trim()).slice(0, 700);
const BORO = { MN: "Manhattan", MAN: "Manhattan", BX: "Bronx", BK: "Brooklyn", BKLYN: "Brooklyn", QN: "Queens", QNS: "Queens", SI: "Staten Island" };
// "1/22/26", "01/22/2026", "2026-01-22T…" -> "2026-01-22".
const iso = (v) => { const t = String(v || "").trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0]; m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/.exec(t); return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : ""; };
const boro = (b) => { const s = String(b || "").trim(); return BORO[s.toUpperCase()] || s; };

const old = (() => { try { return JSON.parse(decrypt(fs.readFileSync(OUT)).toString("utf8")); } catch { return { items: [], pdfs: {} }; } })();
const items = new Map(); // omo -> item
const put = (omo, patch) => {
  if (!/^[A-Z]{2}\d{5}$/.test(omo || "")) return;
  const cur = items.get(omo) || { omo, kinds: [] };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "kind") { if (v && !cur.kinds.includes(v)) cur.kinds.push(v); continue; }
    if (v && (!cur[k] || (k === "desc" && String(v).length > String(cur[k]).length))) cur[k] = v;
  }
  items.set(omo, cur);
};

// Yours: 2026 jobs, 2024-25 jobs.
for (const j of list(read("public/data/COA_Fetcher_2026.json", []))) put(String(j.OMO || "").toUpperCase(), { kind: "yours", address: j.BuildingAddress, boro: boro(j.Borough || j.borough || j.Boro), desc: clean(j.ItbPage3Description || j.JobDescription || j.description || j.Job_Description), date: iso(j.AwardDate), amount: Number(j.AwardAmount) || 0, apt: j.ApartmentUnit || "" });
for (const j of list(read("public/data/jobs_2024_2025.json", []))) put(String(j.OMO || "").toUpperCase(), { kind: "yours", address: j.BuildingAddress, boro: boro(j.Borough), desc: clean(j.JobDescription), date: iso(j.AwardDate), amount: Number(j.AwardAmount) || 0, apt: j.ApartmentUnit || "" });
// Open invitations.
for (const b of list(read("public/data/upcoming_bids.json", {}))) put(String(b.omo || "").toUpperCase(), { kind: "bid", address: b.address, boro: boro(b.borough), desc: clean(b.description), due: b.bidDue ? `${b.bidDue} ${b.bidDueTime || ""}`.trim() : "" });
// HPD's awards (who won, for how much).
for (const a of list(read("data/market_awards.json", {}))) put(String(a.omo || "").toUpperCase(), { kind: a.won ? "yours" : "award", address: a.address, boro: boro(a.boro), desc: clean(a.description), date: iso(a.awardDate), amount: Number(a.amount) || 0, won: a.won ? "yes" : "no" });
// Every invitation's description.
const descs = read("data/market_descriptions.json", {});
for (const [omo, d] of Object.entries(descs)) put(omo.toUpperCase(), { kind: "invitation", desc: clean(d.description), file: d.source || "" });

// Invitation PDFs: page 3 "OMO No: ER08283 ... Boro: Brooklyn Bldg Address: 3619, BEDFORD AVENUE Job Description: ...".
const pdfs = { ...(old.pdfs || {}) };
if (fs.existsSync(ITB)) {
  const files = fs.readdirSync(ITB).filter((f) => f.endsWith(".pdf.enc") && !pdfs[f]);
  if (files.length) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const f of files) {
      try {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(decrypt(fs.readFileSync(path.join(ITB, f)))), useSystemFonts: true, verbosity: 0 }).promise;
        let text = "";
        for (let n = doc.numPages; n >= 1 && !/Bldg Address:/i.test(text); n--) text = (await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(" ").replace(/\s+/g, " ");
        const omo = (/OMO No:\s*([A-Z]{2}\d{5})/.exec(text) || /^([A-Z]{2}\d{5})/.exec(f) || [])[1] || "";
        const address = ((/Bldg Address:\s*(.+?)\s+Job Description:/i.exec(text) || [])[1] || "").replace(/^(\d+[A-Z-]*),\s*/, "$1 ").trim();
        const b = ((/Boro:\s*([A-Za-z ]+?)\s+Bldg Address:/i.exec(text) || [])[1] || "").trim();
        const desc = ((/Job Description:\s*(.+)$/i.exec(text) || [])[1] || "").slice(0, 900);
        pdfs[f] = { omo, address, boro: b, desc: clean(desc) };
        await doc.cleanup?.();
      } catch (e) { if (process.env.DEBUG) console.log(f, e instanceof Error ? e.message : e); pdfs[f] = { omo: (/^([A-Z]{2}\d{5})/.exec(f) || [])[1] || "", failed: true }; }
    }
  }
}
for (const [f, p] of Object.entries(pdfs)) if (p.omo) put(p.omo, { kind: "invitation", address: p.address, boro: boro(p.boro), desc: p.desc, file: f.replace(/\.enc$/, "") });

const out = { generatedAt: new Date().toISOString(), items: [...items.values()].map((i) => ({ ...i, address: String(i.address || "").replace(/\s+/g, " ").trim() })), pdfs };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// Nothing new (most 10-minute runs): leave the file alone, so git doesn't get a new 4 MB copy every run.
const same = JSON.stringify({ ...old, generatedAt: "" }) === JSON.stringify({ ...out, generatedAt: "" });
if (!same) fs.writeFileSync(OUT, encrypt(Buffer.from(JSON.stringify(out))));
console.log(`Search index${same ? " (unchanged)" : ""}: ${out.items.length} jobs (${out.items.filter((i) => i.address).length} with an address, ${out.items.filter((i) => i.desc).length} with a description), ${Object.keys(pdfs).length} invitation PDFs read.`);
