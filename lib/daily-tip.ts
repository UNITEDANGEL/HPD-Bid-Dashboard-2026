// 💡 One tip a day from the robot (owner's pick, 4 Nov): one finding from your own numbers, in its bubble. Worked out
// on the phone (no AI call), so it costs nothing.
export type TipWin = { kind: string; amount: number; date: string };
export function dailyTip(o: { wins: TipWin[]; sentThisWeek: number; sentLastWeek: number; overdueNotices: number; today: string }) {
  const since = (days: number) => { const d = new Date(`${o.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
  const month = o.wins.filter((w) => w.date >= since(30));
  const tips: string[] = [];
  if (month.length >= 3) {
    const by: Record<string, TipWin[]> = {};
    for (const w of month) (by[w.kind] = by[w.kind] || []).push(w);
    const [kind, list] = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
    const paid = list.filter((w) => w.amount > 0);
    const avg = paid.length ? Math.round(paid.reduce((a, w) => a + w.amount, 0) / paid.length) : 0;
    if (list.length >= 2) tips.push(`💡 ${kind} won the most in the last 30 days: ${list.length} of your ${month.length} wins${avg ? `, about $${avg.toLocaleString("en-US")} each` : ""}.`);
  }
  if (o.sentLastWeek > 0 && o.sentThisWeek > o.sentLastWeek) tips.push(`💡 ${o.sentThisWeek} bids sent in the last 7 days, ${o.sentThisWeek - o.sentLastWeek} more than the week before. Keep it up!`);
  if (o.sentLastWeek > 4 && o.sentThisWeek < o.sentLastWeek / 2) tips.push(`💡 ${o.sentThisWeek} bids in the last 7 days (${o.sentLastWeek} the week before). More bids, more wins.`);
  if (o.overdueNotices > 0) tips.push(`💡 ${o.overdueNotices} notice${o.overdueNotices === 1 ? " is" : "s are"} overdue: answering them keeps HPD happy and the payments coming.`);
  if (!tips.length) return "";
  // A different tip each day when there are several.
  const n = Number(o.today.replace(/-/g, "")) % tips.length;
  return tips[n];
}
