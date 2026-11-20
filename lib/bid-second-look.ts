// 🔎 Second look before a bid goes out (plan, 19 Nov: "the helper reads the finished bid once more (price, name, job
// number, date) and says all good or what looks off"). Shown between the two taps of Send: each line ✓ or ⚠.

export type LookLine = { ok: boolean; text: string };
export type LookInput = {
  omo: string;                 // the invitation
  packageOmo: string;          // the job number filled on the package
  price: number;               // the saved price
  packagePrice: number;        // the price filled on the package
  previous?: number;           // a revised bid: the price sent before
  minutesLeft: number;         // to the due time (negative: past)
  chance?: number | null;      // 0-1: how many recent similar jobs this price would have won (null: not enough data)
  best?: number | null;        // the price that wins most often (same data)
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function secondLook(x: LookInput): { lines: LookLine[]; allGood: boolean; say: string } {
  const lines: LookLine[] = [];
  lines.push(x.packageOmo === x.omo ? { ok: true, text: `Job number ${x.omo} on the package` } : { ok: false, text: `The package says ${x.packageOmo || "no job number"}, the invitation is ${x.omo}: fill it again` });
  lines.push(x.packagePrice === x.price ? { ok: true, text: `${money(x.price)} on page 1, page 2 and the work form` } : { ok: false, text: `The package has ${money(x.packagePrice)} but the price is ${money(x.price)}: fill it again` });
  // A slip of the finger: a price under $100 or over $50,000 is almost always a missing or extra zero.
  if (x.price < 100 || x.price > 50000) lines.push({ ok: false, text: `${money(x.price)} looks like a missing or extra zero` });
  if (x.previous) lines.push({ ok: true, text: `Revised bid: ${money(x.previous)} → ${money(x.price)}, the cover says to disregard the first` });
  if (x.minutesLeft <= 0) lines.push({ ok: false, text: "Past the due time: HPD may not take it" });
  else if (x.minutesLeft < 30) lines.push({ ok: false, text: `Only ${x.minutesLeft} min before it's due: send it now` });
  else lines.push({ ok: true, text: `Due in ${x.minutesLeft >= 120 ? `${Math.floor(x.minutesLeft / 60)} h` : `${x.minutesLeft} min`}: on time` });
  if (x.chance != null && x.best) {
    const pct = Math.round(x.chance * 100);
    if (pct < 25 && x.price > x.best) lines.push({ ok: false, text: `At ${money(x.price)} it would have won ${pct}% of jobs like this; ${money(x.best)} wins more often` });
    else lines.push({ ok: true, text: `Price is in the winning range (${pct}% of jobs like this)` });
  }
  const off = lines.filter((l) => !l.ok);
  return { lines, allGood: !off.length, say: off.length ? `Check before sending: ${off.map((l) => l.text).join(". ")}.` : `All good: ${x.omo} at ${money(x.price)}.` };
}
