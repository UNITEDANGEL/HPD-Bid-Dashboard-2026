export const BACKUP_KEYS = [
  "hpd-job-workflow-overrides-v2", "hpd-job-workflow-overrides-v1",
  "hpd-field-command-workflow", "hpd-field-visit-drafts",
];
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export function validateBackup(value) {
  if (!object(value) || value.format !== "hpd-field-backup" || value.version !== 1
    || typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))
    || !object(value.stores) || Object.keys(value).some((k) => !["format", "version", "capturedAt", "stores"].includes(k))) {
    throw new Error("Unsupported backup format.");
  }
  for (const [key, rows] of Object.entries(value.stores)) {
    if (!BACKUP_KEYS.includes(key) || !object(rows)) throw new Error("Unsupported backup store.");
  }
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 2 MB record limit. Nothing was uploaded.");
  JSON.parse(serialized, (key, entry) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe backup field.");
    return entry;
  });
  return value;
}

export function captureBackup(storage, capturedAt = new Date().toISOString()) {
  const stores = {};
  for (const key of BACKUP_KEYS) {
    const raw = storage.getItem(key);
    if (raw !== null) {
      try { stores[key] = JSON.parse(raw); }
      catch { throw new Error(`Unreadable local records: ${key}. Backup stopped; local data kept.`); }
    }
  }
  return validateBackup({ format: "hpd-field-backup", version: 1, capturedAt, stores });
}

export function backupSummary(value) {
  validateBackup(value);
  const jobs = new Set();
  let records = 0;
  for (const rows of Object.values(value.stores)) {
    const entries = object(rows.overrides) ? rows.overrides : rows;
    for (const id of Object.keys(entries)) { jobs.add(id); records++; }
  }
  return { jobs: jobs.size, records, stores: Object.keys(value.stores).length };
}

export async function backupDigest(text) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
