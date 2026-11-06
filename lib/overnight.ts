// 📬 HPD overnight, in the brief (plan item 30): one line on who at HPD wrote since 5 PM yesterday, on which job and
// what they want. Calm words: the notices themselves are worked on the Notices screen.

type Msg = { at: string; hpd: boolean; mine: boolean; from?: string };
type Thread = { subject: string; omos: string[]; people: string[]; messages: Msg[] };

const what = (subject: string) =>
  /\b24\s*-?\s*(HR|HOUR)/i.test(subject) ? "a 24-hour notice"
  : /\b72\s*-?\s*(HR|HOUR)/i.test(subject) ? "a 72-hour notice"
  : /missing (required )?documents?/i.test(subject) ? "documents"
  : /stop work/i.test(subject) ? "a stop work notice"
  : /award/i.test(subject) ? "an award"
  : /reject/i.test(subject) ? "a payment rejection"
  : /correct/i.test(subject) ? "a correction"
  : "an email";

// 5 PM New York the day before `now` (ms).
export function since5pm(now: number) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now - 86400000));
  const guess = Date.parse(`${day}T17:00:00-05:00`);
  const off = new Date(guess).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" });
  return Number(off) === 17 ? guess : guess - 3600000; // daylight time: 5 PM is an hour earlier in UTC
}

export function overnightLine(threads: Thread[], now = Date.now()) {
  const from = since5pm(now);
  const seen = new Map<string, { who: string; omos: string[]; what: string; at: number }>();
  for (const t of threads || []) {
    const m = (t.messages || []).filter((x) => x.hpd && !x.mine && Date.parse(x.at) > from && Date.parse(x.at) <= now).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    if (!m) continue;
    const who = String(t.people?.[0] || m.from || "HPD").replace(/<.*$/, "").trim().split(/\s+/).filter((w) => !/^(department|of|nyc)$/i.test(w)).slice(-1)[0] || "HPD";
    const key = `${who}|${what(t.subject)}`;
    const cur = seen.get(key);
    const omos = [...new Set([...(cur?.omos || []), ...(t.omos || []).slice(0, 3)])];
    seen.set(key, { who: /^(D|Housing)$/i.test(who) ? "HPD" : who, omos, what: what(t.subject), at: Math.max(cur?.at || 0, Date.parse(m.at)) });
  }
  const list = [...seen.values()].sort((a, b) => b.at - a.at);
  if (!list.length) return "";
  const one = (x: { who: string; omos: string[]; what: string }) => `${x.who} sent ${x.what}${x.omos.length ? ` on ${x.omos.slice(0, 2).join(" and ")}${x.omos.length > 2 ? ` and ${x.omos.length - 2} more` : ""}` : ""}`;
  return `Overnight, ${list.slice(0, 3).map(one).join("; ")}${list.length > 3 ? `; and ${list.length - 3} more` : ""}.`;
}
