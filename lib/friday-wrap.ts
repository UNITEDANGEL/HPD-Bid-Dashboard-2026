// 📊 Friday wrap (plan item 23): Friday at 5, once, the week in a few words: jobs closed in the field, money earned,
// bids won, and what's first next week. Also when asked: "how did the week go".

export type WeekNumbers = { closed: number; earned: number; won: number; wonAmount: number; first: string };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

export function weekWrap(w: WeekNumbers) {
  const parts = [
    w.closed ? `${many(w.closed, "job")} closed in the field` : "no jobs closed in the field",
    w.earned ? `${money(w.earned)} of work done` : "",
    w.won ? `${many(w.won, "bid")} won${w.wonAmount ? ` (${money(w.wonAmount)})` : ""}` : "no bids won",
  ].filter(Boolean);
  return `📊 Your week: ${parts.join(", ")}. ${w.first ? `First next week: ${w.first.replace(/\.$/, "")}.` : "Nothing booked for next week yet."}`;
}

// Friday from 5 PM (New York), for the once-a-week card.
export const isFridayWrapTime = (weekday: number, minutes: number) => weekday === 5 && minutes >= 17 * 60;
