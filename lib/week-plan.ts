// 🗓 Plan my week (owner, 5 Nov: "the AI needs to work with the future work that's left to do"): the open work put on
// days. Work with a date (bids by due date, appointments, notices by deadline) goes on its day; something late goes
// on today. Work without a date (close-out paperwork) fills the weekdays with room, at most 3 a day, soonest first.
// The morning brief talks only about today's part.

export type WeekItem = { icon: string; text: string; day?: string; flex?: boolean; late?: boolean };
export type PlanDay = { day: string; label: string; items: WeekItem[] };

const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekday = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dayLabel = (iso: string, today: string) => {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${m}/${d}`;
};

export function planWeek(today: string, items: WeekItem[], days = 7, perDay = 3): { days: PlanDay[]; later: number } {
  const out: PlanDay[] = Array.from({ length: days }, (_, i) => { const day = addDays(today, i); return { day, label: dayLabel(day, today), items: [] }; });
  const last = out[out.length - 1].day;
  let later = 0;
  for (const it of items.filter((x) => !x.flex && x.day)) {
    if (it.day! > last) { later += 1; continue; }
    const late = it.day! < today;
    out.find((d) => d.day === (late ? today : it.day))!.items.push(late ? { ...it, late: true } : it);
  }
  // No date: weekdays only, where there's room.
  const flex = items.filter((x) => x.flex || !x.day);
  for (const it of flex) {
    const spot = out.find((d) => weekday(d.day) !== 0 && weekday(d.day) !== 6 && d.items.length < perDay);
    if (spot) spot.items.push({ ...it, flex: true }); else later += 1;
  }
  return { days: out, later };
}

// Said out loud: today and tomorrow only; the rest is on the screen.
export function weekSpeech(p: { days: PlanDay[]; later: number }) {
  const say = (d: PlanDay) => `${d.label}: ${d.items.length ? d.items.map((x) => x.text).join("; ") : "nothing planned"}.`;
  const busy = p.days.slice(2).filter((d) => d.items.length).length;
  return [say(p.days[0]), p.days[1] ? say(p.days[1]) : "", busy ? `${busy} more day${busy === 1 ? "" : "s"} with work ${busy === 1 ? "is" : "are"} on the screen.` : "The rest of the week is open."].filter(Boolean).join(" ");
}
