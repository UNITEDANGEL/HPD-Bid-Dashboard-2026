// 👷 Worker view (owner, 14 Nov: "a lite app for worker"): the job travels inside the link's # part
// (https://…/worker/#j=…). The # part never goes to any server, so no tenant data is stored on the public site.
import type { CrewJob } from "./crew-share";

export type WorkerJob = { id: string; address: string; apt?: string; by?: string; work: string[]; photos: string[]; contact?: { name: string; phone: string; note?: string } | null; tenant?: { name?: string; phone?: string } | null };

export function toWorkerJob(j: CrewJob): WorkerJob {
  return { id: j.id, address: j.address, apt: j.apt, by: j.completeBy, work: j.work.slice(0, 10), photos: (j.photos || []).filter((p) => !p.done).map((p) => p.label), contact: j.contact || null, tenant: j.tenant || null };
}

function b64(s: string) { const bytes = new TextEncoder().encode(s); let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64(s: string) { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }

export function workerLink(origin: string, j: CrewJob) { return `${origin.replace(/\/$/, "")}/worker/#j=${b64(JSON.stringify(toWorkerJob(j)))}`; }

export function readWorkerHash(hash: string): WorkerJob | null {
  const m = /[#&]j=([A-Za-z0-9_-]+)/.exec(hash || "");
  if (!m) return null;
  try {
    const o = JSON.parse(unb64(m[1]));
    if (!o || typeof o.id !== "string" || typeof o.address !== "string") return null;
    return { id: o.id.slice(0, 20), address: o.address.slice(0, 200), apt: o.apt ? String(o.apt).slice(0, 20) : undefined, by: o.by ? String(o.by).slice(0, 40) : undefined,
      work: (Array.isArray(o.work) ? o.work : []).slice(0, 10).map((w: unknown) => String(w).slice(0, 300)), photos: (Array.isArray(o.photos) ? o.photos : []).slice(0, 12).map((w: unknown) => String(w).slice(0, 60)),
      contact: o.contact && o.contact.phone ? { name: String(o.contact.name || "Building").slice(0, 60), phone: String(o.contact.phone).slice(0, 30), note: o.contact.note ? String(o.contact.note).slice(0, 100) : undefined } : null,
      tenant: o.tenant && (o.tenant.name || o.tenant.phone) ? { name: o.tenant.name ? String(o.tenant.name).slice(0, 60) : undefined, phone: o.tenant.phone ? String(o.tenant.phone).slice(0, 30) : undefined } : null };
  } catch { return null; }
}
