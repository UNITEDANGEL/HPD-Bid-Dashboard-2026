// Your bids: the price you saved for an invitation, when it was faxed to HPD and what HumbleFax said,
// and later whether you won. Kept on the phone and on the status server (key "BID-<OMO>"), so every
// phone and the evening email see the same thing.
import { buildPackageEmail } from "./package-delivery";

export type BidStatus = "saved" | "sent" | "confirmed" | "failed";
export type BidRecord = {
  omo: string; address: string; borough?: string; bidDue: string; bidDueTime?: string;
  price: number; savedAt: string; status: BidStatus;
  sentAt?: string; sentPrice?: number; faxTo?: string; messageId?: string; confirmedAt?: string; faxNote?: string;
  attempts: number; updatedAt: string;
};
export type BidResult = "won" | "lost" | "pending";

const LOCAL_KEY = "hpd-bid-records-v1";
export const BID_KEY_PREFIX = "BID-";
// No HumbleFax confirmation this long after sending: treat it as not delivered and offer a resend.
export const CONFIRM_WAIT_MINUTES = 30;

export function readBidRecords(): Record<string, BidRecord> {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch { return {}; }
}

function writeLocal(records: Record<string, BidRecord>) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(records)); } catch { /* full: still in memory */ }
}

// Save on the phone at once, then on the status server (best effort; retried on the next save).
export async function saveBidRecord(record: BidRecord, workerUrl: string, fetcher: typeof fetch = fetch) {
  const all = { ...readBidRecords(), [record.omo]: record };
  writeLocal(all);
  try {
    await fetcher(`${workerUrl.replace(/\/$/, "")}/override`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `${BID_KEY_PREFIX}${record.omo}`, patch: record }),
    });
  } catch { /* offline: kept on the phone */ }
  return all;
}

// Records from the status server (other phones) merged in: the newer one wins.
export function mergeServerBids(local: Record<string, BidRecord>, overrides: Record<string, unknown>) {
  const merged = { ...local };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!key.startsWith(BID_KEY_PREFIX) || !value || typeof value !== "object") continue;
    const rec = value as BidRecord;
    if (!rec.omo || !(rec.price > 0)) continue;
    if (!merged[rec.omo] || String(rec.updatedAt || "") > String(merged[rec.omo].updatedAt || "")) merged[rec.omo] = rec;
  }
  return merged;
}

// Fax status as shown: a sent fax with no confirmation after the wait counts as not delivered.
export function faxState(record: BidRecord, now = new Date()): "saved" | "waiting" | "confirmed" | "failed" | "unconfirmed" {
  if (record.status === "saved") return "saved";
  if (record.status === "confirmed" || record.status === "failed") return record.status;
  const waited = (now.getTime() - Date.parse(record.sentAt || "")) / 60000;
  return waited > CONFIRM_WAIT_MINUTES ? "unconfirmed" : "waiting";
}

// Won: the award (COA) came in. Lost: a week past the bid date with no award. Else pending.
export function bidResult(record: BidRecord, awarded: Map<string, number>, today: string): { result: BidResult; amount?: number } {
  if (awarded.has(record.omo)) return { result: "won", amount: awarded.get(record.omo) };
  const [y, m, d] = record.bidDue.split("-").map(Number);
  const lostAfter = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  return { result: today > lostAfter ? "lost" : "pending" };
}

export function winRate(records: BidRecord[], awarded: Map<string, number>, today: string) {
  const sent = records.filter((r) => r.status !== "saved");
  const decided = sent.map((r) => bidResult(r, awarded, today).result).filter((r) => r !== "pending");
  const won = decided.filter((r) => r === "won").length;
  return { sent: sent.length, decided: decided.length, won, percent: decided.length ? Math.round((won / decided.length) * 100) : null };
}

// The fax: the filled package PDF, with a short cover sheet (HumbleFax turns subject + body into it).
export function bidFaxCover(bid: { omo: string; address: string; borough?: string }, price: number) {
  const amount = price.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return {
    subject: `Bid - OMO ${bid.omo} - ${bid.address} - United Angel Construction Corp.`,
    text: [
      `Bid for OMO ${bid.omo}`,
      `${bid.address}${bid.borough ? `, ${bid.borough}` : ""}`,
      `Bid price: ${amount}`,
      "",
      "United Angel Construction Corp.",
      "Jot Singh · 718-989-1381 · Fax 718-989-1382",
      "12017 91st Ave, Richmond Hill, NY 11418",
    ].join("\n"),
  };
}

export async function sendBidFax(bid: { omo: string; address: string; borough?: string }, price: number, pdf: Uint8Array, fileName: string, fetcher: typeof fetch = fetch) {
  const cover = bidFaxCover(bid, price);
  const email = buildPackageEmail(cover.text, [{ name: fileName, mimeType: "application/pdf", bytes: pdf }]);
  const response = await fetcher("/api/drive/fax-bid", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-HPD-Boundary": email.boundary, "X-HPD-Subject": encodeURIComponent(cover.subject) },
    body: email.body,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.sent) return { ok: false as const, error: String(body.error || `The fax could not be sent (HTTP ${response.status}).`) };
  return { ok: true as const, to: String(body.to), messageId: String(body.messageId || ""), sentAt: String(body.sentAt || new Date().toISOString()) };
}

export async function checkBidFax(omo: string, sentAt: string, fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher("/api/drive/fax-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ omo, sentAt }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { status: "unknown" as const, error: String(body.error || `HTTP ${response.status}`) };
    return { status: body.status as "confirmed" | "failed" | "waiting", subject: String(body.subject || ""), at: String(body.at || "") };
  } catch {
    return { status: "unknown" as const, error: "No connection to check the fax." };
  }
}
