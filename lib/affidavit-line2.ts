// 🗓 Affidavit line 2 (owner, 9 Nov: "we have to fix a big error in all affidavits, see ER04312 ... line 2 date needs
// to be the confirmation of award date; change all Aff Invoice we generated and going forward"). HPD sent ER04312
// back: "AFFIDAVIT - date directed by HPD is confirmation date of award". On the earlier HPD affidavit (12/2024),
// line 2 reads "That on ___ I was directed by HPD to go to the building": that date is the Confirmation of Award date,
// never the work date. Packages filled outside the app put the work date there (22 of 23 read from Gmail). The app
// fills it from the job's award date; this finds the ones already sent with the wrong date so each gets fixed.

export type SentDates = { awardDate?: string; workStart?: string; workComplete?: string; sentAt?: string; outcome?: string };
export type Line2Fix = { omo: string; sent: string; award: string; sentAt: string; workDate: boolean };

// "09/04/26", "9/4/2026", "2026-09-04" -> "2026-09-04" ("" when it isn't a date).
export function isoDay(value: string | undefined | null): string {
  const s = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(s);
  if (!us) return "";
  const y = us[3].length === 2 ? `20${us[3]}` : us[3];
  return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}
export const usDay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}` : "");

// The sent affidavit's line 2 date against the job's award date: the fix, or null when it's right (or unknown).
export function line2Fix(omo: string, sent: SentDates | undefined, jobAward: string | undefined): Line2Fix | null {
  const was = isoDay(sent?.awardDate), award = isoDay(jobAward);
  if (!was || !award || was === award) return null;
  const work = [isoDay(sent?.workStart), isoDay(sent?.workComplete)];
  return { omo, sent: was, award, sentAt: isoDay(sent?.sentAt), workDate: work.includes(was) };
}

// Every sent package with the wrong line 2 date, newest sent first. done: jobs already fixed (a correction saved
// after the package was sent).
export function line2Fixes(sent: Record<string, SentDates>, awardOf: (omo: string) => string, done: Record<string, string> = {}): Line2Fix[] {
  return Object.entries(sent)
    .map(([omo, s]) => line2Fix(omo, s, awardOf(omo)))
    .filter((f): f is Line2Fix => !!f && !(done[f.omo] && (!f.sentAt || done[f.omo] >= f.sentAt)))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || a.omo.localeCompare(b.omo));
}

// HPD's own words for the correction page, and the link that opens it.
export const line2Reason = (f: Line2Fix) => `Line 2 date (directed by HPD on) must be the Confirmation of Award date ${usDay(f.award)}, not ${usDay(f.sent)}${f.workDate ? " (the work date)" : ""}.`;
export const line2Href = (f: Line2Fix, today: string) => `/paperwork/?job=${encodeURIComponent(f.omo)}&fix=${encodeURIComponent(today)}&reason=${encodeURIComponent(line2Reason(f))}`;
