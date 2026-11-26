// 📸 New worker photos (plan item 43, 26 Nov): when the worker's Before / After photos or videos reach the job (worker
// link with the upload pass), the server stamps WorkerNewAt on the job's shared entry; opening the job card brings them in
// and stamps WorkerSeenAt. Until then the job shows "📸 new from worker" on the map and on Home's Maturity this week card.
// Only the job number and two times are stored: no names, phones or photos on the status server.
const ms = (v: unknown) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : 0; };
export const WORKER_NEW_DAYS = 14;
export function workerNew(row: Record<string, unknown> | null | undefined, now = Date.now()): boolean {
  if (!row) return false;
  const at = ms(row.WorkerNewAt);
  return at > 0 && at > ms(row.WorkerSeenAt) && now - at < WORKER_NEW_DAYS * 86400000;
}
export function workerNewSet(overrides: Record<string, Record<string, unknown> | null | undefined>, now = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(overrides || {})) if (/^[A-Z]{2}\d{5,6}$/.test(k) && workerNew(v, now)) out.add(k);
  return out;
}
