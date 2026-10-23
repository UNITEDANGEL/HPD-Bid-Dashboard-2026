// A notice as a conversation (owner, 23 Oct: "better flow between messages, clear like a real conversation; clearly
// see what update we found in email and highlight it, like reply sent, paperwork made; verify it was made; I want to
// see the actual file I sent and when"). Theirs on the left, ours on the right, in time order. Each of ours says how
// the app knows: found in your email (verified), paperwork in the app, or marked by you.
import type { BoardRow } from "./notice-board";

export type ConvoSide = "theirs" | "ours";
export type ConvoProof = "email" | "app" | "you" | "";
export type ConvoItem = {
  id: string;
  side: ConvoSide;
  at: string;        // ISO time ("" when only the order is known)
  icon: string;
  title: string;
  detail?: string;
  proof: ConvoProof; // how the app knows (ours only)
  file?: string;     // the PDF that went out, when it is known
};

const first = (who: string) => (who || "They").split(/\s+/)[0];
const proofOf = (how: string): ConvoProof => (how === "email" ? "email" : how === "record" ? "app" : how === "tap" ? "you" : "");

export function noticeConvo(row: BoardRow): ConvoItem[] {
  const items: ConvoItem[] = [];
  const they = first(row.who);
  const snippet = (row.noticeText || "").replace(/\s+/g, " ").trim().slice(0, 180);
  items.push({
    id: "notice", side: "theirs", at: row.noticeAt, icon: row.kind === "docs" ? "📋" : "⚠️",
    title: row.kind === "docs" ? `${they} asked for ${row.want || "documents"}` : `${they} sent a ${row.hours}-hour notice`,
    detail: snippet || undefined, proof: "",
  });
  if (row.followUpAt && row.followUpAt !== row.noticeAt) items.push({ id: "follow", side: "theirs", at: row.followUpAt, icon: "🔁", title: `${they} followed up`, proof: "" });
  const r = row.steps.replied;
  if (r.done) items.push({ id: "replied", side: "ours", at: r.at === "closed" ? "" : r.at, icon: "✉️", title: "We replied", proof: proofOf(r.how) });
  const m = row.steps.made;
  if (m.done) items.push({ id: "made", side: "ours", at: m.at === "closed" ? "" : m.at || row.sentAt, icon: "📄", title: "Paperwork made", detail: row.sentAt ? "Affidavit and invoice are in the app" : undefined, proof: row.sentAt && m.how !== "email" ? "app" : proofOf(m.how) });
  const s = row.steps.sent;
  if (s.done || row.filed) {
    // Verified only when an email with this job's PDF is really in your sent mail.
    const verified = Boolean(row.filed) || s.how === "email";
    items.push({
      id: "sent", side: "ours", at: row.filed?.at || (s.at === "closed" ? "" : s.at), icon: "📤",
      title: verified ? "Sent the paperwork to vendor tracking" : "Marked as sent",
      detail: verified ? (row.filed && !row.filed.here ? "In another email, not this thread" : undefined) : "Not found in your sent email yet",
      proof: verified ? "email" : "you", file: row.filed?.name,
    });
  }
  if (row.lastTheirsAt && (!row.lastMineAt || Date.parse(row.lastTheirsAt) > Date.parse(row.lastMineAt))) {
    items.push({ id: "answer", side: "theirs", at: row.lastTheirsAt, icon: "💬", title: `${they} answered`, proof: "" });
  }
  const c = row.steps.confirmed;
  if (c.done) items.push({ id: "confirmed", side: c.at === "closed" ? "ours" : "theirs", at: c.at === "closed" ? "" : c.at, icon: "✅", title: c.at === "closed" ? "HPD closed the job" : `${they} confirmed`, proof: c.at === "closed" ? "" : proofOf(c.how) });
  // Their notice opens the conversation (paperwork made before it still shows its own date); the rest in time order,
  // anything without a time keeping its place after the one before it.
  let last = 0;
  const keyed = items.slice(1).map((it, i) => { const t = it.at ? Date.parse(it.at) : NaN; last = Number.isFinite(t) ? t : last; return { it, t: last, i }; });
  return [items[0], ...keyed.sort((a, b) => a.t - b.t || a.i - b.i).map((k) => k.it)];
}

// What is new since you last looked at this notice (highlighted).
export function isNewSince(item: ConvoItem, seenAt: string) {
  if (!seenAt || !item.at) return false;
  return Date.parse(item.at) > Date.parse(seenAt);
}
