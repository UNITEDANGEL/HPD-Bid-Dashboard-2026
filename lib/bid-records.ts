// Your bids: the price you saved for an invitation, when it was faxed to HPD and what HumbleFax said,
// and later whether you won. Kept on the phone and on the status server (key "BID-<OMO>"), so every
// phone and the evening email see the same thing.
import { buildPackageEmail } from "./package-delivery";

export type BidStatus = "saved" | "sent" | "confirmed" | "failed";
export type BidRecord = {
  omo: string; address: string; borough?: string; bidDue: string; bidDueTime?: string;
  price: number; savedAt: string; status: BidStatus;
  sentAt?: string; sentPrice?: number; faxTo?: string; messageId?: string; confirmedAt?: string; faxNote?: string;
  // When the package was last filled, and at what price (the timeline at the top of the bid).
  filledAt?: string; filledPrice?: number;
  // HPD invited the same OMO again (a new due date): each earlier round, oldest first.
  rounds?: { bidDue: string; price: number; sentAt?: string; status: BidStatus }[];
  attempts: number; updatedAt: string;
  // Auto-resend after a failed fax (owner, 19 Oct): the failure it answered (confirmedAt of that failure) and how many.
  autoResendFor?: string; autoResends?: number;
  // Prices sent before a revision, oldest first: the latest one is crossed out on the revised package.
  revisions?: { price: number; sentAt?: string }[];
  // A bid faxed outside the app: the price HPD has, so a revision can cross it out.
  priorPrice?: number;
  // Why you chose this price (optional, e.g. "Secure-Tech lock costs ~$2,000"): shown on the next job like it.
  reason?: string;
  // Everything that happened to this bid, oldest first: price saved, package filled, fax sent, HumbleFax.
  log?: BidLogEntry[];
};
export type BidResult = "won" | "lost" | "pending";
export type BidLogEntry = { at: string; what: string };

export function withLog(record: BidRecord, what: string, at = new Date().toISOString()): BidRecord {
  return { ...record, log: [...(record.log || []), { at, what }].slice(-60) };
}

// The bid's history for the job card: its log, or (for bids saved before the log existed) what the record
// itself shows.
export function bidHistory(record: BidRecord): BidLogEntry[] {
  if (record.log?.length) return [...record.log].sort((a, b) => a.at.localeCompare(b.at));
  const usd = (v?: number) => (v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const out: BidLogEntry[] = [];
  for (const r of record.revisions || []) if (r.sentAt) out.push({ at: r.sentAt, what: `Fax sent to HPD at ${usd(r.price)}` });
  if (record.savedAt) out.push({ at: record.savedAt, what: `Price saved ${usd(record.price)}` });
  if (record.sentAt) out.push({ at: record.sentAt, what: `${record.revisions?.length ? "Revised fax" : "Fax"} sent to HPD at ${usd(record.sentPrice || record.price)}` });
  if (record.confirmedAt) out.push({ at: record.confirmedAt, what: record.status === "failed" ? "HumbleFax: fax FAILED" : "HumbleFax: Successful Transmission" });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

// A bidding session: you press "Start bidding"; until it ends, the app (and the fax checker) watch the
// bids due today. Saved on the status server under this key so every phone and the checker see it.
export const SESSION_KEY = "BIDDING-SESSION";
export type BiddingSession = { active: boolean; startedAt: string; endedAt?: string; day: string };

export async function saveSession(session: BiddingSession, workerUrl: string, fetcher: typeof fetch = fetch) {
  try { localStorage.setItem("hpd-bidding-session", JSON.stringify(session)); } catch { /* private mode */ }
  try {
    await fetcher(`${workerUrl.replace(/\/$/, "")}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: SESSION_KEY, patch: session }) });
  } catch { /* offline: kept on the phone */ }
}

export function readSession(): BiddingSession | null {
  try { return JSON.parse(localStorage.getItem("hpd-bidding-session") || "null"); } catch { return null; }
}

// Bids due today and where each stands: what the session panel and the alerts show.
export type TodayRow = { omo: string; address: string; bidDue: string; bidDueTime?: string; minutesLeft: number; state: "not-priced" | "saved" | "pending" | "confirmed" | "failed" };
export function todaySummary(bids: { omo: string; address: string; bidDue: string; bidDueTime?: string }[], records: Record<string, BidRecord>, today: string, minutesNow: number, now = new Date(), noBid: (bid: { omo: string; bidDue: string }) => boolean = () => false) {
  const minutes = (t?: string) => { const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]) : 1440; };
  // Invitations you decided not to bid aren't due from you (unless you sent one after all).
  const rows: TodayRow[] = bids.filter((b) => b.bidDue === today && !(noBid(b) && !(records[b.omo] && records[b.omo].status !== "saved"))).map((b) => {
    const rec = records[b.omo];
    const fax = rec ? faxState(rec, now) : "saved";
    const state: TodayRow["state"] = !rec ? "not-priced" : fax === "saved" ? "saved" : fax === "confirmed" ? "confirmed" : fax === "failed" ? "failed" : "pending";
    return { omo: b.omo, address: b.address, bidDue: b.bidDue, bidDueTime: b.bidDueTime, minutesLeft: minutes(b.bidDueTime) - minutesNow, state };
  }).sort((a, b) => a.minutesLeft - b.minutesLeft || a.omo.localeCompare(b.omo));
  const count = (st: TodayRow["state"][]) => rows.filter((r) => st.includes(r.state)).length;
  return {
    rows, total: rows.length,
    sent: count(["pending", "confirmed"]), confirmed: count(["confirmed"]), pending: count(["pending"]), failed: count(["failed"]),
    notSent: rows.filter((r) => ["not-priced", "saved", "failed"].includes(r.state) && r.minutesLeft > 0),
    allDone: rows.length > 0 && rows.every((r) => r.state === "confirmed"),
  };
}


const LOCAL_KEY = "hpd-bid-records-v1";
export const BID_KEY_PREFIX = "BID-";
// HumbleFax usually confirms within 5-10 minutes. No confirmation after this long: say so and offer a resend.
export const CONFIRM_WAIT_MINUTES = 15;

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

// Records from the status server (other phones) merged in: the newer one wins. Kept on this phone too,
// so saving another bid here doesn't drop them.
export function mergeServerBidsAndKeep(local: Record<string, BidRecord>, overrides: Record<string, unknown>) {
  const merged = mergeServerBids({ ...readBidRecords(), ...local }, overrides);
  writeLocal(merged);
  return merged;
}

// Which copy of a bid is current: the one with the later fax wins (a revision sent from the iPhone beats
// an older copy on the computer, even if the computer touched its copy more recently); for the same fax,
// the later update wins.
export function isNewer(a: BidRecord, b: BidRecord) {
  const sentA = String(a.sentAt || ""), sentB = String(b.sentAt || "");
  if (sentA !== sentB) return sentA > sentB;
  return String(a.updatedAt || "") > String(b.updatedAt || "");
}

export function mergeServerBids(local: Record<string, BidRecord>, overrides: Record<string, unknown>) {
  const merged = { ...local };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!key.startsWith(BID_KEY_PREFIX) || !value || typeof value !== "object") continue;
    const rec = value as BidRecord;
    if (!rec.omo || !(rec.price > 0)) continue;
    if (!merged[rec.omo] || isNewer(rec, merged[rec.omo])) merged[rec.omo] = rec;
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

// Won: the award (COA) came in. Lost: HPD's open data shows the job awarded to someone else (with the
// price that won it), or a week past the bid date with no award. Else pending.
export function bidResult(record: BidRecord, awarded: Map<string, number>, today: string, market?: Map<string, number>): { result: BidResult; amount?: number; winningPrice?: number } {
  if (awarded.has(record.omo)) return { result: "won", amount: awarded.get(record.omo) };
  if (market?.has(record.omo)) return { result: "lost", winningPrice: market.get(record.omo) };
  const [y, m, d] = record.bidDue.split("-").map(Number);
  const lostAfter = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  return { result: today > lostAfter ? "lost" : "pending" };
}

export function winRate(records: BidRecord[], awarded: Map<string, number>, today: string, market?: Map<string, number>) {
  const sent = records.filter((r) => r.status !== "saved");
  const decided = sent.map((r) => bidResult(r, awarded, today, market).result).filter((r) => r !== "pending");
  const won = decided.filter((r) => r === "won").length;
  return { sent: sent.length, decided: decided.length, won, percent: decided.length ? Math.round((won / decided.length) * 100) : null };
}

// The fax: the filled package PDF, with a short cover sheet (HumbleFax turns subject + body into it).
// A revised bid says so on the cover: disregard the earlier price, here is the new one.
export function bidFaxCover(bid: { omo: string; address: string; borough?: string }, price: number, previousPrice?: number) {
  const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const amount = usd(price);
  const revised = previousPrice && previousPrice > 0 && previousPrice !== price;
  return {
    subject: `${revised ? "REVISED " : ""}Bid - OMO ${bid.omo} - ${bid.address} - United Angel Construction Corp.`,
    text: [
      `${revised ? "REVISED BID" : "Bid"} for OMO ${bid.omo}`,
      `${bid.address}${bid.borough ? `, ${bid.borough}` : ""}`,
      ...(revised ? [`Please disregard our previous bid of ${usd(previousPrice)}.`, `Our new bid price is ${amount}.`] : [`Bid price: ${amount}`]),
      "",
      "United Angel Construction Corp.",
      "Jot Singh · 718-989-1381 · Fax 718-989-1382",
      "12017 91st Ave, Richmond Hill, NY 11418",
    ].join("\n"),
  };
}

// HPD's bid fax lines: the main one, then the backups printed on every invitation.
export const FAX_LINES = [
  { id: "main", label: "(212) 863-8655" },
  { id: "7804", label: "(212) 863-7804" },
  { id: "7805", label: "(212) 863-7805" },
] as const;
export type FaxLine = (typeof FAX_LINES)[number]["id"];

// The fax line a record went to ("2128638655@humblefax.com" -> "main").
export function lineOf(faxTo?: string): FaxLine | "" {
  const digits = String(faxTo || "").replace(/\D/g, "");
  return FAX_LINES.find((l) => digits.includes(l.label.replace(/\D/g, "")))?.id || "";
}

// Minutes until a bid is due (New York time), from bidDue "2026-10-19" + bidDueTime "11:00 AM" (5 PM when no time).
export function minutesToDue(record: { bidDue: string; bidDueTime?: string }, now = new Date()) {
  const [y, m, d] = record.bidDue.split("-").map(Number);
  const t = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(record.bidDueTime || "") || ["", "5", "00", "PM"];
  const h = (Number(t[1]) % 12) + (/p/i.test(t[3]) ? 12 : 0);
  // New York is UTC-4 (summer) or UTC-5 (winter): pick the offset that gives that hour in New York.
  for (const off of [4, 5]) {
    const due = Date.UTC(y, m - 1, d, h + off, Number(t[2]));
    const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(due)));
    if (nyHour === h) return Math.round((due - now.getTime()) / 60000);
  }
  return Math.round((Date.UTC(y, m - 1, d, h + 5, Number(t[2])) - now.getTime()) / 60000);
}

// A failed fax is sent again by itself (owner, 19 Oct: "this should be auto resend and confirm"): the same bid at the
// price already sent, to the next HPD fax line, once per failure, up to 3 times, only while there's time before it's due.
export const AUTO_RESEND_MAX = 3;
export function autoResendPlan(record: BidRecord, now = new Date()): { line: FaxLine; minutesLeft: number } | null {
  if (record.status !== "failed" || !record.confirmedAt) return null;
  if (!(record.sentPrice && record.sentPrice === record.price)) return null; // a revision in progress: you send it
  if (record.autoResendFor === record.confirmedAt) return null;              // this failure was already answered
  if ((record.autoResends || 0) >= AUTO_RESEND_MAX) return null;
  const minutesLeft = minutesToDue(record, now);
  if (minutesLeft <= 2) return null;
  const at = FAX_LINES.findIndex((l) => l.id === lineOf(record.faxTo));
  return { line: FAX_LINES[(at + 1) % FAX_LINES.length].id, minutesLeft };
}

export async function sendBidFax(bid: { omo: string; address: string; borough?: string }, price: number, pdf: Uint8Array, fileName: string, fetcher: typeof fetch = fetch, previousPrice?: number, line: FaxLine = "main") {
  return faxToHpd(bidFaxCover(bid, price, previousPrice), pdf, fileName, fetcher, line);
}

// "No bid" back to HPD (owner, 20 Oct): the invitation with NO BID on it. The owner's reason is not sent.
export function noBidFaxCover(bid: { omo: string; address: string; borough?: string }) {
  return {
    subject: `NO BID - OMO ${bid.omo} - ${bid.address} - United Angel Construction Corp.`,
    text: [
      `NO BID for OMO ${bid.omo}`,
      `${bid.address}${bid.borough ? `, ${bid.borough}` : ""}`,
      "United Angel Construction Corp. will not be bidding on this job. Thank you for the invitation.",
      "",
      "United Angel Construction Corp.",
      "Jot Singh · 718-989-1381 · Fax 718-989-1382",
      "12017 91st Ave, Richmond Hill, NY 11418",
    ].join("\n"),
  };
}
export async function sendNoBidFax(bid: { omo: string; address: string; borough?: string }, pdf: Uint8Array, fileName: string, fetcher: typeof fetch = fetch, line: FaxLine = "main") {
  return faxToHpd(noBidFaxCover(bid), pdf, fileName, fetcher, line);
}

async function faxToHpd(cover: { subject: string; text: string }, pdf: Uint8Array, fileName: string, fetcher: typeof fetch, line: FaxLine) {
  const email = buildPackageEmail(cover.text, [{ name: fileName, mimeType: "application/pdf", bytes: pdf }]);
  const response = await fetcher("/api/drive/fax-bid", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-HPD-Boundary": email.boundary, "X-HPD-Subject": encodeURIComponent(cover.subject), "X-HPD-Fax-Line": line },
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
    if (!response.ok) return { status: "unknown" as const, error: String(body.error || `HTTP ${response.status}`), noReadAccess: response.status === 403 };
    return { status: body.status as "confirmed" | "failed" | "waiting", subject: String(body.subject || ""), at: String(body.at || "") };
  } catch {
    return { status: "unknown" as const, error: "No connection to check the fax." };
  }
}

// Sent bids still waiting for HumbleFax's email (last 2 days): the app checks these in the background.
export function bidsToCheck(records: Record<string, BidRecord>, now = new Date()) {
  return Object.values(records).filter((r) => r.status === "sent" && r.sentAt && now.getTime() - Date.parse(r.sentAt) < 2 * 86400000);
}

// The bid for this invitation round: a record for an earlier due date that was already sent belongs to the
// earlier round (HPD invited the same OMO again), so this round starts fresh (and isn't "locked").
export function currentRecord(bid: { omo: string; bidDue: string }, records: Record<string, BidRecord>) {
  const stored = records[bid.omo];
  if (!stored) return undefined;
  return stored.bidDue === bid.bidDue || stored.status === "saved" ? stored : undefined;
}
// What you bid on this OMO in earlier rounds, newest first (the stored earlier round, then older ones).
export function earlierRounds(bid: { omo: string; bidDue: string }, records: Record<string, BidRecord>) {
  const stored = records[bid.omo];
  if (!stored) return [];
  const older = [...(stored.rounds || [])].reverse();
  if (currentRecord(bid, records)) return older;
  return [{ bidDue: stored.bidDue, price: stored.sentPrice || stored.price, sentAt: stored.sentAt, status: stored.status }, ...older];
}
