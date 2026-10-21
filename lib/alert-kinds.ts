// A different alert for each kind of news (owner, 20 Oct: "I need unique alerts for all different, like bids, notices,
// rejections, requests"; "alerts for all messages: Gafur, Lewis, bids"): its own icon, color, name and tone, in the app
// banner, the notifications list and the phone alert.

export type AlertKind = "award" | "notice" | "request" | "rejection" | "message" | "bid" | "fax-ok" | "fax-bad" | "urgent";
// Older names (kept in saved lists) -> the new ones.
export const OLD_KIND: Record<string, AlertKind> = { email: "message", good: "fax-ok", bad: "fax-bad", new: "bid" };
export const kindOf = (k: string): AlertKind => (OLD_KIND[k] || k) as AlertKind;

export const ALERT_KINDS: Record<AlertKind, { icon: string; name: string; color: string }> = {
  award: { icon: "💰", name: "You won a job", color: "#eab308" }, // cha-ching (owner, 20 Oct)
  notice: { icon: "⏱", name: "24 / 72-hour notice", color: "#f97316" },
  request: { icon: "📋", name: "Documents request", color: "#14b8a6" },
  rejection: { icon: "💵", name: "Payment rejected", color: "#e11d48" },
  message: { icon: "📩", name: "Message from HPD", color: "#38bdf8" },
  bid: { icon: "🧾", name: "New invitation to bid", color: "#f59e0b" },
  "fax-ok": { icon: "✅", name: "Fax went through", color: "#22c55e" },
  "fax-bad": { icon: "❌", name: "Fax failed", color: "#ef4444" },
  urgent: { icon: "⏰", name: "Deadline", color: "#fb923c" },
};

const PPN = /poor performance|performance notice|\bPPN\b|\b(24|72)[ -]?h(ou)?r/i;
const REQUEST = /missing (required )?documents?|\bAEP\b|alternative enforcement|status update|correction|(kindly|please) confirm|confirm the date/i;
const REJECT = /invoice rejection|rejection notice|\brejected\b|\brejection\b|disallow/i;

// What an email from HPD is about: the email reader's kind for the thread first (past due = notice, rejection = payment
// rejected, correction / AEP = a request to fix or send something), then the subject and who sent it.
export function emailKind(subject: string, threadKind = "", from = ""): AlertKind {
  const k = threadKind.toLowerCase();
  if (k === "award" || /confirmation of award|notice of award|you have been awarded/i.test(subject)) return "award";
  if (k === "past due" || PPN.test(subject)) return "notice";
  if (k === "rejection" || /accounts payable/i.test(from) || (REJECT.test(subject) && k !== "correction")) return "rejection";
  if (k === "correction" || k === "aep" || REQUEST.test(subject) || /gafur/i.test(from)) return "request";
  return "message";
}

// The alert's title for an email: "⏱ 24-hour notice · EQ31364 (Joy-Ann Lewis)", "📋 Deoranie Gafur replied · EP27382"...
export function emailTitle(kind: AlertKind, who: string, omo: string, replied: boolean, subject = "") {
  const at = omo ? ` · ${omo}` : "";
  const by = who || "HPD";
  if (kind === "award") return `💰 You won${at}!${by !== "HPD" ? ` · ${by}` : ""}`;
  if (kind === "notice") return `⏱ ${/72/.test(subject) ? "72" : "24"}-hour notice${at}${replied ? ` · ${by} wrote again` : ` from ${by}`}`;
  if (kind === "rejection") return `💵 Payment rejected${at}${by !== "HPD" ? ` · ${by}` : ""}`;
  if (kind === "request") return `📋 ${by} ${replied ? "replied" : /missing|document/i.test(subject) ? "asked for documents" : "sent a request"}${at}`;
  return `📩 ${by} ${replied ? "replied" : "wrote"}${at}`;
}
