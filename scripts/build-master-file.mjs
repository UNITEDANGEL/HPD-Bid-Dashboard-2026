// The master file: everything about every job and bid in one record, saved every night.
// For each job: the job (award, address, dates, amount, description), everything saved from the phones
// on the status server (statuses, visit history, paperwork marks, revisions...), HPD's closing reason,
// the paperwork you sent HPD, and its follow-up state; plus every bid record, the bidding session, your
// award list and the open invitations. The repository is public, so the file is never committed as plain
// text: it's written readable only to a private folder (your OneDrive, with --dir) and committed
// encrypted (AES-256-GCM, key in MASTER_FILE_KEY), so every night's version is kept and can be restored.
// If the status server can't answer, the last saved copy of its data is kept (never replaced by nothing).
//
//   node scripts/build-master-file.mjs [--dir "C:/Users/.../OneDrive/HPD Master File"]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const ENC = path.join(ROOT, "data", "master", "master-file.json.enc");
const WORKER = (process.env.HPD_STATUS_WORKER_URL || "https://hpd-status-worker.uac525.workers.dev").replace(/\/$/, "");

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return fallback; } };

export function encrypt(text, keyB64) {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("MASTER_FILE_KEY must be 32 bytes, base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(Buffer.from(text, "utf8")), cipher.final()]);
  return JSON.stringify({ v: 1, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}

export function decrypt(payload, keyB64) {
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), Buffer.from(p.iv, "base64"));
  decipher.setAuthTag(Buffer.from(p.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(p.data, "base64")), decipher.final()]).toString("utf8");
}

export async function fetchOverrides(fetcher = fetch, tries = 3, wait = 3000) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetcher(`${WORKER}/overrides`, { headers: { "User-Agent": "hpd-master-file" } });
      if (r.ok) { const body = await r.json(); if (body && typeof body.overrides === "object") return { ok: true, overrides: body.overrides }; }
      last = `HTTP ${r.status}`;
    } catch (e) { last = e.message; }
    if (i < tries - 1) await new Promise((done) => setTimeout(done, wait));
  }
  return { ok: false, error: last };
}

const JOB_FIELDS = ["OMO", "BuildingAddress", "Borough", "AwardDate", "WorkStartDate", "WorkCompletionDate", "AwardAmount", "JobDescription", "ItbPage3Description", "Latitude", "Longitude", "TenantName", "TenantPhone", "Apartment"];

export function buildMaster({ jobs, overrides, overridesInfo, hpd, sent, yourAwards, upcoming, followUpOf, today, now }) {
  const byJob = {};
  for (const j of jobs) {
    const omo = String(j.OMO || "").toUpperCase();
    if (!omo) continue;
    const job = Object.fromEntries(JOB_FIELDS.filter((k) => j[k] !== undefined && j[k] !== "").map((k) => [k, j[k]]));
    const saved = overrides[omo] || null;
    const merged = { ...j, ...(saved || {}) };
    byJob[omo] = {
      job, saved,
      hpd: hpd[omo] ? { closedReason: hpd[omo].closedReason, amount: hpd[omo].amount } : null,
      paperworkSent: sent[omo] || [],
      followUp: followUpOf ? followUpOf(merged, hpd[omo], sent[omo]?.length ? { sentAt: sent[omo].at(-1).date, count: sent[omo].length } : undefined, today) : null,
    };
  }
  const bids = Object.fromEntries(Object.entries(overrides).filter(([k]) => k.startsWith("BID-")).map(([k, v]) => [k.slice(4), v]));
  const otherKeys = Object.fromEntries(Object.entries(overrides).filter(([k]) => !k.startsWith("BID-") && !byJob[k]));
  return {
    generatedAt: now, today,
    sources: {
      jobs: jobs.length, statusServer: overridesInfo, savedEntries: Object.keys(overrides).length,
      bids: Object.keys(bids).length, hpdStatus: Object.keys(hpd).length, paperworkSent: Object.keys(sent).length,
      yourAwards: Object.keys(yourAwards).length, openInvitations: upcoming.length,
    },
    jobs: byJob, bids, other: otherKeys, yourAwards, openInvitations: upcoming,
    statusServerData: overrides,
  };
}

function previousMaster(key, dir) {
  if (dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, "master-latest.json"), "utf8")); } catch { /* fall through */ } }
  if (key && fs.existsSync(ENC)) { try { return JSON.parse(decrypt(fs.readFileSync(ENC, "utf8"), key)); } catch { /* unreadable */ } }
  return null;
}

async function main() {
  const dirArg = process.argv.indexOf("--dir");
  const dir = dirArg > 0 ? process.argv[dirArg + 1] : process.env.MASTER_FILE_DIR || "";
  const key = process.env.MASTER_FILE_KEY || (dir && fs.existsSync(path.join(dir, "MASTER_FILE_KEY.txt")) ? fs.readFileSync(path.join(dir, "MASTER_FILE_KEY.txt"), "utf8").trim() : "");
  if (!dir && !key) { console.log("Master file not written: no private folder (--dir) and no MASTER_FILE_KEY."); return; }
  const now = new Date().toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  // Status server: never replace the saved copy with nothing when it can't answer.
  const got = await fetchOverrides();
  let overrides = got.ok ? got.overrides : null;
  let overridesInfo = got.ok ? { ok: true, at: now } : null;
  if (!overrides) {
    const prev = previousMaster(key, dir);
    overrides = prev?.statusServerData || {};
    overridesInfo = { ok: false, error: got.error, keptFrom: prev?.generatedAt || "none" };
    // A saved copy of the server's data (e.g. taken earlier while it answered) fills an empty backup.
    const seedArg = process.argv.indexOf("--seed");
    if (!Object.keys(overrides).length && seedArg > 0) {
      const seedFile = process.argv[seedArg + 1];
      const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
      overrides = seed.overrides || seed;
      overridesInfo = { ok: false, error: got.error, keptFrom: `copy taken ${fs.statSync(seedFile).mtime.toISOString()}` };
    }
    console.log(`Status server didn't answer (${got.error}); keeping its data from ${overridesInfo.keptFrom}.`);
  }
  const { loadLib } = await import(pathToFileURL(path.join(ROOT, "scripts", "daily-report.mjs")).href);
  const { followUpOf } = await loadLib("job-followup");
  const master = buildMaster({
    jobs: readJson("data/COA_Fetcher_2026.json", []).filter((j) => String(j.OMO).toUpperCase() !== "TEST-0001"),
    overrides, overridesInfo,
    hpd: readJson("data/hpd_job_status.json", {}).jobs || {},
    sent: readJson("data/sent_paperwork.json", {}).jobs || {},
    yourAwards: readJson("data/your_awards.json", {}),
    upcoming: readJson("data/upcoming_bids.json", {}).bids || [],
    followUpOf, today, now,
  });
  const text = JSON.stringify(master);
  const written = [];
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `master-${today}.json`), text);
    fs.writeFileSync(path.join(dir, "master-latest.json"), text);
    written.push(path.join(dir, `master-${today}.json`));
  }
  if (key) {
    fs.mkdirSync(path.dirname(ENC), { recursive: true });
    fs.writeFileSync(ENC, encrypt(text, key));
    written.push(`${path.relative(ROOT, ENC)} (encrypted)`);
  }
  const s = master.sources;
  console.log(`Master file: ${s.jobs} jobs, ${s.savedEntries} saved entries (status server ${overridesInfo.ok ? "ok" : "kept from " + overridesInfo.keptFrom}), ${s.bids} bids, ${s.paperworkSent} paperwork-sent OMOs, ${s.hpdStatus} HPD statuses, ${(text.length / 1e6).toFixed(1)} MB -> ${written.join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Master file not written: ${error.message}`); process.exit(1); });
}
