// 👷 Worker view (owner, 14 Nov: "a lite app for worker"): the job travels inside the link's # part
// (https://…/worker/#j=…). The # part never goes to any server, so no tenant data is stored on the public site.
import type { CrewJob } from "./crew-share";

export type WorkerJob = { pass?: string; id: string; address: string; apt?: string; by?: string; work: string[]; photos: string[]; contact?: { name: string; phone: string; note?: string } | null; tenant?: { name?: string; phone?: string } | null; where?: string; full?: string };

export function toWorkerJob(j: CrewJob): WorkerJob {
  return { id: j.id, address: j.address, apt: j.apt, by: j.completeBy, work: j.work.slice(0, 8).map((w) => w.slice(0, 160)), photos: workerPhotos(j), contact: j.contact || null, tenant: j.tenant || null, where: j.where ? j.where.slice(0, 120) : undefined, full: j.full || undefined };
}
// True when the # part has a job that didn't come through whole (cut off on the way).
export function workerHashCut(hash: string) { return /[#&](j|o)=/.test(hash || "") && !readWorkerHash(hash); }

// 20 Nov (owner: "the worker should be able to take before and after pictures also"): the photos still needed, and
// always a Before and an After spot even when the boss's phone already has some.
function workerPhotos(j: CrewJob): string[] {
  const left = (j.photos || []).filter((p) => !p.done).map((p) => p.label);
  const out = [...left];
  if (!out.some((p) => /before/i.test(p))) out.unshift("Before photos");
  if (!out.some((p) => /after/i.test(p))) out.push("After photos");
  return out;
}

function b64(s: string) { const bytes = new TextEncoder().encode(s); let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64(s: string) { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }

// 20 Nov (owner: "the link is too long ... make it a smaller nicer link"; WhatsApp cut the long one and the worker saw an
// empty page): the link carries only the job number and what the public site must not hold (apartment, tenant and
// building contact), e.g. …/worker/#o=ER08795&a=4B&t=Maria&p=7185550100. The worker page reads the address, the work,
// where it is and HPD's full description from the site's public job list by the job number.
const digits = (p: string) => String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
// k = the upload pass (25 Nov): the worker's Before / After photos and videos go straight to this job's card.
export function workerLink(origin: string, j: CrewJob, pass?: string) {
  const q: [string, string][] = [["o", j.id]];
  if (pass && /^[0-9a-z]{1,6}\.[A-Za-z0-9_-]{22}$/.test(pass)) q.push(["k", pass]);
  if (j.apt) q.push(["a", j.apt.replace(/^apt\.?\s*/i, "")]);
  if (j.tenant?.name) q.push(["t", j.tenant.name.split(/\s+/)[0]]);
  if (j.tenant?.phone) q.push(["p", digits(j.tenant.phone)]);
  if (j.contact?.phone) { q.push(["s", j.contact.name || "Building"], ["sp", digits(j.contact.phone)]); if (j.contact.note) q.push(["sn", j.contact.note.slice(0, 40)]); }
  return `${origin.replace(/\/$/, "")}/worker/#${q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`).join("&")}`;
}

export function readWorkerHash(hash: string): WorkerJob | null {
  const job = readWorkerJob(hash);
  const k = new URLSearchParams(String(hash || "").replace(/^#/, "")).get("k") || "";
  return job && /^[0-9a-z]{1,6}\.[A-Za-z0-9_-]{22}$/.test(k) ? { ...job, pass: k } : job;
}
function readWorkerJob(hash: string): WorkerJob | null {
  const short = /^#?o=|[#&]o=/.test(hash || "") ? new URLSearchParams(String(hash).replace(/^#/, "")) : null;
  if (short) {
    const id = (short.get("o") || "").trim().toUpperCase();
    if (!/^[A-Z]{2}\d{5,6}$/.test(id)) return null;
    const g = (k: string, n: number) => (short.get(k) || "").trim().slice(0, n) || undefined;
    const sp = g("sp", 30);
    return { id, address: "", apt: g("a", 20), work: [], photos: ["Before photos", "After photos"],
      contact: sp ? { name: g("s", 60) || "Building", phone: sp, note: g("sn", 100) } : null,
      tenant: g("t", 60) || g("p", 30) ? { name: g("t", 60), phone: g("p", 30) } : null };
  }
  const m = /[#&]j=([A-Za-z0-9_-]+)/.exec(hash || "");
  if (!m) return null;
  try {
    const o = JSON.parse(unb64(m[1]));
    if (!o || typeof o.id !== "string" || typeof o.address !== "string") return null;
    return { id: o.id.slice(0, 20), address: o.address.slice(0, 200), apt: o.apt ? String(o.apt).slice(0, 20) : undefined, by: o.by ? String(o.by).slice(0, 40) : undefined,
      work: (Array.isArray(o.work) ? o.work : []).slice(0, 10).map((w: unknown) => String(w).slice(0, 300)), photos: (Array.isArray(o.photos) ? o.photos : []).slice(0, 12).map((w: unknown) => String(w).slice(0, 60)),
      contact: o.contact && o.contact.phone ? { name: String(o.contact.name || "Building").slice(0, 60), phone: String(o.contact.phone).slice(0, 30), note: o.contact.note ? String(o.contact.note).slice(0, 100) : undefined } : null,
      tenant: o.tenant && (o.tenant.name || o.tenant.phone) ? { name: o.tenant.name ? String(o.tenant.name).slice(0, 60) : undefined, phone: o.tenant.phone ? String(o.tenant.phone).slice(0, 30) : undefined } : null,
      where: o.where ? String(o.where).slice(0, 200) : undefined, full: o.full ? String(o.full).slice(0, 1500) : undefined };
  } catch { return null; }
}
