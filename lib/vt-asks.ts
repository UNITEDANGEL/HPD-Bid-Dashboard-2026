// 🔥 Anything vendor tracking asks is a priority on the map (owner, 10 Nov: "any time Joy asks anything (status update,
// request, correction, anything) I want to see that on the map ... an email from October 29 needs to be priority on the
// map; go through all my emails with Joy-Ann Lewis and Gafur"). Every email thread where Lewis / Gafur (or Saul, Rishi)
// wrote last and nothing went back yet: its jobs, oldest ask first, whatever kind of email it is. Marked sent / fixed
// after their email = off.
import type { HpdThread } from "./private-data";

export const VT_PEOPLE = /\b(lewis|gafur|saul|jagdeo|rishi)\b/i;

export type VtAsk = { omo: string; at: string; who: string; subject: string; threadId: string };

// sent: job -> when its paperwork went to HPD (the "<OMO> AFF INVOICE" PDF in any sent email; public/data/sent_paperwork):
// sent after their email = closed out, off the map (owner, 10 Nov: "everything that's been sent, archive it").
export function vtAsks(threads: HpdThread[] | null | undefined, handled: Record<string, string> = {}, sent: Record<string, { sentAt?: string }> = {}): VtAsk[] {
  const out = new Map<string, VtAsk>();
  for (const t of threads || []) {
    if (!t.waiting || !t.omos?.length) continue;
    const msgs = t.messages || [];
    const last = msgs[msgs.length - 1];
    if (!last || last.mine || !VT_PEOPLE.test(String(last.from || ""))) continue;
    const who = /gafur/i.test(last.from) ? "Gafur" : /saul/i.test(last.from) ? "Saul" : /jagdeo|rishi/i.test(last.from) ? "Rishi" : "Lewis";
    for (const omo of t.omos) {
      const h = handled[omo] || "";
      if (h && Date.parse(h) > Date.parse(last.at)) continue;
      const s = sent[omo]?.sentAt || "";
      if (s && Date.parse(s) > Date.parse(last.at)) continue;
      // Our own email in any thread with the job's PDF after their ask also counts as sent.
      if ((threads || []).some((o) => o.omos?.includes(omo) && (o.messages || []).some((m) => m.mine && Date.parse(m.at) > Date.parse(last.at) && (m.files || []).some((f) => new RegExp(`${omo}.*(AFF|INVOICE)`, "i").test(String(f)))))) continue;
      const prev = out.get(omo);
      // The oldest open ask for the job (it has waited longest).
      if (!prev || last.at < prev.at) out.set(omo, { omo, at: last.at, who, subject: t.subject, threadId: t.id });
    }
  }
  return [...out.values()].sort((a, b) => a.at.localeCompare(b.at));
}
