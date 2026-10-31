// "Thursday at 10", "tomorrow 2:30 pm", "in 30 minutes", "10/27 at noon": a day and a time said out loud, in New York
// time, for appointments and reminders by voice (23 Oct). Hours said without am / pm are work hours: 7-11 morning,
// 12-6 afternoon.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function nyParts(now: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "long" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: WEEKDAYS.indexOf(String(p.weekday).toLowerCase()) };
}
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export type When = { date?: string; time?: string; words: string };

// The day and time in what was said (either can be missing), and the words left once they are taken out.
export function parseWhen(said: string, now = new Date()): When {
  const today = nyParts(now);
  let t = ` ${String(said || "").toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ")} `;
  let date: string | undefined;
  let time: string | undefined;
  const take = (re: RegExp) => { t = t.replace(re, " "); };

  // In N minutes / hours.
  const rel = /\bin (\d{1,3}|an?|one|half an) (minutes?|mins?|hours?)\b/.exec(t);
  if (rel) {
    const n = rel[1] === "half an" ? 30 : /^(an?|one)$/.test(rel[1]) ? 1 : Number(rel[1]);
    const add = /^h/.test(rel[2]) ? (rel[1] === "half an" ? 30 : n * 60) : n;
    const total = today.minutes + add;
    date = addDays(today.date, Math.floor(total / 1440));
    time = hhmm(total % 1440);
    t = t.replace(rel[0], " ");
  }
  if (!date) {
    if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) { date = today.date; take(/\b(today|tonight|this (morning|afternoon|evening))\b/); }
    else if (/\b(tomorrow|tmrw)\b/.test(t)) { date = addDays(today.date, 1); take(/\b(tomorrow|tmrw)\b/); }
    else {
      const wd = new RegExp(`\\b(?:(next|this|on) )?(${WEEKDAYS.join("|")})\\b`).exec(t);
      const md = /\b(\d{1,2})\/(\d{1,2})\b/.exec(t);
      const named = new RegExp(`\\b(${MONTHS.join("|")})[a-z]* (\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t);
      if (wd) {
        let ahead = (WEEKDAYS.indexOf(wd[2]) - today.weekday + 7) % 7;
        if (ahead === 0) ahead = 7; // "Thursday" said on a Thursday: next week (say "today" for today)
        date = addDays(today.date, ahead);
        t = t.replace(wd[0], " ");
      } else if (md || named) {
        const month = md ? Number(md[1]) : MONTHS.indexOf(named![1]) + 1;
        const day = Number(md ? md[2] : named![2]);
        let year = Number(today.date.slice(0, 4));
        const pad = (n: number) => String(n).padStart(2, "0");
        if (`${year}-${pad(month)}-${pad(day)}` < today.date) year += 1;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) date = `${year}-${pad(month)}-${pad(day)}`;
        t = t.replace(md ? md[0] : named![0], " ");
      }
    }
  }
  if (!time) {
    if (/\bnoon\b/.test(t)) { time = "12:00"; take(/\b(at )?noon\b/); }
    else {
      // A time needs "at" in front or am / pm after it, so house numbers and job numbers aren't read as times.
      const m = /\b(?:at |@ ?)(\d{1,2})(?::(\d{2}))? ?(a ?m|p ?m)?\b|\b(\d{1,2})(?::(\d{2}))? ?(a ?m|p ?m)\b/.exec(t);
      if (m) {
        const h = Number(m[1] ?? m[4]);
        const min = Number(m[2] ?? m[5] ?? 0);
        const ap = (m[3] ?? m[6] ?? "").replace(/\s/g, "");
        if (h >= 1 && h <= 12 && min < 60) {
          const pm = ap ? ap === "pm" : h === 12 || h <= 6;
          time = hhmm(((h % 12) + (pm ? 12 : 0)) * 60 + min);
          t = t.replace(m[0], " ");
        }
      } else if (/\bthis morning\b|\bin the morning\b/.test(said.toLowerCase())) time = "09:00";
    }
  }
  return { date, time, words: t.replace(/\s+/g, " ").trim() };
}

// One hour later (the appointment's end), on the same day.
export function hourAfter(time: string) {
  const [h, m] = time.split(":").map(Number);
  return hhmm(Math.min(23 * 60 + 59, h * 60 + m + 60));
}

// The day something happened, said out loud (31 Oct: "refused access on EQ15239 yesterday, male, tall, dark hair"):
// today, yesterday, N days ago, (last / on) Monday = the latest one up to today, 10/24, October 24. Never a future day.
export function parsePastDay(said: string, now = new Date()): { date?: string; words: string } {
  const today = nyParts(now);
  let t = ` ${String(said || "").toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ")} `;
  const pad = (n: number) => String(n).padStart(2, "0");
  let date: string | undefined;
  const take = (m: RegExpExecArray | null, d: string | undefined) => { if (m && d) { date = d; t = t.replace(m[0], " "); } return Boolean(m && d); };
  const counts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const ago = /\b(?:on |from )?(\d{1,2}|one|two|three|four|five|six|seven) days? ago\b/.exec(t);
  if (take(ago, ago ? addDays(today.date, -(counts[ago[1]] || Number(ago[1]))) : undefined)) return { date, words: t.trim() };
  const yd = /\b(?:on )?(?:the day before yesterday|yesterday)\b/.exec(t);
  if (take(yd, yd ? addDays(today.date, /before/.test(yd[0]) ? -2 : -1) : undefined)) return { date, words: t.trim() };
  const td = /\b(?:on )?today\b/.exec(t);
  if (take(td, td ? today.date : undefined)) return { date, words: t.trim() };
  const wd = new RegExp(`\\b(?:(last|on|this past|past) )?(${WEEKDAYS.join("|")})\\b`).exec(t);
  if (wd) {
    let back = (today.weekday - WEEKDAYS.indexOf(wd[2]) + 7) % 7;
    if (back === 0 && wd[1] === "last") back = 7;
    take(wd, addDays(today.date, -back));
    return { date, words: t.trim() };
  }
  const md = /\b(?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  const named = new RegExp(`\\b(?:on )?(${MONTHS.join("|")})[a-z]* (\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t);
  const m = md || named;
  if (m) {
    const month = md ? Number(md[1]) : MONTHS.indexOf(named![1]) + 1;
    const day = Number(md ? md[2] : named![2]);
    const typedYear = md && md[3] ? Number(md[3].length === 2 ? `20${md[3]}` : md[3]) : 0;
    let year = typedYear || Number(today.date.slice(0, 4));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      if (!typedYear && `${year}-${pad(month)}-${pad(day)}` > today.date) year -= 1;
      const d = `${year}-${pad(month)}-${pad(day)}`;
      take(m, d <= today.date ? d : undefined);
    }
  }
  return { date, words: t.trim() };
}
