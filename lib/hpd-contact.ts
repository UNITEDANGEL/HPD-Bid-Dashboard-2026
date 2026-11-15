// 📞 Call the HPD person in one tap: who at HPD wrote last on a job, and the phone number from their email signature
// (when they put one). Used by the job card: ☎ Call / 💬 Text.

type Msg = { at: string; from?: string; hpd: boolean; mine: boolean; text?: string };
type Thread = { omos: string[]; messages: Msg[] };
export type HpdContact = { name: string; phone: string; at: string };

const PHONE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/;

export function phoneIn(text: string) {
  const m = PHONE.exec(text || "");
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

export const prettyPhone = (p: string) => (p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p);

// The person who wrote last (newest HPD message, not yours) on this OMO; the phone comes from their newest email
// that has one in it. Empty phone = no number in their emails (the card then shows only their name).
export function lastHpdContact(threads: Thread[], omo: string): HpdContact | null {
  const msgs: Msg[] = [];
  for (const t of threads || []) if ((t.omos || []).includes(omo)) for (const m of t.messages || []) if (m.hpd && !m.mine) msgs.push(m);
  msgs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const last = msgs[0];
  if (!last) return null;
  const name = (last.from || "").replace(/\s+on behalf of.*$/i, "").replace(/<.*>/, "").trim() || "HPD";
  const same = msgs.filter((m) => (m.from || "") === (last.from || ""));
  const phone = same.map((m) => phoneIn(m.text || "")).find(Boolean) || "";
  return { name, phone, at: last.at };
}
