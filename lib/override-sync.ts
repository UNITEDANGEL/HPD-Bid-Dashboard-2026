// Keeps the job steps saved on this phone and the status server in step.
//
// The phone saves every step (arrived, outcome, 2nd try, package...) in localStorage first, so it
// works with no signal. Each saved job is queued here and its FULL saved entry is sent to the
// status server (which stores what it is sent for that job). With no signal the queue waits and
// is sent when the phone is back online. When both have an entry for a job, they are combined
// field by field, newer wins, so one never wipes out the other's fields.

export const LOCAL_OVERRIDES_KEY = "hpd-job-workflow-overrides-v2";
const OUTBOX_KEY = "hpd-override-outbox-v1";

type Entry = Record<string, unknown>;
type Overrides = Record<string, Entry>;

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(storage()?.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readLocalOverrides(): Overrides {
  const parsed = readJson(LOCAL_OVERRIDES_KEY);
  const rows = parsed.overrides && typeof parsed.overrides === "object" && !Array.isArray(parsed.overrides) ? parsed.overrides : parsed;
  return rows as Overrides;
}

// Jobs saved on this phone that the server hasn't confirmed yet: id -> when it was queued.
export function readOutbox(): Record<string, string> {
  return readJson(OUTBOX_KEY) as Record<string, string>;
}

export function queueOverrideSync(id: string) {
  const store = storage();
  if (!store || !id) return;
  try {
    store.setItem(OUTBOX_KEY, JSON.stringify({ ...readOutbox(), [id]: new Date().toISOString() }));
  } catch { /* storage full: the entry is still saved on the phone */ }
}

function time(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// One job: field by field, the newer entry's values win. A job still waiting in the outbox keeps
// the phone's values (the server hasn't got them yet).
export function mergeOverrideEntry(local: Entry | undefined, server: Entry | undefined, pending = false): Entry | undefined {
  if (!local) return server;
  if (!server) return local;
  const localNewer = pending || time(local.updatedAt ?? local.UpdatedAt) >= time(server.updatedAt ?? server.UpdatedAt);
  return localNewer ? { ...server, ...local } : { ...local, ...server };
}

export function mergeOverrideMaps(local: Overrides, server: Overrides, outbox: Record<string, string> = readOutbox()): Overrides {
  const merged: Overrides = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(server)])) {
    const entry = mergeOverrideEntry(local[id], server[id], Boolean(outbox[id]));
    if (entry) merged[id] = entry;
  }
  return merged;
}

let flushing: Promise<{ sent: number; waiting: number }> | null = null;

// Sends every queued job's full saved entry. Safe to call often: one run at a time.
export function flushOverrideOutbox(workerUrl: string, fetcher: typeof fetch = fetch): Promise<{ sent: number; waiting: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    const outbox = readOutbox();
    const ids = Object.keys(outbox);
    if (!ids.length || !workerUrl) return { sent: 0, waiting: ids.length };
    const local = readLocalOverrides();
    let sent = 0;
    for (const id of ids) {
      const entry = local[id];
      let ok = !entry; // nothing saved any more: drop it from the queue
      if (entry) {
        try {
          const response = await fetcher(`${workerUrl.replace(/\/$/, "")}/override`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: id, patch: entry }),
          });
          ok = response.ok;
        } catch {
          ok = false;
        }
      }
      if (!ok) continue;
      sent += entry ? 1 : 0;
      // Remove it unless the job was saved again while this was sending.
      const now = readOutbox();
      if (now[id] === outbox[id]) {
        delete now[id];
        try { storage()?.setItem(OUTBOX_KEY, JSON.stringify(now)); } catch {}
      }
    }
    return { sent, waiting: Object.keys(readOutbox()).length };
  })().finally(() => { flushing = null; });
  return flushing;
}

// Folds the server's entries into the phone's saved copy (newer field values win), so the full
// entry this phone sends later still carries what other devices saved.
export function adoptServerOverrides(server: Overrides) {
  const store = storage();
  if (!store || !server || !Object.keys(server).length) return;
  const local = readLocalOverrides();
  const outbox = readOutbox();
  let changed = false;
  for (const [id, entry] of Object.entries(server)) {
    if (!entry || typeof entry !== "object") continue;
    const merged = mergeOverrideEntry(local[id], entry, Boolean(outbox[id]));
    if (merged && JSON.stringify(merged) !== JSON.stringify(local[id])) {
      local[id] = merged;
      changed = true;
    }
  }
  if (!changed) return;
  try { store.setItem(LOCAL_OVERRIDES_KEY, JSON.stringify(local)); } catch {}
}
