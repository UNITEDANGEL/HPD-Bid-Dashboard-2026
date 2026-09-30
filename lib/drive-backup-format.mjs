export const ROUTE_KEY = "hpd-today-route-v1";
export const BACKUP_KEYS = [
  "hpd-job-workflow-overrides-v2", "hpd-job-workflow-overrides-v1",
  "hpd-field-command-workflow", "hpd-field-visit-drafts",
  ROUTE_KEY,
];
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
export const ASSET_STORES = {
  "hpd-field-photos-v1": ["photos"],
  "hpd-field-packets-v1": ["packets"],
  "hpd-field-visits-v1": ["visits"],
  "uac-field-v1": ["jobs", "job_events", "routes", "route_stops", "visits", "notes", "media", "documents", "invoices"],
};
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export function routeBackup(value) {
  const s = value?.settings;
  if (!object(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date))
    || new Date(s.date).toISOString().slice(0, 10) !== s.date
    || ![s.start, s.end].every(t => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    || s.end <= s.start || !Number.isInteger(s.minutes) || s.minutes < 15 || s.minutes > 240
    || !["ALL", "MN", "BK", "QN", "BX", "SI"].includes(s.borough)
    || !Array.isArray(value.ids) || value.ids.length > 2000
    || value.ids.some(id => typeof id !== "string" || !id.trim() || id.length > 100)
    || new Set(value.ids).size !== value.ids.length) throw new Error("Invalid saved route. Local data kept.");
  return { settings: { date: s.date, start: s.start, end: s.end, minutes: s.minutes, borough: s.borough }, ids: [...value.ids], origin: null };
}

export function validateBackup(value) {
  if (!object(value) || value.format !== "hpd-field-backup" || ![1, 2].includes(value.version)
    || typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))
    || !object(value.stores) || Object.keys(value).some((k) => !["format", "version", "capturedAt", "stores", ...(value.version === 2 ? ["assets"] : [])].includes(k))) {
    throw new Error("Unsupported backup format.");
  }
  for (const [key, rows] of Object.entries(value.stores)) {
    if (!BACKUP_KEYS.includes(key) || !object(rows)) throw new Error("Unsupported backup store.");
    if (key === ROUTE_KEY && JSON.stringify(canonical(rows)) !== JSON.stringify(canonical(routeBackup(rows)))) throw new Error("Invalid route backup fields.");
  }
  if (value.version === 2) {
    if (!Array.isArray(value.assets)) throw new Error("Missing attachment records.");
    const ids = new Set();
    for (const asset of value.assets) {
      if (!object(asset) || !ASSET_STORES[asset.db]?.includes(asset.store) || !object(asset.record)
        || typeof asset.record.id !== "string" || !asset.record.id || asset.record.id.length > 500) throw new Error("Invalid attachment record.");
      const id = JSON.stringify([asset.db, asset.store, asset.record.id]);
      if (ids.has(id)) throw new Error("Duplicate attachment record.");
      ids.add(id);
    }
  }
  const serialized = JSON.stringify(value);
  const limit = value.version === 2 ? MAX_PACKAGE_BYTES : MAX_BACKUP_BYTES;
  if (new TextEncoder().encode(serialized).length > limit) throw new Error(`Backup exceeds the ${limit / 1024 / 1024} MB limit. Local records were kept.`);
  JSON.parse(serialized, (key, entry) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe backup field.");
    return entry;
  });
  return value;
}

export function captureBackup(storage, capturedAt = new Date().toISOString(), version = 1) {
  const stores = {};
  for (const key of BACKUP_KEYS) {
    const raw = storage.getItem(key);
    if (raw !== null) {
      try { stores[key] = key === ROUTE_KEY ? routeBackup(JSON.parse(raw)) : JSON.parse(raw); }
      catch { throw new Error(`Unreadable local records: ${key}. Backup stopped; local data kept.`); }
    }
  }
  return validateBackup({ format: "hpd-field-backup", version, capturedAt, stores, ...(version === 2 ? { assets: [] } : {}) });
}

export function backupSummary(value) {
  validateBackup(value);
  const jobs = new Set();
  let records = 0;
  for (const [key, rows] of Object.entries(value.stores)) {
    if (key === ROUTE_KEY) { records++; continue; }
    const entries = object(rows.overrides) ? rows.overrides : rows;
    for (const id of Object.keys(entries)) { jobs.add(id); records++; }
  }
  const result = { jobs: jobs.size, records, stores: Object.keys(value.stores).length };
  if (value.stores[ROUTE_KEY]) result.routes = 1;
  if (value.version === 2) {
    for (const asset of value.assets) if (asset.record.jobId) jobs.add(asset.record.jobId);
    return { ...result, jobs: jobs.size, assets: value.assets.length,
      media: value.assets.filter((a) => a.db === "hpd-field-photos-v1").length,
      documents: value.assets.filter((a) => a.db === "hpd-field-packets-v1").length };
  }
  return result;
}

export async function backupDigest(text) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateEnvelope(value) {
  if (value?.format === "hpd-field-backup") return validateBackup(value);
  if (!object(value) || value.version !== 1 || !Number.isFinite(Date.parse(value.capturedAt))) throw new Error("Invalid backup envelope.");
  if (value.format === "hpd-field-backup-part") {
    if (Object.keys(value).sort().join() !== "capturedAt,data,format,version" || typeof value.data !== "string"
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data) || value.data.length % 4) throw new Error("Invalid backup part.");
  } else if (value.format === "hpd-field-backup-manifest") {
    if (Object.keys(value).sort().join() !== "bytes,capturedAt,format,parts,sha256,version" || !Array.isArray(value.parts)
      || !value.parts.length || value.parts.length > 512 || !/^[a-f0-9]{64}$/.test(value.sha256)
      || !Number.isInteger(value.bytes) || value.bytes <= 0 || value.bytes > MAX_PACKAGE_BYTES) throw new Error("Invalid recovery manifest.");
    const ids = new Set();
    for (const part of value.parts) {
      if (!object(part) || Object.keys(part).sort().join() !== "id,sha256" || !/^[\w-]{10,200}$/.test(part.id)
        || !/^[a-f0-9]{64}$/.test(part.sha256) || ids.has(part.id)) throw new Error("Invalid recovery part reference.");
      ids.add(part.id);
    }
  } else throw new Error("Unsupported backup envelope.");
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BACKUP_BYTES) throw new Error("Backup part exceeds 2 MB.");
  return value;
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}

export async function contentFingerprint(snapshot) {
  validateBackup(snapshot);
  const { capturedAt, ...data } = snapshot;
  if (data.assets) data.assets = [...data.assets].sort((a, b) => JSON.stringify([a.db, a.store, a.record.id]).localeCompare(JSON.stringify([b.db, b.store, b.record.id])));
  return backupDigest(JSON.stringify(canonical(data)));
}
